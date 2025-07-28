import { ItemView, WorkspaceLeaf, Menu } from 'obsidian';
import Controller from './controller';
import { BoardData } from './boardStore';
import { ParsedTask } from './parser';

export const VIEW_TYPE_BOARD = 'visual-tasks-board';

export class BoardView extends ItemView {
  private boardEl!: HTMLElement;
  private svgEl!: SVGSVGElement;
  private alignVLine!: HTMLElement;
  private alignHLine!: HTMLElement;
  private readonly gridSize = 20;
  private selectedId: string | null = null;
  private draggingId: string | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private edgeStart: string | null = null;
  private tempEdge: SVGPathElement | null = null;
  private edgeX = 0;
  private edgeY = 0;
  private filters: { tags: string[]; folders: string[] };
  private onFilterChange: (tags: string[], folders: string[]) => void;

  constructor(
    leaf: WorkspaceLeaf,
    private controller: Controller,
    private board: BoardData,
    private tasks: Map<string, ParsedTask>,
    filters: { tags: string[]; folders: string[] },
    onFilterChange: (tags: string[], folders: string[]) => void
  ) {
    super(leaf);
    this.filters = filters;
    this.onFilterChange = onFilterChange;
  }

  getViewType() {
    return VIEW_TYPE_BOARD;
  }

  getDisplayText() {
    return 'Tasks Board';
  }

  async onOpen() {
    this.render();
  }

  updateData(
    board: BoardData,
    tasks: Map<string, ParsedTask>,
    filters: { tags: string[]; folders: string[] }
  ) {
    this.board = board;
    this.tasks = tasks;
    this.filters = filters;
    this.render();
  }

  private render() {
    this.containerEl.empty();
    const controls = this.containerEl.createDiv('vtasks-filter-bar');
    const tagInput = controls.createEl('input', {
      type: 'text',
      placeholder: 'tags'
    });
    tagInput.value = this.filters.tags.join(', ');
    tagInput.onchange = () => {
      this.filters.tags = tagInput.value
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter((t) => t.length > 0);
      this.onFilterChange(this.filters.tags, this.filters.folders);
    };

    const folderInput = controls.createEl('input', {
      type: 'text',
      placeholder: 'folders'
    });
    folderInput.value = this.filters.folders.join(', ');
    folderInput.onchange = () => {
      this.filters.folders = folderInput.value
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
      this.onFilterChange(this.filters.tags, this.filters.folders);
    };

    this.boardEl = this.containerEl.createDiv('vtasks-board');
    this.boardEl.tabIndex = 0;
    this.alignVLine = this.boardEl.createDiv('vtasks-align-line vtasks-align-v');
    this.alignHLine = this.boardEl.createDiv('vtasks-align-line vtasks-align-h');
    this.alignVLine.style.display = 'none';
    this.alignHLine.style.display = 'none';
    this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgEl.addClass('vtasks-edges');
    this.boardEl.appendChild(this.svgEl);
    this.svgEl.style.position = 'absolute';
    this.svgEl.style.width = '100%';
    this.svgEl.style.height = '100%';
    for (const id in this.board.nodes) {
      this.createNodeElement(id);
    }
    this.drawEdges();
    this.registerEvents();
  }

