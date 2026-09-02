import type { Opcode } from '../model/types.ts';

export interface WatExample {
  source: string;
  note: string;
  starterComplete: boolean;
}

const VALUE_TYPES = new Set(['i32', 'i64', 'f32', 'f64', 'v128']);

interface SimpleStack {
  inputs: string[];
  outputs: string[];
}

function plainStack(html: string): SimpleStack | null {
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&times;/g, '×')
    .replace(/&rarr;/g, '→')
    .replace(/\s+/g, ' ')
    .trim();
  const match = /^\[(.*)\]\s*→\s*\[(.*)\]$/.exec(text);
  if (!match) return null;

  const side = (raw: string): string[] | null => {
    const tokens = raw.trim() ? raw.trim().split(/\s+/) : [];
    return tokens.every((token) => VALUE_TYPES.has(token)) ? tokens : null;
  };
  const inputs = side(match[1]!);
  const outputs = side(match[2]!);
  return inputs && outputs ? { inputs, outputs } : null;
}

function scalar(valueType: string, value: number): string {
  if (valueType === 'v128') return 'v128.const i32x4 1 2 3 4';
  if (valueType === 'i64') return `i64.const ${Math.trunc(value)}`;
  if (valueType === 'f32') return `f32.const ${value}`;
  if (valueType === 'f64') return `f64.const ${value}`;
  return `i32.const ${Math.trunc(value)}`;
}

function sampleValues(op: Opcode, inputs: string[]): string[] {
  const operation = op.parts?.mainop ?? op.name?.split('.').at(-1) ?? '';
  let values = [6, 3, 2, 1];
  if (operation === 'add') values = [40, 2, 1, 1];
  else if (operation === 'sub') values = [44, 2, 1, 1];
  else if (operation === 'mul') values = [6, 7, 1, 1];
  else if (operation.startsWith('div')) values = [84, 2, 1, 1];
  else if (operation.startsWith('rem')) values = [43, 5, 1, 1];
  else if (['shl', 'shr', 'rotl', 'rotr'].includes(operation)) values = [1, 3, 1, 1];
  else if (operation === 'sqrt') values = [81, 1, 1, 1];

  return inputs.map((type, index) => scalar(type, values[index] ?? 1));
}

function immediates(op: Opcode): string {
  if (op.name === 'i8x16.shuffle') {
    return ` ${Array.from({ length: 16 }, (_, index) => String(index)).join(' ')}`;
  }

  const values = (op.immediates ?? []).flatMap((immediate) => {
    if (immediate.kind === 'memarg') return [];
    if (immediate.kind === 'ordering' || immediate.kind === 'rmw-ordering') return [];
    if (immediate.kind === 'laneidx') return ['0'];
    if (immediate.kind === 'valtype') return ['(result i32)'];
    if (immediate.encoding === 'u8[16]') return Array(16).fill('0');
    return ['0'];
  });
  return values.length ? ` ${values.join(' ')}` : '';
}

function moduleFor(body: string[], results: string[] = ['i32'], declarations = ''): string {
  const result = results.length ? ` (result ${results.join(' ')})` : '';
  const extras = declarations ? `\n${declarations.trimEnd()}\n` : '';
  return `(module${extras}\n  (func (export "run")${result}\n${body
    .map((line) => `    ${line}`)
    .join('\n')}\n  )\n)`;
}

