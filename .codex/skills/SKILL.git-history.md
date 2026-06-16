---
name: git-history-retriever
description: Fetches, summarizes, and filters Git repository history to track changes and find context.
version: 1.0.0
license: Apache-2.0
allowed-tools:
  - bash
---

# Git History Retriever

Use this skill when the user asks to see recent commits, search for changes in specific lines/files, generate changelogs, or track down when a bug was introduced.

## Core Inspection Commands

*   **View Recent History:** `git log --oneline -20` (Quick overview of the last 20 commits)
*   **Detailed Graph View:** `git log --oneline --graph --decorate -10` (Visualizes branch splits and merges)
*   **Search Commit Messages:** `git log --grep="<keyword>" --oneline` (Finds work matching a specific term)
*   **Line-Level History Search:** `git log -L <start>,<end>:<file>` (Traces specific code line evolution)
*   **Trace Introduced Bug:** Use `git bisect` combined with `git log` to narrow down regressions.

## Execution Rules

1.  **Detect Project Convention First:** Before formatting summaries, run `git log --oneline -20` to analyze if the project follows Semantic/Conventional Commits or a plain formatting style. Always match the host repository's style.
2.  **Filter Noise:** When summarizing broad history for release notes, exclude internal refactoring, test loops, or merge commits unless requested.
3.  **No Hallucinations:** Only report commit hashes, authors, and dates directly extracted from the bash tool output.
