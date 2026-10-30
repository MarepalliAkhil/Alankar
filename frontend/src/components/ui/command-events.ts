export const OPEN_EVENT = 'open-command-bar';

/** Opens the command bar from anywhere (the top-bar button uses this). */
export function openCommandBar(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
