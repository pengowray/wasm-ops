import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Opcode, OpcodeData, Section, SectionId } from './types.ts';

/** Section files, in the order they appear on the page. */
export const SECTION_ORDER: SectionId[] = [
  'core',
  'gc',
  'stringref',
  'fc',
  'simd',
  'simd-ext',
  'threads',
];

const DATA_DIR = join(
  new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  'data',
);

interface SectionFile {
  section: Section;
  opcodes: Opcode[];
}

/** Reads every section file and concatenates them into one dataset. */
export function loadData(dir: string = DATA_DIR): OpcodeData {
  const sections: Section[] = [];
  const opcodes: Opcode[] = [];

  for (const id of SECTION_ORDER) {
    const file = join(dir, `${id}.json`);
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as SectionFile;
    if (parsed.section.id !== id) {
      throw new Error(`${id}.json declares section id "${parsed.section.id}"`);
    }
    sections.push(parsed.section);
    opcodes.push(...parsed.opcodes);
  }

  return { sections, opcodes };
}
