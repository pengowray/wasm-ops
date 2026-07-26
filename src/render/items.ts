/**
 * Markup for the individual pieces of the chart.
 *
 * These are plain string functions with no DOM or Node dependencies, so the
 * build uses them to emit the static page and the client uses them to create
 * headings when the layout changes. One implementation, one output.
 */

import type { Opcode } from '../model/types.ts';
import { toHex } from '../model/types.ts';
import { addWordBreaks, tokenise } from '../model/names.ts';
import { CATEGORY_LABELS, categorize } from '../model/categories.ts';
import { proposal, standing } from '../model/proposals.ts';
import { normaliseTag } from '../model/search.ts';
import { summarize } from '../model/summary.ts';
import { tagsFor, tagTokens } from '../model/tags.ts';
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
export function renderEncoding(op: Opcode, hasFollowedBy = false): string {
  const groups: string[] = [];

  if (op.prefixFor?.length) {
    // A doorway byte. Its encoding is the interesting thing about it — it is
    // the only cell in the chart whose whole meaning is "a number follows" —
    // so the slot that number goes in is drawn rather than described, as an
    // open-ended box in the sub-opcode's own colour and face.
    groups.push(group(hexByte(op.code), 'prefix byte', 'prefix'));
    groups.push(
      group(
        'n',
        'sub-opcode<span class="enc-sub">LEB128 u32, 1–5 bytes</span>',
        'subslot',
      ),
    );
  } else if (!op.prefix) {
    groups.push(group(hexByte(op.code), 'opcode byte'));
  } else {
    groups.push(group(op.prefix, 'prefix byte', 'prefix'));

    const encoded = op.bytes.slice(1);
    groups.push(
      group(
        encoded.map(hexByte).join(' '),
        `sub-opcode ${specValue(op.code)}` +
          `<span class="enc-sub">LEB128, ${encoded.length} byte${
            encoded.length > 1 ? 's' : ''
          }</span>`,
        'sub',
      ),
    );
  }

  // Immediate operands are part of how the instruction is encoded, so they
  // belong in this picture — but they are variable length and are described
  // rather than enumerated, hence the different treatment.
  if (op.immediateArgs) {
    groups.push(
      group(
        op.immediateArgs,
        'immediate operands' +
          (hasFollowedBy ? '<span class="enc-sub">see “Followed by”</span>' : ''),
        'imm',
      ),
    );
  }

  return `<h4>Encoding</h4><div class="encoding"><div class="enc-row">${groups.join('')}</div></div>`;
}

/*
 * One spelling of an opcode, used everywhere it appears — cells, the encoding
 * breakdown, the detail heading. A hex prefix and a decimal sub-opcode are
 * different kinds of number, so they get different colours, and those are the
 * same two colours the encoding breakdown tints its byte groups with. Once you
 * have learnt which is which in one place you have learnt it everywhere.
 */

/** The prefix byte: `0xFD`. */
function hexPart(text: string): string {
  return `<span class="op-hex">${text}</span>`;
}

/** The sub-opcode, in decimal, with the type tag that says it is not a byte. */
function decPart(code: number): string {
  return `<span class="op-dec">${code}</span><span class="op-utype">:u32</span>`;
}

function specValue(code: number): string {
  return decPart(code);
}

/** The full spec form of an instruction's opcode: `0xFD 263:u32`, or `0x28`. */
export function specLabel(op: Opcode): string {
  if (!op.prefix) return hexPart(`0x${toHex(op.code)}`);
  return `${hexPart(`0x${op.prefix}`)} ${decPart(op.code)}`;
}

/** The same, as plain text, for aria-labels and tooltips. */
export function specText(op: Opcode): string {
  return op.prefix ? `0x${op.prefix} ${op.code}:u32` : `0x${toHex(op.code)}`;
}

function group(bytes: string, caption: string, part = 'opcode'): string {
  return (
    `<span class="enc-group" data-part="${part}">` +
    `<span class="enc-bytes">${bytes}</span>` +
    `<span class="enc-caption">${caption}</span>` +
    `</span>`
  );
}

