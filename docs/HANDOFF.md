# Handoff

RoomPing implements the approved standalone alpha scope: same-origin PC HTTP host, browser floorplan/blank plan, exact points, named conditions, sequential real download/upload/HTTP round-trip measurements, same-point comparison and validated JSON/CSV exchange.

Entry points:

- `python -m roomping` / `roomping`: default 127.0.0.1:8767.
- `--host 0.0.0.0 --advertise <PC LAN IPv4>`: explicit LAN access.
- `src/roomping/server.py`: route, authentication, limits, run lease and binary host.
- `src/roomping/static/measurement.mjs`: complete-body/ack timing, cancellation and sequential traffic.
- `src/roomping/static/metrics.mjs`: calculation, schema and CSV boundary.
- `src/roomping/static/app.js`: UI/state/file operations.

Defaults are intentionally conservative: 4 MiB × three requests per direction, seven latency samples, 15 seconds per request, 120 seconds per run. The browser page owns records in memory. Save JSON before navigation/close. No synthetic results are generated; host failure cannot yield a completed record.

Known limitations and next checks are in [VALIDATION.md](VALIDATION.md). Actual physical phones/LAN/Wi-Fi/Windows are unverified. Browser automation did not capture Blob file-download events; verify those manually. Cross-device synchronization, persistent browser storage, automatic network interface discovery, RSSI, internet speed tests and interpolated heatmaps are outside scope.

The worker made no git commits, GitHub repositories, external deployment or package-index publication. The parent owns source review, build/install verification, standalone git integration and any authorized publishing. The implementation record lists test-first evidence and the concurrency/schema choices.

Final parent verification: 20 Python + 17 JavaScript tests passed, including all HTTP and review regressions. The reviewer approved the Origin, deadline and run-ownership fixes. A fresh browser measurement passed after the fixes. Wheel/sdist builds and separate-directory installed real HTTP static/info/run/download/upload checks passed. Details are in [VALIDATION.md](VALIDATION.md). No remote publication has occurred.
