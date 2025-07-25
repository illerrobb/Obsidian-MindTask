import { ItemView, WorkspaceLeaf } from 'obsidian';
import { BoardData } from './boardStore';

export const VIEW_TYPE_BOARD = 'visual-tasks-board';

export class BoardView extends ItemView {
  private board: BoardData;

  constructor(leaf: WorkspaceLeaf, board: BoardData) {
    super(leaf);
    this.board = board;
  }

  getViewType() {
    return VIEW_TYPE_BOARD;
  }

  getDisplayText() {
    return 'Tasks Board';
  }

  async onOpen() {
    this.containerEl.empty();
    const boardEl = this.containerEl.createDiv('vtasks-board');
    for (const id in this.board.nodes) {
      const pos = this.board.nodes[id];
      const nodeEl = boardEl.createDiv('vtasks-node');
      nodeEl.setAttr('data-id', id);
      nodeEl.style.left = pos.x + 'px';
      nodeEl.style.top = pos.y + 'px';
      nodeEl.textContent = id;
    }
  }
}
