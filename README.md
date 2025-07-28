# Visual Tasks Board

This experimental Obsidian plugin lets you manage markdown tasks on an interactive board.

All tasks in your vault are parsed and shown as draggable nodes. Positions and connections are stored in `*.vtasks.json` files next to your notes. Nodes can be moved with the mouse, dependencies are drawn as lines and several keyboard shortcuts allow quick editing directly from the board.
Tasks can also be selected with a rectangle and grouped into collapsible boxes.
You can pan the board itself by dragging with the middle mouse button or holding `Ctrl` while left-clicking on empty space. Hold `Ctrl` (or `Cmd` on macOS) and scroll the mouse wheel or press `+`/`-` to zoom the board.
A minimap in the bottom-right shows an overview of all nodes. Click or drag inside the minimap to quickly pan the board.

Edges support different relationship types: dependency, subtask and sequence. Click an edge to cycle through these types and the line style will update accordingly.

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
