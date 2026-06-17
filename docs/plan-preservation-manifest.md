# Plan Preservation Manifest

This manifest records the immutable source-of-truth documents for the
Pharos Multi-Agent Job Router project. The files listed below MUST NOT
be deleted, renamed, moved, overwritten, truncated, regenerated,
replaced, formatted, or modified in any way.

## Protected Files

| # | Path                                                                                                            | SHA-256                                                             |
|---|-----------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| 1 | `README.md`                                                                                                     | `252D88E32BA7DB0F3A1B2CD61905A38AA86FF858A36B825BE3A170196C4AE26F`    |
| 2 | `docs\superpowers\plans\2026-06-13-multi-agent-job-router-master-plan.md`                                       | `84B02585C94155E32F3E3F7564CCA881284F17B20A10B741D7B5D7061AEE5AD1`    |

## Verification Procedure

Before implementation began:

1. Both files were confirmed to exist at the absolute paths shown above.
2. The SHA-256 hash of each file was computed and recorded in this
   manifest.
3. A separate implementation checklist was created at
   `docs\implementation-checklist.md`; that file is the only place where
   task progress is tracked.

After every major phase, and again before claiming completion:

1. Both files are re-checked for existence.
2. SHA-256 hashes are recomputed and compared with this manifest.
3. Any mismatch, deletion, rename, or move triggers an immediate stop
   and is documented in `docs\implementation-decisions.md`.

## Why These Files Are Protected

`README.md` defines the project identity, scope, partner integrations,
and the link to the master plan. The master plan defines the
architecture, tech stack, task list, and Definition of Done that the
implementation must satisfy. Both documents are the contract between
the planning phase and the engineering phase and must remain stable
throughout the project.

## Modification Policy

Protected files may be changed only if the user explicitly names the
exact protected file and the exact modification in a later message.
The implementation checklist, isolation verification, implementation
decisions, change log, environment status, local acceptance results,
Atlantic acceptance results, and final preservation report are
non-protected operational documents and may be updated freely.