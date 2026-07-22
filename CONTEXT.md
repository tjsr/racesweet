# RaceSweet business context

## Event

**Definition:** A calendar-bound competition scope (meeting/day/round) that owns sessions, categories, entrants, and participants.
**Aliases:** race event, meeting, event weekend
**Architecture:** `EventCatalogEvent` links `sessionIds`, `entrantIds`, and `categoryIds` under one `id`.

## Race

**Definition:** A competition session type used as the primary scored session in an event; often the main results driver.
**Aliases:** race session, session kind `race`, main race
**Architecture:** There is no separate top-level `Race` object; represented by an `EventCatalogSession` with `kind: 'race'` plus runtime `Session` calculations.

## Session

**Definition:** A timed phase of an event where timing records are collected and results are computed from category/session rules.
**Aliases:** timed session, practice/qualifying/race session, active session
**Architecture:** Two linked layers: catalog metadata (`EventCatalogSession`) and runtime state (`Session`), which holds `records`, `participants`, `categories`, `entries`, and `teams`.

## Qualifying

**Definition:** A pre-race timed phase used to determine starter order and baseline performance inputs.
**Aliases:** qualifying session, qual
**Architecture:** Implemented as `EventCatalogSession.kind === 'qualifying'`.

## Practice

**Definition:** A non-scoring preparation session used for setup and confidence-building before competitive sessions.
**Aliases:** practice session, practice run
**Architecture:** Implemented as `EventCatalogSession.kind === 'practice'` and processed through normal session timing logic.

## Grid

**Definition:** Starting-order assignment for entrants (often seed/position order used to place participants at launch).
**Aliases:** start order, grid position, seed
**Architecture:** Stored as `startOrder` on `EventCatalogEntrant` / `EventCatalogEntry`; can be inferred from qualifying performance in import flows.

## Entrant

**Definition:** The competition unit/entity that owns participant entries and appears in competition grouping and results ownership.
**Aliases:** competitor, entrant record, competition unit
**Architecture:** `EventCatalogEntrant` contains identity fields, `sessionIds`, `categoryIds`, and `memberParticipantIds`.

## Entry

**Definition:** A concrete registered competition entry linked to an entrant and one or more participants for results inclusion.
**Aliases:** event entry, registration entry
**Architecture:** `EventEntry` contains `participantIds`, optional `categoryId`, `entrantId`, and `raceNumber`.

## Team

**Definition:** A special entrant type representing multiple participants acting together.
**Aliases:** team entrant, motorsport team
**Architecture:** `EventTeam` extends entrant identity with `name`, `description`, and `members` as `EventParticipantId[]`.

## Participant

**Definition:** The person-level record with display identity, identifiers, and optional category ownership for session/entry scoring.
**Aliases:** rider, driver, competitor
**Architecture:** `EventParticipant` stores `firstname`, `surname`, `entrantId`, optional `entryId`, `categoryId`, and identifier history.

## Rider

**Definition:** Discipline-specific participant naming for cycling-focused contexts.
**Aliases:** rider, competitor, cyclist
**Architecture:** Same `EventParticipant` object; terminology is mapped from event discipline configuration.

## Driver

**Definition:** Discipline-specific participant naming for motorsport-focused contexts.
**Aliases:** driver, competitor
**Architecture:** Same `EventParticipant` object; terminology is mapped from event discipline configuration.

## Line

**Definition:** A numbered track crossing point configured for timing and result interpretation. A line consists of one or more loops perpendicular to the track direction.
**Aliases:** timing line, time line, line number
**Architecture:** Exposed as `lineNumber` on crossing records and track config via `EventTrackTimingLine`.

## Loop

**Definition:** A numbered loop/channel under a track line, commonly tied to receiver hardware addressing. Most hardware systems will use a single loop per line, however some more advanced systems, such as DATA-1, use smaller physical loops to construct a single logical line.
**Aliases:** loop number, timing loop
**Architecture:** Stored on `CtcTrackConfigLoop` and surfaced as `loopNumber` on crossing records.

## Decoder

**Definition:** The parsing/decoding layer that converts raw timing input into normalized crossings, flags, and timestamped records.
**Aliases:** parser decoder, protocol decoder, timing decoder
**Architecture:** Implemented in parser and import modules such as `rawCrossing.ts`, `genericLineMatcher.ts`, and `chipCrossing.ts` normalizers.

## TSR (Track-Side Receiver)

