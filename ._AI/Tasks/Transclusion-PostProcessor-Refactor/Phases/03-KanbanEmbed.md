# Phase 3: Implement KanbanEmbed

## Objective
Create the KanbanEmbed class that handles transcluded kanban boards as a MarkdownRenderChild.

## New File: `src/KanbanEmbed.ts`

### Full Implementation

```typescript
import EventEmitter from 'eventemitter3';
import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  TFile,
} from 'obsidian';
import { render, unmountComponentAtNode } from 'preact/compat';

import { KanbanSettings, KanbanViewSettings } from './Settings';
import { EmbedKanban } from './components/EmbedKanban';
import { Board } from './components/types';
import { getParentWindow } from './dnd/util/getWindow';
import { generateInstanceId } from './components/helpers';
import KanbanPlugin from './main';
import { frontmatterKey } from './parsers/common';

/**
 * KanbanEmbed represents a transcluded kanban board rendered via markdown post-processor.
 * It implements similar interfaces to KanbanView for compatibility with the shared
 * rendering components and drag-drop system.
 */
export class KanbanEmbed extends MarkdownRenderChild {
  plugin: KanbanPlugin;
  file: TFile;
  ctx: MarkdownPostProcessorContext;
  emitter: EventEmitter;

  private instanceId: string;
  viewSettings: KanbanViewSettings = {};
  data: string = '';

  constructor(
    containerEl: HTMLElement,
    file: TFile,
    plugin: KanbanPlugin,
    ctx: MarkdownPostProcessorContext
  ) {
    super(containerEl);
    this.plugin = plugin;
    this.file = file;
    this.ctx = ctx;
    this.instanceId = generateInstanceId();
    this.emitter = new EventEmitter();
  }

  /**
   * Unique ID for this embed instance.
   * Format: embed-{instanceId}:::{filePath}
   *
   * The ::: delimiter is important for DragDropApp to extract the file path
   * and look up the correct StateManager.
   */
  get id(): string {
    return `embed-${this.instanceId}:::${this.file.path}`;
  }

  /**
   * Whether this is the primary instance for disk writes.
   * Embeds are never primary - only KanbanView instances save to disk.
   */
  get isPrimary(): boolean {
    return false;
  }

  /**
   * Get the window containing this embed.
   */
  getWindow(): Window & typeof globalThis {
    return getParentWindow(this.containerEl) as Window & typeof globalThis;
  }

  /**
   * Called by Obsidian when the embed is loaded.
   */
  async onload(): Promise<void> {
    // Read the file content
    const fileContent = await this.plugin.app.vault.read(this.file);
    this.data = fileContent;

    // Clear any existing content (like the default embed preview)
    this.containerEl.empty();

    // Add identifying class
    this.containerEl.addClass('kanban-embed');
    this.containerEl.setAttribute('data-kanban-embed-id', this.id);

    // Register with the plugin
    this.plugin.addEmbed(this, this.data, true);
  }

  /**
   * Called by Obsidian when the embed is unloaded.
   */
  onunload(): void {
    this.emitter.removeAllListeners();
    unmountComponentAtNode(this.containerEl);
    this.plugin.removeEmbed(this);
  }

  /**
   * Get a portal element for rendering the kanban board.
   * Called by DragDropApp to create the Preact portal.
   */
  getPortal(): JSX.Element {
    const stateManager = this.plugin.stateManagers.get(this.file);
    return <EmbedKanban stateManager={stateManager} embed={this} />;
  }

  /**
   * View state management (per-embed UI state like collapsed lanes).
   * Note: Embeds have their own view state that is NOT persisted.
   */
  getViewState<K extends keyof KanbanViewSettings>(key: K): KanbanViewSettings[K] {
    const stateManager = this.plugin.stateManagers.get(this.file);
    const settingVal = stateManager?.getSetting(key);
    return this.viewSettings[key] ?? settingVal;
  }

  setViewState<K extends keyof KanbanViewSettings>(
    key: K,
    val?: KanbanViewSettings[K],
    globalUpdater?: (old: KanbanViewSettings[K]) => KanbanViewSettings[K]
  ): void {
    if (globalUpdater) {
      // For global updates, only update this embed (not views)
      this.viewSettings[key] = globalUpdater(this.viewSettings[key]);
    } else if (val !== undefined) {
      this.viewSettings[key] = val;
    }
    // Embeds don't request workspace layout save
  }

  /**
   * Populate view state with defaults from board settings.
   */
  populateViewState(settings: KanbanSettings): void {
    this.viewSettings['kanban-plugin'] ??= settings['kanban-plugin'] || 'board';
    this.viewSettings['list-collapse'] ??= settings['list-collapse'] || [];
  }

  /**
   * Update the data string (called by StateManager on state changes).
   */
  updateData(data: string): void {
    this.data = data;
  }
}

/**
 * Type union for any kanban instance (View or Embed).
 * Both types implement these common members.
 */
export type KanbanInstance = {
  id: string;
  file: TFile;
  isPrimary: boolean;
  emitter: EventEmitter;
  viewSettings: KanbanViewSettings;
  data: string;

  getWindow(): Window & typeof globalThis;
  getPortal(): JSX.Element;
  getViewState<K extends keyof KanbanViewSettings>(key: K): KanbanViewSettings[K];
  setViewState<K extends keyof KanbanViewSettings>(
    key: K,
    val?: KanbanViewSettings[K],
    globalUpdater?: (old: KanbanViewSettings[K]) => KanbanViewSettings[K]
  ): void;
  populateViewState(settings: KanbanSettings): void;
};
```

