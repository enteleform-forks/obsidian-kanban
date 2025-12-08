import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import { StateField } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { editorEditorField, editorInfoField, editorLivePreviewField, TFile } from 'obsidian';

import { KanbanLivePreviewEmbed } from '../KanbanEmbed';
import { hasFrontmatterKey } from '../helpers';
import type KanbanPlugin from '../main';

// Node type names from Obsidian's syntax tree for embeds
const EMBED_LINK_NODE = 'hmd-embed_hmd-internal-link';
const EMBED_START_NODE = 'formatting-embed_formatting-link_formatting-link-start';
const EMBED_END_NODE = 'formatting-link_formatting-link-end';

/**
 * Gets the current file from state.
 */
function getCurrentFileFromState(state: any): TFile | null {
  try {
    return state.field(editorInfoField)?.file ?? null;
  } catch {
    return null;
  }
}

/**
 * Checks if the editor is in Live Preview mode.
 */
function isLivePreviewFromState(state: any): boolean {
  try {
    return state.field(editorLivePreviewField) ?? false;
  } catch {
    return false;
  }
}

/**
 * Checks if a selection overlaps with a given range.
 */
function checkSelectionOverlap(state: any, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.to >= from && range.from <= to) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the full embed range by looking for the start and end formatting nodes
 * around an embed link node.
 */
function findEmbedRange(
  state: any,
  linkNode: SyntaxNode
): { from: number; to: number } | null {
  let embedStart: number | null = null;
  let embedEnd: number | null = null;

  const lineStart = state.doc.lineAt(linkNode.from).from;
  syntaxTree(state).iterate({
    from: lineStart,
    to: linkNode.from,
    enter: (nodeRef) => {
      if (nodeRef.node.type.name === EMBED_START_NODE) {
        embedStart = nodeRef.from;
      }
    },
  });

  const lineEnd = state.doc.lineAt(linkNode.to).to;
  syntaxTree(state).iterate({
    from: linkNode.to,
    to: lineEnd,
    enter: (nodeRef) => {
      if (nodeRef.node.type.name === EMBED_END_NODE && embedEnd === null) {
        embedEnd = nodeRef.to;
      }
    },
  });

  if (embedStart !== null && embedEnd !== null) {
    return { from: embedStart, to: embedEnd };
  }

  return null;
}

/**
 * CodeMirror 6 Widget for rendering kanban boards in Live Preview.
 */
class KanbanWidget extends WidgetType {
  private plugin: KanbanPlugin;
  private file: TFile;
  private filePath: string;
  private sourcePath: string;
  private rangeKey: string;
  private embed: KanbanLivePreviewEmbed | null = null;

  constructor(
    plugin: KanbanPlugin,
    file: TFile,
    sourcePath: string,
    rangeFrom: number,
    rangeTo: number
  ) {
    super();
    this.plugin = plugin;
    this.file = file;
    this.filePath = file.path;
    this.sourcePath = sourcePath;
    this.rangeKey = `${rangeFrom}-${rangeTo}`;
  }

  eq(other: KanbanWidget): boolean {
    // Must match file AND position to be considered equal
    return other.filePath === this.filePath && other.rangeKey === this.rangeKey;
  }

  /**
   * Tell CodeMirror to let the widget handle mouse events.
   * Returning false means "don't ignore this event" = widget handles it.
   */
  ignoreEvent(event: Event): boolean {
    // Handle all mouse/pointer events to prevent cursor placement
    const dominated =
      event.type === 'mousedown' ||
      event.type === 'mouseup' ||
      event.type === 'click' ||
      event.type === 'pointerdown' ||
      event.type === 'pointerup';
    return !dominated;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.addClass(
      'kanban-embed',
      'kanban-live-preview-embed',
      'internal-embed',
      'markdown-embed',
      'cm-embed-block'
    );
    container.setAttribute('src', this.filePath);
    container.setAttribute('contenteditable', 'false');

    const ctx = {
      app: this.plugin.app,
      containerEl: container,
      state: {},
    };

    this.embed = new KanbanLivePreviewEmbed(ctx, this.file, '', this.plugin);
    this.embed.load();

    return container;
  }

