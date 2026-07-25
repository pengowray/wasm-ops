/**
 * The instruction detail panel.
 *
 * This replaces the old Tippy tooltips, which vanished the moment the pointer
 * moved, so their text could never be selected or copied. Clicking a cell docks
 * the description to the side of the window (or the bottom, on a narrow
 * screen) and leaves it there until it is dismissed.
 *
 * The content is cloned out of the static `#details` block already in the page,
 * so there is nothing to fetch and the same markup serves readers without
 * JavaScript.
 */

export class Panel {
  readonly #panel: HTMLElement;
  readonly #body: HTMLElement;
  readonly #details: HTMLElement;
  #currentKey: string | null = null;
  #onClose: (() => void) | null = null;

  constructor(panel: HTMLElement, details: HTMLElement) {
    this.#panel = panel;
    this.#details = details;
    this.#body = panel.querySelector('.panel-body')!;

    panel.querySelector('.panel-close')?.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.#panel.hidden) this.close();
    });
  }

  get openKey(): string | null {
    return this.#currentKey;
  }

  onClose(handler: () => void): void {
    this.#onClose = handler;
  }

  open(key: string): void {
    const source = this.#details.querySelector(`#detail-${CSS.escape(key)}`);
    if (!source) return;

    this.#body.replaceChildren(source.cloneNode(true));
    this.#panel.hidden = false;
    this.#currentKey = key;
    this.#panel.scrollTop = 0;
  }

  close(): void {
    this.#panel.hidden = true;
    this.#body.replaceChildren();
    this.#currentKey = null;
    this.#onClose?.();
  }
}
