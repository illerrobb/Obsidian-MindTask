import { App, TFile } from 'obsidian';
import crypto from 'crypto';

export interface ParsedTask {
  file: TFile;
  line: number;
  text: string;
  checked: boolean;
  blockId: string;
  indent: number;
  dependsOn: string[];
}

/**
 * Scan given markdown files for tasks. Adds a block ID if missing.
 */
export async function scanFiles(app: App, files: TFile[]): Promise<ParsedTask[]> {
  const tasks: ParsedTask[] = [];
  for (const file of files) {
    const content = await app.vault.read(file);
    const lines = content.split(/\r?\n/);
    let modified = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)- \[( |x)\] (.*)/);
      if (!m) continue;
      const indent = m[1].length;
      const checked = m[2] === 'x';
      let text = m[3];
      const idMatch = text.match(/\^([\w-]+)$/);
      let blockId: string;
      if (idMatch) {
        blockId = idMatch[1];
      } else {
        blockId = 't-' + crypto.randomBytes(4).toString('hex');
        lines[i] = lines[i] + ` ^${blockId}`;
        modified = true;
      }
      tasks.push({ file, line: i, text, checked, blockId, indent, dependsOn: [] });
    }
    if (modified) {
      await app.vault.modify(file, lines.join('\n'));
    }
  }
  return tasks;
}

/**
 * Parse dependencies from task text using `dependsOn::` syntax.
 */
export function parseDependencies(tasks: ParsedTask[]): { from: string; to: string; type: string }[] {
  const edges: { from: string; to: string; type: string }[] = [];
  const depRegex = /dependsOn::\s*\[\[(.+?)#\^(\w+)\]\]/g;
  for (const t of tasks) {
    let m: RegExpExecArray | null;
    while ((m = depRegex.exec(t.text)) !== null) {
      edges.push({ from: t.blockId, to: m[2], type: 'depends' });
    }
  }
  return edges;
}
