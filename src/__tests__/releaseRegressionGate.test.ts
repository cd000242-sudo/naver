import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('release regression gate', () => {
  const root = process.cwd();
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const releaseAll = fs.readFileSync(path.join(root, 'scripts/release-all.js'), 'utf8');
  const gate = fs.readFileSync(path.join(root, 'scripts/release-gate.js'), 'utf8');
  const uploader = fs.readFileSync(path.join(root, 'scripts/upload-release.js'), 'utf8');

  it('runs static, behavioral, IPC, runtime, and Electron gates before packaging', () => {
    expect(gate).toContain("['run', 'lint', '--', '--quiet']");
    expect(gate).toContain("['test']");
    expect(gate).toContain("['run', 'build']");
    expect(gate).toContain("['run', 'lint:ipc']");
    expect(gate).toContain("['run', 'self-test:built']");
    expect(gate).toContain("['run', 'e2e:built']");
  });

  it('materializes generated runtime version data before lint and tests', () => {
    const syncIndex = gate.indexOf("args: ['scripts/sync-build-define.mjs'], runWithNode: true");
    const lintIndex = gate.indexOf("['run', 'lint', '--', '--quiet']");
    const testIndex = gate.indexOf("['test']");

    expect(syncIndex).toBeGreaterThan(-1);
    expect(lintIndex).toBeGreaterThan(syncIndex);
    expect(testIndex).toBeGreaterThan(syncIndex);
    expect(gate).toContain(
      'const commandArgs = step.runWithNode ? step.args : [npmCli, ...step.args];',
    );
  });

  it('blocks the full GitHub release pipeline on the shared gate', () => {
    const gateIndex = releaseAll.indexOf('node scripts/release-gate.js');
    const builderIndex = releaseAll.indexOf('npx electron-builder');
    const uploadIndex = releaseAll.indexOf('node scripts/upload-release.js');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(builderIndex).toBeGreaterThan(gateIndex);
    expect(uploadIndex).toBeGreaterThan(builderIndex);
  });

  it('boots the packaged app with a clean profile before GitHub upload', () => {
    const smokeIndex = releaseAll.indexOf('node scripts/packaged-app-smoke.mjs');
    const uploadIndex = releaseAll.indexOf('node scripts/upload-release.js');
    expect(smokeIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(smokeIndex);
  });

  it('commits the default policy config needed on a clean user machine', () => {
    expect(uploader).toContain("'config/'");
  });

  it('commits the Electron E2E suite that enforces the release gate', () => {
    expect(uploader).toContain("'e2e/'");
  });

  it('does not publish a release when the source push fails', () => {
    expect(uploader).toContain("throw new Error('Git push failed')");
  });

  it('returns a failing shell exit code even when an early release stage aborts', () => {
    expect(releaseAll).toMatch(
      /finally \{[\s\S]{0,900}?if \(!allSuccess\) process\.exitCode = 1/,
    );
  });

  it('fails closed when a staged release commit cannot be created', () => {
    expect(uploader).toContain('git diff --cached --name-only');
    expect(uploader).not.toContain('커밋 스킵 (이미 커밋됨)');
  });

  it.each([
    'release', 'pack', 'dist', 'dist:win', 'dist:portable', 'dist:all', 'dist:setup', 'build:safe',
    'prepack', 'dist:mac', 'dist:mac:arm64', 'dist:mac:x64', 'dist:mac:universal',
    'dist:mac:unsigned', 'dist:mac:arm64:unsigned', 'dist:mac:universal:unsigned',
    'dist:universal', 'release:mac', 'release:mac:unsigned',
  ])(
    'prevents %s from bypassing verify:release',
    (scriptName) => {
      expect(packageJson.scripts[scriptName]).toContain('npm run verify:release');
    },
  );
});
