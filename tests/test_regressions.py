"""Real Handler regressions with deterministic transport and scheduling boundaries."""
import io
import json
import threading
import unittest
from http.client import HTTPMessage
from types import SimpleNamespace
from unittest.mock import patch

from roomping.server import Handler


class PauseAfterRelease:
    """Pause a chosen request after its first state critical section."""
    def __init__(self):
        self.lock = threading.Lock()
        self.arrived = threading.Event()
        self.resume = threading.Event()
        self.paused = False

    def __enter__(self):
        self.lock.acquire()
        return self

    def __exit__(self, *args):
        self.lock.release()
        if threading.current_thread().name == "stale-request" and not self.paused:
            self.paused = True
            self.arrived.set()
            if not self.resume.wait(3):
                raise RuntimeError("Test barrier did not resume")


class Clock:
    def __init__(self):
        self.value = 10.0

    def __call__(self):
        return self.value


class Connection:
    def __init__(self):
        self.timeout = 1

    def settimeout(self, value):
        self.timeout = value


class Trickle(io.RawIOBase):
    """One byte per receive; each receive advances a controlled monotonic clock."""
    def __init__(self, clock, connection):
        super().__init__()
        self.clock = clock
        self.connection = connection

    def readable(self):
        return True

    def readinto(self, target):
        import socket
        if self.connection.timeout < 0.04:
            self.clock.value += self.connection.timeout
            raise socket.timeout()
        self.clock.value += 0.04
        target[0] = ord("x")
        return 1


class LateBody(io.BytesIO):
    """Body becomes observable after the absolute deadline, despite being complete."""
    def __init__(self, clock):
        super().__init__(b"0123456789")
        self.clock = clock

    def read(self, size=-1):
        self.clock.value += 0.11
        return super().read(size)

    def read1(self, size=-1):
        self.clock.value += 0.11
        return super().read(size)


def server(state_lock=None):
    return SimpleNamespace(token="secret", allowed_hosts={"127.0.0.1:8767"},
        state_lock=state_lock or threading.Lock(), transfer_lock=threading.Lock(),
        active_run="run-A", active_deadline=1000, socket_timeout=0.07, binary_chunk=b"x" * 65536)


def handler(shared, path, run="run-A", body=b"", declared=None):
    h = object.__new__(Handler)
    h.server = shared
    h.path = path
    h.request_version = "HTTP/1.1"
    h.requestline = f"POST {path} HTTP/1.1"
    h.command = "POST"
    h.headers = HTTPMessage()
    for name, value in {"Host": "127.0.0.1:8767", "Origin": "http://127.0.0.1:8767",
                        "X-RoomPing-Token": "secret", "X-RoomPing-Run": run,
                        "Content-Length": str(len(body) if declared is None else declared)}.items():
        h.headers[name] = value
    h.connection = Connection()
    h.rfile = io.BytesIO(body)
    h.wfile = io.BytesIO()
    return h


def status(h):
    return int(h.wfile.getvalue().split(b" ", 2)[1])


class RegressionTests(unittest.TestCase):
    def test_continuous_small_reads_cannot_extend_absolute_upload_deadline(self):
        shared, clock = server(), Clock()
        h = handler(shared, "/api/upload", declared=10)
        h.rfile = io.BufferedReader(Trickle(clock, h.connection))
        with patch("roomping.server.time.monotonic", clock), patch("roomping.server.REQUEST_SECONDS", 0.1):
            h.handle_post()
        self.assertEqual(status(h), 408)
        self.assertNotIn(b"receivedBytes", h.wfile.getvalue())
        self.assertFalse(shared.transfer_lock.locked())
        followup = handler(shared, "/api/upload", body=b"ok")
        with patch("roomping.server.time.monotonic", clock):
            followup.handle_post()
        self.assertEqual(status(followup), 200)

    def test_complete_last_chunk_after_deadline_is_not_acknowledged(self):
        shared, clock = server(), Clock()
        h = handler(shared, "/api/upload", declared=10)
        h.rfile = LateBody(clock)
        with patch("roomping.server.time.monotonic", clock), patch("roomping.server.REQUEST_SECONDS", 0.1):
            h.handle_post()
        self.assertEqual(status(h), 408)
        self.assertNotIn(b"receivedBytes", h.wfile.getvalue())
        self.assertFalse(shared.transfer_lock.locked())

    def pause_request(self, h, operation):
        errors = []
        def run():
            try:
                operation()
            except BaseException as exc:
                errors.append(exc)
        thread = threading.Thread(target=run, name="stale-request")
        thread.start()
        self.assertTrue(h.server.state_lock.arrived.wait(2), "Request did not reach state boundary")
        def cleanup():
            h.server.state_lock.resume.set()
            thread.join(3)
            self.assertFalse(thread.is_alive())
            self.assertEqual(errors, [])
        self.addCleanup(cleanup)
        return thread

    def test_stale_end_cannot_clear_a_new_owner(self):
        shared = server(PauseAfterRelease())
        stale = handler(shared, "/api/run/end")
        # Fixed clock keeps the hand-made active lease valid.
        with patch("roomping.server.time.monotonic", return_value=10):
            thread = self.pause_request(stale, stale.handle_post)
            second = handler(shared, "/api/run/end")
            second.handle_post()
            new = handler(shared, "/api/run/start", run="")
            new.handle_post()
            self.assertEqual(status(new), 200)
            owner = shared.active_run
            self.assertIsNotNone(owner)
            shared.state_lock.resume.set()
            thread.join(2)
            self.assertEqual(shared.active_run, owner)

    def transfer_admission(self, path, operation):
        shared = server(PauseAfterRelease())
        stale = handler(shared, path, body=b"xx")
        with patch("roomping.server.time.monotonic", return_value=10):
            thread = self.pause_request(stale, lambda: operation(stale))
            ending = handler(shared, "/api/run/end")
            ending.handle_post()
            new = handler(shared, "/api/run/start", run="")
            new.handle_post()
            # The admitted transfer must already reserve the slot before state is released.
            self.assertEqual(status(new), 409)
            shared.state_lock.resume.set()
            thread.join(2)
            self.assertEqual(status(stale), 200)
            self.assertFalse(shared.transfer_lock.locked())
            retry = handler(shared, "/api/run/start", run="")
            retry.handle_post()
            self.assertEqual(status(retry), 200)

    def test_upload_admission_reserves_transfer_before_owner_can_change(self):
        self.transfer_admission("/api/upload", lambda h: h.handle_post())

    def test_download_admission_reserves_transfer_before_owner_can_change(self):
        self.transfer_admission("/api/download?bytes=2", lambda h: h.handle_get())


if __name__ == "__main__":
    unittest.main()
