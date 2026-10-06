"""Error replies follow the page language; the interface text module is served."""
import http.client
import json
import re
import threading
import unittest
from pathlib import Path

from roomping.server import JAPANESE, create_server, prefers_japanese

SERVER = Path(__file__).resolve().parents[1] / "src" / "roomping" / "server.py"


class LanguageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = create_server("127.0.0.1", 0, token="test-secret", socket_timeout=0.5)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def get(self, path, headers):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        conn.request("GET", path, headers=headers)
        response = conn.getresponse()
        result = response.status, response.read()
        conn.close()
        return result

    def test_every_error_message_has_a_japanese_translation(self):
        used = set(re.findall(r'self\.error\(\d+, "([^"]+)"\)', SERVER.read_text(encoding="utf-8")))
        self.assertTrue(used)
        self.assertEqual(used - set(JAPANESE), set())

    def test_error_language_follows_accept_language(self):
        status, body = self.get("/api/ping", {"X-RoomPing-Token": "wrong", "Accept-Language": "ja"})
        self.assertEqual((status, json.loads(body)["error"]), (401, JAPANESE["Open the join URL from this host"]))
        for header in ({"Accept-Language": "en-US,ja;q=0.8"}, {}):
            status, body = self.get("/api/ping", {"X-RoomPing-Token": "wrong", **header})
            self.assertEqual(json.loads(body)["error"], "Open the join URL from this host")

    def test_prefers_japanese_uses_the_first_ja_or_en_tag(self):
        for header, expected in (("ja-JP", True), ("fr,ja;q=0.5", True), ("en,ja", False), ("de", False), (None, False)):
            with self.subTest(header=header):
                self.assertEqual(prefers_japanese(header), expected)

    def test_interface_text_module_is_served(self):
        status, body = self.get("/i18n.mjs", {})
        self.assertEqual(status, 200)
        self.assertIn(b"export function t(", body)


if __name__ == "__main__":
    unittest.main()
