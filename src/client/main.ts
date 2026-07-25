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
import { NavMap } from './map.ts';
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

  const byId = new Map(data.opcodes.map((op) => [op.id, op]));

  const mapEl = document.getElementById('map');
  const navMap = mapEl ? new NavMap(mapEl, chart, data) : null;

  const highlighter = new Highlighter(mapEl ? [chart, mapEl] : [chart]);
  const panel = new Panel(panelEl, detailsEl, byId);
  panel.onClose(() => {
    highlighter.pin(null);
    history.replaceState(null, '', location.pathname + location.search);
  });

  const themeButton = document.getElementById('theme-toggle');
  if (themeButton) initTheme(themeButton);

  // The toolbar is unpinned by default; the choice is remembered.
  const pin = document.getElementById('pin-toolbar');
  if (pin) {
    const setPinned = (on: boolean) => {
      toolbar.classList.toggle('pinned', on);
      pin.setAttribute('aria-pressed', String(on));
    };
    try {
      setPinned(localStorage.getItem('pinToolbar') === 'true');
    } catch {
      // Storage blocked; the toolbar just starts unpinned every time.
    }
    pin.addEventListener('click', () => {
      const on = pin.getAttribute('aria-pressed') !== 'true';
      setPinned(on);
      try {
        localStorage.setItem('pinToolbar', String(on));
      } catch {
        // As above.
      }
    });
  }

  /*
   * Clicking away closes the details. On a phone the sheet covers most of the
   * screen and the close button is a small target in a corner; tapping the page
   * behind it is the gesture people already expect. Clicks on another cell are
   * left alone, so moving from one instruction to the next still works.
   */
  document.addEventListener('click', (event) => {
    if (!panel.openKey) return;
    const target = event.target as Element;
    if (target.closest('#panel') || target.closest('.cell') || target.closest('.map-cell')) return;
    if (target.closest('#toolbar')) return;
    panel.close();
  });

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

    // Both of these hold references into the chart's DOM, which has just been
    // rebuilt from the pool.
    highlighter.restore();
    navMap?.observe();
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
    options.showHistorical = form.get('showHistorical') !== null;
  }

  const filter = document.getElementById('filter') as HTMLDetailsElement | null;
  const badge = filter?.querySelector<HTMLElement>('.filter-badge');

  /** Marks the collapsed filter control when something is being hidden. */
  function updateBadge(): void {
    if (!badge) return;
    const filtering =
      options.sections.length < data.sections.length ||
      !options.showProposals ||
      (options.layout === 'matrix' && !options.showReserved);
    badge.hidden = !filtering;
  }

  toolbar.addEventListener('change', () => {
    readToolbar();
    updateBadge();
    relayout();
  });

  // A dropdown that stays open after you click away from it reads as stuck.
  document.addEventListener('click', (event) => {
    if (!filter?.open) return;
    if (!filter.contains(event.target as Node)) filter.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && filter?.open) filter.open = false;
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
    updateBadge();
    relayout();
  });

  document.getElementById('preset-all')?.addEventListener('click', () => {
    setChecks('section', () => true);
    for (const name of ['showProposals', 'showReserved', 'showHistorical']) {
      (toolbar.querySelector(`input[name="${name}"]`) as HTMLInputElement).checked = true;
    }
    readToolbar();
    updateBadge();
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
    history.replaceState(null, '', `#${key}`);
  });

  // Property chips live inside the panel, which is rebuilt on every open, so
  // the listener sits on the document rather than on the chips.
  document.addEventListener('click', (event) => {
    const chip = (event.target as Element).closest<HTMLElement>('.tag');
    const tag = chip?.dataset['tag'];
    if (!tag) return;
    event.preventDefault();
    highlighter.pinTag(tag);
  });

  // --- deep links ---------------------------------------------------------

  // Ids look like `0x28` or `0xFD.256`. Matched case-insensitively against the
  // real keys rather than normalised by hand, since only the hex part has a
  // case to get wrong.
  const wanted = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  if (wanted) {
    const key = [...byId.keys()].find((id) => id.toLowerCase() === wanted);
    const cell = key
      ? chart.querySelector<HTMLElement>(`.cell[data-key="${CSS.escape(key)}"]`)
      : null;
    if (key && cell) {
      panel.open(key);
      highlighter.pin(cell);
      cell.scrollIntoView({ block: 'center' });
    }
  }
}
