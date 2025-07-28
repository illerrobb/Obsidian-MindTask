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
  private selectionRect: HTMLElement | null = null;
  private selStartX = 0;
  private selStartY = 0;
  private resizingId: string | null = null;
  private resizeDir = '';
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private groupId: string | null = null;
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

    if (this.groupId) {
      const backBtn = controls.createEl('button', { text: 'Back' });
      backBtn.onclick = () => this.openGroup(this.board.nodes[this.groupId!].group || null);
    }

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
      const n = this.board.nodes[id];
      if ((n.group || null) === this.groupId) {
        this.createNodeElement(id);
      }
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
    if (pos.width) nodeEl.style.width = pos.width + 'px';
    if (pos.height) nodeEl.style.height = pos.height + 'px';
    if (pos.color) nodeEl.style.borderColor = pos.color;

    const inHandle = nodeEl.createDiv('vtasks-handle vtasks-handle-in');
    const textEl = nodeEl.createDiv('vtasks-text');
    const metaEl = nodeEl.createDiv('vtasks-meta');
    if (pos.type === 'group') {
      nodeEl.addClass('vtasks-group');
      textEl.textContent = pos.name || 'Group';
      const count = pos.members?.length || 0;
      const preview = nodeEl.createDiv('vtasks-group-preview');
      for (let i = 0; i < Math.min(4, count); i++) {
        preview.createDiv('vtasks-group-box');
      }
      const num = nodeEl.createDiv('vtasks-group-count');
      num.textContent = String(count);
    } else {
      const task = this.tasks.get(id);
      let text = task?.text ?? id;
      const metas: { key: string; val: string }[] = [];
      const tags: string[] = [];
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
      const tagsEl = metaEl.createDiv('vtasks-tags');
      tags.forEach((t) => tagsEl.createSpan({ text: t, cls: 'vtasks-tag' }));
      if (task?.checked) nodeEl.addClass('done');
    }
    const outHandle = nodeEl.createDiv('vtasks-handle vtasks-handle-out');

    const dirs = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
    dirs.forEach((d) => nodeEl.createDiv(`vtasks-resize vtasks-resize-${d}`));

    new ResizeObserver(() => {
      this.drawEdges();
      this.updateOverflow(nodeEl);
    }).observe(nodeEl);

    this.updateOverflow(nodeEl);

    nodeEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (pos.type === 'group') {
        this.openGroup(id);
      } else {
        this.controller.openTask(id);
      }
    });
  }

  private registerEvents() {
    this.boardEl.onpointerdown = (e) => {
      const resizeEl = (e.target as HTMLElement).closest('.vtasks-resize') as HTMLElement | null;
      const outHandle = (e.target as HTMLElement).closest('.vtasks-handle-out') as HTMLElement | null;
      const inHandle = (e.target as HTMLElement).closest('.vtasks-handle-in') as HTMLElement | null;
      const node = (e.target as HTMLElement).closest('.vtasks-node') as HTMLElement | null;
      if (resizeEl && node) {
        const id = node.getAttribute('data-id')!;
        this.resizingId = id;
        const cls = Array.from(resizeEl.classList).find((c) => c.startsWith('vtasks-resize-'))!;
        this.resizeDir = cls.replace('vtasks-resize-', '');
        const rect = node.getBoundingClientRect();
        this.resizeStartWidth = rect.width;
        this.resizeStartHeight = rect.height;
        this.resizeStartX = (e as PointerEvent).clientX;
        this.resizeStartY = (e as PointerEvent).clientY;
        this.board.nodes[id] = { ...this.board.nodes[id], width: rect.width, height: rect.height };
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
        this.edgeX = r.left - boardRect.left + r.width / 2;
        this.edgeY = r.top - boardRect.top + r.height / 2;
        path.setAttr('d', `M${this.edgeX} ${this.edgeY} C ${this.edgeX} ${this.edgeY} ${this.edgeX} ${this.edgeY} ${this.edgeX} ${this.edgeY}`);
        this.svgEl.appendChild(path);
      } else if (node && !inHandle) {
        const id = node.getAttribute('data-id')!;
        this.selectNode(node, id, (e as PointerEvent).shiftKey || (e as PointerEvent).metaKey);
        this.draggingId = id;
        const boardRect = this.boardEl.getBoundingClientRect();
        this.dragStartX = (e as PointerEvent).clientX - boardRect.left;
        this.dragStartY = (e as PointerEvent).clientY - boardRect.top;
        this.dragStartPositions.clear();
        this.selectedIds.forEach((sid) => {
          const npos = this.board.nodes[sid];
          this.dragStartPositions.set(sid, { x: npos.x, y: npos.y });
        });
      } else {
        const boardRect = this.boardEl.getBoundingClientRect();
        this.selStartX = (e as PointerEvent).clientX - boardRect.left;
        this.selStartY = (e as PointerEvent).clientY - boardRect.top;
        this.selectionRect = this.boardEl.createDiv('vtasks-selection');
        this.selectionRect.style.left = this.selStartX + 'px';
        this.selectionRect.style.top = this.selStartY + 'px';
      }
    };

    this.boardEl.onpointermove = (e) => {
      if (this.resizingId) {
        const id = this.resizingId;
        const nodeEl = this.boardEl.querySelector(`.vtasks-node[data-id="${id}"]`) as HTMLElement;
        const dx = (e as PointerEvent).clientX - this.resizeStartX;
        const dy = (e as PointerEvent).clientY - this.resizeStartY;
        let width = this.resizeStartWidth;
        let height = this.resizeStartHeight;
        let x = this.board.nodes[id].x;
        let y = this.board.nodes[id].y;
        if (this.resizeDir.includes('e')) width = this.resizeStartWidth + dx;
        if (this.resizeDir.includes('s')) height = this.resizeStartHeight + dy;
        if (this.resizeDir.includes('w')) {
          width = this.resizeStartWidth - dx;
          x = this.board.nodes[id].x + dx;
        }
        if (this.resizeDir.includes('n')) {
          height = this.resizeStartHeight - dy;
          y = this.board.nodes[id].y + dy;
        }
        width = Math.max(120, width);
        height = Math.max(20, height);
        nodeEl.style.width = width + 'px';
        nodeEl.style.height = height + 'px';
        nodeEl.style.left = x + 'px';
        nodeEl.style.top = y + 'px';
        this.board.nodes[id] = { ...this.board.nodes[id], x, y, width, height };
        this.updateOverflow(nodeEl);
        this.drawEdges();
      } else if (this.draggingId) {
        const boardRect = this.boardEl.getBoundingClientRect();
        const curX = (e as PointerEvent).clientX - boardRect.left;
        const curY = (e as PointerEvent).clientY - boardRect.top;
        const dx = Math.round((curX - this.dragStartX) / this.gridSize) * this.gridSize;
        const dy = Math.round((curY - this.dragStartY) / this.gridSize) * this.gridSize;

        this.selectedIds.forEach((id) => {
          const start = this.dragStartPositions.get(id);
          if (!start) return;
          let x = start.x + dx;
          let y = start.y + dy;

          const nodeEl = this.boardEl.querySelector(`.vtasks-node[data-id="${id}"]`) as HTMLElement;
          nodeEl.style.left = x + 'px';
          nodeEl.style.top = y + 'px';
          this.board.nodes[id] = { ...this.board.nodes[id], x, y };
        });
        this.drawEdges();
      } else if (this.edgeStart && this.tempEdge) {
        const boardRect = this.boardEl.getBoundingClientRect();
        const x2 = (e as PointerEvent).clientX - boardRect.left;
        const y2 = (e as PointerEvent).clientY - boardRect.top;
        const dx = Math.abs(x2 - this.edgeX);
        this.tempEdge.setAttr('d', `M${this.edgeX} ${this.edgeY} C ${this.edgeX + dx / 2} ${this.edgeY}, ${x2 - dx / 2} ${y2}, ${x2} ${y2}`);
      } else if (this.selectionRect) {
        const boardRect = this.boardEl.getBoundingClientRect();
        const x = (e as PointerEvent).clientX - boardRect.left;
        const y = (e as PointerEvent).clientY - boardRect.top;
        const left = Math.min(this.selStartX, x);
        const top = Math.min(this.selStartY, y);
        const width = Math.abs(x - this.selStartX);
        const height = Math.abs(y - this.selStartY);
        this.selectionRect.style.left = left + 'px';
        this.selectionRect.style.top = top + 'px';
        this.selectionRect.style.width = width + 'px';
        this.selectionRect.style.height = height + 'px';
      }
    };

    this.boardEl.onpointerup = (e) => {
      if (this.resizingId) {
        const id = this.resizingId;
        this.resizingId = null;
        const pos = this.board.nodes[id];
        this.controller.moveNode(id, pos.x, pos.y);
        this.controller.resizeNode(id, pos.width ?? 0, pos.height ?? 0);
      } else if (this.draggingId) {
        this.draggingId = null;
        this.alignVLine.style.display = 'none';
        this.alignHLine.style.display = 'none';
        this.selectedIds.forEach((id) => {
          const pos = this.board.nodes[id];
          this.controller.moveNode(id, pos.x, pos.y);
        });
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
        this.boardEl.classList.remove('show-handles');
        if (this.tempEdge) {
          this.tempEdge.remove();
          this.tempEdge = null;
        }
        this.drawEdges();
      } else if (this.selectionRect) {
        const rect = this.selectionRect.getBoundingClientRect();
        const additive = (e as MouseEvent).shiftKey || (e as MouseEvent).metaKey;
        if (!additive) this.clearSelection();
        this.boardEl.querySelectorAll('.vtasks-node').forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.left >= rect.left && r.right <= rect.right && r.top >= rect.top && r.bottom <= rect.bottom) {
            const id = n.getAttribute('data-id')!;
            this.selectNode(n as HTMLElement, id, additive);
          }
        });
        this.selectionRect.remove();
        this.selectionRect = null;
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
        this.selectNode(target, id, (e as MouseEvent).shiftKey || (e as MouseEvent).metaKey);
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
      const selected = Array.from(this.selectedIds);
      if (selected.length > 1) {
        menu.addItem((item) =>
          item.setTitle('Group selected').onClick(async () => {
            const name = await new Promise<string>((resolve) => {
              const n = prompt('Group name', 'Group') || 'Group';
              resolve(n);
            });
            this.controller.groupNodes(selected, name).then(() => this.render());
          })
        );
      }
      if (this.board.nodes[id].type === 'group') {
        menu.addItem((item) =>
          item.setTitle('Ungroup').onClick(() => this.controller.ungroupNode(id).then(() => this.render()))
        );
      }
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
      const first = Array.from(this.selectedIds)[0];
      if (!first) return;
      if (e.key === ' ') {
        e.preventDefault();
        this.controller.toggleCheck(first).then(() => this.render());
      }
    });

    this.svgEl.addEventListener('click', (e) => {
      const edgeEl = (e.target as HTMLElement).closest('path.vtasks-edge') as SVGPathElement | null;
      if (edgeEl && edgeEl.getAttr('data-index')) {
        const idx = parseInt(edgeEl.getAttr('data-index')!);
        this.controller.cycleEdgeType(idx).then(() => this.render());
      }
    });

    this.svgEl.addEventListener('contextmenu', (e) => {
      const edgeEl = (e.target as HTMLElement).closest('path.vtasks-edge') as SVGPathElement | null;
      if (!edgeEl || !edgeEl.getAttr('data-index')) return;
      e.preventDefault();
      const idx = parseInt(edgeEl.getAttr('data-index')!);
      const edge = this.board.edges[idx];
      if (!edge) return;
      const menu = new Menu();
      const types = ['depends', 'subtask', 'sequence'];
      types.forEach((t) => {
        const title = edge.type === t ? `✔ ${t}` : t;
        menu.addItem((item) =>
          item.setTitle(title).onClick(() => {
            this.controller.setEdgeType(idx, t).then(() => this.render());
          })
        );
      });
      menu.addItem((item) =>
        item.setTitle('Delete connection').onClick(() => {
          this.controller.deleteEdge(idx).then(() => this.render());
        })
      );
      menu.showAtMouseEvent(e as MouseEvent);
    });
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

  private clearSelection() {
    this.selectedIds.forEach((sid) => {
      const el = this.boardEl.querySelector(`.vtasks-node[data-id="${sid}"]`) as HTMLElement | null;
      if (el) el.classList.remove('selected');
    });
    this.selectedIds.clear();
  }

  private drawEdges() {
    this.svgEl.empty();
    this.board.edges.forEach((edge, idx) => {
      const fromNode = this.board.nodes[edge.from];
      const toNode = this.board.nodes[edge.to];
      if ((fromNode.group || null) !== this.groupId || (toNode.group || null) !== this.groupId) return;
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
      const dx = Math.abs(x2 - x1);
      const d = `M${x1} ${y1} C ${x1 + dx / 2} ${y1}, ${x2 - dx / 2} ${y2}, ${x2} ${y2}`;

      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttr('d', d);
      hit.classList.add('vtasks-edge');
      hit.setAttr('data-index', String(idx));
      this.svgEl.appendChild(hit);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttr('d', d);
      line.classList.add('vtasks-edge-line', `vtasks-edge-${edge.type}`);
      line.setAttr('data-index', String(idx));
      this.svgEl.appendChild(line);
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

  private openGroup(id: string | null) {
    this.groupId = id;
    this.clearSelection();
    this.render();
  }
}
