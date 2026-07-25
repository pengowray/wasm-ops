/**
 * Relationship highlighting.
 *
 * Two kinds, deliberately different in weight.
 *
 * Hovering relates by the *part of the name under the pointer*. A name is a
 * sentence about an instruction — a type, an operation, a width, a source type,
 * a signedness — and each part is a separate question. Hovering the `i64` of
 * `i64.trunc_sat_f64_s` asks "what else is i64?"; hovering `trunc` asks "what
 * else truncates?". Both are answered by tinting the matching *words* rather
 * than washing whole cells: it is a passing glance and should read as one.
 *
 * Clicking a property tag is a deliberate question, so it stays loud — a full
 * cell highlight with a ring, which survives the pointer moving on.
 *
 * The map mirrors the hover as long as nothing is pinned, so matches scrolled
 * off the bottom of the chart still count.
 */

const PART_LIT = 'part-lit';
const MAP_LIT = 'map-part-lit';
const TAG_CLASSES = ['hl-self', 'hl-tag'] as const;

export class Highlighter {
  #pinnedKey: string | null = null;
  #pinnedTag: string | null = null;
  #lit: HTMLElement[] = [];
  #hovered: HTMLElement[] = [];

  constructor(roots: HTMLElement[]) {
    for (const root of roots) {
      root.addEventListener('pointerover', (event) => {
        if (root.classList.contains('settling')) return;
        const target = event.target as Element;
        const token = target.closest<HTMLElement>('[data-p]')?.dataset['p'];
        if (token) this.#hover(token);
        else this.#clearHover();
      });
      root.addEventListener('pointerleave', () => this.#clearHover());
    }
  }

  /** Lights every occurrence of one part of a name. */
  #hover(token: string): void {
    this.#clearHover();
    const escaped = CSS.escape(token);

    for (const el of document.querySelectorAll<HTMLElement>(`.cell:not([data-filtered]) [data-p="${escaped}"]`)) {
      el.classList.add(PART_LIT);
      this.#hovered.push(el);
    }

    // A pinned tag owns the map; two answers at once would be unreadable.
    if (this.#pinnedTag) return;
    for (const el of document.querySelectorAll<HTMLElement>(
      `.map-cell[data-parts~="${escaped}"]:not([data-filtered])`,
    )) {
      el.classList.add(MAP_LIT);
      this.#hovered.push(el);
    }
  }

  #clearHover(): void {
    for (const el of this.#hovered) el.classList.remove(PART_LIT, MAP_LIT);
    this.#hovered = [];
  }

  /**
   * Lights everything carrying a property tag, and keeps it lit. Clicking the
   * same tag again puts it out.
   */
  pinTag(tag: string | null): void {
    this.#pinnedTag = this.#pinnedTag === tag ? null : tag;
    this.#pinnedKey = null;
    this.restore();
  }

  get pinnedTag(): string | null {
    return this.#pinnedTag;
  }

  /** Marks the selected instruction. Selection is an outline, not a wash. */
  pin(cell: HTMLElement | null): void {
    this.#pinnedKey = cell?.dataset['key'] ?? null;
    this.#pinnedTag = null;
    this.restore();
  }

  get pinnedKey(): string | null {
    return this.#pinnedKey;
  }

  /** Reapplies what is pinned, e.g. after a rearrangement replaced the nodes. */
  restore(): void {
    this.#clear();
    this.#clearHover();
    for (const el of document.querySelectorAll<HTMLElement>('.cell.pinned, .map-cell.pinned')) {
      el.classList.remove('pinned');
    }

    for (const chip of document.querySelectorAll<HTMLElement>('.tag')) {
      chip.setAttribute('aria-pressed', String(chip.dataset['tag'] === this.#pinnedTag));
    }

    if (this.#pinnedTag) {
      const selector = `[data-tags~="${CSS.escape(this.#pinnedTag)}"]:not([data-filtered])`;
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        el.classList.add('hl-tag');
        this.#lit.push(el);
      }
      return;
    }

    if (!this.#pinnedKey) return;
    const selector = `[data-key="${CSS.escape(this.#pinnedKey)}"]:not([data-filtered])`;
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      if (el.matches('.cell, .map-cell')) el.classList.add('pinned');
    }
  }

  #clear(): void {
    for (const el of this.#lit) el.classList.remove(...TAG_CLASSES);
    this.#lit = [];
  }
}