function specialExample(op: Opcode): WatExample | null {
  const name = op.name;
  if (!name) return null;

  const examples: Record<string, { body: string[]; results?: string[]; declarations?: string; note: string }> = {
    unreachable: {
      body: ['unreachable'],
      results: [],
      note: 'Run it to see the trap reported by the host.',
    },
    nop: {
      body: ['nop', 'i32.const 7'],
      note: 'The no-op leaves execution unchanged, so the function returns 7.',
    },
    drop: {
      body: ['i32.const 99', 'drop', 'i32.const 7'],
      note: 'The temporary 99 is discarded; the function returns 7.',
    },
    select: {
      body: ['i32.const 40', 'i32.const 2', 'i32.const 1', 'select'],
      note: 'A non-zero condition selects the first value, 40.',
    },
    'select t': {
      body: ['i32.const 40', 'i32.const 2', 'i32.const 1', 'select (result i32)'],
      note: 'The typed form states the selected value type explicitly.',
    },
    block: {
      body: ['block', '  nop', 'end', 'i32.const 1'],
      note: 'A block groups a well-nested instruction sequence.',
    },
    loop: {
      body: ['loop', '  nop', 'end', 'i32.const 1'],
      note: 'A loop places its branch target at the beginning.',
    },
    if: {
      body: ['i32.const 1', 'if', '  nop', 'end', 'i32.const 1'],
      note: 'The non-zero condition enters the if body.',
    },
    else: {
      body: ['i32.const 0', 'if', '  unreachable', 'else', '  nop', 'end', 'i32.const 1'],
      note: 'A zero condition skips to the else arm.',
    },
    end: {
      body: ['block', '  nop', 'end', 'i32.const 1'],
      note: 'end closes the surrounding structured instruction.',
    },
    br: {
      body: ['block', '  br 0', '  unreachable', 'end', 'i32.const 1'],
      note: 'The branch jumps to the end of the surrounding block.',
    },
    br_if: {
      body: ['block', '  i32.const 1', '  br_if 0', '  unreachable', 'end', 'i32.const 1'],
      note: 'The non-zero condition takes the branch.',
    },
    br_table: {
      body: ['block', '  i32.const 0', '  br_table 0 0', '  unreachable', 'end', 'i32.const 1'],
      note: 'The index selects label 0 from the branch table.',
    },
    return: {
      body: ['i32.const 7', 'return', 'unreachable'],
      note: 'return exits the function immediately with 7.',
    },
    call: {
      body: ['call $answer'],
      declarations: '  (func $answer (result i32) i32.const 42)',
      note: 'The exported function calls a helper that returns 42.',
    },
    'local.get': {
      body: ['local.get $value'],
      declarations: '',
      note: 'The function reads its local value.',
    },
    'global.get': {
      body: ['global.get $value'],
      declarations: '  (global $value (export "value") (mut i32) (i32.const 42))',
      note: 'The exported global starts at 42 and is read by the function.',
    },
    'global.set': {
      body: ['i32.const 42', 'global.set $value', 'global.get $value'],
      declarations: '  (global $value (export "value") (mut i32) (i32.const 0))',
      note: 'The exported global changes from 0 to 42.',
    },
    'local.set': {
      body: ['i32.const 42', 'local.set $value', 'local.get $value'],
      declarations: '',
      note: 'The local changes from its zero default to 42.',
    },
    'local.tee': {
      body: ['i32.const 42', 'local.tee $value', 'drop', 'local.get $value'],
      declarations: '',
      note: 'tee stores 42 in the local and also leaves 42 on the stack.',
    },
    'memory.size': {
      body: ['memory.size'],
      declarations: '  (memory (export "memory") 1)',
      note: 'The memory starts with one 64 KiB page.',
    },
    'memory.grow': {
      body: ['i32.const 1', 'memory.grow'],
      declarations: '  (memory (export "memory") 1 2)',
      note: 'The function grows memory by one page and returns its previous size.',
    },
    'memory.init': {
      body: [
        'i32.const 0',
        'i32.const 0',
        'i32.const 4',
        'memory.init $bytes',
        'i32.const 0',
        'i32.load',
      ],
      declarations: '  (memory (export "memory") 1)\n  (data $bytes "\\2a\\00\\00\\00")',
      note: 'Four bytes from a passive data segment are copied into memory.',
    },
    'data.drop': {
      body: ['data.drop $bytes', 'i32.const 1'],
      declarations: '  (data $bytes "\\2a")',
      note: 'The passive data segment is discarded; 1 means the instruction completed.',
    },
    'memory.copy': {
      body: [
        'i32.const 4',
        'i32.const 0',
        'i32.const 4',
        'memory.copy',
        'i32.const 4',
        'i32.load',
      ],
      declarations: '  (memory (export "memory") 1)\n  (data (i32.const 0) "\\2a\\00\\00\\00")',
      note: 'Four bytes are copied from address 0 to address 4.',
    },
    'memory.fill': {
      body: ['i32.const 0', 'i32.const 65', 'i32.const 4', 'memory.fill', 'i32.const 0', 'i32.load'],
      declarations: '  (memory (export "memory") 1)',
      note: 'The first four bytes are filled with 0x41.',
    },
    'table.get': {
      body: ['i32.const 0', 'table.get $items', 'ref.is_null'],
      declarations: '  (table $items (export "table") 2 funcref)',
      note: 'The empty table slot contains a null function reference.',
    },
    'table.set': {
      body: ['i32.const 0', 'ref.func $item', 'table.set $items', 'i32.const 1'],
      declarations: '  (table $items (export "table") 2 funcref)\n  (func $item)\n  (elem declare func $item)',
      note: 'A function reference is written into table slot 0.',
    },
    'table.size': {
      body: ['table.size $items'],
      declarations: '  (table $items (export "table") 2 funcref)',
      note: 'The table starts with two elements.',
    },
    'table.grow': {
      body: ['ref.null func', 'i32.const 1', 'table.grow $items'],
      declarations: '  (table $items (export "table") 2 3 funcref)',
      note: 'The table grows by one slot and returns its previous size.',
    },
    'table.fill': {
      body: ['i32.const 0', 'ref.func $item', 'i32.const 2', 'table.fill $items', 'i32.const 1'],
      declarations: '  (table $items (export "table") 2 funcref)\n  (func $item)\n  (elem declare func $item)',
      note: 'Both table slots are filled with the same function reference.',
    },
    'table.init': {
      body: [
        'i32.const 0',
        'i32.const 0',
        'i32.const 1',
        'table.init $items $source',
        'i32.const 1',
      ],
      declarations: '  (table $items (export "table") 2 funcref)\n  (func $item)\n  (elem $source func $item)',
      note: 'One reference from a passive element segment is copied into the table.',
    },
    'elem.drop': {
      body: ['elem.drop $source', 'i32.const 1'],
      declarations: '  (func $item)\n  (elem $source func $item)',
      note: 'The passive element segment is discarded; 1 means the instruction completed.',
    },
    'table.copy': {
      body: [
        'i32.const 1',
        'i32.const 0',
        'i32.const 1',
        'table.copy $items $items',
        'i32.const 1',
      ],
      declarations: '  (table $items (export "table") 2 funcref)\n  (func $item)\n  (elem (i32.const 0) func $item)',
      note: 'One table entry is copied from slot 0 to slot 1.',
    },
    'atomic.fence': {
      body: ['atomic.fence', 'i32.const 1'],
      note: 'The fence completes before the function returns 1.',
    },
    'ref.null': {
      body: ['ref.null extern', 'ref.is_null'],
      note: 'The null reference is consumed by ref.is_null, which returns 1.',
    },
    'ref.is_null': {
      body: ['ref.null extern', 'ref.is_null'],
      note: 'A null reference tests true, producing 1.',
    },
    'ref.func': {
      body: ['ref.func $item', 'ref.is_null'],
      declarations: '  (func $item)\n  (elem declare func $item)',
      note: 'A reference to the helper function is non-null, so the test returns 0.',
    },
    'v128.const': {
      body: ['v128.const i32x4 1 2 3 4', 'drop', 'i32.const 1'],
      note: 'JavaScript cannot receive v128 values directly, so 1 means the vector was created.',
    },
  };

  if (name === 'local.get') {
    return {
      source: `(module\n  (func (export "run") (param $value i32) (result i32)\n    local.get $value\n  )\n)`,
      note: 'This example takes one argument; Run supplies 42.',
      starterComplete: true,
    };
  }

  if (name === 'local.set' || name === 'local.tee') {
    const example = examples[name]!;
    return {
      source: `(module\n  (func (export "run") (result i32) (local $value i32)\n${example.body
        .map((line) => `    ${line}`)
        .join('\n')}\n  )\n)`,
      note: example.note,
      starterComplete: true,
    };
  }

  const example = examples[name];
  if (!example) return null;
  return {
    source: moduleFor(example.body, example.results, example.declarations),
    note: example.note,
    starterComplete: true,
  };
}