/**
 * Splits a drawn fragment into its words and the punctuation between them.
 *
 * The dots and underscores of a name belong to no one word — they join two —
 * so a highlight paints the words and leaves them alone. Without this, hovering
 * the `load` of `i64.load16_s` lit `.load`, and a name the parser could not
 * decompose at all, like `return_call_indirect`, lit as one unbroken block of
 * colour with its underscores in it.
 *
 * The `<wbr>` hints sit where `addWordBreaks` used to put them: after a dot,
 * before an underscore. That is where these names want to wrap.
 */
function renderFragment(text: string): string {
  return text
    .split(/([._ ])/)
    .filter(Boolean)
    .map((piece) => {
      if (piece === '.') return `<span class="part-sep">.</span><wbr>`;
      if (piece === '_') return `<wbr><span class="part-sep">_</span>`;
      // The space in `ref.test null`, which separates two words as much as an
      // underscore does and should no more be lit than one.
      if (piece === ' ') return `<span class="part-sep"> </span><wbr>`;
      return `<span class="part-word">${addWordBreaks(escapeHtml(piece))}</span>`;
    })
    .join('');
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
  // Not `.op`: that class carries the generated line break and the weight that
  // belong to a decomposed instruction name, and a doorway byte's cell is not
  // one — it is a small block of its own with its own arrangement.
  if (op.displayName) return `<span class="display-name">${op.displayName}</span>`;
  if (!op.name) return '';

  const tokens = tokenise(op.parts, op.name);
  return tokens
    .map((t, i) => {
      const cls = t.first ? t.role : `${t.role}-x`;
      // Between spans rather than inside them: the separators are where the
      // name wants to wrap, and each span is now one whole part.
      const wbr = i > 0 ? '<wbr>' : '';
      return (
        `${wbr}<span class="${cls}" data-p="${escapeHtml(t.token)}">` +
        `${renderFragment(t.text)}</span>`
      );
    })
    .join('');
}

/** The distinct tokens of a name, for matching a hovered part across cells. */
export function partTokens(op: Opcode): string {
  if (!op.name) return '';
  return [...new Set(tokenise(op.parts, op.name).map((t) => t.token))].join(' ');
}

/** Attributes that let the highlight logic select related cells with plain CSS. */
function cellData(op: Opcode): string {
  // As with its properties: the parts of `twobytefd.simd` are not parts of
  // anything, and relating this cell to every SIMD instruction because of them
  // answers a question nobody asked.
  if (op.prefixFor?.length) {
    return ` data-key="${op.id}" data-section="${op.section}" data-status="${op.status}"`;
  }
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
    'data-tags': op.name ? tagTokens(op) : undefined,
    'data-parts': op.name ? partTokens(op) : undefined,
    'data-proposal': op.proposal,
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
  const href = linkable ? ` href="#${op.id}"` : '';
  const hidden = filtered ? ' data-filtered="1"' : '';
  // A doorway byte's `name` is a placeholder from the old data — `twobytefb.gc`
  // — which is not something to read out. What it is, is a prefix.
  const spoken = op.prefixFor?.length
    ? `${specText(op)} prefix byte, a sub-opcode follows`
    : op.name
      ? `${specText(op)} ${op.name}`
      : '';
  const label = spoken ? ` aria-label="${escapeHtml(spoken)}"` : '';

  // The extra columns are only shown by the table layout, but they are written
  // here rather than injected later: a cell is rendered once at build time and
  // then only ever moved, which is what lets the animation follow it.
  const summary = summarize(op);
  const columns =
    `<span class="cell-summary">${summary ? escapeHtml(summary) : ''}</span>` +
    `<span class="cell-imm">${op.immediateArgs ?? ''}</span>` +
    `<span class="cell-stack">${op.stack?.html ?? ''}</span>` +
    `<span class="cell-cat">${op.name ? CATEGORY_LABELS[categorize(op)] : ''}</span>`;

  return (
    `<${tag} class="cell"${href}${cellData(op)}${hidden}${label}>` +
    `<span class="cell-hex">${specLabel(op)}</span>` +
    `<span class="cell-name">${inner}</span>` +
    columns +
    `</${tag}>`
  );
}

