import subprocess
import threading

MODEL = "small"
MODEL_SIZE_TEXT = "~480 MB"
SAMPLE_RATE = 16000
CREATE_NO_WINDOW = 0x08000000


def srt_time(seconds):
    millis = max(0, int(round(seconds * 1000)))
    hours, millis = divmod(millis, 3600000)
    minutes, millis = divmod(millis, 60000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def to_srt(segments):
    blocks = []
    for index, (start, end, text) in enumerate(segments, 1):
        text = " ".join(str(text).split())
        if not text:
            continue
        blocks.append(f"{len(blocks) + 1}\n{srt_time(start)} --> {srt_time(max(end, start + 0.2))}\n{text}\n")
    return "\n".join(blocks)


def decode_audio(ffmpeg, path):
    import numpy
    result = subprocess.run(
        [ffmpeg, "-nostdin", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=CREATE_NO_WINDOW)
    if result.returncode != 0:
        lines = result.stderr.decode("utf-8", "replace").strip().splitlines()
        raise RuntimeError("Ses çözülemedi: " + (lines[-1] if lines else f"kod {result.returncode}"))
    return numpy.frombuffer(result.stdout, dtype=numpy.float32)


class Transcriber:
    def __init__(self, model_name=MODEL):
        self.model_name = model_name
        self.model = None
        self.lock = threading.Lock()

    def _load(self, on_stage):
        from faster_whisper import WhisperModel
        try:
            return WhisperModel(self.model_name, device="cpu", compute_type="int8", local_files_only=True)
        except Exception:
            on_stage(f"Yapay zekâ modeli indiriliyor (ilk sefer, {MODEL_SIZE_TEXT})…")
            return WhisperModel(self.model_name, device="cpu", compute_type="int8")

    def transcribe(self, ffmpeg, path, on_stage, on_progress, cancelled):
        with self.lock:
            if self.model is None:
                self.model = self._load(on_stage)
            on_stage("Ses hazırlanıyor…")
            audio = decode_audio(ffmpeg, path)
            duration = len(audio) / SAMPLE_RATE or 1.0
            on_stage("Yazıya dökülüyor…")
            segments, info = self.model.transcribe(audio, vad_filter=True)
            collected = []
            for segment in segments:
                if cancelled():
                    raise InterruptedError("cancelled")
                collected.append((segment.start, segment.end, segment.text))
                on_progress(min(segment.end / duration * 100, 99.0))
            return to_srt(collected), getattr(info, "language", "")
