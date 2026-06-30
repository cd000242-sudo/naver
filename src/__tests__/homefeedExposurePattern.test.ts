/**
 * Home-feed exposure skeleton — the all-engine base-prompt body structure.
 *
 * Injected into buildFullPrompt('homefeed') so every engine (API + agent) and every flow
 * (반자동/풀오토/연속/다중계정) shares the same verified structure. These guard the key
 * invariants decoded from 20 live top-exposure posts.
 */

import { describe, it, expect } from 'vitest';
import { buildHomefeedExposureSkeleton } from '../content/homefeedExposurePattern';

// Note: buildFullPrompt('homefeed') injection is verified by the build (the require resolves,
// same pattern as neoHookTitles) + code review. buildFullPrompt itself depends on the Electron
// app (app.getAppPath) and is not unit-testable under vitest, so only the helper is tested here.

describe('buildHomefeedExposureSkeleton', () => {
  const block = buildHomefeedExposureSkeleton();

  it('carries the 7-point winning structure', () => {
    expect(block).toContain('도입 4단'); // intro: observation→twist→name→promise
    expect(block).toContain('정체를 숨긴 경우'); // reveal identity in first paragraph
    expect(block).toContain('1~3문장'); // short paragraphs
    expect(block).toContain('서로 다른 정보 단위'); // no section repetition
    expect(block).toContain('댓글 유도'); // comment-CTA close
  });

  it('caps interjections while keeping the tone voice (frequency, not 어미)', () => {
    expect(block).toContain('어미·문체는 그대로 유지');
    expect(block).toContain('3회 이하');
  });

  it('forbids fabrication (facts from source only)', () => {
    expect(block).toContain('날조');
  });

  it('exposes the marker that buildFullPrompt gates on for homefeed', () => {
    expect(block).toContain('홈판 상위노출 본문 골격');
  });
});
