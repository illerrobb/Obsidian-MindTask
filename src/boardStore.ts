import { App, normalizePath, TFile } from 'obsidian';

export interface NodeData {
  x: number;
  y: number;
  color?: string;
}

export interface BoardData {
  version: number;
  nodes: Record<string, NodeData>;
  edges: { from: string; to: string; type: string }[];
}

const CURRENT_VERSION = 1;

export async function loadBoard(app: App, file: TFile): Promise<BoardData> {
  try {
    const text = await app.vault.read(file);
    return JSON.parse(text);
  } catch (e) {
    return { version: CURRENT_VERSION, nodes: {}, edges: [] };
  }
}

export async function saveBoard(app: App, file: TFile, data: BoardData) {
  data.version = CURRENT_VERSION;
  await app.vault.modify(file, JSON.stringify(data, null, 2));
}

export async function getBoardFile(app: App, path: string): Promise<TFile> {
  const normalized = normalizePath(path);
  let file = app.vault.getAbstractFileByPath(normalized) as TFile;
  if (!file) {
    await app.vault.create(normalized, JSON.stringify({ version: CURRENT_VERSION, nodes: {}, edges: [] }, null, 2));
    file = app.vault.getAbstractFileByPath(normalized) as TFile;
  }
  return file;
}
