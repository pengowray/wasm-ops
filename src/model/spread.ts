/**
 * Where a proposal's instructions actually landed.
 *
 * Most proposals fill a run of one table and the chart shows that by putting
 * them next to each other. Four do not. Shared-everything threads is 35
 * instructions at the top of the threads table plus a single one in the middle
 * of the GC table; half precision is two in the 0xFC table and 35 at the far end
 * of the vector extensions. Reading the chart, those look like two unrelated
 * things with the same name, and there is nothing on the page that says
 * otherwise — the status section named the proposal and stopped.
 *
 * So where a proposal reaches into more than one table, its status says so, and
 * gives the byte ranges. A single table needs no such note: the reader is
 * looking at it.
 */

import { proposal } from './proposals.ts';
import type { Opcode, OpcodeData, Section } from './types.ts';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The opcodes of one proposal inside one table, written the way the page writes
 * an opcode: a prefix in hex and sub-opcodes in decimal, or a plain byte where
 * there is no prefix.
 */
function reach(section: Section, ops: Opcode[]): string {
  const low = Math.min(...ops.map((op) => op.code));
  const high = Math.max(...ops.map((op) => op.code));
  if (!section.prefix) {
    const one = (code: number) => `<span class="op-hex">0x${code.toString(16).toUpperCase()}</span>`;
    return low === high ? one(low) : `${one(low)}–${one(high)}`;
  }
  const value =
    low === high
      ? `<span class="op-dec">${low}</span>`
      : `<span class="op-dec">${low}</span>–<span class="op-dec">${high}</span>`;
  return `<span class="op-hex">0x${section.prefix}</span> ${value}`;
}

/**
 * A fragment of HTML per proposal that straddles tables, ready to drop into its
 * status section. Proposals confined to one table are absent rather than
 * present and empty, so the caller cannot accidentally render a note saying a
 * proposal is in exactly the place the reader is standing.
 */
export function proposalSpread(data: OpcodeData): Map<string, string> {
  const byProposal = new Map<string, Opcode[]>();
  for (const op of data.opcodes) {
    if (!op.name || !op.proposal) continue;
    let bucket = byProposal.get(op.proposal);
    if (!bucket) byProposal.set(op.proposal, (bucket = []));
    bucket.push(op);
  }

  const out = new Map<string, string>();
  for (const [id, ops] of byProposal) {
    if (!proposal(id)) continue;
    const sections = data.sections
      .map((section) => ({ section, ops: ops.filter((op) => op.section === section.id) }))
      .filter((entry) => entry.ops.length);
    if (sections.length < 2) continue;

    const items = sections
      .map(
        ({ section, ops: group }) =>
          `<li><a href="#${esc(section.anchor)}">` +
          (section.emoji ? `${section.emoji} ` : '') +
          `${esc(section.title)}</a> — ${reach(section, group)}, ` +
          `${group.length} instruction${group.length > 1 ? 's' : ''}</li>`,
      )
      .join('');

    out.set(
      id,
      `<p class="history-spread-lede">Encoded across ${sections.length} tables:</p>` +
        `<ul class="history-spread">${items}</ul>`,
    );
  }
  return out;
}
