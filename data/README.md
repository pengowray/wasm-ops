# The opcode data

One file per table. `revisions.json` records slots whose text has deliberately
changed since the 2022 page, so `npm run verify` does not fight an intentional
fix; `.legacy-help.json` is the frozen snapshot it compares against.

JSON cannot hold comments, so anything a future editor needs to know about a
particular entry goes here. `text-review.md` is the standing list of text the
2026 audit left open, and the wording decisions it settled.

## What is deliberately left unsaid

### The stringview operand orders

`0xFB.145`–`149`, `0xFB.154`–`156` and `0xFB.161`–`164` carry a stack signature
but no note, where every comparable instruction has one saying which operand is
which.

That is on purpose. The types are structural and certain — a view, then some
number of i32s. What each i32 *means* is not: the stringref proposal is dormant,
no engine implements it, and the reading below is reconstructed from the names of
the parameters in the proposal text rather than from a stated typing rule. On a
dormant proposal a confident-sounding guess is worse than a gap, so the page
shows the signature and stops.

The reading, for whoever picks this up if stringref ever revives:

| Opcode | Best understanding of the operands |
|---|---|
| `0xFB.145 stringview_wtf8.advance` | view, a byte position, how many bytes to move on; pushes the new position |
| `0xFB.146` `.encode_utf8`, `0xFB.148` `.encode_lossy_utf8`, `0xFB.149` `.encode_wtf8` | view, destination address in memory *x*, start and end byte positions; pushes bytes read and bytes written |
| `0xFB.147 stringview_wtf8.slice` | view, start and end byte positions |
| `0xFB.154 stringview_wtf16.get_codeunit` | view, a code-unit index |
| `0xFB.155 stringview_wtf16.encode` | view, destination address in memory *x*, start code-unit position, how many to write; pushes how many were written |
| `0xFB.156 stringview_wtf16.slice` | view, start and end code-unit positions |
| `0xFB.161 stringview_iter.next` | pushes the next code point and advances, or −1 at the end |
| `0xFB.162` `.advance`, `0xFB.163` `.rewind` | view, how many code points to move; pushes how many it moved |
| `0xFB.164 stringview_iter.slice` | view, how many code points to take from the current position |

`0xFB.153 stringview_wtf16.length` keeps its note: it takes only the view, so
there is no order to be wrong about.

## Style for repeated explanations

Where the same block of text appears on many instructions — the alignment rules
on all 113 with a `memarg`, the relaxed-SIMD caveat on 17 — it opens with a bold
label and a colon, and bullets its points if there is more than one. A reader
meeting the block for the fifth time needs to recognise it as the same rules
rather than read it again, and the label is what does that. `labelled` in
`src/model/immediates.ts` builds them.
