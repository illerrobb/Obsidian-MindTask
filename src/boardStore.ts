import { App, normalizePath, TFile } from 'obsidian';

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
        JSON.stringify({ version: CURRENT_VERSION, nodes: {}, edges: [] }, null, 2)
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
