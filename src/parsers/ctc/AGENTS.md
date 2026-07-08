# CTC/Data-1 Parser Notes

Use this file for durable knowledge about CTC/Data-1 raw crossing files and parser behavior.

## Raw Crossing Files

- `.SRT`, `.SRF`, and `.ERF` can contain raw crossing data. Treat confirmed raw crossing files as plain-text records, not dBase tables.
- In MR-SCATS sources, `.AT1` and `.AT2` are dBase-compatible tables with non-standard extensions, not raw text crossing files.
- Split raw records on carriage-return style line breaks (`\r` or `\r\n`).
- Raw records are mostly numeric character strings.
- Raw CTC/SRT/SRF/ERF crossing lines use the compact timing layout from `ELECTRON.CH`:
  - positions `1-2`: DRT code.
  - positions `3-16`: 14-digit time tick value.
  - positions `17-20`: TX8000 transmitter/car field.
  - positions `21-22`: line number.
  - positions `23-24`: lane/loop number.
  - positions `25-27`: confidence.
  - positions `28-30`: status.
- Normal electronic crossing records commonly use DRT code `04`.
- Short 16-character control records also occur in SRT files:
  - `40...`: start-of-race marker.
  - `4D...`: yellow/caution start.
  - `4E...`: end of caution / green-resume marker.
  - `E1...`: event/control marker; preserve for preview even if not yet imported as a flag.
- When visible-time SRT rows are present, treat them as authoritative and derive the compact/control-row time-of-day from the same absolute-tick offset.
- Per-session raw crossing files whose basename matches a loaded session code should be imported as crossings when the parser confirms they are raw text data.
- If a session SRT file is missing, look for the same extension on the previous numbered session and use the next `40` start-of-race segment. Example: if `T9743R10.SRT` is missing, use the second `40`-delimited segment inside `T9743R09.SRT`.
- Imported raw crossing `antenna` text should be derived from the raw line/loop fields.

## Parser Scope

- `rawCrossing.ts` parses confirmed CTC/Data-1 raw crossing text records.
- Callers should decide whether a file is confirmed raw crossing data before bypassing DBF parsing.
- MR-SCATS imports may consume this parser for CTC/Data-1 timing sidecar files found in RaceTime/MR-SCATS event folders.
