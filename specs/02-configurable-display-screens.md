# Configurable display screens

## Purpose and acceptance criteria

Provide reusable remote-display templates in Reports. Administrators can build
named layouts, preview drafts, publish a revision, and create a revocable share
link bound to an event and optional session. A remote viewer uses that link to
see a read-only full-screen display with live calculated race data.

Acceptance requires draft edits to remain private until publish, share links to
be revocable and non-enumerable, and published screens to refresh their bound
event/session data without exposing editor controls or authenticated catalog
data to viewers.

## Current state and preconditions

- Reports already owns selected event/session state and Event Catalog-derived
  race data. `race:read` and `race:write` authorization already exist on the
  application server.
- Event Catalog persistence, immutable mutations, replica synchronization, and
  upstream callbacks are the persistence path for display definitions.
- The server already supports authenticated SSE patterns. Public display
  streaming requires a token-specific, read-only route rather than reuse of an
  authenticated catalog stream.

## Resolved decisions and implementation questions

- **Ownership:** templates are globally reusable catalog entities, not event or
  session records.
- **Viewer context:** each opaque share link binds one template revision to an
  event and optional session; viewers cannot choose another context.
- **Access and publishing:** administrators require `race:write`; viewers use a
  revocable bearer link and see changes only after explicit publish.

## Requirements and design

### Catalog model and revisions

- Add a global `DisplayScreenTemplate` collection to Event Catalog state. A
  template has ID, name, draft revision, optional published revision, creation
  and update metadata, and archived state. It is reusable and is not owned by a
  particular event.
- A revision contains a 12-column grid layout with each item’s component type,
  `x`, `y`, `width`, `height`, z-order, and typed settings. Layout bounds are
  validated on save and components cannot overlap unless explicitly layered.
- Initial component types are `event-title`, `clock`, `leaderboard`,
  `results-table`, `sponsor-image`, and `text-panel`. Each has a typed settings
  discriminant; arbitrary HTML, scripts, and external fetch URLs are forbidden.
- Add immutable create, draft-update, publish, archive, and share-link
  create/rotate/revoke mutations and corresponding Event Catalog service
  methods. Every write persists, rebuilds the state, and invokes the configured
  upstream callback.
- Publish snapshots the validated draft as an immutable revision. Viewer links
  continue to render the previous published revision until a new explicit
  publish action succeeds.

### Share links and server surface

- A `DisplayShareLink` binds one published template revision to exactly one
  event and optionally one session. The template remains globally reusable;
  different links may bind the same revision to different event/session data.
- Generate an opaque high-entropy bearer token. Persist only its hash, link ID,
  binding, active state, and revision reference in catalog data; show the raw
  token once when the link is created or rotated.
- Serve a public, read-only display shell at a token route and token-scoped JSON
  snapshot/SSE routes. The token may read only its bound event/session’s
  calculated display projection; it cannot access catalog, administration,
  mutations, or another event through URL parameters.
- Link rotation immediately invalidates the previous token. Unpublish, archive,
  and revoke return a neutral unavailable screen and terminate active streams.
- Admin management endpoints and Reports editor operations require `race:write`.
  Remote display rendering requires only a valid active token.

### Editor, preview, and view mode

- Add a Display Screens area under Reports. It lists templates, edits a draft,
  previews a chosen event/session binding, publishes, manages links, and
  unpublishes/archives.
- Build the canvas with MUI controls and a responsive 12-column grid. Palette
  addition, selection, settings, move, resize, delete, undo-before-save, and
  validation are editor-only affordances.
- Component bindings use only the link’s event/session projection. Leaderboard
  and results-table settings may select result scope and row limits; title and
  clock derive the binding context; text and sponsor components use sanitized
  content/media references.
- Viewer mode is full-screen, has no selection outlines, palette, edit routes,
  or management calls, and handles temporary stream disconnection by displaying
  the most recent valid projection with a discreet stale indicator.

## Failure handling

- Reject invalid layouts, duplicate names, missing published revisions, invalid
  binding IDs, untrusted media URLs, and attempts to publish an empty template.
- Failed publish retains the draft and leaves the old published revision and
  its active links unchanged.
- Invalid, revoked, expired, or mismatched tokens reveal no event metadata.
- Data projection or stream failures do not expose raw errors to public viewers.

## Test plan

- Unit-test template/revision mutation replay, grid validation, typed component
  settings, projection filtering, token hashing, rotation/revocation, and draft
  versus published revision selection.
- Service tests cover persistence, state rebuild, upstream callback, event and
  session binding validation, archive behavior, and link lifecycle.
- Server tests cover admin authorization, public token access, token isolation,
  revoked/rotated links, snapshot/SSE updates, and unavailable published states.
- UI integrations cover palette additions, layout edits, preview, explicit
  publish isolation, view mode without editor controls, and remote live updates.

## Implementation checklist

- Add catalog entities, mutation schemas, reducer support, and service APIs.
- Add authenticated Reports editor plus public viewer shell and token routes.
- Create the display projection and live-update broadcaster.
- Add unit, integration, and server regression coverage; run TypeScript and
  lint checks.
