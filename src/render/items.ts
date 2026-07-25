/**
 * Markup for the individual pieces of the chart.
 *
 * These are plain string functions with no DOM or Node dependencies, so the
 * build uses them to emit the static page and the client uses them to create
 * headings when the layout changes. One implementation, one output.
 */

import type { Opcode } from '../model/types.ts';
import { toHex } from '../model/types.ts';
import { addWordBreaks } from '../model/names.ts';
import { categorize } from '../model/categories.ts';
import type { ViewItem } from '../model/view.ts';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A byte as a bare uppercase pair, the usual convention for a byte dump.
 * Reserving the `0x` form for single values lets the notation itself say which
 * is which: `0xE8` is a number, `E8 01` is a run of bytes.
 */
function hexByte(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * How an instruction is encoded.
 *
 * Shows the actual bytes once, split into their parts with a caption under
 * each, so the correspondence is visible rather than described. Reading it
 * should not require reading it: the shape says which byte is the prefix and
 * which bytes carry the sub-opcode.
 *
 * Everything is hex except one place. A sub-opcode is a u32, not a byte, and
 * writing it in two bases side by side invites transposing them — `232` and
 * `0xE8` do not look like the same number, so nothing catches it if they drift
 * apart. Decimal therefore appears only in the spec-notation line, where the
 * `:u32` tag says what it is. That line is how the binary format section of the
 * specification writes the instruction, so it is also the form to search for.
 */
export function renderEncoding(op: Opcode): string {
  const groups: string[] = [];

  if (!op.prefix) {
    groups.push(group(hexByte(op.code), 'opcode byte'));
    return wrap(groups.join(''), '');
  }

  groups.push(group(op.prefix, 'prefix byte', 'prefix'));

  const encoded = op.bytes.slice(1);
  groups.push(
    group(
      encoded.map(hexByte).join(' '),
      `sub-opcode <code>0x${toHex(op.code)}</code>` +
        `<span class="enc-sub">${
          encoded.length > 1 ? `LEB128, ${encoded.length} bytes` : 'LEB128'
        }</span>`,
      'sub',
    ),
  );

  const spec = `<code>0x${op.prefix} ${op.code}:u32</code>`;
  return wrap(groups.join(''), `<p class="enc-spec">Specification notation: ${spec}</p>`);
}

function group(bytes: string, caption: string, part = 'opcode'): string {
  return (
    `<span class="enc-group" data-part="${part}">` +
    `<span class="enc-bytes">${bytes}</span>` +
    `<span class="enc-caption">${caption}</span>` +
    `</span>`
  );
}

function wrap(groups: string, footer: string): string {
  return `<h4>Encoding</h4><div class="encoding"><div class="enc-row">${groups}</div>${footer}</div>`;
}

/**
 * The instruction name, split into its parts so each can be styled and so long
 * names get sensible break opportunities.
 *
 * The `.op` and `.post` spans carry a CSS-generated newline, which renders as a
 * line break but is not picked up when the text is copied — so copying a cell
 * still yields `i64.load16_u` on one line.
 */
export function renderName(op: Opcode): string {
  if (op.displayName) return `<span class="op">${op.displayName}</span>`;
  if (!op.name) return '';

  const parts = op.parts;
  if (!parts || (!parts.pre && !parts.mainop)) {
    return `<span class="op">${addWordBreaks(escapeHtml(op.name))}</span>`;
  }

  let html = '';
  if (parts.pre) {
    html += `<span class="pre">${addWordBreaks(escapeHtml(parts.pre))}.</span>`;
  }
  if (parts.relaxed) html += `<span class="relaxed"><wbr>relaxed.</span>`;
  if (parts.mainop || parts.opbits) {
    const text = (parts.mainop ?? '') + (parts.opbits ?? '');
    html += `<span class="op">${addWordBreaks(escapeHtml(text))}</span>`;
  }
  const tail = [parts.post, parts.sign, parts.rest].filter(Boolean).join('_');
  if (tail) {
    html += `<span class="post">${escapeHtml('_' + tail).replace(/_/g, '<wbr>_')}</span>`;
  }
  return html;
}

/** Attributes that let the highlight logic select related cells with plain CSS. */
function cellData(op: Opcode): string {
  const attrs: Record<string, string | undefined> = {
    'data-key': op.id,
    'data-section': op.section,
    'data-status': op.status,
    'data-cat': categorize(op),
    'data-pre': op.parts?.pre,
    'data-op': op.parts?.mainop,
    'data-bits': op.parts?.opbits,
    'data-post': op.parts?.post,
    'data-sign': op.parts?.sign,
  };
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => ` ${name}="${escapeHtml(value!)}"`)
    .join('');
}

