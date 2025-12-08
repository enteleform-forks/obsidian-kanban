import EventEmitter from 'eventemitter3';
import { MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from 'obsidian';
import { JSX } from 'preact/compat';

import { KanbanView } from './KanbanView';
import { KanbanSettings, KanbanViewSettings } from './Settings';
import { EmbedKanban } from './components/EmbedKanban';
import { generateInstanceId } from './components/helpers';
import { getParentWindow } from './dnd/util/getWindow';
import KanbanPlugin from './main';

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

    // Handle window migration (similar to KanbanView)
    this.register(
      (this.containerEl as any).onWindowMigrated(() => {
        this.plugin.removeEmbed(this);
        this.plugin.addEmbed(this, this.data, false);
      })
    );

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
        if (oldPath === this.file.path && file instanceof TFile) {
          this.file = file;
        }
      })
    );
  }

  /**
   * Called by Obsidian when the embed is unloaded.
   */
  onunload(): void {
    this.emitter.removeAllListeners();
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

  /**
   * Hook version for use in components.
   * Uses stateManager.useSetting for reactivity.
   */
  useViewState<K extends keyof KanbanViewSettings>(key: K): KanbanViewSettings[K] {
    const stateManager = this.plugin.stateManagers.get(this.file);
    const settingVal = stateManager?.useSetting(key);
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
 * KanbanLivePreviewEmbed handles kanban embeds in Live Preview mode.
 * This is created by the embed registry when a kanban file is embedded.
 *
 * The embed registry expects components with specific methods like loadFile().
 * We extend MarkdownRenderChild and add the required interface.
 */
export class KanbanLivePreviewEmbed extends MarkdownRenderChild {
  plugin: KanbanPlugin;
  file: TFile;
  subpath: string;
  emitter: EventEmitter;

  private instanceId: string;
  private loaded: boolean = false;
  viewSettings: KanbanViewSettings = {};
  data: string = '';

  constructor(
    ctx: { app: any; containerEl: HTMLElement; state?: any; displayMode?: boolean },
    file: TFile,
    subpath: string,
    plugin: KanbanPlugin
  ) {
    super(ctx.containerEl);
    this.plugin = plugin;
    this.file = file;
    this.subpath = subpath;
    this.instanceId = generateInstanceId();
    this.emitter = new EventEmitter();
  }

  get id(): string {
    return `embed-${this.instanceId}:::${this.file.path}`;
  }

  get isPrimary(): boolean {
    return false;
  }

  getWindow(): Window & typeof globalThis {
    return getParentWindow(this.containerEl) as Window & typeof globalThis;
  }

  /**
   * Called by Obsidian's embed system to load the file content.
   * This is the main entry point for Live Preview embeds.
   */
  async loadFile(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    const fileContent = await this.plugin.app.vault.read(this.file);
    this.data = fileContent;

    this.containerEl.empty();
    this.containerEl.addClass('kanban-embed', 'kanban-live-preview-embed');
    this.containerEl.setAttribute('data-kanban-embed-id', this.id);

    this.plugin.addEmbed(this, this.data, true);

    this.registerEvent(
      this.plugin.app.vault.on('delete', (file) => {
        if (file === this.file) {
          this.unload();
        }
      })
    );

    this.registerEvent(
      this.plugin.app.vault.on('rename', (file, oldPath) => {
        if (oldPath === this.file.path && file instanceof TFile) {
          this.file = file;
        }
      })
    );
  }

  /**
   * Called by MarkdownRenderChild lifecycle.
   * For Live Preview, loadFile() is the main entry point, but onload() may also be called.
   */
  async onload(): Promise<void> {
    // loadFile() handles initialization for Live Preview embeds
    // onload() is called by MarkdownRenderChild but we defer to loadFile()
    await this.loadFile();
  }

  onunload(): void {
    this.emitter.removeAllListeners();
    this.plugin.removeEmbed(this);
    this.loaded = false;
  }

  getPortal(): JSX.Element {
    const stateManager = this.plugin.stateManagers.get(this.file);
    return <EmbedKanban stateManager={stateManager} embed={this} />;
  }

  getViewState<K extends keyof KanbanViewSettings>(key: K): KanbanViewSettings[K] {
    const stateManager = this.plugin.stateManagers.get(this.file);
    const settingVal = stateManager?.getSetting(key);
    return this.viewSettings[key] ?? settingVal;
  }

  useViewState<K extends keyof KanbanViewSettings>(key: K): KanbanViewSettings[K] {
    const stateManager = this.plugin.stateManagers.get(this.file);
    const settingVal = stateManager?.useSetting(key);
    return this.viewSettings[key] ?? settingVal;
  }

  setViewState<K extends keyof KanbanViewSettings>(
    key: K,
    val?: KanbanViewSettings[K],
    globalUpdater?: (old: KanbanViewSettings[K]) => KanbanViewSettings[K]
  ): void {
    if (globalUpdater) {
      this.viewSettings[key] = globalUpdater(this.viewSettings[key]);
    } else if (val !== undefined) {
      this.viewSettings[key] = val;
    }
  }

  populateViewState(settings: KanbanSettings): void {
    this.viewSettings['kanban-plugin'] ??= settings['kanban-plugin'] || 'board';
    this.viewSettings['list-collapse'] ??= settings['list-collapse'] || [];
  }

  updateData(data: string): void {
    this.data = data;
  }
}

/**
 * Type union for any kanban instance (View or Embed).
 * Both types implement these common members.
 */
export type KanbanInstance = KanbanView | KanbanEmbed | KanbanLivePreviewEmbed;

/**
 * Type guard to check if an instance is a KanbanView
 */
export function isKanbanView(instance: KanbanInstance): instance is KanbanView {
  return 'leaf' in instance;
}

/**
 * Type guard to check if an instance is a KanbanEmbed
 */
export function isKanbanEmbed(instance: KanbanInstance): instance is KanbanEmbed | KanbanLivePreviewEmbed {
  return !('leaf' in instance);
}
