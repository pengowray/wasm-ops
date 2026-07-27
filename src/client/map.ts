/**
 * The navigation map: a miniature, textless copy of every byte grid.
 *
 * It exists because the chart is taller than the window. Hovering an
 * instruction lights up its relatives, but any relative that happens to be
 * scrolled off screen lights up unseen. The map is always fully visible, so it
 * can show all of them at once.
 *
 * It also marks which part of the chart you are currently looking at, and
 * clicking a square jumps to that instruction wherever the current arrangement
 * has put it.
 *
 * The map is always the byte layout, even when the chart is showing a list.
 * That is the point: it is a fixed spatial reference to navigate by, so it
 * should not move around underneath you when the chart is rearranged.
 */

import { markedTitle } from '../model/types.ts';
import type { OpcodeData } from '../model/types.ts';
import { BAND, gridRows, type ViewOptions } from '../model/view.ts';
import { escapeHtml, partTokens, plainName, specText } from '../render/items.ts';
import { tagTokens } from '../model/tags.ts';

export class NavMap {
  readonly #root: HTMLElement;
  readonly #chart: HTMLElement;
  readonly #data: OpcodeData;
  #observer: IntersectionObserver | null = null;

  constructor(root: HTMLElement, chart: HTMLElement, data: OpcodeData) {
    this.#root = root;
    this.#chart = chart;
    this.#data = data;

    root.innerHTML = this.#render(data);
    this.#wireClicks();
    this.#watchViewport();
  }

  #render(data: OpcodeData): string {
    const sections = data.sections.map((section) => {
      const cells = data.opcodes
        .filter((op) => op.section === section.id)
        .map((op) => {
          // The same breaks the chart makes, in the same places. The map is a
          // miniature of the byte grids, and a landmark it does not share is
          // not a landmark you can navigate by.
          const band =
            op.code !== section.start && op.code % BAND === 0
              ? `<span class="map-band" data-band="${op.code}"></span>`
              : '';
          // The map carries the same selectable attributes as a cell, so a
          // highlight reaches it too — which is the whole point of having it.
          const attrs =
            ` data-key="${op.id}" data-status="${op.status}" data-row="${op.code >> 4}"` +
            (op.parts?.pre ? ` data-pre="${escapeHtml(op.parts.pre)}"` : '') +
            (op.parts?.mainop ? ` data-op="${escapeHtml(op.parts.mainop)}"` : '') +
            (op.name ? ` data-tags="${escapeHtml(tagTokens(op))}"` : '') +
            (op.name ? ` data-parts="${escapeHtml(partTokens(op))}"` : '') +
            (op.proposal ? ` data-proposal="${escapeHtml(op.proposal)}"` : '');
          const label = `${specText(op)} ${plainName(op)}`;
          return `${band}<span class="map-cell"${attrs} title="${escapeHtml(label)}"></span>`;
        })
        .join('');

      return (
        `<div class="map-section" data-section="${section.id}">` +
        `<span class="map-label">${markedTitle(section)}</span>` +
        `<div class="map-grid">${cells}</div>` +
        `</div>`
      );
    });

