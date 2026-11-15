/**
 * [2026-11-15] Photo check choice: wiring checks (source text). Two connection points only, nothing in the
 * unattended paths, module registered in the inline bundle and the runtime fingerprint closure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf-8');
const readRoot = (rel: string): string => fs.readFileSync(path.join(SRC, '..', rel), 'utf-8');
const code = (s: string): string => s.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('photoCheckChoice wiring', () => {
  it('related-photos block: sees the failure, asks, and calls again with photoCheckMode', () => {
    const src = read('renderer/modules/headingImageGen.ts');
    expect(src).toContain("from './photoCheckChoice.js'");
    const start = src.indexOf('const collectRequest = {');
    expect(start).toBeGreaterThan(0);
    const block = src.slice(start, start + 1800);
    expect(block).toContain('photoCheckRetryLoop(');
    expect(block).toContain('photoCheckMode: mode');
    expect(block).toContain('generateImagesWithCostSafety(');
    // The failure is still thrown after the loop (manual / out of tries).
    expect(block).toMatch(/photoCheckRetryLoop[\s\S]*collectResult\?\.success === false[\s\S]*throw new Error/);
  });

  it('AI auto collect: same loop around collectIssueImages, payload carries photoCheckMode', () => {
    const src = read('renderer/modules/issueCollectMode.ts');
    expect(src).toContain("from './photoCheckChoice.js'");
    expect(src).toContain('photoCheckRetryLoop(');
    expect(src).toMatch(/collectIssueImages\(\{[\s\S]{0,200}\.\.\.issueCollectPayload[\s\S]{0,80}photoCheckMode: mode/);
    expect(src.indexOf('photoCheckRetryLoop(')).toBeLessThan(src.indexOf('if (!result?.success)'));
  });

  it('the loop module reads the failure code, stops on manual and is capped at 3 windows', () => {
    const src = read('renderer/modules/photoCheckChoice.ts');
    expect(src).toContain("'VISION_ENGINE_UNAVAILABLE'");
    expect(src).toMatch(/pick === 'manual'/);
    expect(src).toMatch(/PHOTO_CHECK_MAX_WINDOWS = 3/);
    expect(src).not.toMatch(/\(window as any\)\.photoCheck/);
  });

  it('unattended paths have no window call', () => {
    for (const file of ['renderer/modules/fullAutoFlow.ts', 'renderer/modules/continuousPublishing.ts', 'renderer/modules/multiAccountManager.ts']) {
      expect(code(read(file)), file).not.toMatch(/photoCheck|askPhotoCheckChoice/);
    }
  });

  it('generateImagesWithCostSafety passes the failure fields and the option through unchanged', () => {
    const cost = code(read('renderer/modules/costAndAutoGen.ts'));
    expect(cost).toContain('window.api.generateImages(options)');
    expect(cost).not.toMatch(/visionUnavailable|VISION_ENGINE_UNAVAILABLE/); // never picked, never rewritten
    expect(cost).toMatch(/return result;\s*\} catch \(error\)/);
  });

  it('preload types declare the new fields (types only)', () => {
    const pre = read('preload.ts');
    expect(pre).toMatch(/\{ success: false; message\?: string; code\?: string; visionUnavailable\?: \{ reason: 'rate_limit' \| 'login'; vendor: string \} \}/);
    expect(pre).toMatch(/collectIssueImages: \(payload: \{[^\n]*photoCheckMode\?: 'selected' \| 'agent-claude' \| 'agent-codex' \| 'caption'/);
    expect(pre).toMatch(/collectIssueImages:[^\n]*visionUnavailable\?: \{ reason: 'rate_limit' \| 'login'; vendor: string \}/);
  });

  it('registered: inline bundle (before its two users) and the fingerprint closure list', () => {
    const copy = readRoot('scripts/copy-static.mjs');
    const at = copy.indexOf("'photoCheckChoice.js'");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(copy.indexOf("'issueCollectMode.js'"));
    expect(at).toBeLessThan(copy.indexOf("'headingImageGen.js'"));
    expect(read('contentQualityV3/candidateRuntimeFingerprint.ts')).toContain("'src/renderer/modules/photoCheckChoice.ts'");
  });

  it('the new module is short and paints no inline colors', () => {
    const src = read('renderer/modules/photoCheckChoice.ts');
    expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(300);
    expect(src).toContain('nv-scrim');
    expect(src).not.toMatch(/(background|color)\s*:\s*#/i);
  });
});
