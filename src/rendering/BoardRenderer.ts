import EventEmitter from 'eventemitter3';
import { App, Component, TFile } from 'obsidian';
import { createElement } from 'preact';
import { JSX } from 'preact/compat';

import { KanbanViewSettings } from '../Settings';
import { StateManager } from '../StateManager';
import { Kanban } from '../components/Kanban';
import { BasicMarkdownRenderer } from '../components/MarkdownRenderer/MarkdownRenderer';
import { Board } from '../components/types';
import { getParentWindow } from '../dnd/util/getWindow';
import { PromiseQueue } from '../helpers/util';
import KanbanPlugin from '../main';
import { RenderContext, RenderContextType, generateRendererId } from './RenderContext';

/**
 * BoardRenderer handles rendering a kanban board in any context (view or embed).
 * It provides the interface that components expect from KanbanView, but is decoupled
 * from TextFileView so it can be used in embedded contexts.
 */
export class BoardRenderer extends Component {
  readonly id: string;
  readonly plugin: KanbanPlugin;
  readonly file: TFile;
  readonly app: App;
  readonly context: RenderContext;
  readonly containerEl: HTMLElement;
  readonly contentEl: HTMLElement;
  readonly emitter: EventEmitter;

  stateManager: StateManager;
  previewCache: Map<string, BasicMarkdownRenderer> = new Map();
  previewQueue: PromiseQueue;
  activeEditor: any = null;
  viewSettings: KanbanViewSettings = {};

  private _isPrimary: boolean = false;

  constructor(
    containerEl: HTMLElement,
    file: TFile,
    plugin: KanbanPlugin,
    contextType: RenderContextType
  ) {
    super();

    this.id = generateRendererId();
    this.plugin = plugin;
    this.file = file;
    this.app = plugin.app;
    this.containerEl = containerEl;
    this.contentEl = containerEl;
    this.emitter = new EventEmitter();

    this.context = {
      type: contextType,
      containerEl,
      file,
      isEditable: true,
      boardRenderer: this,
    };

    this.previewQueue = new PromiseQueue(() => this.emitter.emit('queueEmpty'));
  }

  get isPrimary(): boolean {
    return this._isPrimary;
  }

  set isPrimary(value: boolean) {
    this._isPrimary = value;
  }

  get isShiftPressed(): boolean {
    return this.plugin.isShiftPressed;
  }

  getWindow(): Window & typeof globalThis {
    return getParentWindow(this.containerEl) as Window & typeof globalThis;
  }

  async initialize(stateManager: StateManager): Promise<void> {
    // Set state manager reference
    this.stateManager = stateManager;

    // Populate view settings from board settings
    if (stateManager.state) {
      this.populateViewState(stateManager.state.data.settings);
    }
  }

  async prerender(board: Board): Promise<void> {
    board.children.forEach((lane) => {
      lane.children.forEach((item) => {
        if (this.previewCache.has(item.id)) return;

        this.previewQueue.add(async () => {
          const preview = this.addChild(new BasicMarkdownRenderer(this as any, item.data.title));
          this.previewCache.set(item.id, preview);
          await preview.renderCapability.promise;
        });
      });
    });

    if (this.previewQueue.isRunning) {
      await new Promise((res) => {
        this.emitter.once('queueEmpty', res);
      });
    }
  }

  validatePreviewCache(board: Board): void {
    const seenKeys = new Set<string>();
    board.children.forEach((lane) => {
      seenKeys.add(lane.id);
      lane.children.forEach((item) => {
        seenKeys.add(item.id);
      });
    });

    for (const k of this.previewCache.keys()) {
      if (!seenKeys.has(k)) {
        this.removeChild(this.previewCache.get(k));
        this.previewCache.delete(k);
      }
    }
  }

  populateViewState(settings: any): void {
    this.viewSettings['kanban-plugin'] ??= settings['kanban-plugin'] || 'board';
    this.viewSettings['list-collapse'] ??= settings['list-collapse'] || [];
  }

  getViewState<K extends keyof KanbanViewSettings>(key: K): any {
    const settingVal = this.stateManager.getSetting(key);
    return this.viewSettings[key] ?? settingVal;
  }

  useViewState<K extends keyof KanbanViewSettings>(key: K): any {
    const settingVal = this.stateManager.useSetting(key);
    return this.viewSettings[key] ?? settingVal;
  }

  setViewState<K extends keyof KanbanViewSettings>(
    key: K,
    val?: KanbanViewSettings[K],
    globalUpdater?: (old: KanbanViewSettings[K]) => KanbanViewSettings[K]
  ): void {
    if (globalUpdater) {
      this.stateManager.rendererSet.forEach((renderer) => {
        renderer.viewSettings[key] = globalUpdater(renderer.viewSettings[key]);
      });
    } else if (val !== undefined) {
      this.viewSettings[key] = val;
    }

    this.app.workspace.requestSaveLayout();
  }

  getPortal(): JSX.Element {
    // Guard against undefined stateManager during initialization
    if (!this.stateManager) {
      return createElement('div', { className: 'kanban-plugin__loading' }, 'Loading...');
    }

    const props = {
      stateManager: this.stateManager,
      view: this as any,
    };
    return createElement(Kanban, props);
  }

  onunload(): void {
    super.onunload();

    this.previewQueue.clear();
    this.previewCache.clear();
    this.emitter.emit('queueEmpty');
    this.emitter.removeAllListeners();
    this.activeEditor = null;
  }

  destroy(): void {
    this.unload();
  }
}
