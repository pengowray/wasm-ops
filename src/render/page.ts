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
 * The data the client needs to rearrange the chart: everything except the
 * prose, which is already in the page as the detail block and would otherwise
 * be shipped twice. Roughly a fifth of the full dataset.
 */
function clientData(data: OpcodeData): string {
  const slim = {
    sections: data.sections,
    opcodes: data.opcodes.map(({ description, followedBy, stack, immediateArgs, ...rest }) => rest),
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
		<label><input type="radio" name="layout" value="list"> List</label>
	</fieldset>
	<fieldset class="control" data-when-layout="list">
		<legend>Group by</legend>
		<label><input type="radio" name="group" value="section" checked> Section</label>
		<label><input type="radio" name="group" value="category"> Category</label>
		<label><input type="radio" name="group" value="none"> Nothing</label>
	</fieldset>
	<fieldset class="control" data-when-layout="list">
		<legend>Sort by</legend>
		<label><input type="radio" name="order" value="opcode" checked> Opcode</label>
		<label><input type="radio" name="order" value="name"> Name</label>
	</fieldset>
	<fieldset class="control control-sections">
		<legend>Show</legend>
		${sectionToggles}
		<label class="toggle"><input type="checkbox" name="showProposals" checked><span>Proposals</span></label>
		<label class="toggle" data-when-layout="matrix"><input type="checkbox" name="showReserved" checked><span>Unassigned slots</span></label>
	</fieldset>
	<div class="control control-actions">
		<button type="button" id="preset-base" class="ghost">Base opcodes only</button>
		<button type="button" id="preset-all" class="ghost">Everything</button>
		<button type="button" id="theme-toggle" class="icon-button" aria-label="Switch colour theme" title="Switch colour theme">
			<svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><circle cx="12" cy="12" r="4.2"/><g class="rays"><line x1="12" y1="1.8" x2="12" y2="4.4"/><line x1="12" y1="19.6" x2="12" y2="22.2"/><line x1="1.8" y1="12" x2="4.4" y2="12"/><line x1="19.6" y1="12" x2="22.2" y2="12"/><line x1="4.8" y1="4.8" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="19.2" y2="19.2"/><line x1="4.8" y1="19.2" x2="6.6" y2="17.4"/><line x1="17.4" y1="6.6" x2="19.2" y2="4.8"/></g></svg>
			<svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="M20 14.4A8.6 8.6 0 0 1 9.6 4a8.6 8.6 0 1 0 10.4 10.4z"/></svg>
		</button>
	</div>
</form>

<main id="chart" class="chart" data-layout="${options.layout}">
${chart}
</main>

<aside id="panel" class="panel" hidden aria-live="polite">
	<div class="panel-head">
		<button type="button" class="icon-button panel-close" aria-label="Close details">&times;</button>
	</div>
	<div class="panel-body"></div>
</aside>

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
