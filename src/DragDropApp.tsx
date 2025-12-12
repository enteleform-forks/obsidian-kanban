import classcat from 'classcat';
import update from 'immutability-helper';
import { JSX, createPortal, memo, useCallback, useMemo } from 'preact/compat';

import { KanbanInstance, isKanbanView } from './KanbanEmbed';
import { DraggableItem } from './components/Item/Item';
import { DraggableLane } from './components/Lane/Lane';
import { KanbanContext } from './components/context';
import { c, maybeCompleteForMove } from './components/helpers';
import { Board, DataTypes, Item, Lane } from './components/types';
import { DndContext } from './dnd/components/DndContext';
import { DragOverlay } from './dnd/components/DragOverlay';
import { Entity, Nestable } from './dnd/types';
import {
  getEntityFromPath,
  insertEntity,
  moveEntity,
  removeEntity,
  updateEntity,
} from './dnd/util/data';
import { getBoardModifiers } from './helpers/boardModifiers';
import KanbanPlugin from './main';
import { frontmatterKey } from './parsers/common';
import {
  getTaskStatusDone,
  getTaskStatusPreDone,
  toggleTask,
} from './parsers/helpers/inlineMetadata';

export function createApp(win: Window, plugin: KanbanPlugin) {
  return <DragDropApp win={win} plugin={plugin} />;
}

const Instance = memo(function Instance({ instance }: { instance: KanbanInstance }) {
  // Both View and Embed have containerEl (View has contentEl which inherits from ItemView)
  const container = isKanbanView(instance) ? instance.contentEl : instance.containerEl;
  return createPortal(instance.getPortal(), container);
});

