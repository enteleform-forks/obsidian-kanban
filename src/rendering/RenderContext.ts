import { TFile } from 'obsidian';

export type RenderContextType = 'view' | 'embed';

export interface RenderContext {
  type: RenderContextType;
  containerEl: HTMLElement;
  file: TFile;
  isEditable: boolean;
  boardRenderer?: any; // Avoid circular dependency
}

export function generateRendererId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
