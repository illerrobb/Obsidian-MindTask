import {
  ItemView,
  WorkspaceLeaf,
  Menu,
  FuzzySuggestModal,
  MenuItem,
  Modal,
  Setting,
  TextComponent,
  App,
  setIcon,
  TFile,
  TAbstractFile,
  normalizePath,
  MarkdownRenderer,
} from 'obsidian';
import type MindTaskPlugin from './main';
import Controller from './controller';
import { BoardData, saveBoard, loadBoard, getBoardFile } from './boardStore';
import WikiLinkSuggest from './wikiLinkSuggest';
import { ParsedTask, scanFiles, parseDependencies } from './parser';
import { buildTaskTree, TaskTreeNode } from './sidebar';

export const VIEW_TYPE_BOARD = 'mind-task';

export class BoardView extends ItemView {
  private boardEl!: HTMLElement;
  private sidebarEl!: HTMLElement;
  private sidebarListEl!: HTMLElement;
  private sidebarSearchInput!: HTMLInputElement;
  private sidebarToggleBtn!: HTMLButtonElement;
  private minimapToggleBtn!: HTMLButtonElement;
  private svgEl!: SVGSVGElement;
  private alignVLine!: HTMLElement;
  private alignHLine!: HTMLElement;
  private alignVTimeout: number | null = null;
  private alignHTimeout: number | null = null;
  private readonly gridSize = 20;
  private readonly laneHeaderSize = 32;
  private selectedIds: Set<string> = new Set();
  private draggingId: string | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartPositions: Map<string, { x: number; y: number }> = new Map();
  private edgeStart: string | null = null;
  private tempEdge: SVGPathElement | null = null;
  private edgeHoverHandle: HTMLElement | null = null;
  private outHoverHandle: HTMLElement | null = null;
  private dragOutHandle: HTMLElement | null = null;
  private draggingHandle: HTMLElement | null = null;
  private edgeX = 0;
  private edgeY = 0;
  private edgeEls: Map<
    number,
    {
      hit: SVGPathElement;
      line: SVGPathElement;
      label?: HTMLDivElement;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  > = new Map();
  private selectionRect: HTMLElement | null = null;
  private selStartX = 0;
  private selStartY = 0;
  private isBoardDragging = false;
  private boardStartX = 0;
  private boardStartY = 0;
  private boardOffsetX = 0;
  private boardOffsetY = 0;
  private zoom = 1;
  private minimapEl!: HTMLElement;
  private minimapSvg!: SVGSVGElement;
  private minimapView!: HTMLElement;
  private minimapScale = 1;
  private minimapOffsetX = 0;
  private minimapOffsetY = 0;
  private isMinimapDragging = false;
  private editTimer: number | null = null;
  private editingId: string | null = null;
  private editingEdgeLabel: number | null = null;
  private pointerDownSelected = false;
  private didDragSelect = false;
  private hasFocus = false;
  private resizingId: string | null = null;
  private resizeDir = '';
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartNodeX = 0;
  private resizeStartNodeY = 0;
  private memberResizeStart: Map<string, { x: number; y: number; width?: number; height?: number }> =
    new Map();
  private draggingLaneId: string | null = null;
  private laneDragOffsetX = 0;
  private laneDragOffsetY = 0;
  private laneDragNodeIds: string[] = [];
  private resizingLaneId: string | null = null;
  private laneResizeStartWidth = 0;
  private laneResizeStartHeight = 0;
  private laneResizeStartX = 0;
  private laneResizeStartY = 0;
  private laneResizeDir = '';
  private laneResizeStartLaneX = 0;
  private laneResizeStartLaneY = 0;
  private groupId: string | null = null;
  private groupFocusEl: HTMLElement | null = null;
  private controller: Controller | null = null;
  private board: BoardData | null = null;
  private tasks: Map<string, ParsedTask> = new Map();
  private boardFile: TFile | null = null;
  private vaultEventsRegistered = false;
  private skipNextRename = false;
  private plugin: MindTaskPlugin;
  private containerEventsRegistered = false;
  private isSidebarResizing = false;
  private sidebarStartWidth = 0;
  private sidebarStartX = 0;

  private handleSidebarMouseMove = (e: MouseEvent) => {
    if (!this.isSidebarResizing || !this.sidebarEl) return;
    const newWidth = this.sidebarStartWidth + e.clientX - this.sidebarStartX;
    this.sidebarEl.style.width = `${Math.max(100, newWidth)}px`;
  };

  private handleSidebarMouseUp = async () => {
    if (!this.isSidebarResizing) return;
    this.isSidebarResizing = false;
    document.body.style.cursor = '';
    if (this.sidebarEl) {
      this.sidebarEl.style.cursor = '';
      this.sidebarStartWidth = this.sidebarEl.getBoundingClientRect().width;
      this.plugin.settings.sidebarWidth = this.sidebarStartWidth;
      await this.plugin.savePluginData();
    }
    document.removeEventListener('mousemove', this.handleSidebarMouseMove);
    document.removeEventListener('mouseup', this.handleSidebarMouseUp);
  };

  private toggleSidebar = () => {
    if (!this.sidebarEl || !this.sidebarToggleBtn) return;
    const collapsed = this.sidebarEl.classList.toggle('collapsed');
    setIcon(this.sidebarToggleBtn, collapsed ? 'chevron-right' : 'chevron-left');
  };

  private toggleMinimap = () => {
    if (!this.minimapEl || !this.minimapToggleBtn) return;
    const collapsed = this.minimapEl.classList.toggle('collapsed');
    setIcon(this.minimapToggleBtn, collapsed ? 'eye' : 'eye-off');
  };

  constructor(leaf: WorkspaceLeaf, plugin: MindTaskPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_BOARD;
  }

  getDisplayText() {
    return this.board?.title || this.boardFile?.basename || 'MindTask Board';
  }

  // @ts-ignore
  getState() {
    return { file: this.boardFile?.path };
  }

  async setState(state: any) {
    if (state?.file) {
      await this.loadViewData(state.file);
    }
  }

  async onOpen() {
    // If the board is already loaded, do nothing
    if (this.board) return;

    // Get the file associated with the view
    const state = this.leaf.getViewState();
    const filePath = (state as any).state?.file || (state as any).file;
    if (filePath) {
      await this.loadViewData(filePath);
    }
  }

  async loadViewData(filePath: string) {
    // If we are already displaying this file, do nothing
    if (this.boardFile?.path === filePath) return;

    const boardFile = await getBoardFile(this.app, filePath);
    const board = await loadBoard(this.app, boardFile);
    const files = this.app.vault.getMarkdownFiles();
    const parsed = await scanFiles(this.app, files, {
      tags: this.plugin.settings.tagFilters,
      folders: this.plugin.settings.folderPaths,
      useBlockId: this.plugin.settings.useBlockId,
    });
    const tasks = new Map(parsed.map((t) => [t.blockId, t]));
    for (const id in board.nodes) {
      const desc = (board.nodes[id] as any).description;
      if (desc && tasks.has(id)) {
        tasks.get(id)!.description = desc;
      }
    }
    const controller = new Controller(
      this.app,
      boardFile,
      board,
      tasks,
      this.plugin.settings
    );

    this.updateData(board, tasks, controller, boardFile);
  }

  updateData(
    board: BoardData,
    tasks: Map<string, ParsedTask>,
    controller: Controller,
    boardFile: TFile
  ) {
    this.board = board;
    this.tasks = tasks;
    this.controller = controller;
    this.boardFile = boardFile;
    let changed = false;
    for (const [id, node] of Object.entries(this.board.nodes)) {
      if (!node.title) {
        if (tasks.has(id)) {
          node.title = tasks.get(id)!.text;
        } else {
          const anyNode = node as any;
          node.title = anyNode.name || anyNode.text || anyNode.content;
        }
        if (node.title) changed = true;
      }
    }
    if (changed) void saveBoard(this.app, boardFile, this.board);
    this.app.workspace.trigger('layout-change');

    if (!this.vaultEventsRegistered) {
      const onVaultChange = (file: TAbstractFile) => {
        if (!this.boardFile || !(file instanceof TFile)) return;
        if (
          file.path === this.boardFile.path ||
          file.path.endsWith('.mtask') ||
          !file.path.endsWith('.md')
        )
          return;
        void this.refreshFromVault();
      };
      const onVaultRename = async (file: TAbstractFile, oldPath: string) => {
        if (!this.boardFile || !(file instanceof TFile)) return;
        if (file === this.boardFile) {
          if (this.skipNextRename) {
            this.skipNextRename = false;
            return;
          }
          if (this.board) {
            this.board.title = file.basename;
            await saveBoard(this.app, this.boardFile, this.board);
            this.app.workspace.trigger('layout-change');
            this.render();
          }
        } else if (file.path.endsWith('.md') || oldPath.endsWith('.md')) {
          void this.refreshFromVault();
        }
      };
      this.registerEvent(this.app.vault.on('create', onVaultChange));
      this.registerEvent(this.app.vault.on('modify', onVaultChange));
      this.registerEvent(this.app.vault.on('delete', onVaultChange));
      this.registerEvent(this.app.vault.on('rename', onVaultRename));
      this.vaultEventsRegistered = true;
    }

    this.render();
  }

  async refreshFromVault() {
    if (!this.board || !this.boardFile) return;

    const files = this.app.vault.getMarkdownFiles();
    const parsed = await scanFiles(this.app, files, {
      tags: this.plugin.settings.tagFilters,
      folders: this.plugin.settings.folderPaths,
      useBlockId: this.plugin.settings.useBlockId,
    });
    const deps = parseDependencies(parsed);

    this.tasks.clear();
    for (const task of parsed) {
      this.tasks.set(task.blockId, task);
    }

    for (const id of Object.keys(this.board.nodes)) {
      const n = this.board.nodes[id] as any;
      if (n.notePath && !n.type) n.type = 'note';
      if (this.tasks.has(id) && n.description) {
        this.tasks.get(id)!.description = n.description;
      }
      console.debug('refreshFromVault node', {
        id,
        type: n.type,
        notePath: n.notePath,
      });
      // Only remove nodes that correspond to tasks no longer present.
      // Preserve board, note and other special nodes which have a type set.
      if (!this.tasks.has(id) && !n.type) delete this.board.nodes[id];
    }

    // Remove edges that reference nodes no longer on the board
    this.board.edges = this.board.edges.filter(
      (e) => this.board!.nodes[e.from] && this.board!.nodes[e.to]
    );

    // Start with dependency edges between existing nodes
    // Preserve labels from existing board edges when available
    const combined = deps
      .filter((d) => this.board!.nodes[d.from] && this.board!.nodes[d.to])
      .map((d) => {
        const match = this.board!.edges.find(
          (e) => e.from === d.from && e.to === d.to && e.type === d.type
        );
        return match && match.label ? { ...d, label: match.label } : d;
      });

    // Merge in existing edges that involve special nodes (type defined)
    for (const e of this.board.edges) {
      const fromNode = this.board!.nodes[e.from] as any;
      const toNode = this.board!.nodes[e.to] as any;
      if (
        (fromNode?.type !== undefined || toNode?.type !== undefined) &&
        !combined.find(
          (d) => d.from === e.from && d.to === e.to && d.type === e.type
        )
      ) {
        combined.push(e);
      }
    }

    this.board.edges = combined;

    await saveBoard(this.app, this.boardFile, this.board);

    this.controller = new Controller(
      this.app,
      this.boardFile,
      this.board,
      this.tasks,
      this.plugin.settings
    );
    const prevSelected = new Set(this.selectedIds);
    this.render();
    this.selectedIds.clear();
    prevSelected.forEach((id) => {
      if (!this.board?.nodes[id]) return;
      const el = this.boardEl.querySelector(
        `.vtasks-node[data-id="${id}"]`
      ) as HTMLElement | null;
      if (el) {
        el.classList.add('selected');
        this.selectedIds.add(id);
      }
    });
  }

  private render() {
    if (!this.board) return;
    this.containerEl.empty();
    this.containerEl.addClass('vtasks-container');
    const topBar = this.containerEl.createDiv('vtasks-top-bar');
    const titleEl = topBar.createDiv('vtasks-board-title');
    titleEl.setText(this.board.title || 'Board');
    titleEl.onclick = () => this.editTitle(titleEl);

    this.boardEl = this.containerEl.createDiv('vtasks-board');
    const orient = this.board?.orientation ?? 'vertical';
    this.boardEl.addClass(
      orient === 'horizontal' ? 'vtasks-horizontal' : 'vtasks-vertical'
    );
    if (!(this.board?.snapToGrid ?? true)) {
      this.boardEl.addClass('vtasks-no-grid');
    }
    this.boardEl.tabIndex = 0;
    this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
    this.alignVLine = this.boardEl.createDiv('vtasks-align-line vtasks-align-v');
    this.alignHLine = this.boardEl.createDiv('vtasks-align-line vtasks-align-h');
    this.alignVLine.style.display = 'none';
    this.alignHLine.style.display = 'none';
    this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgEl.addClass('vtasks-edges');
    this.boardEl.appendChild(this.svgEl);
    this.sidebarEl = this.containerEl.createDiv('vtasks-sidebar');
    this.sidebarEl.style.width = `${this.plugin.settings.sidebarWidth}px`;
    const searchContainer = this.sidebarEl.createDiv('vtasks-sidebar-search');
    this.sidebarSearchInput = searchContainer.createEl('input', {
      type: 'text',
    }) as HTMLInputElement;
    this.sidebarSearchInput.placeholder = 'Search…';
    this.sidebarListEl = this.sidebarEl.createDiv('vtasks-sidebar-list');
    this.sidebarSearchInput.addEventListener('input', () =>
      this.filterSidebar(this.sidebarSearchInput.value)
    );
    this.sidebarEl.addEventListener('mousemove', (e) => {
      const rect = this.sidebarEl.getBoundingClientRect();
      if (rect.right - e.clientX < 5) {
        this.sidebarEl.style.cursor = 'ew-resize';
      } else {
        this.sidebarEl.style.cursor = '';
      }
    });
    this.sidebarEl.addEventListener('mousedown', (e) => {
      const rect = this.sidebarEl.getBoundingClientRect();
      if (rect.right - e.clientX < 5) {
        this.isSidebarResizing = true;
        this.sidebarStartWidth = rect.width;
        this.sidebarStartX = e.clientX;
        document.body.style.cursor = 'ew-resize';
        document.addEventListener('mousemove', this.handleSidebarMouseMove);
        document.addEventListener('mouseup', this.handleSidebarMouseUp);
        e.preventDefault();
      }
    });
    this.sidebarEl.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li[data-id]');
      if (li) {
        const id = li.getAttr('data-id')!;
        this.centerOnNode(id);
        const nodeEl = this.boardEl.querySelector(
          `.vtasks-node[data-id="${id}"]`
        ) as HTMLElement | null;
        if (nodeEl) this.selectNode(nodeEl, id, false);
        this.sidebarEl
          .querySelectorAll('li.active')
          .forEach((el) => el.removeClass('active'));
        li.addClass('active');
      }
    });
    this.edgeEls = new Map();
    this.svgEl.empty();
    this.svgEl.style.position = 'absolute';
    this.svgEl.style.width = '100%';
    this.svgEl.style.height = '100%';
    for (const lid in this.board.lanes) {
      this.createLaneElement(lid);
    }
    const nodeElements: Record<string, HTMLElement> = {};
    for (const id in this.board.nodes) {
      const el = this.createNodeElement(id);
      nodeElements[id] = el;
    }
    this.drawEdges();
    this.renderSidebar();
    this.minimapEl = this.containerEl.createDiv('vtasks-minimap');
    this.minimapSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.minimapEl.appendChild(this.minimapSvg);
    this.minimapView = this.minimapEl.createDiv('vtasks-mini-view');
    this.drawMinimap();
    this.updateMinimapView();

