# Implementation Checklist

## Pre-Implementation

- [ ] Read and understand all phase documents
- [ ] Identify all files to be modified
- [ ] Create feature branch from `main`
- [ ] Set up test vault with required test files

## Phase 1: Infrastructure (`src/main.ts`)

### WindowRegistry Update
- [ ] Add `embedMap: Map<string, KanbanEmbed>` to WindowRegistry interface
- [ ] Rename `viewStateReceivers` to `instanceStateReceivers`

### New Methods
- [ ] Implement `getKanbanEmbed(id, win)`
- [ ] Implement `getKanbanInstance(scopeId, win)` (unified lookup)
- [ ] Implement `getStateManagerFromScopeId(scopeId, win)`
- [ ] Implement `addEmbed(embed, data, shouldParseData)`
- [ ] Implement `removeEmbed(embed)`
- [ ] Implement `getAllInstances(win)`
- [ ] Implement `useAllInstances(win)` hook

### Lifecycle Updates
- [ ] Update `mount()` to initialize `embedMap`
- [ ] Update `unmount()` to clean up embeds
- [ ] Register markdown post-processor in `onload()`
- [ ] Implement `processKanbanTransclusion(el, ctx)`

### Imports
- [ ] Import `KanbanEmbed` and `KanbanInstance` types
- [ ] Import necessary Obsidian types for post-processor

## Phase 2: Shared Components

### New Files
- [ ] Create `src/components/KanbanBoard.tsx`
  - [ ] Define `KanbanBoardProps` interface
  - [ ] Move rendering logic from Kanban.tsx
  - [ ] Remove direct KanbanView imports
  - [ ] Use props for view state operations

- [ ] Create `src/components/EmbedKanban.tsx`
  - [ ] Create wrapper component for embeds
  - [ ] Wire up KanbanBoard with embed-specific props

### Updated Files
- [ ] `src/components/context.ts`
  - [ ] Update `KanbanContextProps` interface
  - [ ] Remove `view` property
  - [ ] Add `scopeId`, `containerEl`, `isEmbed` properties

- [ ] `src/components/Kanban.tsx`
  - [ ] Refactor to thin wrapper
  - [ ] Create callbacks for view state operations
  - [ ] Pass props to KanbanBoard

- [ ] `src/helpers/boardModifiers.ts`
  - [ ] Create `ViewStateProvider` interface
  - [ ] Update `getBoardModifiers` signature
  - [ ] Replace `view.getViewState`/`setViewState` with provider

### Component Migration
- [ ] Update all components that access `view` from context
  - [ ] `src/components/Lane/LaneMenu.tsx`
  - [ ] `src/components/Item/ItemMenu.ts`
  - [ ] `src/components/Item/Item.tsx`
  - [ ] (others as discovered)

## Phase 3: KanbanEmbed

### New Files
- [ ] Create `src/KanbanEmbed.ts`
  - [ ] Extend `MarkdownRenderChild`
  - [ ] Implement `id` getter with `embed-${instanceId}:::${filePath}` format
  - [ ] Implement `isPrimary` (always false)
  - [ ] Implement `getWindow()`
  - [ ] Implement `getPortal()`
  - [ ] Implement `onload()` lifecycle
  - [ ] Implement `onunload()` lifecycle
  - [ ] Implement view state methods
  - [ ] Implement `populateViewState()`
  - [ ] Implement `updateData()`

- [ ] Export `KanbanInstance` type union

### StateManager Updates (`src/StateManager.ts`)
- [ ] Add `embedSet: Set<KanbanEmbed>`
- [ ] Update `getAView()` to handle no views
- [ ] Add `getAnInstance()` method
- [ ] Implement `registerEmbed()`
- [ ] Implement `unregisterEmbed()`
- [ ] Implement `newBoardForEmbed()`
- [ ] Update constructor to accept either view or embed
- [ ] Update `saveToDisk()` to update all embeds
- [ ] Update empty check to include embedSet

## Phase 4: Drag-Drop Integration

### DragDropApp Updates (`src/DragDropApp.tsx`)
- [ ] Update to use `useAllInstances()` instead of `useKanbanViews()`
- [ ] Create `Instance` component (replaces `View`)
- [ ] Update `handleDrop` to use `getKanbanInstance()`
- [ ] Update same-board drag logic for instances
- [ ] Update cross-file drag logic for instances
- [ ] Update DragOverlay context creation
- [ ] Update dependency arrays

### HTML5 Drag Updates (`src/dnd/managers/DragManager.ts`)
- [ ] Update `createHTMLDndHandlers` to accept `instanceId` parameter
- [ ] Update call sites in Kanban/KanbanBoard

## Phase 5: Edge Cases and Fixes

### ItemForm Fix (`src/components/Item/ItemForm.tsx`)
- [ ] Update outside click handler to submit non-empty content

### LaneForm Fix (`src/components/Lane/LaneForm.tsx`)
- [ ] Update outside click handler to submit non-empty content

### KanbanEmbed Lifecycle
- [ ] Add file deletion listener
- [ ] Add file rename listener
- [ ] Add window migration handler

### isShiftPressed Access
- [ ] Add `isShiftPressed` to context or create hook
- [ ] Update all consumers

## Phase 6: Testing

### Basic Rendering Tests
- [ ] Test 1.1: View rendering (regression)
- [ ] Test 1.2: Embed rendering
- [ ] Test 1.3: Source file in reading view
- [ ] Test 1.4: Live preview with transclusion

### State Synchronization Tests
- [ ] Test 2.1: View and embed same file
- [ ] Test 2.2: Edit in embed, save in view
- [ ] Test 2.3: Multiple embeds of same file

### Drag-Drop Tests
- [ ] Test 3.1: Drag within embed
- [ ] Test 3.2: Drag between view and embed (same file)
- [ ] Test 3.3: Drag View → Embed (different files)
- [ ] Test 3.4: Drag Embed → View (different files)
- [ ] Test 3.5: Drag Embed → Embed (different files)
- [ ] Test 3.6: Drag scroll single board

### Editing Tests
- [ ] Test 4.1: Add card via button
- [ ] Test 4.2: Outside click with content
- [ ] Test 4.3: Outside click empty
- [ ] Test 4.4: Edit existing card
- [ ] Test 4.5: Add lane

### Edge Case Tests
- [ ] Test 5.1: Delete source file
- [ ] Test 5.2: Rename source file
- [ ] Test 5.3: Pop out window
- [ ] Test 5.4: Close view while embed exists
- [ ] Test 5.5: Close embed while view exists

### Performance Tests
- [ ] Test 6.1: Many embeds
- [ ] Test 6.2: Large board in embed

## Post-Implementation

- [ ] Update CLAUDE.md with new architecture notes
- [ ] Code review
- [ ] Squash commits if needed
- [ ] Merge to main
