/**
 * Client entry point.
 *
 * The page arrives fully rendered — every cell and every description is already
 * in the HTML — so this script never builds the chart from scratch. It reorders
 * the nodes that are already there when the reader asks for a different
 * arrangement, and it owns the interactions that need JavaScript: the detail
 * panel, relationship highlighting, and the theme toggle.
 */

import type { Opcode, OpcodeData, SectionId } from '../model/types.ts';
import {
  buildView,
  countShown,
  DEFAULT_VIEW,
  visible,
  type ViewOptions,
} from '../model/view.ts';
import { prefixLine, prefixTable, type PrefixTable } from '../model/prefixes.ts';
import { renderItem, specLabel } from '../render/items.ts';
import { initAbout } from './about.ts';
import { flip } from './flip.ts';
import { Highlighter, type HighlightState } from './highlight.ts';
import { NavMap } from './map.ts';
import { Panel } from './panel.ts';
import { Results } from './results.ts';
import { Search, type SearchHit } from './search.ts';
import { initTheme } from './theme.ts';

const chart = document.getElementById('chart');
const toolbar = document.getElementById('toolbar') as HTMLFormElement | null;
const dataScript = document.getElementById('opcode-data');
const panelEl = document.getElementById('panel');
const detailsEl = document.getElementById('details');

