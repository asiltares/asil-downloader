import ctypes
import math
import os
import re
import uuid

AUDIO_FORMATS = {
    "320": ("mp3", "ba/b"),
    "192": ("mp3", "ba/b"),
    "m4a": ("m4a", "ba[acodec^=mp4a]/ba/b"),
    "opus": ("opus", "ba[acodec=opus]/ba/b"),
    "flac": ("flac", "ba/b"),
    "wav": ("wav", "ba/b"),
}
MAX_HEIGHTS = 8
MAX_SUBTITLES = 12
AUTO_SUB_LANGS = ("tr", "en")
FILE_PREFIX = "asil-downloader"
FILE_NAME_RE = re.compile(r"^asil-downloader \((\d+)\)(\.|$)", re.IGNORECASE)
LANG_RE = re.compile(r"^[A-Za-z0-9_-]{1,20}$")
UPDATE_HINT = 'yt-dlp\'yi güncellemeyi dene: pip install -U "yt-dlp[default,curl-cffi]"'

BASE_OPTS = {"noplaylist": True, "noprogress": True, "socket_timeout": 20}

ERROR_RULES = [
    (("drm",), "Bu site korumalı, indirilemez."),
    (("sign in", "login", "log in", "private", "cookies", "confirm your age", "age-restricted"),
     "Bu video giriş gerektiriyor."),
    (("unsupported url", "no video formats", "unable to extract", "no media found", "is not a valid url",
      "no video could be found", "http error 404"),
     "Bu sayfada video bulunamadı."),
]
ALREADY_DOWNLOADED_RE = re.compile(r"has already been downloaded|exists, skipping")
NOISE_RE = re.compile(r"https?://\S+|\b[A-Za-z]:\\.*")
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
STAGES = (("ExtractAudio", "Ses dönüştürülüyor…"), ("SubtitlesConvertor", "Altyazı hazırlanıyor…"), ("Merger", "Video ve ses birleştiriliyor…"))


def info_opts():
    return {**BASE_OPTS, "extract_flat": "in_playlist", "playlist_items": "1"}


def file_name(number):
    return f"{FILE_PREFIX} ({number})"


def highest_file_number(names):
    numbers = [int(m.group(1)) for m in map(FILE_NAME_RE.match, names) if m]
    return max(numbers, default=0)


def parse_time(text):
    if text is None or str(text).strip() == "":
        return None
    parts = str(text).strip().replace(",", ".").split(":")
    if len(parts) > 3:
        raise ValueError(text)
    seconds = 0.0
    for part in parts:
        if not re.fullmatch(r"\d+(\.\d+)?", part):
            raise ValueError(text)
        seconds = seconds * 60 + float(part)
    return seconds


def parse_section(start, end):
    start, end = parse_time(start), parse_time(end)
    if start is None and end is None:
        return None
    start = start or 0.0
    if end is not None and end <= start:
        raise ValueError("section")
    return start, end


def audio_command(ffmpeg, src, dst, quality, src_codec=None):
    target, _ = AUDIO_FORMATS[quality]
    codec = (src_codec or "").lower()
    if target == "mp3":
        args = ["-c:a", "libmp3lame", "-b:a", quality + "k", "-compression_level", "5"]
    elif target == "m4a":
        args = ["-c:a", "copy"] if codec.startswith("mp4a") else ["-c:a", "aac", "-b:a", "256k"]
    elif target == "opus":
        args = ["-c:a", "copy"] if codec == "opus" else ["-c:a", "libopus", "-b:a", "160k"]
    elif target == "flac":
        args = ["-c:a", "flac"]
    else:
        args = ["-c:a", "pcm_s16le"]
    return [ffmpeg, "-y", "-loglevel", "error", "-i", src, "-vn", *args, dst]


def _with_language(selector, lang):
    return f"{selector}[language={lang}]" if lang else selector