  private createNodeElement(id: string) {
    const pos = this.board.nodes[id];
    const nodeEl = this.boardEl.createDiv('vtasks-node');
    nodeEl.setAttr('data-id', id);
    nodeEl.style.left = pos.x + 'px';
    nodeEl.style.top = pos.y + 'px';
    if (pos.color) nodeEl.style.borderColor = pos.color;

    const inHandle = nodeEl.createDiv('vtasks-handle vtasks-handle-in');
    const textEl = nodeEl.createDiv('vtasks-text');
    textEl.textContent = this.tasks.get(id)?.text ?? id;
    const outHandle = nodeEl.createDiv('vtasks-handle vtasks-handle-out');

    new ResizeObserver(() => this.drawEdges()).observe(nodeEl);

    nodeEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.controller.openTask(id);
    });
  }

  private registerEvents() {
    this.boardEl.onpointerdown = (e) => {
      const outHandle = (e.target as HTMLElement).closest('.vtasks-handle-out') as HTMLElement | null;
      const inHandle = (e.target as HTMLElement).closest('.vtasks-handle-in') as HTMLElement | null;
      const node = (e.target as HTMLElement).closest('.vtasks-node') as HTMLElement | null;
      if (outHandle && node) {
        const id = node.getAttribute('data-id')!;
        this.edgeStart = id;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.addClass('vtasks-edge');
        this.tempEdge = path;
        const boardRect = this.boardEl.getBoundingClientRect();
        const r = outHandle.getBoundingClientRect();
        this.edgeX = r.left - boardRect.left + r.width / 2;
        this.edgeY = r.top - boardRect.top + r.height / 2;
        path.setAttr('d', `M${this.edgeX} ${this.edgeY} C ${this.edgeX} ${this.edgeY} ${this.edgeX} ${this.edgeY} ${this.edgeX} ${this.edgeY}`);
        this.svgEl.appendChild(path);
      } else if (node && !inHandle) {
        const id = node.getAttribute('data-id')!;
        this.selectNode(node, id);
        this.draggingId = id;
        const rect = node.getBoundingClientRect();
        this.dragOffsetX = (e as PointerEvent).clientX - rect.left;
        this.dragOffsetY = (e as PointerEvent).clientY - rect.top;
      }
    };

    this.boardEl.onpointermove = (e) => {
      if (this.draggingId) {
        const id = this.draggingId;
        const nodeEl = this.boardEl.querySelector(`.vtasks-node[data-id="${id}"]`) as HTMLElement;
        const boardRect = this.boardEl.getBoundingClientRect();
        let x = (e as PointerEvent).clientX - boardRect.left - this.dragOffsetX;
        let y = (e as PointerEvent).clientY - boardRect.top - this.dragOffsetY;

        x = Math.round(x / this.gridSize) * this.gridSize;
        y = Math.round(y / this.gridSize) * this.gridSize;

        let alignX: number | null = null;
        let alignY: number | null = null;
        const tolerance = this.gridSize / 2;
        for (const oid in this.board.nodes) {
          if (oid === id) continue;
          const n = this.board.nodes[oid];
          if (Math.abs(n.x - x) <= tolerance) alignX = n.x;
          if (Math.abs(n.y - y) <= tolerance) alignY = n.y;
        }
        const centerX = Math.round(boardRect.width / 2 / this.gridSize) * this.gridSize;
        const centerY = Math.round(boardRect.height / 2 / this.gridSize) * this.gridSize;
        if (Math.abs(centerX - x) <= tolerance) alignX = centerX;
        if (Math.abs(centerY - y) <= tolerance) alignY = centerY;

        if (alignX !== null) {
          x = alignX;
          this.alignVLine.style.left = alignX + 'px';
          this.alignVLine.style.display = 'block';
        } else {
          this.alignVLine.style.display = 'none';
        }
        if (alignY !== null) {
          y = alignY;
          this.alignHLine.style.top = alignY + 'px';
          this.alignHLine.style.display = 'block';
        } else {
          this.alignHLine.style.display = 'none';
        }

        nodeEl.style.left = x + 'px';
        nodeEl.style.top = y + 'px';
        this.board.nodes[id] = { ...this.board.nodes[id], x, y };
        this.drawEdges();
      } else if (this.edgeStart && this.tempEdge) {
        const boardRect = this.boardEl.getBoundingClientRect();
        const x2 = (e as PointerEvent).clientX - boardRect.left;
        const y2 = (e as PointerEvent).clientY - boardRect.top;
        const dx = Math.abs(x2 - this.edgeX);
        this.tempEdge.setAttr('d', `M${this.edgeX} ${this.edgeY} C ${this.edgeX + dx / 2} ${this.edgeY}, ${x2 - dx / 2} ${y2}, ${x2} ${y2}`);
      }
    };

    this.boardEl.onpointerup = (e) => {
      if (this.draggingId) {
        const id = this.draggingId;
        this.draggingId = null;
        this.alignVLine.style.display = 'none';
        this.alignHLine.style.display = 'none';
        const pos = this.board.nodes[id];
        this.controller.moveNode(id, pos.x, pos.y);
      } else if (this.edgeStart) {
        const handle = (e.target as HTMLElement).closest('.vtasks-handle-in') as HTMLElement | null;
        const node = handle ? handle.closest('.vtasks-node') as HTMLElement | null : null;
        if (node) {
          const toId = node.getAttribute('data-id')!;
          if (toId !== this.edgeStart) {
            this.controller.createEdge(this.edgeStart, toId, 'depends').then(() => this.render());
          }
        }
        this.edgeStart = null;
        if (this.tempEdge) {
          this.tempEdge.remove();
          this.tempEdge = null;
        }
        this.drawEdges();
      }
    };

    this.boardEl.ondblclick = (e) => {
      if ((e.target as HTMLElement).closest('.vtasks-node')) return;
      this.controller.createTask('New Task', (e as MouseEvent).offsetX, (e as MouseEvent).offsetY).then(() => this.render());
    };

    this.boardEl.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.vtasks-node') as HTMLElement | null;
      if (target) {
        const id = target.getAttribute('data-id')!;
        this.selectNode(target, id);
      } else {
        this.clearSelection();
      }
    });

    this.boardEl.addEventListener('contextmenu', (e) => {
      const target = (e.target as HTMLElement).closest('.vtasks-node') as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      const id = target.getAttribute('data-id')!;
      const menu = new Menu();
      const colors = ['red', 'green', 'blue', 'yellow', ''];
      colors.forEach((c) => {
        const title = c ? `Outline ${c}` : 'Default outline';
        menu.addItem((item) =>
          item.setTitle(title).onClick(() => {
            target.style.borderColor = c ? c : '';
            this.controller.setNodeColor(id, c || null).then(() => this.render());
          })
        );
      });
      const checked = this.tasks.get(id)?.checked ?? false;
      menu.addItem((item) =>
        item
          .setTitle(checked ? 'Mark not done' : 'Mark done')
          .onClick(() => this.controller.setCheck(id, !checked).then(() => this.render()))
      );
      menu.showAtMouseEvent(e as MouseEvent);
    });

    this.boardEl.addEventListener('keydown', (e) => {
      if (!this.selectedId) return;
      if (e.key === ' ') {
        e.preventDefault();
        this.controller.toggleCheck(this.selectedId).then(() => this.render());
      }
    });

    this.svgEl.addEventListener('click', (e) => {
      const edgeEl = (e.target as HTMLElement).closest('path.vtasks-edge') as SVGPathElement | null;
      if (edgeEl && edgeEl.getAttr('data-index')) {
        const idx = parseInt(edgeEl.getAttr('data-index')!);
        this.controller.cycleEdgeType(idx).then(() => this.render());
      }
    });
  }

  private selectNode(el: HTMLElement, id: string) {
    this.clearSelection();
    this.selectedId = id;
    el.classList.add('selected');
    this.boardEl.focus();
  }

  private clearSelection() {
    if (this.selectedId) {
      const el = this.boardEl.querySelector(`.vtasks-node[data-id="${this.selectedId}"]`) as HTMLElement | null;
      if (el) el.classList.remove('selected');
    }
    this.selectedId = null;
  }

  private drawEdges() {
    this.svgEl.empty();
    this.board.edges.forEach((edge, idx) => {
      const fromEl = this.boardEl.querySelector(`.vtasks-node[data-id="${edge.from}"] .vtasks-handle-out`) as HTMLElement | null;
      const toEl = this.boardEl.querySelector(`.vtasks-node[data-id="${edge.to}"] .vtasks-handle-in`) as HTMLElement | null;
      if (!fromEl || !toEl) return;
      const boardRect = this.boardEl.getBoundingClientRect();
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      const x1 = fr.left - boardRect.left + fr.width / 2;
      const y1 = fr.top - boardRect.top + fr.height / 2;
      const x2 = tr.left - boardRect.left + tr.width / 2;
      const y2 = tr.top - boardRect.top + tr.height / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const dx = Math.abs(x2 - x1);
      path.setAttr('d', `M${x1} ${y1} C ${x1 + dx / 2} ${y1}, ${x2 - dx / 2} ${y2}, ${x2} ${y2}`);
      path.classList.add('vtasks-edge', `vtasks-edge-${edge.type}`);
      path.setAttr('data-index', String(idx));
      this.svgEl.appendChild(path);
    });
  }
}
