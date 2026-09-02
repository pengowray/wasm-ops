# Text still to review

What the 2026 audit of `stack`, `immediates` and `description` left open. Counts
are instructions affected, from the data as it stands after the September
follow-up.

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

The September follow-up also rewrote all 49 atomic read-modify-write
descriptions. The inherited text repeated the same two-paragraph explanation in
every entry, several widths and byte counts were missing or wrong, the
compare-and-exchange pseudo-algorithm was hard to scan, and it contained raw
Markdown backticks inside HTML. Each entry now says directly what is read,
changed, written and returned.

## 2. 17 historical descriptions describe an encoding, not an instruction

| Shared text | Count |
|---|---:|
| "An encoding used while relaxed SIMD was being prototyped…" | 17 |

These are withdrawn prototype encodings whose slots are unassigned today, so
there is no current instruction behaviour to describe. Their shared text stays
for now because it explains what the historical entries are doing in the chart.
The 29 half-precision and seven stack-switching instructions now describe their
actual operations instead of repeating their proposal status.

## 3. Shared text that omitted the distinguishing feature — done

The September follow-up rewrote all four groups that were still open:

| Group | Count | What the text never says |
|---|---:|---|
| `extmul` | 12 | low or high half, signed or unsigned |
| `extadd_pairwise` | 4 | signed or unsigned |
| `load*_splat` | 4 | the element width |
| the lane shifts | 4 | which end the bits come in from |

The descriptions now state low or high half, sign or zero extension, the loaded
width, and which side of a left shift receives zeros. The 54 comparisons were
already done: they open with the operator as a symbol, the way the 32 scalar
comparisons always have.

## 4. One way to write a lane shape, not yet applied everywhere

The comparisons had five between them: "16 eight-bit", "eight 16-bit", "8
sixteen-bit", "4 thirty-two-bit", "two 64-bit". Those 54 now use one form:

> the count as a word, the width in digits — "sixteen 8-bit signed integers",
> "four single-precision floats"

The rest of `simd.json` has not been swept for it.

## 5. Smaller, each one edit

| | |
|---|---|
| `memarg`'s block | three alignment bullets plus an Addresses line, on 113 instructions. Worst case is the eight lane loads and stores (`0xFD.84`–`91`), which add a third labelled block. Look at those before deciding it is too long |

The opcode name, table64 note, delimiter wording, catch-clause layout and
tail-call stack prefix were all resolved in the September follow-up.

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
| a comparison's description | opens with the operator as a symbol in `p.bigsign`, then the prose. The convention came from the 2022 page; the CSS rule for it did not, until now |
| addresses | `i32` rather than the specification's `at`, with the address-type note qualifying it |
| `*` | ASCII, not `∗` (U+2217); `list(…)`, not `vec(…)` |
| metavariables | italic; concrete types upright |
| the heading | "Immediate operands", not "Followed by" |
| repeated explanations | bold label, colon, bullets if more than one rule (`labelled` in `src/model/immediates.ts`) |
| hex in prose | the opcode face, the body colour (`markHex` in `src/render/items.ts`) |
| bitwise operators | AND, inclusive OR, exclusive OR (XOR) — capitals, because lower-case "and" mid-sentence reads as a conjunction |