**Definition:** Track-side radio/timing receiver source concept used in race data acquisition. This controls a number of loops in a DATA-1 system.
**Aliases:** TSR, trackside receiver, receiver
**Architecture:** No explicit dedicated `TSR` model; represented through timing source configuration and incoming timing feed records.

## Timing Device

**Definition:** Configured source endpoint that provides timing input to the application.
**Aliases:** timing source, receiver source, timing hardware
**Architecture:** `TimingDevice` holds `ipAddress`, `port`, `location`, and identity used for active source handling.

## Transmitter

**Definition:** An active, always-on timing device mounted to a vehicle with an identity  Hardware/source identifier token carried in some feeds and historically equivalent to transmit identity in timing records.
**Aliases:** tx, tx number
**Architecture:** Decoded as `txNumber` in `TransmitterCrossingData`; handled by `getTransmitterIdentifier` and related helpers.

## Transponder

**Definition:** An active timing device fitted to a vehicle or participatant activated by a TSR which replies with an identity.  Electronic identity assigned to participants and used for matching feed events to entrants.
**Aliases:** transponder ID, txNo
**Architecture:** Stored as participant identifier `txNo` and accessed through transponder helper lookups.

## Chip

**Definition:** A passive transponder that responds with a transponder code read during a crossing, typically from timing hardware, before matching to participants. It has no power source and derives its power from a transponder activation field delivered by a decoder.
**Aliases:** chip code, chip id, transponder
**Architecture:** Represented as `chipCode` on `ChipCrossingData` and participant matching candidates.

## Number

**Definition:** Public competitor display identity shown in results and entry imports.
**Aliases:** race number, car number, bib number
**Architecture:** Stored as `racePlate` participant identifier; shown by display helpers.

## Plate

**Definition:** Human-facing identity token (race/bib/vehicle number) often used for imports and matching.
**Aliases:** race plate, plate number
**Architecture:** Stored on identifiers as `racePlate` and used in `isPlateCrossing`/matching.

## Category

**Definition:** A class of competition with rules, timing constraints, and result membership scopes.
**Aliases:** class, division
**Architecture:** `EventCategory` contains `name`, `code`, `distance`, `duration`, `excludeFromResults`, with catalog extensions for rule/session metadata.

## Flag

**Definition:** A race-control event/state indicator that alters timing interpretation (start/end/caution behavior).
**Aliases:** flag record, marshal flag
**Architecture:** Modeled as `FlagRecord` variants with typed `recordType` values and payload fields.

## Light

**Definition:** Control signal state used in reports and timing semantics, represented in the system as flag information.
**Aliases:** green light, yellow light, red light, flag light
**Architecture:** No standalone light model; derive from `FlagRecord.flagType` and `flagValue` in UI/rules logic.

## Crossing

**Definition:** A passing event where a participant identity is detected at a line/loop and can be lap-counted or sector-timed.
**Aliases:** passing, lap crossing, time crossing
**Architecture:** Stored as `ParticipantPassingRecord` (chip/transponder) or `PlateCrossingData` (plate-only).

## Record

**Definition:** A persisted timing fact in event history (crossing, flag, session boundary, generated evidence).
**Aliases:** timing record, event record
**Architecture:** Base `TimeRecord` with typed variants and bitmask `recordType` markers.

## Hits

**Definition:** Count of read confirmations for a raw crossing signal.
**Aliases:** hit count, HITS
**Architecture:** Optional `hitCount` on `ParticipantPassingRecord`, sourced from parser inputs.

## Confidence Factor

**Definition:** Numeric quality signal describing confidence or strength of a crossing read.
**Aliases:** CF, confidence
**Architecture:** Optional `confidenceFactor` on `ParticipantPassingRecord`, sourced from raw import data.

## Sector

**Definition:** A non-lap-completion passing segment used for intermediate timing context and segment metrics.
**Aliases:** sector timing, intermediate segment
**Architecture:** Determined by `isLapCompletionPassing` and related sector timing helpers in lap processing.

## Speed Trap

**Definition:** A specific timing line/loop configured for speed measurement rather than default lap counting use.
**Aliases:** trap line, speed line
**Architecture:** Uses existing line/loop metadata and record flow; no separate domain model.

## Lap Chart

**Definition:** A report view that renders per-entrant lap/sector progression from computed session timing.
**Aliases:** lap progression chart
**Architecture:** Built in report views (no direct persistence object), using computed session results and crossing history.