    const toolbar = this.containerEl.createDiv('vtasks-toolbar');
    const zoomSection = toolbar.createDiv('vtasks-toolbar-section');

    this.sidebarToggleBtn = zoomSection.createEl('button');
    setIcon(this.sidebarToggleBtn, 'chevron-left');
    this.sidebarToggleBtn.setAttr('title', 'Toggle sidebar');
    this.sidebarToggleBtn.onclick = () => this.toggleSidebar();

    const zoomInBtn = zoomSection.createEl('button');
    setIcon(zoomInBtn, 'zoom-in');
    zoomInBtn.setAttr('title', 'Zoom in');
    zoomInBtn.onclick = () => {
      const rect = this.containerEl.getBoundingClientRect();
      this.zoomAt(1.1, rect.width / 2, rect.height / 2);
    };

    const zoomOutBtn = zoomSection.createEl('button');
    setIcon(zoomOutBtn, 'zoom-out');
    zoomOutBtn.setAttr('title', 'Zoom out');
    zoomOutBtn.onclick = () => {
      const rect = this.containerEl.getBoundingClientRect();
      this.zoomAt(1 / 1.1, rect.width / 2, rect.height / 2);
    };

    const resetBtn = zoomSection.createEl('button');
    setIcon(resetBtn, 'refresh-ccw');
    resetBtn.setAttr('title', 'Reset zoom');
    resetBtn.onclick = () => this.resetZoom();

    const fitBtn = zoomSection.createEl('button');
    setIcon(fitBtn, 'maximize');
    fitBtn.setAttr('title', 'Zoom to fit');
    fitBtn.onclick = () => this.zoomToFit();

    this.minimapToggleBtn = zoomSection.createEl('button');
    setIcon(this.minimapToggleBtn, 'eye-off');
    this.minimapToggleBtn.setAttr('title', 'Toggle minimap');
    this.minimapToggleBtn.onclick = () => this.toggleMinimap();

    const settingsBtn = zoomSection.createEl('button');
    setIcon(settingsBtn, 'settings');
    settingsBtn.setAttr('title', 'Board settings');
    settingsBtn.onclick = (e) => {
      const menu = new Menu();
      const snapGrid = this.board?.snapToGrid ?? true;
      menu.addItem((item) =>
        item
          .setTitle('Snap to grid')
          .setChecked(snapGrid)
          .onClick(async () => {
            await this.controller?.setSnapToGrid(!snapGrid);
            this.render();
          })
      );
      const snapGuides = this.board?.snapToGuides ?? false;
      menu.addItem((item) =>
        item
          .setTitle('Snap to guides')
          .setChecked(snapGuides)
          .onClick(async () => {
            await this.controller?.setSnapToGuides(!snapGuides);
            this.render();
          })
      );
      const alignThreshold = this.board?.alignThreshold ?? 5;
      menu.addItem((item) =>
        item.setTitle(`Alignment threshold (${alignThreshold})`).onClick(async () => {
          const val = await this.promptString(
            'Alignment threshold',
            alignThreshold.toString()
          );
          if (val !== null) {
            const num = parseInt(val, 10);
            if (!isNaN(num)) {
              await this.controller?.setAlignThreshold(num);
              this.render();
            }
          }
        })
      );
      const current = this.board?.orientation ?? 'vertical';
      menu.addItem((item) =>
        item.setTitle('Vertical orientation').onClick(async () => {
          if (current !== 'vertical') {
            await this.controller?.setOrientation('vertical');
            this.render();
          }
        })
      );
      menu.addItem((item) =>
        item.setTitle('Horizontal orientation').onClick(async () => {
          if (current !== 'horizontal') {
            await this.controller?.setOrientation('horizontal');
            this.render();
          }
        })
      );
      menu.showAtMouseEvent(e as MouseEvent);
    };

    this.registerEvents();