export function DragDropApp({ win, plugin }: { win: Window; plugin: KanbanPlugin }) {
  const instances = plugin.useAllInstances(win);
  const portals: JSX.Element[] = instances.map((instance) => (
    <Instance key={instance.id} instance={instance} />
  ));

  const handleDrop = useCallback(
    (dragEntity: Entity, dropEntity: Entity) => {
      if (!dragEntity || !dropEntity) {
        return;
      }

      if (dragEntity.scopeId === 'htmldnd') {
        const data = dragEntity.getData();
        const stateManager = plugin.getStateManagerFromScopeId(data.viewId, data.win);
        if (!stateManager) return;

        const dropPath = dropEntity.getPath();
        const destinationParent = getEntityFromPath(stateManager.state, dropPath.slice(0, -1));

        try {
          const items: Item[] = data.content.map((title: string) => {
            let item = stateManager.getNewItem(title, ' ');
            const isComplete = !!destinationParent?.data?.shouldMarkItemsComplete;

            if (isComplete) {
              item = update(item, { data: { checkChar: { $set: getTaskStatusPreDone() } } });
              const updates = toggleTask(item, stateManager.file);
              if (updates) {
                const [itemStrings, checkChars, thisIndex] = updates;
                const nextItem = itemStrings[thisIndex];
                const checkChar = checkChars[thisIndex];
                return stateManager.getNewItem(nextItem, checkChar);
              }
            }

            return update(item, {
              data: {
                checked: {
                  $set: !!destinationParent?.data?.shouldMarkItemsComplete,
                },
                checkChar: {
                  $set: destinationParent?.data?.shouldMarkItemsComplete
                    ? getTaskStatusDone()
                    : ' ',
                },
              },
            });
          });

          return stateManager.setState((board) => insertEntity(board, dropPath, items));
        } catch (e) {
          stateManager.setError(e);
          console.error(e);
        }

        return;
      }

      // Clone paths to prevent mutation issues during rapid operations
      const dragPath = [...dragEntity.getPath()];
      const dropPath = [...dropEntity.getPath()];
      const dragEntityData = dragEntity.getData();
      const dropEntityData = dropEntity.getData();
      const [, sourceFile] = dragEntity.scopeId.split(':::');
      const [, destinationFile] = dropEntity.scopeId.split(':::');

      const inDropArea =
        dropEntityData.acceptsSort && !dropEntityData.acceptsSort.includes(dragEntityData.type);

      // Same board (file)
      if (sourceFile === destinationFile) {
        const instance = plugin.getKanbanInstance(dragEntity.scopeId, dragEntityData.win);
        if (!instance) return;
        const stateManager = plugin.stateManagers.get(instance.file);
        if (!stateManager) return;

        // Create a local copy of dropPath for this operation
        const finalDropPath = inDropArea ? [...dropPath, 0] : dropPath;

        return stateManager.setState((board) => {
          const entity = getEntityFromPath(board, dragPath);
          const newBoard: Board = moveEntity(
            board,
            dragPath,
            finalDropPath,
            (entity) => {
              if (entity.type === DataTypes.Item) {
                const { next } = maybeCompleteForMove(
                  stateManager,
                  board,
                  dragPath,
                  stateManager,
                  board,
                  finalDropPath,
                  entity
                );
                return next;
              }
              return entity;
            },
            (entity) => {
              if (entity.type === DataTypes.Item) {
                const { replacement } = maybeCompleteForMove(
                  stateManager,
                  board,
                  dragPath,
                  stateManager,
                  board,
                  finalDropPath,
                  entity
                );
                return replacement;
              }
            }
          );

          if (entity.type === DataTypes.Lane) {
            const from = dragPath.last();
            let to = finalDropPath.last();

            if (from < to) to -= 1;

            const collapsedState = instance.getViewState('list-collapse');
            const op = (collapsedState: boolean[]) => {
              const newState = [...collapsedState];
              newState.splice(to, 0, newState.splice(from, 1)[0]);
              return newState;
            };

            instance.setViewState('list-collapse', undefined, op);

            return update<Board>(newBoard, {
              data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
            });
          }

          // Remove sorting in the destination lane
          const destinationParentPath = finalDropPath.slice(0, -1);
          const destinationParent = getEntityFromPath(board, destinationParentPath);

          if (destinationParent?.data?.sorted !== undefined) {
            return updateEntity(newBoard, destinationParentPath, {
              data: {
                $unset: ['sorted'],
              },
            });
          }

          return newBoard;
        });
      }

      // Cross-board (different files) drag
      const sourceInstance = plugin.getKanbanInstance(dragEntity.scopeId, dragEntityData.win);
      const destinationInstance = plugin.getKanbanInstance(dropEntity.scopeId, dropEntityData.win);
      if (!sourceInstance || !destinationInstance) return;

      const sourceStateManager = plugin.stateManagers.get(sourceInstance.file);
      const destinationStateManager = plugin.stateManagers.get(destinationInstance.file);
      if (!sourceStateManager || !destinationStateManager) return;

      // For cross-board transfers, we need to extract the entity BEFORE any state updates.
      // This prevents race conditions where rapid operations could read stale state.
      // We capture everything we need synchronously, then apply both updates.

      // Step 1: Capture entity from source board SYNCHRONOUSLY before any updates
      const sourceBoard = sourceStateManager.state;
      const entity = getEntityFromPath(sourceBoard, dragPath);

      if (!entity || !entity.data) {
        console.warn('Cross-board drag: entity not found at path', dragPath);
        return;
      }

      // Store the entity ID for verification later
      const entityId = entity.id;

      // Pre-calculate the final drop path
      const destinationBoard = destinationStateManager.state;
      let finalDropPath = [...dropPath];
      if (inDropArea) {
        const parent = getEntityFromPath(destinationBoard, dropPath);
        const shouldAppend =
          (destinationStateManager.getSetting('new-card-insertion-method') || 'append') ===
          'append';

        if (shouldAppend) {
          finalDropPath = [...dropPath, parent.children.length];
        } else {
          finalDropPath = [...dropPath, 0];
        }
      }

      // Pre-calculate what to insert and any replacement
      let toInsert: Nestable;
      let replacementEntity: Nestable | undefined;

      if (entity.type === DataTypes.Item) {
        const { next, replacement } = maybeCompleteForMove(
          sourceStateManager,
          sourceBoard,
          dragPath,
          destinationStateManager,
          destinationBoard,
          finalDropPath,
          entity as Item
        );
        // Guard against undefined next (can happen if toggleTask returns unexpected data)
        toInsert = next || entity;
        replacementEntity = replacement;
      } else {
        toInsert = entity;
      }

      // Step 2: Remove from source board FIRST
      // This ensures the card is removed before being added elsewhere,
      // preventing duplication if the destination insert is slow
      sourceStateManager.setState((currentSourceBoard) => {
        // Verify the entity still exists at the expected path
        const currentEntity = getEntityFromPath(currentSourceBoard, dragPath);
        if (!currentEntity || currentEntity.id !== entityId) {
          // Entity was already moved/deleted - skip this update
          console.warn('Cross-board drag: entity no longer at source path, skipping removal');
          return currentSourceBoard;
        }

        if (entity.type === DataTypes.Lane) {
          const collapsedState = sourceInstance.getViewState('list-collapse');
          const op = (collapsedState: boolean[]) => {
            const newState = [...collapsedState];
            newState.splice(dragPath.last(), 1);
            return newState;
          };
          sourceInstance.setViewState('list-collapse', undefined, op);

          return update<Board>(removeEntity(currentSourceBoard, dragPath), {
            data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
          });
        } else {
          return removeEntity(currentSourceBoard, dragPath, replacementEntity);
        }
      });

      // Step 3: Insert into destination board AFTER source removal
      destinationStateManager.setState((currentDestinationBoard) => {
        if (entity.type === DataTypes.Lane) {
          const collapsedState = destinationInstance.getViewState('list-collapse');
          const val = sourceInstance.getViewState('list-collapse')?.[dragPath.last()] ?? false;
          const op = (collapsedState: boolean[]) => {
            const newState = [...collapsedState];
            newState.splice(finalDropPath.last(), 0, val);
            return newState;
          };

          destinationInstance.setViewState('list-collapse', undefined, op);

          return update<Board>(insertEntity(currentDestinationBoard, finalDropPath, [toInsert]), {
            data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
          });
        } else {
          return insertEntity(currentDestinationBoard, finalDropPath, [toInsert]);
        }
      });
    },
    [instances]
  );

  if (portals.length)
    return (
      <DndContext win={win} onDrop={handleDrop}>
        {...portals}
        <DragOverlay>
          {(entity, styles) => {
            const [data, context] = useMemo(() => {
              if (entity.scopeId === 'htmldnd') {
                return [null, null];
              }

              const overlayData = entity.getData();

              const instance = plugin.getKanbanInstance(entity.scopeId, overlayData.win);
              if (!instance) return [null, null];

              const stateManager = plugin.stateManagers.get(instance.file);
              if (!stateManager) return [null, null];

              const data = getEntityFromPath(stateManager.state, entity.getPath());
              const viewStateAccessor = {
                getViewState: (key: any) => instance.getViewState(key),
                setViewState: (key: any, val: any, globalUpdater: any) =>
                  instance.setViewState(key, val, globalUpdater),
                useViewState: (key: any) =>
                  (instance as any).useViewState?.(key) ?? instance.getViewState(key),
              };
              const boardModifiers = getBoardModifiers(viewStateAccessor, stateManager);
              const filePath = instance.file.path;
              const containerEl = isKanbanView(instance)
                ? instance.contentEl
                : instance.containerEl;

              return [
                data,
                {
                  scopeId: instance.id,
                  containerEl,
                  stateManager,
                  boardModifiers,
                  filePath,
                  isEmbed: !isKanbanView(instance),
                  viewStateAccessor,
                },
              ];
            }, [entity]);

            if (data?.type === DataTypes.Lane) {
              const boardView = context?.stateManager.getSetting(frontmatterKey);
              const collapseState = context?.stateManager.getSetting('list-collapse');
              const laneIndex = entity.getPath().last();

              return (
                <KanbanContext.Provider value={context}>
                  <div
                    className={classcat([
                      c('drag-container'),
                      {
                        [c('horizontal')]: boardView !== 'list',
                        [c('vertical')]: boardView === 'list',
                      },
                    ])}
                    style={styles}
                  >
                    <DraggableLane
                      lane={data as Lane}
                      laneIndex={laneIndex}
                      isStatic={true}
                      isCollapsed={!!collapseState?.[laneIndex]}
                      collapseDir={boardView === 'list' ? 'vertical' : 'horizontal'}
                    />
                  </div>
                </KanbanContext.Provider>
              );
            }

            if (data?.type === DataTypes.Item) {
              return (
                <KanbanContext.Provider value={context}>
                  <div className={c('drag-container')} style={styles}>
                    <DraggableItem item={data as Item} itemIndex={0} isStatic={true} />
                  </div>
                </KanbanContext.Provider>
              );
            }

            return <div />;
          }}
        </DragOverlay>
      </DndContext>
    );
}
