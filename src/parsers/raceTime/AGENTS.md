# RaceTime Data Agent Notes

Use this file for durable knowledge about RaceTime, MR-SCATS, and related timing data files. Keep it concise and update it whenever a parser change proves a new file structure fact.

## Data Access

- Sample data and events referenced by users can usually be found under:
  - `C:\Users\tim\OneDrive\RaceTime`
  - `C:\Users\tim\OneDrive\timing`
- This data is allowed to be used for read-only debugging and feature-fixing.
- Do not write to, rename, delete, unpack over, or otherwise modify these source data directories.
- If a directory code looks like `A0099`, presume it is motorsports timing data unless the user says otherwise.

## Source Locations

- Known MR-SCATS/Clipper source candidates:
  - `C:\Users\tim\OneDrive\RaceTime\Dev\NEWTIME`
  - `C:\Users\tim\OneDrive\RaceTime\Dev\MR-SCATS Original files\MRSCATS - Clipper`
- Do not broadly scan other `C:\Users\tim\OneDrive\RaceTime\Dev` folders unless stuck; there are many untracked versions.
- Avoid processing `C:\Users\tim\OneDrive\RaceTime\Racetime Source Code - 2003 backup.zip` unless necessary.
- Known RaceTime data roots include `timing-data`, `timing-data-arj`, `timing\Data Files`, and `Racetime_Data`.

## Meeting Directory Patterns

- Meeting folders can contain global tables plus per-session file groups.
- Sample directory inspected: `C:\Users\tim\OneDrive\RaceTime\timing-data\W9721`.
- Per-session names often follow patterns like `W9721Q01`, `W9721R10`, or `A0099S00`.
  - The leading code is the meeting code.
  - The letter often identifies the session type, for example `Q`, `R`, `S`, or `G`.
  - The final two digits are usually the session number.
- Session crossing DBFs named like `X0099S00.DBF`, `W9721R10.DBF`, or similar store `ELAPSED` as 10,000ths of a second from the session start, plus transmitter/car identity fields.
- The actual session start time can usually be derived by matching the session file basename to `PRGMME.EV_CODE` and using `PRGMME.STARTDATE` plus `ACTUALSTRT` when present, falling back to `STARTTIME`.

## Global Tables

- Programme tables can be named `PRGMME`, `PROG`, `PRG`, `PROGRAM`, `PROGRAMME`, or `PRG1`.
- Driver tables can be named `DRIVERS`, `DRIVER`, or `DRIVE`.
- `S0101` has been observed with `DRIVE.DBF`, `DRIVERS.TXT`, and `DRIVERS.DAT` instead of `DRIVERS.DBF`.
- Treat `DRIVE.DBF` as a driver-table alias.
- Core table source resolution should prefer `.DBF` and can fall back to DBF-compatible `.DAT` files.
- If a candidate does not parse as DBF, continue to the next likely source.
- `.TXT` driver files are related sidecars, but their import schema is not confirmed.

## DBF Notes

- Files use dBase/FoxPro-style headers. Some files with non-`.DBF` extensions still have DBF headers.
- Header bytes:
  - byte `0`: DBF version.
  - bytes `4..7`: little-endian record count.
  - bytes `8..9`: little-endian header length.
  - bytes `10..11`: little-endian record length.
  - field descriptors start at byte `32`, are 32 bytes each, and end at `0x0d`.