    // Center the board only if no panning has occurred yet
    if (this.boardOffsetX === 0 && this.boardOffsetY === 0) {
      this.centerBoard();
    }
  }

  private createLaneElement(id: string) {
    const lane = this.board!.lanes[id];
    const laneEl = this.boardEl.createDiv('vtasks-lane');
    laneEl.setAttr('data-id', id);
    laneEl.style.left = lane.x + 'px';
    laneEl.style.top = lane.y + 'px';
    laneEl.style.width = lane.width + 'px';
    laneEl.style.height = lane.height + 'px';
    const header = laneEl.createDiv('vtasks-lane-header');
    header.textContent = lane.label;
    if (lane.orient === 'horizontal') {
      laneEl.addClass('vtasks-lane-horizontal');
      header.addClass('vtasks-lane-header-horizontal');
    } else {
      laneEl.addClass('vtasks-lane-vertical');
    }
    header.onpointerdown = (e) => {
      e.stopPropagation();
      (e as PointerEvent).preventDefault();
      (this.boardEl as HTMLElement).setPointerCapture((e as PointerEvent).pointerId);
      this.draggingLaneId = id;
      const coords = this.getBoardCoords(e as PointerEvent);
      this.laneDragOffsetX = coords.x - lane.x;
      this.laneDragOffsetY = coords.y - lane.y;
      this.laneDragNodeIds = [];
      for (const nid in this.board!.nodes) {
        if (this.board!.nodes[nid].lane === id) this.laneDragNodeIds.push(nid);
      }
    };
    header.ondblclick = async (e) => {
      e.stopPropagation();
      (e as PointerEvent).preventDefault();
      const name = await this.promptString('Lane name', lane.label);
      if (name) {
        await this.controller?.renameLane(id, name);
        this.render();
      }
    };
    laneEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const menu = new Menu();
      if ((e.target as HTMLElement).closest('.vtasks-lane-header')) {
        menu.addItem((item) =>
          item.setTitle('Toggle orientation').onClick(async () => {
            const newOrient =
              lane.orient === 'vertical' ? 'horizontal' : 'vertical';
            await this.controller?.setLaneOrientation(id, newOrient);
            await this.reflowLane(id);
            this.render();
          })
        );
        menu.addSeparator();
      }
      menu.addItem((item) =>
        item.setTitle('Rename lane').onClick(async () => {
          const name = await this.promptString('Lane name', lane.label);
          if (name) {
            await this.controller?.renameLane(id, name);
            this.render();
          }
        })
      );
      menu.addItem((item) =>
        item
          .setTitle('Delete lane')
          .setIcon('trash')
          .setSection('danger')
          .onClick(() => {
            this.controller?.deleteLane(id).then(() => this.render());
          })
      );
      menu.showAtMouseEvent(e as MouseEvent);
    });
    ['n', 'e', 's', 'w'].forEach((d) =>
      laneEl.createDiv(`vtasks-lane-resize vtasks-lane-resize-${d}`)
    );
  }

  private updateLaneElement(id: string) {
    const lane = this.board!.lanes[id];
    const el = this.boardEl.querySelector(`.vtasks-lane[data-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    el.style.left = lane.x + 'px';
    el.style.top = lane.y + 'px';
    el.style.width = lane.width + 'px';
    el.style.height = lane.height + 'px';
    const header = el.querySelector('.vtasks-lane-header') as HTMLElement | null;
    el.toggleClass('vtasks-lane-horizontal', lane.orient === 'horizontal');
    el.toggleClass('vtasks-lane-vertical', lane.orient === 'vertical');
    if (header) {
      header.textContent = lane.label;
      header.toggleClass('vtasks-lane-header-horizontal', lane.orient === 'horizontal');
    }
  }

  private createNodeElement(
    id: string,
    parent: HTMLElement = this.boardEl,
    offsetX = 0,
    offsetY = 0
  ): HTMLElement {
    const pos = this.board!.nodes[id];
    const defaultColor = 'var(--background-modifier-border)';
    const nodeEl = parent.createDiv('vtasks-node');
    nodeEl.setAttr('data-id', id);
    if (this.selectedIds.has(id)) nodeEl.classList.add('selected');
    nodeEl.style.left = pos.x - offsetX + 'px';
    nodeEl.style.top = pos.y - offsetY + 'px';
    if (pos.width) nodeEl.style.width = pos.width + 'px';
    if (pos.height) nodeEl.style.height = pos.height + 'px';
    nodeEl.style.borderColor = pos.color || defaultColor;
    if (pos.color) nodeEl.style.backgroundColor = pos.color;

    const orientH = this.board?.orientation ?? 'vertical';

    if (pos.type === 'board') {
      nodeEl.createDiv(
        `vtasks-handle vtasks-handle-in vtasks-handle-${orientH === 'vertical' ? 'top' : 'left'}`
      );
      const textEl = nodeEl.createDiv('vtasks-text');
      const metaEl = nodeEl.createDiv('vtasks-meta');
      textEl.setText(pos.name || id);
      const total = pos.taskCount ?? 0;
      const countSpan = metaEl.createSpan({ text: `${total} tasks` });
      if (pos.lastModified) {
        metaEl.createSpan({ text: new Date(pos.lastModified).toLocaleDateString() });
      }
      const progressEl = nodeEl.createDiv('vtasks-progress');
      const barEl = progressEl.createDiv('vtasks-progress-bar');
      const done = (pos as any).completedCount ?? 0;
      const pct = total ? (done / total) * 100 : 0;
      barEl.style.width = `${pct}%`;
      if ((pos as any).completedCount === undefined && (pos as any).boardPath) {
        this.computeBoardProgress((pos as any).boardPath).then(({ total: t, done: d }) => {
          countSpan.setText(`${t} tasks`);
          barEl.style.width = t ? `${(d / t) * 100}%` : '0%';
        });
      }
      nodeEl.addClass('vtasks-board-card');
      nodeEl.createDiv(
        `vtasks-handle vtasks-handle-out vtasks-handle-${orientH === 'vertical' ? 'bottom' : 'right'}`
      );
      const dirs = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
      dirs.forEach((d) => nodeEl.createDiv(`vtasks-resize vtasks-resize-${d}`));
      new ResizeObserver(() => {
        this.drawEdges();
        this.updateOverflow(nodeEl);
      }).observe(nodeEl);
      this.updateOverflow(nodeEl);
      nodeEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if ((pos as any).boardPath) {
          this.plugin.openBoardFile((pos as any).boardPath);
        }
      });
      return nodeEl;
    }

    if (pos.type === 'note' || pos.notePath) {
      if (pos.notePath && pos.type !== 'note') pos.type = 'note';
      nodeEl.createDiv(
        `vtasks-handle vtasks-handle-in vtasks-handle-${orientH === 'vertical' ? 'top' : 'left'}`
      );
      const header = nodeEl.createDiv('vtasks-note-header');
      const titleEl = header.createDiv('vtasks-note-title');
      const openEl = header.createDiv('vtasks-note-open');
      setIcon(openEl, 'link');
      openEl.style.display = 'none';
      const area = nodeEl.createEl('textarea', { cls: 'vtasks-note-content' });

      let notePath = pos.notePath;
      console.debug('createNodeElement notePath', { id, notePath });
      if (notePath) {
        let file = this.app.vault.getAbstractFileByPath(notePath);
        const found = file instanceof TFile;
        console.debug('createNodeElement file lookup', { notePath, found });
        if (found) {
          openEl.style.display = '';
          titleEl.setText(file.basename);
          this.app.vault.read(file).then(
            (content) => {
              console.debug('createNodeElement content loaded', { notePath });
              area.value = content;
            },
            (err) => {
              console.debug('createNodeElement content load failed', { notePath, err });
            }
          );
          area.addEventListener('blur', () => {
            this.app.vault.modify(file as TFile, area.value);
          });
          openEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.app.workspace.openLinkText(notePath!, '', true);
          });
          titleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const original = titleEl.textContent || '';
            titleEl.contentEditable = 'true';
            titleEl.classList.add('vtasks-inline-edit');

            const cleanup = () => {
              titleEl.classList.remove('vtasks-inline-edit');
              titleEl.contentEditable = 'false';
              titleEl.removeEventListener('blur', onBlur);
              titleEl.removeEventListener('keydown', onKeydown);
            };

            const save = async () => {
              const newTitle = titleEl.textContent?.trim() || original;
              cleanup();
              if (newTitle && newTitle !== (file as TFile).basename) {
                const parent = (file as TFile).parent?.path ? (file as TFile).parent!.path + '/' : '';
                const newPath = normalizePath(parent + newTitle + '.' + (file as TFile).extension);
                try {
                  await this.app.vault.rename(file as TFile, newPath);
                  notePath = newPath;
                  this.board!.nodes[id].notePath = newPath;
                  await saveBoard(this.app, this.boardFile!, this.board!);
                  titleEl.textContent = (file as TFile).basename;
                } catch (err) {
                  console.error('Failed to rename note', err);
                  titleEl.textContent = original;
                }
              } else {
                titleEl.textContent = original;
              }
            };

            const cancel = () => {
              titleEl.textContent = original;
              cleanup();
            };

            const onBlur = () => save();
            const onKeydown = (ev: KeyboardEvent) => {
              if (ev.key === 'Enter') {
                ev.preventDefault();
                save();
              } else if (ev.key === 'Escape') {
                ev.preventDefault();
                cancel();
              }
            };

            titleEl.addEventListener('blur', onBlur);
            titleEl.addEventListener('keydown', onKeydown);
            titleEl.focus();
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(titleEl);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          });
        } else {
          titleEl.setText(notePath.split('/').pop()?.replace(/\.md$/, '') || '');
        }
      }
      nodeEl.addClass('vtasks-note');
      nodeEl.createDiv(
        `vtasks-handle vtasks-handle-out vtasks-handle-${orientH === 'vertical' ? 'bottom' : 'right'}`
      );
      const dirs = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
      dirs.forEach((d) => nodeEl.createDiv(`vtasks-resize vtasks-resize-${d}`));
      new ResizeObserver(() => {
        this.drawEdges();
      }).observe(nodeEl);
      return nodeEl;
    }

    if (pos.type === 'postit') {
      nodeEl.createDiv(
        `vtasks-handle vtasks-handle-in vtasks-handle-${orientH === 'vertical' ? 'top' : 'left'}`
      );
      const area = nodeEl.createEl('textarea', { cls: 'vtasks-postit-content' });
      area.value = (pos as any).content || '';
      area.addEventListener('blur', () => {
        this.controller?.updatePostItContent(id, area.value);
      });
      nodeEl.addClass('vtasks-postit');
      nodeEl.createDiv(
        `vtasks-handle vtasks-handle-out vtasks-handle-${orientH === 'vertical' ? 'bottom' : 'right'}`
      );
      const dirs = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
      dirs.forEach((d) => nodeEl.createDiv(`vtasks-resize vtasks-resize-${d}`));
      new ResizeObserver(() => {
        this.drawEdges();
      }).observe(nodeEl);
      return nodeEl;
    }

    nodeEl.createDiv(
      `vtasks-handle vtasks-handle-in vtasks-handle-${orientH === 'vertical' ? 'top' : 'left'}`
    );
    const textEl = nodeEl.createDiv('vtasks-text');
    textEl.style.pointerEvents = 'auto';
    textEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const original = textEl.textContent ?? '';
      textEl.contentEditable = 'true';
      textEl.classList.add('vtasks-inline-edit');

      const cleanup = () => {
        textEl.classList.remove('vtasks-inline-edit');
        textEl.contentEditable = 'false';
        textEl.removeEventListener('blur', onBlur);
        textEl.removeEventListener('keydown', onKeydown);
      };

      const save = () => {
        const val = textEl.textContent?.trim() ?? '';
        cleanup();
        this.controller?.renameTask(id, val).then(() => this.render());
      };

      const cancel = () => {
        textEl.textContent = original;
        cleanup();
      };

      const onBlur = () => save();
      const onKeydown = (ev: KeyboardEvent) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          save();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          cancel();
        }
      };

      textEl.addEventListener('blur', onBlur);
      textEl.addEventListener('keydown', onKeydown);
      textEl.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(textEl);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    const task = this.tasks.get(id);
    let text = task?.text ?? id;
    const metas: { key: string; val: string }[] = [];
    const tags: string[] = [];
    let description: string | undefined =
      (pos as any).description ?? task?.description;
    let notePath: string | undefined = task?.notePath;
    text = text.replace(/\[(\w+)::\s*([^\]]+)\]/g, (m, key, val) => {
      if (!['dependsOn', 'subtaskOf', 'after'].includes(key)) metas.push({ key, val: val.trim() });
      return '';
    });
    text = text.replace(/\b(\w+)::\s*((?:\[\[[^\]]+\]\]|[^\n])*?)(?=\s+\w+::|\s+#|$)/g, (m, key, val) => {
      if (!['dependsOn', 'subtaskOf', 'after'].includes(key)) metas.push({ key, val: val.trim() });
      return '';
    });
    text = text.replace(/#(\S+)/g, (_, t) => {
      tags.push('#' + t);
      return '';
    });
    const idMatch = text.trim().match(/\^[\w-]+$/);
    if (idMatch) {
      metas.push({ key: 'ID', val: idMatch[0].slice(1) });
      text = text.replace(/\^[\w-]+$/, '');
    }
    for (let i = metas.length - 1; i >= 0; i--) {
      const k = metas[i].key.toLowerCase();
      if (k === 'description') {
        if (description === undefined) description = metas[i].val;
        metas.splice(i, 1);
      } else if (k === 'notepath') {
        notePath = metas[i].val;
        metas.splice(i, 1);
      }
    }
    textEl.textContent = text.trim();
    if (pos.type !== 'group') {
      const descEl = nodeEl.createDiv('vtasks-desc');
      descEl.style.pointerEvents = 'auto';
      descEl.setAttr('data-raw', description || '');
      if (description) {
        MarkdownRenderer.renderMarkdown(description, descEl, '', this).then(() => {
          const lines = description.split(/\r?\n/);
          let i = 0;
          descEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            for (; i < lines.length; i++) {
              if (/^\s*[-*]\s+\[[ xX]\]\s/.test(lines[i])) {
                (cb as HTMLInputElement).dataset.line = String(i);
                i++;
                break;
              }
            }
          });
        });
      }
      descEl.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'A') return;
        if (
          target instanceof HTMLInputElement &&
          target.type === 'checkbox'
        ) {
          e.stopPropagation();
          const idx = parseInt(target.dataset.line || '', 10);
          if (!isNaN(idx)) {
            const raw = descEl.getAttr('data-raw') || '';
            const lines = raw.split(/\r?\n/);
            if (lines[idx]) {
              lines[idx] = lines[idx].replace(
                /\[( |x)\]/,
                target.checked ? '[x]' : '[ ]',
              );
              this.controller
                ?.setDescription(id, lines.join('\n'))
                .then(() => this.render());
            }
          }
        } else {
          e.stopPropagation();
          this.startDescEdit(id);
        }
      });
    }
    const metaEl = nodeEl.createDiv('vtasks-meta');
    metas.forEach((m) => {
      if (m.key === 'completed') {
        metaEl.createSpan({ text: m.val, cls: 'vtasks-tag-completed' });
      } else {
        metaEl.createSpan({ text: `${m.key}:${m.val}` });
      }
    });
    if (!pos.color) {
      const rules = this.controller?.settings.backgroundColors ?? [];
      for (const r of rules) {
        if (!r.label) continue;
        if (r.label.includes('::')) {
          const [k, v] = r.label.split('::').map((s) => s.trim());
          if (metas.some((m) => m.key === k && m.val === v)) {
            nodeEl.style.backgroundColor = r.color;
            break;
          }
        } else {
          const lbl = r.label.replace(/^#/, '');
          if (tags.includes('#' + lbl)) {
            nodeEl.style.backgroundColor = r.color;
            break;
          }
        }
      }
    }
    const tagsEl = metaEl.createDiv('vtasks-tags');
    tags.forEach((t) => tagsEl.createSpan({ text: t, cls: 'vtasks-tag' }));
    if (notePath) {
      const noteEl = metaEl.createSpan({ cls: 'vtasks-note-link' });
      setIcon(noteEl, 'file');
      noteEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.workspace.openLinkText(notePath!, '', false);
      });
    }
    if (pos.type !== 'group') {
      nodeEl.addClass('vtasks-task');
      const checked = task?.checked ?? false;
      const checkEl = nodeEl.createDiv('vtasks-check');
      setIcon(checkEl, checked ? 'check-circle' : 'circle');
      checkEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const newVal = !this.tasks.get(id)?.checked;
        if (newVal) {
          nodeEl.addClass('done');
          setIcon(checkEl, 'check-circle');
        } else {
          nodeEl.removeClass('done');
          setIcon(checkEl, 'circle');
        }
        this.controller!.setCheck(id, newVal).then(() => this.render());
      });
      if (checked) nodeEl.addClass('done');
    }
    const outHandle = nodeEl.createDiv(
      `vtasks-handle vtasks-handle-out vtasks-handle-${orientH === 'vertical' ? 'bottom' : 'right'}`
    );

    const dirs = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
    dirs.forEach((d) => nodeEl.createDiv(`vtasks-resize vtasks-resize-${d}`));

    new ResizeObserver(() => {
      this.drawEdges();
      this.updateOverflow(nodeEl);
    }).observe(nodeEl);

    this.updateOverflow(nodeEl);

    nodeEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (this.editTimer) {
        window.clearTimeout(this.editTimer);
        this.editTimer = null;
      }
      if (this.editingId) {
        this.finishEditing(true);
        if (this.editingEdgeLabel != null) this.finishEditingEdgeLabel(true);
      }
      if (pos.type === 'group') {
        this.openGroup(id);
      } else {
        this.controller?.editTask(id).then((changed) => {
          if (changed) {
            this.refreshFromVault();
          }
        });
      }
    });

    return nodeEl;
  }

  private registerEvents() {
    this.boardEl.addEventListener('focus', () => {
      this.hasFocus = true;
    });
    this.boardEl.addEventListener('blur', () => {
      this.hasFocus = false;
    });
    if (!this.containerEventsRegistered) {
      this.registerDomEvent(
        this.containerEl,
        'dragover',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.boardEl.addClass('drag-over');
        },
        { capture: true }
      );
      this.registerDomEvent(
        this.containerEl,
        'drop',
        async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('drop items', e.dataTransfer?.items);
        console.log('drop files', e.dataTransfer?.files);
        console.log(
          'drop text/plain',
          e.dataTransfer?.getData?.('text/plain')
        );
        this.boardEl.removeClass('drag-over');
        const pos = this.getBoardCoords(e);
      const boardItems: { path: string; name: string; lastModified?: number }[] = [];
      const notePaths: string[] = [];
      const basePath = ((this.app.vault.adapter as any).basePath || '').replace(/\\/g, '/');
      const toVaultPath = (raw: unknown): string | null => {
        if (raw == null) return null;
        let p =
          typeof raw === 'string'
            ? raw
            : ((raw as any).path || (raw as any).name || '') + '';
        p = decodeURI(p).replace(/\\/g, '/');
        const obsidian = /^obsidian:\/\/open\?(.*)/.exec(p);
        if (obsidian) {
          const params = new URLSearchParams(obsidian[1]);
          const file = params.get('file');
          if (!file) return null;
          p = decodeURIComponent(file);
          if (p.startsWith('/')) p = p.slice(1);
          return normalizePath(p);
        }
        p = p.replace(/^file:\/\//, '').replace(/^app:\/\/local\//, '');
        if (basePath && p.startsWith(basePath)) {
          p = p.slice(basePath.length);
        } else if (basePath && p.includes(':') && !p.startsWith(basePath)) {
          return null; // outside vault
        }
        if (p.startsWith('/')) p = p.slice(1);
        return normalizePath(p);
      };

      const processPath = (
        raw: unknown,
        name?: string,
        lastModified?: number
      ) => {
        let rel = toVaultPath(raw);
        if (!rel) return;
        let lower = rel.toLowerCase();
        // Allow dropping paths without extension; try appending ".md" if it exists
        if (!lower.endsWith('.md')) {
          const mdCandidate = `${rel}.md`;
          if (this.app.vault.getAbstractFileByPath(mdCandidate)) {
            rel = mdCandidate;
            lower = rel.toLowerCase();
          }
        }
        if (lower.endsWith('.mtask')) {
          boardItems.push({
            path: rel,
            name: name || rel.split('/').pop()!.replace(/\.mtask$/i, ''),
            lastModified,
          });
        } else if (lower.endsWith('.md')) {
          notePaths.push(rel);
        }
      };

      const items = e.dataTransfer?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
              processPath((file as any).path || file.name, file.name, file.lastModified);
            }
          } else if (item.kind === 'string') {
            const text = await new Promise<string>((resolve) =>
              item.getAsString((s) => resolve(s))
            );
            if (text) {
              for (const line of text.split('\n')) {
                processPath(line.trim());
              }
            }
          }
        }
      }

      const files = e.dataTransfer?.files;
      if (files) {
        for (const file of Array.from(files)) {
          processPath((file as any).path || file.name, file.name, file.lastModified);
        }
      }

      const text =
        e.dataTransfer?.getData?.('text/plain') ||
        e.dataTransfer?.getData?.('text/uri-list');
      if (text) {
        for (const line of text.split('\n')) {
          processPath(line.trim());
        }
      }

      if (e.dataTransfer?.getData) {
        const dmFile = (this.app as any).dragManager?.getData?.(
          e.dataTransfer,
          'file'
        );
        if (dmFile) {
          const files = Array.isArray(dmFile) ? dmFile : [dmFile];
          for (const f of files) {
            processPath(f.path || f, f.name);
          }
        }
        const dmText = (this.app as any).dragManager?.getData?.(
          e.dataTransfer,
          'text'
        );
        if (dmText) {
          const texts = Array.isArray(dmText) ? dmText : [dmText];
          for (const t of texts) {
            processPath(t.path || t, t.name);
          }
        }
      }

      let offset = 0;
      for (const item of boardItems) {
        const tfile = this.app.vault.getAbstractFileByPath(item.path);
        if (!(tfile instanceof TFile)) continue;
        let total = 0;
        let done = 0;
        try {
          const data = JSON.parse(await this.app.vault.read(tfile));
          for (const nid of Object.keys(data.nodes || {})) {
            if (this.tasks.has(nid)) {
              total++;
              if (this.tasks.get(nid)!.checked) done++;
            }
          }
        } catch {}
        const info = {
          name: item.name,
          lastModified: item.lastModified ?? tfile.stat.mtime,
          taskCount: total,
          completedCount: done,
          path: item.path,
        };
        const id = await this.controller?.addBoardCard(
          info,
          pos.x + offset,
          pos.y + offset
        );
        if (id) {
          const laneId = this.getLaneForPosition(pos.x + offset, pos.y + offset);
          if (laneId) await this.controller?.assignNodeToLane(id, laneId);
          this.render();
          offset += 20;
        }
      }
      for (const path of notePaths) {
        const id = await this.controller?.addNoteNode(
          path,
          pos.x + offset,
          pos.y + offset
        );
        if (id) {
          const laneId = this.getLaneForPosition(pos.x + offset, pos.y + offset);
          if (laneId) await this.controller?.assignNodeToLane(id, laneId);
          this.render();
          offset += 20;
        }
      }
        },
        { capture: true }
      );
      this.containerEventsRegistered = true;
    }
    this.registerDomEvent(this.boardEl, 'dragleave', () => {
      this.boardEl.removeClass('drag-over');
    });

    this.boardEl.onpointerdown = (e) => {
      if ((e as PointerEvent).button === 2) return;
      const descEl = (e.target as HTMLElement).closest('.vtasks-desc') as HTMLElement | null;
      if (descEl?.isContentEditable) return;
      this.pointerDownSelected = false;
      this.boardEl.focus();
      if (this.editingId) this.finishEditing(true);
      if (this.editingEdgeLabel != null) this.finishEditingEdgeLabel(true);
      const laneResize = (e.target as HTMLElement).closest('.vtasks-lane-resize') as HTMLElement | null;
      const laneHeader = (e.target as HTMLElement).closest('.vtasks-lane-header') as HTMLElement | null;
      const lane = (e.target as HTMLElement).closest('.vtasks-lane') as HTMLElement | null;
      const resizeEl = (e.target as HTMLElement).closest('.vtasks-resize') as HTMLElement | null;
      const outHandle = (e.target as HTMLElement).closest('.vtasks-handle-out') as HTMLElement | null;
      const inHandle = (e.target as HTMLElement).closest('.vtasks-handle-in') as HTMLElement | null;
      let node = (e.target as HTMLElement).closest('.vtasks-node') as HTMLElement | null;
      if (laneResize && lane) {
        const id = lane.getAttribute('data-id')!;
        this.resizingLaneId = id;
        const ln = this.board!.lanes[id];
        const cls = Array.from(laneResize.classList).find((c) =>
          c.startsWith('vtasks-lane-resize-')
        );
        this.laneResizeDir = cls ? cls.replace('vtasks-lane-resize-', '') : '';
        this.laneResizeStartWidth = ln.width;
        this.laneResizeStartHeight = ln.height;
        this.laneResizeStartLaneX = ln.x;
        this.laneResizeStartLaneY = ln.y;
        this.laneResizeStartX = (e as PointerEvent).clientX;
        this.laneResizeStartY = (e as PointerEvent).clientY;
      } else if (laneHeader && lane) {
        const id = lane.getAttribute('data-id')!;
        this.draggingLaneId = id;
        const coords = this.getBoardCoords(e as PointerEvent);
        const ln = this.board!.lanes[id];
        this.laneDragOffsetX = coords.x - ln.x;
        this.laneDragOffsetY = coords.y - ln.y;
        this.laneDragNodeIds = [];
        for (const nid in this.board!.nodes) {
          if (this.board!.nodes[nid].lane === id) this.laneDragNodeIds.push(nid);
        }
      } else if (resizeEl && node) {
        const id = node.getAttribute('data-id')!;
        this.resizingId = id;
        const cls = Array.from(resizeEl.classList).find((c) => c.startsWith('vtasks-resize-'))!;
        this.resizeDir = cls.replace('vtasks-resize-', '');
        this.resizeStartNodeX = this.board!.nodes[id].x;
        this.resizeStartNodeY = this.board!.nodes[id].y;
        const rect = node.getBoundingClientRect();
        this.resizeStartWidth = rect.width / this.zoom;
        this.resizeStartHeight = rect.height / this.zoom;
        this.resizeStartX = (e as PointerEvent).clientX;
        this.resizeStartY = (e as PointerEvent).clientY;
        this.board!.nodes[id] = {
          ...this.board!.nodes[id],
          width: rect.width / this.zoom,
          height: rect.height / this.zoom,
        };
        const nd = this.board!.nodes[id];
        if (nd.type === 'group' && nd.members) {
          this.memberResizeStart.clear();
          nd.members.forEach((mid: string) => {
            const m = this.board!.nodes[mid];
            if (m) {
              this.memberResizeStart.set(mid, {
                x: m.x,
                y: m.y,
                width: m.width,
                height: m.height,
              });
            }
          });
        }
      } else if (outHandle && node) {
        const id = node.getAttribute('data-id')!;
        this.edgeStart = id;
        this.boardEl.classList.add('show-handles');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        // Display the temporary connection line while dragging
        path.addClass('vtasks-edge-line');
        path.addClass('vtasks-edge-depends');
        this.tempEdge = path;
        const boardRect = this.boardEl.getBoundingClientRect();
        const r = outHandle.getBoundingClientRect();
        this.edgeX = (r.left - boardRect.left + r.width / 2) / this.zoom;
        this.edgeY = (r.top - boardRect.top + r.height / 2) / this.zoom;
        path.setAttr('d', `M${this.edgeX} ${this.edgeY} C ${this.edgeX} ${this.edgeY} ${this.edgeX} ${this.edgeY} ${this.edgeX} ${this.edgeY}`);
        this.svgEl.appendChild(path);
        if (this.outHoverHandle) {
          this.outHoverHandle.removeClass('vtasks-handle-hover');
          this.outHoverHandle = null;
        }
        this.dragOutHandle = outHandle;
        const clone = outHandle.cloneNode(false) as HTMLElement;
        clone.className = 'vtasks-handle vtasks-handle-dragging';
        clone.style.left = this.edgeX + 'px';
        clone.style.top = this.edgeY + 'px';
        this.boardEl.appendChild(clone);
        this.draggingHandle = clone;
        outHandle.style.opacity = '0';
        this.boardEl.style.cursor = 'grabbing';
      } else if (node && !inHandle) {
        let id = node.getAttribute('data-id')!;
        const parentId = this.board!.nodes[id]?.group;
        if (parentId && parentId !== this.groupId) {
          const parentEl = this.boardEl.querySelector(
            `.vtasks-node[data-id="${parentId}"]`
          ) as HTMLElement | null;
          if (parentEl) {
            node = parentEl;
            id = parentId;
          }
        }
        if ((e as PointerEvent).ctrlKey || (e as PointerEvent).metaKey) {
          // ctrl-click handled in click event
          return;
        }
        const alreadySelected = this.selectedIds.has(id);
        const modifier = (e as PointerEvent).shiftKey || (e as PointerEvent).metaKey;
        if (alreadySelected) {
          if (modifier) {
            this.selectNode(node, id, true);
          }
          // if already selected and no modifier, keep selection as is
        } else {
          this.selectNode(node, id, modifier);
        }
        this.pointerDownSelected = true;
        this.draggingId = id;
        const coords = this.getBoardCoords(e as PointerEvent);
        this.dragStartX = coords.x;
        this.dragStartY = coords.y;
        this.dragStartPositions.clear();
        this.getDragIds().forEach((sid) => {
          const npos = this.board!.nodes[sid];
          this.dragStartPositions.set(sid, { x: npos.x, y: npos.y });
        });
      } else if (
        !node &&
        (((e as PointerEvent).button === 1) || ((e as PointerEvent).ctrlKey && (e as PointerEvent).button === 0))
      ) {
        e.preventDefault();
        this.isBoardDragging = true;
        this.boardStartX = (e as PointerEvent).clientX - this.boardOffsetX;
        this.boardStartY = (e as PointerEvent).clientY - this.boardOffsetY;
      } else {
        const coords = this.getBoardCoords(e as PointerEvent);
        this.selStartX = coords.x;
        this.selStartY = coords.y;
        (this.boardEl as HTMLElement).setPointerCapture((e as PointerEvent).pointerId);
        this.selectionRect = this.boardEl.createDiv('vtasks-selection');
        this.selectionRect.style.left = this.selStartX + 'px';
        this.selectionRect.style.top = this.selStartY + 'px';
        this.didDragSelect = false;
      }
    };

    this.boardEl.onpointermove = (e) => {
      const coords = this.getBoardCoords(e as PointerEvent);
      const snapToGrid = this.board?.snapToGrid ?? true;
      const snapToGuides = this.board?.snapToGuides ?? false;
      const laneId = this.getLaneForPosition(coords.x, coords.y);
      this.boardEl.querySelectorAll('.vtasks-lane').forEach((l) => {
        const el = l as HTMLElement;
        if (laneId && el.getAttribute('data-id') === laneId) {
          el.addClass('vtasks-lane-hover');
        } else {
          el.removeClass('vtasks-lane-hover');
        }
      });
      if (this.resizingLaneId) {
        const lane = this.board!.lanes[this.resizingLaneId];
        const dx = ((e as PointerEvent).clientX - this.laneResizeStartX) / this.zoom;
        const dy = ((e as PointerEvent).clientY - this.laneResizeStartY) / this.zoom;
        if (this.laneResizeDir.includes('e')) {
          lane.width = Math.max(20, this.laneResizeStartWidth + dx);
        } else if (this.laneResizeDir.includes('w')) {
          const newWidth = Math.max(20, this.laneResizeStartWidth - dx);
          lane.x = this.laneResizeStartLaneX + dx;
          lane.width = newWidth;
        }
        if (this.laneResizeDir.includes('s')) {
          lane.height = Math.max(20, this.laneResizeStartHeight + dy);
        } else if (this.laneResizeDir.includes('n')) {
          const newHeight = Math.max(20, this.laneResizeStartHeight - dy);
          lane.y = this.laneResizeStartLaneY + dy;
          lane.height = newHeight;
        }
        this.updateLaneElement(this.resizingLaneId);
        this.drawMinimap();
      } else if (this.draggingLaneId) {
        const lane = this.board!.lanes[this.draggingLaneId];
        const newX = coords.x - this.laneDragOffsetX;
        const newY = coords.y - this.laneDragOffsetY;
        const dx = newX - lane.x;
        const dy = newY - lane.y;
        lane.x = newX;
        lane.y = newY;
        this.updateLaneElement(this.draggingLaneId);
        this.laneDragNodeIds.forEach((nid) => {
          const n = this.board!.nodes[nid];
          if (!n) return;
          n.x += dx;
          n.y += dy;
          const nodeEl = this.boardEl.querySelector(
            `.vtasks-node[data-id="${nid}"]`
          ) as HTMLElement | null;
          if (nodeEl) {
            const parentId = n.group;
            const parentX = parentId ? this.board!.nodes[parentId].x : 0;
            const parentY = parentId ? this.board!.nodes[parentId].y : 0;
            nodeEl.style.left = n.x - parentX + 'px';
            nodeEl.style.top = n.y - parentY + 'px';
          }
        });
        this.drawEdges();
        this.drawMinimap();
      } else if (this.resizingId) {
        const id = this.resizingId;
        const nodeEl = this.boardEl.querySelector(`.vtasks-node[data-id="${id}"]`) as HTMLElement;
        const dx = ((e as PointerEvent).clientX - this.resizeStartX) / this.zoom;
        const dy = ((e as PointerEvent).clientY - this.resizeStartY) / this.zoom;
        const right = this.resizeStartNodeX + this.resizeStartWidth;
        const bottom = this.resizeStartNodeY + this.resizeStartHeight;
        let x = this.resizeStartNodeX;
        let y = this.resizeStartNodeY;
        let width = this.resizeStartWidth;
        let height = this.resizeStartHeight;

        if (this.resizeDir.includes('w')) {
          x = this.resizeStartNodeX + dx;
          if (snapToGrid) x = Math.round(x / this.gridSize) * this.gridSize;
          width = right - x;
        } else if (this.resizeDir.includes('e')) {
          width = this.resizeStartWidth + dx;
          if (snapToGrid) width = Math.round(width / this.gridSize) * this.gridSize;
        }

        if (this.resizeDir.includes('n')) {
          y = this.resizeStartNodeY + dy;
          if (snapToGrid) y = Math.round(y / this.gridSize) * this.gridSize;
          height = bottom - y;
        } else if (this.resizeDir.includes('s')) {
          height = this.resizeStartHeight + dy;
          if (snapToGrid) height = Math.round(height / this.gridSize) * this.gridSize;
        }

        width = Math.max(120, width);
        height = Math.max(20, height);
        let guides = this.showAlignmentGuides(id, x, y, width, height, this.resizeDir);
        if (snapToGuides) {
          const threshold = 5;
          if (guides.alignX != null) {
            const diffLeft = Math.abs(guides.alignX - x);
            const diffRight = Math.abs(guides.alignX - (x + width));
            const diffCenter = Math.abs(guides.alignX - (x + width / 2));
            const minDiff = Math.min(diffLeft, diffRight, diffCenter);
            if (minDiff <= threshold) {
              if (minDiff === diffLeft) {
                x = guides.alignX;
                width = right - x;
              } else if (minDiff === diffRight) {
                width = guides.alignX - x;
              } else {
                x = guides.alignX - width / 2;
              }
            }
          }
          if (guides.alignY != null) {
            const diffTop = Math.abs(guides.alignY - y);
            const diffBottom = Math.abs(guides.alignY - (y + height));
            const diffCenter = Math.abs(guides.alignY - (y + height / 2));
            const minDiff = Math.min(diffTop, diffBottom, diffCenter);
            if (minDiff <= threshold) {
              if (minDiff === diffTop) {
                y = guides.alignY;
                height = bottom - y;
              } else if (minDiff === diffBottom) {
                height = guides.alignY - y;
              } else {
                y = guides.alignY - height / 2;
              }
            }
          }
        }
        nodeEl.style.width = width + 'px';
        nodeEl.style.height = height + 'px';
        const parentId = this.board!.nodes[id].group;
        const parentX = parentId ? this.board!.nodes[parentId].x : 0;
        const parentY = parentId ? this.board!.nodes[parentId].y : 0;
        nodeEl.style.left = x - parentX + 'px';
        nodeEl.style.top = y - parentY + 'px';
        const nodeData = this.board!.nodes[id];
        if (nodeData.type === 'group' && nodeData.members && this.memberResizeStart.size) {
          const sx = width / this.resizeStartWidth;
          const sy = height / this.resizeStartHeight;
          nodeData.members.forEach((mid: string) => {
            const start = this.memberResizeStart.get(mid);
            const child = this.board!.nodes[mid];
            if (!start || !child) return;
            child.x = nodeData.x + (start.x - this.resizeStartNodeX) * sx;
            child.y = nodeData.y + (start.y - this.resizeStartNodeY) * sy;
            if (start.width) child.width = start.width * sx;
            if (start.height) child.height = start.height * sy;
            const childEl = this.boardEl.querySelector(
              `.vtasks-node[data-id="${mid}"]`
            ) as HTMLElement | null;
            if (childEl) {
              childEl.style.left = child.x - nodeData.x + 'px';
              childEl.style.top = child.y - nodeData.y + 'px';
              if (child.width) childEl.style.width = child.width + 'px';
              if (child.height) childEl.style.height = child.height + 'px';
            }
          });
        }
        this.board!.nodes[id] = {
          ...this.board!.nodes[id],
          x,
          y,
          width,
          height,
        };
        if (snapToGuides) this.showAlignmentGuides(id, x, y, width, height);
        this.updateOverflow(nodeEl);
        this.drawEdges();
        this.drawMinimap();
      } else if (this.draggingId) {
        const curX = coords.x;
        const curY = coords.y;
        let mainX = 0, mainY = 0, mainW = 0, mainH = 0;
        this.getDragIds().forEach((id) => {
          const start = this.dragStartPositions.get(id);
          if (!start) return;
          let x = start.x + curX - this.dragStartX;
          let y = start.y + curY - this.dragStartY;
          if (snapToGrid) {
            x = Math.round(x / this.gridSize) * this.gridSize;
            y = Math.round(y / this.gridSize) * this.gridSize;
          }

          const nodeEl = this.boardEl.querySelector(
            `.vtasks-node[data-id="${id}"]`
          ) as HTMLElement;
          const parentId = this.board!.nodes[id].group;
          const parentX = parentId ? this.board!.nodes[parentId].x : 0;
          const parentY = parentId ? this.board!.nodes[parentId].y : 0;
          nodeEl.style.left = x - parentX + 'px';
          nodeEl.style.top = y - parentY + 'px';
          this.board!.nodes[id] = { ...this.board!.nodes[id], x, y };
          if (id === this.draggingId) {
            const w = this.board!.nodes[id].width ?? 120;
            const h =
              this.board!.nodes[id].height ??
              (this.board!.nodes[id].type === 'group' ? 80 : 40);
            mainX = x; mainY = y; mainW = w; mainH = h;
          }
        });
        if (this.draggingId) {
          let guides = this.showAlignmentGuides(this.draggingId, mainX, mainY, mainW, mainH);
          if (snapToGuides) {
            const threshold = 5;
            let newX = mainX;
            let newY = mainY;
            if (guides.alignX != null) {
              const diffLeft = Math.abs(guides.alignX - mainX);
              const diffRight = Math.abs(guides.alignX - (mainX + mainW));
              const diffCenter = Math.abs(guides.alignX - (mainX + mainW / 2));
              const minDiff = Math.min(diffLeft, diffRight, diffCenter);
              if (minDiff <= threshold) {
                if (minDiff === diffLeft) newX = guides.alignX;
                else if (minDiff === diffRight) newX = guides.alignX - mainW;
                else newX = guides.alignX - mainW / 2;
              }
            }
            if (guides.alignY != null) {
              const diffTop = Math.abs(guides.alignY - mainY);
              const diffBottom = Math.abs(guides.alignY - (mainY + mainH));
              const diffCenter = Math.abs(guides.alignY - (mainY + mainH / 2));
              const minDiff = Math.min(diffTop, diffBottom, diffCenter);
              if (minDiff <= threshold) {
                if (minDiff === diffTop) newY = guides.alignY;
                else if (minDiff === diffBottom) newY = guides.alignY - mainH;
                else newY = guides.alignY - mainH / 2;
              }
            }
            const dx = newX - mainX;
            const dy = newY - mainY;
            if (dx || dy) {
              this.getDragIds().forEach((id) => {
                const node = this.board!.nodes[id];
                const nodeEl = this.boardEl.querySelector(
                  `.vtasks-node[data-id="${id}"]`
                ) as HTMLElement;
                const parentId = node.group;
                const parentX = parentId ? this.board!.nodes[parentId].x : 0;
                const parentY = parentId ? this.board!.nodes[parentId].y : 0;
                node.x += dx;
                node.y += dy;
                nodeEl.style.left = node.x - parentX + 'px';
                nodeEl.style.top = node.y - parentY + 'px';
              });
              mainX = newX;
              mainY = newY;
              guides = this.showAlignmentGuides(this.draggingId, mainX, mainY, mainW, mainH);
            }
          }
        }
        this.drawEdges();
        this.drawMinimap();
      } else if (this.isBoardDragging) {
        this.boardOffsetX = (e as PointerEvent).clientX - this.boardStartX;
        this.boardOffsetY = (e as PointerEvent).clientY - this.boardStartY;
        this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
        this.updateMinimapView();
      } else if (this.edgeStart && this.tempEdge) {
        const x2 = coords.x;
        const y2 = coords.y;
        const dx = Math.abs(x2 - this.edgeX);
        this.tempEdge.setAttr('d', `M${this.edgeX} ${this.edgeY} C ${this.edgeX + dx / 2} ${this.edgeY}, ${x2 - dx / 2} ${y2}, ${x2} ${y2}`);
        const el = document.elementFromPoint(
          (e as PointerEvent).clientX,
          (e as PointerEvent).clientY
        );
        let handle = el
          ? ((el.closest('.vtasks-handle-in') as HTMLElement) || null)
          : null;
        if (!handle) {
          const handles = Array.from(
            this.boardEl.querySelectorAll('.vtasks-handle-in')
          ) as HTMLElement[];
          let nearest: HTMLElement | null = null;
          let min = Infinity;
          const px = (e as PointerEvent).clientX;
          const py = (e as PointerEvent).clientY;
          for (const h of handles) {
            const r = h.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const dist = Math.hypot(cx - px, cy - py);
            if (dist < min) {
              min = dist;
              nearest = h;
            }
          }
          if (min < 30) handle = nearest;
        }
        if (handle !== this.edgeHoverHandle) {
          if (this.edgeHoverHandle)
            this.edgeHoverHandle.removeClass('vtasks-handle-hover');
          this.edgeHoverHandle = handle;
          if (this.edgeHoverHandle)
            this.edgeHoverHandle.addClass('vtasks-handle-hover');
        }
        if (this.draggingHandle) {
          this.draggingHandle.style.left = x2 + 'px';
          this.draggingHandle.style.top = y2 + 'px';
        }
      } else if (this.selectionRect) {
        const x = coords.x;
        const y = coords.y;
        const left = Math.min(this.selStartX, x);
        const top = Math.min(this.selStartY, y);
        const width = Math.abs(x - this.selStartX);
        const height = Math.abs(y - this.selStartY);
        this.selectionRect.style.left = left + 'px';
        this.selectionRect.style.top = top + 'px';
        this.selectionRect.style.width = width + 'px';
        this.selectionRect.style.height = height + 'px';
        this.didDragSelect = true;
      } else {
        const el = document.elementFromPoint(
          (e as PointerEvent).clientX,
          (e as PointerEvent).clientY
        );
        let handle = el
          ? ((el.closest('.vtasks-handle-out') as HTMLElement) || null)
          : null;
        if (!handle) {
          const handles = Array.from(
            this.boardEl.querySelectorAll('.vtasks-handle-out')
          ) as HTMLElement[];
          let nearest: HTMLElement | null = null;
          let min = Infinity;
          const px = (e as PointerEvent).clientX;
          const py = (e as PointerEvent).clientY;
          for (const h of handles) {
            const r = h.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const dist = Math.hypot(cx - px, cy - py);
            if (dist < min) {
              min = dist;
              nearest = h;
            }
          }
          if (min < 30) handle = nearest;
        }
        if (handle !== this.outHoverHandle) {
          if (this.outHoverHandle)
            this.outHoverHandle.removeClass('vtasks-handle-hover');
          this.outHoverHandle = handle;
          if (this.outHoverHandle)
            this.outHoverHandle.addClass('vtasks-handle-hover');
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      (this.boardEl as HTMLElement).releasePointerCapture((e as PointerEvent).pointerId);
      if (this.resizingLaneId) {
        const id = this.resizingLaneId;
        this.resizingLaneId = null;
        this.laneResizeDir = '';
        const lane = this.board!.lanes[id];
        this.controller!.moveLane(id, lane.x, lane.y, lane.width, lane.height);
        this.drawMinimap();
      } else if (this.draggingLaneId) {
        const id = this.draggingLaneId;
        this.draggingLaneId = null;
        const lane = this.board!.lanes[id];
        this.controller!.moveLane(id, lane.x, lane.y, lane.width, lane.height);
        this.drawEdges();
        this.drawMinimap();
        this.laneDragNodeIds = [];
      } else if (this.resizingId) {
        const id = this.resizingId;
        this.resizingId = null;
        this.hideAlignLine(this.alignVLine, 'V');
        this.hideAlignLine(this.alignHLine, 'H');
        const pos = this.board!.nodes[id];
        const oldLane = pos.lane;
        const laneId = this.getLaneForNode(id);
        if (laneId && oldLane !== laneId) {
          this.snapNodeToLane(id, laneId);
        }
        this.controller!.assignNodeToLane(id, laneId ?? null);
        this.controller!.moveNode(id, pos.x, pos.y);
        this.controller!.resizeNode(
          id,
          pos.width ?? 0,
          pos.height ?? 0,
          this.resizeStartWidth,
          this.resizeStartHeight
        );
        this.memberResizeStart.clear();
        this.drawEdges();
        this.drawMinimap();
      } else if (this.draggingId) {
        this.draggingId = null;
        this.hideAlignLine(this.alignVLine, 'V');
        this.hideAlignLine(this.alignHLine, 'H');
        this.selectedIds.forEach((id) => {
          const pos = this.board!.nodes[id];
          const oldLane = pos.lane;
          const laneId = this.getLaneForNode(id);
          if (laneId && oldLane !== laneId) {
            this.snapNodeToLane(id, laneId);
          }
          this.controller!.assignNodeToLane(id, laneId ?? null);
          this.controller!.moveNode(id, pos.x, pos.y);
          if (this.board!.nodes[id].type === 'postit') {
            const target = this.findAttachmentTarget(id);
            this.controller!.attachNode(id, target);
          }
        });
        this.drawEdges();
        this.drawMinimap();
      } else if (this.isBoardDragging) {
        this.isBoardDragging = false;
        this.updateMinimapView();
      } else if (this.edgeStart) {
        if (this.edgeHoverHandle) {
          this.edgeHoverHandle.removeClass('vtasks-handle-hover');
          this.edgeHoverHandle = null;
        }
        const el = document.elementFromPoint(
          (e as PointerEvent).clientX,
          (e as PointerEvent).clientY
        );
        const node = el ? (el.closest('.vtasks-node') as HTMLElement | null) : null;
        if (node) {
          const toId = node.getAttribute('data-id')!;
          if (toId !== this.edgeStart) {
            this.controller!
              .createEdge(this.edgeStart, toId, 'depends')
              .then(() => this.render());
          }
        }
        this.edgeStart = null;
        this.boardEl.classList.remove('show-handles');
        if (this.tempEdge) {
          this.tempEdge.remove();
          this.tempEdge = null;
        }
        if (this.draggingHandle) {
          this.draggingHandle.remove();
          this.draggingHandle = null;
        }
        if (this.dragOutHandle) {
          this.dragOutHandle.style.opacity = '';
          this.dragOutHandle = null;
        }
        this.boardEl.style.cursor = '';
        this.drawEdges();
      } else if (this.selectionRect) {
        const rect = this.selectionRect.getBoundingClientRect();
        const toggle = (e as MouseEvent).shiftKey || (e as MouseEvent).metaKey;
        this.boardEl.querySelectorAll('.vtasks-node').forEach((n) => {
          const r = n.getBoundingClientRect();
          if (
            r.right >= rect.left &&
            r.left <= rect.right &&
            r.bottom >= rect.top &&
            r.top <= rect.bottom
          ) {
            let id = n.getAttribute('data-id')!;
            let el = n as HTMLElement;
            const parentId = this.board!.nodes[id]?.group;
            if (parentId && parentId !== this.groupId) {
              const parentEl = this.boardEl.querySelector(
                `.vtasks-node[data-id="${parentId}"]`
              ) as HTMLElement | null;
              if (parentEl) {
                id = parentId;
                el = parentEl;
              }
            }
            if (toggle) {
              this.selectNode(el, id, true);
            } else {
              this.addToSelection(el, id);
            }
          }
        });
        this.selectionRect.remove();
        this.selectionRect = null;
        setTimeout(() => {
          this.didDragSelect = false;
        });
      }
    };

    this.boardEl.onpointerup = handlePointerUp;
    this.boardEl.onpointercancel = handlePointerUp;

    this.boardEl.onpointerleave = () => {
      if (this.isBoardDragging) {
        this.isBoardDragging = false;
        this.updateMinimapView();
      }
      this.boardEl
        .querySelectorAll('.vtasks-lane')
        .forEach((l) => (l as HTMLElement).removeClass('vtasks-lane-hover'));
    };

    this.boardEl.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const rect = this.containerEl.getBoundingClientRect();
          const anchorX = e.clientX - rect.left;
          const anchorY = e.clientY - rect.top;
          if (e.deltaY < 0) {
            this.zoomAt(1.1, anchorX, anchorY);
          } else {
            this.zoomAt(1 / 1.1, anchorX, anchorY);
          }
        }
      },
      { passive: false }
    );

      this.boardEl.ondblclick = (e) => {
        const edgeEl = document
          .elementsFromPoint((e as MouseEvent).clientX, (e as MouseEvent).clientY)
          .find(
            (el) =>
              el.classList.contains('vtasks-edge') ||
              el.classList.contains('vtasks-edge-line')
          ) as SVGPathElement | undefined;
        if (edgeEl && edgeEl.getAttr('data-index')) {
          this.startEditingEdgeLabel(parseInt(edgeEl.getAttr('data-index')!));
          return;
        }
        if (
          (e.target as HTMLElement).closest('.vtasks-node') ||
          (e.target as HTMLElement).closest('.vtasks-lane-header') ||
          (e.target as HTMLElement).closest('.vtasks-edge-label')
        )
          return;
        const pos = this.getBoardCoords(e as MouseEvent);
        if (this.groupId) {
          const g = this.board!.nodes[this.groupId];
          const w = g.width ?? 0;
          const h = g.height ?? 0;
          if (pos.x < g.x || pos.x > g.x + w || pos.y < g.y || pos.y > g.y + h) {
            this.openGroup(null);
            return;
          }
        }
        this.controller!
          .createTask('New Task', pos.x, pos.y)
          .then((id) => {
            const laneId = this.getLaneForPosition(pos.x, pos.y);
            if (laneId) {
              this.controller!
                .assignNodeToLane(id, laneId)
                .then(() => this.render());
            } else {
              this.render();
            }
          });
      };

    this.boardEl.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.vtasks-node') as HTMLElement | null;
      if (target) {
        let id = target.getAttribute('data-id')!;
        let el = target;
        const parentId = this.board!.nodes[id]?.group;
        if (parentId && parentId !== this.groupId) {
          const parentEl = this.boardEl.querySelector(
            `.vtasks-node[data-id="${parentId}"]`
          ) as HTMLElement | null;
          if (parentEl) {
            id = parentId;
            el = parentEl;
          }
        }
        if ((e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) {
          this.controller?.openTask(id);
          this.pointerDownSelected = false;
          return;
        }
        if (!this.pointerDownSelected) {
          this.selectNode(el, id, (e as MouseEvent).shiftKey || (e as MouseEvent).metaKey);
        }
      } else {
        this.finishEditing(true);
          if (
            !this.didDragSelect &&
            !(e as MouseEvent).shiftKey &&
            this.hasFocus
          ) {
            this.clearSelection();
          }
        this.didDragSelect = false;
      }
      this.pointerDownSelected = false;
    });

    this.boardEl.addEventListener('contextmenu', (e) => {
      const target = (e.target as HTMLElement).closest('.vtasks-node') as HTMLElement | null;
      if (!target) {
        e.preventDefault();
        e.stopPropagation();
        const pos = this.getBoardCoords(e as MouseEvent);
        const menu = new Menu();
        menu.addItem((item) =>
          item.setTitle('Create lane').onClick(() => {
            const orient = this.board?.orientation ?? 'vertical';
            this.controller!
              .createLane('Lane', pos.x, pos.y, 300, 300, orient)
              .then(() => this.render());
          })
        );
        menu.addItem((item) =>
          item.setTitle('Add existing task').onClick(() => this.openExistingTaskModal(pos))
        );
        menu.addItem((item) =>
          item.setTitle('Add post-it').onClick(() => {
            this.controller!
              .addPostIt(pos.x, pos.y)
              .then((id) => {
                const laneId = this.getLaneForPosition(pos.x, pos.y);
                if (laneId) {
                  this.controller!
                    .assignNodeToLane(id, laneId)
                    .then(() => this.render());
                } else {
                  this.render();
                }
              });
          })
        );
        menu.showAtMouseEvent(e as MouseEvent);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      let id = target.getAttribute('data-id')!;
      const parentId = this.board!.nodes[id]?.group;
      if (parentId && parentId !== this.groupId) {
        const parentEl = this.boardEl.querySelector(
          `.vtasks-node[data-id="${parentId}"]`
        ) as HTMLElement | null;
        if (parentEl) id = parentId;
      }
      const menu = new Menu();
      const selected = Array.from(this.selectedIds);
      if (selected.length > 1) {
          menu.addItem((item) =>
            item
              .setTitle('Rearrange selected')
              .onClick(() =>
                this.controller!
                  .rearrangeNodes(selected)
                  .then(() => this.render())
              )
          );
        menu.addItem((item) => {
          item.setTitle('Align');
          item.onClick((evt) => {
            const sub = new Menu();
            const opts: [
              string,
              Parameters<typeof Controller.prototype.alignNodes>[1]
            ][] = [
              ['Left', 'left'],
              ['Right', 'right'],
              ['Top', 'top'],
              ['Bottom', 'bottom'],
              ['Horizontal center', 'hcenter'],
              ['Vertical center', 'vcenter'],
            ];
            opts.forEach(([label, type]) => {
              sub.addItem((subItem: MenuItem) =>
                subItem
                  .setTitle(label)
                  .onClick(() =>
                    this.controller!
                      .alignNodes(selected, type)
                      .then(() => this.render())
                  )
              );
            });
            sub.showAtPosition({
              x: (evt as MouseEvent).pageX + 5,
              y: (evt as MouseEvent).pageY,
            });
          });
        });
      }
      const colors = ['#ff5555', '#55ff55', '#5555ff', '#ffaa00', '#00aaaa'];

      menu.addItem((item) => {
        item.setTitle('Color').setIcon('palette');
        item.onClick((evt) => {
          const sub = new Menu();
          sub.addItem((subItem: MenuItem) =>
            subItem
              .setTitle('Default')
              .onClick(() => {
                target.style.borderColor = '';
                if (this.board!.nodes[id].type !== 'group') {
                  target.style.backgroundColor = '';
                }
                this.controller?.setNodeColor(id, null).then(() => this.render());
              })
          );

          colors.forEach((color) => {
            sub.addItem((subItem: MenuItem) => {
              subItem.setTitle(color).setIcon('circle');
              (subItem as any).iconEl.style.color = color;
              subItem.onClick(() => {
                target.style.borderColor = color;
                if (this.board!.nodes[id].type !== 'group') {
                  target.style.backgroundColor = color;
                }
                this.controller?.setNodeColor(id, color).then(() => this.render());
              });
            });
          });
          sub.showAtPosition({
            x: (evt as MouseEvent).pageX + 5,
            y: (evt as MouseEvent).pageY,
          });
        });
      });

      const checked = this.tasks.get(id)?.checked ?? false;
      menu.addItem((item) =>
        item
          .setTitle(checked ? 'Mark not done' : 'Mark done')
          .onClick(() => this.controller!.setCheck(id, !checked).then(() => this.render()))
      );

      const toDelete =
        selected.length > 1 && selected.includes(id) ? selected : [id];
      if (this.board!.nodes[id].type !== 'group') {
        menu.addItem((item) =>
          item
            .setTitle(
              toDelete.length > 1 ? 'Delete selected tasks' : 'Delete task'
            )
            .setIcon('trash')
            .setSection('danger')
            .onClick(() =>
              Promise.all(
                toDelete.map((tid) => this.controller!.deleteTask(tid))
              ).then(() => {
                toDelete.forEach((tid) => this.selectedIds.delete(tid));
                this.render();
              })
            )
        );
      }
      menu.showAtMouseEvent(e as MouseEvent);
    });

    this.boardEl.addEventListener('keydown', (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }
      const first = Array.from(this.selectedIds)[0];
      if (e.key === '+' || e.key === '=') {
        const rect = this.containerEl.getBoundingClientRect();
        this.zoomAt(1.1, rect.width / 2, rect.height / 2);
        return;
      }
      if (e.key === '-') {
        const rect = this.containerEl.getBoundingClientRect();
        this.zoomAt(1 / 1.1, rect.width / 2, rect.height / 2);
        return;
      }
      if (!first) return;
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.length === 1 &&
        e.key !== ' '
      ) {
        e.preventDefault();
        this.startDescEdit(first, e.key);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        this.controller!.toggleCheck(first).then(() => this.render());
      }
    });

    // Left-clicking an edge should no longer change its type. Users now access
    // edge actions exclusively through the context menu.
    // this.svgEl.addEventListener('click', (e) => {
    //   const edgeEl = (e.target as HTMLElement).closest('path.vtasks-edge') as SVGPathElement | null;
    //   if (edgeEl && edgeEl.getAttr('data-index')) {
    //     const idx = parseInt(edgeEl.getAttr('data-index')!);
    //     this.controller.cycleEdgeType(idx).then(() => this.render());
    //   }
    // });

    this.svgEl.addEventListener('contextmenu', (e) => {
      const edgeEl = (e.target as HTMLElement).closest('path.vtasks-edge') as SVGPathElement | null;
      if (!edgeEl || !edgeEl.getAttr('data-index')) return;
      e.preventDefault();
      // Prevent the board-level context menu from also opening
      e.stopPropagation();
      const idx = parseInt(edgeEl.getAttr('data-index')!);
      const edge = this.board!.edges[idx];
      if (!edge) return;
      const menu = new Menu();
      const types = ['depends', 'subtask', 'sequence'];
      types.forEach((t) => {
        const title = edge.type === t ? `✔ ${t}` : t;
        menu.addItem((item) =>
          item.setTitle(title).onClick(() => {
            this.controller!.setEdgeType(idx, t).then(() => this.render());
          })
        );
      });
      menu.addItem((item) =>
        item
          .setTitle('Delete connection')
          .setIcon('trash')
          .setSection('danger')
          .onClick(() => {
            this.controller!.deleteEdge(idx).then(() => this.render());
          })
      );
      menu.showAtMouseEvent(e as MouseEvent);
    });

    this.minimapEl.onpointerdown = (e) => {
      this.isMinimapDragging = true;
      this.moveBoardFromMinimap(e as PointerEvent);
    };
    this.minimapEl.onpointermove = (e) => {
      if (this.isMinimapDragging) this.moveBoardFromMinimap(e as PointerEvent);
    };
    this.minimapEl.onpointerup = () => {
      this.isMinimapDragging = false;
    };
    this.minimapEl.onpointerleave = () => {
      this.isMinimapDragging = false;
    };
  }

  private selectNode(el: HTMLElement, id: string, additive = false) {
    if (!additive) {
      this.clearSelection();
      this.selectedIds.add(id);
      el.classList.add('selected');
    } else {
      if (this.selectedIds.has(id)) {
        this.selectedIds.delete(id);
        el.classList.remove('selected');
      } else {
        this.selectedIds.add(id);
        el.classList.add('selected');
      }
    }
    this.boardEl.focus();
  }

  private addToSelection(el: HTMLElement, id: string) {
    if (!this.selectedIds.has(id)) {
      this.selectedIds.add(id);
      el.classList.add('selected');
      this.boardEl.focus();
    }
  }

  private clearSelection() {
    this.selectedIds.forEach((sid) => {
      const el = this.boardEl.querySelector(`.vtasks-node[data-id="${sid}"]`) as HTMLElement | null;
      if (el) el.classList.remove('selected');
    });
    this.selectedIds.clear();
  }

  private getDragIds(): Set<string> {
    const ids = new Set<string>();
    const add = (id: string) => {
      if (ids.has(id)) return;
      ids.add(id);
      const n = this.board!.nodes[id];
      if (n) {
        if (n.type === 'group' && n.members) {
          n.members.forEach((mid: string) => add(mid));
        }
        for (const [nid, nn] of Object.entries(this.board!.nodes)) {
          if ((nn as any).attachedTo === id) add(nid);
        }
      }
    };
    this.selectedIds.forEach((sid) => add(sid));
    return ids;
  }

  private drawEdges() {
    const toRemove = new Set(this.edgeEls.keys());
    this.boardEl
      .querySelectorAll('.vtasks-handle')
      .forEach((h) => (h as HTMLElement).removeClass('vtasks-handle-connected'));
    this.board!.edges.forEach((edge, idx) => {
      const fromNode = this.board!.nodes[edge.from];
      const toNode = this.board!.nodes[edge.to];
      const els = this.edgeEls.get(idx);
      if (
        (fromNode.group || null) !== this.groupId ||
        (toNode.group || null) !== this.groupId
      ) {
        if (els) {
          els.hit.remove();
          els.line.remove();
          els.label?.remove();
          this.edgeEls.delete(idx);
        }
        return;
      }
      const fromEl = this.boardEl.querySelector(`.vtasks-node[data-id="${edge.from}"] .vtasks-handle-out`) as HTMLElement | null;
      const toEl = this.boardEl.querySelector(`.vtasks-node[data-id="${edge.to}"] .vtasks-handle-in`) as HTMLElement | null;
      if (!fromEl || !toEl) {
        if (els) {
          els.hit.remove();
          els.line.remove();
          els.label?.remove();
          this.edgeEls.delete(idx);
        }
        return;
      }
      fromEl.addClass('vtasks-handle-connected');
      toEl.addClass('vtasks-handle-connected');
      const boardRect = this.boardEl.getBoundingClientRect();
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      const x1 = (fr.left - boardRect.left + fr.width / 2) / this.zoom;
      const y1 = (fr.top - boardRect.top + fr.height / 2) / this.zoom;
      const x2 = (tr.left - boardRect.left + tr.width / 2) / this.zoom;
      const y2 = (tr.top - boardRect.top + tr.height / 2) / this.zoom;
      const orientD = this.board?.orientation ?? 'vertical';
      let d: string;
      if (orientD === 'horizontal') {
        const dx = Math.abs(x2 - x1);
        d = `M${x1} ${y1} C ${x1 + dx / 2} ${y1}, ${x2 - dx / 2} ${y2}, ${x2} ${y2}`;
      } else {
        const dy = Math.abs(y2 - y1);
        d = `M${x1} ${y1} C ${x1} ${y1 + dy / 2}, ${x2} ${y2 - dy / 2}, ${x2} ${y2}`;
      }
      toRemove.delete(idx);
      let current = els;
      if (!current) {
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hit.classList.add('vtasks-edge');
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.classList.add('vtasks-edge-line');
        this.svgEl.appendChild(hit);
        this.svgEl.appendChild(line);
        current = { hit, line, x1, y1, x2, y2 };
        this.edgeEls.set(idx, current);
      } else {
        current.x1 = x1;
        current.y1 = y1;
        current.x2 = x2;
        current.y2 = y2;
      }
      current.hit.setAttr('d', d);
      current.hit.setAttr('data-index', String(idx));
      current.hit.ondblclick = (e) => {
        e.stopPropagation();
        this.startEditingEdgeLabel(idx);
      };
      current.line.setAttr('d', d);
      current.line.setAttr('data-index', String(idx));
      current.line.classList.remove(
        'vtasks-edge-depends',
        'vtasks-edge-subtask',
        'vtasks-edge-sequence'
      );
      current.line.classList.add(`vtasks-edge-${edge.type}`);
      // Handle label
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      if (edge.label) {
        let label = current.label;
        if (!label) {
          label = this.boardEl.createDiv('vtasks-edge-label');
          label.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startEditingEdgeLabel(idx);
          });
          current.label = label;
        }
        label.setText(edge.label);
        label.style.left = cx + 'px';
        label.style.top = cy + 'px';
        label.classList.remove(
          'vtasks-edge-depends',
          'vtasks-edge-subtask',
          'vtasks-edge-sequence'
        );
        label.classList.add(`vtasks-edge-${edge.type}`);
      } else if (current.label) {
        current.label.remove();
        current.label = undefined;
      }
    });
    toRemove.forEach((idx) => {
      const els = this.edgeEls.get(idx);
      if (!els) return;
      els.hit.remove();
      els.line.remove();
      els.label?.remove();
      this.edgeEls.delete(idx);
    });
  }

  private startDescEdit(id: string, initial?: string) {
    const descEl = this.boardEl.querySelector(
      `.vtasks-node[data-id="${id}"] .vtasks-desc`
    ) as HTMLElement | null;
    if (!descEl) return;
    const original = descEl.getAttr('data-raw') || '';
    descEl.contentEditable = 'true';
    descEl.textContent = original;
    descEl.classList.add('vtasks-inline-edit');
    const suggester = new WikiLinkSuggest(
      this.app,
      descEl as HTMLDivElement | HTMLInputElement | HTMLTextAreaElement,
    );

    const cleanup = () => {
      descEl.classList.remove('vtasks-inline-edit');
      descEl.contentEditable = 'false';
      descEl.removeEventListener('blur', onBlur);
      descEl.removeEventListener('keydown', onKeydown);
      suggester.close();
    };

    const save = () => {
      const val = descEl.innerText ?? '';
      cleanup();
      this.controller?.setDescription(id, val).then(() => this.render());
    };

    const cancel = () => {
      cleanup();
      descEl.setAttr('data-raw', original);
      descEl.empty();
      MarkdownRenderer.renderMarkdown(original, descEl, '', this);
    };

    const onBlur = () => save();
    const onKeydown = (ev: KeyboardEvent) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') {
        ev.preventDefault();
        cancel();
      } else if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        save();
      }
    };

    descEl.addEventListener('blur', onBlur);
    descEl.addEventListener('keydown', onKeydown);
    if (initial) {
      descEl.textContent = original + initial;
    }
    descEl.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(descEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  private updateOverflow(nodeEl: HTMLElement) {
    const textEl = nodeEl.querySelector('.vtasks-text') as HTMLElement | null;
    if (!textEl) return;
    if (nodeEl.style.height) {
      textEl.style.maxHeight = '100%';
    } else {
      textEl.style.maxHeight = '';
    }
    if (textEl.scrollHeight > textEl.clientHeight) {
      textEl.classList.add('vtasks-fade');
    } else {
      textEl.classList.remove('vtasks-fade');
    }
  }

  private async computeBoardProgress(
    path: string
  ): Promise<{ total: number; done: number }> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return { total: 0, done: 0 };
    try {
      const data = JSON.parse(await this.app.vault.read(file));
      let total = 0;
      let done = 0;
      for (const nid of Object.keys(data.nodes || {})) {
        if (this.tasks.has(nid)) {
          total++;
          if (this.tasks.get(nid)!.checked) done++;
        }
      }
      return { total, done };
    } catch {
      return { total: 0, done: 0 };
    }
  }

  private showAlignmentGuides(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    dir = ''
  ) {
    const threshold = this.board?.alignThreshold ?? 5;
    const cx = x + w / 2;
    const cy = y + h / 2;
    let alignX: number | null = null;
    let alignY: number | null = null;

    const checkLeft = dir ? dir.includes('w') : true;
    const checkRight = dir ? dir.includes('e') : true;
    const checkXCenter = !dir;
    const checkTop = dir ? dir.includes('n') : true;
    const checkBottom = dir ? dir.includes('s') : true;
    const checkYCenter = !dir;
    const checkX = checkLeft || checkRight || checkXCenter;
    const checkY = checkTop || checkBottom || checkYCenter;

    for (const nid in this.board!.nodes) {
      if (nid === id) continue;
      const n = this.board!.nodes[nid];
      if ((n.group || null) !== this.groupId) continue;
      const nw = n.width ?? 120;
      const nh = n.height ?? (n.type === 'group' ? 80 : 40);
      const ncx = n.x + nw / 2;
      const ncy = n.y + nh / 2;
      const xs = [n.x, n.x + nw, ncx];
      const ys = [n.y, n.y + nh, ncy];
      if (checkX) {
        xs.forEach((xx) => {
          if (checkLeft && Math.abs(xx - x) <= threshold) alignX = xx;
          if (checkRight && Math.abs(xx - (x + w)) <= threshold) alignX = xx;
          if (checkXCenter && Math.abs(xx - cx) <= threshold) alignX = xx;
        });
      }
      if (checkY) {
        ys.forEach((yy) => {
          if (checkTop && Math.abs(yy - y) <= threshold) alignY = yy;
          if (checkBottom && Math.abs(yy - (y + h)) <= threshold) alignY = yy;
          if (checkYCenter && Math.abs(yy - cy) <= threshold) alignY = yy;
        });
      }
    }
    if (checkX && alignX != null) {
      this.showAlignLine(this.alignVLine, 'left', alignX, 'V');
    } else {
      this.hideAlignLine(this.alignVLine, 'V');
    }
    if (checkY && alignY != null) {
      this.showAlignLine(this.alignHLine, 'top', alignY, 'H');
    } else {
      this.hideAlignLine(this.alignHLine, 'H');
    }
    return { alignX, alignY };
  }

  private showAlignLine(
    el: HTMLElement,
    prop: 'left' | 'top',
    value: number,
    type: 'V' | 'H'
  ) {
    el.style[prop] = value + 'px';
    el.classList.remove('vtasks-align-fade');
    el.style.display = '';
    if (type === 'V' && this.alignVTimeout != null) {
      clearTimeout(this.alignVTimeout);
      this.alignVTimeout = null;
    }
    if (type === 'H' && this.alignHTimeout != null) {
      clearTimeout(this.alignHTimeout);
      this.alignHTimeout = null;
    }
  }

  private hideAlignLine(el: HTMLElement, type: 'V' | 'H') {
    el.classList.add('vtasks-align-fade');
    const duration = this.getAlignFadeDuration(el);
    const timeout = window.setTimeout(() => {
      el.style.display = 'none';
      el.classList.remove('vtasks-align-fade');
      if (type === 'V') this.alignVTimeout = null;
      if (type === 'H') this.alignHTimeout = null;
    }, duration);
    if (type === 'V') this.alignVTimeout = timeout;
    if (type === 'H') this.alignHTimeout = timeout;
  }

  private getAlignFadeDuration(el: HTMLElement): number {
    const val = getComputedStyle(el)
      .getPropertyValue('--align-line-fade')
      .trim();
    if (val.endsWith('ms')) return parseFloat(val);
    if (val.endsWith('s')) return parseFloat(val) * 1000;
    const num = parseFloat(val);
    return isNaN(num) ? 300 : num;
  }

  private startEditing(nodeEl: HTMLElement, id: string) {
    if (!this.controller) return;
    const textEl = nodeEl.querySelector('.vtasks-text') as HTMLElement | null;
    if (!textEl) return;
    this.editingId = id;
    const original = textEl.textContent || '';
    const input = document.createElement('input');
    input.value = original;
    input.classList.add('vtasks-edit-input');
    textEl.replaceWith(input);
    const finish = (save: boolean) => {
      if (this.editingId !== id) return;
      this.editingId = null;
      const val = save ? input.value : original;
      const span = document.createElement('div');
      span.classList.add('vtasks-text');
      span.textContent = val;
      input.replaceWith(span);
      if (save && val !== original) {
        this.controller!.renameTask(id, val).then(() => this.render());
      }
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    input.focus();
  }

  private finishEditing(save: boolean) {
    if (!this.editingId) return;
    const nodeEl = this.boardEl.querySelector(`.vtasks-node[data-id="${this.editingId}"]`);
    if (!nodeEl) {
      this.editingId = null;
      return;
    }
    const input = nodeEl.querySelector('input.vtasks-edit-input') as HTMLInputElement | null;
    if (!input) {
      this.editingId = null;
      return;
    }
    const val = input.value;
    const span = document.createElement('div');
    span.classList.add('vtasks-text');
    span.textContent = val;
    input.replaceWith(span);
    const id = this.editingId;
    this.editingId = null;
    if (save) {
      this.controller!.renameTask(id, val).then(() => this.render());
    }
  }

  private startEditingEdgeLabel(idx: number) {
    if (!this.controller) return;
    const current = this.edgeEls.get(idx);
    const edge = this.board!.edges[idx];
    if (!current || !edge) return;
    this.finishEditingEdgeLabel(true);
    current.label?.remove();
    const cx = (current.x1 + current.x2) / 2;
    const cy = (current.y1 + current.y2) / 2;
    const area = document.createElement('textarea');
    area.value = edge.label || '';
    area.classList.add(
      'vtasks-edge-label',
      'vtasks-edge-label-input',
      `vtasks-edge-${edge.type}`
    );
    area.style.left = cx + 'px';
    area.style.top = cy + 'px';
    this.boardEl.appendChild(area);
    this.editingEdgeLabel = idx;
    const finish = (save: boolean) => {
      if (this.editingEdgeLabel !== idx) return;
      const val = save ? area.value.trim() : edge.label || '';
      area.remove();
      this.editingEdgeLabel = null;
      if (save) {
        this.controller!.setEdgeLabel(idx, val).then(() => this.render());
      } else {
        this.render();
      }
    };
    area.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finish(true);
      }
    });
    area.addEventListener('blur', () => finish(true));
    area.focus();
  }

  private finishEditingEdgeLabel(save: boolean) {
    if (this.editingEdgeLabel == null) return;
    const idx = this.editingEdgeLabel;
    const area = this.boardEl.querySelector('textarea.vtasks-edge-label-input') as HTMLTextAreaElement | null;
    if (!area) {
      this.editingEdgeLabel = null;
      return;
    }
    const val = area.value.trim();
    area.remove();
    this.editingEdgeLabel = null;
    if (save) {
      this.controller!.setEdgeLabel(idx, val).then(() => this.render());
    } else {
      this.render();
    }
  }


  private openGroup(id: string | null) {
    // null represents the root level of the board
    if (id) {
      const g = this.board!.nodes[id];
      if (g) {
        const rect = this.containerEl.getBoundingClientRect();
        const centerX = g.x + (g.width ?? 0) / 2;
        const centerY = g.y + (g.height ?? 0) / 2;
        this.boardOffsetX = rect.width / 2 - centerX * this.zoom;
        this.boardOffsetY = rect.height / 2 - centerY * this.zoom;
      }
    }
    this.groupId = id ?? null;
    this.clearSelection();
    this.render();
  }

  private updateGroupFocus() {
    if (!this.groupId || !this.groupFocusEl) return;
    const g = this.board!.nodes[this.groupId];
    if (!g) return;
    const w = g.width ?? 0;
    const h = g.height ?? 0;
    this.groupFocusEl.style.left = g.x + 'px';
    this.groupFocusEl.style.top = g.y + 'px';
    this.groupFocusEl.style.width = w + 'px';
    this.groupFocusEl.style.height = h + 'px';
  }

  private drawMinimap() {
    if (!this.minimapSvg) return;
    this.minimapSvg.empty();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const nodes: { x: number; y: number; w: number; h: number }[] = [];
    const lanes: { x: number; y: number; w: number; h: number }[] = [];
    for (const lid in this.board!.lanes) {
      const l = this.board!.lanes[lid];
      lanes.push({ x: l.x, y: l.y, w: l.width, h: l.height });
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
      maxX = Math.max(maxX, l.x + l.width);
      maxY = Math.max(maxY, l.y + l.height);
    }
    const addNode = (nid: string) => {
      const n = this.board!.nodes[nid];
      if (!n) return;
      const w = n.width ?? 120;
      const h = n.height ?? (n.type === 'group' ? 80 : 40);
      nodes.push({ x: n.x, y: n.y, w, h });
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
      if (n.type === 'group' && n.collapsed === false && n.members) {
        n.members.forEach(addNode);
      }
    };
    for (const id in this.board!.nodes) {
      const n = this.board!.nodes[id];
      if ((n.group || null) === this.groupId) addNode(id);
    }
    if (!nodes.length && !lanes.length) return;
    const pad = 50;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const bw = maxX - minX;
    const bh = maxY - minY;
    const mw = this.minimapEl.clientWidth;
    const mh = this.minimapEl.clientHeight;
    const scale = Math.min(mw / bw, mh / bh);
    this.minimapScale = scale;
    this.minimapOffsetX = minX;
    this.minimapOffsetY = minY;
    this.minimapSvg.setAttr('viewBox', `0 0 ${mw} ${mh}`);
    lanes.forEach((l) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttr('x', ((l.x - minX) * scale).toString());
      rect.setAttr('y', ((l.y - minY) * scale).toString());
      rect.setAttr('width', (l.w * scale).toString());
      rect.setAttr('height', (l.h * scale).toString());
      rect.addClass('vtasks-mini-lane');
      this.minimapSvg.appendChild(rect);
    });
    nodes.forEach((n) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttr('x', ((n.x - minX) * scale).toString());
      rect.setAttr('y', ((n.y - minY) * scale).toString());
      rect.setAttr('width', (n.w * scale).toString());
      rect.setAttr('height', (n.h * scale).toString());
      rect.addClass('vtasks-mini-node');
      this.minimapSvg.appendChild(rect);
    });
    const isVisible = (nid: string): boolean => {
      const n = this.board!.nodes[nid];
      if (!n) return false;
      if ((n.group || null) === this.groupId) return true;
      if (!n.group) return false;
      const parent = this.board!.nodes[n.group];
      if (parent && parent.collapsed === false) return isVisible(n.group);
      return false;
    };
    this.board!.edges.forEach((edge) => {
      const from = this.board!.nodes[edge.from];
      const to = this.board!.nodes[edge.to];
      if (!isVisible(edge.from) || !isVisible(edge.to)) return;
      const fw = from.width ?? 120;
      const fh = from.height ?? (from.type === 'group' ? 80 : 40);
      const tw = to.width ?? 120;
      const th = to.height ?? (to.type === 'group' ? 80 : 40);
      const x1 = (from.x + fw / 2 - minX) * scale;
      const y1 = (from.y + fh / 2 - minY) * scale;
      const x2 = (to.x + tw / 2 - minX) * scale;
      const y2 = (to.y + th / 2 - minY) * scale;
      const dx = Math.abs(x2 - x1);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttr('d', `M${x1} ${y1} C ${x1 + dx / 2} ${y1}, ${x2 - dx / 2} ${y2}, ${x2} ${y2}`);
      path.addClass('vtasks-mini-edge');
      this.minimapSvg.appendChild(path);
    });
    this.updateMinimapView();
  }

  private zoomAt(factor: number, anchorX: number, anchorY: number) {
    const newZoom = Math.min(Math.max(this.zoom * factor, 0.2), 4);
    const boardX = (anchorX - this.boardOffsetX) / this.zoom;
    const boardY = (anchorY - this.boardOffsetY) / this.zoom;
    this.zoom = newZoom;
    this.boardOffsetX = anchorX - boardX * this.zoom;
    this.boardOffsetY = anchorY - boardY * this.zoom;
    this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
    this.updateHandleScale();
    this.drawEdges();
    this.updateMinimapView();
  }

  private resetZoom() {
    this.zoom = 1;
    this.centerBoard();
  }

  private zoomToFit() {
    if (!this.board) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const id in this.board.nodes) {
      const n = this.board.nodes[id];
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width ?? 120));
      maxY = Math.max(maxY, n.y + (n.height ?? 40));
    }
    for (const lid in this.board.lanes) {
      const l = this.board.lanes[lid];
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
      maxX = Math.max(maxX, l.x + l.width);
      maxY = Math.max(maxY, l.y + l.height);
    }
    if (minX === Infinity) {
      this.resetZoom();
      return;
    }
    const viewW = this.containerEl.clientWidth || window.innerWidth;
    const viewH = this.containerEl.clientHeight || window.innerHeight;
    const boardW = maxX - minX;
    const boardH = maxY - minY;
    const scale = Math.min(viewW / boardW, viewH / boardH);
    this.zoom = Math.min(Math.max(scale, 0.2), 4);
    this.centerBoard();
  }

  private centerBoard() {
    if (!this.board) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const id in this.board.nodes) {
      const n = this.board.nodes[id];
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width ?? 120));
      maxY = Math.max(maxY, n.y + (n.height ?? 40));
    }
    for (const lid in this.board.lanes) {
      const l = this.board.lanes[lid];
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
      maxX = Math.max(maxX, l.x + l.width);
      maxY = Math.max(maxY, l.y + l.height);
    }
    const viewW = this.containerEl.clientWidth || window.innerWidth;
    const viewH = this.containerEl.clientHeight || window.innerHeight;
    if (minX === Infinity) {
      this.boardOffsetX = viewW / 2 - 50000 * this.zoom;
      this.boardOffsetY = viewH / 2 - 50000 * this.zoom;
    } else {
      const boardW = maxX - minX;
      const boardH = maxY - minY;
      this.boardOffsetX =
        (viewW - boardW * this.zoom) / 2 - minX * this.zoom;
      this.boardOffsetY =
        (viewH - boardH * this.zoom) / 2 - minY * this.zoom;
    }
    this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
    this.updateHandleScale();
    this.updateMinimapView();
    this.drawEdges();
  }

  private updateHandleScale() {
    const desired = 10 * this.zoom;
    const min = 8;
    const max = 20;
    let scale = 1;
    if (desired < min) scale = min / desired;
    else if (desired > max) scale = max / desired;
    this.boardEl.style.setProperty('--handle-scale', scale.toString());
  }

  private editTitle(el: HTMLElement) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.board?.title || '';
    input.addClass('vtasks-title-input');
    el.replaceWith(input);
    input.focus();
    input.select();
    const finish = async (save: boolean) => {
      const newTitle = save ? input.value.trim() : this.board?.title || '';
      if (save && this.board && this.boardFile) {
        const slug = newTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const dir = this.boardFile.parent?.path || '';
        const newPath = normalizePath(
          dir ? `${dir}/${slug}.mtask` : `${slug}.mtask`
        );
        if (newPath !== this.boardFile.path) {
          this.skipNextRename = true;
          await this.app.vault.rename(this.boardFile, newPath);
          this.boardFile = this.app.vault.getAbstractFileByPath(newPath) as TFile;
        }
        this.board.title = newTitle;
        await saveBoard(this.app, this.boardFile, this.board);
        this.app.workspace.trigger('layout-change');
      }
      el.textContent = newTitle;
      input.replaceWith(el);
    };
    input.onblur = () => {
      void finish(true);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') void finish(true);
      else if (e.key === 'Escape') void finish(false);
    };
  }

  private updateMinimapView() {
    if (!this.minimapView) return;
    const x = (-this.boardOffsetX / this.zoom - this.minimapOffsetX) * this.minimapScale;
    const y = (-this.boardOffsetY / this.zoom - this.minimapOffsetY) * this.minimapScale;
    const w = (this.containerEl.clientWidth / this.zoom) * this.minimapScale;
    const h = (this.containerEl.clientHeight / this.zoom) * this.minimapScale;
    this.minimapView.style.left = x + 'px';
    this.minimapView.style.top = y + 'px';
    this.minimapView.style.width = w + 'px';
    this.minimapView.style.height = h + 'px';
  }

  private moveBoardFromMinimap(e: PointerEvent) {
    const rect = this.minimapEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const bx = x / this.minimapScale + this.minimapOffsetX;
    const by = y / this.minimapScale + this.minimapOffsetY;
    this.boardOffsetX = this.containerEl.clientWidth / 2 - bx * this.zoom;
    this.boardOffsetY = this.containerEl.clientHeight / 2 - by * this.zoom;
    this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
    this.updateMinimapView();
    this.drawEdges();
  }

  private openExistingTaskModal(pos: { x: number; y: number }) {
    const tasks = Array.from(this.tasks.values());
    class TaskModal extends FuzzySuggestModal<ParsedTask> {
      constructor(private view: BoardView) {
        super(view.app);
      }
      getItems(): ParsedTask[] {
        return tasks;
      }
      getItemText(item: ParsedTask): string {
        return item.text;
      }
      onChooseItem(item: ParsedTask) {
        this.view.controller!
          .addExistingTask(item.blockId, pos.x, pos.y)
          .then(() => this.view.render());
      }
    }
    new TaskModal(this).open();
  }

  private async promptString(
    title: string,
    value: string
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new (class extends Modal {
        input!: TextComponent;
        constructor(app: App) {
          super(app);
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.createEl('h2', { text: title });
          new Setting(contentEl).addText((t) => {
            this.input = t.setValue(value);
            this.input.inputEl.select();
          });
          new Setting(contentEl)
            .addButton((btn) =>
              btn.setButtonText('OK').setCta().onClick(() => {
                const v = this.input.getValue().trim() || value;
                resolve(v);
                this.close();
              })
            )
            .addExtraButton((btn) =>
              btn
                .setIcon('cross')
                .setTooltip('Cancel')
                .onClick(() => {
                  resolve(null);
                  this.close();
                })
            );
        }
        onClose() {
          this.contentEl.empty();
        }
      })(this.app);
      modal.open();
    });
  }

  private getLaneForNode(id: string): string | null {
    const n = this.board!.nodes[id];
    if (!n) return null;
    const w = n.width ?? 120;
    const h = n.height ?? (n.type === 'group' ? 80 : 40);
    const cx = n.x + w / 2;
    const cy = n.y + h / 2;
    for (const lid in this.board!.lanes) {
      const l = this.board!.lanes[lid];
      if (cx >= l.x && cx <= l.x + l.width && cy >= l.y && cy <= l.y + l.height) {
        return lid;
      }
    }
    return null;
  }

  private async reflowLane(laneId: string) {
    const lane = this.board!.lanes[laneId];
    if (!lane) return;
    const nodes = Object.keys(this.board!.nodes)
      .filter((nid) => this.board!.nodes[nid].lane === laneId)
      .sort((a, b) => {
        const an = this.board!.nodes[a];
        const bn = this.board!.nodes[b];
        return lane.orient === 'vertical' ? an.y - bn.y : an.x - bn.x;
      });
    const spacing = this.gridSize * 2;
    if (lane.orient === 'vertical') {
      let y = lane.y + this.laneHeaderSize + spacing;
      for (const id of nodes) {
        const n = this.board!.nodes[id];
        const w = n.width ?? 120;
        const h = n.height ?? (n.type === 'group' ? 80 : 40);
        n.x = lane.x + (lane.width - w) / 2;
        n.y = y;
        await this.controller?.moveNode(id, n.x, n.y);
        y += h + spacing;
      }
    } else {
      let x = lane.x + this.laneHeaderSize + spacing;
      for (const id of nodes) {
        const n = this.board!.nodes[id];
        const w = n.width ?? 120;
        const h = n.height ?? (n.type === 'group' ? 80 : 40);
        n.y = lane.y + (lane.height - h) / 2;
        n.x = x;
        await this.controller?.moveNode(id, n.x, n.y);
        x += w + spacing;
      }
    }
  }

  private snapNodeToLane(id: string, laneId: string) {
    const node = this.board!.nodes[id];
    const lane = this.board!.lanes[laneId];
    if (!node || !lane) return;
    const width = node.width ?? 120;
    const height = node.height ?? (node.type === 'group' ? 80 : 40);
    const spacing = this.gridSize * 2;
    if (lane.orient === 'vertical') {
      let bottom = lane.y + this.laneHeaderSize;
      for (const nid in this.board!.nodes) {
        const n = this.board!.nodes[nid];
        if (n.lane === laneId && nid !== id) {
          const h = n.height ?? (n.type === 'group' ? 80 : 40);
          bottom = Math.max(bottom, n.y + h);
        }
      }
      node.x = lane.x + (lane.width - width) / 2;
      node.y = bottom + spacing;
    } else {
      let right = lane.x + this.laneHeaderSize;
      for (const nid in this.board!.nodes) {
        const n = this.board!.nodes[nid];
        if (n.lane === laneId && nid !== id) {
          const w = n.width ?? 120;
          right = Math.max(right, n.x + w);
        }
      }
      node.y = lane.y + (lane.height - height) / 2;
      node.x = right + spacing;
    }
    const nodeEl = this.boardEl.querySelector(
      `.vtasks-node[data-id="${id}"]`
    ) as HTMLElement | null;
    if (nodeEl) {
      const parentId = node.group;
      const parentX = parentId ? this.board!.nodes[parentId].x : 0;
      const parentY = parentId ? this.board!.nodes[parentId].y : 0;
      nodeEl.style.left = node.x - parentX + 'px';
      nodeEl.style.top = node.y - parentY + 'px';
    }
  }

  private renderSidebar() {
    if (!this.sidebarListEl || !this.board) return;
    this.sidebarListEl.empty();
    const tree = buildTaskTree(this.board);
    const buildList = (nodes: TaskTreeNode[], parent: HTMLElement) => {
      const ul = parent.createEl('ul');
      for (const node of nodes) {
        const li = ul.createEl('li');
        li.setAttr('data-id', node.id);
        const row = li.createDiv({ cls: 'vtasks-sidebar-item' });
        const task = this.tasks.get(node.id);

        if (node.children.length) {
          li.addClass('has-children');
          const toggle = row.createSpan({ cls: 'vtasks-sidebar-toggle' });
          setIcon(toggle, 'chevron-down');
          toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const collapsed = li.classList.toggle('collapsed');
            setIcon(toggle, collapsed ? 'chevron-right' : 'chevron-down');
          });
        } else {
          row.createSpan({ cls: 'vtasks-sidebar-toggle' });
        }

        if (task) {
          const checkbox = row.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
          checkbox.checked = task.checked;
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            this.controller!
              .setCheck(node.id, checkbox.checked)
              .then(() => this.render());
          });
        }
        row.createSpan({ text: this.getNodeLabel(node.id) });
        if (node.children.length) buildList(node.children, li);
      }
    };
    buildList(tree, this.sidebarListEl);
    if (this.sidebarSearchInput)
      this.filterSidebar(this.sidebarSearchInput.value);
  }

  private filterSidebar(query: string) {
    if (!this.sidebarListEl) return;
    const q = query.toLowerCase();
    if (!q) {
      this.sidebarListEl
        .querySelectorAll('li')
        .forEach((li) => ((li as HTMLElement).style.display = ''));
      return;
    }
    const root = this.sidebarListEl.querySelector('ul');
    if (!root) return;
    const filter = (ul: HTMLElement): boolean => {
      let anyVisible = false;
      ul.querySelectorAll(':scope > li').forEach((li) => {
        const childUl = li.querySelector(':scope > ul') as HTMLElement | null;
        const span = li.querySelector(':scope > span');
        const label = span?.textContent?.toLowerCase() ?? '';
        const childVisible = childUl ? filter(childUl) : false;
        const visible = label.includes(q) || childVisible;
        (li as HTMLElement).style.display = visible ? '' : 'none';
        if (visible) anyVisible = true;
      });
      return anyVisible;
    };
    filter(root as HTMLElement);
  }

  private getNodeLabel(id: string): string {
    const n = this.board!.nodes[id];
    return n.title!;
  }

  private centerOnNode(id: string) {
    if (!this.board) return;
    const n = this.board.nodes[id];
    if (!n) return;
    const rect = this.containerEl.getBoundingClientRect();
    const centerX = n.x + (n.width ?? 120) / 2;
    const centerY = n.y + (n.height ?? 40) / 2;
    this.boardOffsetX = rect.width / 2 - centerX * this.zoom;
    this.boardOffsetY = rect.height / 2 - centerY * this.zoom;
    this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
    this.updateHandleScale();
    this.updateMinimapView();
    this.drawEdges();
  }

  private getLaneForPosition(x: number, y: number): string | null {
    for (const lid in this.board!.lanes) {
      const l = this.board!.lanes[lid];
      if (x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height) {
        return lid;
      }
    }
    return null;
  }

  private findAttachmentTarget(id: string): string | null {
    const nodeEl = this.boardEl.querySelector(`.vtasks-node[data-id="${id}"]`) as HTMLElement | null;
    if (!nodeEl) return null;
    const rect = nodeEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const el = document.elementFromPoint(cx, cy);
    const target = el ? (el.closest('.vtasks-node') as HTMLElement | null) : null;
    if (!target) return null;
    const tid = target.getAttribute('data-id');
    if (!tid || tid === id) return null;
    const n = this.board!.nodes[tid];
    if (n && n.type !== 'postit') return tid;
    return null;
  }

  private getBoardCoords(e: MouseEvent | PointerEvent) {
    const rect = this.boardEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.zoom,
      y: (e.clientY - rect.top) / this.zoom,
    };
  }
}