  destroy(): void {
    if (this.embed) {
      this.embed.unload();
      this.embed = null;
    }
  }
}

/**
 * Check if an element is inside a kanban embed widget.
 */
function isInsideKanbanEmbed(element: HTMLElement | null): boolean {
  while (element !== null) {
    if (element.classList.contains('kanban-live-preview-embed')) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

/**
 * Build decorations for kanban embeds from state only.
 * Uses the full document since we don't have view.visibleRanges.
 */
function buildDecorationsFromState(state: any, plugin: KanbanPlugin): DecorationSet {
  if (!isLivePreviewFromState(state)) {
    return Decoration.none;
  }

  const currentFile = getCurrentFileFromState(state);
  if (!currentFile) {
    return Decoration.none;
  }

  const widgets: Range<Decoration>[] = [];
  const processedRanges = new Set<string>();

  // Iterate over full document
  syntaxTree(state).iterate({
    enter: (nodeRef) => {
      const node = nodeRef.node;

      if (node.type.name !== EMBED_LINK_NODE) return;

      const linkText = state.sliceDoc(node.from, node.to).trim();
      const embedRange = findEmbedRange(state, node);
      if (!embedRange) return;

      const rangeKey = `${embedRange.from}-${embedRange.to}`;
      if (processedRanges.has(rangeKey)) return;
      processedRanges.add(rangeKey);

      // Skip if cursor is within the embed (allow editing the link)
      if (checkSelectionOverlap(state, embedRange.from, embedRange.to)) {
        return;
      }

      const linkedFile = plugin.app.metadataCache.getFirstLinkpathDest(linkText, currentFile.path);

      if (linkedFile instanceof TFile && hasFrontmatterKey(linkedFile)) {
        if (linkedFile.path === currentFile.path) return;

        const widget = new KanbanWidget(
          plugin,
          linkedFile,
          currentFile.path,
          embedRange.from,
          embedRange.to
        );
        const decoration = Decoration.replace({
          widget,
          block: true,
        });

        widgets.push(decoration.range(embedRange.from, embedRange.to));
      }
    },
  });

  widgets.sort((a, b) => a.from - b.from);
  return Decoration.set(widgets);
}

/**
 * Creates CodeMirror 6 extensions for kanban embeds in Live Preview.
 *
 * Block decorations can ONLY be provided directly through StateField.
 * We rebuild on doc changes and selection changes.
 */
export function createKanbanViewPlugin(plugin: KanbanPlugin): Extension {
  // StateField that holds and provides block decorations directly
  const decorationField = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorationsFromState(state, plugin);
    },
    update(decorations, tr) {
      // Rebuild decorations on doc change or selection change
      if (tr.docChanged || tr.selection) {
        return buildDecorationsFromState(tr.state, plugin);
      }
      return decorations;
    },
    // Provide decorations DIRECTLY - this allows block decorations
    provide: (field) => EditorView.decorations.from(field),
  });

  // ViewPlugin only for mouse event handling (no dispatching)
  const viewPlugin = ViewPlugin.define((view) => {
    const boundHandleMouseEvent = (e: MouseEvent) => {
      if (e.target instanceof HTMLElement && isInsideKanbanEmbed(e.target)) {
        e.stopPropagation();
      }
    };

    view.dom.addEventListener('mousedown', boundHandleMouseEvent, true);
    view.dom.addEventListener('mouseup', boundHandleMouseEvent, true);
    view.dom.addEventListener('click', boundHandleMouseEvent, true);

    return {
      destroy() {
        view.dom.removeEventListener('mousedown', boundHandleMouseEvent, true);
        view.dom.removeEventListener('mouseup', boundHandleMouseEvent, true);
        view.dom.removeEventListener('click', boundHandleMouseEvent, true);
      },
    };
  });

  // Atomic ranges for cursor navigation
  const atomicRanges = EditorView.atomicRanges.of((view) => {
    return view.state.field(decorationField, false) ?? Decoration.none;
  });

  return [decorationField, viewPlugin, atomicRanges];
}
