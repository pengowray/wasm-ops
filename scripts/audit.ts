/**
 * Audits the opcode data against an external reference list.
 *
 *   npm run audit
 *
 * The data in data/ was inherited from a page last revised around 2022, and a
 * good deal has been standardised or renamed since. This compares it against a
 * vendored snapshot of wabt's opcode table (see reference/README.md) and
 * reports three kinds of disagreement:
 *
 *   missing   the reference has an instruction at a slot we leave blank
 *   extra     we name an instruction the reference does not have
 *   renamed   both have the slot, with different names
 *
 * It is a report, not a gate: the reference is a toolkit's view, not the
 * specification's, and it carries proposals at whatever stage wabt implements
 * them. Every difference needs a judgement, so nothing here edits data/.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadData } from '../src/model/load.ts';
import { HISTORICAL, opcodeId } from '../src/model/types.ts';
import type { Opcode } from '../src/model/types.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const REFERENCE = join(ROOT, 'reference', 'wabt-opcode.def');

interface RefOpcode {
  prefix: string;
  code: number;
  name: string;
}

/**
 * Parses wabt's opcode.def. Each entry is a C macro call whose last useful
 * fields are the prefix byte, the opcode, an enum name and the text-format
 * name:
 *
 *   WABT_OPCODE(I32, ___, I32, ___, ___, 4, 0xfe, 0x10, I32AtomicLoad, "i32.atomic.load", "")
 */
function parseReference(source: string): RefOpcode[] {
  const out: RefOpcode[] = [];
  const line =
    /WABT_OPCODE\s*\([^)]*?,\s*(0x[0-9a-f]+|0)\s*,\s*(0x[0-9a-f]+)\s*,\s*(\w+)\s*,\s*"([^"]*)"/gi;

  let match: RegExpExecArray | null;
  while ((match = line.exec(source)) !== null) {
    const prefixValue = parseInt(match[1]!, 16);
    const enumName = match[3]!;
    const name = match[4]!;
    // wabt lists a handful of internal pseudo-opcodes with no text name.
    if (!name) continue;
    // wabt's interpreter has its own opcodes — alloca, br_unless, drop_keep —
    // occupying 0xE0 upwards. They are an implementation detail of that
    // interpreter and are not WebAssembly instructions.
    if (enumName.startsWith('Interp')) continue;
    out.push({
      prefix: prefixValue === 0 ? '' : prefixValue.toString(16).toUpperCase(),
      code: parseInt(match[2]!, 16),
      name,
    });
  }
  return out;
}

/**
 * Sections a reference covers, keyed by prefix. 0xFB is included because the
 * GC encoding is supplied separately; the stringref proposal shares that
 * prefix from 0x80 up and is checked by neither, so it is excluded below.
 */
const COVERED = new Set(['', 'FB', 'FC', 'FD', 'FE']);

/**
 * Differences that have been looked at and are correct as they stand. Keeping
 * them here rather than deleting the check means a clean run says "nothing
 * unexplained", which is the only kind of clean run worth having.
 */
const ACCEPTED: Record<string, string> = {
  '0xD3':
    'ref.eq is a GC instruction and wabt implements no GC, so it is absent from ' +
    'that list. The specification puts it here.',
  '0x1C':
    'The typed select. The specification writes it `select t*`, wabt calls both ' +
    'forms `select` and distinguishes them by whether types follow.',
};

/**
 * Proposals the reference does not carry, so their instructions are expected to
 * be absent from it. Accepting by proposal rather than by opcode means adding
 * an instruction to one of these does not also mean adding a line here.
 */
const ACCEPTED_PROPOSALS: Record<string, string> = {
  'stack-switching': 'phase 3; wabt uses 0xE0+ for its own interpreter opcodes',
  'half-precision': 'phase 1; not implemented by wabt',
};

