import { BoardView } from '../src/view';

let loadedPath: string | null = null;

const ctx: any = {
  boardFile: { path: 'Board.mtask' },
  loadViewData: async (path: string) => {
    loadedPath = path;
  },
};

const state = (BoardView.prototype as any).getState.call(ctx);

if (state instanceof Promise) {
  throw new Error('getState should return state synchronously');
}

if (state.file !== 'Board.mtask') {
  throw new Error('getState did not return the board file path');
}

ctx.boardFile = null;
await (BoardView.prototype as any).setState.call(ctx, state);

if (loadedPath !== 'Board.mtask') {
  throw new Error('setState did not load the correct board file');
}

console.log('State round-trip loads board file');
