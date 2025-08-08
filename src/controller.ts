import { App, normalizePath, TFile, WorkspaceLeaf } from 'obsidian';
import crypto from 'crypto';
import { BoardData, NodeData, LaneData, saveBoard } from './boardStore';
import { ParsedTask } from './parser';
import { PluginSettings } from './settings';
import { openTaskEditModal } from './taskEditModal';

export default class Controller {
  constructor(
    private app: App,
    private boardFile: TFile,
    private board: BoardData,
    private tasks: Map<string, ParsedTask>,
    public settings: PluginSettings
  ) {}

  async moveNode(id: string, x: number, y: number, bypassLaneClamp = false) {
    const node = this.board.nodes[id];
    if (!node) return;
    let nx = x;
    let ny = y;
    const w = node.width ?? 120;
    const h = node.height ?? 40;
    if (node.lane && !bypassLaneClamp) {
      const lane = this.board.lanes[node.lane];
      if (lane) {
        nx = Math.max(lane.x, Math.min(nx, lane.x + lane.width - w));
        ny = Math.max(lane.y, Math.min(ny, lane.y + lane.height - h));
      }
    }
    this.board.nodes[id] = { ...node, x: nx, y: ny } as NodeData;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async resizeNode(
    id: string,
    width: number,
    height: number,
    prevWidth?: number,
    prevHeight?: number
  ) {
    const node = this.board.nodes[id];
    if (!node) return;
    let w = width;
    let h = height;
    if (node.lane) {
      const lane = this.board.lanes[node.lane];
      if (lane) {
        const maxW = lane.width - (node.x - lane.x);
        const maxH = lane.height - (node.y - lane.y);
        w = Math.min(w, maxW);
        h = Math.min(h, maxH);
      }
    }
    this.board.nodes[id] = {
      ...node,
      width: w,
      height: h,
    } as NodeData;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async groupNodes(ids: string[], name = '') {}

  async ungroupNode(id: string) {}

  async toggleGroupCollapse(id: string) {}

  async fitGroupToMembers(id: string, padding = 20) {}

  async createLane(
    label: string,
    x: number,
    y: number,
    width: number,
    height: number,
    orient: 'vertical' | 'horizontal'
  ) {
    const id = 'l-' + crypto.randomBytes(4).toString('hex');
    const lane: LaneData = { id, label, x, y, width, height, orient };
    this.board.lanes[id] = lane;
    await saveBoard(this.app, this.boardFile, this.board);
    return id;
  }

  async moveLane(
    id: string,
    x: number,
    y: number,
    width?: number,
    height?: number
  ) {
    const lane = this.board.lanes[id];
    if (!lane) return;
    const dx = x - lane.x;
    const dy = y - lane.y;
    lane.x = x;
    lane.y = y;
    if (width !== undefined) lane.width = width;
    if (height !== undefined) lane.height = height;
    if (dx || dy) {
      Object.values(this.board.nodes).forEach((n) => {
        if (n.lane === id) {
          n.x += dx;
          n.y += dy;
        }
      });
    }
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async renameLane(id: string, label: string) {
    const lane = this.board.lanes[id];
    if (!lane) return;
    lane.label = label;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async setOrientation(orient: 'vertical' | 'horizontal') {
    this.board.orientation = orient;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async setSnapToGrid(enable: boolean) {
    this.board.snapToGrid = enable;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async setLaneOrientation(
    id: string,
    orient: 'vertical' | 'horizontal'
  ) {
    const lane = this.board.lanes[id];
    if (!lane) return;
    lane.orient = orient;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async deleteLane(id: string) {
    if (!this.board.lanes[id]) return;
    delete this.board.lanes[id];
    Object.values(this.board.nodes).forEach((n) => {
      if (n.lane === id) delete n.lane;
    });
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async assignNodeToLane(id: string, lane: string | null) {
    const node = this.board.nodes[id];
    if (!node) return;
    if (lane) {
      node.lane = lane;
    } else {
      delete node.lane;
    }
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async createTask(
    text: string,
    x: number,
    y: number,
    filePath = this.settings.defaultTaskFile
  ) {
    const path = normalizePath(filePath);
    let file = this.app.vault.getAbstractFileByPath(path) as TFile;
    if (!file) {
      file = await this.app.vault.create(path, '');
    }
    const id = 't-' + crypto.randomBytes(4).toString('hex');
    const idPart = this.settings.useBlockId
      ? `^${id}`
      : `[id:: ${id}]`;
    await this.app.vault.append(file, `- [ ] ${text}  ${idPart}\n`);
    const content = await this.app.vault.read(file);
    const line = content.split(/\r?\n/).length - 1;
    const task: ParsedTask = {
      file,
      line,
      text,
      checked: false,
      blockId: id,
      indent: 0,
      dependsOn: [],
    };
    this.tasks.set(id, task);
    this.board.nodes[id] = { x, y } as NodeData;
    await saveBoard(this.app, this.boardFile, this.board);
    return id;
  }

  async addBoardCard(
    info: { path: string; name: string; lastModified: number; taskCount: number },
    x: number,
    y: number
  ) {
    const id = 'b-' + crypto.randomBytes(4).toString('hex');
    this.board.nodes[id] = {
      x,
      y,
      width: 160,
      height: 80,
      type: 'board',
      boardPath: info.path,
      name: info.name,
      lastModified: info.lastModified,
      taskCount: info.taskCount,
    } as NodeData;
    await saveBoard(this.app, this.boardFile, this.board);
    return id;
  }

  async addExistingTask(id: string, x: number, y: number) {
    if (!this.tasks.has(id)) return;
    this.board.nodes[id] = { x, y } as NodeData;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async openTask(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    await this.app.workspace.openLinkText(
      `${task.file.path}#^${task.blockId}`,
      '',
      true
    );
  }

  async editTask(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (!task) return false;

    const originalText = task.text;
    const originalChecked = task.checked;

    const result = await openTaskEditModal(this.app, task, this.settings);
    if (!result) return false;

    let changed = false;
    if (result.text !== originalText) {
      await this.modifyTaskText(task, () => result.text);
      changed = true;
    }
    if (result.checked !== originalChecked) {
      await this.setCheck(id, result.checked);
      changed = true;
    }
    return changed;
  }

  async toggleCheck(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    await this.setCheck(id, !task.checked);
  }

  async setCheck(id: string, checked: boolean) {
    const task = this.tasks.get(id);
    if (!task) return;
    const lines = (await this.app.vault.read(task.file)).split(/\r?\n/);
    const line = lines[task.line];
    const m = line.match(/^(\s*)- \[( |x)\] (.*)/);
    if (!m) return;
    const indent = m[1];
    const rest = m[3];
    lines[task.line] = `${indent}- [${checked ? 'x' : ' '}] ${rest}`;
    await this.app.vault.modify(task.file, lines.join('\n'));
    task.checked = checked;
  }

  async renameTask(id: string, text: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    await this.modifyTaskText(task, (t) => {
      const metaPart = t.match(/(?:\s+(?:\[[^\]]+\]|#[^\s]+|\^[\w-]+|\w+::\s*(?:\[[^\]]+\]|[^\s]+)))*$/)?.[0] ?? '';
      const tokens = metaPart.trim().match(/(\[[^\]]+\]|#[^\s]+|\^[\w-]+|\w+::\s*(?:\[[^\]]+\]|[^\s]+))/g) ?? [];
      const metaFormatted = tokens.join('  ');
      return text.trim() + (metaFormatted ? `  ${metaFormatted}` : '');
    });
  }

  async deleteTask(id: string) {
    const task = this.tasks.get(id);
    if (task) {
      const lines = (await this.app.vault.read(task.file)).split(/\r?\n/);
      const line = lines[task.line];
      const m = line.match(/^(\s*)- \[( |x)\] (.*)/);
      if (m) {
        if (this.settings.deletePermanently) {
          lines.splice(task.line, 1);
          for (const other of this.tasks.values()) {
            if (other.file === task.file && other.line > task.line) other.line--;
          }
        } else {
          lines[task.line] = `${m[1]}- [-] ${m[3]}`;
        }
        await this.app.vault.modify(task.file, lines.join('\n'));
      }
      this.tasks.delete(id);
    }
    // Remove node and any edges referencing it
    delete this.board.nodes[id];
    this.board.edges = this.board.edges.filter(
      (e) => e.from !== id && e.to !== id
    );
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async setNodeColor(id: string, color: string | null) {
    if (!this.board.nodes[id]) return;
    const data: NodeData = { ...this.board.nodes[id] } as NodeData;
    if (color) {
      data.color = color;
    } else {
      delete (data as any).color;
    }
    this.board.nodes[id] = data;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  private async modifyTaskText(task: ParsedTask, fn: (text: string) => string) {
    const lines = (await this.app.vault.read(task.file)).split(/\r?\n/);
    const line = lines[task.line];
    const m = line.match(/^(\s*)- \[( |x)\] (.*)/);
    if (!m) return;
    const indent = m[1];
    const checked = m[2];
    let text = m[3];
    text = fn(text);
    lines[task.line] = `${indent}- [${checked}] ${text}`;
    await this.app.vault.modify(task.file, lines.join('\n'));
    task.text = text;
  }

  private relationString(type: string, from: ParsedTask, to: ParsedTask) {
    switch (type) {
      case 'depends':
        return `[dependsOn:: ${from.blockId}]`;
      case 'subtask':
        return `[subtaskOf:: ${from.blockId}]`;
      case 'sequence':
        return `[after:: ${from.blockId}]`;
      default:
        return '';
    }
  }

  private async applyRelation(type: string, from: ParsedTask, to: ParsedTask) {
    const rel = this.relationString(type, from, to);
    if (!rel) return;
    const insertRel = (t: string) => {
      if (t.includes(rel)) return t;
      const dv = t.match(/\[id::\s*([\w-]+)\]/);
      if (dv) {
        return t.replace(/\[id::\s*([\w-]+)\]/, `${rel}  [id:: $1]`);
      }
      const match = t.match(/\^([\w-]+)$/);
      if (match) {
        return t.replace(/\^([\w-]+)$/, `${rel}  ^$1`);
      }
      return `${t}  ${rel}`;
    };
    await this.modifyTaskText(to, insertRel);
  }

  private async removeRelation(type: string, from: ParsedTask, to: ParsedTask) {
    const rel = this.relationString(type, from, to);
    if (!rel) return;
    const re = new RegExp(`\\s*${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    await this.modifyTaskText(to, (t) => t.replace(re, ''));
  }

  async createEdge(from: string, to: string, type: string) {
    const fromTask = this.tasks.get(from);
    const toTask = this.tasks.get(to);
    if (!fromTask || !toTask) return;
    await this.applyRelation(type, fromTask, toTask);
    this.board.edges.push({ from, to, type });
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async cycleEdgeType(index: number) {
    const edge = this.board.edges[index];
    if (!edge) return;
    const types = ['depends', 'subtask', 'sequence'];
    const current = types.indexOf(edge.type);
    const next = types[(current + 1) % types.length];
    let fromTask = this.tasks.get(edge.from);
    let toTask = this.tasks.get(edge.to);
    if (!fromTask || !toTask) return;

    await this.removeRelation(edge.type, fromTask, toTask);

    if (edge.type === 'depends' || next === 'depends') {
      [edge.from, edge.to] = [edge.to, edge.from];
      fromTask = this.tasks.get(edge.from)!;
      toTask = this.tasks.get(edge.to)!;
    }

    await this.applyRelation(next, fromTask, toTask);
    edge.type = next;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async setEdgeType(index: number, type: string) {
    const edge = this.board.edges[index];
    if (!edge || edge.type === type) return;
    const fromTask = this.tasks.get(edge.from);
    const toTask = this.tasks.get(edge.to);
    if (!fromTask || !toTask) return;
    await this.removeRelation(edge.type, fromTask, toTask);
    await this.applyRelation(type, fromTask, toTask);
    edge.type = type;
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async deleteEdge(index: number) {
    const edge = this.board.edges[index];
    if (!edge) return;
    const fromTask = this.tasks.get(edge.from);
    const toTask = this.tasks.get(edge.to);
    if (fromTask && toTask) {
      await this.removeRelation(edge.type, fromTask, toTask);
    }
    this.board.edges.splice(index, 1);
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async rearrangeNodes(ids: string[]) {
    const nodes = ids
      .map((id) => ({ id, node: this.board.nodes[id] }))
      .filter((p) => p.node);
    if (!nodes.length) return;

    const orient = this.board.orientation ?? 'vertical';
    const spacingA =
      orient === 'vertical'
        ? this.settings.rearrangeSpacingX
        : this.settings.rearrangeSpacingY;
    const spacingB =
      orient === 'vertical'
        ? this.settings.rearrangeSpacingY
        : this.settings.rearrangeSpacingX;

    const getPosA = (n: any) => (orient === 'vertical' ? n.x : n.y);
    const getPosB = (n: any) => (orient === 'vertical' ? n.y : n.x);
    const setPos = (n: any, a: number, b: number) => {
      if (orient === 'vertical') {
        n.x = a;
        n.y = b;
      } else {
        n.y = a;
        n.x = b;
      }
    };
    const getSizeA = (n: any) =>
      orient === 'vertical' ? n.width ?? 120 : n.height ?? 40;
    const getSizeB = (n: any) =>
      orient === 'vertical' ? n.height ?? 40 : n.width ?? 120;

    const selected = new Set(ids);
    const children: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    ids.forEach((id) => {
      children[id] = [];
      inDegree[id] = 0;
    });
    this.board.edges.forEach((e) => {
      if (selected.has(e.from) && selected.has(e.to)) {
        children[e.from].push(e.to);
        inDegree[e.to]++;
      }
    });

    const startA = Math.min(...nodes.map((p) => getPosA(p.node)));
    const startB = Math.min(...nodes.map((p) => getPosB(p.node)));

    interface Rect {
      a: number;
      b: number;
      sizeA: number;
      sizeB: number;
    }
    const rects: Rect[] = [];
    for (const [id, n] of Object.entries(this.board.nodes)) {
      if (selected.has(id) || !n) continue;
      rects.push({
        a: getPosA(n),
        b: getPosB(n),
        sizeA: getSizeA(n),
        sizeB: getSizeB(n),
      });
    }

    const overlaps = (a: Rect, b: Rect) =>
      !(a.a + a.sizeA <= b.a ||
        b.a + b.sizeA <= a.a ||
        a.b + a.sizeB <= b.b ||
        b.b + b.sizeB <= a.b);

    const visited = new Set<string>();

    const layout = (id: string, a: number, b: number) => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = this.board.nodes[id];
      if (!node) return;
      const sizeA = getSizeA(node);
      const sizeB = getSizeB(node);
      let rect: Rect = { a, b, sizeA, sizeB };
      while (rects.some((r) => overlaps(rect, r))) {
        rect.b += spacingB;
      }
      setPos(node, rect.a, rect.b);
      rects.push(rect);

      const kids = children[id];
      if (!kids.length) return;

      const kidSizes = kids.map((ch) => {
        const n = this.board.nodes[ch];
        return n ? getSizeA(n) : 0;
      });
      const groupSize =
        kidSizes.reduce((s, w) => s + w, 0) +
        (kids.length - 1) * spacingA;
      let childA = rect.a + sizeA / 2 - groupSize / 2;
      const childB = rect.b + sizeB + spacingB;
      kids.forEach((ch, i) => {
        layout(ch, childA, childB);
        childA += kidSizes[i] + spacingA;
      });
    };

    const roots = ids.filter((id) => inDegree[id] === 0);
    let currentA = startA;
    roots.forEach((r) => {
      layout(r, currentA, startB);
      const n = this.board.nodes[r];
      currentA += getSizeA(n) + spacingA;
    });

    ids.forEach((id) => {
      if (!visited.has(id)) {
        layout(id, currentA, startB);
        const n = this.board.nodes[id];
        currentA += getSizeA(n) + spacingA;
      }
    });

    await saveBoard(this.app, this.boardFile, this.board);
  }

  async alignNodes(
    ids: string[],
    type: 'left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter'
  ) {
    const nodes = ids
      .map((id) => ({ id, node: this.board.nodes[id] }))
      .filter((p) => p.node);
    if (!nodes.length) return;
    const widths = nodes.map((p) => p.node.width ?? 120);
    const heights = nodes.map((p) => p.node.height ?? 40);
    switch (type) {
      case 'left': {
        const x = Math.min(...nodes.map((p) => p.node.x));
        nodes.forEach((p) => (p.node.x = x));
        break;
      }
      case 'right': {
        const maxX = Math.max(...nodes.map((p, i) => p.node.x + widths[i]));
        nodes.forEach((p, i) => (p.node.x = maxX - widths[i]));
        break;
      }
      case 'top': {
        const y = Math.min(...nodes.map((p) => p.node.y));
        nodes.forEach((p) => (p.node.y = y));
        break;
      }
      case 'bottom': {
        const maxY = Math.max(...nodes.map((p, i) => p.node.y + heights[i]));
        nodes.forEach((p, i) => (p.node.y = maxY - heights[i]));
        break;
      }
      case 'hcenter': {
        const cx =
          nodes.reduce((s, p, i) => s + p.node.x + widths[i] / 2, 0) /
          nodes.length;
        nodes.forEach((p, i) => (p.node.x = cx - widths[i] / 2));
        break;
      }
      case 'vcenter': {
        const cy =
          nodes.reduce(
            (s, p, i) => s + p.node.y + heights[i] / 2,
            0
          ) / nodes.length;
        nodes.forEach((p, i) => (p.node.y = cy - heights[i] / 2));
        break;
      }
      default:
        return;
    }
    await saveBoard(this.app, this.boardFile, this.board);
  }
}
