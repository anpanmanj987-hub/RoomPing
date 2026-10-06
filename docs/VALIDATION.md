# Validation record

This page separates what has been observed in real browsers and on real machines from what is only covered by automated tests.

## Windows check — 2026-10-06 (0.1.0a3)

Environment: Windows 11 (build 26200), Python 3.14.8, Node 24.21.0, Microsoft Edge 154 (headless, driven over the DevTools protocol). PC and browser on the same machine over loopback.

- All 21 Python and 24 JavaScript tests passed, repeatedly.
- In Edge: loaded a floorplan image, added spots by tapping, ran real measurements with 16 MiB transfers, added a second condition, measured the same spot again, and saw the comparison.
- Imported `docs/sample-roomping.json` through the file picker, confirmed the replacement and saw per-spot results and the comparison (+153.4 Mbps download, +113.2 Mbps upload, −10.4 ms for the bedroom).
- The page asks before navigating away while it holds unsaved spots.

Two issues found during this session were fixed in 0.1.0a3:

- **Comparison stuck on one condition.** After adding a second condition, both selectors still named the first one, so the comparison stayed empty until the user changed a selector by hand. "After" now defaults to the condition being measured.
- **Connection reset on rejected uploads.** Rejecting an upload before reading its body and closing the socket made Windows send a reset, so the browser showed a network failure instead of the error reply. Reproduced by a new HTTP test on Windows and fixed by draining a bounded remainder of the body.

Loopback numbers say nothing about Wi-Fi; they only show that the measurement pipeline works end to end.

## Earlier checks (0.1.0a1–a2, macOS and Linux)

On macOS, a browser ran blank-plan measurements with seven latency and three transfer samples, compared two conditions at the same spot, imported a hand-made JSON record, kept existing results when an invalid file was rejected, and showed no horizontal overflow at a 390 px viewport. Wheel and sdist builds were installed outside the checkout and served every static route and exact 1,024-byte transfers.

## Automated tests

```sh
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
```

Python covers token, Host and Origin rejection, uncached ping, exact download bytes, upload acknowledgement, invalid and oversized lengths, chunked and truncated uploads, reset-free rejections, run start/busy/end, and deterministic regressions for trickling uploads, the absolute upload deadline and stale run/transfer races.

JavaScript covers Mbps, median and byte-weighted aggregation, strict schema validation (non-finite values, references, IDs, counts, image signatures), the 12 MiB capacity boundary, CSV escaping and formula neutralization, same-spot comparison and its default selection, real HTTP client behaviour (delayed bodies, server errors, acknowledgement mismatch, cancellation, busy refusal) and Origin handling under `no-referrer`.

GitHub Actions runs both suites on Ubuntu with Python 3.10, 3.12 and 3.14 and Node 24, and builds the wheel and sdist.

## Not yet verified

- [ ] Android Chrome and iPhone Safari on a real LAN, with the PC on Ethernet: scan the QR, measure, and check that portrait and landscape positions stay consistent.
- [ ] Hiding or locking the phone during a measurement discards the run; a second tab is refused and the lease recovers after a disconnect.
- [ ] Native JSON/CSV save dialogs, then re-importing a saved file with an image and several conditions.
- [ ] Opening the CSV in the target spreadsheet app (Japanese text, formula-like labels stay text).
- [ ] Measuring with the internet disconnected but the LAN up; guest-Wi-Fi isolation and VPN routing produce clear failures, never fabricated numbers.

When you check one of these, please record the OS, browser, network layout and the exact result.