def download_opts(mode, quality, home_dir, temp_dir, ffmpeg_location=None, name=None, section=None, lang=None):
    if lang is not None and lang != "" and not LANG_RE.match(str(lang)):
        raise ValueError(lang)
    lang = lang or None
    base = name or FILE_PREFIX
    opts = {
        **BASE_OPTS,
        "overwrites": False,
        "paths": {"home": home_dir, "temp": temp_dir},
        "outtmpl": {"default": base + ".%(ext)s"},
        "concurrent_fragment_downloads": 8,
    }
    if ffmpeg_location:
        opts["ffmpeg_location"] = ffmpeg_location
    if section and mode != "subtitle":
        opts["force_keyframes_at_cuts"] = True
    if mode == "audio":
        if quality not in AUDIO_FORMATS:
            raise ValueError(quality)
        target, fmt = AUDIO_FORMATS[quality]
        opts["format"] = f"{_with_language('ba', lang)}/{fmt}" if lang else fmt
        opts["final_ext"] = target
    elif mode == "transcript":
        opts["format"] = f"{_with_language('ba', lang)}/ba/b" if lang else "ba/b"
    elif mode == "subtitle":
        lang, _, kind = str(quality or "").partition(":")
        if lang == "ai":
            raise ValueError(quality)
        if not LANG_RE.match(lang) or kind not in ("", "auto"):
            raise ValueError(quality)
        opts.update({
            "skip_download": True,
            "writesubtitles": kind == "",
            "writeautomaticsub": kind == "auto",
            "subtitleslangs": [lang],
            "subtitlesformat": "srt/vtt/best",
            "postprocessors": [{"key": "FFmpegSubtitlesConvertor", "format": "srt", "when": "before_dl"}],
        })
    elif mode == "video":
        audio = _with_language("ba", lang)
        if quality == "best":
            opts["format"] = f"bv*+{audio}/bv*+ba/b" if lang else "bv*+ba/b"
        elif isinstance(quality, str) and re.fullmatch(r"\d{2,4}", quality):
            limit = f"[height<=?{quality}]"
            opts["format"] = (f"bv*{limit}+{audio}/bv*{limit}+ba/b{limit}" if lang
                              else f"bv*{limit}+ba/b{limit}")
        else:
            raise ValueError(quality)
        opts["format_sort"] = ["res", "fps", "hdr:12", "vbr", "abr"]
        opts["merge_output_format"] = "mp4"
    else:
        raise ValueError(mode)
    return opts


def cookie_file_text(cookies):
    lines = ["# Netscape HTTP Cookie File"]
    for c in cookies or []:
        if not isinstance(c, dict):
            continue
        name, value, domain = c.get("name"), c.get("value"), c.get("domain")
        if not (isinstance(name, str) and isinstance(value, str) and isinstance(domain, str) and name and domain):
            continue
        if any(ch in field for field in (name, value, domain) for ch in "\t\r\n"):
            continue
        host_only = bool(c.get("hostOnly"))
        if not host_only and not domain.startswith("."):
            domain = "." + domain
        expiry = c.get("expirationDate")
        expiry = int(expiry) if isinstance(expiry, (int, float)) and math.isfinite(expiry) else 0
        path = c.get("path") if isinstance(c.get("path"), str) else "/"
        lines.append("\t".join([
            domain, "FALSE" if host_only else "TRUE", path or "/",
            "TRUE" if c.get("secure") else "FALSE", str(expiry), name, value]))
    return "\n".join(lines) + "\n"


def summarize_info(info, url):
    if info.get("_type") in ("playlist", "multi_video"):
        raise ValueError("playlist")
    heights = set()
    for fmt in info.get("formats") or []:
        if fmt.get("vcodec") != "none" and isinstance(fmt.get("height"), int):
            heights.add(fmt["height"])
    if not heights and isinstance(info.get("height"), int):
        heights.add(info["height"])
    heights = sorted(heights, reverse=True)[:MAX_HEIGHTS]
    return {
        "subtitles": subtitle_options(info),
        "sizes": size_estimates(info, heights),
        "audio_size": audio_estimate(info),
        "audio_langs": audio_languages(info),
        "type": "info",
        "url": url,
        "title": info.get("title") or "Başlıksız",
        "thumbnail": info.get("thumbnail") or "",
        "height": heights[0] if heights else None,
        "heights": heights,
        "duration": int(info["duration"]) if _finite(info.get("duration")) and info["duration"] > 0 else None,
    }


def _num(value):
    return value if isinstance(value, (int, float)) and math.isfinite(value) and value > 0 else None


def format_size(fmt, duration):
    exact = _num(fmt.get("filesize")) or _num(fmt.get("filesize_approx"))
    if exact:
        return int(exact)
    rate = _num(fmt.get("tbr")) or _num(fmt.get("vbr") or 0) or _num(fmt.get("abr") or 0)
    return int(rate * 1000 / 8 * duration) if rate and duration else None


def _is_audio_only(fmt):
    return fmt.get("vcodec") == "none" and fmt.get("acodec") not in (None, "none")


def _is_video(fmt):
    return fmt.get("vcodec") not in (None, "none") and isinstance(fmt.get("height"), int)


def _best(formats, key):
    return max(formats, key=key) if formats else None


def audio_estimate(info):
    duration = _num(info.get("duration"))
    audio = [f for f in info.get("formats") or [] if _is_audio_only(f)]
    preferred = [f for f in audio if (f.get("language_preference") or 0) >= 0] or audio
    best = _best(preferred, lambda f: (_num(f.get("abr")) or _num(f.get("tbr")) or 0))
    return format_size(best, duration) if best else None


def size_estimates(info, heights):
    duration = _num(info.get("duration"))
    videos = [f for f in info.get("formats") or [] if _is_video(f)]
    audio = audio_estimate(info) or 0
    sizes = {}
    for label, limit in [("best", None), *[(str(h), h) for h in heights]]:
        allowed = [f for f in videos if limit is None or f["height"] <= limit]
        if not allowed:
            continue
        top = max(f["height"] for f in allowed)
        best = _best([f for f in allowed if f["height"] == top],
                     lambda f: (_num(f.get("fps")) or 0, _num(f.get("vbr")) or _num(f.get("tbr")) or 0))
        size = format_size(best, duration)
        if size:
            has_audio = best.get("acodec") not in (None, "none")
            sizes[label] = size + (0 if has_audio else audio)
    return sizes


