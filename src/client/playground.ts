import type { Opcode } from '../model/types.ts';
import { exampleFor, type WatExample } from './examples.ts';

interface WorkerReply {
  id: number;
  ok: boolean;
  buffer?: Uint8Array;
  error?: string;
}

interface Snapshot {
  memory?: Uint8Array;
  globals: Record<string, unknown>;
  tables: Record<string, number>;
}

class WatCompiler {
  #worker: Worker | null = null;
  #nextId = 0;
  #pending = new Map<number, { resolve: (buffer: Uint8Array) => void; reject: (error: Error) => void }>();

  compile(source: string): Promise<Uint8Array> {
    if (!this.#worker) {
      this.#worker = new Worker(new URL('assets/wat-worker.js', document.baseURI));
      this.#worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
        const reply = event.data;
        const pending = this.#pending.get(reply.id);
        if (!pending) return;
        this.#pending.delete(reply.id);
        if (reply.ok && reply.buffer) pending.resolve(reply.buffer);
        else pending.reject(new Error(reply.error ?? 'The WAT compiler failed.'));
      });
      this.#worker.addEventListener('error', (event) => {
        const error = new Error(event.message || 'The WAT compiler could not start.');
        for (const pending of this.#pending.values()) pending.reject(error);
        this.#pending.clear();
        this.#worker?.terminate();
        this.#worker = null;
      });
    }

    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker!.postMessage({ id, source });
    });
  }
}

const compiler = new WatCompiler();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printable(value: unknown): string {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (Array.isArray(value)) return `[${value.map(printable).join(', ')}]`;
  if (value === undefined) return 'completed';
  return String(value);
}

function snapshot(exports: WebAssembly.Exports): Snapshot {
  const state: Snapshot = { globals: {}, tables: {} };
  for (const [name, value] of Object.entries(exports)) {
    if (value instanceof WebAssembly.Memory && !state.memory) {
      state.memory = new Uint8Array(value.buffer.slice(0, 16));
    } else if (value instanceof WebAssembly.Global) {
      state.globals[name] = value.value;
    } else if (value instanceof WebAssembly.Table) {
      state.tables[name] = value.length;
    }
  }
  return state;
}

function hex(bytes: Uint8Array): string {
  const rows: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8) {
    const values = Array.from(bytes.slice(offset, offset + 8), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(' ');
    rows.push(`${offset.toString(16).padStart(2, '0')}:  ${values}`);
  }
  return rows.join('\n');
}

function stateRow(label: string, before: string, after: string): string {
  return (
    `<div class="example-state-row"><span class="state-name">${label}</span>` +
    `<div class="state-snapshot"><span>Before</span><code>${before}</code></div>` +
    `<span class="state-arrow" aria-hidden="true"></span>` +
    `<div class="state-snapshot"><span>After</span><code>${after}</code></div></div>`
  );
}

function stateRows(before: Snapshot, after: Snapshot): string {
  const rows: string[] = [];
  if (before.memory && after.memory) {
    rows.push(stateRow('Memory 0–15', hex(before.memory), hex(after.memory)));
  }
  for (const name of new Set([...Object.keys(before.globals), ...Object.keys(after.globals)])) {
    rows.push(
      stateRow(
        `Global ${escapeHtml(name)}`,
        escapeHtml(printable(before.globals[name])),
        escapeHtml(printable(after.globals[name])),
      ),
    );
  }
  for (const name of new Set([...Object.keys(before.tables), ...Object.keys(after.tables)])) {
    rows.push(
      stateRow(
        `Table ${escapeHtml(name)} length`,
        String(before.tables[name]),
        String(after.tables[name]),
      ),
    );
  }
  return rows.join('');
}

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error:\s*/, '')
    .replace(/example\.wat:/g, 'line ')
    .replace(/\n+\^+\n?/g, '\n')
    .trim();
}

export class Playground {
  #root: HTMLElement;
  #example: WatExample;
  #editor: HTMLTextAreaElement;
  #output: HTMLElement;
  #run: HTMLButtonElement;
  #expand: HTMLButtonElement;
  #running = false;

