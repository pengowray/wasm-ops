/**
 * Builds the static site into dist/.
 *
 * The whole page is rendered here: every cell, every description, the default
 * arrangement. The client bundle only rearranges what this produces, so the
 * page is complete and readable before any script runs.
 *
 *   npm run build
 */

import { mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { build as esbuild } from 'esbuild';
import { loadData } from '../model/load.ts';
import { renderPage } from '../render/page.ts';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = join(ROOT, 'dist');
const ASSETS = join(DIST, 'assets');

async function main(): Promise<void> {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(ASSETS, { recursive: true });

  const data = loadData();
  const content = {
    intro: readFileSync(join(ROOT, 'content', 'intro.html'), 'utf8'),
    footer: readFileSync(join(ROOT, 'content', 'footer.html'), 'utf8'),
  };

  const html = renderPage(data, content);
  writeFileSync(join(DIST, 'index.html'), html, 'utf8');

  copyFileSync(join(ROOT, 'src', 'styles', 'site.css'), join(ASSETS, 'site.css'));

  await esbuild({
    entryPoints: [join(ROOT, 'src', 'client', 'main.ts')],
    outfile: join(ASSETS, 'main.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2022'],
    sourcemap: true,
    logLevel: 'warning',
  });

  // The custom domain has to be republished with every deploy or Pages drops it.
  const cname = join(ROOT, 'docs', 'CNAME');
  if (existsSync(cname)) copyFileSync(cname, join(DIST, 'CNAME'));

  const size = (path: string) => `${(readFileSync(path).byteLength / 1024).toFixed(0)} kB`;
  console.log(`index.html      ${size(join(DIST, 'index.html'))}`);
  console.log(`assets/site.css ${size(join(ASSETS, 'site.css'))}`);
  console.log(`assets/main.js  ${size(join(ASSETS, 'main.js'))}`);
  console.log(`${data.opcodes.length} opcodes, ${data.sections.length} sections`);
}

await main();
