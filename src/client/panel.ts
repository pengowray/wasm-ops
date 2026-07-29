/**
 * The instruction detail panel.
 *
 * This replaces the old Tippy tooltips, which vanished the moment the pointer
 * moved, so their text could never be selected or copied. Clicking a cell docks
 * the description to the side of the window (or the bottom, on a narrow
 * screen) and leaves it there until it is dismissed.
 *
 * The panel is assembled from two sources: the written description, cloned out
 * of the static `#details` block already in the page, and the encoding
 * breakdown, which is derived here from the opcode's prefix and code rather
 * than being repeated in the markup 630 times.
 */

import type { Opcode } from '../model/types.ts';
import { renderEncoding, renderHeading } from '../render/items.ts';

export class Panel {
  readonly #panel: HTMLElement;
  readonly #body: HTMLElement;
  readonly #details: HTMLElement;
  readonly #opcodes: Map<string, Opcode>;
  #currentKey: string | null = null;
  #onClose: (() => void) | null = null;

  constructor(panel: HTMLElement, details: HTMLElement, opcodes: Map<string, Opcode>) {
    this.#panel = panel;
    this.#details = details;
    this.#opcodes = opcodes;
    this.#body = panel.querySelector('.panel-body')!;

    panel.querySelector('.panel-close')?.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.#panel.dataset['open'] === 'true') this.close();
    });

    this.#wireFlick();
  }

  /**
   * Flick the sheet away.
   *
   * On a phone the details come up as a sheet over the bottom of the screen,
   * and the only way out was a small × in its top corner — the far end of the
   * thing you are holding, reached with the hand that is not free. Every other
   * sheet on a phone is dismissed by pushing it back down, so this one is too.
   *
   * The drag only begins when the sheet is scrolled to its top, so a downward
   * swipe part-way through a long description scrolls it as it always did; and
   * only downwards, so pulling up to read more is never mistaken for a
   * dismissal.
   */
  #wireFlick(): void {
    const sheet = window.matchMedia('(max-width: 900px)');
    let startY = 0;
    let startAt = 0;
    let dragging = false;

    const offset = (y: number): void => {
      this.#panel.style.transform = y ? `translateY(${y}px)` : '';
    };

    this.#panel.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || !sheet.matches) return;
      if (this.#panel.scrollTop > 0) return;
      startY = event.clientY;
      startAt = event.timeStamp;
      dragging = true;
      this.#panel.classList.add('panel-dragging');
    });

    this.#panel.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const dy = event.clientY - startY;
      // Upwards is the reader scrolling, and the sheet is already at its top,
      // so there is nothing to do but let go of the gesture.
      if (dy < 0) {
        dragging = false;
        this.#panel.classList.remove('panel-dragging');
        offset(0);
        return;
      }
      offset(dy);
    });

    const release = (event: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      this.#panel.classList.remove('panel-dragging');
      const dy = event.clientY - startY;
      const speed = dy / Math.max(1, event.timeStamp - startAt);
      offset(0);
      // Far enough, or fast enough. A flick is short and quick; a deliberate
      // push is long and slow. Either is a dismissal.
      if (dy > 110 || (dy > 30 && speed > 0.5)) this.close();
    };

    this.#panel.addEventListener('pointerup', release);
    this.#panel.addEventListener('pointercancel', release);
  }

  get openKey(): string | null {
    return this.#currentKey;
  }

  onClose(handler: () => void): void {
    this.#onClose = handler;
  }

  open(key: string): void {
    const op = this.#opcodes.get(key);
    if (!op) return;

    // Instructions with something written about them have an article to clone.
    // Unassigned slots do not, and get a heading so that clicking one still
    // answers the question it implies: what is this byte, and is it free?
    // getElementById rather than a selector: ids like `0xFD.256` would need
    // escaping to survive being parsed as a selector, and there is no reason
    // to make them.
    const described = document.getElementById(key);
    let content: Element;
    if (described) {
      content = described.cloneNode(true) as Element;
    } else {
      content = document.createElement('div');
      content.innerHTML = renderHeading(op);
    }

    const encoding = document.createElement('div');
    encoding.className = 'detail-encoding';
    encoding.innerHTML = renderEncoding(op);

    // The summary belongs to the name — it says what the instruction does, and
    // reads as one unit with it. The bytes come after that pair, not between
    // them.
    const anchor =
      content.querySelector('.detail-summary') ?? content.querySelector('.detail-name');
    if (anchor) anchor.after(encoding);
    else content.prepend(encoding);

    this.#body.replaceChildren(content);
    this.#panel.dataset['open'] = 'true';
    this.#currentKey = key;
    this.#panel.scrollTop = 0;
  }

  close(): void {
    this.#panel.style.transform = '';
    this.#panel.dataset['open'] = 'false';
    this.#body.replaceChildren();
    this.#currentKey = null;
    this.#onClose?.();
  }
}
