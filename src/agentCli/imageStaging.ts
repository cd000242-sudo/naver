// src/agentCli/imageStaging.ts
// Copies caller-provided image files into an agent run's throwaway cwd so the
// CLI can access them under stable relative names. Shared by claude/codex
// runners; names are deterministic so prompt builders can reference them.

import { copyFile } from 'fs/promises';
import { extname, join } from 'path';

const SAFE_EXT = /^\.(jpe?g|png|webp|gif|bmp|heic)$/i;

/** Deterministic staged name for the i-th image (0-based): photo-01.jpg … */
export function stagedImageName(index: number, sourcePath: string): string {
  const ext = SAFE_EXT.test(extname(sourcePath)) ? extname(sourcePath).toLowerCase() : '.jpg';
  return `photo-${String(index + 1).padStart(2, '0')}${ext}`;
}

/**
 * Copy images into `dir` under their staged names.
 * Returns the staged file names in input order.
 */
export async function stageImagesInDir(dir: string, imagePaths: readonly string[]): Promise<string[]> {
  const staged: string[] = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const name = stagedImageName(i, imagePaths[i]);
    await copyFile(imagePaths[i], join(dir, name));
    staged.push(name);
  }
  return staged;
}
