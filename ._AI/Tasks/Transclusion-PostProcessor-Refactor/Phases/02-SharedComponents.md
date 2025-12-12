# Phase 2: Extract Shared Rendering Components

## Objective
Extract the core kanban rendering logic into components that can be used by both KanbanView and KanbanEmbed.

## New File: `src/components/KanbanBoard.tsx`

This component encapsulates the shared board rendering logic previously in `src/components/Kanban.tsx`.

### Interface

```typescript
import { StateManager } from 'src/StateManager';
import { Board } from './types';

export interface KanbanBoardProps {
  stateManager: StateManager;
  scopeId: string;
  containerEl: HTMLElement;

  // Callbacks for instance-specific behavior
  getViewState: <K extends keyof KanbanViewSettings>(key: K) => KanbanViewSettings[K];
  setViewState: <K extends keyof KanbanViewSettings>(
    key: K,
    val?: KanbanViewSettings[K],
    globalUpdater?: (old: KanbanViewSettings[K]) => KanbanViewSettings[K]
  ) => void;

  // Event emitter for hotkeys and lane form
  emitter: EventEmitter;

  // Optional: controls for embed-specific behavior
  isEmbed?: boolean;
}

export function KanbanBoard(props: KanbanBoardProps): JSX.Element;
```

### Implementation Notes

The KanbanBoard component should:

1. **Not import KanbanView directly** - This breaks circular dependencies
2. **Use props for all view-specific operations**
3. **Maintain current rendering logic** from Kanban.tsx

### Key Changes from Current Kanban.tsx

```typescript
// BEFORE (in Kanban.tsx line 49)
export const Kanban = ({ view, stateManager }: KanbanProps) => {
  // ...
  const boardView = view.useViewState(frontmatterKey);
  // ...
  view.emitter.on('hotkey', onSearchHotkey);
}

// AFTER (in KanbanBoard.tsx)
export const KanbanBoard = ({
  stateManager,
  scopeId,
  getViewState,
  setViewState,
  emitter,
  isEmbed
}: KanbanBoardProps) => {
  // ...
  const boardView = getViewState(frontmatterKey);
  // ...
  emitter.on('hotkey', onSearchHotkey);
}
```

## Updated: `src/components/context.ts`

### Changes

```typescript
// BEFORE
export interface KanbanContextProps {
  filePath?: string;
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  view: KanbanView;
}

// AFTER
export interface KanbanContextProps {
  filePath?: string;
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  scopeId: string;
  containerEl: HTMLElement;
  isEmbed?: boolean;
  // Note: `view` removed - use scopeId + plugin lookup when needed
}
```

### Migration Strategy for `view` Usage

Current code accesses `view` from context for various purposes. Each must be migrated:

| Current Usage | Migration Strategy |
|---------------|-------------------|
| `view.file.path` | Use `filePath` from context |
| `view.emitter` | Pass `emitter` as prop to KanbanBoard |
| `view.getViewState()` | Use `getViewState` callback prop |
| `view.setViewState()` | Use `setViewState` callback prop |
| `view.id` | Use `scopeId` from context |
| `view.contentEl` | Use `containerEl` from context |
| `view.isShiftPressed` | Access via `plugin.isShiftPressed` |

## Updated: `src/components/Kanban.tsx`

Refactor to be a thin wrapper that creates KanbanBoard with view-specific props.

```typescript
import { KanbanView } from 'src/KanbanView';
import { StateManager } from 'src/StateManager';
import { KanbanBoard } from './KanbanBoard';

interface KanbanProps {
  stateManager: StateManager;
  view: KanbanView;
}

export const Kanban = ({ view, stateManager }: KanbanProps) => {
  const getViewState = useCallback(
    <K extends keyof KanbanViewSettings>(key: K) => view.getViewState(key),
    [view]
  );

  const setViewState = useCallback(
    <K extends keyof KanbanViewSettings>(
      key: K,
      val?: KanbanViewSettings[K],
      globalUpdater?: (old: KanbanViewSettings[K]) => KanbanViewSettings[K]
    ) => view.setViewState(key, val, globalUpdater),
    [view]
  );

  return (
    <KanbanBoard
      stateManager={stateManager}
      scopeId={view.id}
      containerEl={view.contentEl}
      getViewState={getViewState}
      setViewState={setViewState}
      emitter={view.emitter}
      isEmbed={false}
    />
  );
};
```

