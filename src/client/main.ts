/**
 * Client entry point.
 *
 * The page arrives fully rendered — every cell and every description is already
 * in the HTML — so this script never builds the chart from scratch. It reorders
 * the nodes that are already there when the reader asks for a different
 * arrangement, and it owns the interactions that need JavaScript: the detail
 * panel, relationship highlighting, and the theme toggle.
 */

import type { OpcodeData, SectionId } from '../model/types.ts';
import { buildView, DEFAULT_VIEW, type ViewOptions } from '../model/view.ts';
import { renderItem } from '../render/items.ts';
import { flip } from './flip.ts';
import { Highlighter } from './highlight.ts';
import { Panel } from './panel.ts';
import { initTheme } from './theme.ts';

const chart = document.getElementById('chart');
const toolbar = document.getElementById('toolbar') as HTMLFormElement | null;
const dataScript = document.getElementById('opcode-data');
const panelEl = document.getElementById('panel');
const detailsEl = document.getElementById('details');

if (chart && toolbar && dataScript && panelEl && detailsEl) {
  start(chart, toolbar, JSON.parse(dataScript.textContent!) as OpcodeData, panelEl, detailsEl);
}

function start(
  chart: HTMLElement,
  toolbar: HTMLFormElement,
  data: OpcodeData,
  panelEl: HTMLElement,
  detailsEl: HTMLElement,
): void {
  const options: ViewOptions = { ...DEFAULT_VIEW, sections: [...DEFAULT_VIEW.sections] };

  // Every element the chart will ever need is already in the document. Keeping
  // them in a pool means a re-arrangement moves nodes rather than recreating
  // them, which is what lets the animation track individual cells.
  const pool = new Map<string, HTMLElement>();
  for (const el of Array.from(chart.children) as HTMLElement[]) {
    const key = el.dataset['key'];
    if (key) pool.set(key, el);
  }

  const highlighter = new Highlighter(chart);
  const panel = new Panel(panelEl, detailsEl);
  panel.onClose(() => {
    highlighter.pin(null);
    history.replaceState(null, '', location.pathname + location.search);
  });

  const themeButton = document.getElementById('theme-toggle');
  if (themeButton) initTheme(themeButton);

  toolbar.dataset['layout'] = options.layout;

  // --- arranging ----------------------------------------------------------

  const template = document.createElement('div');

  /**
   * The markup is built lazily: almost every key is already pooled from the
   * server-rendered page, and rendering all 864 cells again on each
   * rearrangement only to throw the strings away is pure waste.
   */
  function elementFor(key: string, render: () => string): HTMLElement {
    const existing = pool.get(key);
    if (existing) return existing;
    template.innerHTML = render();
    const el = template.firstElementChild as HTMLElement;
    pool.set(key, el);
    return el;
  }

  function relayout(): void {
    const items = buildView(data, options);

    flip(chart, () => {
      const next: HTMLElement[] = [];
      for (const item of items) {
        const el = elementFor(item.key, () => renderItem(item));
        if (item.kind === 'cell') {
          // A cell filtered out of the byte grid keeps its slot but is blanked.
          if (item.filtered) el.dataset['filtered'] = '1';
          else delete el.dataset['filtered'];
        }
        next.push(el);
      }
      chart.replaceChildren(...next);
      chart.dataset['layout'] = options.layout;
      toolbar.dataset['layout'] = options.layout;
    });

    highlighter.repin();
  }

  // --- controls -----------------------------------------------------------

  function readToolbar(): void {
    const form = new FormData(toolbar);
    options.layout = (form.get('layout') as ViewOptions['layout']) ?? 'matrix';
    options.group = (form.get('group') as ViewOptions['group']) ?? 'section';
    options.order = (form.get('order') as ViewOptions['order']) ?? 'opcode';
    options.sections = form.getAll('section') as SectionId[];
    options.showProposals = form.get('showProposals') !== null;
    options.showReserved = form.get('showReserved') !== null;
  }

  toolbar.addEventListener('change', () => {
    readToolbar();
    relayout();
  });

  // Submitting would reload the page and lose the arrangement.
  toolbar.addEventListener('submit', (event) => event.preventDefault());

  function setChecks(name: string, on: (value: string) => boolean): void {
    for (const input of toolbar.querySelectorAll<HTMLInputElement>(
      `input[name="${name}"]`,
    )) {
      input.checked = on(input.value);
    }
  }

  document.getElementById('preset-base')?.addEventListener('click', () => {
    setChecks('section', (value) => value === 'core');
    (toolbar.querySelector('input[name="showProposals"]') as HTMLInputElement).checked = false;
    readToolbar();
    relayout();
  });

  document.getElementById('preset-all')?.addEventListener('click', () => {
    setChecks('section', () => true);
    for (const name of ['showProposals', 'showReserved']) {
      (toolbar.querySelector(`input[name="${name}"]`) as HTMLInputElement).checked = true;
    }
    readToolbar();
    relayout();
  });

  // --- selecting ----------------------------------------------------------

  chart.addEventListener('click', (event) => {
    const cell = (event.target as Element).closest<HTMLElement>('.cell');
    if (!cell) return;

    // A cell that only links elsewhere (the prefix bytes) keeps its own links.
    if ((event.target as Element).closest('.jump')) return;
    // Leave modified clicks to the browser, so "open in new tab" still works.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

    const key = cell.dataset['key'];
    if (!key) return;

    event.preventDefault();
    if (panel.openKey === key) {
      panel.close();
      return;
    }
    panel.open(key);
    highlighter.pin(cell);
    history.replaceState(null, '', `#detail-${key}`);
  });

  // --- deep links ---------------------------------------------------------

  const match = /^#(?:detail-)?(0x[0-9A-Fa-f]+)$/.exec(location.hash);
  if (match) {
    const key = match[1]!.toUpperCase().replace('0X', '0x');
    const cell = chart.querySelector<HTMLElement>(`.cell[data-key="${CSS.escape(key)}"]`);
    if (cell) {
      panel.open(key);
      highlighter.pin(cell);
      cell.scrollIntoView({ block: 'center' });
    }
  }
}
