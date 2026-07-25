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
    // Whether there is a "Followed by" section to point the operands at is a
    // property of the prose, so it is read off the article rather than shipped
    // as another field.
    encoding.innerHTML = renderEncoding(op, Boolean(content.querySelector('.detail-followed')));

    // The bytes go directly under the name: it is the first thing wanted of an
    // opcode chart, and putting it here means it is not also needed above.
    const heading = content.querySelector('.detail-name');
    if (heading) heading.after(encoding);
    else content.prepend(encoding);

    this.#body.replaceChildren(content);
    this.#panel.dataset['open'] = 'true';
    this.#currentKey = key;
    this.#panel.scrollTop = 0;
  }

  close(): void {
    this.#panel.dataset['open'] = 'false';
    this.#body.replaceChildren();
    this.#currentKey = null;
    this.#onClose?.();
  }
}
