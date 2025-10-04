import { MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from 'obsidian';

import { hasFrontmatterKey } from '../helpers';
import KanbanPlugin from '../main';
import { BoardRenderer } from './BoardRenderer';

/**
 * Markdown postprocessor that detects embedded kanban files and renders them
 * as fully interactive kanban boards.
 */
export class KanbanPostprocessor {
  constructor(private plugin: KanbanPlugin) {}

  async process(el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
    // Get section info to check if we're processing embedded content
    const sectionInfo = ctx.getSectionInfo(el);

    // If we're processing the content of an embedded file (not the embed link itself)
    if (sectionInfo?.lineStart === 0) {
      const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (file instanceof TFile && hasFrontmatterKey(file)) {
        // We're inside an embedded kanban file
        // Clear all default markdown rendering and replace with kanban board
        el.empty();
        el.addClass('kanban-embed-content');
        await this.renderEmbeddedBoard(el, file, ctx);
        return;
      }
    }

    // Otherwise, look for embed elements (for the embedding parent file)
    let embedEl: HTMLElement | null = null;
    let src: string | null = null;

    // Case 1: Element is the embed container itself
    if (el.classList.contains('internal-embed') && el.classList.contains('markdown-embed')) {
      embedEl = el;
      src = el.getAttribute('src');
    }

    // Case 2: Embed is a child element
    if (!embedEl) {
      embedEl = el.querySelector('.internal-embed.markdown-embed') as HTMLElement;
      if (embedEl) {
        src = embedEl.getAttribute('src');
      }
    }

    if (!embedEl || !src) return;

    // Extract file path (remove any #heading or ^block references)
    const filePath = src.split('#')[0].split('^')[0];

    const file = this.plugin.app.metadataCache.getFirstLinkpathDest(filePath, ctx.sourcePath);

    if (!file) return;
    if (!(file instanceof TFile)) return;

    // Check if embedded file is a kanban board
    if (!hasFrontmatterKey(file)) return;

    // This is a kanban board - replace the default embed with our renderer
    await this.renderEmbeddedBoard(embedEl, file, ctx);
  }

  async renderEmbeddedBoard(
    embedEl: HTMLElement,
    file: TFile,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    // Clear default embed content (if not already cleared)
    if (!embedEl.hasClass('kanban-embed-content')) {
      embedEl.empty();
      embedEl.addClass('kanban-embed');
    }

    // Create container for board
    const boardContainer = embedEl.createDiv('kanban-embed-container');

    // Create cleanup handler
    const cleanup = new MarkdownRenderChild(embedEl);
    ctx.addChild(cleanup);

    // Create renderer
    const renderer = cleanup.addChild(
      new BoardRenderer(boardContainer, file, this.plugin, 'embed')
    );

    try {
      // Read file data
      const data = await this.plugin.app.vault.read(file);

      // Get or create state manager
      let stateManager = this.plugin.getStateManager(file);

      if (!stateManager) {
        // Create new state manager for this file
        const { StateManager } = await import('../StateManager');
        stateManager = new StateManager(
          this.plugin.app,
          renderer,
          data,
          () => this.plugin.stateManagers.delete(file),
          () => this.plugin.settings
        );
        this.plugin.stateManagers.set(file, stateManager);
      } else {
        // Register with existing state manager
        await stateManager.registerRenderer(renderer, data, true);
      }

      // Initialize renderer
      await renderer.initialize(stateManager);

      // Register renderer with plugin for drag-drop coordination
      // This makes the renderer available to DragDropApp which will create the portal
      const win = embedEl.ownerDocument.defaultView;
      if (win) {
        this.plugin.addRenderer(renderer, win);
      }

      // Cleanup on unload
      cleanup.onunload = () => {
        if (win) {
          this.plugin.removeRenderer(renderer, win);
        }
        renderer.destroy();
      };
    } catch (e) {
      console.error('Error rendering embedded kanban:', e);
      boardContainer.createDiv({
        text: `Error loading kanban: ${e.message}`,
        cls: 'kanban-embed-error',
      });
    }
  }
}
