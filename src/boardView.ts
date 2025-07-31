import { ItemView, WorkspaceLeaf, TFile } from "obsidian";

export const BOARD_VIEW_TYPE = "mindtask-board-view";

export class BoardView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return BOARD_VIEW_TYPE;
  }

  getDisplayText() {
    // Mostra il nome del file come titolo della tab
    return this.file?.basename ?? "Board";
  }

  async onOpen() {
    const file = this.file as TFile;
    if (!file) return;

    // Carica il contenuto del file board
    const content = await this.app.vault.read(file);

    // Pulisci il container
    this.containerEl.empty();

    // Qui puoi aggiungere la tua UI custom per la board
    const title = this.containerEl.createEl("h2", { text: file.basename });
    const boardDiv = this.containerEl.createDiv();
    boardDiv.setText("Qui va la UI della tua board!");

    // Puoi anche parsare il contenuto JSON e mostrarlo come vuoi
    // const boardData = JSON.parse(content);
    // ...renderizza la board...
  }

  async onClose() {
    // Cleanup se necessario
  }
}