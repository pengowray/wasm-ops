/**
 * One-time (and re-runnable) extraction of the legacy hand-written page into
 * structured data files.
 *
 * The legacy page stores an opcode's byte value in the *position* of its table
 * cell, and its documentation in a detached `<div id="0x..">` inside a
 * `display:none` block. This script makes both explicit.
 *
 *   npm run extract
 *
 * It is idempotent and safe to re-run, but once data/ is being edited by hand
 * it should not be — `npm run verify` is the ongoing check, not this.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, type HTMLElement } from 'node-html-parser';
import { chopUp } from '../src/model/names.ts';
import { legacyHexId, opcodeBytes, opcodeId } from '../src/model/types.ts';
import type { Opcode, OpcodeStatus, Section, SectionId } from '../src/model/types.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SOURCE = join(ROOT, 'docs', 'index.html');
const OUT_DIR = join(ROOT, 'data');

/**
 * Which legacy table maps to which section, and where its numbering starts.
 *
 * The legacy page split 0xFB and 0xFD across two tables each, and the ids of
 * the two extra halves are not section ids any more — the chart merged each
 * pair into the one table its prefix actually addresses. They are still what
 * this script reads, since it reads the old page, so the id is widened here and
 * narrowed again on the way into an opcode. Anything extracted under one of
 * them has to be folded into its sibling by hand, which is what was done once
 * and is why this script is not for re-running.
 */
type LegacyId = SectionId | 'stringref' | 'simd-ext';

interface SectionSpec extends Omit<Section, 'id'> {
  id: LegacyId;
  tableId: string;
}

/*
 * No marks here. The legacy page had an emoji per table, chosen when the tables
 * were named after proposals; the chart letters them instead, and which letter
 * a table gets is a decision about today's five tables rather than about the
 * seven this script reads.
 */
const SECTIONS: SectionSpec[] = [
  {
    id: 'core', tableId: 'opcodes', anchor: 'core', title: 'Core instructions', prefix: '', start: 0, count: 0,
    intro: 'Single-byte instructions.',
  },
  {
    id: 'gc', tableId: 'opcodes_FB', anchor: 'gc', title: 'GC Proposal', prefix: 'FB', start: 0, count: 0,
    intro: 'Proposal to add garbage collection (GC) support.',
  },
  {
    id: 'stringref', tableId: 'opcodes_FB_strings', anchor: 'strings', title: 'Reference-Typed Strings Proposal',
    prefix: 'FB', start: 0x80, count: 0,
    intro: 'This is a phase 1 proposal and may change in future. [As of 2022]',
  },
  {
    id: 'fc', tableId: 'opcodes_FC', anchor: 'fc', title: 'FC extensions', prefix: 'FC', start: 0, count: 0,
    intro: 'Multibyte instructions beginning with 0xFC.',
  },
  {
    id: 'simd', tableId: 'opcodes_FD', anchor: 'simd', title: 'SIMD opcodes (Vector instructions)',
    prefix: 'FD', start: 0, count: 0,
    intro: 'SIMD (single instruction, multiple data) instructions begin with 0xFD.',
  },
  {
    id: 'simd-ext', tableId: 'opcodes_FD1', anchor: 'simd-ext', title: 'Vector extensions',
    prefix: 'FD', start: 0x100, count: 0,
    intro: 'Relaxed SIMD prototype opcodes.',
  },
  {
    id: 'threads', tableId: 'opcodes_FE', anchor: 'threads', title: 'Threads', prefix: 'FE', start: 0, count: 0,
    intro: 'Multibyte instructions beginning with 0xFE.',
  },
];

// ---------------------------------------------------------------------------
// Help-fragment parsing
// ---------------------------------------------------------------------------

/** Drops `</p>` with no opener and `<p>` with no closer, left over by splitting. */
function balanceParagraphs(html: string): string {
  let depth = 0;
  let out = '';
  const re = /<\/?p\b[^>]*>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    out += html.slice(last, match.index);
    last = match.index + match[0].length;
    if (match[0].startsWith('</')) {
      if (depth > 0) { depth--; out += match[0]; }
      // else: orphan close tag, drop it
    } else {
      depth++;
      out += match[0];
    }
  }
  out += html.slice(last);
  // Any still-open paragraphs get closed.
  return out + '</p>'.repeat(depth);
}

