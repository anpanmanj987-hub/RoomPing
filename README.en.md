# RoomPing

**Compare your home's LAN performance at the points you actually measured.** RoomPing is a local PC HTTP host and a phone browser interface for recording download/upload throughput and HTTP round-trip latency on a floorplan.

Alpha **0.1.0a2** · Python **3.10+** · MIT · [日本語](README.md)

Version 0.1.0a2 is the post-review source release. [Validation](docs/VALIDATION.md) separates the current Linux checks from historical 0.1.0a1 macOS evidence.

## Features

- Join through a locally generated QR or the host's private join URL.
- Select a PNG/JPEG/WebP floorplan or use a blank plan; tap exact points.
- Reuse an existing point under named conditions, then compare its latest results.
- Show HTTP round-trip median and PC→phone / phone→PC throughput in decimal Mbps.
- Draw measured points only; no interpolation or inferred heatmap.
- Export/import a versioned JSON document, with validation and confirmation before replacement. Export spreadsheet-oriented CSV.

## Install and run

Run these commands in this project directory. Downloading the source and installing dependencies initially requires internet access. Measurement after installation does not require external services.

```sh
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate
python -m pip install .
python -m roomping
```

The default bind address is **127.0.0.1:8767**, for use on the PC. Open the complete URL printed by the process, including its `#token=...` fragment.

For a phone, explicitly enable LAN listening and substitute your PC's actual LAN IPv4 address:

```sh
python -m roomping --host 0.0.0.0 --advertise 192.168.1.20
# Or bind only the LAN interface
python -m roomping --host 192.168.1.20
```

Wildcard binding requires `--advertise`; RoomPing does not guess which network interface to use. Connect the phone and PC to the same LAN. Allow inbound traffic only on the intended private network in the OS firewall. Open the printed URL on the PC, expand the phone connection panel, and scan its QR with the phone camera. Keep the process running; stop it with **Ctrl+C**.

```sh
python -m roomping --help
python -m roomping --version
```

## Measure and compare

Connect the PC by Ethernet where possible. Choose a floorplan, tap a point, set its name and a condition, then measure. Images are limited to 5 MiB, 8,192 pixels per dimension and 16 million total pixels. Select the same marker when testing another condition so the comparison refers to the same position. Note phone, orientation, PC connection, router settings, band, and background traffic.

Defaults: seven latency samples, then three 4 MiB downloads and three 4 MiB uploads (24 MiB total). Transfer-size choices are 1, 4 and 16 MiB; repeat choices are one or three. Traffic is sequential. Each request has a 15-second deadline and a whole run has a 120-second deadline. Transfer samples shorter than 250 ms are flagged; use the larger payload when comparing a fast LAN. Hiding the page, cancelling, or failing any request discards the entire current run.

These are **LAN HTTP application throughput and HTTP round-trip latency**, including browser, PC, TCP/HTTP and network overhead. They are not Wi-Fi signal strength, PHY/link speed, internet speed, or ICMP ping. If the PC also uses Wi-Fi, both wireless paths can affect results.

Floorplans and measurements remain in the current browser page. There is no automatic persistent storage or synchronization. **Save JSON before closing the page.** Import validates the entire document and asks for confirmation before replacement; invalid files leave existing data intact. Changing the floorplan clears points and measurements after confirmation.

The complete dataset, including the image and raw samples, is limited to 12 MiB of compact UTF-8 JSON. Export uses that same representation without removing data. The byte limit may be reached before a count limit; rejected additions/edits preserve existing records. Save the current JSON before starting a new plan. Imported files themselves must also fit 12 MiB.

## Trusted LAN only

The host uses a fresh per-launch token, Host and Origin checks, no permissive CORS, bounded request sizes, socket deadlines, and a request-thread limit. It rejects concurrent runs. If cancellation cannot release a run, its lease expires at most 120 seconds after its last request. The host only serves an explicit asset allowlist and test endpoints; it never saves uploaded test data.

**HTTP traffic is unencrypted. The join URL contains a token; share it only with trusted people. Do not expose this server to the internet or enable router port forwarding.** Python's standard HTTP server is intended here for a trusted local alpha tool. No CDN, analytics, remote fonts or external speed-test endpoints are used.

CSV quotes fields and neutralizes formula-leading text, but spreadsheet interpretation and save/reopen behaviour differ. Use JSON for a complete, lossless exchange of data.

## Verification

Verified on macOS: real HTTP authentication/limits/exact bytes/truncation, Node measurement and dataset tests, and PC browser measurements, condition comparison, valid/invalid imports and a mobile-size viewport. **Physical phones, actual Wi-Fi/LAN measurements, Windows, and mobile browser devices are not yet verified.** Automated browser download-event capture for JSON/CSV remains unconfirmed; generation logic tests pass. See [validation](docs/VALIDATION.md).

```sh
python -m pip install -e .
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python -m pip install build
python -m build
```

Use Node.js 22+ for JavaScript tests. HTTP tests bind temporary loopback ports. See [design](docs/DESIGN.md), [publishing](docs/PUBLISHING.md) and [handoff](docs/HANDOFF.md).
