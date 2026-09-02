/**
 * Compiles every example advertised as ready to run.
 *
 * Drafts for instructions whose surrounding state cannot yet be generated are
 * deliberately excluded; the UI labels those as incomplete too.
 */

import wabtFactory from 'wabt';
import { exampleFor } from '../src/client/examples.ts';
import { loadData } from '../src/model/load.ts';

const features = {
  exceptions: true,
  mutable_globals: true,
  sat_float_to_int: true,
  sign_extension: true,
  simd: true,
  threads: true,
  function_references: true,
  multi_value: true,
  tail_call: true,
  bulk_memory: true,
  reference_types: true,
  gc: true,
  memory64: true,
  extended_const: true,
  relaxed_simd: true,
};

async function main(): Promise<void> {
  const wabt = await wabtFactory();
  const failures: string[] = [];
  let checked = 0;

  for (const op of loadData().opcodes) {
    const example = exampleFor(op);
    if (!example?.starterComplete) continue;
    checked++;

    try {
      const module = wabt.parseWat(`${op.id}.wat`, example.source, features);
      try {
        const binary = module.toBinary({ canonicalize_lebs: true }).buffer;
        if (!WebAssembly.validate(binary.buffer as ArrayBuffer)) {
          throw new Error('browser validation failed');
        }
      } finally {
        module.destroy();
      }
    } catch (error) {
      failures.push(`${op.id} (${op.name}): ${String(error).split('\n')[0]}`);
    }
  }

  if (failures.length) {
    console.error(`${failures.length} example(s) failed:`);
    failures.forEach((failure) => console.error(`  ${failure}`));
    process.exit(1);
  }
  console.log(`${checked} runnable WAT examples compile and validate`);
}

await main();
