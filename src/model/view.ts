/**
 * Turns the opcode data plus a set of view options into a flat, ordered list of
 * items to lay out.
 *
 * The same function runs at build time to emit the static page and in the
 * browser to re-lay-it-out, so the two can never drift. Everything downstream
 * of here — the renderer and the FLIP animation — only sees `ViewItem[]`.
 */

import type { Opcode, OpcodeData, Section, SectionId } from './types.ts';
import { HISTORICAL, toHex } from './types.ts';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  categorize,
  operationKey,
  subcategorize,
  subcategoryRank,
  type CategoryId,
} from './categories.ts';

/**
 * - `matrix` lays each section out as the familiar 16-wide byte grid, where a
 *   cell's position *is* its opcode. That only means anything when ordering by
 *   opcode within a section, so choosing it fixes the grouping and sort.
 * - `cards` flows the same cells as tiles, in whatever order and grouping is
 *   asked for. (This was called `list`, which described the byte grid just as
 *   badly as it described this.)
 * - `table` puts one instruction per row with its details in columns.
 */
export type Layout = 'matrix' | 'cards' | 'table';
export type GroupBy = 'section' | 'category' | 'name' | 'none';
/**
 * `name` sorts on the operation, ignoring the type it acts on, so every
 * `store` sits together regardless of whether it is `f32.store` or `i64.store`.
 * `type-name` sorts on the full name, which keeps each type's instructions
 * together instead.
 */
export type OrderBy = 'opcode' | 'name' | 'type-name';

export interface ViewOptions {
  layout: Layout;
  group: GroupBy;
  order: OrderBy;
  /**
   * How many bytes a row of the byte grid holds.
   *
   * Sixteen is the shape everyone already has in their head from a hex dump,
   * and it is what the chart uses given the width for it. A phone has room for
   * about half that before a cell is too narrow to hold a name, so there the
   * grid folds to eight and runs twice as far down instead — the same bytes,
   * the same order, a different fold.
   *
   * It is a view option rather than a media query because the item list has to
   * change: eight columns means eight column headings and twice as many row
   * headings, and CSS cannot add either.
   */
  columns: 8 | 16;
  /** Sections to include. */
  sections: SectionId[];
  /**
   * Include unassigned slots. Only applies to the byte grid, where a gap tells
   * you that a byte value is unused. A row or tile of nothing tells you
   * nothing, so the other layouts drop them regardless.
   */
  showReserved: boolean;
  /** Include instructions that are still proposals. */
  showProposals: boolean;
  /**
   * Include superseded and abandoned encodings. Off by default: they describe
   * what a byte used to mean, which is worth recording but is not what someone
   * reading the chart to understand a module today is looking for.
   */
  showHistorical: boolean;
  /**
   * A search, if one is running. The predicate rather than the query string,
   * because what an instruction can be found by is partly the prose in the
   * page, which the client has and the build does not need to duplicate.
   */
  match?: (op: Opcode) => boolean;
}

export const DEFAULT_VIEW: ViewOptions = {
  layout: 'matrix',
  // Grouping is ignored by the byte grid, which is always by section. This is
  // the default the list layout picks up, and matches the toolbar.
  group: 'category',
  order: 'opcode',
  columns: 16,
  sections: ['core', 'gc', 'stringref', 'fc', 'simd', 'simd-ext', 'threads'],
  showReserved: true,
  showProposals: true,
  showHistorical: false,
};

/** Which spelling of a number a grid axis is written in. */
export type Notation = 'hex' | 'dec';

export type ViewItem =
  | {
      kind: 'group';
      key: string;
      /** HTML id for the heading — the link target for jumps and deep links. */
      anchor: string;
      label: string;
      emoji?: string;
      intro?: string;
      count: number;
      /** Proposals the instructions in this group came through. */
      proposals?: string[];
      /** Tag the heading pins when clicked, where the group *is* a property. */
      tag?: string;
    }
  /**
   * The top-left cell of a byte grid. It carries the section's prefix, so the
   * grid reads as an equation: corner `0xFD` + row `E_` + column `_8` is the
   * sub-opcode 0xE8. Without it the axes are unlabelled hex nibbles.
   */
  | { kind: 'corner'; key: string; label: string }
  /**
   * Which notation a grid's axes are written in, so the stylesheet can give
   * them the colour that notation has everywhere else on the page. The core
   * table counts in bytes and its axes are hex nibbles; a prefixed table counts
   * in sub-opcodes, which are u32 values written in decimal, so its axes are
   * decimal too rather than a third spelling of the same number.
   */
  | { kind: 'colhead'; key: string; label: string; notation: Notation }
  /** Column headings for the table layout, one per group. */
  | { kind: 'tablehead'; key: string }
  /** A divider within a group — "Comparison", "Loads" — in the card layout. */
  | { kind: 'subgroup'; key: string; label: string; tag: string }
  | { kind: 'rowhead'; key: string; label: string; notation: Notation }
  /**
   * `filtered` cells are shown as empty slots rather than dropped. In the byte
   * grid a cell's position *is* its opcode, so removing one would shift every
   * cell after it and the grid would stop meaning anything.
   */
  | { kind: 'cell'; key: string; op: Opcode; filtered?: boolean };

