# Text still to review

What the 2026 audit of `stack`, `immediates` and `description` left open. Counts
are instructions affected, from the data as it stands.

## Nothing checks `description`

`npm run verify` compares the help text against the 2022 page, so anything that
was wrong in 2022 still passes; `npm run audit` compares names and stack
signatures against the specification and wabt, and never reads the prose. Every
defect below was found by reading.

The audit found the SIMD descriptions had been pasted from a Rust intrinsics
reference: Rust function signatures, that reference's operand names (`a`, `b`,
`$a`, `lane L of v`), and its idea that an out-of-range lane is a compile-time
error. 37 were rewritten. The rest of this file is what the same reading turned
up and did not fix.

## 1. Every named instruction now has a description

729 of 733. The four without are the `twobyte*` prefix cells, which do not need
one: their text is generated from what lies behind them.

Four things turned up while writing the last 67, each of which had been sitting
in the data unnoticed:

| | |
|---|---|
| `i64.add128`, `i64.sub128` | shown with three operands. They take two 128-bit values, so four. wabt's table has three parameter columns and cannot hold the fourth; recorded in `ACCEPTED_STACK` in `scripts/audit.ts` |
| the three tail calls | all said "the tail-call version of call", including the two that are not |
| every stringref instruction | no immediate recorded, though twelve take a `memidx` and `string.const` a `stringidx`. Fourteen notes said "memory *x*" with no *x* on the page |
| `struct.get`, `struct.set` | called the field immediate `i`; the page calls it *y* |

The stringview notes that were left blank as reconstructed are in the proposal
verbatim, so they are back, with one reading corrected. See README.md in this
directory.

## 2. 59 descriptions describe the proposal, not the instruction

| Shared text | Count |
|---|---:|
| "Part of the half-precision proposal, which adds the 16-bit float type f16…" | 35 |
| "An encoding used while relaxed SIMD was being prototyped…" | 17 |
| "Part of the stack switching proposal, which adds continuations…" | 7 |

The Status box directly below already says this, in the proposal's own entry. So
these 59 spend their one prose field repeating the box and never say what the
instruction does.

## 3. Shared text that omits the distinguishing feature

99 groups share a description, covering 294 instructions. Most are harmless — the
four `all_true` differ only in lane shape, and the name carries that. These are
the ones where the shared text leaves out the very thing that separates the
members:

| Group | Count | What the text never says |
|---|---:|---|
| integer and float comparisons, 13 groups | 37 | which comparison — `i8x16.lt_u` and `i8x16.ge_u` read identically |
| `extmul` | 12 | low or high half, signed or unsigned |
| `extadd_pairwise` | 4 | signed or unsigned |
| `load*_splat` | 4 | the element width |
| `shr_s` / `shr_u` and the lane shifts | 4 | which end the bits come in from |

## 4. Five ways to write a lane shape

"16 eight-bit", "eight 16-bit", "8 sixteen-bit", "4 thirty-two-bit", "two
64-bit" — all in the comparison descriptions, all meaning the same kind of
thing. Pick one and apply it wherever a description names a shape.

## 5. Smaller, each one edit

| | |
|---|---|
| `0xFD.331` | named `f32x4.promote_f16x8_low`; the half-precision proposal calls it `f32x4.promote_low_f16x8` |
| `tableidx` | has no address-type note, where `memidx` and `memarg` now do. Same fact under table64, for `table.get`, `set`, `size`, `grow`, `fill`, `copy` and the index operand of both indirect calls |
| the five delimiters | `else`, `catch`, `end`, `delegate`, `catch_all` say "Not typed on its own", which is the validator's vocabulary rather than a reader's |
| the `catch` kind | its gloss lists all four clause forms inline, on one long line. A bulleted labelled block would suit it, now that the style exists |
| the tail calls | `t₁*` is the callee's parameters in `call`, and the polymorphic prefix in `return_call`. The specification does the same and the page shows them side by side, so one extra clause in the tail-call notes would settle it |
| `memarg`'s block | three alignment bullets plus an Addresses line, on 113 instructions. Worst case is the eight lane loads and stores (`0xFD.84`–`91`), which add a third labelled block. Look at those before deciding it is too long |

## 6. The last em dash

Every operand line reads `u32 x : typeidx`, or with a gloss
`m : memarg — u32 align, then u64 offset`. That em dash is a separator, the same
in all 26 kinds, and was the existing convention in the data. Every em dash doing
sentence work is gone; this one stayed because changing it restyles every operand
on the site.

| Option | Reads as | Cost |
|---|---|---|
| keep `—` | `m : memarg — u32 align, then u64 offset` | an em dash |
| `,` | `m : memarg, u32 align, then u64 offset` | three commas, the first doing different work from the others |
| second `:` | `m : memarg: u32 align, then u64 offset` | two colons, different jobs |
| brackets | `m : memarg (u32 align, then u64 offset)` | reads well on short glosses; `blocktype`, `heaptype` and `catch` become a long parenthesis |
| line break | kind on one line, gloss under it | doubles the height of every operand line |

Preference if it changes: brackets. One edit, in `renderImmediate`.

## 7. Deliberate, listed so it is not undone by accident

| | |
|---|---|
| `ref.test`, `ref.cast` and two withdrawn drafts | operand written `(ref null ht′)`, glossed as "any supertype of *ht*" |
| `br_on_cast` and three related | `[t* rt₁\rt₂]` — the specification's own type-difference operator, explained in the note |
| `cont.bind` | bound arguments written `t*`; the proposal writes `t₃*`, but nothing on the page is numbered 1 or 2 for a 3 to follow |
| the stringview operand glosses | blank on purpose. See README.md in this directory |
| addresses | `i32` rather than the specification's `at`, with the address-type note qualifying it |
| `*` | ASCII, not `∗` (U+2217); `list(…)`, not `vec(…)` |
| metavariables | italic; concrete types upright |
| the heading | "Immediate operands", not "Followed by" |
| repeated explanations | bold label, colon, bullets if more than one rule (`labelled` in `src/model/immediates.ts`) |
| hex in prose | the opcode face, the body colour (`markHex` in `src/render/items.ts`) |
| bitwise operators | AND, inclusive OR, exclusive OR (XOR) — capitals, because lower-case "and" mid-sentence reads as a conjunction |
