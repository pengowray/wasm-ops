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

const CLASSES = ['hl-self', 'hl-op', 'hl-pre', 'hl-tag'] as const;

/** Cells in the chart and squares in the map both carry these attributes. */
const TARGET = '.cell, .map-cell';

export class Highlighter {
  #pinnedKey: string | null = null;
  #lit: HTMLElement[] = [];

  constructor(roots: HTMLElement[]) {
    for (const root of roots) {
      root.addEventListener('pointerover', (event) => {
        if (root.classList.contains('settling')) return;
        const target = event.target as Element;
        const cell = target.closest<HTMLElement>(TARGET);
        // The type prefix lights up only while the pointer is over the `i32`
        // itself, not anywhere in the cell — otherwise every cell of that type
        // flashes yellow just from crossing the chart.
        if (cell) this.#apply(cell, Boolean(target.closest('.pre')));
      });
      root.addEventListener('pointerleave', () => this.restore());
    }
  }

  #pinnedTag: string | null = null;

  /**
   * Lights up everything carrying a property tag, and keeps it lit. This is a
   * different question from the hover highlight — "what else is atomic?"
   * rather than "what else is this operation?" — so it has its own state and
   * survives the pointer moving.
   */
  pinTag(tag: string | null): void {
    this.#pinnedTag = this.#pinnedTag === tag ? null : tag;
    this.#pinnedKey = null;
    this.restore();
    return;
  }

  get pinnedTag(): string | null {
    return this.#pinnedTag;
  }

  /** Pins the highlight to a cell, or clears the pin when given null. */
  pin(cell: HTMLElement | null): void {
    this.#pinnedKey = cell?.dataset['key'] ?? null;
    this.#pinnedTag = null;
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
    if (this.#pinnedTag) {
      const selector = `[data-tags~="${CSS.escape(this.#pinnedTag)}"]`;
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        el.classList.add('hl-tag');
        this.#lit.push(el);
      }
      for (const chip of document.querySelectorAll<HTMLElement>('.tag')) {
        chip.setAttribute(
          'aria-pressed',
          String(chip.dataset['tag'] === this.#pinnedTag),
        );
      }
      return;
    }
    for (const chip of document.querySelectorAll<HTMLElement>('.tag')) {
      chip.setAttribute('aria-pressed', 'false');
    }

    if (!this.#pinnedKey) return;

    const selector = `[data-key="${CSS.escape(this.#pinnedKey)}"]`;
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.matches(TARGET)) el.classList.add('pinned');
    }
    const anchor = document.querySelector<HTMLElement>(`.cell${selector}`);
    if (anchor) this.#apply(anchor, false);
  }

  #clear(): void {
    for (const el of this.#lit) el.classList.remove(...CLASSES);
    this.#lit = [];
  }

  #apply(cell: HTMLElement, includeType: boolean): void {
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
    if (pre && includeType) light(`[data-pre="${CSS.escape(pre)}"]`, 'hl-pre');
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
