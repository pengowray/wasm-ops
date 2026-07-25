/**
 * The search index.
 *
 * Two sources, joined here. Everything derivable about an instruction — its
 * name, its opcode, its summary, its category, its tags — is computed from the
 * data the client already has. The written description is not derivable, but it
 * is already in the page as the reference section at the bottom, so it is read
 * out of the DOM rather than shipped a second time: searching the prose costs
 * nothing but the walk.
 *
 * The whole index is about 200 kB of lowercase text held in memory, built once
 * on the first keystroke rather than at load, so a reader who never searches
 * never pays for it.
 */

import type { Opcode, OpcodeData } from '../model/types.ts';
import {
  compileQuery,
  matchesQuery,
  searchTagsFor,
  searchTextFor,
  type Haystack,
} from '../model/search.ts';

const EMPTY: Haystack = { text: '', tags: [] };

export class Search {
  readonly #data: OpcodeData;
  readonly #details: HTMLElement | null;
  #haystacks: Map<string, Haystack> | null = null;

  constructor(data: OpcodeData, details: HTMLElement | null) {
    this.#data = data;
    this.#details = details;
  }

  #index(): Map<string, Haystack> {
    if (this.#haystacks) return this.#haystacks;

    const prose = new Map<string, string>();
    for (const el of this.#details?.querySelectorAll<HTMLElement>('.detail[data-key]') ?? []) {
      const key = el.dataset['key'];
      if (key) prose.set(key, (el.textContent ?? '').replace(/\s+/g, ' ').toLowerCase());
    }

    const haystacks = new Map<string, Haystack>();
    for (const op of this.#data.opcodes) {
      haystacks.set(op.id, {
        text: `${searchTextFor(op)} ${prose.get(op.id) ?? ''}`,
        tags: op.name ? searchTagsFor(op) : [],
      });
    }
    this.#haystacks = haystacks;
    return haystacks;
  }

  /**
   * The predicate for a query, or nothing at all when the query is empty —
   * which is not the same as a predicate that always says yes, since the view
   * uses its absence to skip the work entirely.
   */
  predicate(query: string): ((op: Opcode) => boolean) | undefined {
    const terms = compileQuery(query);
    if (!terms.length) return undefined;
    const haystacks = this.#index();
    return (op) => matchesQuery(haystacks.get(op.id) ?? EMPTY, terms);
  }

}
