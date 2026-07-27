/**
 * What the four doorway bytes say about themselves.
 *
 * `0xFB`, `0xFC`, `0xFD` and `0xFE` are not instructions. Each one announces
 * that a sub-opcode follows and that the pair should be looked up in another
 * table. A cell in the core grid therefore has nothing to say about what it
 * does, only about where it leads, and that is entirely derivable: which
 * sections sit behind it, how far they run, how many bytes are assigned, and
 * which proposals put them there.
 *
 * So it is derived. The alternative is four hand-written paragraphs listing
 * proposals, which were wrong the day shared-everything threads landed and
 * would be wrong again after the next one. Nothing here is a fact about the
 * prefix byte that is not already a fact about the table behind it.
 */

import { proposal } from './proposals.ts';
import {
  HISTORICAL,
  markedTitle,
  tableMark,
  type Opcode,
  type OpcodeData,
  type Section,
  type SectionId,
} from './types.ts';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A sub-opcode, in the decimal the rest of the page writes them in. */
function dec(value: number): string {
  return `<span class="op-dec">${value}</span>`;
}

/** The span a run of opcodes covers, as `0–260` — or a single value. */
function range(ops: Opcode[]): string {
  const codes = ops.map((op) => op.code);
  const low = Math.min(...codes);
  const high = Math.max(...codes);
  return low === high ? dec(low) : `${dec(low)}–${dec(high)}`;
}

/** The badge used for a count everywhere else on the page. */
function badge(count: number): string {
  return (
    `<span class="group-count">` +
    `<span class="count-n">${count}</span><span class="count-unit"> opcodes</span></span>`
  );
}

/**
 * What a byte behind this prefix means today: named, and not superseded,
 * abandoned or dormant.
 *
 * The distinction matters more here than anywhere else on the page. Counting
 * every encoding ever assigned, the GC table runs 0–113 with 49 instructions;
 * counting what a module can contain today it runs 0–38 with 39, and the ten in
 * between are the withdrawn 2022 draft. A doorway says where it leads now. The
 * rest is in the folded list under the description, which is where someone
 * looking at an old module will go.
 */
function live(ops: Opcode[]): Opcode[] {
  const named = ops.filter((op) => op.name);
  const current = named.filter((op) => !HISTORICAL.includes(op.status));
  // Unless the whole table is history. Reference-typed strings is dormant from
  // end to end, and a doorway that describes it as empty would be describing
  // the filter rather than the byte — the reader who has turned the dormant
  // encodings on is looking at a table of 39 instructions.
  return current.length ? current : named;
}

/**
 * The cell's own text: the prefix byte, then a line per table behind it giving
 * how far it runs and how much of it is in use, with the table's mark at the
 * end of its line.
 *
 * The lines are marked with their section so the client can drop the ones the
 * reader is not being shown: a doorway that advertises a table nowhere on the
 * page is an invitation to look for something that is not there.
 */
/** A run of opcodes reduced to the three numbers a doorway cell quotes. */
export interface PrefixTable {
  id: SectionId;
  low: number;
  high: number;
  n: number;
  mark: string;
}

/**
 * The figures for one table, over whichever of its opcodes are in play.
 *
 * Both callers pass a different set and mean it. At build time it is the
 * instructions the page arrives showing; in the browser it is whatever the
 * filters have left, which is why the numbers cannot be baked into the markup:
 * turning the dormant string table on takes 0xFB from `0–38, 39` to
 * `0–183, 88`, and both are true statements about that byte.
 */
export function prefixTable(id: SectionId, mark: string, ops: Opcode[]): PrefixTable | null {
  if (!ops.length) return null;
  return {
    id,
    mark,
    low: Math.min(...ops.map((o) => o.code)),
    high: Math.max(...ops.map((o) => o.code)),
    n: ops.length,
  };
}

/**
 * The one line a doorway byte's cell says about the tables in front of the
 * reader: how far they run altogether, how many bytes of that are assigned,
 * and which tables they are.
 *
 * One line rather than one per table, and now one table behind each byte in any
 * case: 0xFD opens a single range of 336 and 0xFB one of 0–183. The sentence is
 * the same either way — this byte, then a value in this range.
 *
 * Which tables are in front of the reader is the client's business, so this is
 * recomputed there as the filters change; see `syncPrefixLines`.
 */
export function prefixLine(tables: PrefixTable[]): string {
  if (!tables.length) return '';
  const low = Math.min(...tables.map((t) => t.low));
  const high = Math.max(...tables.map((t) => t.high));
  const count = tables.reduce((total, t) => total + t.n, 0);
  const marks = tables.map((t) => tableMark(t.mark)).join('');
  return (
    `<span class="prefix-range">${low === high ? dec(low) : `${dec(low)}–${dec(high)}`}</span>` +
    badge(count) +
    (marks ? `<span class="prefix-marks">${marks}</span>` : '')
  );
}

