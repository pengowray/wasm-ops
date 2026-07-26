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

/**
 * What is lit, in a form something other than the stylesheet can act on.
 *
 * The highlight was previously written only into class names, which is all the
 * colours need. Two things now want to know what the answer *is*: the line
 * under the map that says it in words, and the shortcut that keeps only these
 * and hides the rest.
 */
export interface HighlightState {
  kind: 'none' | 'hover' | 'tag' | 'pin';
  /** The part of a name under the pointer, for `hover`. */
  token?: string;
  tag?: string;
  key?: string;
  /** Keys of the chart cells lit, whatever lit them. */
  keys: string[];
}

const NOTHING: HighlightState = { kind: 'none', keys: [] };

export class Highlighter {
  #pinnedKey: string | null = null;
  #pinnedTag: string | null = null;
  #hoverToken: string | null = null;
  #lit: HTMLElement[] = [];
  #hovered: HTMLElement[] = [];
  #onChange: ((state: HighlightState) => void) | null = null;

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

  /** Told whenever what is lit changes. */
  onChange(handler: (state: HighlightState) => void): void {
    this.#onChange = handler;
    handler(this.state());
  }

  /**
   * What is lit right now. The keys are read back out of the chart rather than
   * remembered, because a rearrangement replaces every node and the set that
   * survives a filter is not the set that was lit when it was applied.
   */
  state(): HighlightState {
    const keys = (selector: string): string[] => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        const key = el.closest<HTMLElement>('.cell')?.dataset['key'];
        if (key && !out.includes(key)) out.push(key);
      }
      return out;
    };

    if (this.#pinnedTag) {
      return {
        kind: 'tag',
        tag: this.#pinnedTag,
        keys: keys(`.cell[data-tags~="${CSS.escape(this.#pinnedTag)}"]:not([data-filtered])`),
      };
    }
    // Before the selection, because a hover happens on top of one: the pointer
    // is asking a new question while the panel still shows the answer to the
    // old, and the words under the map should follow the pointer, as the
    // colours do. A pinned tag is the exception above — it owns the map, so a
    // hover does not reach it and the caption must not claim otherwise.
    if (this.#hoverToken) {
      return {
        kind: 'hover',
        token: this.#hoverToken,
        keys: keys(`.cell:not([data-filtered]) [data-p="${CSS.escape(this.#hoverToken)}"]`),
      };
    }
    if (this.#pinnedKey) {
      return { kind: 'pin', key: this.#pinnedKey, keys: [this.#pinnedKey] };
    }
    return NOTHING;
  }

  #announce(): void {
    this.#onChange?.(this.state());
  }

  /** Lights every occurrence of one part of a name. */
  #hover(token: string): void {
    this.#clearHover();
    this.#hoverToken = token;
    const escaped = CSS.escape(token);

    for (const el of document.querySelectorAll<HTMLElement>(`.cell:not([data-filtered]) [data-p="${escaped}"]`)) {
      el.classList.add(PART_LIT);
      this.#hovered.push(el);
    }

    // A pinned tag owns the map; two answers at once would be unreadable.
    if (this.#pinnedTag) {
      this.#announce();
      return;
    }
    for (const el of document.querySelectorAll<HTMLElement>(
      `.map-cell[data-parts~="${escaped}"]:not([data-filtered])`,
    )) {
      el.classList.add(MAP_LIT);
      this.#hovered.push(el);
    }
    this.#announce();
  }

  #clearHover(): void {
    for (const el of this.#hovered) el.classList.remove(PART_LIT, MAP_LIT);
    this.#hovered = [];
    if (this.#hoverToken) {
      this.#hoverToken = null;
      this.#announce();
    }
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
      this.#announce();
      return;
    }

    if (this.#pinnedKey) {
      const selector = `[data-key="${CSS.escape(this.#pinnedKey)}"]:not([data-filtered])`;
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        if (el.matches('.cell, .map-cell')) el.classList.add('pinned');
      }
    }
    this.#announce();
  }

  #clear(): void {
    for (const el of this.#lit) el.classList.remove(...TAG_CLASSES);
    this.#lit = [];
  }
}
