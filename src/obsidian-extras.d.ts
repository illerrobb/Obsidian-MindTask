import 'obsidian';

declare module 'obsidian' {
  interface App {
    /**
     * Access to the internal command manager.
     */
    commands: any;
  }
}
