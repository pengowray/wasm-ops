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

/** `0xFD 0x80 0x02` — the bytes as they appear in the module. */
export function byteSequence(op: Opcode): string {
  return op.bytes.map((b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/**
 * How an instruction is encoded, spelled out.
 *
 * The old page compressed this into `0xFB, LEB(0x14) = 0x14`, which asks the
 * reader to already know that the second number is a sub-opcode, that LEB means
 * LEB128, and why a function of a value would equal itself. Broken into named
 * rows, each part says what it is, and the LEB128 step is only shown when it
 * actually changes the bytes.
 */
export function renderEncoding(op: Opcode): string {
  const rows: string[] = [];
  const code = (text: string) => `<code>${text}</code>`;

  if (!op.prefix) {
    // A single-byte instruction is its own byte sequence; there is no second
    // row to add that would not just repeat the first.
    rows.push(row('Opcode byte', code('0x' + toHex(op.code)), `${op.code} in decimal`));
    return `<h4>Encoding</h4><table class="encoding">${rows.join('')}</table>`;
  }
  {
    rows.push(row('Prefix byte', code('0x' + op.prefix), 'says which extension follows'));

    const sub = '0x' + toHex(op.code);
    rows.push(row('Sub-opcode', code(sub), `${op.code} in decimal`));

    const encoded = op.bytes.slice(1);
    const encodedHex = encoded
      .map((b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    rows.push(
      row(
        `${code(`to_LEB(${sub})`)}`,
        code(encodedHex),
        encoded.length > 1
          ? `the sub-opcode is above 127, so LEB128 spreads it over ${encoded.length} bytes`
          : 'unchanged: values below 128 encode as a single byte',
      ),
    );
  }

  rows.push(row('Byte sequence', code(byteSequence(op))));

  return `<h4>Encoding</h4><table class="encoding">${rows.join('')}</table>`;
}

function row(label: string, value: string, note?: string): string {
  return (
    `<tr><th scope="row">${label}</th><td>${value}` +
    (note ? `<span class="encoding-note">${note}</span>` : '') +
    `</td></tr>`
  );
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

/**
 * The full description for one opcode. Rendered once into a hidden block; the
 * detail panel clones from there rather than refetching, and readers without
 * JavaScript reach it by following the cell's link.
 */
export function renderDetail(op: Opcode): string {
  const rows: string[] = [];

  rows.push(`<p class="detail-bytes"><code>${byteSequence(op)}</code></p>`);

  const heading = op.displayName ?? (op.name ? escapeHtml(op.name) : '<em>Unassigned</em>');
  rows.push(
    `<h3 class="detail-name">${heading}` +
      (op.immediateArgs ? ` <span class="immediate-args">${op.immediateArgs}</span>` : '') +
      `</h3>`,
  );

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

  rows.push(renderEncoding(op));

  return (
    `<article class="detail" id="detail-${op.id}" data-key="${op.id}">` +
    rows.join('\n') +
    `</article>`
  );
}
