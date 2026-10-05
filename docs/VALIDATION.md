# Validation record and manual checks

## 0.1.0a2 post-review checks on 2026-10-05

Observed in the fix session: Linux x86_64, Python 3.12.14, Pillow 12.3.0 (PanelPop/SnapPaste), qrcode 8.2, Node 24.19.0 (RoomPing), setuptools 84.0.0, build 1.6.1. **20 Python unittest cases and 23 JavaScript tests passed, zero failures and zero skips.** Across all three projects: 120 tests.

- Fix: JSON export uses compact, lossless UTF-8 JSON through toJSON, sharing the 12 MiB combined-dataset limit with validation and import.
- Validation includes the image and every raw sample in the combined byte count. A refused measurement append/edit retains the complete prior dataset; UI edits report the refusal.
- Six added tests exercise a 5,000-record/20-sample lossless round-trip, UTF-8 byte overflow, append-at-capacity retention, the actual JSON-save event handler and a capacity-rejected point edit retaining state on a minimal Node DOM fixture. A follow-up case verifies that a successful edit clears the prior capacity error. Counts and byte limits apply together.

Wheel and sdist builds succeeded. Each distribution was installed separately into a newly created virtual environment without system site packages, from a working directory outside the checkout and with PYTHONPATH removed. Import location, version, module and console-script help/version, pip check, every bundled static route and authenticated loopback HTTP operations passed. PanelPop used only synthetic demo input; SnapPaste used only dry-run normalization; RoomPing checked QR, run start/end and exact 1,024-byte transfers. These checks do not verify native Windows or physical LAN/phone performance.

No Windows desktop is available in this environment. Physical Windows capture/input/clipboard, phones and LAN remain unverified. The local Playwright package has no installed browser executable, so the changed UI was not run in a real browser during this fix session. JSON/CSV native browser save/reopen remains unconfirmed; JSON generation/round-trip is tested in Node. GitHub CI and publication have not run. The original macOS evidence below is historical 0.1.0a1 evidence supplied with the source, not work performed in this fix session.

## Historical 0.1.0a1 record

## Observed in this implementation session

Environment: macOS, Python 3.12.14, Node bundled runtime, Codex in-app browser. Loopback HTTP results are not evidence of Wi-Fi radio or phone performance.

The parent task independently ran the complete suites outside the restrictive socket-binding sandbox:

```sh
PYTHONPATH=src python -m unittest discover -s tests -v
node --test tests/*.test.mjs
```

Reported results: **15 Python tests + 16 JavaScript tests passed, no skips**. Tests exercise real loopback HTTP connections, not mocked server success.

These counts describe the pre-review suite. After the independent review, five deterministic real-Handler regression tests and one Origin compatibility fixture were added. The current complete suite inventory is **20 Python tests + 17 JavaScript tests**. In the fix worker, all five added Python tests were observed failing before the fix and passing afterward; the Origin fixture failed with HTTP 403 before the fix and passed afterward. The post-fix no-socket run passed five Python regressions and twelve JavaScript Origin/metrics tests. The parent owns the final full real-socket rerun and fresh browser navigation; do not infer that result from this partial run.

Python coverage: token/Host/Origin rejection, no-cache ping, exact download bytes, binary upload acknowledgement, invalid/oversized lengths, rejected chunked requests, run start/busy/end, transfer without a run, truncated upload, fixed asset paths and QR delivery.

Node coverage: hand-derived Mbps/median/aggregate expectations; strict finite values including `1e999`, schema/references/IDs/counts, image declaration/signature restrictions, no mutation on failed append, Japanese/quoted/newline/formula CSV fields, same-point comparison. Real HTTP client tests verify delayed download body completion, server failure, upload acknowledgement mismatch, cancellation during body consumption and refusal of a second client run.

Post-review regression coverage: a real BufferedReader over a controlled trickling raw stream cannot bypass the absolute upload deadline; a complete last chunk observed after the deadline is rejected; transfer lock releases after timeout. Deterministic barriers on the real Handler reproduce stale run/end and upload/download admission races. The Node Origin fixture models the Fetch Standard's no-referrer Origin algorithm because Node has no browser document referrer policy; it is supplemented by the parent's fresh-browser POST check, not presented as a physical browser test itself.

Parent browser checks confirmed:

- Blank plan → tap → name `リビング` → actual HTTP measurement with seven latency and three transfer samples.
- Add `移動後` → measure same point → select before/after conditions → display deltas.
- Short loopback transfer samples receive the intended caution label.
- Import a hand-derived JSON fixture → review panel → confirm replacement → render **3.0 ms / 32 Mbps / 8 Mbps**.
- Reject invalid schema version while retaining previous results.
- Mobile-size viewport (390 px configured, 375 px content after scrollbar) has no horizontal overflow.

**Not confirmed:** the in-app browser automation did not capture JSON/CSV Blob download events. No console errors were observed, and the pure generation tests passed. Do not count this as verified native download handling.

Final controller verification on 2026-10-03 passed **20/20 Python and 17/17 JavaScript tests**, with no skips, including all real HTTP tests and new regressions. The controller reloaded the browser after the fixes and completed another run with seven latency samples and three transfers each way.

The controller built wheel/sdist and verified source ZIP integrity and SHA-256. Both distributions were installed into separate temporary site directories outside the checkout; real HTTP HTML/JS/CSS/info, run start/end and exact 1024-byte download/upload passed. Wheel import path, version, all static assets and CLI help passed. Existing validation-runtime dependencies were used; this is not a fresh OS or Windows/phone installation. CI has not run on GitHub.

## Before a wider alpha release

- [ ] Build wheel/sdist; install the wheel in a fresh environment outside the source folder; run `--help`, `--version` and host/static routes.
- [ ] Start on Windows with Python 3.10+ and verify stop/restart and firewall guidance.
- [ ] Test Android Chrome and iPhone Safari physically, with PC on Ethernet and both devices on the intended LAN.
- [ ] Scan the actual QR and confirm the advertised IP is reachable from the phone.
- [ ] Import a real floorplan and verify portrait/landscape positions stay consistent.
- [ ] Run a slow connection/large transfer to verify timeout; cancel mid-transfer and verify previous results remain.
- [ ] Hide/lock the phone during measurement; verify the incomplete run is discarded.
- [ ] Open a second browser/tab and verify busy rejection and lease recovery after disconnect.
- [ ] Use native browser JSON/CSV download, close/reopen, and reimport saved JSON with image and multiple conditions.
- [ ] Open CSV in the target spreadsheet app; verify Japanese text and formula-leading labels remain text.
- [ ] Disconnect internet while preserving LAN; measurement and QR must still work.
- [ ] Check guest-Wi-Fi client isolation, VPN routing and router changes; document network failures without fabricated metrics.

Do not advertise cross-platform or physical LAN/phone performance validation until these checks are performed and recorded.
