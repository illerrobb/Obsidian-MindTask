# MindTask

**MindTask** is an experimental plugin for Obsidian that lets you visualize and organize Markdown tasks on an interactive board. Every task in your vault can be dragged and connected to keep your workflow always under control.

![Board preview](docs/img/board-overview.png) <!-- TODO: add screenshot/gif -->

## Key Features

* **Board view**: each task becomes a draggable node.
* **Persistent positions and connections**, saved in `*.mtask` files next to your notes.
* **Relationships between tasks** (dependency, subtask, sequence), editable via context menu.
* **Mini-map** for quick navigation.
* **Smooth pan and zoom** with mouse and keyboard shortcuts.
* **Automatic node coloring** based on tags or metadata.
* **Customizations** through a dedicated settings panel.
* **Styled XLSX export** for sharing board data in spreadsheet form.

<!-- TODO: add demo GIFs for each feature -->

## Installation

### From the community plugins (when available)

1. In Obsidian, go to **Settings → Community plugins**.
2. Disable *safe mode* if prompted.
3. Search for **MindTask** in the list and install the plugin.
4. Enable it to start using it.

### Manual installation

1. Clone or download this repository.
2. Run `npm install` and then `npm run build`.
3. Copy `manifest.json`, `main.js`, and `styles.css` from the `dist/` folder into your Obsidian plugins directory.
4. Restart Obsidian and enable **MindTask** from the settings.

![Installation](docs/img/install.gif) <!-- TODO: insert installation gif -->

## Usage

1. Launch the **MindTask: Open board** command from the Command Palette.
2. Drag nodes with your mouse to organize tasks.
3. Right-click on a node or connection to access the context menu.
4. Drop note links or files onto the board to create new nodes. Links without the `.md`
   extension are automatically resolved.

### Navigation

* **Pan**: drag with middle mouse button or `Ctrl` + drag.
* **Zoom**: `Ctrl` + scroll wheel or `+`/`-` keys.
* **Mini-map**: click or drag inside it to move around quickly.

### Task Relationships

Relationships are stored using inline Dataview fields that reference the target task’s ID:

```markdown
[dependsOn:: id]   # current task depends on another
[subtaskOf:: id]   # current task is a subtask of another
[after:: id]       # current task must come after another
```

![Task relationships](docs/img/links.png) <!-- TODO: task links image -->

### Task Descriptions

Tasks can link to a dedicated note to hold a longer description. Add a
`notePath` field to the task, for example:

```markdown
- [ ] My task  [notePath:: path/to/note.md]
```

When a note path is present, MindTask loads the note content and displays it as
the task description. Editing the task saves the description text back to the
linked note, creating the file if needed. The legacy `description` field is no
longer used.

### Merge dei nodi

In accordo con il product owner, l'azione **Merge** serve per unire due nodi
senza perdere il contesto di partenza. Il nodo sorgente viene rimosso dalla
board e le sue informazioni principali (titolo, descrizione, eventuale nota
collegata e stato) vengono riportate dentro al nodo di destinazione. Il
contenuto confluisce nella descrizione del nodo target, separato da una riga di
divisione, e l'elenco `mergedFrom` del nodo traccia gli ID già accorpati. Le
connessioni e gli allegati vengono riassegnati automaticamente al nodo di
destinazione, evitando duplicati o loop. Il risultato viene salvato
immediatamente nel file `.mtask` associato alla board.

## Settings

* **Task identifiers**:

  * `^id` as block anchor (default).
  * `[id:: id]` as an inline field.
* **Board path**: choose where to save the `.mtask` file; missing folders will be created automatically.
* **Colors and labels**: assign colors to tags or metadata to automatically highlight nodes.
* **Styled XLSX export**: toggle to enable exporting the current board to Excel.

![Settings](docs/img/settings.png) <!-- TODO: settings screenshot -->

## Development

To contribute:

```bash
npm install
npm run build
```

Code structure:

* `src/parser.ts` – parses files and ensures unique IDs.
* `src/boardStore.ts` – saves and loads board state.
* `src/controller.ts` – high-level actions like task creation and linking.
* `src/view.ts` – SVG rendering of the board.
* `src/main.ts` – plugin entry point.

![Development workflow](docs/img/dev.gif) <!-- TODO: development gif -->

## Project Status

MindTask is still in an early stage; expect changes and possible bugs. Any contributions or suggestions are welcome.

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
