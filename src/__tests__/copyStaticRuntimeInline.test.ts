import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('copy-static runtime inline contract', () => {
  const copyStaticSource = readFileSync(join(process.cwd(), 'scripts', 'copy-static.mjs'), 'utf8');
  const rendererSource = readFileSync(join(process.cwd(), 'src', 'renderer', 'renderer.ts'), 'utf8');

  it('inlines runtime modules imported by the browser renderer entrypoint', () => {
    expect(rendererSource).toContain("from '../runtime/imageProviderMigration.js'");
    expect(copyStaticSource).toContain('runtimeModules');
    expect(copyStaticSource).toContain("'imageProviderMigration.js'");
  });
});
