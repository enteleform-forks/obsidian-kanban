# Agent Instructions

Implement the transclusion post-processor refactor for this Obsidian Kanban plugin.

## Execution Steps

1. Read `01-Overview.md` for architecture, goals, and precautionary issues
2. Read `02-Phases.md` for phase summaries and execution order
3. Implement all 5 phases in `Phases/` directory in order
4. Use `03-CodeReferences.md` for file/line lookups during implementation
5. Use `04-Checklist.md` to track completion of granular tasks

## Critical Requirements

Ensure the precautionary issues documented in `01-Overview.md` are addressed:
- Cross-board drag must reach correct target view
- Drag-scroll must only affect the active board
- Task forms must submit content on outside-click (not discard)

## Post-Implementation

Manual testing scenarios are in `Todo/Testing.md` - these are handled by the user after implementation.
