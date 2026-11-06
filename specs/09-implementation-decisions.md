# Resolved implementation decisions

## Purpose

Record the decisions made while implementing specs 05 through 08. The owning
specifications now contain the normative requirements; this file preserves the
reasoning trail only.

## Review process

Each entry records the originating specification and its settled decision. New
requirements belong in the owning specification rather than this archive.

## Decisions

### Spec 07: checkpoint configuration — resolved

- Decision: manual timing uses timing lines from the event track map, falling
  back to configured finish lines for the selected session. It has no separate
  checkpoint registry or prescribed-loop editor. The loop remains optional and
  must be a positive integer when supplied.
- Normative location:
  [07-manual-timing-operator-workflow.md](07-manual-timing-operator-workflow.md).

### Spec 07: native direct delivery without a configured server — resolved

- Decision: a native installation uses the configured RaceSweet remote-server
  URL. It does not infer localhost or discover a peer. Without a configured or
  reachable endpoint, the durable item remains queued; local persistence never
  claims server acceptance.
- Normative location:
  [07-manual-timing-operator-workflow.md](07-manual-timing-operator-workflow.md).

### Spec 06: reorder implementation — resolved

- Decision: one shared native Pointer Events implementation handles mouse, pen,
  and touch. Keyboard controls and visible Move up/Move down actions use the
  same ordering callback. No additional runtime dependency is required; the
  movement controls remain the fallback where pointer capture is unavailable.
- Normative location:
  [06-mobile-admin-controls.md](06-mobile-admin-controls.md).
