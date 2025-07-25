import { App, TFile } from 'obsidian';
import { BoardData } from './boardStore';
import { ParsedTask } from './parser';

export default class Controller {
  constructor(private app: App, private board: BoardData) {}

  createTask(task: ParsedTask) {
    this.board.nodes[task.blockId] = { x: 0, y: 0 };
  }

  moveNode(id: string, x: number, y: number) {
    if (this.board.nodes[id]) {
      this.board.nodes[id] = { x, y };
    }
  }

  toggleCheck(task: ParsedTask) {
    task.checked = !task.checked;
  }

  createEdge(from: string, to: string, type: string) {
    this.board.edges.push({ from, to, type });
  }
}
