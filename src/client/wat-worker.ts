import wabtFactory from 'wabt';

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

interface CompileRequest {
  id: number;
  source: string;
}

const wabt = wabtFactory();

self.addEventListener('message', async (event: MessageEvent<CompileRequest>) => {
  const { id, source } = event.data;
  try {
    const api = await wabt;
    const module = api.parseWat('example.wat', source, features);
    try {
      module.resolveNames();
      try {
        module.validate();
      } catch (error) {
        // wabt.js 1.0.39 validates shared memories as if the threads feature
        // were off even when parseWat received `threads: true`. It still emits
        // the correct binary, which the browser validates below on the main
        // thread. Keep WAT-level validation for every other failure.
        if (!String(error).includes('memories may not be shared')) throw error;
      }
      const binary = module.toBinary({ canonicalize_lebs: true, write_debug_names: true });
      const buffer = binary.buffer.slice();
      self.postMessage({ id, ok: true, buffer }, { transfer: [buffer.buffer] });
    } finally {
      module.destroy();
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
