import { createContext } from 'preact/compat';
import { KanbanViewSettings } from 'src/Settings';
import { StateManager } from 'src/StateManager';
import { IntersectionObserverHandler } from 'src/dnd/managers/ScrollManager';

import { BoardModifiers } from '../helpers/boardModifiers';
import { Item, Lane, LaneSort } from './types';

/**
 * Interface for view state operations.
 * Implemented by both KanbanView and KanbanEmbed.
 */
export interface ViewStateAccessor {
  getViewState: <K extends keyof KanbanViewSettings>(key: K) => KanbanViewSettings[K];
  setViewState: <K extends keyof KanbanViewSettings>(
    key: K,
    val?: KanbanViewSettings[K],
    globalUpdater?: (old: KanbanViewSettings[K]) => KanbanViewSettings[K]
  ) => void;
  useViewState: <K extends keyof KanbanViewSettings>(key: K) => KanbanViewSettings[K];
}

export interface KanbanContextProps {
  filePath?: string;
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  scopeId: string;
  containerEl: HTMLElement;
  isEmbed?: boolean;
  viewStateAccessor: ViewStateAccessor;
}

export const KanbanContext = createContext<KanbanContextProps>(null);

/**
 * Helper to get the plugin from stateManager for MarkdownEditor instantiation.
 * Works for both Views and Embeds since plugin is accessed through stateManager.app.
 */
export function getPluginFromContext(ctx: KanbanContextProps) {
  // First try to get plugin from a view if available
  const view = ctx.stateManager.getAView();
  if (view?.plugin) {
    return view.plugin;
  }

  // Fallback: get plugin from any embed
  const embed = ctx.stateManager.getAnEmbed?.();
  if (embed?.plugin) {
    return embed.plugin;
  }

  return null;
}

export interface SearchContextProps {
  query: string;
  items: Set<Item>;
  lanes: Set<Lane>;
  search: (query: string, immediate?: boolean) => void;
}

export const SearchContext = createContext<SearchContextProps | null>(null);
export const SortContext = createContext<LaneSort | string | null>(null);
export const IntersectionObserverContext = createContext<{
  registerHandler: (el: HTMLElement, handler: IntersectionObserverHandler) => void;
  unregisterHandler: (el: HTMLElement) => void;
} | null>(null);
