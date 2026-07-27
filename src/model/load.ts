import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describePrefixes } from './prefixes.ts';
import type { Opcode, OpcodeData, Section, SectionId } from './types.ts';

/** Section files, in the order they appear on the page. */
export const SECTION_ORDER: SectionId[] = ['core', 'gc', 'fc', 'simd', 'threads'];

const DATA_DIR = join(
  new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  'data',
);

/** When the data was last checked against the specification. */
export interface DataMeta {
  reviewed: string;
}

export function loadMeta(dir: string = DATA_DIR): DataMeta {
  return JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as DataMeta;
}

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

  const data: OpcodeData = { sections, opcodes };
  // Only possible once every file is in: what 0xFB says is a statement about
  // the table behind it, which lives in another file.
  describePrefixes(data);
  return data;
}
