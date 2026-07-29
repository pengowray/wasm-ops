# wasm-ops

Chart of WebAssembly Instructions — every instruction with its byte encoding,
stack signature and description.

<https://wasm-chart.pengowray.com>

## How it fits together

The opcode data and the way it is displayed are separate. `data/` is the source
of truth; everything on the page is generated from it.

```
data/*.json      one file per section — the opcodes themselves
content/*.html   the page's prose (intro, further reading)
src/model/       the typed opcode model, name decomposition, categories, the
                 immediate-operand kinds, and the view logic that turns options
                 into an ordered layout
src/render/      HTML generation, used by both the build and the client
src/client/      browser behaviour: rearranging, highlighting, detail panel,
                 navigation map
src/build/       the static site generator
scripts/         extraction from the old page, verification, dev server
```

`src/model/view.ts` and `src/render/items.ts` run in both places: the build uses
them to emit the page, and the client uses the same code to rearrange it. There
is one implementation of the layout, so the static page and the interactive one
cannot drift apart.

## Working on it

```bash
npm install
npm run build     # generate dist/
npm run serve     # preview it at http://localhost:10303
npm run verify    # check the data
npm run typecheck
```

To change what an instruction says, edit its entry in `data/<section>.json` and
rebuild. Nothing needs to be edited in two places.

Anything that follows from the data rather than being written down — the byte
encoding breakdown, the navigation map — is generated in the browser rather than
baked into the HTML, so the page does not carry hundreds of copies of the same
derived markup.

An instruction's immediate operands are recorded as which *kinds* it takes and
in what order. What a `memarg` is, that a `typeidx` is a `u32`, which bytes the
ordering immediate of an atomic read-modify-write may hold — those are facts
about the kind, written once in `src/model/immediates.ts`. The short form shown
beside the instruction name is derived from the same list, so the two spellings
of an operand cannot disagree.

`npm run extract` was the one-time conversion of the legacy `docs/index.html`
into `data/`. It emits the pre-2026 shape, which the loader no longer reads, so
it now refuses without `--force`; the parsing is kept as the record of how the
conversion was done.

## Verification

`npm run verify` checks that:

- every opcode's id and byte encoding agree with its prefix and code
- each section's opcodes are contiguous from its declared start
- every named instruction has a stack signature, bar the five delimiters
  (`else`, `catch`, `end`, `delegate`, `catch_all`) that have no stack effect of
  their own
- every immediate names a kind the renderer knows
- no visible text has been lost relative to the original page

The last check compares against `data/.legacy-help.json`, a snapshot of the old
page's help fragments. It is a migration safety net: once the opcode data has
been revised on its own terms the comparison stops being meaningful, and the
snapshot along with that check should be dropped.

## Publishing

Pushing to `main` builds the site and deploys it to GitHub Pages via
`.github/workflows/pages.yml`. Nothing generated is committed.

> **Note:** this needs the repository's Pages source set to **GitHub Actions**
> (Settings → Pages → Build and deployment → Source). While it is still set to
> "Deploy from a branch: main /docs", the workflow will build but the deploy step
> will not publish.

`docs/` holds the previous hand-written version. It stays until that switch is
made, then it can go.

## Licence

MIT or Apache-2.0, at your option.
