"""Real-socket tests: unauthorized traffic, incomplete bodies and concurrency."""
import http.client
import importlib.util
import json
import socket
import threading
import unittest

AVAILABLE = importlib.util.find_spec("roomping") is not None
if AVAILABLE:
    from roomping.server import MAX_TRANSFER_BYTES, create_server


class BootstrapTests(unittest.TestCase):
    def test_product_module_exists(self):
        self.assertTrue(AVAILABLE, "RoomPing host has not been implemented")


@unittest.skipUnless(AVAILABLE, "Host not implemented yet")
class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = create_server("127.0.0.1", 0, token="test-secret", socket_timeout=0.5)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_port
        cls.origin = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        h = {"X-RoomPing-Token": "test-secret", "Origin": self.origin}
        h.update(headers or {})
        conn.request(method, path, body=body, headers=h)
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def start(self):
        status, _, data = self.request("POST", "/api/run/start", b"")
        self.assertEqual(status, 200)
        run_id = json.loads(data)["runId"]
        self.addCleanup(self.request, "POST", "/api/run/end", b"", {"X-RoomPing-Run": run_id})
        return {"X-RoomPing-Run": run_id}

    def test_authentication_required(self):
        self.assertEqual(self.request("GET", "/api/ping", headers={"X-RoomPing-Token": ""})[0], 401)

    def test_rejected_upload_reply_is_not_reset(self):
        # Windows resets a socket closed with unread data, hiding the reply.
        for _ in range(10):
            status = self.request("POST", "/api/upload", b"x" * 65536, {"X-RoomPing-Token": "old"})[0]
            self.assertEqual(status, 401)

    def test_wrong_host_rejected(self):
        self.assertEqual(self.request("GET", "/api/ping", headers={"Host": "attacker.example"})[0], 403)

    def test_wrong_or_absent_origin_rejected(self):
        for origin in ("http://attacker.example", "", "null"):
            with self.subTest(origin=origin):
                self.assertEqual(self.request("POST", "/api/run/start", b"", {"Origin": origin})[0], 403)

    def test_ping_is_uncached_and_cors_closed(self):
        status, headers, data = self.request("GET", "/api/ping?nonce=42")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data), {"ok": True})
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_download_counts_exact_binary_bytes(self):
        h = self.start()
        status, headers, data = self.request("GET", "/api/download?bytes=8193&nonce=1", headers=h)
        self.assertEqual(status, 200)
        self.assertEqual(len(data), 8193)
        self.assertEqual(headers["Content-Length"], "8193")
        self.assertEqual(headers["Content-Type"], "application/octet-stream")
        self.assertNotIn("Content-Encoding", headers)

    def test_upload_acknowledges_only_received_bytes(self):
        h = self.start()
        status, _, data = self.request("POST", "/api/upload", b"a\x00b" * 3001, h)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data), {"receivedBytes": 9003})

    def test_invalid_download_lengths_rejected(self):
        h = self.start()
        for value in ("0", "-1", "x", "1.5", str(MAX_TRANSFER_BYTES + 1), "1&bytes=2"):
            with self.subTest(value=value):
                self.assertEqual(self.request("GET", f"/api/download?bytes={value}", headers=h)[0], 400)

    def test_oversized_upload_rejected_before_body(self):
        h = self.start()
        h["Content-Length"] = str(MAX_TRANSFER_BYTES + 1)
        self.assertEqual(self.request("POST", "/api/upload", b"", h)[0], 413)

    def test_upload_requires_nonempty_content_length(self):
        h = self.start()
        self.assertEqual(self.request("POST", "/api/upload", b"", h)[0], 400)

    def test_chunked_upload_rejected(self):
        h = self.start()
        h["Transfer-Encoding"] = "chunked"
        self.assertEqual(self.request("POST", "/api/upload", b"abc", h)[0], 400)

    def test_busy_run_then_release(self):
        h = self.start()
        self.assertEqual(self.request("POST", "/api/run/start", b"")[0], 409)
        self.assertEqual(self.request("POST", "/api/run/end", b"", h)[0], 200)
        self.start()

    def test_transfer_requires_run(self):
        self.assertEqual(self.request("GET", "/api/download?bytes=10")[0], 409)

    def test_truncated_upload_never_succeeds(self):
        h = self.start()
        sock = socket.create_connection(("127.0.0.1", self.port), timeout=2)
        wire = (f"POST /api/upload HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n"
                f"Origin: {self.origin}\r\nX-RoomPing-Token: test-secret\r\n"
                f"X-RoomPing-Run: {h['X-RoomPing-Run']}\r\nContent-Length: 100\r\n\r\nabc")
        sock.sendall(wire.encode())
        sock.shutdown(socket.SHUT_WR)
        response = sock.recv(4096)
        sock.close()
        self.assertIn(b"400", response.split(b"\r\n")[0])
        self.assertNotIn(b"receivedBytes", response)

    def test_static_allowlist_and_qr(self):
        self.assertEqual(self.request("GET", "/")[0], 200)
        self.assertEqual(self.request("GET", "/app.js")[0], 200)
        self.assertEqual(self.request("GET", "/../../pyproject.toml")[0], 404)
        status, headers, data = self.request("GET", "/api/qr")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "image/svg+xml")
        self.assertIn(b"<svg", data)


if __name__ == "__main__":
    unittest.main()
