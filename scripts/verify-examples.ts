/**
 * Compiles and executes every supported example. Unsupported examples are
 * deliberately active (not commented-out spellings), visibly marked, and
 * checked to ensure that the bundled compiler or runtime really rejects them.
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
  let runnable = 0;
  let unsupported = 0;

  for (const op of loadData().opcodes) {
    const example = exampleFor(op);
    if (!example) continue;
    checked++;

    const watName = op.name === 'select t' ? 'select' : op.name!;
    if (!example.source.includes(watName)) {
      failures.push(`${op.id} (${op.name}): source does not name its instruction`);
      continue;
    }
    if (op.name?.includes('atomic') && !example.source.includes('worker or thread')) {
      failures.push(`${op.id} (${op.name}): atomic example does not explain its concurrency context`);
      continue;
    }

    if (!example.starterComplete) {
      const expectedMarker =
        example.unsupportedKind === 'future' ? 'FUTURE SYNTAX:' : 'KNOWN INVALID:';
      if (!example.source.includes(expectedMarker)) {
        failures.push(`${op.id} (${op.name}): unsupported source is not clearly marked`);
        continue;
      }

      let rejected = false;
      let module: ReturnType<typeof wabt.parseWat> | undefined;
      try {
        module = wabt.parseWat(`${op.id}.wat`, example.source, features);
        const binary = module.toBinary({ canonicalize_lebs: true }).buffer;
        const buffer = binary.buffer as ArrayBuffer;
        if (!WebAssembly.validate(buffer)) {
          rejected = true;
        } else {
          await WebAssembly.instantiate(buffer, {});
        }
      } catch {
        rejected = true;
      } finally {
        module?.destroy();
      }

      if (!rejected) {
        failures.push(`${op.id} (${op.name}): marked unsupported but compiles and instantiates`);
      } else {
        unsupported++;
      }
      continue;
    }

    try {
      const module = wabt.parseWat(`${op.id}.wat`, example.source, features);
      try {
        const binary = module.toBinary({ canonicalize_lebs: true }).buffer;
        const buffer = binary.buffer as ArrayBuffer;
        if (!WebAssembly.validate(buffer)) {
          throw new Error('browser validation failed');
        }
        const instance = await WebAssembly.instantiate(buffer, {});
        const run = instance.instance.exports['run'];
        if (typeof run !== 'function') throw new Error('runnable example has no run export');
        runnable++;
        let result: unknown;
        try {
          result = run(...Array.from({ length: run.length }, () => 42));
          if (op.name === 'unreachable') throw new Error('unreachable did not trap');
        } catch (error) {
          if (op.name !== 'unreachable') throw error;
        }

        const shouldReturnNonZero =
          /^i(?:32|64)\.(?:add|sub|mul|div_[su]|rem_[su]|and|or|xor|shl|shr_[su]|rotl|rotr|clz|ctz|popcnt|eqz|eq|ne|lt_[su]|gt_[su]|le_[su]|ge_[su])$/.test(
            op.name ?? '',
          );
        if (shouldReturnNonZero) {
          if (result === 0 || result === 0n) throw new Error('example returns a trivial zero');
        }

        if (op.stack?.html.match(/→\s*\[[^\]]*v128/)) {
          if (!example.source.includes('extract_lane')) {
            throw new Error('vector result is not projected to a visible lane');
          }
          if (result === undefined || (typeof result === 'number' && Number.isNaN(result))) {
            throw new Error('vector projection does not produce a readable value');
          }
        }
        if (op.name === 'f64x2.min' && result !== 3) {
          throw new Error(`expected lane 0 to demonstrate min with 3, received ${String(result)}`);
        }
        if (example.source.includes('(memory ') && (result === 42 || result === 42n)) {
          throw new Error('memory example returns the generic fixture value 42');
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
  console.log(
    `${runnable} runnable WAT examples compile and execute; ` +
      `${unsupported} unsupported examples fail as documented (${checked} total)`,
  );
}

await main();
