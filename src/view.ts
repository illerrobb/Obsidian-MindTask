import { ItemView, WorkspaceLeaf, Menu } from 'obsidian';
import Controller from './controller';
import { BoardData } from './boardStore';
import { ParsedTask } from './parser';

export const VIEW_TYPE_BOARD = 'mind-task';

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
  private resizingId: string | null = null;
  private resizeDir = '';
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartNodeX = 0;
  private resizeStartNodeY = 0;
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
    return 'MindTask Board';
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
    for (const id in this.board.nodes) {
      const n = this.board.nodes[id];
      if ((n.group || null) === this.groupId) {
        this.createNodeElement(id);
      }
    }
    this.drawEdges();
    this.minimapEl = this.containerEl.createDiv('vtasks-minimap');
    this.minimapSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.minimapEl.appendChild(this.minimapSvg);
    this.minimapView = this.minimapEl.createDiv('vtasks-mini-view');
    this.drawMinimap();
    this.updateMinimapView();
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
        this.resizeStartNodeX = this.board.nodes[id].x;
        this.resizeStartNodeY = this.board.nodes[id].y;
        const rect = node.getBoundingClientRect();
        this.resizeStartWidth = rect.width / this.zoom;
        this.resizeStartHeight = rect.height / this.zoom;
        this.resizeStartX = (e as PointerEvent).clientX;
        this.resizeStartY = (e as PointerEvent).clientY;
        this.board.nodes[id] = {
          ...this.board.nodes[id],
          width: rect.width / this.zoom,
          height: rect.height / this.zoom,
        };
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
        const id = node.getAttribute('data-id')!;
        this.selectNode(node, id, (e as PointerEvent).shiftKey || (e as PointerEvent).metaKey);
        this.draggingId = id;
        const coords = this.getBoardCoords(e as PointerEvent);
        this.dragStartX = coords.x;
        this.dragStartY = coords.y;
        this.dragStartPositions.clear();
        this.selectedIds.forEach((sid) => {
          const npos = this.board.nodes[sid];
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
        this.selectionRect = this.boardEl.createDiv('vtasks-selection');
        this.selectionRect.style.left = this.selStartX + 'px';
        this.selectionRect.style.top = this.selStartY + 'px';
      }
    };

    this.boardEl.onpointermove = (e) => {
      if (this.resizingId) {
        const id = this.resizingId;
        const nodeEl = this.boardEl.querySelector(`.vtasks-node[data-id="${id}"]`) as HTMLElement;
        const dx = ((e as PointerEvent).clientX - this.resizeStartX) / this.zoom;
        const dy = ((e as PointerEvent).clientY - this.resizeStartY) / this.zoom;
        let width = this.resizeStartWidth;
        let height = this.resizeStartHeight;
        let x = this.resizeStartNodeX;
        let y = this.resizeStartNodeY;
        if (this.resizeDir.includes('e')) width = this.resizeStartWidth + dx;
        if (this.resizeDir.includes('s')) height = this.resizeStartHeight + dy;
        if (this.resizeDir.includes('w')) {
          width = this.resizeStartWidth - dx;
          x = this.resizeStartNodeX + dx;
        }
        if (this.resizeDir.includes('n')) {
          height = this.resizeStartHeight - dy;
          y = this.resizeStartNodeY + dy;
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
        this.drawMinimap();
      } else if (this.draggingId) {
        const coords = this.getBoardCoords(e as PointerEvent);
        const curX = coords.x;
        const curY = coords.y;
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
      this.drawMinimap();
      } else if (this.isBoardDragging) {
        this.boardOffsetX = (e as PointerEvent).clientX - this.boardStartX;
        this.boardOffsetY = (e as PointerEvent).clientY - this.boardStartY;
        this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
        this.updateMinimapView();
      } else if (this.edgeStart && this.tempEdge) {
        const coords = this.getBoardCoords(e as PointerEvent);
        const x2 = coords.x;
        const y2 = coords.y;
        const dx = Math.abs(x2 - this.edgeX);
        this.tempEdge.setAttr('d', `M${this.edgeX} ${this.edgeY} C ${this.edgeX + dx / 2} ${this.edgeY}, ${x2 - dx / 2} ${y2}, ${x2} ${y2}`);
      } else if (this.selectionRect) {
        const coords = this.getBoardCoords(e as PointerEvent);
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
      }
    };

    this.boardEl.onpointerup = (e) => {
      if (this.resizingId) {
        const id = this.resizingId;
        this.resizingId = null;
        const pos = this.board.nodes[id];
        this.controller.moveNode(id, pos.x, pos.y);
        this.controller.resizeNode(id, pos.width ?? 0, pos.height ?? 0);
        this.drawMinimap();
      } else if (this.draggingId) {
        this.draggingId = null;
        this.alignVLine.style.display = 'none';
        this.alignHLine.style.display = 'none';
        this.selectedIds.forEach((id) => {
          const pos = this.board.nodes[id];
          this.controller.moveNode(id, pos.x, pos.y);
        });
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

    this.boardEl.onpointerleave = () => {
      if (this.isBoardDragging) {
        this.isBoardDragging = false;
        this.updateMinimapView();
      }
    };

    this.boardEl.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.deltaY < 0) {
            this.zoom *= 1.1;
          } else {
            this.zoom /= 1.1;
          }
          this.zoom = Math.min(Math.max(this.zoom, 0.2), 4);
          this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
          this.drawEdges();
          this.updateMinimapView();
        }
      },
      { passive: false }
    );

    this.boardEl.ondblclick = (e) => {
      if ((e.target as HTMLElement).closest('.vtasks-node')) return;
      const pos = this.getBoardCoords(e as MouseEvent);
      this.controller.createTask('New Task', pos.x, pos.y).then(() => this.render());
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
      if (e.key === '+' || e.key === '=') {
        this.zoom = Math.min(this.zoom * 1.1, 4);
        this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
        this.drawEdges();
        this.updateMinimapView();
        return;
      }
      if (e.key === '-') {
        this.zoom = Math.max(this.zoom / 1.1, 0.2);
        this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
        this.drawEdges();
        this.updateMinimapView();
        return;
      }
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

  private clearSelection() {
    this.selectedIds.forEach((sid) => {
      const el = this.boardEl.querySelector(`.vtasks-node[data-id="${sid}"]`) as HTMLElement | null;
      if (el) el.classList.remove('selected');
    });
    this.selectedIds.clear();
  }

  private drawEdges() {
    const toRemove = new Set(this.edgeEls.keys());
    this.board.edges.forEach((edge, idx) => {
      const fromNode = this.board.nodes[edge.from];
      const toNode = this.board.nodes[edge.to];
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
      const dx = Math.abs(x2 - x1);
      const d = `M${x1} ${y1} C ${x1 + dx / 2} ${y1}, ${x2 - dx / 2} ${y2}, ${x2} ${y2}`;
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

  private openGroup(id: string | null) {
    this.groupId = id;
    this.clearSelection();
    this.render();
  }

  private drawMinimap() {
    if (!this.minimapSvg) return;
    this.minimapSvg.empty();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const nodes: { x: number; y: number; w: number; h: number }[] = [];
    for (const id in this.board.nodes) {
      const n = this.board.nodes[id];
      if ((n.group || null) !== this.groupId) continue;
      const w = n.width ?? 120;
      const h = n.height ?? (n.type === 'group' ? 80 : 40);
      nodes.push({ x: n.x, y: n.y, w, h });
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    }
    if (!nodes.length) return;
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
    nodes.forEach((n) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttr('x', ((n.x - minX) * scale).toString());
      rect.setAttr('y', ((n.y - minY) * scale).toString());
      rect.setAttr('width', (n.w * scale).toString());
      rect.setAttr('height', (n.h * scale).toString());
      rect.addClass('vtasks-mini-node');
      this.minimapSvg.appendChild(rect);
    });
    this.board.edges.forEach((edge) => {
      const from = this.board.nodes[edge.from];
      const to = this.board.nodes[edge.to];
      if ((from.group || null) !== this.groupId || (to.group || null) !== this.groupId) return;
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

  private updateMinimapView() {
    if (!this.minimapView) return;
    const x = (-this.boardOffsetX / this.zoom - this.minimapOffsetX) * this.minimapScale;
    const y = (-this.boardOffsetY / this.zoom - this.minimapOffsetY) * this.minimapScale;
    const w = (this.boardEl.offsetWidth / this.zoom) * this.minimapScale;
    const h = (this.boardEl.offsetHeight / this.zoom) * this.minimapScale;
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
    this.boardOffsetX = this.boardEl.offsetWidth / 2 - bx * this.zoom;
    this.boardOffsetY = this.boardEl.offsetHeight / 2 - by * this.zoom;
    this.boardEl.style.transform = `translate(${this.boardOffsetX}px, ${this.boardOffsetY}px) scale(${this.zoom})`;
    this.updateMinimapView();
    this.drawEdges();
  }

  private getBoardCoords(e: MouseEvent | PointerEvent) {
    const rect = this.boardEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.zoom,
      y: (e.clientY - rect.top) / this.zoom,
    };
  }
}
