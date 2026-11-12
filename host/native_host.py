import copy
import glob
import importlib.util
import itertools
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time

import transcriber
import ytdlp_helpers as ytdlp
import ytdlp_updater
from file_server import FileServer, lan_address
from native_messaging import read_message, write_message

try:
    import yt_dlp
    import yt_dlp.extractor
    from yt_dlp.postprocessor.common import PostProcessor
    from yt_dlp.utils import DownloadCancelled
except ImportError:
    yt_dlp = None
    PostProcessor = object

    class DownloadCancelled(Exception):
        pass

UPDATE_DELAY = 30
SHORTCUT_NAME = "asil-downloader"
CACHE_TTL = 20 * 60
CACHE_LIMIT = 50
PROGRESS_INTERVAL = 0.25
CREATE_NO_WINDOW = 0x08000000
MISSING_LIB = 'yt-dlp Python kütüphanesi bulunamadı: pip install -U "yt-dlp[default,curl-cffi]"'
WARMUP_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"

_specific_extractors = None


def has_specific_extractor(url):
    global _specific_extractors
    if _specific_extractors is None:
        _specific_extractors = [
            ie for ie in yt_dlp.extractor.gen_extractor_classes() if ie.ie_key() != "Generic"]
    return any(ie.suitable(url) for ie in _specific_extractors)


def find_ffmpeg():
    packages = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages")
    hits = sorted(glob.glob(os.path.join(packages, "yt-dlp.FFmpeg_*", "*", "bin", "ffmpeg.exe")))
    return os.path.dirname(hits[-1]) if hits else None


def run_ffmpeg(cmd):
    result = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                            creationflags=CREATE_NO_WINDOW)
    if result.returncode != 0:
        lines = result.stderr.decode("utf-8", "replace").strip().splitlines()
        raise RuntimeError("Ses dönüştürme başarısız: " + (lines[-1] if lines else f"kod {result.returncode}"))


def kill_ffmpeg_children():
    script = (f"Get-CimInstance Win32_Process -Filter 'ParentProcessId={os.getpid()}' | "
              "Where-Object Name -eq 'ffmpeg.exe' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }")
    subprocess.run(["powershell", "-NoProfile", "-Command", script],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=CREATE_NO_WINDOW)


LOG_PATH = os.path.join(tempfile.gettempdir(), "asil-downloader.log")
LOG_LIMIT = 512 * 1024


def log(*parts):
    try:
        if os.path.exists(LOG_PATH) and os.path.getsize(LOG_PATH) > LOG_LIMIT:
            os.remove(LOG_PATH)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(p) for p in parts) + "\n")
    except OSError:
        pass


def cookie_names(cookies):
    return sorted({c.get("name") for c in cookies or [] if isinstance(c, dict) and isinstance(c.get("name"), str)})


def ios_shortcut_url(url):
    from urllib.parse import quote
    return f"shortcuts://run-shortcut?name={quote(SHORTCUT_NAME)}&input=text&text={quote(url, safe='')}"


def make_ranges(section):
    from yt_dlp.utils import download_range_func
    start, end = section
    return download_range_func(None, [(start, end if end is not None else float("inf"))])


def newest_output(opts):
    home = (opts.get("paths") or {}).get("home")
    template = (opts.get("outtmpl") or {}).get("default", "")
    prefix = template.split(".%(ext)s")[0]
    if not home or not prefix:
        return None
    hits = [p for p in glob.glob(os.path.join(glob.escape(home), glob.escape(prefix) + ".*")) if not p.endswith(".part")]
    return os.path.normpath(max(hits, key=os.path.getmtime)) if hits else None


def write_cookie_file(folder, cookies):
    path = os.path.join(folder, "cookies.txt")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(ytdlp.cookie_file_text(cookies))
    return path


class _Logger:
    def __init__(self, on_message=None):
        self.on_message = on_message

    def debug(self, message):
        if self.on_message:
            self.on_message(message)

    info = debug

    def warning(self, message):
        pass

    def error(self, message):
        pass


class _FinalPath(PostProcessor):
    def __init__(self):
        super().__init__(None)
        self.path = None

    def run(self, info):
        self.path = info.get("filepath")
        return [], info


class ExtractAudioPP(PostProcessor):
    def __init__(self, ffmpeg, quality):
        super().__init__(None)
        self.ffmpeg = ffmpeg
        self.quality = quality
        self.target = ytdlp.AUDIO_FORMATS[quality][0]

    def run(self, info):
        src = info["filepath"]
        if src.lower().endswith("." + self.target):
            return [], info
        dst = os.path.splitext(src)[0] + "." + self.target
        run_ffmpeg(ytdlp.audio_command(self.ffmpeg, src, dst, self.quality, info.get("acodec")))
        return [src], {**info, "filepath": dst, "ext": self.target}


