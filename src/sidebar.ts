import { BoardData } from './boardStore';

export interface TaskTreeNode {
  id: string;
  children: TaskTreeNode[];
}

export function buildTaskTree(board: BoardData): TaskTreeNode[] {
  const children: Record<string, Set<string>> = {};
  const parents: Record<string, Set<string>> = {};
  const hierarchical = new Set(['subtask', 'depends']);
  for (const edge of board.edges) {
    if (edge.type && !hierarchical.has(edge.type)) continue;
    if (!children[edge.from]) children[edge.from] = new Set();
    children[edge.from].add(edge.to);
    if (!parents[edge.to]) parents[edge.to] = new Set();
    parents[edge.to].add(edge.from);
  }
  const roots = Object.keys(board.nodes).filter((id) => !parents[id]);
  const build = (id: string, ancestors: Set<string> = new Set()): TaskTreeNode => {
    if (ancestors.has(id)) {
      return { id, children: [] };
    }
    const next = new Set(ancestors);
    next.add(id);
    return {
      id,
      children: Array.from(children[id] || []).map((cid) => build(cid, next)),
    };
  };
  return roots.map((r) => build(r));
}
