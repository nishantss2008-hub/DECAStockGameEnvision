import type { CopyData } from '../src/lib/copyTypes';

export interface CopyBlock {
  kind: string;
  /** 1-based line of the opening fence in COPY.md. */
  line: number;
  data: unknown;
}

export const COPY_PATH: string;
export const OUT_PATH: string;
export function parseYaml(text: string, firstLine?: number): any;
export function extractBlocks(markdown: string): CopyBlock[];
export function buildCopyData(markdown: string): CopyData;
export function renderModule(data: CopyData): string;
