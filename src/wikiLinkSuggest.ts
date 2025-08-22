import { App, TFile, AbstractInputSuggest } from 'obsidian';

export class WikiLinkSuggest extends AbstractInputSuggest<TFile> {
  private start: number = 0;
  private end: number = 0;
  constructor(app: App, private inputEl: HTMLTextAreaElement | HTMLDivElement | HTMLInputElement) {
    super(app, inputEl as any);
  }

  private getText(): string {
    if (this.inputEl instanceof HTMLInputElement || this.inputEl instanceof HTMLTextAreaElement) {
      return this.inputEl.value;
    }
    return this.inputEl.innerText || '';
  }

  private getCursor(): number {
    if (this.inputEl instanceof HTMLInputElement || this.inputEl instanceof HTMLTextAreaElement) {
      return this.inputEl.selectionStart ?? this.getText().length;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return this.getText().length;
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(this.inputEl);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  }

  async getSuggestions(_query: string): Promise<TFile[]> {
    const text = this.getText();
    const cursor = this.getCursor();
    const before = text.slice(0, cursor);
    const match = before.match(/\[\[([^\]]*)$/);
    if (!match) return [];
    const query = match[1];
    this.start = cursor - query.length - 2;
    this.end = cursor;
    const files = this.app.vault.getMarkdownFiles();
    return files.filter((f) =>
      f.path.toLowerCase().includes(query.toLowerCase()),
    );
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path.replace(/\.md$/, ''));
  }

  selectSuggestion(file: TFile): void {
    const link = file.path.replace(/\.md$/, '');
    const text = this.getText();
    const before = text.slice(0, this.start);
    const after = text.slice(this.end);
    const inserted = `[[${link}]]`;
    const newText = before + inserted + after;
    if (this.inputEl instanceof HTMLInputElement || this.inputEl instanceof HTMLTextAreaElement) {
      this.inputEl.value = newText;
      const pos = before.length + inserted.length;
      this.inputEl.setSelectionRange(pos, pos);
      this.inputEl.dispatchEvent(new Event('input'));
    } else {
      this.inputEl.innerText = newText;
      const pos = before.length + inserted.length;
      const range = document.createRange();
      range.setStart(this.inputEl.firstChild || this.inputEl, pos);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      this.inputEl.dispatchEvent(new Event('input'));
    }
    this.close();
  }
}

export default WikiLinkSuggest;
