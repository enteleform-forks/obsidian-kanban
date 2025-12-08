# Phase 4: Cross-Instance Drag-and-Drop Support

## Objective
Ensure drag-and-drop works correctly between any combination of KanbanView and KanbanEmbed instances.

## Critical Analysis: Precautionary Example 1

**Issue**: Dragging between boards doesn't reach correct target.

**Root Cause in Failed Refactor**: The `handleDrop` in DragDropApp.tsx used `plugin.getKanbanView()` to look up the source and destination views. If an embed was involved, the lookup would fail.

**Current Code (DragDropApp.tsx:105)**:
```typescript
const view = plugin.getKanbanView(dragEntity.scopeId, dragEntityData.win);
```

**Fix**: Use `plugin.getKanbanInstance()` which searches both viewMap and embedMap.

## Changes to `src/DragDropApp.tsx`

### 1. Update Portals to Include Embeds

```typescript
// BEFORE (line 39-40)
export function DragDropApp({ win, plugin }: { win: Window; plugin: KanbanPlugin }) {
  const views = plugin.useKanbanViews(win);
  const portals: JSX.Element[] = views.map((view) => <View key={view.id} view={view} />);

// AFTER
export function DragDropApp({ win, plugin }: { win: Window; plugin: KanbanPlugin }) {
  const instances = plugin.useAllInstances(win);

  const portals: JSX.Element[] = instances.map((instance) => {
    // Both KanbanView and KanbanEmbed implement getPortal()
    return <Instance key={instance.id} instance={instance} />;
  });
```

### 2. Update Instance Component

```typescript
// BEFORE (line 34-36)
const View = memo(function View({ view }: { view: KanbanView }) {
  return createPortal(view.getPortal(), view.contentEl);
});

// AFTER
const Instance = memo(function Instance({ instance }: { instance: KanbanInstance }) {
  // Both View and Embed have containerEl (View inherits from ItemView)
  const container = 'contentEl' in instance ? instance.contentEl : instance.containerEl;
  return createPortal(instance.getPortal(), container);
});
```

### 3. Update handleDrop Function

**Key changes at lines 103-188**:

```typescript
const handleDrop = useCallback(
  (dragEntity: Entity, dropEntity: Entity) => {
    if (!dragEntity || !dropEntity) {
      return;
    }

    // HTML drag handling (unchanged)
    if (dragEntity.scopeId === 'htmldnd') {
      const data = dragEntity.getData();
      // Use getStateManagerFromScopeId instead of getStateManagerFromViewID
      const stateManager = plugin.getStateManagerFromScopeId(data.viewId, data.win);
      // ... rest of HTML drag logic unchanged
    }

    const dragPath = dragEntity.getPath();
    const dropPath = dropEntity.getPath();
    const dragEntityData = dragEntity.getData();
    const dropEntityData = dropEntity.getData();
    const [, sourceFile] = dragEntity.scopeId.split(':::');
    const [, destinationFile] = dropEntity.scopeId.split(':::');

    const inDropArea =
      dropEntityData.acceptsSort && !dropEntityData.acceptsSort.includes(dragEntityData.type);

    // Same board
    if (sourceFile === destinationFile) {
      // CHANGED: Use getKanbanInstance instead of getKanbanView
      const instance = plugin.getKanbanInstance(dragEntity.scopeId, dragEntityData.win);
      const stateManager = plugin.stateManagers.get(instance.file);

      if (inDropArea) {
        dropPath.push(0);
      }

      return stateManager.setState((board) => {
        const entity = getEntityFromPath(board, dragPath);
        const newBoard: Board = moveEntity(
          board,
          dragPath,
          dropPath,
          (entity) => {
            if (entity.type === DataTypes.Item) {
              const { next } = maybeCompleteForMove(
                stateManager,
                board,
                dragPath,
                stateManager,
                board,
                dropPath,
                entity
              );
              return next;
            }
            return entity;
          },
          (entity) => {
            if (entity.type === DataTypes.Item) {
              const { replacement } = maybeCompleteForMove(
                stateManager,
                board,
                dragPath,
                stateManager,
                board,
                dropPath,
                entity
              );
              return replacement;
            }
          }
        );

        // Lane collapse state updates
        if (entity.type === DataTypes.Lane) {
          const from = dragPath.last();
          let to = dropPath.last();

          if (from < to) to -= 1;

          // CHANGED: Get view state from instance (both types support this)
          const collapsedState = instance.getViewState('list-collapse');
          const op = (collapsedState: boolean[]) => {
            const newState = [...collapsedState];
            newState.splice(to, 0, newState.splice(from, 1)[0]);
            return newState;
          };

          instance.setViewState('list-collapse', undefined, op);

          return update<Board>(newBoard, {
            data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
          });
        }

        // Remove sorting in the destination lane
        const destinationParentPath = dropPath.slice(0, -1);
        const destinationParent = getEntityFromPath(board, destinationParentPath);

        if (destinationParent?.data?.sorted !== undefined) {
          return updateEntity(newBoard, destinationParentPath, {
            data: {
              $unset: ['sorted'],
            },
          });
        }

        return newBoard;
      });
    }

    // CROSS-FILE DRAG: This is the critical path for cross-board operations
    // CHANGED: Use getKanbanInstance for both source and destination
    const sourceInstance = plugin.getKanbanInstance(dragEntity.scopeId, dragEntityData.win);
    const sourceStateManager = plugin.stateManagers.get(sourceInstance.file);
    const destinationInstance = plugin.getKanbanInstance(dropEntity.scopeId, dropEntityData.win);
    const destinationStateManager = plugin.stateManagers.get(destinationInstance.file);

    sourceStateManager.setState((sourceBoard) => {
      const entity = getEntityFromPath(sourceBoard, dragPath);
      let replacementEntity: Nestable;

      destinationStateManager.setState((destinationBoard) => {
        if (inDropArea) {
          const parent = getEntityFromPath(destinationStateManager.state, dropPath);
          const shouldAppend =
            (destinationStateManager.getSetting('new-card-insertion-method') || 'append') ===
            'append';

          if (shouldAppend) dropPath.push(parent.children.length);
          else dropPath.push(0);
        }

        const toInsert: Nestable[] = [];

        if (entity.type === DataTypes.Item) {
          const { next, replacement } = maybeCompleteForMove(
            sourceStateManager,
            sourceBoard,
            dragPath,
            destinationStateManager,
            destinationBoard,
            dropPath,
            entity
          );
          replacementEntity = replacement;
          toInsert.push(next);
        } else {
          toInsert.push(entity);
        }

        if (entity.type === DataTypes.Lane) {
          // CHANGED: Use instance.getViewState/setViewState
          const collapsedState = destinationInstance.getViewState('list-collapse') || [];
          const val = sourceInstance.getViewState('list-collapse')?.[dragPath.last()] ?? false;
          const op = (collapsedState: boolean[]) => {
            const newState = [...collapsedState];
            newState.splice(dropPath.last(), 0, val);
            return newState;
          };

          destinationInstance.setViewState('list-collapse', undefined, op);

          return update<Board>(insertEntity(destinationBoard, dropPath, toInsert), {
            data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
          });
        } else {
          return insertEntity(destinationBoard, dropPath, toInsert);
        }
      });

      if (entity.type === DataTypes.Lane) {
        const collapsedState = sourceInstance.getViewState('list-collapse') || [];
        const op = (collapsedState: boolean[]) => {
          const newState = [...collapsedState];
          newState.splice(dragPath.last(), 1);
          return newState;
        };
        sourceInstance.setViewState('list-collapse', undefined, op);

        return update<Board>(removeEntity(sourceBoard, dragPath), {
          data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
        });
      } else {
        return removeEntity(sourceBoard, dragPath, replacementEntity);
      }
    });
  },
  [instances]  // CHANGED: dependency on instances (was views)
);
```

