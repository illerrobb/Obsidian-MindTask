import { ItemView, WorkspaceLeaf } from 'obsidian';
import Controller from './controller';
import { BoardData } from './boardStore';
import { ParsedTask } from './parser';

export const VIEW_TYPE_BOARD = 'visual-tasks-board';

export class BoardView extends ItemView {
  private boardEl!: HTMLElement;
  private svgEl!: SVGSVGElement;
  private selectedId: string | null = null;
  private draggingId: string | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private edgeStart: string | null = null;
  private tempEdge: SVGPathElement | null = null;
  private edgeX = 0;
  private edgeY = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private controller: Controller,
    private board: BoardData,
    private tasks: Map<string, ParsedTask>
  ) {
    super(leaf);
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

  private render() {
    this.containerEl.empty();
    this.boardEl = this.containerEl.createDiv('vtasks-board');
    this.boardEl.tabIndex = 0;
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
        const x = (e as PointerEvent).clientX - boardRect.left - this.dragOffsetX;
        const y = (e as PointerEvent).clientY - boardRect.top - this.dragOffsetY;
        nodeEl.style.left = x + 'px';
        nodeEl.style.top = y + 'px';
        this.board.nodes[id] = { x, y };
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
