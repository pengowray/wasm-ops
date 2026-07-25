/**
 * Checks the extracted data against the legacy page.
 *
 * The extraction reshuffles markup — immediate-args move out of the body, the
 * stack signature is lifted out of its span, paragraphs get rebalanced — so
 * comparing HTML would be noise. What must not change is the *text a reader
 * sees*, so that is what this compares, as a word multiset per opcode.
 *
 *   npm run verify
 *
 * Exits non-zero on any loss, so CI can gate on it.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'node-html-parser';
import { opcodeBytes, opcodeId } from '../src/model/types.ts';
import type { Opcode } from '../src/model/types.ts';
import { loadData } from '../src/model/load.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LEGACY = join(ROOT, 'data', '.legacy-help.json');

/**
 * Visible text as a word list.
 *
 * Tags become spaces rather than being elided, so `<h3>Stack:</h3><span>[i32]`
 * tokenises as two words instead of the single glued `Stack:[i32]`. The two
 * section headings are then dropped from both sides: in the new model they are
 * field names, not content.
 */
function words(html: string): string[] {
  const spaced = html.replace(/<[^>]+>/g, ' ');
  const text = parse(spaced).textContent // decodes entities
    .replace(/ /g, ' ')
    .replace(/Followed by:|Stack:/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length ? text.split(' ') : [];
}

function multiset(list: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of list) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

/** Words in `a` that `a` has more of than `b`. */
function missing(a: string[], b: string[]): string[] {
  const have = multiset(b);
  const out: string[] = [];
  for (const [word, count] of multiset(a)) {
    const short = count - (have.get(word) ?? 0);
    for (let i = 0; i < short; i++) out.push(word);
  }
  return out;
}

/** Everything the new model would render into an opcode's detail pane. */
function renderedText(op: Opcode): string[] {
  return words(
    [
      op.immediateArgs ?? '',
      op.followedBy ?? '',
      op.stack?.html ?? '',
      op.stack?.note ?? '',
      op.description ?? '',
    ].join(' '),
  );
}

function main(): void {
  const data = loadData();
  const failures: string[] = [];
  const warnings: string[] = [];

  // --- structural invariants ---------------------------------------------
  const seen = new Set<string>();
  for (const op of data.opcodes) {
    if (seen.has(op.id)) failures.push(`duplicate opcode id ${op.id}`);
    seen.add(op.id);

    const expectedId = opcodeId(op.prefix, op.code);
    if (op.id !== expectedId) {
      failures.push(`${op.id}: id does not match prefix/code (expected ${expectedId})`);
    }
    const expectedBytes = opcodeBytes(op.prefix, op.code);
    if (op.bytes.join(',') !== expectedBytes.join(',')) {
      failures.push(
        `${op.id}: bytes ${op.bytes.join(' ')} do not match encoding ${expectedBytes.join(' ')}`,
      );
    }
    if (op.status === 'reserved' && op.name) {
      failures.push(`${op.id}: reserved but has a name (${op.name})`);
    }
    if (op.status !== 'reserved' && !op.name) {
      failures.push(`${op.id}: ${op.status} but has no name`);
    }
  }

  // Every section's cells must be contiguous from its declared start.
  for (const section of data.sections) {
    const ops = data.opcodes.filter((o) => o.section === section.id);
    if (ops.length !== section.count) {
      failures.push(`${section.id}: ${ops.length} opcodes but count says ${section.count}`);
    }
    ops.forEach((op, i) => {
      if (op.code !== section.start + i) {
        failures.push(`${section.id}: opcode at index ${i} has code ${op.code}`);
      }
    });
  }

  // --- content preservation ----------------------------------------------
  if (!existsSync(LEGACY)) {
    warnings.push(
      'data/.legacy-help.json is absent, so content was not diffed against the ' +
        'old page. Run `npm run extract` if you still need that comparison.',
    );
  } else {
    const legacy: Record<string, string> = JSON.parse(readFileSync(LEGACY, 'utf8'));
    const byId = new Map(data.opcodes.map((o) => [o.id, o]));
    let compared = 0;

    for (const [id, raw] of Object.entries(legacy)) {
      const op = byId.get(id);
      if (!op) {
        failures.push(`legacy help ${id} has no matching opcode`);
        continue;
      }
      compared++;
      const lost = missing(words(raw), renderedText(op));
      if (lost.length) {
        failures.push(`${id} (${op.name}): dropped ${lost.length} word(s): ${lost.join(' ')}`);
      }
    }
    console.log(`compared ${compared} help fragments against the legacy page`);
  }

  // --- report -------------------------------------------------------------
  console.log(
    `${data.opcodes.length} opcodes across ${data.sections.length} sections; ` +
      `${data.opcodes.filter((o) => o.name).length} named, ` +
      `${data.opcodes.filter((o) => o.description).length} with prose`,
  );

  for (const warning of warnings) console.warn(`warn: ${warning}`);

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const failure of failures.slice(0, 60)) console.error(`  ${failure}`);
    if (failures.length > 60) console.error(`  … and ${failures.length - 60} more`);
    process.exit(1);
  }
  console.log('ok');
}

main();
