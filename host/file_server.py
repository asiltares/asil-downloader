import mimetypes
import os
import re
import secrets
import shutil
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote

EXPIRE_AFTER = 60 * 60
CHUNK = 1024 * 1024
RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


def lan_address():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        try:
            sock.connect(("10.255.255.255", 1))
            address = sock.getsockname()[0]
        except OSError:
            return None
    return None if address.startswith("127.") or address == "0.0.0.0" else address


class FileServer:
    def __init__(self, bind="127.0.0.1", public_host=None, once=True):
        self.bind = bind
        self.public_host = public_host or bind
        self.once = once
        self.files = {}
        self.lock = threading.Lock()
        self.server = None

    def _ensure_started(self):
        if self.server:
            return
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                owner._serve(self, body=True)

            def do_HEAD(self):
                owner._serve(self, body=False)

        self.server = ThreadingHTTPServer((self.bind, 0), Handler)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def offer(self, path, folder=None, keep=False):
        with self.lock:
            self._ensure_started()
            self._expire()
            token = secrets.token_urlsafe(24)
            self.files[token] = (path, folder, time.monotonic(), keep)
        port = self.server.server_address[1]
        return token, f"http://{self.public_host}:{port}/{token}/{quote(os.path.basename(path))}"

    def release(self, token):
        with self.lock:
            entry = self.files.pop(token, None)
        if entry:
            self._delete(entry)

    def release_all(self):
        with self.lock:
            entries = list(self.files.values())
            self.files.clear()
        for entry in entries:
            self._delete(entry)

    def _expire(self):
        now = time.monotonic()
        for token, entry in list(self.files.items()):
            if now - entry[2] > EXPIRE_AFTER:
                del self.files[token]
                self._delete(entry)

    @staticmethod
    def _delete(entry):
        path, folder, _, keep = entry
        if keep:
            return
        if folder:
            shutil.rmtree(folder, ignore_errors=True)
        else:
            try:
                os.remove(path)
            except OSError:
                pass

    def _serve(self, request, body=True):
        token = request.path.lstrip("/").split("/", 1)[0]
        with self.lock:
            entry = self.files.get(token)
        if not entry or not os.path.isfile(entry[0]):
            request.send_error(404)
            return
        path = entry[0]
        name = os.path.basename(path)
        size = os.path.getsize(path)
        start, end = 0, size - 1
        partial = False
        match = RANGE_RE.match(request.headers.get("Range", "") or "")
        if match and not self.once and size:
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size - 1) if last else size - 1
            elif last:
                start = max(0, size - int(last))
            if start > end or start >= size:
                request.send_response(416)
                request.send_header("Content-Range", f"bytes */{size}")
                request.end_headers()
                return
            partial = True
        length = end - start + 1 if size else 0
        request.send_response(206 if partial else 200)
        request.send_header("Content-Type", mimetypes.guess_type(name)[0] or "application/octet-stream")
        request.send_header("Content-Length", str(length))
        request.send_header("Accept-Ranges", "bytes" if not self.once else "none")
        if partial:
            request.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        request.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(name)}")
        request.send_header("Cache-Control", "no-store")
        request.end_headers()
        if not body:
            return
        sent = 0
        try:
            with open(path, "rb") as f:
                f.seek(start)
                while sent < length:
                    chunk = f.read(min(CHUNK, length - sent))
                    if not chunk:
                        break
                    request.wfile.write(chunk)
                    sent += len(chunk)
        except OSError:
            return
        if self.once and sent == size:
            self.release(token)
