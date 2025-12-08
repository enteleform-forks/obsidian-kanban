# Phase 1: Plugin Infrastructure Changes

## Objective
Extend the plugin infrastructure to support both KanbanView and KanbanEmbed instances, with unified registration and lookup.

## Changes to `src/main.ts`

### 1. Update WindowRegistry Interface

**Location**: Lines 24-28

```typescript
// BEFORE
interface WindowRegistry {
  viewMap: Map<string, KanbanView>;
  viewStateReceivers: Array<(views: KanbanView[]) => void>;
  appRoot: HTMLElement;
}

// AFTER
interface WindowRegistry {
  viewMap: Map<string, KanbanView>;
  embedMap: Map<string, KanbanEmbed>;  // NEW
  instanceStateReceivers: Array<(instances: KanbanInstance[]) => void>;  // RENAMED
  appRoot: HTMLElement;
}
```

### 2. Add Type Union for Kanban Instances

**Location**: After imports (around line 22)

```typescript
import { KanbanEmbed, KanbanInstance } from './KanbanEmbed';

// KanbanInstance is a union type: KanbanView | KanbanEmbed
// Both have: id, file, getWindow(), isPrimary, etc.
```

### 3. Add Embed Management Methods

**Location**: After `getKanbanView` method (around line 180)

```typescript
getKanbanEmbed(id: string, win: Window): KanbanEmbed | null {
  const reg = this.windowRegistry.get(win);

  if (reg?.embedMap.has(id)) {
    return reg.embedMap.get(id);
  }

  for (const reg of this.windowRegistry.values()) {
    if (reg.embedMap.has(id)) {
      return reg.embedMap.get(id);
    }
  }

  return null;
}

/**
 * Unified lookup for any kanban instance (View or Embed)
 * Used by DragDropApp for cross-instance drag operations
 */
getKanbanInstance(scopeId: string, win: Window): KanbanInstance | null {
  // Try view first
  const view = this.getKanbanView(scopeId, win);
  if (view) return view;

  // Then try embed
  return this.getKanbanEmbed(scopeId, win);
}

/**
 * Get StateManager by scopeId (extracts file path from scopeId)
 */
getStateManagerFromScopeId(scopeId: string, win: Window): StateManager | null {
  const instance = this.getKanbanInstance(scopeId, win);
  if (!instance) return null;
  return this.stateManagers.get(instance.file);
}
```

### 4. Add Embed Registration Methods

**Location**: After `addView` method (around line 240)

```typescript
addEmbed(embed: KanbanEmbed, data: string, shouldParseData: boolean) {
  const win = embed.getWindow();
  const reg = this.windowRegistry.get(win);

  if (!reg) return;
  if (!reg.embedMap.has(embed.id)) {
    reg.embedMap.set(embed.id, embed);
  }

  const file = embed.file;

  if (this.stateManagers.has(file)) {
    this.stateManagers.get(file).registerEmbed(embed, data, shouldParseData);
  } else {
    this.stateManagers.set(
      file,
      new StateManager(
        this.app,
        embed,  // Can accept either view or embed as initial instance
        data,
        () => this.stateManagers.delete(file),
        () => this.settings
      )
    );
  }

  reg.instanceStateReceivers.forEach((fn) => fn(this.getAllInstances(win)));
}

removeEmbed(embed: KanbanEmbed) {
  const entry = Array.from(this.windowRegistry.entries()).find(([, reg]) => {
    return reg.embedMap.has(embed.id);
  });

  if (!entry) return;

  const [win, reg] = entry;
  const file = embed.file;

  if (reg.embedMap.has(embed.id)) {
    reg.embedMap.delete(embed.id);
  }

  if (this.stateManagers.has(file)) {
    this.stateManagers.get(file).unregisterEmbed(embed);
    reg.instanceStateReceivers.forEach((fn) => fn(this.getAllInstances(win)));
  }
}
```

### 5. Add Helper Methods

**Location**: After embed methods

```typescript
getAllInstances(win: Window): KanbanInstance[] {
  const reg = this.windowRegistry.get(win);
  if (!reg) return [];

  return [
    ...Array.from(reg.viewMap.values()),
    ...Array.from(reg.embedMap.values()),
  ];
}

useAllInstances(win: Window): KanbanInstance[] {
  const [state, setState] = useState(this.getAllInstances(win));

  useEffect(() => {
    const reg = this.windowRegistry.get(win);
    reg?.instanceStateReceivers.push(setState);

    return () => {
      reg?.instanceStateReceivers.remove(setState);
    };
  }, [win]);

  return state;
}
```

### 6. Update `mount()` Method

**Location**: Lines 283-297

```typescript
mount(win: Window) {
  if (this.windowRegistry.has(win)) {
    return;
  }

  const el = win.document.body.createDiv();

  this.windowRegistry.set(win, {
    viewMap: new Map(),
    embedMap: new Map(),  // NEW
    instanceStateReceivers: [],  // RENAMED
    appRoot: el,
  });

  render(createApp(win, this), el);
}
```

### 7. Update `unmount()` Method

**Location**: Lines 299-318

```typescript
unmount(win: Window) {
  if (!this.windowRegistry.has(win)) {
    return;
  }

  const reg = this.windowRegistry.get(win);

  // Remove views
  for (const view of reg.viewMap.values()) {
    this.removeView(view);
  }

  // Remove embeds (NEW)
  for (const embed of reg.embedMap.values()) {
    this.removeEmbed(embed);
  }

  unmountComponentAtNode(reg.appRoot);

  reg.appRoot.remove();
  reg.viewMap.clear();
  reg.embedMap.clear();  // NEW
  reg.instanceStateReceivers.length = 0;
  reg.appRoot = null;

  this.windowRegistry.delete(win);
}
```

### 8. Register Post-Processor

**Location**: In `onload()` method, after view registration (around line 132)

```typescript
// Register the transclusion post-processor
this.registerMarkdownPostProcessor((el, ctx) => {
  this.processKanbanTransclusion(el, ctx);
});
```

### 9. Add Post-Processor Method

**Location**: New method in KanbanPlugin class

```typescript
/**
 * Process potential kanban transclusions in markdown
 * Only renders if the source file is different from the kanban file (transclusion)
 */
processKanbanTransclusion(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
  // Find embedded file references
  const embeddedItems = el.querySelectorAll('.internal-embed[src]');

  embeddedItems.forEach((embedEl) => {
    const src = embedEl.getAttribute('src');
    if (!src) return;

    // Resolve the file
    const file = this.app.metadataCache.getFirstLinkpathDest(src, ctx.sourcePath);
    if (!file || !(file instanceof TFile)) return;

    // Check if it's a kanban file
    if (!hasFrontmatterKey(file)) return;

    // Don't render if we're viewing the kanban file itself (not a transclusion)
    if (ctx.sourcePath === file.path) return;

    // Create the embed
    const embed = new KanbanEmbed(
      embedEl as HTMLElement,
      file,
      this,
      ctx
    );

    // Register as a MarkdownRenderChild for proper lifecycle
    ctx.addChild(embed);
  });
}
```

## Verification Checklist

- [ ] WindowRegistry has embedMap
- [ ] Plugin can add/remove embeds
- [ ] getKanbanInstance returns both views and embeds
- [ ] mount/unmount handles embeds
- [ ] Post-processor registered
- [ ] Post-processor correctly detects transclusions vs source files
