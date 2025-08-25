import { buildTaskTree } from '../src/sidebar';
import { BoardData } from '../src/boardStore';

(() => {
  const board: BoardData = {
    version: 1,
    nodes: { a: {}, b: {}, c: {}, d: {}, e: {} },
    edges: [
      { from: 'a', to: 'b', type: 'subtask' },
      { from: 'a', to: 'b', type: 'depends' },
      { from: 'c', to: 'b', type: 'depends' },
      { from: 'b', to: 'd', type: 'depends' },
      { from: 'b', to: 'e', type: 'sequence' },
    ],
    lanes: {},
  };
  const tree = buildTaskTree(board);
  const expected = [
    { id: 'a', children: [{ id: 'b', children: [{ id: 'd', children: [] }] }] },
    { id: 'c', children: [{ id: 'b', children: [{ id: 'd', children: [] }] }] },
    { id: 'e', children: [] },
  ];
  if (JSON.stringify(tree) !== JSON.stringify(expected)) {
    console.log('Expected:', JSON.stringify(expected, null, 2));
    console.log('Received:', JSON.stringify(tree, null, 2));
    throw new Error('buildTaskTree did not generate correct child nodes');
  }
  console.log('buildTaskTree handles depends edges and deduplicates correctly');
})();

(() => {
  const board: BoardData = {
    version: 1,
    nodes: { a: {}, b: {}, c: {} },
    edges: [
      { from: 'a', to: 'b', type: 'sequence' },
      { from: 'b', to: 'c', type: 'depends' },
    ],
    lanes: {},
  };
  const tree = buildTaskTree(board);
  const expected = [
    { id: 'a', children: [] },
    { id: 'b', children: [{ id: 'c', children: [] }] },
  ];
  if (JSON.stringify(tree) !== JSON.stringify(expected)) {
    console.log('Expected:', JSON.stringify(expected, null, 2));
    console.log('Received:', JSON.stringify(tree, null, 2));
    throw new Error('buildTaskTree did not ignore non-hierarchical edges');
  }
  console.log('buildTaskTree ignores non-hierarchical edges');
})();