  constructor(op: Opcode) {
    this.#example = exampleFor(op)!;
    const root = document.createElement('section');
    root.className = 'example-shell';
    root.innerHTML = `
      <div class="example-heading">
        <h4>Example</h4>
        <button type="button" class="icon-button example-expand" aria-pressed="false"
          aria-label="Expand example" title="Expand example">
          <svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17">
            <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>
          </svg>
        </button>
      </div>
      <p class="example-note" id="example-note">${escapeHtml(this.#example.note)}</p>
      <div class="example-workspace">
        <div class="example-editor-pane">
          <label class="example-label" for="wat-editor">WAT</label>
          <textarea id="wat-editor" class="wat-editor" spellcheck="false" autocapitalize="off"
            autocomplete="off" aria-describedby="example-note">${escapeHtml(this.#example.source)}</textarea>
          <div class="example-actions">
            <button type="button" class="example-run">Run</button>
            <button type="button" class="ghost example-reset">Reset</button>
          </div>
        </div>
        <div class="example-output-pane">
          <span class="example-label">Result</span>
          <div class="example-output" role="status" aria-live="polite">
            ${this.#example.starterComplete
              ? 'Run the example to compile and execute it.'
              : 'This documentation-only module compiles, but has no run export.'}
          </div>
        </div>
      </div>`;

    this.#root = root;
    this.#editor = root.querySelector('.wat-editor')!;
    this.#output = root.querySelector('.example-output')!;
    this.#run = root.querySelector('.example-run')!;
    this.#expand = root.querySelector('.example-expand')!;

    this.#run.addEventListener('click', () => void this.#execute());
    root.querySelector('.example-reset')?.addEventListener('click', () => {
      this.#editor.value = this.#example.source;
      this.#output.textContent = this.#example.starterComplete
        ? 'Run the example to compile and execute it.'
        : 'This documentation-only module compiles, but has no run export.';
    });
    this.#expand.addEventListener('click', () => this.toggleExpanded());
    this.#editor.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void this.#execute();
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const start = this.#editor.selectionStart;
        this.#editor.setRangeText('  ', start, this.#editor.selectionEnd, 'end');
      }
    });
  }

  get element(): HTMLElement {
    return this.#root;
  }

  get expanded(): boolean {
    return this.#root.dataset['expanded'] === 'true';
  }

  toggleExpanded(force?: boolean): void {
    const expanded = force ?? !this.expanded;
    this.#root.dataset['expanded'] = String(expanded);
    this.#expand.setAttribute('aria-pressed', String(expanded));
    this.#expand.setAttribute('aria-label', expanded ? 'Collapse example' : 'Expand example');
    this.#expand.title = expanded ? 'Collapse example' : 'Expand example';
    document.body.classList.toggle('example-expanded', expanded);
    if (expanded) this.#editor.focus();
  }

  destroy(): void {
    if (this.expanded) document.body.classList.remove('example-expanded');
  }

  async #execute(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#run.disabled = true;
    this.#run.textContent = 'Running…';
    this.#output.innerHTML = '<span class="example-progress">Compiling WAT…</span>';
    const started = performance.now();

    try {
      const bytes = await compiler.compile(this.#editor.value);
      const wasmModule = await WebAssembly.compile(bytes.buffer as ArrayBuffer);
      const instance = await WebAssembly.instantiate(wasmModule, {});
      const before = snapshot(instance.exports);
      const run = instance.exports['run'];
      let value: unknown;
      if (typeof run === 'function') {
        const arity = run.length;
        value = run(...Array.from({ length: arity }, () => 42));
      }
      const after = snapshot(instance.exports);
      const elapsed = performance.now() - started;
      const states = stateRows(before, after);
      this.#output.innerHTML =
        `<strong class="example-value">${escapeHtml(
          typeof run === 'function' ? printable(value) : 'compiled',
        )}</strong>` +
        (states ? `<div class="example-state">${states}</div>` : '') +
        `<p class="example-meta">${bytes.byteLength} bytes · ${elapsed.toFixed(1)} ms` +
        (typeof run === 'function' ? '' : ' · no <code>run</code> export') +
        `</p>`;
    } catch (error) {
      this.#output.innerHTML =
        `<strong class="example-error-title">Could not run</strong>` +
        `<pre class="example-error">${escapeHtml(cleanError(error))}</pre>`;
    } finally {
      this.#running = false;
      this.#run.disabled = false;
      this.#run.textContent = 'Run';
    }
  }
}
