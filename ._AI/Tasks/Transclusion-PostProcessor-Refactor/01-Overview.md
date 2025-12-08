# Transclusion Post-Processor Refactor

## Goal

Enable kanban boards to be rendered when transcluded (e.g., `![[Path/To/KanbanFile]]`) via a markdown post-processor, while preserving all existing View-based functionality for direct file viewing.

## Scope

### In Scope
- New markdown post-processor for transcluded kanban files
- Shared rendering components between View and post-processor
- Full drag-and-drop support across views (including between transcluded boards and regular views)
- Full editing support in transcluded boards
- State synchronization across all instances (Views and transclusions)

### Out of Scope
- Rendering kanban source files directly (these use KanbanView exclusively)
- Changes to markdown editing/reading view for source files
- Changes to the "Open as Markdown" functionality

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         KanbanPlugin                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ stateManagers: Map<TFile, StateManager>                     ││
│  │   └── One StateManager per unique kanban file               ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ windowRegistry: Map<Window, WindowRegistry>                 ││
│  │   └── viewMap: Map<string, KanbanView>                      ││
│  │   └── embedMap: Map<string, KanbanEmbed> (NEW)              ││
│  │   └── appRoot: HTMLElement (DragDropApp portal)             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   KanbanView    │     │  KanbanEmbed    │     │  StateManager   │
│ (TextFileView)  │     │ (RenderChild)   │     │   (Shared)      │
│                 │     │                 │     │                 │
│ - previewCache  │     │ - previewCache  │     │ - state: Board  │
│ - viewSettings  │     │ - readOnly?     │     │ - viewSet       │
│ - activeEditor  │     │ - scopeId       │     │ - embedSet (NEW)│
│ - emitter       │     │ - emitter       │     │ - parser        │
│                 │     │                 │     │                 │
│ getPortal() ────┼─┬───┼─ getPortal() ───┼─────│ useState()      │
└─────────────────┘ │   └─────────────────┘     └─────────────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │  <KanbanBoard />    │
         │  (Shared Component) │
         │                     │
         │  Props:             │
         │  - stateManager     │
         │  - scopeId          │
         │  - containerEl      │
         │  - isEmbed          │
         └─────────────────────┘
```

## Key Design Decisions

### 1. Scope ID Format
- **Views**: `${leafId}:::${filePath}` (existing)
- **Embeds**: `embed-${instanceId}:::${filePath}` (new)

This maintains the `:::` delimiter for file path extraction in cross-board drag operations.

### 2. DndManager Sharing
All boards (Views and Embeds) within the same window share the same DndManager via the existing DndContext/DragDropApp architecture. This is critical for cross-board drag-and-drop.

### 3. StateManager Registration
Both KanbanView and KanbanEmbed register with the same StateManager for a given file. This ensures:
- State changes propagate to all instances
- Only one "primary" instance saves to disk
- File metadata changes trigger re-renders across all instances

### 4. Post-Processor Detection
The post-processor must detect when it's rendering:
1. A transcluded kanban file (should render board)
2. A kanban source file in reading view (should NOT render - let Obsidian handle)

Detection: Check `ctx.sourcePath !== kanbanFilePath` to identify transclusions.

## Precautionary Issue Analysis

### Issue 1: Cross-Board Drag/Drop Not Reaching Correct Target

**Root Cause Analysis**: In DragDropApp.tsx, the `handleDrop` callback uses `plugin.getKanbanView()` which only searches `viewMap`. If the drop target is an embed, it won't be found.

**Solution**:
- Add `embedMap` to WindowRegistry
- Create `plugin.getKanbanInstance(scopeId, win)` that searches both viewMap and embedMap
- Update handleDrop to use this unified lookup

**Key Files**:
- `src/main.ts:166-179` (getKanbanView)
- `src/DragDropApp.tsx:105,185-188` (handleDrop view lookups)

### Issue 2: Drag-Scroll Affecting All Views

**Root Cause Analysis**: ScrollManager registers scroll entities with the shared DndManager. When drag-scrolling, if the scopeId filtering isn't strict, multiple ScrollManagers may respond.

**Solution**:
- Verify ScrollManager's `handleBeginDragScroll` is properly scoped
- Ensure the scroll entity's `win` property is checked in DragManager.calculateDragIntersect
- The existing check at `DragManager.ts:183` (`win === data.win`) should handle this IF `data.win` is correctly set

**Verification Points**:
- `src/dnd/managers/ScrollManager.ts:139-153` (entity registration)
- `src/dnd/managers/DragManager.ts:180-196` (intersection filtering)

### Issue 3: Task Form Clearing on Outside Click

**Root Cause Analysis**: In ItemForm.tsx, the `clickOutsideRef` callback is `clear()` which sets state to `EditingState.cancel`. This always discards content.

**Current Behavior** (line 23-26):
```typescript
const clear = () => setEditState(EditingState.cancel);
const clickOutsideRef = useOnclickOutside(clear, {
  ignoreClass: [c('ignore-click-outside'), 'mobile-toolbar', 'suggestion-container'],
});
```

**Expected Behavior**:
- If content is empty/whitespace: cancel (discard)
- If content has text: submit (persist)

**Solution**: Modify the outside click handler:
```typescript
const handleOutsideClick = () => {
  const content = editorRef.current?.state.doc.toString().trim();
  if (content) {
    createItem(content);
  }
  setEditState(EditingState.cancel);
};
```

**Note**: This may be an existing bug, not caused by the refactor. Should be fixed regardless.

## Implementation Phases

See individual phase files for detailed implementation steps:
- `01-Phase1-Infrastructure.md` - Plugin infrastructure changes
- `02-Phase2-SharedComponents.md` - Extract shared rendering components
- `03-Phase3-PostProcessor.md` - Implement markdown post-processor
- `04-Phase4-DragDrop.md` - Cross-instance drag-and-drop support
- `05-Phase5-EdgeCases.md` - Edge cases and precautionary fixes
- `06-Phase6-Testing.md` - Testing strategy

## File Change Summary

### New Files
- `src/KanbanEmbed.ts` - MarkdownRenderChild for transcluded boards
- `src/components/KanbanBoard.tsx` - Shared board rendering component

### Modified Files
- `src/main.ts` - Plugin infrastructure, embedMap, post-processor registration
- `src/DragDropApp.tsx` - Unified instance lookup, embed portals
- `src/StateManager.ts` - embedSet registration
- `src/components/context.ts` - Updated context types
- `src/components/Kanban.tsx` - Refactor to use KanbanBoard
- `src/components/Item/ItemForm.tsx` - Fix outside click behavior
- `src/helpers/boardModifiers.ts` - Handle view-less modifiers for embeds

### Minimal/No Changes
- `src/KanbanView.tsx` - Minimal changes (delegation to shared component)
- `src/dnd/*` - No changes needed if scoping is correct
- `src/parsers/*` - No changes
- `src/Settings.ts` - No changes
