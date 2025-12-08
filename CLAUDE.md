# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
yarn dev          # Start development watch mode
yarn build        # Production build (minified, no sourcemaps)
yarn typecheck    # TypeScript type checking only
yarn lint         # Run ESLint on src/**/*.{ts,tsx}
yarn lint:fix     # Auto-fix lint issues
yarn prettier     # Format code with Prettier
yarn clean        # Format + lint:fix combined
```

## Project Overview

This is the Obsidian Kanban Plugin - a plugin for Obsidian that creates markdown-backed Kanban boards. Boards are stored as regular markdown files with a `kanban-plugin: board` frontmatter key.

### Technology Stack
- **UI Framework**: Preact (aliased as React via tsconfig paths)
- **Build Tool**: esbuild with custom configuration
- **Styling**: LESS (compiles to styles.css)
- **Language**: TypeScript with JSX (`.tsx` files)

## Architecture

### Core Components

**Entry Point**: `src/main.ts`
- `KanbanPlugin` extends Obsidian's `Plugin` class
- Manages window registry for multi-window support
- Handles view registration, commands, and monkey patches for Obsidian integration

**View Layer**: `src/KanbanView.tsx`
- `KanbanView` extends Obsidian's `TextFileView`
- Manages the visual representation of a kanban board
- Handles view state (board/table/list modes)
- Creates markdown preview cache for card content

**State Management**: `src/StateManager.ts`
- Central state manager for each kanban file
- Handles parsing, state updates, and saving to disk
- Uses React hooks (`useState`, `useSetting`) for reactive updates
- Multiple views can share one StateManager (same file open in multiple panes)

### Parsing System (`src/parsers/`)

**Format**: `src/parsers/List.ts` (ListFormat)
- Parses markdown list-based kanban format
- Uses mdast (markdown AST) for parsing/serialization
- Handles frontmatter, lanes (headers), items (list items), and archive

**Key Files**:
- `common.ts`: Base format interface, frontmatter key constant (`kanban-plugin`)
- `helpers/`: AST manipulation, board hydration, inline metadata parsing
- `extensions/`: Custom markdown extensions (block IDs, tags, internal links, task lists)

### Drag & Drop System (`src/dnd/`)

Custom drag-and-drop implementation:
- `managers/DndManager.ts`: Core DnD orchestration
- `managers/DragManager.ts`: Drag operation handling
- `managers/SortManager.ts`: Sort/reorder logic
- `managers/EntityManager.ts`: Tracks draggable entities
- `components/`: React components (Sortable, Droppable, DragOverlay, etc.)

### Component Structure (`src/components/`)

- `Kanban.tsx`: Root board component, renders lanes or table view
- `Lane/`: Lane components (header, form, settings, menu)
- `Item/`: Card components (content, checkbox, metadata, date/time)
- `Table/`: Table view components
- `Editor/`: Markdown editor, date picker (flatpickr)
- `context.ts`: React contexts (KanbanContext, SearchContext)

### Data Types (`src/components/types.ts`)

```typescript
Board -> Lane[] -> Item[]
```
- `Board`: Top-level container with settings, archive, errors
- `Lane`: Column containing items, with title and optional completion marking
- `Item`: Individual card with title, checkbox state, metadata (dates, tags, file links)

### Settings (`src/Settings.ts`)

Board-level and global settings including:
- Date/time formats and triggers
- Metadata keys for linked file properties
- Tag/date colors
- View preferences (header buttons, etc.)

### Internationalization (`src/lang/`)

- `helpers.ts`: `t()` function for translations
- `locale/`: Translation files (en.ts is the base, 20+ languages)

## Key Patterns

1. **View Registration**: Files with `kanban-plugin` frontmatter auto-open in kanban view via monkey-patched `WorkspaceLeaf.setViewState`

2. **State Flow**: Markdown file -> Parser -> Board state -> React render -> User edits -> StateManager -> Parser (serialize) -> Save to disk

3. **Multi-window Support**: Plugin maintains a `windowRegistry` Map for each Obsidian window, mounting separate React apps

4. **Preact Compatibility**: Uses `@preact/compat` aliased as `react`/`react-dom` to work with React libraries

## Build Configuration

The `esbuild.config.mjs` includes:
- LESS compilation with auto-rename to `styles.css`
- Buffer polyfill for browser compatibility
- `activeWindow.setTimeout/clearTimeout` replacement in node_modules for multi-window support
- External modules: obsidian, electron, @codemirror/*