function memoryExample(op: Opcode, stack: SimpleStack): WatExample {
  const name = op.name!;
  const body = sampleValues(op, stack.inputs);
  if (stack.inputs.length) body[0] = scalar(stack.inputs[0]!, 0);
  body.push(`${name}${immediates(op)}`);

  const observable = stack.outputs.every((type) => type !== 'v128');
  if (!observable) {
    for (const _ of stack.outputs) body.push('drop');
    body.push('i32.const 1');
  }

  const atomic = name.includes('atomic');
  const memory = atomic
    ? '  (memory (export "memory") 1 1 shared)'
    : '  (memory (export "memory") 1)';
  const declarations = `${memory}\n  (data (i32.const 0) "\\2a\\00\\00\\00\\08\\07\\06\\05\\04\\03\\02\\01")`;
  const compilerPending = op.proposal === 'half-precision';
  return {
    source: moduleFor(body, observable ? stack.outputs : ['i32'], declarations),
    note: compilerPending
      ? 'This proposal is newer than the bundled WAT compiler; the draft is ready for tool support to catch up.'
      : name.includes('store')
        ? 'The result includes a before/after view of the first 16 memory bytes.'
        : 'The memory begins with 42 at address 0; its first 16 bytes are shown with the result.',
    starterComplete: !compilerPending,
  };
}

function genericExample(op: Opcode, stack: SimpleStack): WatExample {
  const body = sampleValues(op, stack.inputs);
  body.push(`${op.name}${immediates(op)}`);

  const observable = stack.outputs.every((type) => type !== 'v128');
  if (!observable) {
    for (const _ of stack.outputs) body.push('drop');
    body.push('i32.const 1');
  }

  const compilerPending =
    op.proposal === 'wide-arithmetic' ||
    op.proposal === 'half-precision' ||
    op.name === 'pause';

  return {
    source: moduleFor(body, observable ? stack.outputs : ['i32']),
    note: compilerPending
      ? 'This proposal is newer than the bundled WAT compiler; the draft is ready for tool support to catch up.'
      : observable
        ? 'The constants are the operand stack; the returned value is the result.'
        : 'JavaScript cannot receive v128 values directly, so 1 means the instruction completed.',
    starterComplete: !compilerPending,
  };
}

export function exampleFor(op: Opcode): WatExample | null {
  if (!op.name || op.prefixFor?.length) return null;

  const special = specialExample(op);
  if (special) return special;

  const stack = op.stack ? plainStack(op.stack.html) : null;
  if (stack) {
    if (/load|store|atomic|memory\./.test(op.name)) return memoryExample(op, stack);
    return genericExample(op, stack);
  }

  const placeholderImmediates = immediates(op);
  return {
    source: `(module\n  (func (export "run")\n    ;; This instruction needs surrounding types or state.\n    ;; Add its operands above this line.\n    ${op.name}${placeholderImmediates}\n  )\n)`,
    note: 'This draft shows the instruction’s minimal spelling, but needs its surrounding types or state before it will validate.',
    starterComplete: false,
  };
}
