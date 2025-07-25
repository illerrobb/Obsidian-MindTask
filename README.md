# Visual Tasks Board

This is an experimental Obsidian plugin that lets you manage markdown tasks on a visual board.

The plugin scans your vault for tasks (`- [ ]` and `- [x]`) and displays them as draggable nodes. Node positions and connections are saved in a `.vtasks.json` file alongside your project notes.

## Development

Install dependencies and build the plugin:

```bash
npm install
npm run build
```

Load `manifest.json`, `main.js`, and `styles.css` from the `dist` folder into Obsidian's plugins directory.

## Structure

- `src/parser.ts` – reads tasks from markdown files and ensures they have block IDs
- `src/boardStore.ts` – saves and loads board state
- `src/controller.ts` – high level actions like creating tasks and edges
- `src/view.ts` – basic SVG board rendering
- `src/main.ts` – plugin entry point

This is an early prototype and not feature complete.
