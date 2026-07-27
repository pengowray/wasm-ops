/**
 * The proposals that instructions arrived through, and where each one got to.
 *
 * Every instruction points at an entry here by id, so the sentence explaining a
 * proposal is written once and shown against all of its instructions rather
 * than copied into each. The old page had "Reference Types Proposal" pasted
 * into dozens of descriptions, and when the proposal finished, all of them
 * became wrong at once.
 */

export type ProposalStage =
  /** Folded into the specification. */
  | 'standard'
  /** On the standards track, not finished. */
  | 'active'
  /** On the track but stalled — no engine implements it. */
  | 'dormant'
  /** Superseded by a later design, though still found in the wild. */
  | 'superseded';

export interface Proposal {
  id: string;
  name: string;
  stage: ProposalStage;
  /**
   * For finished proposals: which release folded it in, and when that release
   * was finished by the working group — 1.0 in 2017, 2.0 in early 2022, 3.0 in
   * September 2025. The W3C's own stamp comes later and by a different
   * schedule (2.0 only became official in December 2024), so the year here is
   * when the specification was settled, not when the paperwork caught up.
   */
  standardisedIn?: string;
  /** For unfinished ones: the phase it has reached, 1 to 4. */
  phase?: number;
  /**
   * The year of the last thing that happened to this proposal that changes what
   * a reader should think about its instructions — reaching the phase it is at,
   * or being abandoned. Quoted in the status box, which is one line and has room
   * for a number but not for a sentence.
   *
   * It is the *last* such thing, not the first and not the year the encoding was
   * drawn up: "phase 3 (2026)" says the design moved recently, "phase 1 (2022)"
   * says it has not. A year that is merely when someone happened to look at the
   * repository would say neither, so there is a `sinceNote` against every one of
   * these saying what the year is, and none is a guess.
   */
  since?: number;
  /** What that year was — shown as the status box's tooltip. */
  sinceNote?: string;
  /**
   * How the feature table on webassembly.org names this proposal, where it has
   * a row. Used to link straight at that row: the table's own ids are
   * positional (`feat-row-header-21`) and would rot, so the link points at the
   * text instead and lets the browser find and highlight it.
   */
  feature?: string;
  /** One sentence on what it means to a reader today. Shared by every
   *  instruction the proposal introduced. */
  note: string;
  url: string;
  /** Hue for the optional colouring, in degrees. */
  hue: number;
}