/** The proposals represented in a run of instructions, in first-seen order. */
function distinctProposals(ops: Opcode[]): string[] {
  const seen: string[] = [];
  for (const op of ops) {
    if (op.proposal && !seen.includes(op.proposal)) seen.push(op.proposal);
  }
  return seen;
}

/**
 * Whether an opcode survives the filters and the search (section filtering is
 * separate). A search is a filter like any other, so it goes here: the byte
 * grid blanks what it hides and the other layouts drop it, which is what
 * searching should do in each.
 */
function passesStatus(op: Opcode, options: ViewOptions): boolean {
  if (op.status === 'reserved' && !options.showReserved) return false;
  if (op.status === 'proposal' && !options.showProposals) return false;
  if (HISTORICAL.includes(op.status) && !options.showHistorical) return false;
  if (options.match && !options.match(op)) return false;
  return true;
}

function visible(op: Opcode, options: ViewOptions): boolean {
  return options.sections.includes(op.section) && passesStatus(op, options);
}

/**
 * How many instructions the current options leave visible.
 *
 * The search count is quoted against this rather than against every
 * instruction in the data, so it agrees with what is on the page: with the
 * historical encodings hidden, `tag:signed` should not claim 106 matches over
 * a chart showing 103.
 */
export function countShown(data: OpcodeData, options: ViewOptions): number {
  return data.opcodes.filter((op) => op.name && !op.linkTo && visible(op, options)).length;
}

/**
 * How a grid's axes are written.
 *
 * The core table is a table of bytes: a cell's opcode *is* one byte, and the
 * two axes are its two hex nibbles, so `B_` down the side and `_E` across the
 * top read as the halves of `0xBE`. That only works at sixteen wide, where a
 * row is exactly one high nibble.
 *
 * Everything else is a table of sub-opcodes, which are u32 values rather than
 * bytes and are written in decimal throughout the rest of the page. Splitting
 * one into nibbles says nothing — `0xFD 263` is not `0xFD 1_` and `_7` — so
 * those axes are a base value and an offset, and add up rather than
 * concatenating: row 256 plus column +7.
 *
 * Eight columns is the same arrangement: a row is no longer a nibble, so even
 * the core table gives its base in full and counts across from it.
 */
function axisNotation(section: Section, columns: 8 | 16): Notation {
  return !section.prefix && columns === 16 ? 'hex' : 'dec';
}

/** The label down the side of a row, given the first opcode in it. */
function rowLabel(section: Section, base: number, columns: 8 | 16): string {
  if (axisNotation(section, columns) === 'hex') {
    return toHex(base >> 4).replace(/^0(?=.)/, '') + '_';
  }
  // The core table is bytes wherever it is folded, so its base stays hex.
  return section.prefix ? String(base) : toHex(base);
}

/** The label across the top of a column, given its offset into a row. */
function colLabel(section: Section, offset: number, columns: 8 | 16): string {
  if (axisNotation(section, columns) === 'hex') {
    return `_${offset.toString(16).toUpperCase()}`;
  }
  return `+${offset}`;
}

/**
 * The part of a name that is the operation rather than the type it acts on:
 * `f32.store` and `i64.store` both reduce to `store`, and
 * `i32.atomic.rmw16.xchg_u` to `xchg_u`.
 */
function operationOf(op: Opcode): string {
  const pre = op.parts?.pre;
  if (!op.name) return '';
  return pre && op.name.startsWith(pre + '.') ? op.name.slice(pre.length + 1) : op.name;
}

/*
 * The heading an instruction files under when grouping by name is
 * `operationKey` from the categories module — the same reading of a name that
 * decides its sub-group, so the two cannot disagree about what `relaxed_madd`
 * is an instance of. It is narrower than `operationOf` above, which keeps the
 * widths and signedness: `load8_u` and `load16_s` are two entries under `load`
 * rather than two headings of one entry each.
 */

/** `select t` is the only operation with a space in it, and ids cannot have one. */
function anchorSafe(name: string): string {
  return name.replace(/[^a-z0-9_]+/gi, '-');
}

