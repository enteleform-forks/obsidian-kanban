# Phase 6: Testing Strategy

## Objective
Define comprehensive testing scenarios to verify the refactor works correctly.

## Test Environment Setup

### Required Test Files
1. `TestKanban1.md` - A kanban board file
2. `TestKanban2.md` - Another kanban board file
3. `TransclusionNote.md` - Note with `![[TestKanban1]]` transclusion
4. `MultiTransclusionNote.md` - Note with multiple kanban transclusions
5. `NestedNote.md` - Note with transclusion inside a callout/block

### Test Scenarios

## Category 1: Basic Rendering

### Test 1.1: View Rendering (Regression)
**Steps**:
1. Open `TestKanban1.md` directly
2. Observe rendering

**Expected**:
- Board renders in KanbanView
- All existing functionality works
- No post-processor interference

### Test 1.2: Embed Rendering
**Steps**:
1. Open `TransclusionNote.md` in reading view
2. Observe the transcluded kanban

**Expected**:
- Kanban board renders in the transclusion area
- Board is interactive (drag, edit, etc.)
- Original transclusion placeholder replaced

### Test 1.3: Source File in Reading View
**Steps**:
1. Open `TestKanban1.md`
2. Switch to reading view (Source mode → Reading view)

**Expected**:
- Kanban should NOT render via post-processor
- Standard markdown rendering (if any) or the view should handle it

### Test 1.4: Live Preview with Transclusion
**Steps**:
1. Open `TransclusionNote.md` in Live Preview mode
2. View the area containing `![[TestKanban1]]`

**Expected**:
- Kanban board renders inline
- Editing above/below the embed works normally

## Category 2: State Synchronization

### Test 2.1: View and Embed Same File
**Steps**:
1. Open `TestKanban1.md` in KanbanView (Tab 1)
2. Open `TransclusionNote.md` in another tab (Tab 2)
3. Add a card in Tab 1
4. Observe Tab 2

**Expected**:
- New card appears in the embed immediately
- Both show identical state

### Test 2.2: Edit in Embed, Save in View
**Steps**:
1. Open `TestKanban1.md` in KanbanView (Tab 1)
2. Open `TransclusionNote.md` (Tab 2)
3. Add a card via the embed in Tab 2
4. Close Tab 1
5. Reopen `TestKanban1.md`

**Expected**:
- Card persisted to file
- Reopening shows the card

### Test 2.3: Multiple Embeds of Same File
**Steps**:
1. Create `MultiTransclusionNote.md` with:
   ```md
   ## First Embed
   ![[TestKanban1]]

   ## Second Embed
   ![[TestKanban1]]
   ```
2. Open the note
3. Add a card in one embed

**Expected**:
- Both embeds update simultaneously
- No errors or duplicates

## Category 3: Drag and Drop

### Test 3.1: Drag Within Embed
**Steps**:
1. Open `TransclusionNote.md`
2. Drag a card from one lane to another within the embedded board

**Expected**:
- Card moves to new position
- State persists
- Other views/embeds of same file update

### Test 3.2: Drag Between View and Embed (Same File)
**Steps**:
1. Open `TestKanban1.md` in KanbanView (Tab 1)
2. Open `TransclusionNote.md` (Tab 2)
3. Drag a card from Tab 1 to the embed in Tab 2

**Expected**:
- This is effectively same-file drag
- Card position changes in both views

### Test 3.3: Drag Between Different Files (View → Embed)
**Steps**:
1. Open `TestKanban1.md` in KanbanView
2. Open `TransclusionNote.md` with embedded `TestKanban2`
3. Drag a card from `TestKanban1` (View) to `TestKanban2` (Embed)

**Expected**:
- Card removed from `TestKanban1`
- Card added to `TestKanban2`
- Both files saved
- No state corruption

### Test 3.4: Drag Between Different Files (Embed → View)
**Steps**:
1. Open `TransclusionNote.md` with embedded `TestKanban1`
2. Open `TestKanban2.md` in KanbanView
3. Drag a card from the embed to the view

