# Implementation Phases

Execute in order. Each phase builds on the previous.

## Phase 1: Infrastructure
**File**: `Phases/01-Infrastructure.md`

Updates to `src/main.ts`:
- Extend WindowRegistry with `embedMap`
- Add embed management methods (`addEmbed`, `removeEmbed`, `getKanbanInstance`)
- Register markdown post-processor
- Implement transclusion detection

## Phase 2: Shared Components
**File**: `Phases/02-SharedComponents.md`

Extract reusable rendering:
- Create `src/components/KanbanBoard.tsx` (shared board logic)
- Create `src/components/EmbedKanban.tsx` (embed wrapper)
- Refactor `src/components/Kanban.tsx` to thin wrapper
- Update `src/components/context.ts` (remove `view` dependency)
- Update `src/helpers/boardModifiers.ts` (ViewStateProvider interface)

## Phase 3: KanbanEmbed
**File**: `Phases/03-KanbanEmbed.md`

Create the embed class:
- Create `src/KanbanEmbed.ts` (MarkdownRenderChild)
- Export `KanbanInstance` type union
- Update `src/StateManager.ts` (embedSet, registration methods)

## Phase 4: Drag-Drop Integration
**File**: `Phases/04-DragDrop.md`

Unified instance handling:
- Update `src/DragDropApp.tsx` (use `getKanbanInstance`, render embeds)
- Update `src/dnd/managers/DragManager.ts` (`createHTMLDndHandlers` signature)

## Phase 5: Edge Cases & Fixes
**File**: `Phases/05-EdgeCases.md`

Polish and bug fixes:
- Fix ItemForm outside-click (submit non-empty content)
- Fix LaneForm outside-click (submit non-empty content)
- Add file deletion/rename handlers to KanbanEmbed
- Add window migration handler to KanbanEmbed
- Ensure `isShiftPressed` accessible in embeds

---

## Supporting Documents

| Document | Purpose |
|----------|---------|
| `Overview.md` | Architecture, goals, precautionary issue analysis |
| `CodeReferences.md` | Quick lookup for file locations and line numbers |
| `Checklist.md` | Granular implementation checklist |
| `Todo/Testing.md` | Manual testing scenarios (user responsibility) |