    return sections.join('');
  }

  #wireClicks(): void {
    this.#root.addEventListener('click', (event) => {
      const target = (event.target as Element).closest<HTMLElement>('.map-cell');
      const key = target?.dataset['key'];
      if (!key) return;

      const cell = this.#chart.querySelector<HTMLElement>(
        `.cell[data-key="${CSS.escape(key)}"]`,
      );
      // The cell may be filtered out of the current arrangement entirely.
      if (!cell) return;
      cell.scrollIntoView({ block: 'center', behavior: 'smooth' });
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  /**
   * Marks the squares whose instructions are currently on screen, so the map
   * doubles as a "you are here". An IntersectionObserver does this without
   * anything running on scroll.
   */
  #watchViewport(): void {
    const squares = new Map<string, HTMLElement>();
    for (const el of this.#root.querySelectorAll<HTMLElement>('.map-cell')) {
      const key = el.dataset['key'];
      if (key) squares.set(key, el);
    }

    this.#observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset['key'];
          if (!key) continue;
          squares.get(key)?.classList.toggle('in-view', entry.isIntersecting);
        }
      },
      { root: null, threshold: 0 },
    );

    this.observe();
  }

  /**
   * Drops the rows the byte grid is not drawing.
   *
   * A hidden square keeps its place — the map is a picture of the byte space
   * and closing a gap would move every square after it — but a row where every
   * square is hidden is not a gap, it is a band of nothing. The GC table is 128
   * slots, and with the superseded 2022 encodings hidden the chart stops after
   * the second row; the map went on drawing all eight.
   *
   * Driven by the filters alone, deliberately, and not by the search: hiding
   * the historical encodings is a decision, and the map reshaping to match it
   * is the answer to that decision. A query is typed a letter at a time, and a
   * map that folded up and unfolded on every keystroke would be unreadable.
   */
  trim(options: ViewOptions): void {
    // Sixteen wide whatever the chart is doing: the map is a fixed picture of
    // the byte space to navigate by, and refolding it when the window narrows
    // would move every square the reader had learnt the position of.
    const unsearched: ViewOptions = { ...options, match: undefined, columns: 16 };
    for (const section of this.#data.sections) {
      const ops = this.#data.opcodes.filter((op) => op.section === section.id);
      const rows = new Set(gridRows(section, ops, unsearched).map((base) => base >> 4));
      const el = this.#root.querySelector<HTMLElement>(
        `.map-section[data-section="${CSS.escape(section.id)}"]`,
      );
      for (const square of el?.querySelectorAll<HTMLElement>('.map-cell') ?? []) {
        const row = Number(square.dataset['row']);
        if (rows.has(row)) delete square.dataset['offgrid'];
        else square.dataset['offgrid'] = '1';
      }
      // A band divides two runs of rows, so it is only a division while there
      // are rows on both sides of it. Filtering the string encodings away takes
      // everything below 0xFB 128 with it, and a break with nothing after it is
      // a stripe of padding under the last row rather than a landmark.
      for (const band of el?.querySelectorAll<HTMLElement>('.map-band') ?? []) {
        const at = Number(band.dataset['band']) >> 4;
        const divides = [...rows].some((r) => r < at) && [...rows].some((r) => r >= at);
        band.hidden = !divides;
      }
    }
  }

  /** Re-attaches the observer after a rearrangement replaced the chart's nodes. */
  observe(): void {
    if (!this.#observer) return;
    this.#observer.disconnect();
    for (const cell of this.#chart.querySelectorAll('.cell')) {
      this.#observer.observe(cell);
    }
    this.syncFiltered();
  }

  /**
   * Mirrors the chart's filtering onto the map.
   *
   * The map draws every byte whatever the filters say — that is what makes it a
   * map — but an instruction the reader has hidden should not light up in it
   * either, and should not look present. Without this the map answered a
   * hover with a few more matches than the chart showed.
   */
  syncFiltered(): void {
    // Taken from what the chart is showing rather than from what it is hiding,
    // because the two layouts hide differently: the byte grid blanks a cell in
    // place, while the card and table layouts drop it from the document
    // altogether. Only the set that survived is common to both.
    const showing = new Set<string>();
    for (const cell of this.#chart.querySelectorAll<HTMLElement>('.cell:not([data-filtered])')) {
      const key = cell.dataset['key'];
      if (key) showing.add(key);
    }
    for (const square of this.#root.querySelectorAll<HTMLElement>('.map-cell')) {
      const key = square.dataset['key'];
      if (key && !showing.has(key)) square.dataset['filtered'] = '1';
      else delete square.dataset['filtered'];
    }

    // A section with nothing left in it is a label over a blank rectangle. The
    // chart drops those; so does the map. Hiding the dormant string proposal
    // should take its heading with it, not leave an empty frame behind.
    for (const section of this.#root.querySelectorAll<HTMLElement>('.map-section')) {
      const any = section.querySelector('.map-cell:not([data-filtered]):not([data-offgrid])');
      if (any) delete section.dataset['empty'];
      else section.dataset['empty'] = '1';
    }
  }
}

/*
 * There was a `shortTitle` here, trimming "… proposal" and "… instructions" off
 * a heading to fit the rail. The tables are lettered now and their titles are
 * already two words, so it had nothing left to cut.
 */