- `DRIVERS.DBF` sample fields include `DRIV_CODE`, `CARNUMBER`, `SCRN_NUMB`, `TXNUM` through `TXNUM8`, `DRIV_CLASS`, `ENTRANT`, `DRIVER`, `DRIVER_2`, `DRIVER_3`, `DRIVER_4`, `SCRN_NAME`, `STATE`, `CAR_MAKE`, `ENGINE`, and `COLOUR`.
- `PRGMME.DBF` sample fields include `EV_CODE`, `CATEGORY`, `EVENTNAME`, `DRIVER_FIL`, `STARTTIME`, `STARTDATE`, `NBRLAPS`, `ACTUALSTRT`, `EVENTTYPE`, `RACE_NOTE`, print/issue fields, and weather/temperature fields.
- `PRGMME.CATEGORY` and `DRIVERS.DRIV_CODE` define imported categories.
- `DRIVERS.DRIV_CLASS` is a fallback only when `DRIV_CODE` is blank.
- `PRGMME.EV_CODE`, `EVENTNAME`, `STARTDATE`, `ACTUALSTRT` or `STARTTIME`, and `EVENTTYPE` define imported sessions.
- `EVENTTYPE` maps `R` to race, `Q` to qualifying, `S` to practice, and unknown values to other.
- `DRIVERS.CARNUMBER` becomes the entrant plate number and race plate identifier.
- `DRIVERS.TXNUM` through `TXNUM8` become transponder identifiers.
- `DRIVERS.DRIVER`, `DRIVER_2`, `DRIVER_3`, and `DRIVER_4` become participant names sharing the same entrant/car.
- Memo fields use DBF field type `M`; the DBF record stores a 10-character block pointer into a same-basename `.DBT` file.
- Observed `.DBT` files use 512-byte blocks. Block `0` is the memo header; block pointers start at `1`. Memo content can end with `0x1a`, and unused bytes after the memo text should be trimmed from previews.

## Session Companion Files

- Common per-session companions:
  - `.DBF`: lap/crossing records with fields such as `CARNUMBER`, `TXNUM`, `ELAPSED`, `SYNCMARK`, `PIT`, and `FLAG`.
  - `.RSN`: reason records; sample fields include `REASON` and `ON_LAP`.
  - `.PIT`: pit records; sample fields include `CARNUMBER`, `DRIVER`, `COUNTER`, `ELAPSED`, `LAP_COUNT`, and `LEADER_LAP`.
  - `.LDR`: leader/laps-led records; sample fields include `CARNUMBER`, `DRIVER`, `LAPS_LEAD`, `LAP_FROM`, and `LAP_TO`.
  - `.CTN`: continuity records; sample fields include `STARTTIME`, `ENDTIME`, `LAPS_LEAD`, `LAP_FROM`, and `LAP_TO`.
  - `.NO1`: report-style DBF observed for some race sessions; sample fields include `CAR`, `TXNUM`, `LAP_COUNT`, `LAP_TIME`, `ENTRYTIME`, `LINE_NO`, `LANE_NO`, `ELAPSED`, `SYNCMARK`, `FLAG`, `STARTFIN`, and `FAST_LAP`.
  - For `.NO*` report/crossing files, `ELAPSED` may represent a time-of-day tick value rather than a session-relative crossing offset. When it is close to the scheduled session clock, anchor it to the event date as time-of-day.
- `.NTX` files are Clipper index files. Headers include a readable key expression, for example `ELAPSED`, `CARNUMBER`, `Ev_Code`, `dtos(StartDate)+StartTime+Ev_Code`, `str(Carnumber)+Driv_Code`, `upper(Driver)`, or `txnum`.
- `.AT1`, `.AT2`, `.FST`, `.NT1`, `.NTT`, and `.TTX` have been observed as Clipper index files created by timing/session sources, despite not using the `.NTX` extension.
- Known related DBF mappings:
  - session indexes such as `W9721R10.NTX`, `.AT1`, `.AT2`, `.NT1`, `.NTT`, and `.TTX` generally relate to the same basename `.DBF`.
  - `.FST` fastest-lap indexes relate to the same basename `.NO1` when present, otherwise the same basename `.DBF`.
  - `PRGMME.NTX`, `PRGMME1.NTX`, and `PRG1.NTX` relate to `PRGMME.DBF`.
  - `DRIVERS.NTX`, `DRIVER1.NTX`, `DRIVER2.NTX`, `DRIVER3.NTX`, and `DRIVTEMP.NTX` relate to `DRIVERS.DBF`.

## CTC/Data-1 Raw Crossing Files

- CTC/Data-1 `.SRT`, `.SRF`, `.ERF`, `.AT1`, and `.AT2` raw crossing parser notes live in `src/parsers/ctc/AGENTS.md`.

## Crossing Import Rules