## Changes to `src/StateManager.ts`

### Add embedSet

```typescript
// BEFORE (line 21)
viewSet: Set<KanbanView> = new Set();

// AFTER
viewSet: Set<KanbanView> = new Set();
embedSet: Set<KanbanEmbed> = new Set();
```

### Update getAView to handle embeds

```typescript
// BEFORE (line 46-48)
getAView(): KanbanView {
  return this.viewSet.values().next().value;
}

// AFTER
getAView(): KanbanView | null {
  // Prefer views over embeds (views are primary for saving)
  if (this.viewSet.size > 0) {
    return this.viewSet.values().next().value;
  }
  return null;
}

getAnInstance(): KanbanInstance | null {
  // Get any instance (view preferred, then embed)
  const view = this.getAView();
  if (view) return view;

  if (this.embedSet.size > 0) {
    return this.embedSet.values().next().value;
  }
  return null;
}
```

### Add embed registration methods

```typescript
async registerEmbed(embed: KanbanEmbed, data: string, shouldParseData: boolean) {
  if (!this.embedSet.has(embed)) {
    this.embedSet.add(embed);
  }

  // Delay for UI loading indicator
  await new Promise((res) => activeWindow.setTimeout(res, 10));

  if (shouldParseData && !this.state) {
    // Only parse if no existing state
    await this.newBoardForEmbed(embed, data);
  }

  embed.populateViewState(this.state?.data.settings || {});
}

unregisterEmbed(embed: KanbanEmbed) {
  if (this.embedSet.has(embed)) {
    this.embedSet.delete(embed);

    if (this.viewSet.size === 0 && this.embedSet.size === 0) {
      this.onEmpty();
    }
  }
}

async newBoardForEmbed(embed: KanbanEmbed, md: string) {
  try {
    const board = this.getParsedBoard(md);
    this.setState(board, false);
  } catch (e) {
    this.setError(e);
  }
}
```

### Update constructor to handle both views and embeds

```typescript
// BEFORE (line 30-43)
constructor(
  app: App,
  initialView: KanbanView,
  initialData: string,
  onEmpty: () => void,
  getGlobalSettings: () => KanbanSettings
) {
  // ...
  this.registerView(initialView, initialData, true);
}

// AFTER
constructor(
  app: App,
  initialInstance: KanbanInstance,
  initialData: string,
  onEmpty: () => void,
  getGlobalSettings: () => KanbanSettings
) {
  this.app = app;
  this.file = initialInstance.file;
  this.onEmpty = onEmpty;
  this.getGlobalSettings = getGlobalSettings;
  this.parser = new ListFormat(this);

  // Register based on instance type
  if ('leaf' in initialInstance) {
    // It's a KanbanView
    this.registerView(initialInstance as KanbanView, initialData, true);
  } else {
    // It's a KanbanEmbed
    this.registerEmbed(initialInstance as KanbanEmbed, initialData, true);
  }
}
```

### Update saveToDisk to update all instances

```typescript
saveToDisk() {
  if (this.state.data.errors.length > 0) {
    return;
  }

  const view = this.getAView();

  if (view) {
    const fileStr = this.parser.boardToMd(this.state);
    view.requestSaveToDisk(fileStr);

    // Update all views
    this.viewSet.forEach((view) => {
      view.data = fileStr;
    });

    // Update all embeds
    this.embedSet.forEach((embed) => {
      embed.updateData(fileStr);
    });
  }
}
```

### Update setState notifications

```typescript
setState(state: Board | ((board: Board) => Board), shouldSave: boolean = true) {
  try {
    // ... existing state update logic ...

    // Notify all views
    this.viewSet.forEach((view) => {
      view.initHeaderButtons();
      view.validatePreviewCache(newState);
    });

    // No equivalent for embeds (they don't have header buttons)

    if (shouldSave) {
      this.saveToDisk();
    }

    this.stateReceivers.forEach((receiver) => receiver(this.state));

    // ... existing settings notification logic ...
  } catch (e) {
    console.error(e);
    this.setError(e);
  }
}
```

## Embed-Specific Considerations

### 1. No Save to Disk from Embeds
Embeds never save to disk directly. The StateManager checks `isPrimary` which is always `false` for embeds.

### 2. View State is Ephemeral
Embed view state (collapsed lanes, etc.) is not persisted. When the embed is reloaded, it uses defaults from board settings.

### 3. Header Buttons
Embeds don't have header action buttons. The `initHeaderButtons` method is view-specific.

### 4. Preview Cache
Embeds should have their own preview cache for item markdown rendering. This will be handled in the EmbedKanban component.

## Verification Checklist

- [ ] KanbanEmbed extends MarkdownRenderChild
- [ ] KanbanEmbed.id uses embed-{instanceId}:::{filePath} format
- [ ] KanbanEmbed.isPrimary returns false
- [ ] StateManager handles both views and embeds
- [ ] saveToDisk updates both views and embeds
- [ ] Empty check considers both viewSet and embedSet
- [ ] Embed lifecycle (onload/onunload) properly manages registration