/**
 * Normalises source-formatting noise: CRLF line endings and the tab
 * indentation the fragments were hand-written with. The help fragments contain
 * no `<pre>` or `<textarea>`, so no whitespace here is significant.
 */
function tidy(html: string): string {
  return html
    .replace(/\r\n?/g, '\n')
    .replace(/<p>\s*<\/p>/gi, '')
    .split('\n')
    .map((line) => line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

type HelpParts = Pick<Opcode, 'immediateArgs' | 'followedBy' | 'stack' | 'description'>;

/**
 * Splits a legacy help fragment into structured fields.
 *
 * The fragments are written as `<p><h3>Stack:</h3>…</p>`, which is not valid
 * HTML — a `<h3>` implicitly closes the `<p>`. Rather than depend on how a
 * given parser recovers from that, this works on the raw string and repairs
 * paragraph nesting afterwards.
 */
function parseHelp(inner: string): HelpParts {
  const result: HelpParts = {};
  let html = inner;

  // The immediate-args span is displayed beside the opcode name, not in the body.
  const immRe = /<span class=["']?immediate-args["']?>([\s\S]*?)<\/span>/i;
  const imm = immRe.exec(html);
  if (imm) {
    result.immediateArgs = imm[1]!.trim();
    html = html.replace(immRe, '');
  }

  // Drop the bogus `<p>` that opens immediately before a heading, so each
  // heading starts its own segment cleanly.
  html = html.replace(/<p>\s*(?=<h3>)/gi, '');

  const parts = html.split(/<h3>\s*(Followed by:|Stack:)\s*<\/h3>/i);
  const lead = tidy(balanceParagraphs(parts[0] ?? ''));
  const extra: string[] = [];

  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i]!.toLowerCase();
    const body = tidy(balanceParagraphs(parts[i + 1] ?? ''));
    if (heading.startsWith('followed')) {
      result.followedBy = body;
    } else {
      // The stack signature lives in an `.op-type` span, which itself often
      // contains nested `.supsub` spans — so this needs real parsing, not a
      // lazy regex that would stop at the first inner `</span>`.
      const fragment = parse(body);
      const span = fragment.querySelector('.op-type');
      if (span) {
        result.stack = {
          html: tidy(span.innerHTML),
          ...(span.classList.contains('large') ? { large: true } : {}),
        };
        span.remove();
        const note = tidy(fragment.innerHTML)
          .replace(/<br\s*\/?>/gi, '')
          .trim();
        if (note) result.stack.note = note;
      } else if (body) {
        result.stack = { html: body };
      }
    }
  }

  const description = tidy([lead, ...extra].filter(Boolean).join('\n'));
  if (description) result.description = description;
  return result;
}

// ---------------------------------------------------------------------------
// Table parsing
// ---------------------------------------------------------------------------

function cellName(cell: HTMLElement): { raw: string; fromAttribute: boolean } {
  const attr = cell.getAttribute('opcode');
  if (attr && attr.trim() !== '') return { raw: attr, fromAttribute: true };
  return { raw: cell.textContent, fromAttribute: false };
}

function classify(raw: string): { name: string | null; status: OpcodeStatus } {
  const text = raw.trim();
  // `\xa0` is the `&nbsp;` the legacy page used to mark an unassigned slot.
  if (text === '' || text.startsWith(' ') || text.startsWith('&')) {
    return { name: null, status: 'reserved' };
  }
  if (text.startsWith('*')) {
    return { name: text.slice(1).trim(), status: 'proposal' };
  }
  return { name: text, status: 'standard' };
}

/**
 * Escapes stray angle brackets inside `<code>` elements.
 *
 * The legacy page contains `<code>fn f32x4_replace_lane<const N: usize>…</code>`.
 * A parser reads `<const N: usize>` as an unclosed tag, which swallows the rest
 * of the surrounding block — the 0xFD20 help fragment is lost this way on the
 * live site too. Repairing it here keeps the content.
 */
function repairCodeBlocks(source: string): string {
  let repaired = 0;
  const out = source.replace(/<code>([\s\S]*?)<\/code>/g, (whole, inner: string) => {
    const cleaned = inner
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (cleaned === inner) return whole;
    repaired++;
    return `<code>${cleaned}</code>`;
  });
  if (repaired) console.log(`repaired ${repaired} <code> block(s) with unescaped markup`);
  return out;
}

function main(): void {
  const source = repairCodeBlocks(readFileSync(SOURCE, 'utf8'));
  const doc = parse(source, { comment: false });

  // --- help fragments -----------------------------------------------------
  const help = new Map<string, HelpParts>();
  const helpRaw = new Map<string, string>();
  for (const div of doc.querySelectorAll('div[id]')) {
    const id = div.getAttribute('id')!;
    if (!/^0x[0-9A-Fa-f]+$/.test(id)) continue;
    if (help.has(id)) console.warn(`  ! duplicate help fragment for ${id}`);
    helpRaw.set(id, div.innerHTML);
    help.set(id, parseHelp(div.innerHTML));
  }
  console.log(`help fragments: ${help.size}`);

  // --- tables -------------------------------------------------------------
  const usedHelp = new Set<string>();
  let totalCells = 0;

  mkdirSync(OUT_DIR, { recursive: true });

  for (const spec of SECTIONS) {
    const table = doc.querySelector(`#${spec.tableId}`);
    if (!table) throw new Error(`table #${spec.tableId} not found`);
    const cells = table.querySelectorAll('td');
    totalCells += cells.length;

    const opcodes: Opcode[] = [];
    cells.forEach((cell, index) => {
      const code = spec.start + index;
      const id = opcodeId(spec.prefix, code);
      const { raw, fromAttribute } = cellName(cell);
      const { name, status } = classify(raw);

      const op: Opcode = {
        id,
        section: spec.id as SectionId,
        prefix: spec.prefix,
        code,
        bytes: opcodeBytes(spec.prefix, code),
        name,
        status,
      };

      // The four prefix-byte cells in the core table are navigation, not
      // instructions: they carry links to the sub-tables.
      if (fromAttribute) {
        const links = cell.querySelectorAll('a').map((a) => ({
          label: a.textContent.trim(),
          href: a.getAttribute('href') ?? '',
        }));
        if (links.length) op.linkTo = links;
        const display = cell.getAttribute('displayOpcode');
        if (display) op.displayName = display;
      }

      if (name) {
        const parts = chopUp(name);
        if (Object.keys(parts).length) op.parts = parts;
      }

      // The legacy page keyed its help divs by the old concatenated hex id.
      const fragment = help.get(legacyHexId(spec.prefix, code));
      if (fragment) {
        usedHelp.add(legacyHexId(spec.prefix, code));
        Object.assign(op, fragment);
      }

      opcodes.push(op);
    });

    const section: Section = { ...spec, id: spec.id as SectionId, count: cells.length };
    delete (section as Partial<SectionSpec>).tableId;

    const file = join(OUT_DIR, `${spec.id}.json`);
    writeFileSync(file, JSON.stringify({ section, opcodes }, null, 2) + '\n', 'utf8');

    const named = opcodes.filter((o) => o.name).length;
    const documented = opcodes.filter((o) => o.description || o.stack || o.followedBy).length;
    console.log(
      `${spec.id.padEnd(13)} ${String(cells.length).padStart(3)} cells, ` +
        `${String(named).padStart(3)} named, ${String(documented).padStart(3)} documented`,
    );
  }

  console.log(`\ntotal cells: ${totalCells}`);
  const orphans = [...help.keys()].filter((id) => !usedHelp.has(id));
  if (orphans.length) {
    console.warn(`\n! ${orphans.length} help fragments matched no cell:`);
    console.warn('  ' + orphans.join(', '));
  }

  // Keep the raw fragments around so `verify` can diff against them.
  writeFileSync(
    join(OUT_DIR, '.legacy-help.json'),
    JSON.stringify(Object.fromEntries(helpRaw), null, 2) + '\n',
    'utf8',
  );
}

main();