- Catalog import reads crossing rows from DBF files whose basename matches a `PRGMME.EV_CODE` session.
- Imported crossing IDs should be deterministic from meeting code, session code, file basename, row/counter, transmitter, plate, and elapsed value so repeated imports replace the same records instead of creating new identities.
- Crossing `TXNUM` or equivalent transmitter values of `0` mean no usable transmitter read. When a car number is present, import the row as a manual plate crossing with `plateNumber` only so participant matching uses the race plate rather than a bogus chip code.
- If a positive crossing transmitter value exactly equals the car number and that car number exists in the imported driver table, treat it as a plate crossing unless the same participant also has that transmitter assigned in the driver table.
- Imported participant transmitter identifiers should be numeric `txNo` values when the source field is numeric. Chip crossing matching uses strict equality against numeric `chipCode` values.
- A system-generated green flag is added per imported session when crossings exist.
- The flag time is the programme `ACTUALSTRT` or `STARTTIME`.
- Crossing absolute times are calculated from `ELAPSED / 10000`; if a future table exposes a green/start elapsed offset in fields such as `STARTELAP` or `GREENELAPS`, subtract that offset so pre-green crossings remain before the generated green flag. Without such a field, elapsed zero is treated as the programme start time.
- `.NO*` sidecar files can describe non-start/finish timing lines and should not provide the session green/start elapsed offset.
- Event, session, category, entrant, and participant IDs are deterministic UUIDs generated from `mr-scats:<meeting-code>:...` source strings for MR-SCATS imports.

## TRACK.CFG Notes

- `TRACK.CFG` describes timing line/device configuration.
- Rows starting with `A`, `M`, `E`, or `T` define a line/event source:
  - `A`: automatic timing line.
  - `M`: manual device, for example a mouse/button press.
  - `E`: track event from equipment such as a control box, lights, or light beam.
  - `T`: test events.
- The site address identifies the box number, card number, and serial/COM port used to read a crossing.
- Values such as `1,1` or `1,9` indicate line number `1` and loop number `1` or `9`.
- `Br` is the baud rate.
- `CF` is the minimum confidence factor before a read is accepted. For example, `10` is the signal-strength threshold and `2` means two reads are required per crossing.
- Each antenna crossing is expected to produce four reads from a bipolar two-peak wave: rise/fall at the lead of the antenna pole, then rise/fall at the tail.
- `E` records define buttons; their numeric values usually have descriptions near the bottom of the file.

## Parser Scope

- First parser stage lists file inventory:
  - list files from a selected directory recursively.
  - list entries from `.zip` archives using the ZIP central directory.
  - list entries from `.arj` archives with a conservative header scanner.
  - classify extensions and derive meeting/session metadata from names.
  - parse DBF field summaries for directory files.
- Event catalog import currently supports directories and `.zip` archives.
- `.arj` files are still inventory-only until extraction support is added.
- Imported RaceTime/MR-SCATS data is written through `EventCatalogService.importMrScatsCatalog`, which appends ledger mutations and imports one category-filtered race state per session.

## File Preview Behavior

- DBF-compatible files are decoded into field columns and record rows.
- DBF field names should be cleaned of embedded control/null bytes so headings such as `CAR` do not render with hidden suffix bytes.
- DBF previews with an `ELAPSED` field should add a derived `Time of day` column before `ELAPSED` when a matching `PRGMME.DBF` row provides the session start. Calculation is `ACTUALSTRT` or `STARTTIME` plus `ELAPSED / 10000` seconds.
- Clipper index files are previewed by extracting the key expression from the header and, where possible, showing records from the related DBF table in index-key order.
- `.DBT` memo files are previewed as block-number plus memo text rows and should mention the likely linked same-basename `.DBF` table when present.
- DBF previews resolve `M` memo fields from a linked same-basename `.DBT` file where available; without the DBT, show a warning that the DBF value is only an external memo pointer.
- Unknown/non-core extensions are attempted as DBF-compatible tables first because MR-SCATS uses several DBF-format files with non-DBF extensions, such as report/fastest-lap style files.
- Unrecognised MR-SCATS bundle files should be treated as DBF-compatible tables in inventory and preview by default; `X0099A01.CAR` is a confirmed car-details example.
- Confirmed CTC/Data-1 raw crossing files bypass DBF parsing and are previewed as plain text rows with line number and raw crossing data. See `src/parsers/ctc/AGENTS.md` for the raw file format.
- If DBF parsing fails, preview falls back to a binary hex/text table with a warning.