/**
 * The cell's own text: the prefix byte, then the range behind it.
 *
 * The per-table figures ride along in an attribute so the client can rebuild
 * that line when the reader turns a table on or off — reference-typed strings
 * is dormant and hidden by default, and 0xFB should say 0–38 then and 0–183
 * when it is shown.
 */
function cellText(op: Opcode, sections: Section[], opcodes: Opcode[]): string {
  const ids = op.prefixFor ?? [];
  // What the page arrives showing: everything except the encodings that are
  // superseded, abandoned or dormant, which is the default filter.
  const shown = ids
    .map((id) => {
      const section = sections.find((s) => s.id === id);
      if (!section) return null;
      const ops = opcodes.filter(
        (o) => o.section === id && o.name && !HISTORICAL.includes(o.status),
      );
      return prefixTable(id, section.mark ?? '', ops);
    })
    .filter((entry): entry is PrefixTable => entry !== null)
    .sort((a: PrefixTable, b: PrefixTable) => a.low - b.low);

  // Only the identities travel in the markup; the figures are recomputed in the
  // browser from the filters in force there.
  const behind = ids
    .map((id) => ({ id, mark: sections.find((s) => s.id === id)?.mark ?? '' }))
    .sort(
      (a, b) =>
        (sections.find((s) => s.id === a.id)?.start ?? 0) -
        (sections.find((s) => s.id === b.id)?.start ?? 0),
    );

  return (
    `<span class="prefix-cell" data-tables="${esc(JSON.stringify(behind))}">` +
    `<span class="prefix-byte op-hex">0x${op.bytes[0]!.toString(16).toUpperCase()}</span>` +
    `<span class="prefix-line">${prefixLine(shown)}</span>` +
    `</span>`
  );
}

/** One list entry per proposal represented in a run, with the range it covers. */
function proposalList(ops: Opcode[]): string {
  const byProposal = new Map<string, Opcode[]>();
  for (const op of ops) {
    if (!op.proposal) continue;
    let bucket = byProposal.get(op.proposal);
    if (!bucket) byProposal.set(op.proposal, (bucket = []));
    bucket.push(op);
  }

  const entries = [...byProposal]
    .map(([id, group]) => ({ p: proposal(id), group }))
    .filter((entry) => entry.p)
    .sort((a, b) => Math.min(...a.group.map((o) => o.code)) - Math.min(...b.group.map((o) => o.code)))
    .map(
      ({ p, group }) =>
        `<li><a href="${esc(p!.url)}">${esc(p!.name)}</a> — ${range(group)}, ` +
        `${group.length} instruction${group.length > 1 ? 's' : ''}</li>`,
    );

  return entries.length ? `<ul>${entries.join('')}</ul>` : '';
}

/**
 * The generated half of a doorway byte's description: where it leads, what is
 * behind it now, and — folded away — what used to be.
 *
 * The superseded encodings are in a `<details>` because they answer a different
 * question. "What is this byte for" is asked far more often than "what did
 * these bytes once mean", and the second answer is longer than the first.
 */
function describe(op: Opcode, sections: Section[], opcodes: Opcode[]): string {
  const mine = (op.prefixFor ?? []).flatMap((id) =>
    opcodes.filter((o) => o.section === id && o.name),
  );
  const current = live(mine);
  const past = mine.filter((o) => HISTORICAL.includes(o.status));

  const tables = (op.prefixFor ?? [])
    .map((id) => {
      const section = sections.find((s) => s.id === id);
      const ops = live(opcodes.filter((o) => o.section === id));
      if (!section || !ops.length) return '';
      return (
        `<li><a href="#${esc(section.anchor)}">` +
        `${markedTitle(section)}</a> — sub-opcodes ${range(ops)}, ${badge(ops.length)}</li>`
      );
    })
    .filter(Boolean);

  const parts: string[] = [];
  if (tables.length) {
    parts.push(
      `<p>${tables.length > 1 ? 'The tables' : 'The table'} this prefix opens:</p>`,
      `<ul class="prefix-tables">${tables.join('')}</ul>`,
    );
  }

  const now = proposalList(current);
  if (now) parts.push(`<p>Proposals in this range:</p>${now}`);

  const then = proposalList(past);
  if (then) {
    parts.push(
      `<details class="prefix-past"><summary>Superseded, abandoned and dormant encodings ` +
        `(${past.length})</summary>${then}</details>`,
    );
  }

  return parts.join('');
}

/**
 * Fills in the derived half of every doorway byte. Run once, over the whole
 * dataset, because a prefix cell is a statement about tables that live in other
 * files.
 */
export function describePrefixes(data: OpcodeData): void {
  for (const op of data.opcodes) {
    if (!op.prefixFor?.length) continue;
    op.displayName = cellText(op, data.sections, data.opcodes);
    op.description = (op.description ?? '') + describe(op, data.sections, data.opcodes);
  }
}