const LIST: Proposal[] = [
  {
    id: 'mvp',
    name: 'WebAssembly 1.0',
    stage: 'standard',
    standardisedIn: 'WebAssembly 1.0 (2017)',
    note: 'Part of the original WebAssembly release. Supported everywhere WebAssembly is.',
    url: 'https://github.com/WebAssembly/design/blob/main/MVP.md',
    hue: 210,
  },
  {
    id: 'sign-extension',
    name: 'Sign-extension operators',
    feature: 'Sign-extension Operators',
    stage: 'standard',
    standardisedIn: 'WebAssembly 2.0 (2022)',
    note: 'Standardised and supported by every current engine.',
    url: 'https://github.com/WebAssembly/sign-extension-ops',
    // 0xC0–0xC4 sits directly under the last of the numeric instructions, and
    // the blue it had was a few degrees off the blue of those — a boundary
    // between two proposals that read as a shading artefact. Traded with stack
    // switching, whose own run has nothing but unassigned bytes around it.
    hue: 330,
  },
  {
    id: 'nontrapping-float-to-int',
    name: 'Non-trapping float-to-int conversions',
    feature: 'Non-trapping float-to-int Conversions',
    stage: 'standard',
    standardisedIn: 'WebAssembly 2.0 (2022)',
    note: 'Standardised and supported by every current engine.',
    url: 'https://github.com/WebAssembly/nontrapping-float-to-int-conversions',
    hue: 190,
  },
  {
    id: 'bulk-memory',
    name: 'Bulk memory operations',
    feature: 'Bulk Memory Operations',
    stage: 'standard',
    standardisedIn: 'WebAssembly 2.0 (2022)',
    note: 'Standardised and supported by every current engine.',
    url: 'https://github.com/WebAssembly/bulk-memory-operations',
    // Sub-opcodes 8–11, wedged between the float-to-int conversions in cyan and
    // the reference types in violet, and green enough to blend into the first
    // of them. Warm, so both of its edges are edges.
    hue: 15,
  },
  {
    id: 'reference-types',
    name: 'Reference types',
    feature: 'Reference Types',
    stage: 'standard',
    standardisedIn: 'WebAssembly 2.0 (2022)',
    note: 'Standardised and supported by every current engine.',
    url: 'https://github.com/WebAssembly/reference-types',
    hue: 265,
  },
  {
    id: 'simd',
    name: 'Fixed-width SIMD',
    feature: 'Fixed-width SIMD',
    stage: 'standard',
    standardisedIn: 'WebAssembly 2.0 (2022)',
    note: 'Standardised and supported by every current engine.',
    url: 'https://github.com/WebAssembly/simd',
    hue: 285,
  },
  {
    id: 'tail-call',
    name: 'Tail call',
    feature: 'Tail Call',
    stage: 'standard',
    standardisedIn: 'WebAssembly 3.0 (2025)',
    note: 'Standardised. Shipping in current browsers; check support if you target older engines.',
    url: 'https://github.com/WebAssembly/tail-call',
    hue: 20,
  },
  {
    id: 'function-references',
    name: 'Typed function references',
    feature: 'Typed Function References',
    stage: 'standard',
    standardisedIn: 'WebAssembly 3.0 (2025)',
    note: 'Standardised. Shipping in current browsers; check support if you target older engines.',
    url: 'https://github.com/WebAssembly/function-references',
    hue: 250,
  },
  {
    id: 'gc',
    name: 'Garbage collection',
    feature: 'Garbage Collection',
    stage: 'standard',
    standardisedIn: 'WebAssembly 3.0 (2025)',
    note: 'Standardised as part of WebAssembly 3.0 and shipping in browsers since late 2023. These encodings replace the 2022 draft, which used *_canon names and a sparser numbering.',
    url: 'https://github.com/WebAssembly/gc',
    hue: 130,
  },
  {
    id: 'exception-handling',
    name: 'Exception handling',
    feature: 'Exception Handling with exnref',
    stage: 'standard',
    standardisedIn: 'WebAssembly 3.0 (2025)',
    note: 'Standardised. This is the try_table form; the earlier try/catch encoding is still emitted by older toolchains.',
    url: 'https://github.com/WebAssembly/exception-handling',
    hue: 0,
  },
  {
    id: 'legacy-exception-handling',
    name: 'Legacy exception handling',
    feature: 'Legacy Exception Handling',
    stage: 'superseded',
    since: 2023,
    sinceNote: 'Superseded in October 2023, when try_table and exnref were adopted',
    note: 'The exception handling design that preceded try_table. Engines still accept it and older toolchains still emit it, but new code should use the standardised form.',
    url: 'https://github.com/WebAssembly/exception-handling/blob/main/proposals/exception-handling/legacy/Exceptions.md',
    hue: 10,
  },
  {
    id: 'relaxed-simd',
    name: 'Relaxed SIMD',
    feature: 'Relaxed SIMD',
    stage: 'standard',
    standardisedIn: 'WebAssembly 3.0 (2025)',
    note: 'Standardised. Results may differ between engines by design — that is the point of the relaxation.',
    url: 'https://github.com/WebAssembly/relaxed-simd',
    // Now that the vector tables are one table, sub-opcode 256 begins on the
    // row after 255 and the join is the thing worth seeing. Purple against
    // purple hid it; this is the one boundary in that table that is a change of
    // proposal rather than a change of row.
    hue: 35,
  },
  {
    id: 'threads',
    name: 'Threads and atomics',
    feature: 'Threads',
    stage: 'active',
    phase: 4,
    since: 2023,
    sinceNote: 'Reached phase 4 in October 2023',
    note: 'Widely implemented, but not yet folded into the specification.',
    url: 'https://github.com/WebAssembly/threads',
    hue: 175,
  },
  {
    id: 'relaxed-atomics',
    name: 'Relaxed atomics',
    stage: 'active',
    phase: 2,
    since: 2026,
    sinceNote: 'Reached phase 2 in June 2026',
    note: 'Mostly a change to what the atomic instructions mean rather than a set of new ones: it gives them an ordering immediate. Adds `pause`. Encoding not final.',
    url: 'https://github.com/WebAssembly/relaxed-atomics',
    hue: 345,
  },
  {
    id: 'shared-everything-threads',
    name: 'Shared-everything threads',
    stage: 'active',
    phase: 1,
    since: 2023,
    sinceNote: 'Proposed in November 2023 and still at phase 1',
    note: 'Implemented behind a flag in V8, but still an early proposal. Extends atomics from linear memory to globals, tables and GC objects. Encoding not final.',
    url: 'https://github.com/WebAssembly/shared-everything-threads',
    hue: 165,
  },
  {
    id: 'custom-descriptors',
    name: 'Custom descriptors',
    stage: 'active',
    phase: 3,
    since: 2026,
    sinceNote: 'Reached phase 3 in January 2026',
    note: 'Attaches a value of your own choosing to each GC type, which is what a language needs to put a prototype or vtable on an object. Encoding not final.',
    url: 'https://github.com/WebAssembly/custom-descriptors',
    hue: 225,
  },
  {
    id: 'wide-arithmetic',
    name: 'Wide arithmetic',
    feature: 'Wide Arithmetic',
    stage: 'active',
    phase: 3,
    since: 2025,
    sinceNote: 'Reached phase 3 in February 2025',
    note: 'Implemented in some engines; the encoding is unlikely to change but is not final.',
    url: 'https://github.com/WebAssembly/wide-arithmetic',
    hue: 45,
  },
  {
    id: 'stack-switching',
    name: 'Stack switching',
    feature: 'Stack Switching',
    stage: 'active',
    phase: 3,
    since: 2026,
    sinceNote: 'Reached phase 3 in January 2026',
    note: 'Adds continuations for coroutines, generators and async. Encoding not final.',
    url: 'https://github.com/WebAssembly/stack-switching',
    // The blue that was on sign-extension; see there.
    hue: 200,
  },
  {
    id: 'half-precision',
    name: 'Half precision',
    feature: 'Half Precision',
    stage: 'active',
    phase: 1,
    since: 2024,
    sinceNote: 'Proposed in April 2024 and still at phase 1',
    note: 'Adds the f16 type. Early: no engine ships it and the encoding may still change.',
    url: 'https://github.com/WebAssembly/half-precision',
    hue: 90,
  },
  {
    id: 'stringref',
    name: 'Reference-typed strings',
    feature: 'Reference-Typed Strings',
    stage: 'dormant',
    phase: 1,
    // Phase 1 since April 2022, but the year worth quoting is the one it went
    // quiet in: a reader deciding whether to care is asking how long ago that
    // was, not when it started.
    since: 2023,
    sinceNote: 'At phase 1 since 2022, with no activity since 2023',
    note: 'No engine implements it, and the encoding may still change. Included for reference rather than for use.',
    url: 'https://github.com/WebAssembly/stringref',
    hue: 60,
  },
  {
    id: 'gc-draft-2022',
    name: 'GC, 2022 draft',
    stage: 'superseded',
    since: 2023,
    sinceNote: 'Replaced in July 2023, when the final GC encoding was settled',
    note: 'An encoding from the draft of the garbage collection proposal, replaced before it was standardised. These slots are unassigned today; the entries are here because old modules and old tools may still use them.',
    url: 'https://github.com/WebAssembly/gc',
    hue: 120,
  },
  {
    id: 'relaxed-simd-prototype',
    name: 'Relaxed SIMD, prototype encoding',
    stage: 'superseded',
    since: 2022,
    sinceNote: 'Abandoned in March 2022, when relaxed SIMD took a range of its own',
    note: 'An encoding used while relaxed SIMD was being prototyped, abandoned when it moved to the 0xFD 256 and above range. These slots are unassigned today.',
    url: 'https://github.com/WebAssembly/relaxed-simd',
    hue: 300,
  },
  /*
   * Not a proposal, and here anyway.
   *
   * 0xFB, 0xFC, 0xFD and 0xFE came from four different proposals and belong to
   * none of them: what they have in common is being doorways rather than
   * instructions. Left with no proposal at all they were the one run of named
   * bytes in the core table with no colour and no chip — a hole in a picture
   * that is otherwise complete — and "what are these four" is a question the
   * chart should answer by looking like it has an answer.
   *
   * So they are a group like any other, which costs one entry here and gets
   * them a colour, a chip in the table's heading that lights all four, and a
   * name the search can find them by. They are not counted as opcodes; see
   * `countable` in the view.
   */
  {
    id: 'opcode-prefix',
    name: 'Opcode prefix',
    stage: 'standard',
    note: 'Not instructions. Each of these bytes says that a sub-opcode follows and that the pair is decoded from another table.',
    url: 'https://webassembly.github.io/spec/core/binary/instructions.html',
    // Alone in that corner of the core table — the nearest coloured neighbours
    // are two rows up — so this only has to differ from everything, not from
    // anything in particular.
    hue: 75,
  },
];

const BY_ID = new Map(LIST.map((p) => [p.id, p]));

export function proposal(id: string | undefined): Proposal | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function allProposals(): Proposal[] {
  return LIST;
}

/** How a proposal's standing is put in one short phrase. */
export function standing(p: Proposal): string {
  switch (p.stage) {
    case 'standard':
      return `Standardised${p.standardisedIn ? ` in ${p.standardisedIn}` : ''}`;
    case 'active':
      return `Proposal, phase ${p.phase ?? '?'}`;
    case 'dormant':
      return `Proposal, phase ${p.phase ?? '?'} — inactive`;
    case 'superseded':
      return 'Superseded';
  }
}
