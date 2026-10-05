"""Bounded, same-origin LAN test traffic. Not an internet-facing server."""
import hmac
import io
import ipaddress
import json
import secrets
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
from urllib.parse import parse_qs, urlsplit

import qrcode
from qrcode.image.svg import SvgPathImage

from . import __version__

MAX_TRANSFER_BYTES = 16 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
REQUEST_SECONDS = 15
RUN_SECONDS = 120
ASSETS = {"/": ("index.html", "text/html; charset=utf-8"),
          "/style.css": ("style.css", "text/css; charset=utf-8"),
          "/app.js": ("app.js", "text/javascript; charset=utf-8"),
          "/metrics.mjs": ("metrics.mjs", "text/javascript; charset=utf-8"),
          "/measurement.mjs": ("measurement.mjs", "text/javascript; charset=utf-8")}


class RoomPingServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, token, advertised_host, socket_timeout):
        super().__init__(address, Handler)
        self.token = token
        self.socket_timeout = socket_timeout
        self.advertised_host = advertised_host
        port = self.server_port
        self.allowed_hosts = {f"{name}:{port}" for name in
                              ("127.0.0.1", "localhost", advertised_host)}
        self.join_url = f"http://{advertised_host}:{port}/#token={token}"
        self.state_lock = threading.Lock()
        self.transfer_lock = threading.Lock()
        self.active_run = None
        self.active_deadline = 0
        self.request_slots = threading.BoundedSemaphore(16)
        # Pre-generate outside timing; no disk or random generator in the test path.
        self.binary_chunk = secrets.token_bytes(CHUNK_BYTES)
        image = qrcode.make(self.join_url, image_factory=SvgPathImage)
        target = io.BytesIO()
        image.save(target)
        self.qr = target.getvalue()

    def process_request(self, request, client_address):
        if not self.request_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.request_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.request_slots.release()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "RoomPing"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(self.server.socket_timeout)

    def log_message(self, format, *args):
        # Never log request URLs, headers, tokens or floorplan information.
        return

    def reply(self, status, body=b"", content_type="application/json; charset=utf-8"):
        self.close_connection = True
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def json_reply(self, status, value):
        self.reply(status, json.dumps(value, separators=(",", ":")).encode("utf-8"))

    def error(self, status, message):
        self.json_reply(status, {"error": message})

    def one_header(self, name):
        values = self.headers.get_all(name, [])
        return values[0] if len(values) == 1 else None

    def authorize(self, mutation=False):
        host = self.one_header("Host")
        if host not in self.server.allowed_hosts:
            self.error(403, "Host is not allowed")
            return False
        if self.path.startswith("/api/"):
            token = self.one_header("X-RoomPing-Token") or ""
            if not hmac.compare_digest(token.encode("utf-8"), self.server.token.encode("utf-8")):
                self.error(401, "Open the join URL from this host")
                return False
            if mutation and self.one_header("Origin") != f"http://{host}":
                self.error(403, "Origin is not allowed")
                return False
        return True

    def content_length(self):
        value = self.one_header("Content-Length")
        if self.headers.get_all("Transfer-Encoding"):
            return None
        if value is None or not value.isascii() or not value.isdigit() or len(value) > 10:
            return None
        return int(value)

    def owns_run_locked(self, now):
        """Caller holds state_lock; never separate this check from its mutation."""
        return (self.server.active_run is not None
                and self.one_header("X-RoomPing-Run") == self.server.active_run
                and now < self.server.active_deadline)

    def admit_transfer(self):
        """Reserve transfer ownership atomically with validation of the run lease."""
        error = None
        with self.server.state_lock:
            now = time.monotonic()
            if not self.owns_run_locked(now):
                error = "Start a measurement run first"
            elif not self.server.transfer_lock.acquire(blocking=False):
                error = "Another transfer is running"
            else:
                self.server.active_deadline = now + RUN_SECONDS
        if error:
            self.error(409, error)
        return error is None

    def do_GET(self):
        try:
            self.handle_get()
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            self.close_connection = True

    def handle_get(self):
        if not self.authorize():
            return
        parsed = urlsplit(self.path)
        if parsed.scheme or parsed.netloc:
            return self.error(400, "Relative request path required")
        path = parsed.path
        if path in ASSETS:
            name, media_type = ASSETS[path]
            return self.reply(200, files("roomping").joinpath("static", name).read_bytes(), media_type)
        if path == "/api/info":
            return self.json_reply(200, {"version": __version__, "joinUrl": self.server.join_url,
                                         "maxTransferBytes": MAX_TRANSFER_BYTES,
                                         "requestTimeoutMs": REQUEST_SECONDS * 1000})
        if path == "/api/qr":
            return self.reply(200, self.server.qr, "image/svg+xml")
        if path == "/api/ping":
            return self.json_reply(200, {"ok": True})
        if path != "/api/download":
            return self.error(404, "Not found")
        try:
            values = parse_qs(parsed.query, max_num_fields=8).get("bytes", [])
            value = values[0] if len(values) == 1 else ""
            if not value.isascii() or not value.isdigit() or len(value) > 10:
                raise ValueError()
            length = int(value)
            if not 0 < length <= MAX_TRANSFER_BYTES:
                raise ValueError()
        except ValueError:
            return self.error(400, "Invalid transfer byte count")
        if not self.admit_transfer():
            return
        try:
            self.close_connection = True
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            remaining = length
            deadline = time.monotonic() + REQUEST_SECONDS
            while remaining:
                left = deadline - time.monotonic()
                if left <= 0:
                    break
                self.connection.settimeout(min(left, self.server.socket_timeout))
                chunk = self.server.binary_chunk[:min(remaining, CHUNK_BYTES)]
                self.wfile.write(chunk)
                remaining -= len(chunk)
        finally:
            self.server.transfer_lock.release()

    def do_POST(self):
        try:
            self.handle_post()
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            self.close_connection = True

    def handle_post(self):
        if not self.authorize(mutation=True):
            return
        if self.path not in ("/api/run/start", "/api/run/end", "/api/upload"):
            return self.error(404, "Not found")
        length = self.content_length()
        if length is None:
            return self.error(400, "A single Content-Length and no Transfer-Encoding are required")
        if length > MAX_TRANSFER_BYTES:
            return self.error(413, "Upload is too large")
        if self.path == "/api/run/start":
            if length != 0:
                return self.error(400, "Empty request required")
            with self.server.state_lock:
                now = time.monotonic()
                busy = (self.server.active_run and now < self.server.active_deadline) or self.server.transfer_lock.locked()
                if not busy:
                    run_id = secrets.token_urlsafe(24)
                    self.server.active_run = run_id
                    self.server.active_deadline = now + RUN_SECONDS
            if busy:
                return self.error(409, "Another measurement is running")
            return self.json_reply(200, {"runId": run_id})
        if self.path == "/api/run/end":
            if length != 0:
                return self.error(400, "Empty request required")
            with self.server.state_lock:
                valid = self.owns_run_locked(time.monotonic())
                if valid:
                    self.server.active_run = None
                    self.server.active_deadline = 0
            if not valid:
                return self.error(409, "Start a measurement run first")
            return self.json_reply(200, {"ok": True})
        if length == 0:
            return self.error(400, "Nonempty upload required")
        if not self.admit_transfer():
            return
        try:
            received = 0
            deadline = time.monotonic() + REQUEST_SECONDS
            while received < length:
                left = deadline - time.monotonic()
                if left <= 0:
                    return self.error(408, "Upload timed out")
                self.connection.settimeout(min(left, self.server.socket_timeout))
                try:
                    # Buffered read() may combine many receives and never return to
                    # our deadline loop while the peer trickles bytes. read1() returns
                    # available progress after at most one underlying raw read.
                    chunk = self.rfile.read1(min(CHUNK_BYTES, length - received))
                except socket.timeout:
                    return self.error(408, "Upload timed out")
                if time.monotonic() >= deadline:
                    return self.error(408, "Upload timed out")
                if not chunk:
                    return self.error(400, "Upload body is incomplete")
                received += len(chunk)
            if time.monotonic() >= deadline:
                return self.error(408, "Upload timed out")
            self.json_reply(200, {"receivedBytes": received})
        finally:
            self.server.transfer_lock.release()

    def do_OPTIONS(self):
        self.error(403, "Cross-origin access is disabled")


def create_server(host="127.0.0.1", port=8767, *, token=None, advertised_host=None, socket_timeout=10):
    ipaddress.IPv4Address(host)
    if host == "0.0.0.0" and not advertised_host:
        raise ValueError("--advertise with the PC's LAN IPv4 address is required for 0.0.0.0")
    advertised_host = advertised_host or host
    advertised = ipaddress.IPv4Address(advertised_host)
    if advertised.is_unspecified or advertised.is_multicast:
        raise ValueError("Advertised address must be a usable IPv4 address")
    return RoomPingServer((host, port), token or secrets.token_urlsafe(32), advertised_host, socket_timeout)