class Host:
    def __init__(self, out, ffmpeg_location=None):
        self.out = out
        self.send_lock = threading.Lock()
        self.ydl_class = yt_dlp.YoutubeDL if yt_dlp else None
        self.ffmpeg_location = ffmpeg_location
        self.files = FileServer()
        self.transcribe = None
        self.share_server = None
        self.update_lock = threading.Lock()
        self.cache = {}
        self.cache_lock = threading.Lock()
        self.requests = queue.PriorityQueue()
        self.seq = itertools.count()
        self.info_ydl = None
        self.info_thread = threading.Thread(target=self._info_loop, daemon=True)
        self.worker = None
        self.cancel_event = threading.Event()
        self.name_lock = threading.Lock()
        self.last_number = 0


    def start(self):
        self.info_thread.start()
        threading.Thread(target=self._warm_ffmpeg, daemon=True).start()
        timer = threading.Timer(UPDATE_DELAY, self.check_update)
        timer.daemon = True
        timer.start()

    def check_update(self, interval=ytdlp_updater.WEEK):
        if not self.update_lock.acquire(blocking=False):
            return
        try:
            result = ytdlp_updater.update(interval=interval)
        except Exception as exc:
            result = {"ok": False, "error": str(exc)}
        finally:
            self.update_lock.release()
        if result is None:
            return
        log("yt-dlp güncelleme", result)
        if result.get("ok") and result.get("changed"):
            self.send({"type": "updated", "version": result.get("after", "")})

    def update_soon(self):
        threading.Thread(target=self.check_update, kwargs={"interval": ytdlp_updater.DAY}, daemon=True).start()

    def _warm_ffmpeg(self):
        try:
            from yt_dlp.postprocessor.ffmpeg import FFmpegPostProcessor
            with yt_dlp.YoutubeDL({"ffmpeg_location": self.ffmpeg_location, "logger": _Logger()}) as ydl:
                FFmpegPostProcessor(ydl)._versions
        except Exception:
            pass

    def send(self, obj):
        with self.send_lock:
            try:
                write_message(self.out, obj)
            except (OSError, ValueError):
                pass

    def error(self, message, url=None):
        msg = {"type": "error", "message": message}
        if url is not None:
            msg["url"] = url
        self.send(msg)

    def handle(self, msg):
        kind = msg.get("type")
        if kind == "cancel":
            self.cancel()
        elif self.ydl_class is None:
            self.error(MISSING_LIB, url=msg.get("url") if kind == "info" else None)
        elif kind == "info":
            self.request_info(msg.get("url", ""), bool(msg.get("prefetch")), msg.get("cookies"))
        elif kind == "download":
            self.start_download(msg)
        elif kind == "release":
            self.files.release(str(msg.get("token", "")))
        elif kind == "share":
            threading.Thread(target=self.share, args=(msg.get("path"),), daemon=True).start()
        elif kind == "name":
            self.send({"type": "name", "id": msg.get("id"), "name": self.reserve_name()})
        else:
            self.error("Bilinmeyen istek.")


    def cached(self, url):
        with self.cache_lock:
            entry = self.cache.get(url)
        if entry and time.monotonic() - entry[0] < CACHE_TTL:
            return entry
        return None

    def remember(self, url, info, summary):
        with self.cache_lock:
            self.cache.pop(url, None)
            self.cache[url] = (time.monotonic(), info, summary)
            while len(self.cache) > CACHE_LIMIT:
                self.cache.pop(next(iter(self.cache)))

    def request_info(self, url, prefetch, cookies=None):
        entry = self.cached(url)
        if entry:
            self.send(entry[2])
            return
        self.requests.put((1 if prefetch else 0, next(self.seq), url, prefetch, cookies))

    def _info_loop(self):
        try:
            has_specific_extractor(WARMUP_URL)
            self._info_ydl()
        except Exception:
            pass
        while True:
            _, _, url, prefetch, cookies = self.requests.get()
            try:
                self.process_info(url, prefetch, cookies)
            except Exception as exc:
                self.error(f"Beklenmeyen hata: {exc}", url=url)
            finally:
                self.requests.task_done()

    def _info_ydl(self):
        if self.info_ydl is None:
            self.info_ydl = self.ydl_class({**ytdlp.info_opts(), "logger": _Logger()})
        return self.info_ydl

    def process_info(self, url, prefetch, cookies=None):
        entry = self.cached(url)
        if entry:
            self.send(entry[2])
            return
        if prefetch and not has_specific_extractor(url):
            self.send({"type": "skip", "url": url})
            return
        cookie_dir = tempfile.mkdtemp(prefix="asil-downloader-") if cookies else None
        try:
            if cookie_dir:
                opts = {**ytdlp.info_opts(), "logger": _Logger(), "cookiefile": write_cookie_file(cookie_dir, cookies)}
                with self.ydl_class(opts) as ydl:
                    info = ydl.sanitize_info(ydl.extract_info(url, download=False), remove_private_keys=True)
            else:
                ydl = self._info_ydl()
                info = ydl.sanitize_info(ydl.extract_info(url, download=False), remove_private_keys=True)
            summary = ytdlp.summarize_info(info, url)
        except ValueError:
            self.error("Bu sayfada video bulunamadı.", url=url)
            return
        except Exception as exc:
            log("info hata", url, "cookies:", cookie_names(cookies), "|", exc)
            if ytdlp.looks_outdated(str(exc)):
                self.update_soon()
            self.error(ytdlp.simplify_error(str(exc)), url=url)
            return
        finally:
            if cookie_dir:
                shutil.rmtree(cookie_dir, ignore_errors=True)
        self.remember(url, info, summary)
        self.send(summary)


    def ffmpeg_path(self):
        return os.path.join(self.ffmpeg_location, "ffmpeg.exe") if self.ffmpeg_location else "ffmpeg"

    def stage(self, text, percent=None):
        self.send({"type": "progress", "percent": percent, "speed": "", "eta": "", "stage": text})

    def make_transcript(self, audio_path, opts):
        if self.transcribe is None:
            if importlib.util.find_spec("faster_whisper") is None:
                self.stage("Yazıya dökme bileşeni kuruluyor (ilk sefer)…")
            ytdlp_updater.ensure_package("faster_whisper", "faster-whisper")
            self.transcribe = transcriber.Transcriber().transcribe
        progress = {"last": 0.0}

        def on_progress(percent):
            now = time.monotonic()
            if now - progress["last"] >= PROGRESS_INTERVAL:
                progress["last"] = now
                self.stage(f"Yazıya dökülüyor… %{percent:.0f}", percent)

        text, lang = self.transcribe(self.ffmpeg_path(), audio_path, self.stage, on_progress, self.cancel_event.is_set)
        if not text.strip():
            raise RuntimeError("Videoda yazıya dökülecek konuşma bulunamadı.")
        base = (opts.get("outtmpl") or {}).get("default", "asil-downloader.%(ext)s").split(".%(ext)s")[0]
        srt = os.path.join(os.path.dirname(audio_path), f"{base}.{lang}.srt" if lang else f"{base}.srt")
        with open(srt, "w", encoding="utf-8-sig", newline="\n") as f:
            f.write(text)
        try:
            os.remove(audio_path)
        except OSError:
            pass
        return srt

    def share(self, path):
        try:
            if not isinstance(path, str) or not os.path.isfile(path):
                raise RuntimeError("Paylaşılacak dosya bulunamadı.")
            address = lan_address()
            if not address:
                raise RuntimeError("Bilgisayar bir ağa bağlı görünmüyor.")
            segno = ytdlp_updater.ensure_package("segno", "segno")
            if self.share_server is None:
                self.share_server = FileServer(bind="0.0.0.0", public_host=address, once=False)
            self.share_server.public_host = address
            _, url = self.share_server.offer(path, keep=True)
            ios = ios_shortcut_url(url)
            style = {"scale": 5, "border": 2, "dark": "#0e0e0e", "light": "#ffffff"}
            self.send({
                "type": "share", "url": url, "path": path,
                "svg": segno.make(url, error="m").svg_data_uri(**style),
                "ios": ios, "svg_ios": segno.make(ios, error="l").svg_data_uri(**style),
            })
        except Exception as exc:
            log("paylaşım hata", exc)
            self.send({"type": "share", "error": str(exc), "path": path})

    def reserve_name(self):
        with self.name_lock:
            try:
                names = os.listdir(ytdlp.downloads_dir())
            except OSError:
                names = []
            self.last_number = max(self.last_number, ytdlp.highest_file_number(names)) + 1
            return ytdlp.file_name(self.last_number)

    def start_download(self, msg):
        if self.worker and self.worker.is_alive():
            self.error("Zaten bir indirme sürüyor.")
            return
        url = msg.get("url", "")
        try:
            section = ytdlp.parse_section(msg.get("start"), msg.get("end"))
        except ValueError:
            self.error("Geçersiz zaman aralığı. Örnek: 1:20 - 2:45")
            return
        temp_dir = tempfile.mkdtemp(prefix="asil-downloader-")
        out_dir = tempfile.mkdtemp(prefix="asil-downloader-out-")
        try:
            opts = ytdlp.download_opts(
                msg.get("mode"), msg.get("quality"), out_dir, temp_dir, self.ffmpeg_location,
                name=self.reserve_name(), section=section, lang=msg.get("lang"))
        except ValueError:
            shutil.rmtree(temp_dir, ignore_errors=True)
            shutil.rmtree(out_dir, ignore_errors=True)
            self.error("Geçersiz seçim.")
            return
        if section and msg.get("mode") != "subtitle":
            opts["download_ranges"] = make_ranges(section)
        if msg.get("cookies"):
            opts["cookiefile"] = write_cookie_file(temp_dir, msg["cookies"])
        self.cancel_event.clear()
        audio = msg.get("quality") if msg.get("mode") == "audio" else None
        if msg.get("mode") == "transcript":
            audio = "transcript"
        self.worker = threading.Thread(target=self.run_download, args=(url, opts, temp_dir, audio, out_dir))
        self.worker.start()

    def run_download(self, url, opts, temp_dir, audio=None, out_dir=None):
        offered = False
        try:
            entry = self.cached(url)
            try:
                path, already = self._download(url, opts, entry[1] if entry else None, audio)
            except Exception as exc:
                if entry is None or self.cancel_event.is_set() or not any(
                        code in str(exc) for code in ("HTTP Error 403", "HTTP Error 410")):
                    raise
                path, already = self._download(url, opts, None, audio)
            if already:
                self.error("Bu dosya zaten indirilmiş.")
            elif path:
                if audio == "transcript":
                    path = self.make_transcript(path, opts)
                token, link = self.files.offer(path, out_dir)
                offered = True
                self.send({"type": "done", "path": path, "filename": os.path.basename(path), "url": link, "token": token})
            elif self.cancel_event.is_set():
                self.send({"type": "cancelled"})
            else:
                self.error("İndirme başarısız oldu.")
        except Exception as exc:
            log("indirme hata", url, "cookiefile:", "cookiefile" in opts, "|", exc)
            if self.cancel_event.is_set():
                self.send({"type": "cancelled"})
            else:
                if ytdlp.looks_outdated(str(exc)):
                    self.update_soon()
                self.error(ytdlp.simplify_error(str(exc)))
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
            if out_dir and not offered:
                shutil.rmtree(out_dir, ignore_errors=True)

    def _download(self, url, opts, info, audio=None):
        already = False
        last_sent = 0.0
        last_stage = None

        def on_message(message):
            nonlocal already
            if ytdlp.is_already_downloaded(message):
                already = True

        def progress_hook(d):
            nonlocal last_sent
            if self.cancel_event.is_set():
                raise DownloadCancelled("cancelled")
            msg = ytdlp.progress_from_hook(d)
            if msg is None:
                return
            now = time.monotonic()
            if d.get("status") == "finished" or now - last_sent >= PROGRESS_INTERVAL:
                last_sent = now
                self.send(msg)

        def postprocessor_hook(d):
            nonlocal last_stage
            if self.cancel_event.is_set():
                raise DownloadCancelled("cancelled")
            stage = ytdlp.stage_message(d.get("postprocessor")) if d.get("status") == "started" else None
            if stage and stage != last_stage:
                last_stage = stage
                self.send({"type": "progress", "percent": None, "speed": "", "eta": "", "stage": stage})

        final = _FinalPath()
        ydl_opts = {
            **opts,
            "logger": _Logger(on_message),
            "progress_hooks": [progress_hook],
            "postprocessor_hooks": [postprocessor_hook],
        }
        with self.ydl_class(ydl_opts) as ydl:
            if audio and audio != "transcript":
                ydl.add_post_processor(ExtractAudioPP(self.ffmpeg_path(), audio), when="post_process")
            ydl.add_post_processor(final, when="after_move")
            if info is None:
                ydl.extract_info(url, download=True)
            else:
                ydl.process_ie_result(copy.deepcopy(info), download=True)
        return final.path or newest_output(opts), already

    def cancel(self):
        if not (self.worker and self.worker.is_alive()):
            return
        self.cancel_event.set()
        threading.Thread(target=kill_ffmpeg_children, daemon=True).start()


def main():
    out = sys.stdout.buffer
    sys.stdout = sys.stderr
    host = Host(out, ffmpeg_location=find_ffmpeg())
    host.start()
    while True:
        msg = read_message(sys.stdin.buffer)
        if msg is None:
            break
        try:
            host.handle(msg)
        except Exception as exc:
            host.error(f"Beklenmeyen hata: {exc}")
    if host.worker:
        host.worker.join()
    host.files.release_all()


if __name__ == "__main__":
    main()