**Expected**:
- Card removed from `TestKanban1`
- Card added to `TestKanban2`
- Both files saved

### Test 3.5: Drag Between Embeds (Different Files)
**Steps**:
1. Create note with two different kanban transclusions
2. Drag card from one embed to the other

**Expected**:
- Cross-file transfer works correctly
- Both source files updated

### Test 3.6: Drag Scroll Single Board
**Steps**:
1. Open `TransclusionNote.md` with wide embedded kanban
2. Start dragging a card
3. Move cursor to edge of board viewport

**Expected**:
- Only the board being interacted with scrolls
- Other embeds/views don't scroll

## Category 4: Editing

### Test 4.1: Add Card via Button
**Steps**:
1. Open embed
2. Click "Add a card" button
3. Type card title
4. Press Enter or click away

**Expected**:
- Card created
- State persists

### Test 4.2: Add Card - Outside Click with Content
**Steps**:
1. Open embed
2. Click "Add a card"
3. Type "Test content"
4. Click outside the input (not on cancel)

**Expected**:
- Card created with "Test content"
- Not discarded

### Test 4.3: Add Card - Outside Click Empty
**Steps**:
1. Open embed
2. Click "Add a card"
3. Leave input empty
4. Click outside

**Expected**:
- No card created
- Form closes cleanly

### Test 4.4: Edit Existing Card in Embed
**Steps**:
1. Open embed
2. Double-click a card to edit
3. Modify content
4. Save (Enter or click away)

**Expected**:
- Changes saved
- View updates

### Test 4.5: Add Lane in Embed
**Steps**:
1. Open embed
2. Add a new lane

**Expected**:
- Lane added
- Persists to file

## Category 5: Edge Cases

### Test 5.1: Delete Source File
**Steps**:
1. Open `TransclusionNote.md` with embed
2. Delete `TestKanban1.md` from file explorer
3. Observe embed

**Expected**:
- Embed handles gracefully (error message or disappears)
- No console errors/crashes

### Test 5.2: Rename Source File
**Steps**:
1. Open `TransclusionNote.md` with embed
2. Rename `TestKanban1.md` to `RenamedKanban.md`

**Expected**:
- Embed updates if Obsidian updates links
- Or shows broken embed (acceptable)
- No crash

### Test 5.3: Pop Out Window with Embed
**Steps**:
1. Open `TransclusionNote.md` with embed
2. Pop out the tab to new window
3. Interact with embed

**Expected**:
- Embed re-registers with new window
- Drag-drop works
- State sync works

### Test 5.4: Close View While Embed Exists
**Steps**:
1. Open `TestKanban1.md` in View (Tab 1)
2. Open `TransclusionNote.md` with embed (Tab 2)
3. Close Tab 1
4. Edit in embed

**Expected**:
- Embed still works
- Edits persist
- StateManager not destroyed (embed keeps it alive)

### Test 5.5: Close Embed While View Exists
**Steps**:
1. Open `TestKanban1.md` in View (Tab 1)
2. Open `TransclusionNote.md` with embed (Tab 2)
3. Close Tab 2
4. Continue editing in View

**Expected**:
- View unaffected
- StateManager still exists

## Category 6: Performance

### Test 6.1: Many Embeds
**Steps**:
1. Create note with 10 kanban transclusions
2. Scroll through note

**Expected**:
- Reasonable performance
- No freezing
- Embeds lazily load if off-screen (bonus)

### Test 6.2: Large Board in Embed
**Steps**:
1. Create kanban with 100+ cards
2. Embed it
3. Scroll through embed

**Expected**:
- Smooth scrolling
- No major performance issues

## Test Result Template

```markdown
## Test: [ID] [Name]

**Date**:
**Version**:
**Result**: PASS / FAIL

**Steps Taken**:
1.
2.

**Actual Result**:


**Notes**:

```

## Automated Test Ideas (Future)

If implementing automated tests:

1. **Unit tests** for StateManager embed registration
2. **Unit tests** for KanbanInstance type handling
3. **Integration tests** for post-processor detection logic
4. **E2E tests** using Playwright/Puppeteer for drag-drop scenarios
