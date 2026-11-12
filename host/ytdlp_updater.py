import json
import os
import subprocess
import sys
import time

WEEK = 7 * 24 * 60 * 60
DAY = 24 * 60 * 60
CREATE_NO_WINDOW = 0x08000000
PACKAGE = "yt-dlp[default,curl-cffi]"
VERSION_SCRIPT = "import importlib.metadata as m; print(m.version('yt-dlp'))"


def state_path():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, "asil-downloader", "update.json")


def read_last(path):
    try:
        with open(path, encoding="utf-8") as f:
            value = json.load(f).get("last")
        return float(value) if isinstance(value, (int, float)) else None
    except (OSError, ValueError, AttributeError):
        return None


def write_last(path, when):
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"last": when}, f)
    except OSError:
        pass


def is_due(last, now, interval):
    return last is None or now - last >= interval or last > now


def run(cmd, timeout):
    return subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=timeout, creationflags=CREATE_NO_WINDOW)


def installed_version():
    try:
        result = run([sys.executable, "-c", VERSION_SCRIPT], 60)
        return result.stdout.decode("utf-8", "replace").strip() if result.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def ensure_package(module, package):
    import importlib
    try:
        return importlib.import_module(module)
    except ImportError:
        pass
    result = run([sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", package], 900)
    if result.returncode != 0:
        lines = result.stderr.decode("utf-8", "replace").strip().splitlines()
        raise RuntimeError(f"{package} kurulamadı: " + (lines[-1] if lines else f"kod {result.returncode}"))
    importlib.invalidate_caches()
    return importlib.import_module(module)


def update(interval=WEEK):
    path = state_path()
    now = time.time()
    if not is_due(read_last(path), now, interval):
        return None
    write_last(path, now)
    before = installed_version()
    try:
        result = run([sys.executable, "-m", "pip", "install", "-U", "--quiet", "--disable-pip-version-check", PACKAGE], 600)
    except (OSError, subprocess.SubprocessError) as exc:
        return {"ok": False, "error": str(exc)}
    if result.returncode != 0:
        lines = result.stderr.decode("utf-8", "replace").strip().splitlines()
        return {"ok": False, "error": lines[-1] if lines else f"kod {result.returncode}"}
    after = installed_version()
    return {"ok": True, "before": before, "after": after, "changed": bool(after) and after != before}
