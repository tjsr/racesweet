---
name: context-formatter
description: Use when editing or generating `CONTEXT.md` so term definitions use a single consistent inline heading format and predictable structure.
---

# Context Glossary Formatter

Use this skill to keep business-term entries in `CONTEXT.md` consistent and unambiguous.

## Canonical Entry Template

For each term, keep this block format and order exactly:

`## <Term>`

`**Definition:** ...`  
`**Aliases:** ...`  
`**Architecture:** ...`

## Formatting Rules

- Keep the existing term order in `CONTEXT.md` unchanged.
- Keep each term’s existing business definition content, but reformat only for consistent structure.
- `Definition`, `Aliases`, and `Architecture` must always be present and ordered as shown.
- `Aliases` and `Architecture` are always rendered inline as labels.
- Use `**Architecture:** N/A` for terms that do not have direct implementation structure.
- Use comma-separated values only for `Aliases:` (no alternate label variants, no per-term label rewrites).
- Limit each `Definition` to 1–3 concise lines.
- Keep one blank line between each term block.

## Verification Checklist

- Quick visual scan of `CONTEXT.md` after updates to ensure every term has all three labels in the same order.
- If repository markdown lint tooling is available, run that command and confirm no lint regressions.
- There is no runtime code impact from this formatting work.
