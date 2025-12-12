# Phase 5: Edge Cases and Precautionary Fixes

## Objective
Address edge cases, fix potential bugs identified in precautionary examples, and ensure robust behavior.

## Fix: Item Form Outside Click Behavior (Precautionary Example 3)

**File**: `src/components/Item/ItemForm.tsx`

**Current Behavior** (lines 23-26):
```typescript
const clear = () => setEditState(EditingState.cancel);
const clickOutsideRef = useOnclickOutside(clear, {
  ignoreClass: [c('ignore-click-outside'), 'mobile-toolbar', 'suggestion-container'],
});
```

**Problem**: Clicking outside always cancels, even if there's content that should be saved.

**Fix**:
```typescript
const handleOutsideClick = useCallback(() => {
  const content = editorRef.current?.state.doc.toString().trim();
  if (content) {
    // Submit non-empty content
    addItems([stateManager.getNewItem(content, ' ')]);
  }
  setEditState(EditingState.cancel);
}, [stateManager, addItems, setEditState]);

const clickOutsideRef = useOnclickOutside(handleOutsideClick, {
  ignoreClass: [c('ignore-click-outside'), 'mobile-toolbar', 'suggestion-container'],
});
```

**Also check**: `src/components/Lane/LaneForm.tsx` for similar issue.

**Current LaneForm behavior** (lines 21-23):
```typescript
const clickOutsideRef = useOnclickOutside(() => closeLaneForm(), {
  ignoreClass: [c('ignore-click-outside'), 'mobile-toolbar', 'suggestion-container'],
});
```

**Fix for LaneForm**:
```typescript
const handleOutsideClick = useCallback(() => {
  const content = editorRef.current?.state.doc.toString().trim();
  if (content) {
    // Submit non-empty lane title
    createLane(editorRef.current, content);
  }
  closeLaneForm();
}, [editorRef, createLane, closeLaneForm]);

const clickOutsideRef = useOnclickOutside(handleOutsideClick, {
  ignoreClass: [c('ignore-click-outside'), 'mobile-toolbar', 'suggestion-container'],
});
```

## Edge Case: Kanban File Deleted While Embed Active

**Scenario**: User has a transcluded kanban board. The source file is deleted.

**Expected Behavior**: Embed should gracefully unload/show error.

**Implementation**:

Add file deletion listener in `KanbanEmbed.onload()`:
```typescript
async onload(): Promise<void> {
  // ... existing code ...

  // Listen for file deletion
  this.registerEvent(
    this.plugin.app.vault.on('delete', (file) => {
      if (file === this.file) {
        this.unload();
      }
    })
  );

  // Listen for file rename
  this.registerEvent(
    this.plugin.app.vault.on('rename', (file, oldPath) => {
      if (oldPath === this.file.path) {
        // File was renamed, update reference
        this.file = file as TFile;
      }
    })
  );
}
```

**Note**: MarkdownRenderChild has `registerEvent` method for proper cleanup.

## Edge Case: Embed in Multiple Places

**Scenario**: Same kanban file is transcluded in multiple places on the same note.

**Expected Behavior**: Each transclusion gets its own KanbanEmbed instance with unique ID, but they share StateManager.

**Verification**:
- Each embed has unique `instanceId` (from `generateInstanceId()`)
- Each embed registers separately with plugin's `embedMap`
- Both share the same StateManager (keyed by `TFile`)
- State changes propagate to both embeds

**Implementation Note**: This should work correctly with current design since:
- `instanceId` is unique per `KanbanEmbed` instance
- `plugin.addEmbed()` registers each separately
- `StateManager.stateReceivers` notifies all instances

## Edge Case: Embed Crosses Window Boundary

**Scenario**: User pops out a note containing a transcluded kanban into a new window.

**Expected Behavior**: Embed should register with the new window's registry.

**Implementation**:

The post-processor runs when markdown is rendered. When a note is moved to a new window, Obsidian should re-render the markdown, triggering the post-processor again.

**Verification needed**: Test if `ctx` in post-processor correctly identifies the window.

If not automatic, add window migration handling similar to KanbanView:
```typescript
// In KanbanEmbed
onload(): void {
  // ... existing code ...

  // Handle window migration (similar to KanbanView.tsx:176-181)
  this.register(
    this.containerEl.onWindowMigrated(() => {
      this.plugin.removeEmbed(this);
      this.plugin.addEmbed(this, this.data, false);
    })
  );
}
```

## Edge Case: StateManager Empty Check

**Scenario**: Last view is closed while embed exists, or vice versa.

