import { App, normalizePath, TFile } from 'obsidian';
import crypto from 'crypto';
import { BoardData, saveBoard } from './boardStore';
import { ParsedTask } from './parser';

export default class Controller {
  constructor(
    private app: App,
    private boardFile: TFile,
    private board: BoardData,
    private tasks: Map<string, ParsedTask>
  ) {}

  async moveNode(id: string, x: number, y: number) {
    if (!this.board.nodes[id]) return;
    this.board.nodes[id] = { x, y };
    await saveBoard(this.app, this.boardFile, this.board);
  }

  async createTask(text: string, x: number, y: number, filePath = 'Tasks.md') {
    const path = normalizePath(filePath);
    let file = this.app.vault.getAbstractFileByPath(path) as TFile;
    if (!file) {
      file = await this.app.vault.create(path, '');
    }
    const id = 't-' + crypto.randomBytes(4).toString('hex');
    await this.app.vault.append(file, `- [ ] ${text} ^${id}\n`);
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
    this.board.nodes[id] = { x, y };
    await saveBoard(this.app, this.boardFile, this.board);
    return id;
  }

  async toggleCheck(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    const lines = (await this.app.vault.read(task.file)).split(/\r?\n/);
    const line = lines[task.line];
    const m = line.match(/^(\s*)- \[( |x)\] (.*)/);
    if (!m) return;
    const indent = m[1];
    const checked = m[2] === 'x';
    const rest = m[3];
    lines[task.line] = `${indent}- [${checked ? ' ' : 'x'}] ${rest}`;
    await this.app.vault.modify(task.file, lines.join('\n'));
    task.checked = !checked;
  }

  async createEdge(from: string, to: string, type: string) {
    this.board.edges.push({ from, to, type });
    await saveBoard(this.app, this.boardFile, this.board);
  }
}
