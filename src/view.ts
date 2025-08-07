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
} from 'obsidian';
import type MindTaskPlugin from './main';
import Controller from './controller';
import { BoardData, saveBoard, loadBoard, getBoardFile } from './boardStore';
import { ParsedTask, scanFiles, parseDependencies } from './parser';

export const VIEW_TYPE_BOARD = 'mind-task';

export class BoardView extends ItemView {
  private boardEl!: HTMLElement;
  private svgEl!: SVGSVGElement;
  private alignVLine!: HTMLElement;
  private alignHLine!: HTMLElement;
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
  private edgeX = 0;
  private edgeY = 0;
  private edgeEls: Map<number, { hit: SVGPathElement; line: SVGPathElement }> =
    new Map();
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
  private pointerDownSelected = false;
  private didDragSelect = false;
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
  private plugin: MindTaskPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: MindTaskPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_BOARD;
  }

  getDisplayText() {
    return 'MindTask Board';
  }

  // @ts-ignore
  async getState() {
    return { file: this.boardFile?.path };
  }

  async setState(state: any) {
    if (!state?.file) return;

    const boardFile = await getBoardFile(this.app, state.file);
    const board = await loadBoard(this.app, boardFile);
    const files = this.app.vault.getMarkdownFiles();
    const parsed = await scanFiles(this.app, files, {
      tags: this.plugin.settings.tagFilters,
      folders: this.plugin.settings.folderPaths,
      useBlockId: this.plugin.settings.useBlockId,
    });
    const tasks = new Map(parsed.map((t) => [t.blockId, t]));
    const controller = new Controller(
      this.app,
      boardFile,
      board,
      tasks,
      this.plugin.settings
    );

    this.updateData(board, tasks, controller, boardFile);
  }

  async onOpen() {
    // If already loaded, do nothing
    if (this.board && this.tasks.size && this.controller && this.boardFile) return;

    // Get the file associated with the view
    const state = this.leaf.getViewState();
    const filePath = (state as any).state?.file || (state as any).file;
    if (!filePath) return;

    // Load the file and board data
    const boardFile = this.app.vault.getAbstractFileByPath(filePath) as TFile;
    if (!boardFile) return;

    const board = await loadBoard(this.app, boardFile);
    const files = this.app.vault.getMarkdownFiles();
    const parsed = await scanFiles(this.app, files, {
      tags: this.plugin.settings.tagFilters,
      folders: this.plugin.settings.folderPaths,
      useBlockId: this.plugin.settings.useBlockId,
    });
    const tasks = new Map(parsed.map((t) => [t.blockId, t]));
    const controller = new Controller(this.app, boardFile, board, tasks, this.plugin.settings);

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

    if (!this.vaultEventsRegistered) {
      const onVaultChange = (file: TAbstractFile) => {
        if (!this.boardFile) return;
        if (file.path === this.boardFile.path) return;
        void this.refreshFromVault();
      };
      this.registerEvent(this.app.vault.on('create', onVaultChange));
      this.registerEvent(this.app.vault.on('modify', onVaultChange));
      this.registerEvent(this.app.vault.on('delete', onVaultChange));
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
      if (!this.tasks.has(id) && n.type !== 'group') delete this.board.nodes[id];
    }

    this.board.edges = this.board.edges.filter(
      (e) =>
        (this.tasks.has(e.from) || this.board!.nodes[e.from]?.type === 'group') &&
        (this.tasks.has(e.to) || this.board!.nodes[e.to]?.type === 'group')
    );

    const existing = this.board.edges.filter((e) =>
      deps.some((d) => d.from === e.from && d.to === e.to && d.type === e.type)
    );

    for (const dep of deps) {
      if (
        this.board.nodes[dep.from] &&
        this.board.nodes[dep.to] &&
        !existing.find(
          (e) => e.from === dep.from && e.to === dep.to && e.type === dep.type
        )
      ) {
        existing.push(dep);
      }
    }

    this.board.edges = existing;

    await saveBoard(this.app, this.boardFile, this.board);

    this.controller = new Controller(
      this.app,
      this.boardFile,
      this.board,
      this.tasks,
      this.plugin.settings
    );

    this.render();
  }

  private render() {
    if (!this.board) return;
    this.containerEl.empty();
    this.containerEl.addClass('vtasks-container');
    const topBar = this.containerEl.createDiv('vtasks-top-bar');
    const left = topBar.createDiv('vtasks-top-left');
    const titleEl = topBar.createDiv('vtasks-board-title');
    titleEl.setText(this.board.title || 'Board');
    titleEl.onclick = () => this.editTitle(titleEl);
    const right = topBar.createDiv('vtasks-top-right');
    const settingsBtn = right.createDiv('vtasks-top-button');
    setIcon(settingsBtn, 'settings');
    settingsBtn.setAttr('title', 'Board settings');
    settingsBtn.onclick = () => {
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById('mind-task');
    };

    this.boardEl = this.containerEl.createDiv('vtasks-board');
    const orient = this.controller?.settings.orientation ?? 'vertical';
    this.boardEl.addClass(
      orient === 'horizontal' ? 'vtasks-horizontal' : 'vtasks-vertical'
    );
    this.boardEl.tabIndex = 0;
    this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
    this.alignVLine = this.boardEl.createDiv('vtasks-align-line vtasks-align-v');
    this.alignHLine = this.boardEl.createDiv('vtasks-align-line vtasks-align-h');
    this.alignVLine.style.display = 'none';
    this.alignHLine.style.display = 'none';
    this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgEl.addClass('vtasks-edges');
    this.boardEl.appendChild(this.svgEl);
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
    this.minimapEl = this.containerEl.createDiv('vtasks-minimap');
    this.minimapSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.minimapEl.appendChild(this.minimapSvg);
    this.minimapView = this.minimapEl.createDiv('vtasks-mini-view');
    this.drawMinimap();
    this.updateMinimapView();

    const toolbar = this.containerEl.createDiv('vtasks-toolbar');
    const zoomSection = toolbar.createDiv('vtasks-toolbar-section');

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
    nodeEl.style.left = pos.x - offsetX + 'px';
    nodeEl.style.top = pos.y - offsetY + 'px';
    if (pos.width) nodeEl.style.width = pos.width + 'px';
    if (pos.height) nodeEl.style.height = pos.height + 'px';
    nodeEl.style.borderColor = pos.color || defaultColor;
    if (pos.color) nodeEl.style.backgroundColor = pos.color;

    const orientH = this.controller?.settings.orientation ?? 'vertical';
    nodeEl.createDiv(
      `vtasks-handle vtasks-handle-in vtasks-handle-${orientH === 'vertical' ? 'top' : 'left'}`
    );

    const textEl = nodeEl.createDiv('vtasks-text');
    const metaEl = nodeEl.createDiv('vtasks-meta');

    if (pos.type === 'board') {
      textEl.setText(pos.name || id);
      metaEl.createSpan({ text: `${pos.taskCount ?? 0} tasks` });
      if (pos.lastModified) {
        metaEl.createSpan({ text: new Date(pos.lastModified).toLocaleDateString() });
      }
      nodeEl.addClass('vtasks-board-card');
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
      nodeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if ((pos as any).boardPath) {
          this.plugin.openBoardFile((pos as any).boardPath);
        }
      });
      return nodeEl;
    }

    const task = this.tasks.get(id);
    let text = task?.text ?? id;
    const metas: { key: string; val: string }[] = [];
    const tags: string[] = [];
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
    textEl.textContent = text.trim();
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
    if (task?.checked) nodeEl.addClass('done');
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
      }
      if (pos.type === 'group') {
        this.openGroup(id);
      } else {
        this.controller?.editTask(id);
      }
    });

    return nodeEl;
  }

  private registerEvents() {
    this.boardEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.boardEl.addClass('drag-over');
    });
    this.boardEl.addEventListener('dragleave', () => {
      this.boardEl.removeClass('drag-over');
    });
    this.boardEl.addEventListener('drop', async (e: DragEvent) => {
      e.preventDefault();
      this.boardEl.removeClass('drag-over');
      const files = e.dataTransfer?.files;
      if (!files) return;
      const pos = this.getBoardCoords(e);
      let offset = 0;
      let added = false;
      for (const file of Array.from(files)) {
        if (file.name.endsWith('.mtask')) {
          const basePath = (this.app.vault.adapter as any).basePath || '';
          let rel = (file as any).path;
          if (rel.startsWith(basePath)) rel = rel.slice(basePath.length + 1);
          const tfile = this.app.vault.getAbstractFileByPath(rel) as TFile;
          if (!tfile) continue;
          let count = 0;
          try {
            const data = JSON.parse(await this.app.vault.read(tfile));
            count = Object.keys(data.nodes || {}).length;
          } catch {}
          const info = {
            name: file.name.replace(/\.mtask$/, ''),
            lastModified: file.lastModified,
            taskCount: count,
            path: rel,
          };
          const id = await this.controller?.addBoardCard(info, pos.x + offset, pos.y + offset);
          if (id) {
            const laneId = this.getLaneForPosition(pos.x + offset, pos.y + offset);
            if (laneId) await this.controller?.assignNodeToLane(id, laneId);
            added = true;
            offset += 20;
          }
        }
      }
      if (added) this.render();
    });

    this.boardEl.onpointerdown = (e) => {
      if ((e as PointerEvent).button === 2) return;
      this.pointerDownSelected = false;
      this.boardEl.focus();
      if (this.editingId) this.finishEditing(true);
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
          x = Math.round((this.resizeStartNodeX + dx) / this.gridSize) * this.gridSize;
          width = right - x;
        } else if (this.resizeDir.includes('e')) {
          width = this.resizeStartWidth + dx;
          width = Math.round(width / this.gridSize) * this.gridSize;
        }

        if (this.resizeDir.includes('n')) {
          y = Math.round((this.resizeStartNodeY + dy) / this.gridSize) * this.gridSize;
          height = bottom - y;
        } else if (this.resizeDir.includes('s')) {
          height = this.resizeStartHeight + dy;
          height = Math.round(height / this.gridSize) * this.gridSize;
        }

        width = Math.max(120, width);
        height = Math.max(20, height);
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
        this.showAlignmentGuides(id, x, y, width, height);
        this.board!.nodes[id] = {
          ...this.board!.nodes[id],
          x,
          y,
          width,
          height,
        };
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
          let x = Math.round((start.x + curX - this.dragStartX) / this.gridSize) * this.gridSize;
          let y = Math.round((start.y + curY - this.dragStartY) / this.gridSize) * this.gridSize;

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
        if (this.draggingId) this.showAlignmentGuides(this.draggingId, mainX, mainY, mainW, mainH);
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
      }
    };

    this.boardEl.onpointerup = (e) => {
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
        this.alignVLine.style.display = 'none';
        this.alignHLine.style.display = 'none';
        this.selectedIds.forEach((id) => {
          const pos = this.board!.nodes[id];
          const oldLane = pos.lane;
          const laneId = this.getLaneForNode(id);
          if (laneId && oldLane !== laneId) {
            this.snapNodeToLane(id, laneId);
          }
          this.controller!.assignNodeToLane(id, laneId ?? null);
          this.controller!.moveNode(id, pos.x, pos.y);
        });
        this.drawEdges();
        this.drawMinimap();
      } else if (this.isBoardDragging) {
        this.isBoardDragging = false;
        this.updateMinimapView();
      } else if (this.edgeStart) {
        const handle = (e.target as HTMLElement).closest('.vtasks-handle-in') as HTMLElement | null;
        const node = handle ? handle.closest('.vtasks-node') as HTMLElement | null : null;
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
        if (
          (e.target as HTMLElement).closest('.vtasks-node') ||
          (e.target as HTMLElement).closest('.vtasks-lane-header')
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
          this.isBoardFocused()
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
            const orient = this.controller?.settings.orientation ?? 'vertical';
            this.controller!
              .createLane('Lane', pos.x, pos.y, 300, 300, orient)
              .then(() => this.render());
          })
        );
        menu.addItem((item) =>
          item.setTitle('Add existing task').onClick(() => this.openExistingTaskModal(pos))
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

  private isBoardFocused(): boolean {
    return document.activeElement === this.boardEl;
  }

  private getDragIds(): Set<string> {
    const ids = new Set<string>();
    const add = (id: string) => {
      if (ids.has(id)) return;
      ids.add(id);
      const n = this.board!.nodes[id];
      if (n && n.type === 'group' && n.members) {
        n.members.forEach((mid: string) => add(mid));
      }
    };
    this.selectedIds.forEach((sid) => add(sid));
    return ids;
  }

  private drawEdges() {
    const toRemove = new Set(this.edgeEls.keys());
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
          this.edgeEls.delete(idx);
        }
        return;
      }
      const boardRect = this.boardEl.getBoundingClientRect();
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      const x1 = (fr.left - boardRect.left + fr.width / 2) / this.zoom;
      const y1 = (fr.top - boardRect.top + fr.height / 2) / this.zoom;
      const x2 = (tr.left - boardRect.left + tr.width / 2) / this.zoom;
      const y2 = (tr.top - boardRect.top + tr.height / 2) / this.zoom;
      const orientD = this.controller?.settings.orientation ?? 'vertical';
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
        current = { hit, line };
        this.edgeEls.set(idx, current);
      }
      current.hit.setAttr('d', d);
      current.hit.setAttr('data-index', String(idx));
      current.line.setAttr('d', d);
      current.line.setAttr('data-index', String(idx));
      current.line.classList.remove(
        'vtasks-edge-depends',
        'vtasks-edge-subtask',
        'vtasks-edge-sequence'
      );
      current.line.classList.add(`vtasks-edge-${edge.type}`);
    });
    toRemove.forEach((idx) => {
      const els = this.edgeEls.get(idx);
      if (!els) return;
      els.hit.remove();
      els.line.remove();
      this.edgeEls.delete(idx);
    });
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

  private showAlignmentGuides(id: string, x: number, y: number, w: number, h: number) {
    const threshold = 5;
    const cx = x + w / 2;
    const cy = y + h / 2;
    let alignX: number | null = null;
    let alignY: number | null = null;
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
      xs.forEach((xx) => {
        if (Math.abs(xx - x) <= threshold) alignX = xx;
        if (Math.abs(xx - (x + w)) <= threshold) alignX = xx;
        if (Math.abs(xx - cx) <= threshold) alignX = xx;
      });
      ys.forEach((yy) => {
        if (Math.abs(yy - y) <= threshold) alignY = yy;
        if (Math.abs(yy - (y + h)) <= threshold) alignY = yy;
        if (Math.abs(yy - cy) <= threshold) alignY = yy;
      });
    }
    if (alignX != null) {
      this.alignVLine.style.left = alignX + 'px';
      this.alignVLine.style.display = '';
    } else {
      this.alignVLine.style.display = 'none';
    }
    if (alignY != null) {
      this.alignHLine.style.top = alignY + 'px';
      this.alignHLine.style.display = '';
    } else {
      this.alignHLine.style.display = 'none';
    }
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
    this.updateMinimapView();
    this.drawEdges();
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
        this.board.title = newTitle;
        await saveBoard(this.app, this.boardFile, this.board);
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

  private getLaneForPosition(x: number, y: number): string | null {
    for (const lid in this.board!.lanes) {
      const l = this.board!.lanes[lid];
      if (x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height) {
        return lid;
      }
    }
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
