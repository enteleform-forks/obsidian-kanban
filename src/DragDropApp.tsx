import classcat from 'classcat';
import update from 'immutability-helper';
import { JSX, createPortal, memo, useCallback, useMemo } from 'preact/compat';

import { KanbanView } from './KanbanView';
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

const View = memo(function View({ view }: { view: KanbanView }) {
  return createPortal(view.getPortal(), view.contentEl);
});

const RendererPortal = memo(function RendererPortal({
  renderer,
}: {
  renderer: import('./rendering/BoardRenderer').BoardRenderer;
}) {
  return createPortal(renderer.getPortal(), renderer.contentEl);
});

export function DragDropApp({ win, plugin }: { win: Window; plugin: KanbanPlugin }) {
  const views = plugin.useKanbanViews(win);
  const renderers = plugin.useRenderers(win);

  // Create portals for all views (which contain their board renderers)
  const viewPortals: JSX.Element[] = views.map((view) => <View key={view.id} view={view} />);

  // Create portals for standalone renderers (embeds)
  const rendererPortals: JSX.Element[] = renderers
    .filter((r) => !views.some((v) => v.boardRenderer === r)) // Exclude renderers already in views
    .map((renderer) => <RendererPortal key={renderer.id} renderer={renderer} />);

  const portals = [...viewPortals, ...rendererPortals];

  const handleDrop = useCallback(
    (dragEntity: Entity, dropEntity: Entity) => {
      if (!dragEntity || !dropEntity) {
        return;
      }

      if (dragEntity.scopeId === 'htmldnd') {
        const data = dragEntity.getData();
        const stateManager = plugin.getStateManagerFromViewID(data.viewId, data.win);
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

      const dragPath = dragEntity.getPath();
      const dropPath = dropEntity.getPath();
      const dragEntityData = dragEntity.getData();
      const dropEntityData = dropEntity.getData();
      const [, sourceFile] = dragEntity.scopeId.split(':::');
      const [, destinationFile] = dropEntity.scopeId.split(':::');

      const inDropArea =
        dropEntityData.acceptsSort && !dropEntityData.acceptsSort.includes(dragEntityData.type);

      // Same board
      if (sourceFile === destinationFile) {
        const rendererInfo = plugin.getRenderer(dragEntity.scopeId, dragEntityData.win);
        if (!rendererInfo) return;

        const stateManager = rendererInfo.renderer.stateManager;

        if (inDropArea) {
          dropPath.push(0);
        }

        return stateManager.setState((board) => {
          const entity = getEntityFromPath(board, dragPath);
          const newBoard: Board = moveEntity(
            board,
            dragPath,
            dropPath,
            (entity) => {
              if (entity.type === DataTypes.Item) {
                const { next } = maybeCompleteForMove(
                  stateManager,
                  board,
                  dragPath,
                  stateManager,
                  board,
                  dropPath,
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
                  dropPath,
                  entity
                );
                return replacement;
              }
            }
          );

          if (entity.type === DataTypes.Lane) {
            const from = dragPath.last();
            let to = dropPath.last();

            if (from < to) to -= 1;

            const renderer = rendererInfo.renderer;
            const collapsedState = renderer.getViewState('list-collapse');
            const op = (collapsedState: boolean[]) => {
              const newState = [...collapsedState];
              newState.splice(to, 0, newState.splice(from, 1)[0]);
              return newState;
            };

            renderer.setViewState('list-collapse', undefined, op);

            return update<Board>(newBoard, {
              data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
            });
          }

          // Remove sorting in the destination lane
          const destinationParentPath = dropPath.slice(0, -1);
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

      const sourceInfo = plugin.getRenderer(dragEntity.scopeId, dragEntityData.win);
      const destinationInfo = plugin.getRenderer(dropEntity.scopeId, dropEntityData.win);

      if (!sourceInfo || !destinationInfo) return;

      const sourceRenderer = sourceInfo.renderer;
      const sourceStateManager = sourceRenderer.stateManager;
      const destinationRenderer = destinationInfo.renderer;
      const destinationStateManager = destinationRenderer.stateManager;

      sourceStateManager.setState((sourceBoard) => {
        const entity = getEntityFromPath(sourceBoard, dragPath);
        let replacementEntity: Nestable;

        destinationStateManager.setState((destinationBoard) => {
          if (inDropArea) {
            const parent = getEntityFromPath(destinationStateManager.state, dropPath);
            const shouldAppend =
              (destinationStateManager.getSetting('new-card-insertion-method') || 'append') ===
              'append';

            if (shouldAppend) dropPath.push(parent.children.length);
            else dropPath.push(0);
          }

          const toInsert: Nestable[] = [];

          if (entity.type === DataTypes.Item) {
            const { next, replacement } = maybeCompleteForMove(
              sourceStateManager,
              sourceBoard,
              dragPath,
              destinationStateManager,
              destinationBoard,
              dropPath,
              entity
            );
            replacementEntity = replacement;
            toInsert.push(next);
          } else {
            toInsert.push(entity);
          }

          if (entity.type === DataTypes.Lane) {
            const collapsedState = destinationRenderer.getViewState('list-collapse');
            const val = sourceRenderer.getViewState('list-collapse')[dragPath.last()];
            const op = (collapsedState: boolean[]) => {
              const newState = [...collapsedState];
              newState.splice(dropPath.last(), 0, val);
              return newState;
            };

            destinationRenderer.setViewState('list-collapse', undefined, op);

            return update<Board>(insertEntity(destinationBoard, dropPath, toInsert), {
              data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
            });
          } else {
            return insertEntity(destinationBoard, dropPath, toInsert);
          }
        });

        if (entity.type === DataTypes.Lane) {
          const collapsedState = sourceRenderer.getViewState('list-collapse');
          const op = (collapsedState: boolean[]) => {
            const newState = [...collapsedState];
            newState.splice(dragPath.last(), 1);
            return newState;
          };
          sourceRenderer.setViewState('list-collapse', undefined, op);

          return update<Board>(removeEntity(sourceBoard, dragPath), {
            data: { settings: { 'list-collapse': { $set: op(collapsedState) } } },
          });
        } else {
          return removeEntity(sourceBoard, dragPath, replacementEntity);
        }
      });
    },
    [views]
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

              const rendererInfo = plugin.getRenderer(entity.scopeId, overlayData.win);
              if (!rendererInfo) return [null, null];

              const renderer = rendererInfo.renderer;
              const stateManager = renderer.stateManager;
              const data = getEntityFromPath(stateManager.state, entity.getPath());
              const boardModifiers = getBoardModifiers(renderer, stateManager);
              const filePath = renderer.file.path;

              return [
                data,
                {
                  view: renderer as any,
                  stateManager,
                  boardModifiers,
                  filePath,
                },
              ];
            }, [entity]);

            if (data?.type === DataTypes.Lane) {
              const renderer = context?.view;
              const boardView =
                renderer?.viewSettings?.[frontmatterKey] ||
                context?.stateManager.getSetting(frontmatterKey);
              const collapseState =
                renderer?.viewSettings?.['list-collapse'] ||
                context?.stateManager.getSetting('list-collapse');
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
                      isCollapsed={!!collapseState[laneIndex]}
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
