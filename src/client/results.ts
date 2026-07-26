/**
 * The list under the search box.
 *
 * Searching used to answer only in the chart: matches stayed, everything else
 * went, and the reader had to find the answer in eight hundred cells that had
 * just rearranged themselves. That is a good answer to `i64 load`, which is a
 * question about a set. It is a poor answer to `11`, which is a question about
 * one instruction, and the chart cannot say which of its matches was the
 * likeliest reading of the query — a list can, by putting it first.
 *
 * So the list ranks and the chart highlights, and the two answer different
 * halves of the same question: which one did you mean, and where do they all
 * live.
 */

import { escapeHtml, plainName, specLabel } from '../render/items.ts';
import type { SearchHit } from '../model/rank.ts';

/** Enough to choose from without becoming a second chart. */
const SHOWN = 12;

export class Results {
  readonly #root: HTMLElement;
  readonly #input: HTMLInputElement;
  readonly #onPick: (key: string) => void;
  #active = -1;

  constructor(root: HTMLElement, input: HTMLInputElement, onPick: (key: string) => void) {
    this.#root = root;
    this.#input = input;
    this.#onPick = onPick;

    root.addEventListener('mousedown', (event) => {
      // Before the input's blur, so picking a result does not first close the
      // list out from under the click.
      const row = (event.target as Element).closest<HTMLElement>('.result[data-key]');
      if (!row) return;
      event.preventDefault();
      this.#onPick(row.dataset['key']!);
      this.hide();
    });

    root.addEventListener('pointerover', (event) => {
      const row = (event.target as Element).closest<HTMLElement>('.result[data-key]');
      if (row) this.#setActive([...this.#rows()].indexOf(row));
    });
  }

  #rows(): NodeListOf<HTMLElement> {
    return this.#root.querySelectorAll<HTMLElement>('.result[data-key]');
  }

  get open(): boolean {
    return !this.#root.hidden;
  }

  show(hits: SearchHit[]): void {
    if (!hits.length) {
      this.hide();
      return;
    }

    const rows = hits.slice(0, SHOWN).map((hit) => {
      const name = plainName(hit.op);
      const marked = hit.span
        ? escapeHtml(name.slice(0, hit.span[0])) +
          `<mark>${escapeHtml(name.slice(hit.span[0], hit.span[1]))}</mark>` +
          escapeHtml(name.slice(hit.span[1]))
        : escapeHtml(name);
      return (
        `<li class="result" role="option" aria-selected="false" data-key="${escapeHtml(hit.op.id)}">` +
        `<span class="result-op">${specLabel(hit.op)}</span>` +
        `<span class="result-name">${marked}</span>` +
        (hit.note ? `<span class="result-note">${escapeHtml(hit.note)}</span>` : '') +
        `</li>`
      );
    });

    if (hits.length > SHOWN) {
      rows.push(
        `<li class="result-more">and ${hits.length - SHOWN} more, highlighted in the chart</li>`,
      );
    }

    this.#root.innerHTML = rows.join('');
    this.#root.hidden = false;
    this.#input.setAttribute('aria-expanded', 'true');
    this.#setActive(-1);
  }

  hide(): void {
    this.#root.hidden = true;
    this.#root.innerHTML = '';
    this.#active = -1;
    this.#input.setAttribute('aria-expanded', 'false');
    this.#input.removeAttribute('aria-activedescendant');
  }

  #setActive(index: number): void {
    const rows = [...this.#rows()];
    this.#active = index;
    rows.forEach((row, i) => {
      const on = i === index;
      row.classList.toggle('result-active', on);
      row.setAttribute('aria-selected', String(on));
      if (on) row.scrollIntoView({ block: 'nearest' });
    });
  }

  /** Arrow keys. Wraps, so holding one down never dead-ends. */
  move(by: number): void {
    const count = this.#rows().length;
    if (!count) return;
    this.#setActive((this.#active + by + count + (this.#active < 0 && by < 0 ? 1 : 0)) % count);
  }

  /** Enter. Answers whether there was anything to open. */
  choose(): boolean {
    const row = this.#rows()[this.#active < 0 ? 0 : this.#active];
    if (!row) return false;
    this.#onPick(row.dataset['key']!);
    this.hide();
    return true;
  }
}
