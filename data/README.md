# The opcode data

One file per table. `revisions.json` records slots whose text has deliberately
changed since the 2022 page, so `npm run verify` does not fight an intentional
fix; `.legacy-help.json` is the frozen snapshot it compares against.

JSON cannot hold comments, so anything a future editor needs to know about a
particular entry goes here. `text-review.md` is the standing list of text the
2026 audit left open, and the wording decisions it settled.

## The stringview readings, and where they came from

`0xFB.145`–`149`, `0xFB.154`–`156` and `0xFB.161`–`164` carried a stack signature
and no note. That was on purpose at first: the reading looked reconstructed from
the names of the parameters in the proposal text rather than from a stated rule,
and on a dormant proposal a confident-sounding guess is worse than a gap.

It was not reconstructed. The stringref Overview states every operand and every
result outright, so the notes are back, quoting it. One of the reconstructed
readings was wrong, which is the argument for having looked:

| | Reconstructed | The proposal |
|---|---|---|
| `stringview_wtf8.encode_*` operands | view, address, start and **end** offsets | view, address, start offset, **how many bytes at most** |
| `stringview_wtf8.encode_*` results | bytes **read**, bytes written | the **offset reached**, bytes written |

Everything else it had right: `advance` takes a position and a byte count,
`wtf16.encode` takes a code-unit offset and a count, `iter.advance` and `rewind`
return how far they actually moved, and `iter.next` gives −1 at the end.

The other thing reading it turned up: not one stringref instruction recorded an
immediate, though twelve take a `memidx` and `string.const` takes a `stringidx`.
Fourteen notes already said "memory *x*", naming a letter the page never showed.

## Binaryen's stringref encoding differs from the proposal's

The stringref entries follow the proposal's Overview, whose binary encoding has
not changed since September 2022. Binaryen still reads and writes a subset of
stringref, and three of its opcodes are not in that document:

| Slot | The proposal | Binaryen |
|---|---|---|
| `0xFB.139` | `string.new_lossy_utf8` | `string.test` |
| `0xFB.168` | unassigned | `string.compare` |
| `0xFB.169` | unassigned | `string.from_code_point` |

The other twelve opcodes Binaryen decodes match the proposal. Binaryen's
`wasm-binary.h` also defines constants for `string.is_usv_sequence`
(`0xFB.138`, matching the proposal) and a `StringHash` at `0xFB.170`, but its
binary reader decodes neither. Checked against Binaryen `main` on 2026-10-29.

The chart keeps the proposal's encoding. If Binaryen's version is ever written
up as the proposal's, these three slots are the ones to revisit.

## Style for repeated explanations

Where the same block of text appears on many instructions — the alignment rules
on all 113 with a `memarg`, the relaxed-SIMD caveat on 17 — it opens with a bold
label and a colon, and bullets its points if there is more than one. A reader
meeting the block for the fifth time needs to recognise it as the same rules
rather than read it again, and the label is what does that. `labelled` in
`src/model/immediates.ts` builds them.
