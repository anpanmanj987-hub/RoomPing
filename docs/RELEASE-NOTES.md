# Roomping 0.1.0a2 release notes

MIT-licensed alpha source release. See README and VALIDATION.md for operating assumptions and evidence.

- Fix: JSON export uses compact, lossless UTF-8 JSON through toJSON, sharing the 12 MiB combined-dataset limit with validation and import.
- Validation includes the image and every raw sample in the combined byte count. A refused measurement append/edit retains the complete prior dataset; UI edits report the refusal.
- Six added tests exercise a 5,000-record/20-sample lossless round-trip, UTF-8 byte overflow, append-at-capacity retention and the real export/edit handlers on a minimal Node DOM fixture. Successful edits clear prior capacity errors. Counts and byte limits apply together.

Physical Windows, phones and LAN remain unverified. Do not describe fixture tests, demo or dry-run as native hardware success. RoomPing native browser JSON/CSV saving remains unconfirmed. GitHub publication is a separate owner action.