/**
 * Whether an opcode has anything worth writing a detail section for. An
 * unassigned slot does not: saying "0xA7 is unassigned" 234 times costs more
 * than it tells anyone, and the panel can state it without help.
 */
export function hasDetail(op: Opcode): boolean {
  return Boolean(
    op.name || op.description || op.stack || op.followedBy || op.immediateArgs || op.linkTo,
  );
}

export function renderCell(op: Opcode, filtered = false): string {
  // A documented cell is a link to its own detail section. With JavaScript that
  // opens the side panel; without it, the link still navigates to the full
  // description. Unassigned slots have no target, so they are inert.
  const inner = op.linkTo
    ? op.linkTo.map((l) => `<a class="jump" href="${escapeHtml(l.href)}">${l.label}</a>`).join('')
    : renderName(op);

  const linkable = hasDetail(op) && !op.linkTo;
  const tag = linkable ? 'a' : 'div';
  const href = linkable ? ` href="#detail-${op.id}"` : '';
  const hidden = filtered ? ' data-filtered="1"' : '';
  const label = op.name ? ` aria-label="${escapeHtml(`${op.id} ${op.name}`)}"` : '';

  return (
    `<${tag} class="cell"${href}${cellData(op)}${hidden}${label}>` +
    `<span class="cell-hex">${escapeHtml(op.id)}</span>` +
    `<span class="cell-name">${inner}</span>` +
    `</${tag}>`
  );
}

export function renderItem(item: ViewItem): string {
  switch (item.kind) {
    case 'group':
      return (
        `<h2 class="group" data-key="${escapeHtml(item.key)}" id="${escapeHtml(item.anchor)}">` +
        (item.emoji ? `<span class="group-emoji">${item.emoji}</span> ` : '') +
        `${escapeHtml(item.label)} <span class="group-count">${item.count}</span>` +
        (item.intro ? `<span class="group-intro">${item.intro}</span>` : '') +
        `</h2>`
      );
    case 'corner':
      return `<div class="corner" data-key="${escapeHtml(item.key)}" aria-hidden="true"></div>`;
    case 'colhead':
      return `<div class="colhead" data-key="${escapeHtml(item.key)}">${escapeHtml(item.label)}</div>`;
    case 'rowhead':
      return `<div class="rowhead" data-key="${escapeHtml(item.key)}">${escapeHtml(item.label)}</div>`;
    case 'cell':
      return renderCell(item.op, item.filtered ?? false);
  }
}

/** The opcode's name as a panel heading, with its immediate operands. */
export function renderHeading(op: Opcode): string {
  const name = op.displayName ?? (op.name ? escapeHtml(op.name) : '<em>Unassigned</em>');
  return (
    `<h3 class="detail-name">${name}` +
    (op.immediateArgs ? ` <span class="immediate-args">${op.immediateArgs}</span>` : '') +
    `</h3>`
  );
}

/**
 * The written description of one opcode — the part that cannot be derived and
 * so has to be shipped. The byte sequence and encoding breakdown are not here:
 * they follow from the prefix and code, and baking 630 copies of the same table
 * into the page would be repeating what the client can work out.
 */
export function renderDetail(op: Opcode): string {
  const rows: string[] = [renderHeading(op)];

  if (op.status === 'proposal') {
    rows.push(`<p class="detail-status"><em>Proposal</em></p>`);
  }

  if (op.description) rows.push(op.description);

  if (op.followedBy) {
    rows.push(`<h4>Followed by</h4><div class="detail-followed">${op.followedBy}</div>`);
  }

  if (op.stack) {
    const cls = op.stack.large ? 'op-type large' : 'op-type';
    rows.push(
      `<h4>Stack</h4><p><span class="${cls}">${op.stack.html}</span></p>` +
        (op.stack.note ? `<div class="detail-stack-note">${op.stack.note}</div>` : ''),
    );
  }

  return (
    `<article class="detail" id="detail-${op.id}" data-key="${op.id}">` +
    rows.join('\n') +
    `</article>`
  );
}
