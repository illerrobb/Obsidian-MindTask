import { App, normalizePath, TFile } from 'obsidian';

export interface LaneData {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orient: 'vertical' | 'horizontal';
}

export interface NodeData {
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  type?: 'group';
  name?: string;
  members?: string[];
  group?: string;
  lane?: string;
  collapsed?: boolean;
}

export interface BoardData {
  version: number;
  nodes: Record<string, NodeData>;
  edges: { from: string; to: string; type: string }[];
  lanes: Record<string, LaneData>;
}

const CURRENT_VERSION = 1;

export async function loadBoard(app: App, file: TFile): Promise<BoardData> {
  try {
    const text = await app.vault.read(file);
    const data = JSON.parse(text) as BoardData;
    if (!data.lanes) data.lanes = {};
    return data;
  } catch (e) {
    return { version: CURRENT_VERSION, nodes: {}, edges: [], lanes: {} };
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
    const dir = normalized.split('/').slice(0, -1).join('/');
    if (dir) {
      const parts = dir.split('/');
      let cur = '';
      for (const part of parts) {
        cur = cur ? `${cur}/${part}` : part;
        if (!app.vault.getAbstractFileByPath(cur)) {
          await app.vault.createFolder(cur);
        }
      }
    }

    try {
      await app.vault.create(
        normalized,
        JSON.stringify({ version: CURRENT_VERSION, nodes: {}, edges: [], lanes: {} }, null, 2)
      );
    } catch (err: any) {
      if (err?.message?.includes('already exists')) {
        console.warn(`Board file ${normalized} already exists, loading it`);
      } else {
        throw err;
      }
    }
    file = app.vault.getAbstractFileByPath(normalized) as TFile;
  }
  return file;
}
