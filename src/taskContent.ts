export interface ParsedContent {
  title: string;
  metas: Map<string, string>;
  tags: string[];
  deps: { dependsOn: string[]; subtaskOf: string[]; after: string[] };
}

export function parseTaskContent(text: string): ParsedContent {
  const metas = new Map<string, string>();
  const tags: string[] = [];
  const deps = {
    dependsOn: [] as string[],
    subtaskOf: [] as string[],
    after: [] as string[],
  };
  let title = text;

  title = title.replace(/\[dependsOn::\s*([^\]]+)\]/g, (_m, v) => {
    deps.dependsOn.push(v.trim());
    return '';
  });
  title = title.replace(/\[subtaskOf::\s*([^\]]+)\]/g, (_m, v) => {
    deps.subtaskOf.push(v.trim());
    return '';
  });
  title = title.replace(/\[after::\s*([^\]]+)\]/g, (_m, v) => {
    deps.after.push(v.trim());
    return '';
  });

  title = title.replace(/\[(\w+)::\s*([^\]]+)\]/g, (_m, key, val) => {
    const k = key.toLowerCase();
    if (k === 'id') return '';
    metas.set(key, val.trim());
    return '';
  });
  title = title.replace(
    /\b(\w+)::\s*((?:\[\[[^\]]+\]\]|[^\n])*?)(?=\s+\w+::|\s+#|$)/g,
    (_m, key, val) => {
      const k = key.toLowerCase();
      if (k === 'id') return '';
      metas.set(key, val.trim());
      return '';
    },
  );
  title = title.replace(/#(\S+)/g, (_m, t) => {
    tags.push('#' + t);
    return '';
  });
  const idMatch = title.trim().match(/\^[\w-]+$/);
  if (idMatch) {
    title = title.replace(/\^[\w-]+$/, '');
  }
  return { title: title.trim(), metas, tags, deps };
}
