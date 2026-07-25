/**
 * Relationship highlighting.
 *
 * Hovering a cell lights up every other cell that performs the same operation,
 * and the shared type prefix within them — so hovering `i64.load16_u` shows you
 * every load, and picks out the `i64` in each.
 *
 * Clicking pins that highlight so it survives the pointer moving away.
 * Hovering something else previews over the top of the pin without discarding
 * it, which is what makes it possible to compare two groups.
 *
 * Highlighting is applied document-wide rather than within the chart, so the
 * navigation map lights up in step with it. That is most of the map's value:
 * matches scrolled off the bottom of the chart are still visible there.
 *
 * The old page attached two closures to every cell and walked
 * getElementsByClassName on each mouse event. This keeps one listener per
 * container and selects by the data attributes baked in at build time.
 */

const CLASSES = ['hl-self', 'hl-op', 'hl-pre'] as const;

/** Cells in the chart and squares in the map both carry these attributes. */
const TARGET = '.cell, .map-cell';

export class Highlighter {
  #pinnedKey: string | null = null;
  #lit: HTMLElement[] = [];

  constructor(roots: HTMLElement[]) {
    for (const root of roots) {
      root.addEventListener('pointerover', (event) => {
        if (root.classList.contains('settling')) return;
        const cell = (event.target as Element).closest<HTMLElement>(TARGET);
        if (cell) this.#apply(cell);
      });
      root.addEventListener('pointerleave', () => this.restore());
    }
  }

  /** Pins the highlight to a cell, or clears the pin when given null. */
  pin(cell: HTMLElement | null): void {
    this.#pinnedKey = cell?.dataset['key'] ?? null;
    this.restore();
  }

  get pinnedKey(): string | null {
    return this.#pinnedKey;
  }

  /** Reapplies the pinned highlight, e.g. after a rearrangement replaced nodes. */
  restore(): void {
    this.#clear();
    for (const el of document.querySelectorAll<HTMLElement>('.pinned')) {
      el.classList.remove('pinned');
    }
    if (!this.#pinnedKey) return;

    const selector = `[data-key="${CSS.escape(this.#pinnedKey)}"]`;
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.matches(TARGET)) el.classList.add('pinned');
    }
    const anchor = document.querySelector<HTMLElement>(`.cell${selector}`);
    if (anchor) this.#apply(anchor);
  }

  #clear(): void {
    for (const el of this.#lit) el.classList.remove(...CLASSES);
    this.#lit = [];
  }

  #apply(cell: HTMLElement): void {
    this.#clear();

    const op = cell.dataset['op'];
    const pre = cell.dataset['pre'];
    const key = cell.dataset['key'];

    const light = (selector: string, className: (typeof CLASSES)[number]) => {
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        el.classList.add(className);
        this.#lit.push(el);
      }
    };

    if (op) light(`[data-op="${CSS.escape(op)}"]`, 'hl-op');
    if (pre) light(`[data-pre="${CSS.escape(pre)}"]`, 'hl-pre');
    // The instruction itself, in both the chart and the map.
    if (key) {
      const escaped = CSS.escape(key);
      light(`.cell[data-key="${escaped}"], .map-cell[data-key="${escaped}"]`, 'hl-self');
    }

    // The hovered element itself always counts, even if it carried no
    // attributes to select on.
    cell.classList.add('hl-self');
    this.#lit.push(cell);
  }
}