/** The proposals represented in a group, as chips that light up their own. */
function renderGroupProposals(ids: string[] | undefined): string {
  if (!ids?.length) return '';
  const chips = ids
    .map((id) => proposal(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map(
      (p) =>
        `<button type="button" class="tag" data-tag="from-${p.id}" data-kind="status" ` +
        `data-proposal="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`,
    )
    .join('');
  return chips ? `<span class="group-proposals">${chips}</span>` : '';
}

/**
 * A heading that is also its own property chip.
 *
 * A group heading names a property every instrument under it shares, which is
 * the same thing a chip in the panel names — so clicking it lights the same
 * cells, including the ones scrolled far away or in another section. Headings
 * for groupings that are not properties (the byte-grid sections) stay plain
 * text.
 */
function headingTag(label: string, tag: string | undefined): string {
  if (!tag) return escapeHtml(label);
  return (
    `<button type="button" class="tag heading-tag" data-tag="${escapeHtml(tag)}" ` +
    `data-kind="category" title="${escapeHtml(tagHint(label))}">${escapeHtml(label)}</button>`
  );
}

/**
 * Clicking a tag highlights; searching it filters. The two are worth having
 * separately — a highlight keeps the chart intact so you can see *where* the
 * matches are, a filter clears everything else away — and the tooltip is where
 * the second one is discoverable, since nothing about a chip suggests you
 * could type it.
 */
function tagHint(label: string): string {
  return `Highlight everything tagged “${label}” — or search tag:${normaliseTag(label)} to filter`;
}

/**
 * How many instructions are under a heading.
 *
 * A bare number beside a heading is a riddle — 200 of what? — so it says what
 * it counts. Except in the byte grid, where the headings run across a
 * sixteen-column table and the word costs more room than it earns; the unit is
 * written but hidden there, so that switching layout does not have to rewrite
 * the badge.
 *
 * A count of one is not worth a badge at all. Grouping by name gives a heading
 * per operation and a good many operations exist exactly once; "1" against each
 * of them is a column of noise saying nothing the heading did not.
 */
function renderCount(count: number): string {
  return (
    `<span class="group-count"${count === 1 ? ' hidden' : ''}>` +
    `<span class="count-n">${count}</span><span class="count-unit"> opcodes</span></span>`
  );
}

export function renderItem(item: ViewItem): string {
  switch (item.kind) {
    case 'group':
      return (
        `<h2 class="group" data-key="${escapeHtml(item.key)}" id="${escapeHtml(item.anchor)}">` +
        (item.emoji ? `<span class="group-emoji">${item.emoji}</span> ` : '') +
        headingTag(item.label, item.tag) +
        ` ${renderCount(item.count)}` +
        (item.intro ? `<span class="group-intro">${item.intro}</span>` : '') +
        renderGroupProposals(item.proposals) +
        `</h2>`
      );
    case 'subgroup':
      return (
        `<h3 class="subgroup" data-key="${escapeHtml(item.key)}">` +
        headingTag(item.label, item.tag) +
        `</h3>`
      );
    case 'tablehead':
      return (
        `<div class="tablehead" data-key="${escapeHtml(item.key)}" aria-hidden="true">` +
        `<span>Opcode</span><span>Instruction</span><span>Immediates</span>` +
        `<span>Stack</span><span>Category</span>` +
        `</div>`
      );
    case 'corner':
      return (
        `<div class="corner" data-key="${escapeHtml(item.key)}" ` +
        `title="Row and column are the sub-opcode in hex">${escapeHtml(item.label)}</div>`
      );
    case 'colhead':
      return (
        `<div class="colhead" data-key="${escapeHtml(item.key)}" ` +
        `data-notation="${item.notation}">${escapeHtml(item.label)}</div>`
      );
    case 'rowhead':
      return (
        `<div class="rowhead" data-key="${escapeHtml(item.key)}" ` +
        `data-notation="${item.notation}">${escapeHtml(item.label)}</div>`
      );
    case 'cell':
      return renderCell(item.op, item.filtered ?? false);
  }
}

/**
 * How each status is announced. Every one that is not `standard` takes the same
 * shape — mark, label, then what it means for someone reading a module today —
 * so they are easy to compare, and the mark says which kind of caution it is
 * rather than shouting the same warning at all of them.
 */
interface StatusNote {
  mark: string;
  label: string;
  detail: string;
}

const STATUS_NOTES: Partial<Record<Opcode['status'], StatusNote>> = {
  proposal: {
    mark: '\u{1F9EA}',
    label: 'Proposal',
    detail: 'not standardised. Engine support varies and the encoding may still change.',
  },
  legacy: {
    mark: '\u26A0\uFE0F',
    label: 'Legacy',
    detail: 'superseded by a newer encoding, though still emitted and accepted.',
  },
  dormant: {
    mark: '\u{1F4A4}',
    label: 'Dormant',
    detail: 'an inactive proposal. No engine implements it and the encoding may still change.',
  },
  withdrawn: {
    mark: '\u26D4',
    label: 'Withdrawn',
    detail: 'this encoding was abandoned. The slot is unassigned today.',
  },
};

/**
 * A phase-4 proposal is finished in every sense a reader cares about: the
 * design is settled, the encoding is fixed and the engines have shipped it.
 * The atomics are the case in point \u2014 telling someone that `i32.atomic.load`
 * "may still change" is not caution, it is wrong, and it makes the same warning
 * on a phase-1 instruction mean less.
 */
const AT_PHASE_4: StatusNote = {
  mark: '\u2705',
  label: 'Phase 4',
  detail:
    'settled and shipped in every current engine, awaiting only the specification text that folds it in.',
};

function statusNote(op: Opcode): StatusNote | undefined {
  if (op.status === 'proposal' && proposal(op.proposal)?.phase === 4) return AT_PHASE_4;
  return STATUS_NOTES[op.status];
}

/** The opcode's name as a panel heading, with its immediate operands. */
export function renderHeading(op: Opcode): string {
  const name = op.displayName ?? (op.name ? escapeHtml(op.name) : '<em>Unassigned</em>');
  const summary = summarize(op);
  return (
    `<h3 class="detail-name">${name}` +
    (op.immediateArgs ? ` <span class="immediate-args">${op.immediateArgs}</span>` : '') +
    `</h3>` +
    (summary ? `<p class="detail-summary">${escapeHtml(summary)}</p>` : '')
  );
}

/**
 * Where an instruction came from, and where that proposal got to.
 *
 * The text belongs to the proposal, not to the instruction, so it is looked up
 * rather than repeated. The old page pasted "Reference Types Proposal" into
 * dozens of descriptions; when the proposal finished, every one of them became
 * wrong at the same moment.
 */
/**
 * The feature table on webassembly.org: which engines and tools have shipped
 * each proposal, kept current in a way a chart reviewed once a year cannot be.
 *
 * The link points at the row by its text rather than by its id. The ids there
 * are positional — `feat-row-header-21` — so a link to one would quietly start
 * pointing at a different feature the next time a proposal is added, whereas
 * the name is what actually identifies the row.
 *
 * Tested end to end, and today the highlight does not fire: that table is
 * built by JavaScript after the page loads, and the browser looks for the text
 * before it exists. (An id fragment does scroll, because fragment scrolling is
 * retried as content arrives; text fragments are not.) The link still lands on
 * the right page, which is where it went before, and it starts working by
 * itself if webassembly.org ever renders that table server-side. Firefox does
 * not implement text fragments at all.
 */
const SUPPORT_URL = 'https://webassembly.org/features/';

function supportLink(feature: string): string {
  return `${SUPPORT_URL}#:~:text=${encodeURIComponent(feature)}`;
}

/**
 * Where an instruction stands: whether the byte means today what the cell says
 * it means, and which proposal it came through.
 *
 * The two were separate — a caution near the top of the panel, and a "History"
 * section further down — which put the same question in two places. "This is
 * still a proposal" and "it is the stack-switching proposal, at phase 3" are
 * one answer, so they are one section, and it is called what it answers.
 */
export function renderStatus(op: Opcode): string {
  const note = statusNote(op);
  const p = proposal(op.proposal);
  if (!note && !p) return '';

  const caution = note
    ? `<p class="detail-status" data-status="${op.status}"` +
      (note === AT_PHASE_4 ? ` data-tone="settled"` : '') +
      `>` +
      `<span class="status-mark" aria-hidden="true">${note.mark}</span>` +
      `<span class="status-text"><strong>${note.label}</strong> — ${note.detail}` +
      (op.supersededBy
        ? `<span class="detail-superseded">Replaced by ${op.supersededBy}</span>`
        : '') +
      `</span></p>`
    : '';

  if (!p) return `<h4>Status</h4>${caution}`;

  // Only where the table has a row to point at. The original release is not a
  // feature anyone opts into, and the abandoned draft encodings never were.
  const support = p.feature
    ? `<a class="history-support" href="${escapeHtml(supportLink(p.feature))}" ` +
      `title="Which engines and tools have shipped “${escapeHtml(p.feature)}”, on webassembly.org">` +
      `Engine support</a>`
    : '';
  return (
    `<h4>Status</h4>` +
    caution +
    `<p class="detail-history">` +
    `<a class="history-name" href="${escapeHtml(p.url)}">${escapeHtml(p.name)}</a>` +
    `<span class="history-standing">${escapeHtml(standing(p))}</span>` +
    `<span class="history-note">${escapeHtml(p.note)}</span>` +
    support +
    `</p>`
  );
}

/**
 * The property chips. Each is a button rather than a link: it does not go
 * anywhere, it lights up everything sharing that property.
 */
export function renderTags(op: Opcode): string {
  // A doorway byte has no properties: the ones it was being given — "Other",
  // "simd" — are read off `twobytefd.simd`, which is a placeholder standing in
  // for a name it does not have.
  if (op.prefixFor?.length) return '';
  const tags = tagsFor(op);
  if (!tags.length) return '';
  return (
    `<h4>Properties</h4><p class="detail-tags">` +
    tags
      .map(
        (tag) =>
          `<button type="button" class="tag" data-tag="${escapeHtml(tag.id)}" ` +
          `data-kind="${tag.kind}" title="${escapeHtml(tagHint(tag.label))}">` +
          `${escapeHtml(tag.label)}</button>`,
      )
      .join('') +
    `</p>`
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
  const tags = renderTags(op);

  if (op.description) {
    rows.push(`<h4>Description</h4><div class="detail-prose">${op.description}</div>`);
  }

  // Before the status: it finishes the encoding the panel opened with, so it
  // belongs with the reading of the bytes rather than after an aside about
  // where the instruction stands.
  if (op.followedBy) {
    rows.push(`<h4>Followed by</h4><div class="detail-followed">${op.followedBy}</div>`);
  }

  rows.push(renderStatus(op));

  if (op.stack) {
    const cls = op.stack.large ? 'op-type large' : 'op-type';
    rows.push(
      `<h4>Stack</h4><p><span class="${cls}">${op.stack.html}</span></p>` +
        (op.stack.note ? `<div class="detail-stack-note">${op.stack.note}</div>` : ''),
    );
  }

  if (tags) rows.push(tags);

  return (
    `<article class="detail" id="${op.id}" data-key="${op.id}">` +
    rows.join('\n') +
    `</article>`
  );
}
