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
import { plainName, renderItem, specText } from '../render/items.ts';
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

  /*
   * The search box lives in the masthead, and rides with the controls whenever
   * the controls stay put.
   *
   * It belongs at the top of the page because it is the fastest way to the one
   * instruction someone came for — but it is also the only control wanted
   * *while* reading rather than before, and the masthead scrolls away. So when
   * the reader pins the toolbar, the box moves into it and stays on screen with
   * it; unpinned, it goes home. One box, in whichever of the two is there.
   *
   * Moving a node blurs anything focused inside it, so the cursor and selection
   * are put back by hand. That only matters if the pin is pressed mid-query,
   * which is rare and would be baffling if it swallowed what you were typing.
   */
  const searchBox = document.querySelector<HTMLElement>('.control-search');
  const searchHome = searchBox?.parentElement ?? null;

  function dockSearch(pinned: boolean): void {
    if (!searchBox || !searchHome) return;
    const into = pinned ? toolbar : searchHome;
    if (searchBox.parentElement === into) return;

    const input = searchBox.querySelector<HTMLInputElement>('#search');
    const focused = document.activeElement === input;
    const at = focused ? [input!.selectionStart, input!.selectionEnd] : null;

    if (pinned) toolbar.prepend(searchBox);
    else searchHome.insertBefore(searchBox, searchHome.querySelector('.header-meta'));

    if (focused && input) {
      input.focus({ preventScroll: true });
      if (at?.[0] !== null && at?.[1] !== null) input.setSelectionRange(at![0]!, at![1]!);
    }
  }

  // The toolbar is unpinned by default; the choice is remembered.
  const pin = document.getElementById('pin-toolbar');
  if (pin) {
    const setPinned = (on: boolean) => {
      toolbar.classList.toggle('toolbar-pinned', on);
      pin.setAttribute('aria-pressed', String(on));
      dockSearch(on);
      // After the move, so the height it reports is the height it now has.
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
    // The search box moved out of the toolbar and into the masthead; typing
    // into it is not a click on the page behind the sheet.
    if (target.closest('#toolbar') || target.closest('.control-search')) return;
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
      const behind = JSON.parse(cell.dataset['tables']!) as { id: SectionId; mark: string }[];
      const shown = behind
        .map(({ id, mark }) =>
          prefixTable(
            id,
            mark,
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
          if (badge) badge.hidden = item.count <= 1;
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
      options.sections.length < data.sections.length || !options.showProposals;
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

  /** The label a property chip is drawn with, for a tag id. */
  function tagLabel(tag: string): string {
    const chip = document.querySelector<HTMLElement>(`.tag[data-tag="${CSS.escape(tag)}"]`);
    return chip?.textContent?.trim() ?? tag;
  }

  function countLabel(n: number): string {
    return `${n} opcode${n === 1 ? '' : 's'}`;
  }

  /**
   * The map in words — as the map's own tooltip, not as a line under it.
   *
   * It began as a line on the page, and could not stay there. The rail is sized
   * by its widest child, so any text in it sets the width of the whole column,
   * which sets the width of the chart. Text that changes as the pointer moves
   * therefore resizes the chart as the pointer moves, and since this text
   * reports what is highlighted, the chart it resized fed back into what it
   * said next. Every fix for that was a fight with intrinsic sizing.
   *
   * A tooltip has no width of its own to give away. It is a worse place for a
   * label and a much better place than one that moves the page — and the thing
   * it labels, the map, is already the thing the pointer is on when the
   * question is worth asking.
   */
  function describeHighlight(state: HighlightState): void {
    if (!mapEl) return;

    let what = '';
    if (state.kind === 'pin' && state.key) {
      const op = byId.get(state.key);
      if (op) what = `Selected ${specText(op)} ${plainName(op)}`;
    } else if (state.kind === 'tag' && state.tag) {
      what = `Tagged ${tagLabel(state.tag)} — ${countLabel(state.keys.length)}`;
    } else if (state.kind === 'hover' && state.token) {
      what = `Sharing ${state.token} — ${countLabel(state.keys.length)}`;
    } else if (state.kind === 'found') {
      what = `Found ${state.query ?? ''} — ${countLabel(state.keys.length)}`;
    }

    const lines = [what];
    if (onlyKeys) lines.push(`Showing only these ${onlyKeys.size}. L or Escape to show the rest.`);
    else if (narrowTarget().length) lines.push('Press L to show only these.');

    mapEl.title = lines.filter(Boolean).join('\n');
  }

  highlighter.onChange(describeHighlight);

  /**
   * What "only these" would keep, given what is lit.
   *
   * Narrowing to a single cell is not narrowing, it is hiding the page, so a
   * lone selection is not an offer — unless a search is running, in which case
   * the reader who opened one of the results and then asked for only these
   * meant the results. The selection is where they are, not what they asked
   * about.
   */
  function narrowTarget(): string[] {
    const state = highlighter.state();
    const lit = state.kind === 'pin' && hits.length ? hits.map((hit) => hit.op.id) : state.keys;
    return lit.length < 2 ? [] : lit;
  }

  /** Keeps whatever is lit and hides the rest; pressed again, puts it back. */
  function toggleOnly(): void {
    if (onlyKeys) {
      onlyKeys = null;
    } else {
      const lit = narrowTarget();
      if (!lit.length) return;
      onlyKeys = new Set(lit);
    }
    applyMatch();
    updateSearchCount();
    relayout();
    describeHighlight(highlighter.state());
  }

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    if (event.key === 'l' || event.key === 'L') {
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
  const clearX = document.getElementById('search-x') as HTMLButtonElement | null;
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
    // Against the raw value rather than the trimmed query: a box holding a
    // space has something in it to clear, and looks like it does.
    if (clearX) clearX.hidden = !searchInput?.value;
    if (searchEmpty) searchEmpty.hidden = !query || found > 0;
    if (emptyTerm) emptyTerm.textContent = query;
  }

  /**
   * Applies whatever is in the box.
   *
   * A query no longer takes the chart apart. It lights what it found and lists
   * what it found, and the chart stays where it was — which is the difference
   * between "39 of 810" and being able to see that those 39 are the whole left
   * edge of one table. The reader who does want the rest gone presses L, which
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
    // The cross follows the keystroke, not the debounced search behind it.
    if (clearX) clearX.hidden = !searchInput.value;
    window.clearTimeout(searchTimer);
    // Long enough to gather a burst of typing, short enough that the list looks
    // like it is following the query rather than catching up with it.
    searchTimer = window.setTimeout(() => applySearch(), 110);
  });

  /**
   * Opens an instruction from the result list, wherever the chart has put it.
   *
   * Choosing a result ends the search, as far as the chart is concerned: the
   * reader asked which of the matches they meant and then answered it, so the
   * other thirty-eight stop being lit and this one is the only thing marked.
   * Leaving them lit meant scrolling to a cell that arrived indistinguishable
   * from its neighbours — every one of them in the same found colour, with the
   * selection outline the single quiet difference.
   *
   * The query itself stays in the box, so the list is one keystroke away again
   * and the count still says what it found.
   */
  function reveal(key: string): void {
    const cell = chart.querySelector<HTMLElement>(`.cell[data-key="${CSS.escape(key)}"]`);
    highlighter.found(null, '');
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

  /*
   * `mousedown` would blur the box before the click landed, which hides the
   * result list and, on the masthead, is a visible flicker. Suppressing it
   * leaves the cursor where it was: cleared and still ready to type.
   */
  clearX?.addEventListener('mousedown', (event) => event.preventDefault());
  clearX?.addEventListener('click', () => {
    if (!searchInput) return;
    searchInput.value = '';
    applySearch();
    searchInput.focus();
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
    for (const name of ['showProposals', 'showHistorical']) {
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