## New File: `src/components/EmbedKanban.tsx`

Thin wrapper for embedded kanban boards.

```typescript
import { KanbanEmbed } from 'src/KanbanEmbed';
import { StateManager } from 'src/StateManager';
import { KanbanBoard } from './KanbanBoard';

interface EmbedKanbanProps {
  stateManager: StateManager;
  embed: KanbanEmbed;
}

export const EmbedKanban = ({ embed, stateManager }: EmbedKanbanProps) => {
  const getViewState = useCallback(
    <K extends keyof KanbanViewSettings>(key: K) => embed.getViewState(key),
    [embed]
  );

  const setViewState = useCallback(
    <K extends keyof KanbanViewSettings>(
      key: K,
      val?: KanbanViewSettings[K],
      globalUpdater?: (old: KanbanViewSettings[K]) => KanbanViewSettings[K]
    ) => embed.setViewState(key, val, globalUpdater),
    [embed]
  );

  return (
    <KanbanBoard
      stateManager={stateManager}
      scopeId={embed.id}
      containerEl={embed.containerEl}
      getViewState={getViewState}
      setViewState={setViewState}
      emitter={embed.emitter}
      isEmbed={true}
    />
  );
};
```

## Updated: `src/helpers/boardModifiers.ts`

The current `getBoardModifiers` function takes a `KanbanView` parameter. This needs to accept either view or embed.

### Changes

```typescript
// BEFORE
export function getBoardModifiers(view: KanbanView, stateManager: StateManager): BoardModifiers {
  // Uses view.getViewState(), view.setViewState()
}

// AFTER
export interface ViewStateProvider {
  getViewState: <K extends keyof KanbanViewSettings>(key: K) => KanbanViewSettings[K];
  setViewState: <K extends keyof KanbanViewSettings>(
    key: K,
    val?: KanbanViewSettings[K],
    globalUpdater?: (old: KanbanViewSettings[K]) => KanbanViewSettings[K]
  ) => void;
}

export function getBoardModifiers(
  viewStateProvider: ViewStateProvider,
  stateManager: StateManager
): BoardModifiers {
  // Replace view.getViewState() with viewStateProvider.getViewState()
  // Replace view.setViewState() with viewStateProvider.setViewState()
}
```

## Component Locations That Access `view` from Context

These components need updates to use the new context shape:

### `src/components/Lane/LaneMenu.tsx`
- Uses `view` from KanbanContext for menu positioning
- Migration: Use `containerEl` from context instead

### `src/components/Item/ItemMenu.ts`
- Uses `view` for file operations
- Migration: Pass necessary methods via context or props

### `src/components/Item/Item.tsx`
- Uses `view.isShiftPressed`
- Migration: Access via plugin reference or add to context

### `src/components/Editor/MarkdownEditor.tsx`
- May use view for editor integration
- Migration: Review and adjust

## DndScope ID Update

The DndScope in KanbanBoard uses the scopeId prop:

```typescript
// In KanbanBoard.tsx
<DndScope id={scopeId}>
  {/* ... */}
</DndScope>
```

This maintains proper scoping for drag-and-drop operations.

## Verification Checklist

- [ ] KanbanBoard component created with proper props interface
- [ ] Context types updated without breaking existing functionality
- [ ] Kanban.tsx refactored to thin wrapper
- [ ] EmbedKanban.tsx created
- [ ] boardModifiers works with abstracted view state provider
- [ ] All components using `view` from context are updated
- [ ] DndScope receives correct scopeId
