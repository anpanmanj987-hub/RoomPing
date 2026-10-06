# Changelog

## 0.1.0a3 — 2026-10-06

- Fix: after adding a second condition, the comparison kept both selectors on the first condition and showed nothing until changed by hand. "After" now defaults to the condition being measured whenever both selectors would match.
- Fix: rejected uploads on Windows could reach the browser as a connection reset instead of their error reply, because the socket was closed with the body unread. The host now discards a bounded remainder of the body before closing.
- Add `docs/sample-roomping.json`, a clearly labeled sample record you can import to try the interface.
- Checked on Windows 11 with Python 3.14 and Node 24, including real measurements and JSON import in Edge. See [docs/VALIDATION.md](docs/VALIDATION.md).
- README rewritten with screenshots and a no-clone install; internal working notes removed from `docs/`.

## 0.1.0a2 — 2026-10-05

- Upload reads use `read1` against an absolute deadline, so a trickling client cannot extend it; a complete last chunk that arrives after the deadline is rejected.
- Run end and transfer admission validate the run owner atomically, so a delayed request cannot clear a new run.
- Requests keep fetch's default CORS mode so POSTs carry a usable Origin under `Referrer-Policy: no-referrer`.

## 0.1.0a1 — 2026-10-03

- First alpha: floorplan spots, named conditions, sequential HTTP round-trip/download/upload measurements, same-spot comparison, validated JSON import/export and CSV export.
