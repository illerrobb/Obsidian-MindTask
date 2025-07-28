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
  private tempEdge: SVGLineElement | null = null;

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
    nodeEl.textContent = this.tasks.get(id)?.text ?? id;
    new ResizeObserver(() => this.drawEdges()).observe(nodeEl);
  }

  private registerEvents() {
    this.boardEl.onpointerdown = (e) => {
      const target = (e.target as HTMLElement).closest('.vtasks-node') as HTMLElement | null;
      if (target) {
        const id = target.getAttribute('data-id')!;
        this.selectNode(target, id);
        if ((e as PointerEvent).shiftKey) {
          this.edgeStart = id;
          const edge = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          edge.addClass('vtasks-edge');
          this.tempEdge = edge;
          const rect = target.getBoundingClientRect();
          const boardRect = this.boardEl.getBoundingClientRect();
          const x = rect.left - boardRect.left + rect.width / 2;
          const y = rect.top - boardRect.top + rect.height / 2;
          edge.setAttr('x1', String(x));
          edge.setAttr('y1', String(y));
          edge.setAttr('x2', String(x));
          edge.setAttr('y2', String(y));
          this.svgEl.appendChild(edge);
        } else {
          this.draggingId = id;
          const rect = target.getBoundingClientRect();
          this.dragOffsetX = (e as PointerEvent).clientX - rect.left;
          this.dragOffsetY = (e as PointerEvent).clientY - rect.top;
        }
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
        this.tempEdge.setAttr('x2', String((e as PointerEvent).clientX - boardRect.left));
        this.tempEdge.setAttr('y2', String((e as PointerEvent).clientY - boardRect.top));
      }
    };

    this.boardEl.onpointerup = (e) => {
      if (this.draggingId) {
        const id = this.draggingId;
        this.draggingId = null;
        const pos = this.board.nodes[id];
        this.controller.moveNode(id, pos.x, pos.y);
      } else if (this.edgeStart) {
        const target = (e.target as HTMLElement).closest('.vtasks-node') as HTMLElement | null;
        if (target) {
          const toId = target.getAttribute('data-id')!;
          if (toId !== this.edgeStart) {
            this.controller.createEdge(this.edgeStart, toId, 'relates');
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
    for (const edge of this.board.edges) {
      const fromEl = this.boardEl.querySelector(`.vtasks-node[data-id="${edge.from}"]`) as HTMLElement | null;
      const toEl = this.boardEl.querySelector(`.vtasks-node[data-id="${edge.to}"]`) as HTMLElement | null;
      if (!fromEl || !toEl) continue;
      const boardRect = this.boardEl.getBoundingClientRect();
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(fr.left - boardRect.left + fr.width / 2));
      line.setAttribute('y1', String(fr.top - boardRect.top + fr.height / 2));
      line.setAttribute('x2', String(tr.left - boardRect.left + tr.width / 2));
      line.setAttribute('y2', String(tr.top - boardRect.top + tr.height / 2));
      line.classList.add('vtasks-edge');
      this.svgEl.appendChild(line);
    }
  }
}
