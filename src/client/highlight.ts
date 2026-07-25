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
 * The old page attached two closures to every cell and walked
 * getElementsByClassName on each mouse event. This keeps one listener on the
 * container and selects by the data attributes baked in at build time.
 */

const CLASSES = ['hl-self', 'hl-op', 'hl-pre'] as const;

export class Highlighter {
  readonly #chart: HTMLElement;
  #pinned: HTMLElement | null = null;
  #lit: HTMLElement[] = [];

  constructor(chart: HTMLElement) {
    this.#chart = chart;

    chart.addEventListener('pointerover', (event) => {
      if (chart.classList.contains('settling')) return;
      const cell = (event.target as Element).closest<HTMLElement>('.cell');
      if (cell) this.#apply(cell);
    });

    chart.addEventListener('pointerleave', () => this.#restore());
  }

  /** Pins the highlight to a cell, or clears the pin when given null. */
  pin(cell: HTMLElement | null): void {
    this.#pinned?.classList.remove('pinned');
    this.#pinned = cell;
    cell?.classList.add('pinned');
    this.#restore();
  }

  get pinnedKey(): string | null {
    return this.#pinned?.dataset['key'] ?? null;
  }

  /** Re-resolves the pinned cell after a re-layout replaced the DOM nodes. */
  repin(): void {
    const key = this.#pinned?.dataset['key'];
    if (!key) return;
    const fresh = this.#chart.querySelector<HTMLElement>(
      `.cell[data-key="${CSS.escape(key)}"]`,
    );
    this.#pinned = fresh;
    fresh?.classList.add('pinned');
    this.#restore();
  }

  #clear(): void {
    for (const el of this.#lit) el.classList.remove(...CLASSES);
    this.#lit = [];
  }

  #restore(): void {
    this.#clear();
    if (this.#pinned) this.#apply(this.#pinned);
  }

  #apply(cell: HTMLElement): void {
    this.#clear();

    const op = cell.dataset['op'];
    const pre = cell.dataset['pre'];

    const light = (el: HTMLElement, className: (typeof CLASSES)[number]) => {
      el.classList.add(className);
      this.#lit.push(el);
    };

    if (op) {
      for (const el of this.#chart.querySelectorAll<HTMLElement>(
        `.cell[data-op="${CSS.escape(op)}"]`,
      )) {
        light(el, 'hl-op');
      }
    }
    if (pre) {
      for (const el of this.#chart.querySelectorAll<HTMLElement>(
        `.cell[data-pre="${CSS.escape(pre)}"]`,
      )) {
        light(el, 'hl-pre');
      }
    }
    light(cell, 'hl-self');
  }
}
