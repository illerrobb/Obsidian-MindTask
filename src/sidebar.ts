import { BoardData } from './boardStore';

export interface TaskTreeNode {
  id: string;
  children: TaskTreeNode[];
}

export function buildTaskTree(board: BoardData): TaskTreeNode[] {
  const children: Record<string, string[]> = {};
  const parentCount: Record<string, number> = {};
  for (const edge of board.edges) {
    if (edge.type && edge.type !== 'subtask') continue;
    if (!children[edge.from]) children[edge.from] = [];
    children[edge.from].push(edge.to);
    parentCount[edge.to] = (parentCount[edge.to] || 0) + 1;
  }
  const roots = Object.keys(board.nodes).filter((id) => !parentCount[id]);
  const build = (id: string, ancestors: Set<string> = new Set()): TaskTreeNode => {
    if (ancestors.has(id)) {
      return { id, children: [] };
    }
    const next = new Set(ancestors);
    next.add(id);
    return {
      id,
      children: (children[id] || []).map((cid) => build(cid, next)),
    };
  };
  return roots.map((r) => build(r));
}
