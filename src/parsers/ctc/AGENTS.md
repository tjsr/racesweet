# CTC/Data-1 Parser Notes

## npm verification and private dependencies

Follow the [shared TJSR policy][tjsr-npm-policy]. These essentials apply even when
the shared document cannot be fetched and qualify any install/test recipes below.

- Run safe local checks with existing access. If private dependencies need
  unavailable credentials, skip installation and dependent checks. After a
  401/403 authentication failure, stop retrying `npm ci` or `npm install` until
  access changes. Record an environment blocker, not a code failure.
- Do not ask for, copy, print, or provision tokens. An agent already running
  in authenticated Actions may use its configured job credentials.
  For now, assume local Codex on `tjsr-3700x` and GitHub-launched Codex agents
  lack private-package access unless explicitly configured otherwise; a GitHub
  launch alone does not establish Actions job authentication.
- Never stub private packages, invent dependency contents, use `--force` or
  `--legacy-peer-deps` to bypass resolution, disable checks, or fake success.
- Before pushing, inspect push/PR workflows and called actions for unintended
  package/image publishing, releases, or deployments. If unsafe, retain a local
  commit/patch and report the required gating change.
- When safe, commit and push authorized changes to a task/PR branch and open or
  update a draft PR. Verify through configured GitHub Actions using existing
  package grants; ordinary branches do not require Copilot delegation.
- Monitor the exact latest pushed SHA to a terminal result, inspect failed logs,
  and fix recoverable issues within scope. Report passed, failed, and unrun local
  and CI checks separately with head SHA and PR/run links. Missing workflows,
  package grants, job permissions, approvals, or Dependabot/fork secret access
  remain blockers; an older green run is insufficient.
- For new verification work, use Node 24 primarily, Node 22 where supported,
  and latest npm compatible with the declared engine floor. Check the actual
  supported matrix; this does not authorize CI/runtime/dependency changes.
- No direct-main push, approval/merge/auto-merge, release, deployment, settings
  change, or token provisioning is implied. Prior release authorization is not
  standing permission. If separately authorized to merge a repaired multi-commit
  Dependabot PR, prefer squash; a single-commit PR may use rebase.

[tjsr-npm-policy]: https://github.com/tjsr/tjsr/blob/251fd1d0606a6ce7e0c994190bbe8f318028fb9e/agent-policies/npm-ci-verification.md

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
- If a session SRT file is missing, a previous numbered session file may contain the target session's raw segment. Choose the segment whose derived `40` start-of-race time is closest to the target session's programme start; do not blindly use a segment by ordinal index when visible times are available.
- If a direct session SRT file also contains earlier-session rows before the target session's `40` start marker, exclude those pre-start rows from the target session import.
- Imported raw crossing `antenna` text should be derived from the raw line/loop fields.

## Parser Scope

- `rawCrossing.ts` parses confirmed CTC/Data-1 raw crossing text records.
- Callers should decide whether a file is confirmed raw crossing data before bypassing DBF parsing.
- MR-SCATS imports may consume this parser for CTC/Data-1 timing sidecar files found in RaceTime/MR-SCATS event folders.