function sortOpcodes(ops: Opcode[], order: OrderBy): Opcode[] {
  if (order === 'name' || order === 'type-name') {
    const byOperation = order === 'name';
    return [...ops].sort((a, b) => {
      // Unassigned slots have no name to sort by; they sink to the end.
      if (!a.name || !b.name) return (a.name ? 0 : 1) - (b.name ? 0 : 1);
      if (byOperation) {
        // Ties fall back to the type, so the variants of one operation stay in
        // a predictable order rather than whatever the byte order happens to be.
        return (
          operationOf(a).localeCompare(operationOf(b)) ||
          (a.parts?.pre ?? '').localeCompare(b.parts?.pre ?? '') ||
          a.code - b.code
        );
      }
      return a.name.localeCompare(b.name) || a.code - b.code;
    });
  }
  // Single-byte opcodes first, then each prefix in byte order, then by
  // sub-opcode. Derived from prefix and code rather than the encoded bytes, so
  // the client payload does not have to carry the encoding.
  return [...ops].sort(
    (a, b) =>
      (a.prefix ? 1 : 0) - (b.prefix ? 1 : 0) ||
      a.prefix.localeCompare(b.prefix) ||
      a.code - b.code,
  );
}

/**
 * Which rows of a section's byte grid are worth drawing, as the base code of
 * each — 0x30 for the row 0x30–0x3F.
 *
 * Trailing empty rows say nothing: the section simply does not reach that far.
 * The GC table is 128 slots for 31 instructions and most of that emptiness is
 * at the end, all of it beyond the last row anything survives in once the
 * superseded encodings are hidden. Interior gaps are kept — a hole in the
 * middle of a run is a fact about the encoding — but a row that filtering has
 * emptied entirely goes too, since row labels are explicit rather than
 * positional and dropping one cannot misalign the rest.
 *
 * Exported because the navigation map draws the same grid and has to reach the
 * same answer; when it did this by eye instead, the map kept six blank rows of
 * GC that the chart had already stopped drawing.
 */
export function gridRows(section: Section, ops: Opcode[], options: ViewOptions): number[] {
  const width = options.columns;
  const lastUsed = ops.reduce(
    (last, op) => (op.name && passesStatus(op, options) ? Math.max(last, op.code) : last),
    section.start,
  );
  const end = Math.min(section.start + section.count, lastUsed - (lastUsed % width) + width);

  const rows: number[] = [];
  for (let base = section.start; base < end; base += width) {
    const row = ops.filter((op) => op.code >= base && op.code < base + width);
    if (!row.length || row.every((op) => !passesStatus(op, options))) continue;
    rows.push(base);
  }
  return rows;
}

/** Lays one section out as a byte grid, with row and column headers. */
function matrixItems(section: Section, ops: Opcode[], options: ViewOptions): ViewItem[] {
  const width = options.columns;
  const notation = axisNotation(section, width);
  const items: ViewItem[] = [];
  items.push({
    kind: 'corner',
    key: `corner:${section.id}`,
    label: section.prefix ? `0x${section.prefix}` : '0x',
  });
  for (let i = 0; i < width; i++) {
    items.push({
      kind: 'colhead',
      // The width is in the key because it is in the label: folded to eight
      // columns the same position is `+3` rather than `_3`, and a pooled
      // element is reused by key alone.
      key: `colhead:${section.id}:${width}:${i}`,
      label: colLabel(section, i, width),
      notation,
    });
  }

  for (const base of gridRows(section, ops, options)) {
    items.push({
      kind: 'rowhead',
      key: `rowhead:${section.id}:${width}:${base}`,
      label: rowLabel(section, base, width),
      notation,
    });
    for (const op of ops.filter((op) => op.code >= base && op.code < base + width)) {
      const filtered = !passesStatus(op, options);
      items.push({ kind: 'cell', key: op.id, op, ...(filtered ? { filtered } : {}) });
    }
  }
  return items;
}

