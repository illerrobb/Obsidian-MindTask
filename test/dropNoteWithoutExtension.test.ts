import { App } from 'obsidian';

const app = new App();
app.vault.adapter = { basePath: '' } as any;
app.vault.getAbstractFileByPath = (p: string) =>
  p === 'Nota.md' ? { path: p, stat: { mtime: 0 }, basename: 'Nota' } : null;

const basePath = '';
const toVaultPath = (raw: unknown): string | null => {
  if (raw == null) return null;
  let p = typeof raw === 'string' ? raw : ((raw as any).path || (raw as any).name || '') + '';
  p = decodeURI(p).replace(/\\/g, '/');
  const obsidian = /^obsidian:\/\/open\?(.*)/.exec(p);
  if (obsidian) {
    const params = new URLSearchParams(obsidian[1]);
    const file = params.get('file');
    if (!file) return null;
    p = decodeURIComponent(file);
    if (p.startsWith('/')) p = p.slice(1);
    return p;
  }
  p = p.replace(/^file:\/\//, '').replace(/^app:\/\/local\//, '');
  if (basePath && p.startsWith(basePath)) {
    p = p.slice(basePath.length);
  } else if (basePath && p.includes(':') && !p.startsWith(basePath)) {
    return null;
  }
  if (p.startsWith('/')) p = p.slice(1);
  return p;
};

const notePaths: string[] = [];
function processPath(raw: unknown) {
  let rel = toVaultPath(raw);
  if (!rel) return;
  let lower = rel.toLowerCase();
  if (!lower.endsWith('.md')) {
    const mdCandidate = `${rel}.md`;
    if (app.vault.getAbstractFileByPath(mdCandidate)) {
      rel = mdCandidate;
      lower = rel.toLowerCase();
    }
  }
  if (lower.endsWith('.md')) {
    notePaths.push(rel);
  }
}

processPath('obsidian://open?vault=Vault&file=Nota');

let createdPath: string | null = null;
const controller = {
  addNoteNode: async (path: string) => {
    createdPath = path;
  },
};

for (const path of notePaths) {
  await controller.addNoteNode(path);
}

if (createdPath !== 'Nota.md') {
  throw new Error('Note link without extension was not resolved correctly');
}

console.log('Drop without extension creates note node');
