Reference opcode lists used by `npm run audit`.

- `wabt-opcode.def` — from WebAssembly/wabt, include/wabt/opcode.def, fetched
  2026-07-25. Covers core, 0xFC, 0xFD (including relaxed SIMD) and 0xFE.
  It contains no 0xFB opcodes, so the GC and stringref sections are not
  checked against it.

These are snapshots, committed so an audit is reproducible and its findings
can be attributed to a specific version of the source.
