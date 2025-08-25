import { buildTaskTree } from '../src/sidebar';
import { BoardData } from '../src/boardStore';

(() => {
  const board: BoardData = {
    version: 1,
    nodes: { a: {}, b: {}, c: {}, d: {} },
    edges: [
      { from: 'a', to: 'b', type: 'subtask' },
      { from: 'c', to: 'b', type: 'subtask' },
      { from: 'b', to: 'd', type: 'subtask' },
    ],
    lanes: {},
  };
  const tree = buildTaskTree(board);
  const expected = [
    { id: 'a', children: [{ id: 'b', children: [{ id: 'd', children: [] }] }] },
    { id: 'c', children: [{ id: 'b', children: [{ id: 'd', children: [] }] }] },
  ];
  if (JSON.stringify(tree) !== JSON.stringify(expected)) {
    console.log('Expected:', JSON.stringify(expected, null, 2));
    console.log('Received:', JSON.stringify(tree, null, 2));
    throw new Error('buildTaskTree did not generate correct child nodes');
  }
  console.log('buildTaskTree generated child nodes correctly');
})();