/** The GC list is authored from the proposal, since wabt carries no 0xFB. */
function loadGcReference(): RefOpcode[] {
  const file = JSON.parse(readFileSync(join(ROOT, 'reference', 'gc-opcodes.json'), 'utf8')) as {
    prefix: string;
    opcodes: { code: number; name: string }[];
  };
  return file.opcodes.map((entry) => ({ prefix: file.prefix, ...entry }));
}

function main(): void {
  const data = loadData();
  const reference = [...parseReference(readFileSync(REFERENCE, 'utf8')), ...loadGcReference()];

  const refById = new Map<string, RefOpcode>();
  for (const entry of reference) {
    refById.set(opcodeId(entry.prefix, entry.code), entry);
  }

  const ours = new Map<string, Opcode>();
  for (const op of data.opcodes) ours.set(op.id, op);

  let historical = 0;
  const acceptedBy = new Map<string, number>();
  const missing: string[] = [];
  const extra: string[] = [];
  const renamed: string[] = [];

  // Ours -> reference.
  // The stringref proposal also lives under 0xFB, from 0x80 up, and no
  // reference here covers it.
  const checked = (op: Opcode) => COVERED.has(op.prefix) && op.section !== 'stringref';

  for (const op of data.opcodes) {
    if (!checked(op)) continue;
    // The prefix-byte cells are navigation, not instructions.
    if (op.linkTo) continue;

    // Legacy and withdrawn encodings are recorded precisely because current
    // references no longer carry them; their absence is the expected result,
    // not a finding.
    if (HISTORICAL.includes(op.status)) {
      historical++;
      continue;
    }

    const ref = refById.get(op.id);
    const mismatched = op.name && (!ref || ref.name !== op.name);
    const reason =
      ACCEPTED[op.id] ??
      (op.proposal && ACCEPTED_PROPOSALS[op.proposal]
        ? `${op.proposal} — ${ACCEPTED_PROPOSALS[op.proposal]}`
        : undefined);
    if (mismatched && reason) {
      acceptedBy.set(reason, (acceptedBy.get(reason) ?? 0) + 1);
    } else if (op.name && !ref) {
      extra.push(`${op.id.padEnd(11)} ${op.name}  (${op.status})`);
    } else if (op.name && ref && ref.name !== op.name) {
      renamed.push(`${op.id.padEnd(11)} ours: ${op.name.padEnd(32)} ref: ${ref.name}`);
    }
  }

  // Reference -> ours.
  for (const entry of reference) {
    if (!COVERED.has(entry.prefix)) continue;
    const id = opcodeId(entry.prefix, entry.code);
    const op = ours.get(id);
    if (!op) {
      missing.push(`${id.padEnd(11)} ${entry.name}  (no such slot in our data)`);
    } else if (!op.name) {
      missing.push(`${id.padEnd(11)} ${entry.name}  (we show this slot as unassigned)`);
    }
  }

  const report = (title: string, lines: string[]) => {
    console.log(`\n== ${title} (${lines.length}) ==`);
    for (const line of lines) console.log(`  ${line}`);
  };

  console.log(
    `reference: ${reference.length} instructions; ` +
      `ours: ${data.opcodes.filter((o) => o.name && checked(o)).length} named ` +
      `in covered sections`,
  );

  report('In the reference, missing or unnamed here', missing);
  report('Named here, absent from the reference', extra);
  report('Named differently', renamed);
  report(
    'Differences already accounted for',
    [...acceptedBy].map(([reason, n]) => `${String(n).padStart(3)} × ${reason}`),
  );

  console.log(`\nSkipped: ${historical} legacy or withdrawn encodings, kept as history.`);

  const unexplained = missing.length + extra.length + renamed.length;
  console.log(
    unexplained
      ? `\n${unexplained} difference(s) need a decision.`
      : '\nNothing unexplained.',
  );

  const uncovered = data.opcodes.filter((o) => o.name && !checked(o)).length;
  console.log(
    `\nNot checked: ${uncovered} instructions with no reference — the stringref ` +
      `proposal, which no toolchain here implements.`,
  );
}

main();