**Current Code** (StateManager.ts:75-78):
```typescript
if (this.viewSet.size === 0) {
  this.onEmpty();
}
```

**Problem**: Doesn't account for embeds.

**Fix**:
```typescript
if (this.viewSet.size === 0 && this.embedSet.size === 0) {
  this.onEmpty();
}
```

This is already included in Phase 3 but important to verify.

## Edge Case: Embed Initial State When View Exists

**Scenario**: KanbanView already open for a file, then embed is created.

**Expected Behavior**: Embed should use existing state from StateManager, not reparse.

**Implementation in StateManager.registerEmbed**:
```typescript
async registerEmbed(embed: KanbanEmbed, data: string, shouldParseData: boolean) {
  if (!this.embedSet.has(embed)) {
    this.embedSet.add(embed);
  }

  await new Promise((res) => activeWindow.setTimeout(res, 10));

  // Only parse if no existing state AND shouldParseData is true
  if (shouldParseData && !this.state) {
    await this.newBoardForEmbed(embed, data);
  }
  // If state exists, just use it (no parsing needed)

  embed.populateViewState(this.state?.data.settings || {});
}
```

## Edge Case: HTML5 Drag into Embed

**Scenario**: User drags external content (text, files) into an embedded kanban.

**Current Implementation** (DragManager.ts:103-115, 478-512):
- `dragStartHTML` creates an entity with special `'htmldnd'` scopeId
- `createHTMLDndHandlers` creates `onDragOver`/`onDrop` handlers
- Handler uses `stateManager.getAView().id` as viewId

**Problem**: `getAView()` returns a KanbanView, but for embeds we need the embed's ID.

**Fix in `createHTMLDndHandlers`**:
```typescript
export function createHTMLDndHandlers(stateManager: StateManager, instanceId: string) {
  const dndManager = useContext(DndManagerContext);
  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (dndManager.dragManager.isHTMLDragging) {
        e.preventDefault();
        dndManager.dragManager.dragMoveHTML(e);
      } else {
        // CHANGED: Use passed instanceId instead of getAView().id
        dndManager.dragManager.dragStartHTML(e, instanceId);
      }

      dndManager.dragManager.onHTMLDragLeave(() => {
        dndManager.dragManager.dragEndHTML(e, instanceId, [], true);
      });
    },
    [dndManager, instanceId]
  );

  const onDrop = useCallback(
    async (e: DragEvent) => {
      dndManager.dragManager.dragEndHTML(
        e,
        instanceId,
        await handleDragOrPaste(stateManager, e, activeWindow as Window & typeof globalThis),
        false
      );
    },
    [dndManager, stateManager, instanceId]
  );

  return {
    onDragOver,
    onDrop,
  };
}
```

**Update call sites** in `Kanban.tsx` / `KanbanBoard.tsx`:
```typescript
// BEFORE
const html5DragHandlers = createHTMLDndHandlers(stateManager);

// AFTER
const html5DragHandlers = createHTMLDndHandlers(stateManager, scopeId);
```

## Edge Case: isShiftPressed Access

**Current Code**: `KanbanView` has `isShiftPressed` getter that accesses `plugin.isShiftPressed`.

**Problem**: Components access this via `view.isShiftPressed` from context, which won't work for embeds.

**Solution Options**:

1. **Add to context directly**:
   ```typescript
   // In KanbanContextProps
   isShiftPressed: boolean;
   ```
   Then pass `plugin.isShiftPressed` when creating context.

2. **Create hook that accesses plugin**:
   ```typescript
   export function useIsShiftPressed(): boolean {
     // Access plugin through app
     const plugin = app.plugins.getPlugin('kanban-plugin') as KanbanPlugin;
     return plugin?.isShiftPressed ?? false;
   }
   ```

3. **Subscribe to keyboard events in each board**:
   Less efficient but more isolated.

**Recommended**: Option 1 - add to context.

**Files to update**:
- `src/components/context.ts` - Add to interface
- `src/components/Kanban.tsx` / `KanbanBoard.tsx` - Provide value
- All consumers of `view.isShiftPressed`

## Verification Checklist

- [ ] ItemForm submits on outside click with content
- [ ] LaneForm submits on outside click with content
- [ ] File deletion unloads embed gracefully
- [ ] File rename updates embed reference
- [ ] Multiple embeds of same file work
- [ ] Window migration works for embeds
- [ ] StateManager empty check includes embeds
- [ ] Embed uses existing state when view exists
- [ ] HTML5 drag into embed works
- [ ] isShiftPressed accessible in embeds
