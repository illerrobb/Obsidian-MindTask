import { App, TFile, normalizePath } from 'obsidian';
import crypto from 'crypto';

export interface ParsedTask {
  file: TFile;
  line: number;
  text: string;
  checked: boolean;
  blockId: string;
  indent: number;
  dependsOn: string[];
  description?: string;
  notePath?: string;
}

/**
 * Scan given markdown files for tasks. Adds an identifier if missing.
 */
export interface ScanOptions {
  tags?: string[];
  folders?: string[];
  useBlockId?: boolean;
}

export async function scanFiles(
  app: App,
  files: TFile[],
  options: ScanOptions = {}
): Promise<ParsedTask[]> {
  const { tags = [], folders = [], useBlockId = true } = options;
  const tasks: ParsedTask[] = [];
  for (const file of files) {
    if (folders.length && !folders.some((f) => file.path.startsWith(f))) {
      continue;
    }
    const content = await app.vault.read(file);
    const lines = content.split(/\r?\n/);
    let modified = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)- \[( |x)\] (.*)/);
      if (!m) continue;
      const indent = m[1].length;
      const checked = m[2] === 'x';
      let text = m[3];
      if (tags.length && !tags.some((t) => text.includes('#' + t))) continue;
      const idMatch = text.match(/\^([\w-]+)$/);
      const dvMatch = text.match(/\[id::\s*([\w-]+)\]/);
      let blockId: string;
      if (idMatch) {
        blockId = idMatch[1];
      } else if (dvMatch) {
        blockId = dvMatch[1];
      } else {
        blockId = 't-' + crypto.randomBytes(4).toString('hex');
        if (useBlockId) {
          lines[i] = lines[i] + `  ^${blockId}`;
        } else {
          lines[i] = lines[i] + `  [id:: ${blockId}]`;
        }
        modified = true;
      }
      const noteMatch =
        text.match(/\[notePath::\s*([^\]]+)\]/) ||
        text.match(/\bnotePath::\s*((?:\[\[[^\]]+\]\]|[^\n])*?)(?=\s+\w+::|\s+#|$)/);

      const notePath = noteMatch ? noteMatch[1].trim() : undefined;
      let description: string | undefined;
      if (notePath) {
        const link = notePath.replace(/^\[\[/, '').replace(/\]\]$/, '');
        const noteFile = app.vault.getAbstractFileByPath(
          normalizePath(link),
        );
        if (noteFile instanceof TFile) {
          description = await app.vault.read(noteFile);
        }
      }

      tasks.push({
        file,
        line: i,
        text,
        checked,
        blockId,
        indent,
        dependsOn: [],
        description,
        notePath,
      });
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
export function parseDependencies(tasks: ParsedTask[]): {
  from: string;
  to: string;
  type: string;
  label?: string;
}[] {
  const edges: {
    from: string;
    to: string;
    type: string;
    label?: string;
  }[] = [];
  const depRegex = /\[dependsOn::\s*([\w-]+)\]/g;
  const subtaskRegex = /\[subtaskOf::\s*([\w-]+)\]/g;
  const seqRegex = /\[after::\s*([\w-]+)\]/g;
  for (const t of tasks) {
    let m: RegExpExecArray | null;
    while ((m = depRegex.exec(t.text)) !== null) {
      edges.push({ from: m[1], to: t.blockId, type: 'depends' });
    }
    while ((m = subtaskRegex.exec(t.text)) !== null) {
      edges.push({ from: m[1], to: t.blockId, type: 'subtask' });
    }
    while ((m = seqRegex.exec(t.text)) !== null) {
      edges.push({ from: m[1], to: t.blockId, type: 'sequence' });
    }
  }
  return edges;
}