### 4. Update DragOverlay Rendering

```typescript
// BEFORE (lines 267-290)
const view = plugin.getKanbanView(entity.scopeId, overlayData.win);
const stateManager = plugin.stateManagers.get(view.file);
// ...
const context = {
  view,
  stateManager,
  boardModifiers,
  filePath,
};

// AFTER
const instance = plugin.getKanbanInstance(entity.scopeId, overlayData.win);
const stateManager = plugin.stateManagers.get(instance.file);
// ...
const context = {
  scopeId: entity.scopeId,
  containerEl: 'contentEl' in instance ? instance.contentEl : instance.containerEl,
  stateManager,
  boardModifiers,
  filePath: instance.file.path,
  isEmbed: !('leaf' in instance),
};
```

## Critical Analysis: Precautionary Example 2

**Issue**: Drag-scroll affects all views.

**Root Cause Analysis**:

Looking at the scroll system:
1. `ScrollManager` registers scroll entities with `DndManager` (ScrollManager.ts:148)
2. `DragManager.calculateDragIntersect` filters by `win === data.win` (DragManager.ts:183, 192)
3. Scroll events are emitted with specific entity IDs (DragManager.ts:265-274)
4. `ScrollManager.bindScrollHandlers` binds to specific IDs (ScrollManager.ts:184-189)

The existing code should correctly scope scroll operations because:
- Each ScrollManager creates entities with unique IDs (`${instanceId}-${side}`)
- DragManager only includes entities where `win === data.win`
- Scroll handlers are bound to specific entity IDs

**Potential Issue**: If multiple ScrollManagers have overlapping hitboxes (e.g., nested scrolls or adjacent boards), the scroll intersection logic might trigger multiple.

**Verification Steps**:
1. Ensure `ScrollManager.scopeId` is correctly set (should be the kanban instance's scopeId)
2. Verify that scroll entity registration checks are working
3. Test with multiple boards in same window

**If Issue Persists**:
The scroll entity `getData().win` must match the DragManager's window. Check:
- `ScrollManager.ts:348`: `win: getParentWindow(manager.scrollEl)`
- This should correctly return the window containing the scroll element

## Verification Checklist

- [ ] `handleDrop` uses `getKanbanInstance` for all lookups
- [ ] Portals include both views and embeds
- [ ] Cross-file drag between View→View works
- [ ] Cross-file drag between View→Embed works
- [ ] Cross-file drag between Embed→View works
- [ ] Cross-file drag between Embed→Embed works
- [ ] Drag within same board (View) works
- [ ] Drag within same board (Embed) works
- [ ] Drag-scroll only affects the active board
- [ ] Lane collapse state updates work for both types
