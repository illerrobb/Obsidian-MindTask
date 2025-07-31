# MindTask

MindTask is an experimental Obsidian plugin that lets you manage markdown tasks on an interactive board.

All tasks in your vault are parsed and shown as draggable nodes. Positions and connections are stored in `*.vtasks.json` files next to your notes. Nodes can be moved with the mouse, dependencies are drawn as lines and several keyboard shortcuts allow quick editing directly from the board.
Tasks can also be selected with a rectangle and grouped into collapsible boxes.
You can pan the board itself by dragging with the middle mouse button or holding `Ctrl` while left-clicking on empty space. Hold `Ctrl` (or `Cmd` on macOS) and scroll the mouse wheel or press `+`/`-` to zoom the board.
A minimap in the bottom-right shows an overview of all nodes. Click or drag inside the minimap to quickly pan the board.

Edges support different relationship types: dependency, subtask and sequence. Right-click an edge to choose its type or delete the connection from the context menu.

Task relationships are stored using Dataview inline fields referencing the target task's ID:

- `[dependsOn:: id]` – the current task depends on another
- `[subtaskOf:: id]` – the current task is a subtask
- `[after:: id]` – the current task should come after another

## Development

Install dependencies and build the plugin:

```bash
npm install
npm run build
```

Load `manifest.json`, `main.js`, and `styles.css` from the `dist` folder into Obsidian's plugins directory.

## Structure

- `src/parser.ts` – reads tasks from markdown files and ensures they have unique IDs
- `src/boardStore.ts` – saves and loads board state
- `src/controller.ts` – high level actions like creating tasks and edges
- `src/view.ts` – basic SVG board rendering
- `src/main.ts` – plugin entry point

This is an early prototype and not feature complete.

## Settings

MindTask can store task identifiers either as block anchors or as dataview
inline fields. The default **Use block IDs** option appends `^id` at the end of
each task. When disabled, new tasks receive `[id:: id]` instead.

When creating a new board you can choose where the `.vtasks.json` file is saved.
If the selected path includes folders that do not exist, MindTask will create
those folders automatically before writing the board file.

You can configure the colors shown in the context menu from the plugin
settings. Each color can optionally be paired with a label such as `urgent` or
`priority:: lowest`. When a task contains that tag or metadata field, the node
is automatically colored.

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
