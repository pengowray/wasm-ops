/**
 * Turns the opcode data plus a set of view options into a flat, ordered list of
 * items to lay out.
 *
 * The same function runs at build time to emit the static page and in the
 * browser to re-lay-it-out, so the two can never drift. Everything downstream
 * of here — the renderer and the FLIP animation — only sees `ViewItem[]`.
 */

import type { Opcode, OpcodeData, Section, SectionId } from './types.ts';
import { toHex } from './types.ts';
import { CATEGORY_LABELS, CATEGORY_ORDER, categorize, type CategoryId } from './categories.ts';

/**
 * `matrix` lays each section out as the familiar 16-wide byte grid, where a
 * cell's position *is* its opcode. That only means anything when ordering by
 * opcode within a section, so choosing it fixes the grouping and sort.
 * `list` flows cells in whatever order and grouping is asked for.
 */
export type Layout = 'matrix' | 'list';
export type GroupBy = 'section' | 'category' | 'none';
export type OrderBy = 'opcode' | 'name';

export interface ViewOptions {
  layout: Layout;
  group: GroupBy;
  order: OrderBy;
  /** Sections to include. */
  sections: SectionId[];
  /**
   * Include unassigned slots. Only applies to the byte grid, where a gap tells
   * you that a byte value is unused. A list of blanks tells you nothing, so
   * list layouts drop them regardless.
   */
  showReserved: boolean;
  /** Include instructions that are still proposals. */
  showProposals: boolean;
}

export const DEFAULT_VIEW: ViewOptions = {
  layout: 'matrix',
  group: 'section',
  order: 'opcode',
  sections: ['core', 'gc', 'stringref', 'fc', 'simd', 'relaxed-simd', 'threads'],
  showReserved: true,
  showProposals: true,
};

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
    }
  | { kind: 'corner'; key: string }
  | { kind: 'colhead'; key: string; label: string }
  | { kind: 'rowhead'; key: string; label: string }
  /**
   * `filtered` cells are shown as empty slots rather than dropped. In the byte
   * grid a cell's position *is* its opcode, so removing one would shift every
   * cell after it and the grid would stop meaning anything.
   */
  | { kind: 'cell'; key: string; op: Opcode; filtered?: boolean };

/** The grid is a row-label column plus 16 value columns. */
export const MATRIX_COLUMNS = 17;

/** Whether an opcode passes the status filters (section filtering is separate). */
function passesStatus(op: Opcode, options: ViewOptions): boolean {
  if (op.status === 'reserved' && !options.showReserved) return false;
  if (op.status === 'proposal' && !options.showProposals) return false;
  return true;
}

function visible(op: Opcode, options: ViewOptions): boolean {
  return options.sections.includes(op.section) && passesStatus(op, options);
}

/**
 * Row label for a run of 16 opcodes, e.g. `3_` for 0x30–0x3F, `10_` for
 * 0x100–0x10F. Derived from the code so sections that do not start at zero
 * (stringref at 0x80, relaxed SIMD at 0x100) label correctly.
 */
function rowLabel(code: number): string {
  return toHex(code >> 4).replace(/^0(?=.)/, '') + '_';
}

function sortOpcodes(ops: Opcode[], order: OrderBy): Opcode[] {
  if (order === 'name') {
    return [...ops].sort((a, b) => {
      // Unassigned slots have no name to sort by; they sink to the end.
      if (!a.name || !b.name) return (a.name ? 0 : 1) - (b.name ? 0 : 1);
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

/** Lays one section out as a 16-wide byte grid, with row and column headers. */
function matrixItems(section: Section, ops: Opcode[], options: ViewOptions): ViewItem[] {
  const items: ViewItem[] = [];
  items.push({ kind: 'corner', key: `corner:${section.id}` });
  for (let i = 0; i < 16; i++) {
    items.push({
      kind: 'colhead',
      key: `colhead:${section.id}:${i}`,
      label: `_${i.toString(16).toUpperCase()}`,
    });
  }

  // Walk the section's full code range so gaps keep their position, and drop
  // any row that filtering has emptied entirely.
  for (let base = section.start; base < section.start + section.count; base += 16) {
    const row = ops.filter((op) => op.code >= base && op.code < base + 16);
    // Row labels are explicit rather than positional, so a row in which
    // everything has been filtered away can be dropped without misaligning
    // the rows that remain.
    if (!row.length || row.every((op) => !passesStatus(op, options))) continue;
    items.push({ kind: 'rowhead', key: `rowhead:${section.id}:${base}`, label: rowLabel(base) });
    for (const op of row) {
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
      if (!sectionOps.length) continue;
      items.push({
        kind: 'group',
        key: `group:section:${section.id}`,
        anchor: section.anchor,
        label: section.title,
        ...(section.emoji ? { emoji: section.emoji } : {}),
        ...(section.intro ? { intro: section.intro } : {}),
        count: sectionOps.filter((op) => passesStatus(op, options) && op.name).length,
      });
      items.push(...matrixItems(section, sectionOps, options));
    }
    return items;
  }

  // --- list layouts -------------------------------------------------------
  // `linkTo` cells are the prefix bytes, which exist to point at the sub-table
  // that decodes them. In the byte grid they occupy a real byte value and have
  // to be there; in a list of instructions they are not instructions.
  const listable = data.opcodes.filter((op) => op.name && !op.linkTo && visible(op, options));

  if (options.group === 'none') {
    return sortOpcodes(listable, options.order).map((op) => ({
      kind: 'cell' as const,
      key: op.id,
      op,
    }));
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
      });
      for (const op of group) items.push({ kind: 'cell', key: op.id, op });
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
    });
    for (const op of sorted) items.push({ kind: 'cell', key: op.id, op });
  }
  return items;
}
