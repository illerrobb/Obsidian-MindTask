export class WorkspaceLeaf {}

export class App {
  vault: any = {
    on: () => {},
    off: () => {},
    getMarkdownFiles: () => [],
    getAbstractFileByPath: () => null,
    read: async () => '',
    adapter: { basePath: '' },
  };
  workspace: any = {
    trigger: () => {},
  };
}

export class ItemView {
  app: App;
  containerEl: HTMLElement = document.createElement('div');
  constructor(public leaf?: WorkspaceLeaf) {
    this.app = new App();
  }
  registerEvent(): void {}
  registerDomEvent(): void {}
  registerInterval(): void {}
}

export class Menu {
  addItem(cb: (item: MenuItem) => any): this {
    cb(new MenuItem());
    return this;
  }
  addSeparator(): this {
    return this;
  }
  showAtMouseEvent(_e: any): void {}
  showAtPosition(_e: any): void {}
}

export class MenuItem {
  setTitle(_t: string): this { return this; }
  setIcon(_i: string): this { return this; }
  setChecked(_c: boolean): this { return this; }
  setSection(_s: string): this { return this; }
  onClick(_cb: any): this { return this; }
  setSubmenu(cb: (menu: Menu) => any): this { cb(new Menu()); return this; }
}

export class FuzzySuggestModal<T=any> {
  constructor(_app: App) {}
  open(): void {}
  getItems(): T[] { return []; }
  getItemText(_item: T): string { return ''; }
  onChooseItem(_item: T, _evt: any): void {}
}

export class Modal {
  contentEl: HTMLElement = document.createElement('div');
  constructor(public app: App) {}
  open(): void {}
  close(): void {}
  onClose(): void {}
}

export class Setting {
  constructor(public containerEl: HTMLElement) {}
  addText(cb: (t: TextComponent) => any): this {
    cb(new TextComponent());
    return this;
  }
  addButton(cb: (btn: any) => any): this {
    cb({ setButtonText: () => {}, setIcon: () => {}, onClick: () => {} });
    return this;
  }
  addExtraButton(cb: (btn: any) => any): this {
    cb({ setIcon: () => {}, setTooltip: () => {}, onClick: () => {} });
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement = document.createElement('input');
  setValue(v: string): this { this.inputEl.value = v; return this; }
  getValue(): string { return this.inputEl.value; }
}

export class PopoverSuggest<T> {
  constructor(public app: App) {}
  open(): void {}
  close(): void {}
}

export abstract class AbstractInputSuggest<T> extends PopoverSuggest<T> {
  constructor(app: App, public inputEl: HTMLInputElement) {
    super(app);
  }
}

export class TAbstractFile {}
export class TFile extends TAbstractFile {
  path = '';
  basename = '';
  stat: any = { mtime: 0 };
}

export function setIcon(_el?: HTMLElement, _icon?: string): void {}
export function normalizePath(p: string) { return p; }

declare global {
  interface Element {
    createDiv(cls?: string): HTMLElement;
    createSpan(opts?: any): HTMLSpanElement;
    empty(): void;
    setAttr(name: string, value: string): void;
    getAttr(name: string): string | null;
    addClass(cls: string): void;
    removeClass(cls: string): void;
    toggleClass(cls: string, force?: boolean): void;
    setText(text: string): void;
  }
}
