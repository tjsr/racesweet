---
name: apical-excel-import
description: Use when changing RaceSweet Apical Excel import, download, spreadsheet conversion, Laps sheet handling, or Apical race-state parsing.
---

# Apical Excel Import

Use this checklist when touching Apical Excel import paths.

- Preserve the Laps sheet `TimeOfDay` value from spreadsheet row to Apical lap view model to crossing record.
- Build crossing timestamps from the session/event date plus `TimeOfDay` in the event timezone when the imported value has no explicit timezone.
- Do not use `LapTimeSpan` or `CumulativeLapTimeSpan` as crossing timestamps; they are lap and elapsed durations.
- Keep Apical sheet column changes covered by parser/import tests and any affected app integration fixture helpers.
