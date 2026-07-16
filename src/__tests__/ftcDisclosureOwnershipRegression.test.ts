import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('FTC disclosure ownership regression', () => {
  it('clears stale structured disclosure text in every OFF path', () => {
    expect(read('renderer/modules/formAndAutomation.ts'))
      .toContain('delete currentStructuredContent.ftcDisclosure');
    expect(read('renderer/modules/fullAutoFlow.ts'))
      .toContain('delete structuredContent.ftcDisclosure');
    expect(read('renderer/modules/multiAccountManager.ts'))
      .toContain('delete structuredContent.ftcDisclosure');
  });
});
