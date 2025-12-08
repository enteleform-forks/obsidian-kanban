# Key Code References

Quick reference for critical code locations during implementation.

## Entry Points

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/main.ts` | 98-150 | Plugin `onload()` - registration point for post-processor |
| `src/main.ts` | 212-239 | `addView()` - model for `addEmbed()` |
| `src/main.ts` | 283-297 | `mount()` - creates windowRegistry entry |
| `src/DragDropApp.tsx` | 30-31 | `createApp()` - entry for per-window React tree |

## Window Registry

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/main.ts` | 24-28 | `WindowRegistry` interface definition |
| `src/main.ts` | 56 | `windowRegistry: Map<Window, WindowRegistry>` |
| `src/main.ts` | 156-179 | `getKanbanView()` / `getKanbanViews()` |

## State Management

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/StateManager.ts` | 14-29 | Class properties including `viewSet` |
| `src/StateManager.ts` | 30-43 | Constructor |
| `src/StateManager.ts` | 46-48 | `getAView()` |
| `src/StateManager.ts` | 54-69 | `registerView()` - model for `registerEmbed()` |
| `src/StateManager.ts` | 71-79 | `unregisterView()` - model for `unregisterEmbed()` |
| `src/StateManager.ts` | 99-114 | `saveToDisk()` |
| `src/StateManager.ts` | 138-181 | `setState()` |

## KanbanView (Model for KanbanEmbed)

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/KanbanView.tsx` | 31-32 | Class declaration |
| `src/KanbanView.tsx` | 43-49 | `isPrimary` and `id` getters |
| `src/KanbanView.tsx` | 147-149 | `getWindow()` |
| `src/KanbanView.tsx` | 287-289 | `getPortal()` |
| `src/KanbanView.tsx` | 253-278 | View state methods |

## Drag-Drop System

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/DragDropApp.tsx` | 38-40 | `DragDropApp` component, views list |
| `src/DragDropApp.tsx` | 42-260 | `handleDrop` callback |
| `src/DragDropApp.tsx` | 93-98 | Cross-file detection via scopeId |
| `src/DragDropApp.tsx` | 103-106 | Same-board view lookup |
| `src/DragDropApp.tsx` | 185-188 | Cross-file view lookups |
| `src/DragDropApp.tsx` | 262-339 | DragOverlay rendering |

## DnD Managers

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/dnd/managers/DndManager.ts` | 10-27 | DndManager class |
| `src/dnd/managers/DndManager.ts` | 76-93 | Entity registration |
| `src/dnd/managers/DragManager.ts` | 80-115 | `dragStart`, `dragStartHTML` |
| `src/dnd/managers/DragManager.ts` | 168-218 | `calculateDragIntersect` - window filtering at 183 |
| `src/dnd/managers/DragManager.ts` | 478-512 | `createHTMLDndHandlers` |
| `src/dnd/managers/ScrollManager.ts` | 139-161 | Scroll entity registration |

## DnD Components

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/dnd/components/Scope.tsx` | 1-22 | `DndScope` - scopeId provider |
| `src/dnd/components/Droppable.tsx` | 27-101 | `Droppable` - entity registration |
| `src/dnd/components/context.ts` | 11 | `ScopeIdContext` |

## Kanban Components

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/components/Kanban.tsx` | 49-296 | Main `Kanban` component |
| `src/components/Kanban.tsx` | 166-177 | `kanbanContext` creation |
| `src/components/Kanban.tsx` | 214 | `DndScope` with `view.id` |
| `src/components/context.ts` | 9-16 | `KanbanContextProps` interface |

## Forms (Outside Click Fix)

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/components/Item/ItemForm.tsx` | 19-84 | ItemForm component |
| `src/components/Item/ItemForm.tsx` | 23-26 | Outside click handler (to fix) |
| `src/components/Lane/LaneForm.tsx` | 17-108 | LaneForm component |
| `src/components/Lane/LaneForm.tsx` | 21-23 | Outside click handler (to fix) |

## Board Modifiers

| File | Line(s) | Purpose |
|------|---------|---------|
| `src/helpers/boardModifiers.ts` | 20-37 | `BoardModifiers` interface |
| `src/helpers/boardModifiers.ts` | 39-280 | `getBoardModifiers()` function |

## ID Format Reference

```
KanbanView.id:  "${leafId}:::${filePath}"
KanbanEmbed.id: "embed-${instanceId}:::${filePath}"
Entity.entityId: "${scopeId}-${id}"
```

The `:::` delimiter is used to extract file path in DragDropApp:
```typescript
const [, sourceFile] = dragEntity.scopeId.split(':::');
```

## Import Patterns

### In main.ts
```typescript
import { KanbanEmbed, KanbanInstance } from './KanbanEmbed';
import { MarkdownPostProcessorContext, TFile } from 'obsidian';
```

### In KanbanEmbed.ts
```typescript
import { MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from 'obsidian';
import { render, unmountComponentAtNode } from 'preact/compat';
import EventEmitter from 'eventemitter3';
import { generateInstanceId } from './components/helpers';
import { getParentWindow } from './dnd/util/getWindow';
```

## Type Patterns

### Union Type for Instances
```typescript
export type KanbanInstance = KanbanView | KanbanEmbed;

// Type guard
function isView(instance: KanbanInstance): instance is KanbanView {
  return 'leaf' in instance;
}
```

### ViewStateProvider Interface
```typescript
export interface ViewStateProvider {
  getViewState: <K extends keyof KanbanViewSettings>(key: K) => KanbanViewSettings[K];
  setViewState: <K extends keyof KanbanViewSettings>(
    key: K,
    val?: KanbanViewSettings[K],
    globalUpdater?: (old: KanbanViewSettings[K]) => KanbanViewSettings[K]
  ) => void;
}
```
