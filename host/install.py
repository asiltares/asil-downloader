import base64
import hashlib
import json
import os
import sys

HOST_NAME = "com.asil.downloader"
HOST_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HOST_DIR)
REG_KEYS = [
    "Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\" + HOST_NAME,
    "Software\\Google\\Chrome\\NativeMessagingHosts\\" + HOST_NAME,
    "Software\\Microsoft\\Edge\\NativeMessagingHosts\\" + HOST_NAME,
]
MESSAGES = {
    "tr": {
        "missing": "UYARI: eksik Python paketleri:",
        "install": "Kur:",
        "done": "Kurulum tamam.",
        "id": "Eklenti ID:",
        "match": "brave://extensions sayfasındaki ID bununla aynı olmalı.",
    },
    "en": {
        "missing": "WARNING: missing Python packages:",
        "install": "Install:",
        "done": "Setup done.",
        "id": "Extension ID:",
        "match": "The ID on brave://extensions must match this one.",
    },
}


def extension_id(public_key_b64):
    digest = hashlib.sha256(base64.b64decode(public_key_b64)).hexdigest()[:32]
    return digest.translate(str.maketrans("0123456789abcdef", "abcdefghijklmnop"))


def host_manifest(bat_path, ext_id):
    return {
        "name": HOST_NAME,
        "description": "asil-downloader yt-dlp köprüsü",
        "path": bat_path,
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{ext_id}/"],
    }


def bat_content(python_exe):
    return f'@echo off\r\n"{python_exe}" -B -u "%~dp0native_host.py" %*\r\n'


def missing_dependencies():
    missing = []
    for module in ("yt_dlp", "curl_cffi"):
        try:
            __import__(module)
        except ImportError:
            missing.append(module)
    return missing


def main():
    import winreg

    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
        ext_id = extension_id(json.load(f)["key"])

    bat_path = os.path.join(HOST_DIR, "host.bat")
    with open(bat_path, "w", encoding="oem", newline="") as f:
        f.write(bat_content(sys.executable))

    manifest_path = os.path.join(HOST_DIR, "host-manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(host_manifest(bat_path, ext_id), f, ensure_ascii=False, indent=2)

    for key in REG_KEYS:
        winreg.SetValue(winreg.HKEY_CURRENT_USER, key, winreg.REG_SZ, manifest_path)

    text = MESSAGES["en" if os.environ.get("ASIL_SETUP_LANG") == "en" else "tr"]
    missing = missing_dependencies()
    if missing:
        print(text["missing"], ", ".join(missing))
        print(text["install"], 'python -m pip install -U "yt-dlp[default,curl-cffi]"')
    print(text["done"])
    print(text["id"], ext_id)
    print(text["match"])


if __name__ == "__main__":
    main()
