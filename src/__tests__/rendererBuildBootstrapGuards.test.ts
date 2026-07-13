import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const readBuildScript = () =>
  fs.readFileSync(path.join(process.cwd(), 'scripts', 'copy-static.mjs'), 'utf-8');

describe('renderer build bootstrap guards', () => {
  it('does not strip the inlined app event bootstrap call', () => {
    const buildScript = readBuildScript();
    const commentList = buildScript.match(
      /const utilsFunctionsToComment = \[([\s\S]*?)\];/,
    )?.[1];

    expect(commentList).toBeDefined();
    expect(commentList).not.toContain("'initAllAppEventHandlers'");
  });

  it('fails the build when the app event bootstrap call disappears', () => {
    const buildScript = readBuildScript();

    expect(buildScript).toContain('REQUIRED_RENDERER_BOOTSTRAP_CALLS');
    expect(buildScript).toContain("name: 'initAllAppEventHandlers'");
    expect(buildScript).toContain('Renderer bootstrap call missing after inlining');
  });
});