export function buildView(data: OpcodeData, options: ViewOptions): ViewItem[] {
  // The byte grid is only meaningful grouped by section and ordered by byte,
  // and it keeps every cell of a shown section so positions stay honest.
  if (options.layout === 'matrix') {
    const items: ViewItem[] = [];
    for (const section of data.sections) {
      if (!options.sections.includes(section.id)) continue;
      const sectionOps = data.opcodes.filter((op) => op.section === section.id);
      const showing = sectionOps.filter((op) => passesStatus(op, options) && op.name);
      // A section with nothing left to show is a heading over a field of
      // blanks. Drop it rather than make the reader work out that it is empty.
      if (!showing.length) continue;
      items.push({
        kind: 'group',
        key: `group:section:${section.id}`,
        anchor: section.anchor,
        label: section.title,
        ...(section.emoji ? { emoji: section.emoji } : {}),
        ...(section.intro ? { intro: section.intro } : {}),
        count: showing.length,
        proposals: distinctProposals(showing),
      });
      items.push(...matrixItems(section, sectionOps, options));
    }
    return items;
  }

  // --- cards and table ----------------------------------------------------
  // Both flow the same cells; only the styling of a cell differs, so they share
  // every decision about what appears and in what order.
  const head = (key: string): ViewItem[] =>
    options.layout === 'table' ? [{ kind: 'tablehead', key: `head:${key}` }] : [];

  /**
   * Gathers a group into its sub-groups, in `SUB_ORDER` order, keeping the
   * requested order within each.
   *
   * Without this the dividers went in wherever the byte order happened to cross
   * a boundary, so "Loads" appeared twice — once for the memory loads and again
   * 200 opcodes later over `f32.load_f16` alone — and a card could sit under a
   * heading that described the instruction before it rather than itself.
   */
  const bySubgroup = (ops: Opcode[]): Opcode[] => {
    if (options.layout !== 'cards') return ops;
    return ops
      .map((op, index) => ({ op, index, rank: subcategoryRank(op) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.op);
  };

  /**
   * Writes a run of cells, breaking it with sub-group dividers. Only the card
   * layout gets them: the table has its own column headings to sit under, and
   * the byte grid is not grouped by anything but position.
   */
  const emit = (into: ViewItem[], group: string, ops: Opcode[]): void => {
    let current: string | null = null;
    for (const op of bySubgroup(ops)) {
      if (options.layout === 'cards') {
        const sub = subcategorize(op);
        const id = sub?.id ?? null;
        if (id !== current) {
          current = id;
          if (sub) {
            into.push({
              kind: 'subgroup',
              key: `sub:${group}:${sub.id}`,
              label: sub.label,
              tag: sub.tag,
            });
          }
        }
      }
      into.push({ kind: 'cell', key: op.id, op });
    }
  };

  // `linkTo` cells are the prefix bytes, which exist to point at the sub-table
  // that decodes them. In the byte grid they occupy a real byte value and have
  // to be there; in a list of instructions they are not instructions.
  const listable = data.opcodes.filter((op) => op.name && !op.linkTo && visible(op, options));

  if (options.group === 'none') {
    return [
      ...head('all'),
      ...sortOpcodes(listable, options.order).map((op) => ({
        kind: 'cell' as const,
        key: op.id,
        op,
      })),
    ];
  }

  const items: ViewItem[] = [];

  if (options.group === 'section') {
    for (const section of data.sections) {
      if (!options.sections.includes(section.id)) continue;
      const group = sortOpcodes(
        listable.filter((op) => op.section === section.id),
        options.order,
      );
      if (!group.length) continue;
      items.push({
        kind: 'group',
        key: `group:section:${section.id}`,
        anchor: section.anchor,
        label: section.title,
        ...(section.emoji ? { emoji: section.emoji } : {}),
        ...(section.intro ? { intro: section.intro } : {}),
        count: group.length,
        proposals: distinctProposals(group),
      });
      items.push(...head(section.id));
      emit(items, section.id, group);
    }
    return items;
  }

  /*
   * One heading per operation, in alphabetical order: an index. `add` collects
   * the twenty-six additions across every type and width, and a heading with a
   * single entry under it is not a failure of the grouping — it is the answer
   * that this operation exists once.
   */
  if (options.group === 'name') {
    const byName = new Map<string, Opcode[]>();
    for (const op of listable) {
      const key = operationKey(op);
      let bucket = byName.get(key);
      if (!bucket) byName.set(key, (bucket = []));
      bucket.push(op);
    }
    for (const [name, group] of [...byName].sort((a, b) => a[0].localeCompare(b[0]))) {
      items.push({
        kind: 'group',
        key: `group:name:${name}`,
        anchor: `op-${anchorSafe(name)}`,
        label: name,
        count: group.length,
      });
      items.push(...head(`name:${name}`));
      emit(items, `name:${name}`, sortOpcodes(group, options.order));
    }
    return items;
  }

  // group === 'category'
  const buckets = new Map<CategoryId, Opcode[]>();
  for (const op of listable) {
    const category = categorize(op);
    let bucket = buckets.get(category);
    if (!bucket) buckets.set(category, (bucket = []));
    bucket.push(op);
  }
  for (const category of CATEGORY_ORDER) {
    const group = buckets.get(category);
    if (!group?.length) continue;
    const sorted = sortOpcodes(group, options.order);
    items.push({
      kind: 'group',
      key: `group:category:${category}`,
      anchor: `cat-${category}`,
      label: CATEGORY_LABELS[category],
      count: sorted.length,
      tag: `cat-${category}`,
    });
    items.push(...head(category));
    emit(items, category, sorted);
  }
  return items;
}
