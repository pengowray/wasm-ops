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
 * The four kinds of text are kept apart rather than run together into one
 * string. What matched decides how much a match is worth — a name is strong
 * evidence, a word in a description is weak — and once they are concatenated
 * there is no way to tell which one answered.
 *
 * The whole index is built once on the first keystroke rather than at load, so
 * a reader who never searches never pays for it.
 */

import type { Opcode, OpcodeData } from '../model/types.ts';
import { CATEGORY_LABELS, categorize, subcategorize } from '../model/categories.ts';
import { proposal } from '../model/proposals.ts';
import { rank, type Haystacks, type SearchHit } from '../model/rank.ts';
import { normaliseTag } from '../model/search.ts';
import { tagsFor } from '../model/tags.ts';
import { summarize } from '../model/summary.ts';

const EMPTY: Haystacks = { name: '', tags: [], summary: '', prose: '' };

export class Search {
  readonly #data: OpcodeData;
  readonly #details: HTMLElement | null;
  #haystacks: Map<string, Haystacks> | null = null;

  constructor(data: OpcodeData, details: HTMLElement | null) {
    this.#data = data;
    this.#details = details;
  }

  #index(): Map<string, Haystacks> {
    if (this.#haystacks) return this.#haystacks;

    const prose = new Map<string, string>();
    for (const el of this.#details?.querySelectorAll<HTMLElement>('.detail[data-key]') ?? []) {
      const key = el.dataset['key'];
      if (key) prose.set(key, (el.textContent ?? '').replace(/\s+/g, ' ').toLowerCase());
    }

    const haystacks = new Map<string, Haystacks>();
    for (const op of this.#data.opcodes) {
      if (!op.name) continue;
      // Everything that describes the instruction in a few words: its own
      // summary, its operands, the shelves it sits on and where it came from.
      const summary = [
        summarize(op),
        op.immediateArgs?.replace(/<[^>]+>/g, ' '),
        CATEGORY_LABELS[categorize(op)],
        subcategorize(op)?.label,
        proposal(op.proposal)?.name,
        op.status !== 'standard' ? op.status : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      // Both spellings of each property, each carrying the label it is drawn
      // with, so a match on `sub-arithmetic` can be reported as "Arithmetic".
      const tags: { match: string; label: string }[] = [];
      for (const tag of tagsFor(op)) {
        for (const spelling of new Set([normaliseTag(tag.id), normaliseTag(tag.label)])) {
          tags.push({ match: spelling, label: tag.label });
        }
      }

      haystacks.set(op.id, {
        // A doorway byte has no name to search — `twobytefd.simd` is a
        // placeholder, and matching `fd` inside it would mark a run of letters
        // the reader is never shown. It is findable by its byte, which is the
        // only thing it is.
        name: op.prefixFor?.length ? '' : op.name.toLowerCase(),
        tags,
        summary,
        prose: prose.get(op.id) ?? '',
      });
    }
    this.#haystacks = haystacks;
    return haystacks;
  }

  /** Every instruction matching the query, best first. Empty query, no hits. */
  find(query: string): SearchHit[] {
    if (!query.trim()) return [];
    const haystacks = this.#index();
    return rank(query, this.#data.opcodes, (op) => haystacks.get(op.id) ?? EMPTY);
  }

  /** The instruction ids a query found, for lighting them up. */
  keys(query: string): Set<string> {
    return new Set(this.find(query).map((hit) => hit.op.id));
  }
}

export type { SearchHit };
