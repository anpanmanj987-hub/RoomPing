# RoomPing implementation record

Plan: `docs/superpowers/plans/2026-10-03-roomping-plan.md`.

Scope: only `roomping/**`; git and external projects are controlled by the parent task.

Ruling: follow the assigned single-implementer boundary; no nested agents or git workspace scripts. Review and git integration belong to the parent.

Pre-flight: no shared project interfaces.

Task 1: implementation complete; verification and distribution integration performed by parent.

## Changes

- Standalone src-layout Python package, version 0.1.0a1, local qrcode dependency and fixed bundled static asset allowlist.
- Default loopback 8767, explicit LAN bind/advertised IPv4, per-launch fragment token and header authentication, exact Host and POST Origin validation.
- Bounded 16 MiB transfer endpoint, random binary block prepared outside timing, no cache/compression, upload bytes discarded in chunks, exact acknowledgement, socket/total request limits and capped workers.
- Global run lease and nonblocking transfer lock enforce one measurement at a time; failed/disconnected release expires after 120 seconds.
- Japanese mobile UI, image/blank floorplan, normalized exact point markers, existing-point reuse, condition notes, before/after latest-result comparison.
- Sequential browser warmup/latency/download/upload using performance.now through full body or complete acknowledgement, reusable bounded Blob upload, timeout/cancel/hidden-page abort and no partial completed records.
- Strict versioned transactional JSON validation/confirm-replacement, finite values, IDs/references/counts/text/image checks and actual browser image decoding; textContent rendering; escaped and formula-neutralized CSV.
- Japanese/English README, MIT, independent GitHub CI and design/validation/publishing/handoff documents.

## RED/GREEN evidence

Initial tests were written before production code. First Python run exited 1: the availability assertion failed because RoomPing had not been implemented; fourteen HTTP behaviours were skipped pending the module. First Node run exited 1: ten metrics tests failed their explicit module-availability assertion.

After metrics implementation, the second Node run passed ten existing tests and failed five new MeasurementClient availability tests plus the new declared-image/binary-signature test. The signature fixture was valid base64 `YWJj` declared as PNG; rejection was missing. Signature checks and the measurement client were implemented after observing this RED run.

The first real-socket runs in the restricted worker sandbox could not bind loopback (`EPERM`). No code workaround was made. Parent independently ran the actual commands with socket permission and reported **Python 15/15, Node 16/16, no skipped tests**:

```sh
PYTHONPATH=src python -m unittest discover -s tests -v
node --test tests/metrics.test.mjs tests/measurement.test.mjs
```

The parent also independently exercised actual browser measurements, same-point two-condition comparison, hand-derived valid JSON import, invalid-version retention and mobile-width layout. Observed fixture results: 3.0 ms / 32 Mbps / 8 Mbps. See VALIDATION.md for coverage and limitations.

After completing the documents, the worker reran `python -m compileall -q src tests` (exit 0) and `node --test tests/metrics.test.mjs` (**11/11 pass, zero skips**). These checks require no listening sockets. Complete real-socket coverage is from the independent parent run above.

## Rulings

- No nested agents or git worktree/ledger scripts: assigned directory-only boundary overrides those orchestration steps. Parent owns git and independent review. Cost if wrong: parent review must cover integration.
- A server-wide run lease plus transfer lock implements concurrency protection rather than a browser-only lock. A disconnected client may reserve the run until a 120-second lease expires; UI errors remain explicit.
- Persist records only via explicit JSON export, not browser storage. This matches the approved browser-local exchange scope; users must save before closing.
- No demo data or synthetic fallback is shipped. Offline/missing-token state permits imported result viewing but cannot measure.

## Verification limits

Python/Node loops and Mac browser UI checks are not physical phone/LAN radio validation. Windows, Android/iPhone browsers and native JSON/CSV download handling remain unverified. IAB download-event capture timed out despite no reported console errors; CSV/JSON generation logic tests passed. Build/fresh-install verification belongs to the parent and should be reported from its actual output. No git, external project or release was created by this worker.

## Independent review fix round 1

Reviewed `docs/reviews/3projects-code-review.md`, checked current call sites and the official Fetch Origin-header algorithm / Python buffered-I/O contract. The findings concern existing measurement/security behaviour, so the original UI and dataset scope were retained.

1. Fetch mode: `same-origin` with `no-referrer` can emit `Origin: null` on POST. A standards-boundary fixture exercising a complete MeasurementClient run failed with HTTP 403. Removed the explicit mode to preserve default CORS mode; production routes remain fixed same-host paths and the server continues exact Origin validation without CORS allow headers. Fixture GREEN.
2. Upload deadline: buffered `read` could accumulate many socket receives without returning to the absolute-deadline loop. The real BufferedReader trickle regression and delayed-complete-last-chunk regression both returned 200 instead of expected 408 before the fix. Changed to `read1`, reset idle timeout to remaining absolute duration each iteration, and check elapsed time after reads and before acknowledgement. Both GREEN, with transfer-slot release and a successful follow-up upload checked.
3. Ownership transitions: separate validation and state mutation/admission allowed stale run traffic after ownership changed. Real Handler barrier tests demonstrated a stale end clearing a new run and upload/download admitting an old transfer before a new owner could start. Make end ownership-check/clear and transfer ownership-check/nonblocking-slot-acquisition atomic under the same state lock. Move response writing outside state critical sections. All three GREEN.

Observed RED commands (exit 1):

```sh
PYTHONPATH=src python -m unittest discover -s tests -p test_regressions.py -v
node --test tests/origin.test.mjs
```

Python **5/5 failed for the intended assertions**; Node **1/1 failed with HTTP 403**. After the fixes, the same Python regression command passed **5/5**, and `node --test tests/origin.test.mjs tests/metrics.test.mjs` passed **12/12**, zero skips. No listening sockets or additional escalation were needed for these deterministic regressions.

Current full-suite inventory: **Python 20, JavaScript 17**. CI and published test instructions use `node --test tests/*.test.mjs` to include the new Origin fixture. The parent performs the complete real-HTTP suite, fresh browser POST verification, build and isolated install after this round. The worker has not claimed a post-fix full-socket result before that evidence arrives.
