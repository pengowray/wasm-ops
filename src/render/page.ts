import type { OpcodeData } from '../model/types.ts';
import { buildView, DEFAULT_VIEW, type ViewOptions } from '../model/view.ts';
import { hasDetail, renderDetail, renderItem } from './items.ts';

/**
 * Runs before first paint to avoid a flash of the wrong theme, and to reveal
 * the controls only when there is JavaScript to make them work.
 */
const BOOTSTRAP = `
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  } catch (e) {}
})();
`.trim();

export interface PageContent {
  intro: string;
  footer: string;
}

/**
 * The data the client needs to rearrange the chart and build the encoding
 * breakdown: everything except the prose, which is already in the page as the
 * detail block and would otherwise be shipped twice.
 *
 * `immediateArgs` stays — it is a few words on forty instructions, and the
 * encoding block names the operands that follow the opcode.
 */
function clientData(data: OpcodeData): string {
  const slim = {
    sections: data.sections,
    opcodes: data.opcodes.map(({ description, followedBy, stack, ...rest }) => rest),
  };
  // `<` is escaped so the JSON can never terminate its own script element.
  return JSON.stringify(slim).replace(/</g, '\\u003c');
}

export function renderPage(
  data: OpcodeData,
  content: PageContent,
  options: ViewOptions = DEFAULT_VIEW,
): string {
  const items = buildView(data, options);
  const chart = items.map(renderItem).join('\n');
  const details = data.opcodes.filter(hasDetail).map(renderDetail).join('\n');

  const sectionToggles = data.sections
    .map(
      (section) =>
        `<label class="toggle"><input type="checkbox" name="section" value="${section.id}" checked>` +
        `<span>${section.emoji ? section.emoji + ' ' : ''}${section.title}</span></label>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebAssembly Opcode Table</title>
<meta name="description" content="A chart of every WebAssembly instruction, with its byte encoding, stack signature and description.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,700;1,400&family=Source+Code+Pro&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/site.css">
<script>${BOOTSTRAP}</script>
</head>
<body>

<header class="site-header">
	<h1>WebAssembly Opcodes</h1>
	<p class="byline">by Pengo Wray</p>
	<div class="lede">${content.intro}</div>
</header>

<form class="toolbar js-only" id="toolbar" aria-label="Chart display options">
	<fieldset class="control">
		<legend>Arrange</legend>
		<label><input type="radio" name="layout" value="matrix" checked> Byte grid</label>
		<label><input type="radio" name="layout" value="cards"> Cards</label>
		<label><input type="radio" name="layout" value="table"> Table</label>
	</fieldset>
	<fieldset class="control" data-needs-grouping>
		<legend>Group by</legend>
		<label><input type="radio" name="group" value="category" checked> Category</label>
		<label><input type="radio" name="group" value="section"> Section</label>
		<label><input type="radio" name="group" value="none"> Nothing</label>
	</fieldset>
	<fieldset class="control" data-needs-grouping>
		<legend>Sort by</legend>
		<label><input type="radio" name="order" value="opcode" checked> Opcode</label>
		<label title="Sort on the operation, so every store sits together"><input type="radio" name="order" value="name"> Name</label>
		<label title="Sort on the full name, keeping each type together"><input type="radio" name="order" value="type-name"> Type + name</label>
	</fieldset>
	<!-- Filtering is occasional, so it folds away rather than sitting across the
	     toolbar. A <details> keeps it working as a disclosure without script. -->
	<details class="control control-filter" id="filter">
		<summary>Show<span class="filter-badge" hidden></span></summary>
		<div class="filter-panel">
			<div class="filter-group">
				${sectionToggles}
			</div>
			<div class="filter-group">
				<label class="toggle"><input type="checkbox" name="showProposals" checked><span>Proposals</span></label>
				<label class="toggle" data-matrix-only><input type="checkbox" name="showReserved" checked><span>Unassigned slots</span></label>
				<label class="toggle" title="Superseded, abandoned and stalled encodings — not what these bytes mean today"><input type="checkbox" name="showHistorical"><span>Legacy, withdrawn &amp; dormant</span></label>
			</div>
			<div class="filter-group filter-presets">
				<button type="button" id="preset-base" class="ghost">Base opcodes only</button>
				<button type="button" id="preset-all" class="ghost">Everything</button>
			</div>
		</div>
	</details>
	<div class="control control-actions">
		<button type="button" id="pin-toolbar" class="icon-button" aria-pressed="false" aria-label="Keep these controls on screen" title="Keep these controls on screen">
			<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path d="M9 3h6l-1 6 4 3v2h-5v7l-1 0-1 0v-7H6v-2l4-3z"/></svg>
		</button>
		<button type="button" id="theme-toggle" class="icon-button" aria-label="Switch colour theme" title="Switch colour theme">
			<svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><circle cx="12" cy="12" r="4.2"/><g class="rays"><line x1="12" y1="1.8" x2="12" y2="4.4"/><line x1="12" y1="19.6" x2="12" y2="22.2"/><line x1="1.8" y1="12" x2="4.4" y2="12"/><line x1="19.6" y1="12" x2="22.2" y2="12"/><line x1="4.8" y1="4.8" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.2" y2="19.2"/><line x1="4.8" y1="19.2" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="19.2" y2="4.8"/></g></svg>
			<svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="M20 14.4A8.6 8.6 0 0 1 9.6 4a8.6 8.6 0 1 0 10.4 10.4z"/></svg>
		</button>
	</div>
</form>

<div class="layout">

<!-- Filled in by the client: the map is a miniature of the byte grids, entirely
     derivable from the data, so it is not worth repeating in the markup. Where
     it sits is decided by CSS — beside the chart when the window is wide enough,
     otherwise folded up above it. -->
<aside class="map-dock js-only" id="map-dock">
	<details class="map-fold" id="map-fold" open>
		<summary>Map</summary>
		<div class="map" id="map"></div>
	</details>
</aside>

<main id="chart" class="chart" data-layout="${options.layout}">
${chart}
</main>

<!-- Inside the layout, so that on a wide window it can take a column of its own
     and the chart reflows beside it instead of running underneath. On a narrow
     one it goes back to being a sheet over the top. -->
<aside id="panel" class="panel js-only" data-open="false" aria-live="polite">
	<div class="panel-head">
		<button type="button" class="icon-button panel-close" aria-label="Close details">&times;</button>
	</div>
	<div class="panel-body"></div>
	<p class="panel-empty">Select an instruction to see its details.</p>
</aside>

</div>

<section id="details" class="details">
	<h2 class="details-heading">Instruction reference</h2>
${details}
</section>

<footer class="site-footer">
${content.footer}
</footer>

<script type="application/json" id="opcode-data">${clientData(data)}</script>
<script src="assets/main.js" defer></script>
</body>
</html>
`;
}