// Independent of the chart, so the reference material is reachable even if the
// chart cannot start.
initAbout();

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
  // The page arrives already filtered, so the map has rows to drop before the
  // reader has touched anything.
  navMap?.trim(options);
  navMap?.observe();

  const highlighter = new Highlighter(mapEl ? [chart, mapEl] : [chart]);
  const panel = new Panel(panelEl, detailsEl, byId);
  panel.onClose(() => {
    highlighter.pin(null);
    history.replaceState(null, '', location.pathname + location.search);
  });

  const themeButton = document.getElementById('theme-toggle');
  if (themeButton) initTheme(themeButton);

  /*
   * The docked panel and the table's column headings stick to the top of the
   * window, and so does the toolbar once pinned. They need to know how tall it
   * is to sit below it rather than behind it, and it wraps to a different
   * number of lines at different widths, so the height is measured rather than
   * assumed.
   */
  const trackToolbarHeight = () => {
    const height = toolbar.classList.contains('toolbar-pinned')
      ? toolbar.getBoundingClientRect().height
      : 0;
    document.documentElement.style.setProperty('--toolbar-h', `${Math.round(height)}px`);
  };
  new ResizeObserver(trackToolbarHeight).observe(toolbar);

  // The toolbar is unpinned by default; the choice is remembered.
  const pin = document.getElementById('pin-toolbar');
  if (pin) {
    const setPinned = (on: boolean) => {
      toolbar.classList.toggle('toolbar-pinned', on);
      pin.setAttribute('aria-pressed', String(on));
      trackToolbarHeight();
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

  /*
   * The chart arrives from the server already carrying how it is coloured; the
   * map is built here, so nothing has told it. Only `readToolbar` set that, and
   * it does not run until the reader changes a control — so the map started
   * uncoloured and stayed that way until something, anything, was clicked. It
   * looked like colouring that worked in the card and table layouts but not in
   * the grid, because switching layout was the click that turned it on.
   */
  if (mapEl) mapEl.dataset['colour'] = chart.dataset['colour'] ?? '';

  /*
   * How wide the byte grid is folded.
   *
   * Sixteen bytes across is the shape a hex dump has trained everyone to read,
   * and it is what the page is rendered at. A phone has about half the width
   * for it, and sixteen columns there leaves a cell too narrow for a name like
   * `i32.trunc_sat_f64_u`, so the grid folds to eight and runs twice as far
   * down — the same bytes in the same order, refolded rather than shrunk.
   *
   * The breakpoint is the one the stylesheet already calls mobile, declared
   * once here and read from the media query rather than written down twice.
   */
  const narrow = window.matchMedia('(max-width: 900px)');
  const setColumns = (): boolean => {
    const wanted = narrow.matches ? 8 : 16;
    if (options.columns === wanted) return false;
    options.columns = wanted;
    chart.dataset['cols'] = String(wanted);
    return true;
  };
  chart.dataset['cols'] = String(options.columns);

  // The page arrives with the dormant sections already filtered out, so the
  // doorway bytes are advertising a table that is not there before the reader
  // has touched anything.
  syncPrefixLines();

  // --- arranging ----------------------------------------------------------

  /**
   * The four doorway bytes list the tables behind them; a table the reader has
   * turned off is not behind anything they can reach.
   *
   * Reference-typed strings is the case this exists for: it is dormant and
   * hidden by default, and `0xFB` advertising a string table at 128–159 while
   * no such table is on the page sends the reader looking for something that
   * is not there.
   */
  function syncPrefixLines(): void {
    // Deliberately blind to the search: a query is typed a letter at a time,
    // and a doorway whose range shrank on every keystroke would be reporting
    // the query rather than the byte.
    const unsearched: ViewOptions = { ...options, match: undefined };
    for (const cell of chart.querySelectorAll<HTMLElement>('.prefix-cell[data-tables]')) {
      const behind = JSON.parse(cell.dataset['tables']!) as { id: SectionId; emoji: string }[];
      const shown = behind
        .map(({ id, emoji }) =>
          prefixTable(
            id,
            emoji,
            data.opcodes.filter((op) => op.section === id && op.name && visible(op, unsearched)),
          ),
        )
        .filter((table): table is PrefixTable => table !== null);
      const line = cell.querySelector<HTMLElement>('.prefix-line');
      if (!line) continue;
      line.innerHTML = prefixLine(shown);
      line.hidden = !shown.length;
    }
  }

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

  function relayout(animate = true): void {
    const items = buildView(data, options);

    flip(chart, () => {
      const next: HTMLElement[] = [];
      for (const item of items) {
        const el = elementFor(item.key, () => renderItem(item));
        // Headings come from the pool with the count they were rendered with,
        // which is the count before whatever filter or search is now running.
        if (item.kind === 'group') {
          const badge = el.querySelector<HTMLElement>('.group-count');
          const count = el.querySelector('.count-n');
          if (count) count.textContent = String(item.count);
          if (badge) badge.hidden = item.count === 1;
        }
        if (item.kind === 'cell') {
          // A cell filtered out of the byte grid keeps its slot but is blanked.
          if (item.filtered) el.dataset['filtered'] = '1';
          else delete el.dataset['filtered'];
        }
        next.push(el);
      }
      chart.replaceChildren(...next);
      chart.dataset['layout'] = options.layout;
      // The table's column headings can only stick when there is one of them,
      // which is to say when nothing is grouped.
      chart.dataset['group'] = options.group;
      toolbar.dataset['layout'] = options.layout;
    }, animate);

    syncPrefixLines();

    // Both of these hold references into the chart's DOM, which has just been
    // rebuilt from the pool.
    highlighter.restore();
    navMap?.trim(options);
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
    const colour = form.get('colourByProposal') !== null ? 'proposal' : '';
    chart.dataset['colour'] = colour;
    if (mapEl) mapEl.dataset['colour'] = colour;
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

  /*
   * Grouping and sorting, remembered per layout.
   *
   * The two layouts are read differently and want arranging differently. The
   * table is an index: a heading per operation, alphabetically, with each
   * operation's encodings under it in byte order. The cards are a survey, and
   * category is the useful shelf to break them onto. One shared setting made
   * choosing an arrangement for one of them undo the arrangement of the other,
   * so each keeps its own — and keeps whatever the reader last chose in it,
   * rather than being reset to these on every visit.
   *
   * The byte grid has no entry: position there is the opcode, so neither
   * control applies and the toolbar dims both.
   */
  const arrangements: Record<string, { group: string; order: string }> = {
    cards: { group: 'category', order: 'opcode' },
    table: { group: 'name', order: 'opcode' },
  };

  const choose = (name: string, value: string): void => {
    const input = toolbar.querySelector<HTMLInputElement>(
      `input[name="${name}"][value="${value}"]`,
    );
    if (input) input.checked = true;
  };

  toolbar.addEventListener('change', (event) => {
    // The search box lives in the toolbar but is not one of its settings: it
    // fires `change` on blur, and re-laying the chart out for that would move
    // everything a second time for no reason.
    if ((event.target as HTMLElement).id === 'search') return;
    const target = event.target as HTMLInputElement;

    const current = arrangements[options.layout];
    if (current && (target.name === 'group' || target.name === 'order')) {
      current[target.name] = target.value;
    }

    if (target.name === 'layout' && target.value !== options.layout) {
      const wanted = arrangements[target.value];
      if (wanted) {
        choose('group', wanted.group);
        choose('order', wanted.order);
      }
    }

    readToolbar();
    updateBadge();
    updateSearchCount();
    relayout();
  });

  // --- what is lit ----------------------------------------------------------

  /*
   * "Only these": whatever is lit right now, kept, with everything else taken
   * away. It is the one thing on the page that hides instructions — the search
   * lights its matches and leaves the chart whole — and it works on any
   * highlight, so a query, a property chip and a hovered part of a name are all
   * narrowed the same way.
   *
   * A snapshot, taken when the key is pressed, rather than a live tie to the
   * highlight: the pointer has to move to reach anything, and a filter that
   * followed the pointer would empty the chart on the way.
   */
  let onlyKeys: Set<string> | null = null;

  function applyMatch(): void {
    options.match = onlyKeys ? (op: Opcode) => onlyKeys!.has(op.id) : undefined;
  }

  const caption = document.getElementById('map-caption');
  const captionWhat = caption?.querySelector<HTMLElement>('.map-caption-what');
  const onlyButton = document.getElementById('map-only');

  /** The label a property chip is drawn with, for a tag id. */
  function tagLabel(tag: string): string {
    const chip = document.querySelector<HTMLElement>(`.tag[data-tag="${CSS.escape(tag)}"]`);
    return chip?.textContent?.trim() ?? tag;
  }

  function countLabel(n: number): string {
    return `${n} opcode${n === 1 ? '' : 's'}`;
  }

  /**
   * The map in words.
   *
   * The squares say where the matches are and roughly how many; nothing said
   * what the question was, so a scatter of lit squares three seconds after the
   * pointer moved was unreadable — you could see an answer without knowing what
   * had been asked.
   */
  function updateCaption(state: HighlightState): void {
    if (!caption || !captionWhat || !onlyButton) return;

    let what = '';
    if (state.kind === 'pin' && state.key) {
      const op = byId.get(state.key);
      if (op) {
        what =
          `<span class="map-caption-lede">Selected</span> ${specLabel(op)} ` +
          `<span class="map-caption-name">${op.name ?? 'unassigned'}</span>`;
      }
    } else if (state.kind === 'tag' && state.tag) {
      what =
        `<span class="map-caption-lede">Tagged</span> ` +
        `<span class="map-caption-name">${tagLabel(state.tag)}</span> ` +
        `<span class="map-caption-count">${countLabel(state.keys.length)}</span>`;
    } else if (state.kind === 'hover' && state.token) {
      what =
        `<span class="map-caption-lede">Sharing</span> ` +
        `<span class="map-caption-name">${state.token}</span> ` +
        `<span class="map-caption-count">${countLabel(state.keys.length)}</span>`;
    } else if (state.kind === 'found') {
      what =
        `<span class="map-caption-lede">Found</span> ` +
        `<span class="map-caption-name">${state.query ?? ''}</span> ` +
        `<span class="map-caption-count">${countLabel(state.keys.length)}</span>`;
    }

    if (onlyKeys) {
      what +=
        `<span class="map-caption-only">showing only ${countLabel(onlyKeys.size)}</span>`;
    }

    captionWhat.innerHTML = what;
    onlyButton.hidden = !onlyKeys && !state.keys.length;
    onlyButton.setAttribute('aria-pressed', String(Boolean(onlyKeys)));
    caption.hidden = !what && onlyButton.hidden;
  }

  highlighter.onChange(updateCaption);

  /** Keeps whatever is lit and hides the rest; pressed again, puts it back. */
  function toggleOnly(): void {
    if (onlyKeys) {
      onlyKeys = null;
    } else {
      const state = highlighter.state();
      // Narrowing to a single cell is not narrowing, it is hiding the page. A
      // reader who searched, opened one of the results and then asked for only
      // these meant the results — the selection is where they are, not what
      // they asked about.
      const lit =
        state.kind === 'pin' && hits.length ? hits.map((hit) => hit.op.id) : state.keys;
      if (lit.length < 2) return;
      onlyKeys = new Set(lit);
    }
    applyMatch();
    updateSearchCount();
    relayout();
    updateCaption(highlighter.state());
  }

  onlyButton?.addEventListener('click', toggleOnly);

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      toggleOnly();
    } else if (event.key === 'Escape' && onlyKeys) {
      toggleOnly();
    }
  });

  // --- search ---------------------------------------------------------------

  const search = new Search(data, detailsEl);
  const searchInput = document.getElementById('search') as HTMLInputElement | null;
  const searchCount = document.getElementById('search-count');
  const searchEmpty = document.getElementById('search-empty');
  const emptyTerm = searchEmpty?.querySelector('.search-empty-term');
  const resultsEl = document.getElementById('search-results');
  let results: Results | null = null;
  let hits: SearchHit[] = [];

  /**
   * The running count, and the empty state.
   *
   * Counted against what the other filters leave rather than against the whole
   * data set, so the number describes the chart in front of the reader: with
   * the historical encodings hidden, `tag:signed` should not claim 106 matches
   * over a chart showing 103. It therefore has to be recomputed when those
   * filters change, not only when the query does.
   */
  function updateSearchCount(): void {
    const query = searchInput?.value.trim() ?? '';
    const total = countShown(data, { ...options, match: undefined });
    const found = hits.length;
    if (searchCount) searchCount.textContent = query ? `${found} of ${total}` : '';
    if (searchEmpty) searchEmpty.hidden = !query || found > 0;
    if (emptyTerm) emptyTerm.textContent = query;
  }

  /**
   * Applies whatever is in the box.
   *
   * A query no longer takes the chart apart. It lights what it found and lists
   * what it found, and the chart stays where it was — which is the difference
   * between "39 of 810" and being able to see that those 39 are the whole left
   * edge of one table. The reader who does want the rest gone presses F, which
   * is the same gesture for a search as for anything else lit.
   *
   * Unanimated by default: this runs while the reader is still typing, and
   * nothing is moving anyway.
   */
  function applySearch(animate = false): void {
    const query = searchInput?.value.trim() ?? '';
    hits = search.find(query);
    highlighter.found(new Set(hits.map((hit) => hit.op.id)), query);
    results?.show(document.activeElement === searchInput ? hits : []);
    updateSearchCount();

    // Shareable, and survives a reload: the URL carries the query alongside any
    // selected instruction in the hash.
    const url = new URL(location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);

    // Only the "only these" filter can change what is laid out now, and it does
    // not change while typing — but a rearrangement is still needed the first
    // time, to attach the highlight to the nodes on screen.
    if (animate || onlyKeys) relayout(animate);
  }

  let searchTimer = 0;
  searchInput?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    // Long enough to gather a burst of typing, short enough that the list looks
    // like it is following the query rather than catching up with it.
    searchTimer = window.setTimeout(() => applySearch(), 110);
  });

  /** Opens an instruction from the result list, wherever the chart has put it. */
  function reveal(key: string): void {
    const cell = chart.querySelector<HTMLElement>(`.cell[data-key="${CSS.escape(key)}"]`);
    panel.open(key);
    if (cell) {
      highlighter.pin(cell);
      cell.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    history.replaceState(null, '', `#${key}`);
  }

  results = searchInput && resultsEl ? new Results(resultsEl, searchInput, reveal) : null;

  searchInput?.addEventListener('focus', () => results?.show(hits));
  // A click inside the list is handled on mousedown, before this runs.
  searchInput?.addEventListener('blur', () => results?.hide());

  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!results?.open) return;
      event.preventDefault();
      results.move(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter') {
      // Never submits: the form would reload the page and lose everything.
      event.preventDefault();
      results?.choose();
      searchInput.blur();
      return;
    }
    if (event.key !== 'Escape') return;
    // Three things to back out of, innermost first: the list, then the query,
    // then the box itself.
    if (results?.open) {
      results.hide();
    } else if (searchInput.value) {
      searchInput.value = '';
      applySearch();
    } else {
      searchInput.blur();
    }
  });

  document.getElementById('search-clear')?.addEventListener('click', () => {
    if (!searchInput) return;
    searchInput.value = '';
    applySearch();
    searchInput.focus();
  });

  // `/` focuses the box, as it does nearly everywhere else — but never while
  // the reader is already typing into something.
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    searchInput?.focus();
    searchInput?.select();
  });

  // The page is rendered sixteen wide; on a phone it has to refold before the
  // reader sees it, and again if the window is turned or resized past the
  // breakpoint. Unanimated: nothing has moved from anywhere, it simply arrives
  // in a different shape.
  if (setColumns()) relayout(false);
  narrow.addEventListener('change', () => {
    if (setColumns()) relayout(false);
  });

  const startingQuery = new URLSearchParams(location.search).get('q');
  if (startingQuery && searchInput) {
    searchInput.value = startingQuery;
    applySearch();
  }

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

  /** Puts every filter back to how the page arrives. */
  document.getElementById('preset-default')?.addEventListener('click', () => {
    setChecks('section', () => true);
    for (const [name, on] of [
      ['showProposals', true],
      ['showReserved', true],
      ['showHistorical', false],
      ['colourByProposal', false],
    ] as [string, boolean][]) {
      const input = toolbar.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (input) input.checked = on;
    }
    readToolbar();
    updateBadge();
    updateSearchCount();
    relayout();
  });

  document.getElementById('preset-base')?.addEventListener('click', () => {
    setChecks('section', (value) => value === 'core');
    (toolbar.querySelector('input[name="showProposals"]') as HTMLInputElement).checked = false;
    readToolbar();
    updateBadge();
    updateSearchCount();
    relayout();
  });

  document.getElementById('preset-all')?.addEventListener('click', () => {
    setChecks('section', () => true);
    for (const name of ['showProposals', 'showReserved', 'showHistorical']) {
      (toolbar.querySelector(`input[name="${name}"]`) as HTMLInputElement).checked = true;
    }
    readToolbar();
    updateBadge();
    updateSearchCount();
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
