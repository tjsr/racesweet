# CTC/Data-1 Parser Notes

Use this file for durable knowledge about CTC/Data-1 raw crossing files and parser behavior.

## Raw Crossing Files

- `.SRT`, `.SRF`, `.ERF`, `.AT1`, and `.AT2` can contain raw crossing data. Treat confirmed raw crossing files as plain-text records, not dBase tables.
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
- Per-session raw crossing files whose basename matches a loaded session code should be imported as crossings when the parser confirms they are raw text data.
- Imported raw crossing `antenna` text should be derived from the raw line/loop fields.

## Parser Scope

- `rawCrossing.ts` parses confirmed CTC/Data-1 raw crossing text records.
- Callers should decide whether a file is confirmed raw crossing data before bypassing DBF parsing.
- MR-SCATS imports may consume this parser for CTC/Data-1 timing sidecar files found in RaceTime/MR-SCATS event folders.