def audio_languages(info):
    seen = {}
    for fmt in info.get("formats") or []:
        lang = fmt.get("language")
        if not _is_audio_only(fmt) or not isinstance(lang, str) or not LANG_RE.match(lang):
            continue
        note = str(fmt.get("format_note") or "")
        name = note.split(",")[0].replace(" original", "").replace("(default)", "").strip() or lang
        original = "original" in note.lower() or (fmt.get("language_preference") or 0) >= 10
        entry = seen.setdefault(lang, {"value": lang, "label": name, "original": False})
        entry["original"] = entry["original"] or original
    if len(seen) < 2:
        return []
    options = sorted(seen.values(), key=lambda o: (not o["original"], o["label"].lower()))
    return [{"value": o["value"], "label": o["label"] + (" · orijinal" if o["original"] else "")} for o in options]


def subtitle_options(info):
    options = []
    for lang, tracks in (info.get("subtitles") or {}).items():
        if lang == "live_chat" or not LANG_RE.match(lang):
            continue
        name = next((t.get("name") for t in tracks or [] if isinstance(t, dict) and t.get("name")), "") or lang
        options.append({"value": lang, "label": name})
    auto = info.get("automatic_captions") or {}
    original = info.get("language")
    for lang in dict.fromkeys([original, *AUTO_SUB_LANGS]):
        if lang and lang in auto and LANG_RE.match(lang) and not any(o["value"] == lang for o in options):
            options.append({"value": lang + ":auto", "label": f"{lang} (otomatik)"})
    return options[:MAX_SUBTITLES]


def _finite(value):
    if isinstance(value, (int, float)) and math.isfinite(value):
        return value
    return None


def format_speed(bytes_per_sec):
    value = _finite(bytes_per_sec)
    if value is None:
        return ""
    for unit in ("B/s", "KB/s", "MB/s"):
        if value < 1024:
            return f"{value:.0f} {unit}" if unit == "B/s" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} GB/s"


def format_eta(seconds):
    seconds = _finite(seconds)
    if seconds is None:
        return ""
    hours, rest = divmod(int(seconds), 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes:02d}:{secs:02d}"


def progress_from_hook(d):
    status = d.get("status")
    if status == "finished":
        return {"type": "progress", "percent": 100.0, "speed": "", "eta": ""}
    if status != "downloading":
        return None
    done = _finite(d.get("downloaded_bytes"))
    total = _finite(d.get("total_bytes")) or _finite(d.get("total_bytes_estimate"))
    percent = None
    if done is not None and total:
        percent = min(round(done / total * 100, 1), 100.0)
    return {"type": "progress", "percent": percent, "speed": format_speed(d.get("speed")), "eta": format_eta(d.get("eta"))}


def stage_message(postprocessor):
    for key, message in STAGES:
        if key in (postprocessor or ""):
            return message
    return None


def is_already_downloaded(message):
    return bool(ALREADY_DOWNLOADED_RE.search(message))


OUTDATED_HINTS = ("please report this issue", "unable to extract", "signature extraction failed",
                  "nsig extraction failed", "unable to download api page")


def looks_outdated(text):
    lowered = ANSI_RE.sub("", text).lower()
    return any(hint in lowered for hint in OUTDATED_HINTS)


def simplify_error(text):
    text = ANSI_RE.sub("", text)
    if is_already_downloaded(text):
        return "Bu dosya zaten indirilmiş."
    message = text.strip()
    if message.startswith("ERROR:"):
        message = message[len("ERROR:"):].strip()
    message = re.sub(r"^\[[^\]]+\]\s*[^:\s]*:\s*", "", message)
    lowered = NOISE_RE.sub("", message).lower()
    for keywords, message_tr in ERROR_RULES:
        if any(k in lowered for k in keywords):
            return message_tr
    head, sep, _ = message.partition("; please report this issue")
    if sep:
        return head.strip() + ". " + UPDATE_HINT
    return message[:200] or "Bilinmeyen hata."


def downloads_dir():
    try:
        folder_id = uuid.UUID("374DE290-123F-4565-9164-39C4925E467B").bytes_le
        path_ptr = ctypes.c_wchar_p()
        result = ctypes.windll.shell32.SHGetKnownFolderPath(
            ctypes.c_char_p(folder_id), 0, None, ctypes.byref(path_ptr))
        if result == 0:
            path = path_ptr.value
            ctypes.windll.ole32.CoTaskMemFree(path_ptr)
            return path
    except (AttributeError, OSError):
        pass
    return os.path.join(os.path.expanduser("~"), "Downloads")
