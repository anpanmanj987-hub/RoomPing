# RoomPing design

Version: 0.1.0a2. A standalone Python package with bundled static assets and no dependency on sibling projects.

## Architecture

`server.py` serves a fixed static allowlist and bounded test endpoints. It does not accept floorplans or measurement records. `__main__.py` owns explicit IPv4 binding and the private join URL. QR generation uses the installed `qrcode` package and produces SVG locally.

`metrics.mjs` owns calculations, strict schema validation, comparison and CSV generation. `measurement.mjs` owns the sequential HTTP run and timers. `app.js` owns the Japanese browser interface, floorplan image decoding, point selection, conditions and file exchange. Files stay in browser memory until exported; there is no database, storage backend, telemetry, CDN, service worker, or synthetic/demo measurement mode.

## Measurement contract

Warm up once, measure seven small HTTP round trips, download one or three binary bodies, then upload one or three bounded Blob bodies. Use `performance.now()` immediately before each fetch and after consuming its complete response. The download reader sums `Uint8Array.byteLength` through end-of-body and checks the expected length. The host acknowledges upload bytes only after reading the declared complete body. Payload generation occurs outside timed transfers.

`Mbps = totalBytes × 8 / totalDurationMs / 1000`. This is decimal megabits per second; transfer options are binary MiB. Aggregate transfers by total bytes / total elapsed time, rather than averaging per-request rates. Latency is the median of raw positive finite millisecond samples. Calendar timestamps use UTC ISO strings separately.

The values include application/HTTP/TCP/PC and network overhead, including connection establishment. They do not isolate the phone's Wi-Fi signal or internet connection. PC Ethernet is recommended. The server returns `no-store`, exact content lengths, and uncompressed binary; requests also use `cache: no-store` and unique query values. Uploads use known-size Blob bodies compatible with HTTP/1.x, not streamed request bodies.

The client retains fetch's default CORS request mode while calling only fixed same-host paths. Under the page's `no-referrer` policy, non-CORS POST requests can serialize Origin as `null`; default CORS mode preserves the actual Origin required by the server. This does not grant cross-origin access: the server continues to reject other origins and emits no CORS allow headers.

One request is limited to 16 MiB and 15 seconds; the browser limits a run to 120 seconds. Uploads are discarded in 64 KiB chunks. The server generates a fixed random 64 KiB block outside measurement timing and repeats it for downloads. Client payload buffers are reusable and bounded. The browser never overlaps test traffic. Cancelling, hiding the page or failing a validation discards the entire new measurement; previous completed records remain.

Upload reads use buffered `read1`, returning after available progress so the handler checks an absolute monotonic deadline between reads. Each socket timeout is the smaller of the idle limit and time remaining. A final elapsed-time check precedes acknowledgement, including for a complete last chunk. Slow continuous progress cannot extend the total read deadline.

## Concurrency and security

Default binding is 127.0.0.1:8767. Wildcard binding requires a supplied advertised IPv4. A per-launch `secrets.token_urlsafe(32)` token is included in the join URL fragment and sent in `X-RoomPing-Token`; request logging is disabled. QR and info routes require the token. The page itself may be viewed without a token, but measurement remains unavailable.

Host must exactly match an allowed address and port. POST API requests must also have an exact same-origin Origin. Multiple sensitive headers, unknown transfer encoding, invalid lengths and excessive payloads are rejected. There is no permissive CORS. Fixed static paths prevent arbitrary filesystem serving. A global run lease rejects a second run; a nonblocking transfer lock rejects overlapping transfer requests, including requests with the same run ID. Idle run leases expire after 120 seconds. At most sixteen request workers are active.

Run start, run end and transfer admission share the state lock. Ending a run validates ownership and clears it in one critical section. Transfer admission validates current ownership and acquires the nonblocking transfer slot before releasing the state lock. A delayed old request cannot erase a new lease or reserve a transfer against a changed owner. Response delivery occurs outside this state lock.

This is an unencrypted trusted-LAN alpha server using Python `http.server`, not a production internet service. A token is not encryption and cannot protect against an observer on an untrusted network. Browser API controls and request limits are not a substitute for network isolation.

## Version 1 document

Top-level keys: `version`, `floorplan`, `points`, `conditions`, `measurements`.

- Floorplan: name, optional PNG/JPEG/WebP data URL, integer width/height.
- Points: ID, text label and normalized finite x/y coordinates in `[0,1]`.
- Conditions: ID, name and notes.
- Measurements: ID, point/condition references, UTC timestamp, raw latency list, download/upload `{bytes,durationMs}` lists, browser user-agent description and `mode: "measured"`.

Limits: 500 points, 50 conditions, 5,000 records, 20 samples per list, 80-character labels, 1,000-character notes, 5 MiB image, 8,192 pixels per dimension, 16 million pixels, 12 MiB imported JSON. The combined dataset must also fit 12 MiB when serialized as compact UTF-8 JSON, including the image and all raw samples. Whichever limit is reached first applies. `validateDataset` enforces this combined boundary before any state assignment; `toJSON` uses the same compact representation without truncation. A rejected append/edit/import retains the prior complete dataset and reports the error. Unknown/missing fields, duplicate IDs, missing references, nonfinite/coerced numbers and invalid sample bounds are rejected. Image data URLs are restricted and signature-checked; the browser additionally decodes and checks actual dimensions before import confirmation. The entire import is validated before it can replace state. All imported labels render via `textContent`.

A point remains the same explicit ID when selected under another condition. Comparison uses the latest recorded result under each selected condition. Neither inferred matching nor spatial interpolation occurs. Changing floorplan clears positions and results only after explicit confirmation.

CSV exports a quoted, escaped record table and neutralizes formula-leading text. JSON is the lossless exchange format; CSV intentionally alters potentially executable text for spreadsheet viewing.

Browser natural-size limits are checked after image decoding. The compressed byte cap does not bound the decoder's peak memory before that check; this has not been profiled on physical devices.

## Primary references

- [MDN Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch): fetch headers and response-body consumption.
- [Chrome request streaming](https://developer.chrome.com/docs/capabilities/web-apis/fetch-streaming-requests): HTTP/1.x limitations.
- [W3C High Resolution Time](https://www.w3.org/TR/hr-time-3/): monotonic measurement clocks.
- [Fetch Origin-header algorithm](https://fetch.spec.whatwg.org/#append-a-request-origin-header): request mode and no-referrer interaction.
- [Python buffered I/O](https://docs.python.org/3/library/io.html#io.BufferedReader.read1): partial progress rather than multi-receive reads.
- [Python http.server](https://docs.python.org/3/library/http.server.html): server behaviour and security scope.
- [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS): cross-origin request limitations.
- [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection): spreadsheet formula risks and interoperability limits.
