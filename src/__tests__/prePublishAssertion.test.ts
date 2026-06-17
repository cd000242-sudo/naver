import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  countExpectedPublishImages,
  evaluatePrePublishReport,
  findLeakedMarkers,
  formatHashtagPresenceDiagnostics,
  formatPrePublishReport,
  getHashtagPresenceDiagnostics,
  getMissingExpectedHashtags,
  isEditorBodyUnreadable,
  type PrePublishStats,
} from '../automation/prePublishAssertion';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

const okStats: PrePublishStats = {
  bodyChars: 1500,
  imageCount: 3,
  linkCardCount: 1,
  dividerCount: 2,
  leakedMarkers: [],
};

const expectations = {
  minBodyChars: 500,
  expectedImageMin: 1,
  expectedLinkCardMin: 1,
  expectedDividerMin: 1,
};

describe('evaluatePrePublishReport', () => {
  it('passes when every editor stat meets the plan', () => {
    const report = evaluatePrePublishReport(okStats, expectations);
    expect(report.pass).toBe(true);
    expect(report.checks).toHaveLength(5);
    expect(report.checks.every((c) => c.pass)).toBe(true);
  });

  it('fails when the body is shorter than the planned floor', () => {
    const report = evaluatePrePublishReport({ ...okStats, bodyChars: 120 }, expectations);
    expect(report.pass).toBe(false);
    expect(report.checks.find((c) => c.name === 'body-min-chars')?.pass).toBe(false);
  });

  it('fails when planned images are completely missing', () => {
    const report = evaluatePrePublishReport({ ...okStats, imageCount: 0 }, expectations);
    expect(report.pass).toBe(false);
    expect(report.checks.find((c) => c.name === 'image-count')?.pass).toBe(false);
  });

  it('fails when only part of the planned image set reached the editor', () => {
    const report = evaluatePrePublishReport(
      { ...okStats, imageCount: 1 },
      { ...expectations, expectedImageMin: 3 }
    );
    expect(report.pass).toBe(false);
    expect(report.checks.find((c) => c.name === 'image-count')).toMatchObject({
      pass: false,
      expected: '>= 3',
      actual: '1',
    });
  });

  it('fails when the previous-post link card or tail divider is missing', () => {
    const noCard = evaluatePrePublishReport({ ...okStats, linkCardCount: 0 }, expectations);
    expect(noCard.checks.find((c) => c.name === 'link-card-count')?.pass).toBe(false);

    const noDivider = evaluatePrePublishReport({ ...okStats, dividerCount: 0 }, expectations);
    expect(noDivider.checks.find((c) => c.name === 'divider-count')?.pass).toBe(false);
  });

  it('fails when internal markers leaked into the editor text', () => {
    const report = evaluatePrePublishReport(
      { ...okStats, leakedMarkers: ['[원본 텍스트]'] },
      expectations
    );
    expect(report.pass).toBe(false);
    expect(report.checks.find((c) => c.name === 'marker-leak')?.pass).toBe(false);
  });
});

describe('findLeakedMarkers', () => {
  it('detects internal prompt markers including numbered 자료 markers', () => {
    const text = '본문입니다 [원본 텍스트] 그리고 [자료3] 인용.';
    const leaked = findLeakedMarkers(text);
    expect(leaked).toContain('[원본 텍스트]');
    expect(leaked).toContain('[자료N]');
  });

  it('returns empty for clean published text', () => {
    expect(findLeakedMarkers('깨끗한 본문입니다. 구분선 ━━━ 도 마커가 아닙니다.')).toEqual([]);
  });
});

describe('getMissingExpectedHashtags', () => {
  it('normalizes and reports only missing publish hashtags', () => {
    const missing = getMissingExpectedHashtags(
      {
        ...okStats,
        bodyText: 'tail #alpha #actorAlpha',
      },
      {
        expectedHashtags: ['#alpha', 'memorialAlpha', '#actorAlpha'],
      }
    );

    expect(missing).toEqual(['memorialAlpha']);
  });

  it('explains why hashtag presence failed with a parseable debug payload', () => {
    const stats = {
      ...okStats,
      bodyText: '본문 끝에 이전글 카드가 있고 https://blog.naver.com/prev 만 남아있습니다',
    };
    const expectationsWithTags = {
      expectedHashtags: ['#이순재', '고이순재'],
    };

    const diagnostics = getHashtagPresenceDiagnostics(stats, expectationsWithTags);
    expect(diagnostics.missingHashtags).toEqual(['이순재', '고이순재']);
    expect(diagnostics.probableCause).toBe('cursor-stayed-near-link-card-or-tail-not-after-card');
    expect(diagnostics.bodyHashtagStatus).toEqual([
      { tag: '이순재', hashPresent: false, plainPresent: false },
      { tag: '고이순재', hashPresent: false, plainPresent: false },
    ]);

    const line = formatHashtagPresenceDiagnostics(stats, expectationsWithTags);
    expect(line).toContain('HASHTAG_DEBUG:');
    expect(line).toContain('cursor-stayed-near-link-card-or-tail-not-after-card');
  });

  it('reports SmartEditor insert panel focus when component picker text is visible at the tail', () => {
    const diagnostics = getHashtagPresenceDiagnostics(
      {
        ...okStats,
        bodyText: [
          '본문 마지막 문장입니다.',
          '추가할 컴포넌트를 선택하세요.',
          '사진 라이브러리',
          '현재 문서구매 목록',
        ].join('\n'),
      },
      {
        expectedHashtags: ['#이순재'],
      }
    );

    expect(diagnostics.probableCause).toBe('editor-insert-panel-active');
  });

  it('distinguishes unreadable editor stats from real hashtag omission', () => {
    const unreadableStats: PrePublishStats = {
      bodyChars: 0,
      imageCount: 0,
      linkCardCount: 0,
      dividerCount: 0,
      leakedMarkers: [],
      bodyText: '',
    };

    const diagnostics = getHashtagPresenceDiagnostics(unreadableStats, {
      expectedHashtags: ['#지원금계좌'],
    });

    expect(isEditorBodyUnreadable(unreadableStats)).toBe(true);
    expect(diagnostics.probableCause).toBe('editor-body-not-readable');
    expect(isEditorBodyUnreadable({ ...unreadableStats, linkCardCount: 1 })).toBe(false);
  });

  it('collects pre-publish stats from the SmartEditor document root, not global editor panels', () => {
    const source = readFileSync(new URL('../automation/prePublishAssertion.ts', import.meta.url), 'utf8');
    const fn = source.slice(
      source.indexOf('export async function collectPrePublishStats'),
      source.indexOf('return {', source.indexOf('export async function collectPrePublishStats'))
    );

    expect(fn).toMatch(/article\.se-components-wrap/);
    expect(fn).toMatch(/fallbackText/);
    expect(fn).toMatch(/contenteditable="true"/);
    expect(fn).not.toMatch(/document\.body/);
  });

  it('does not treat normal SmartEditor se-panel layout wrappers as transient popups', () => {
    const prePublish = readFileSync(new URL('../automation/prePublishAssertion.ts', import.meta.url), 'utf8');
    const richPaste = readFileSync(new URL('../automation/richTextPaste.ts', import.meta.url), 'utf8');
    const appAutomation = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');
    const editorHelpers = readFileSync(new URL('../automation/editorHelpers.ts', import.meta.url), 'utf8');
    const ctaHelpers = readFileSync(new URL('../automation/ctaHelpers.ts', import.meta.url), 'utf8');
    const imageHelpers = readFileSync(new URL('../automation/imageHelpers.ts', import.meta.url), 'utf8');
    const transientDismiss = appAutomation.slice(
      appAutomation.indexOf('private async dismissEditorTransientPanels'),
      appAutomation.indexOf('private async applyHashtagsInBody')
    );

    expect(prePublish).toMatch(/SMART_EDITOR_PANEL_SELECTOR/);
    expect(richPaste).toMatch(/SMART_EDITOR_PANEL_SELECTOR/);
    expect(prePublish).not.toMatch(/SMART_EDITOR_PANEL_SELECTOR[^;\n]*se-panel/);
    expect(richPaste).not.toMatch(/SMART_EDITOR_PANEL_SELECTOR[^;\n]*se-panel/);
    expect(transientDismiss).not.toMatch(/se-panel|se-panel-close/);
    expect(appAutomation).not.toMatch(/querySelectorAll\([^)\n]*se-panel/);
    expect(editorHelpers).not.toMatch(/querySelectorAll\([^)\n]*se-panel/);
    expect(ctaHelpers).not.toMatch(/querySelectorAll\([^)\n]*se-panel/);
    expect(imageHelpers).not.toMatch(/querySelectorAll\([^)\n]*se-panel/);
  });
});

describe('countExpectedPublishImages', () => {
  it('counts only images with an insertable source', () => {
    expect(countExpectedPublishImages([
      { filePath: 'C:/tmp/a.png' },
      { url: 'https://example.com/b.jpg' },
      { previewDataUrl: 'data:image/png;base64,aaa' },
      { filePath: '' },
      { failed: true, filePath: 'C:/tmp/failed.png' },
      { skip: true, url: 'https://example.com/skipped.jpg' },
      'C:/tmp/string-path.png',
      '',
      null,
    ])).toBe(4);
  });
});

describe('formatPrePublishReport', () => {
  it('summarizes pass count and flags suspected omissions', () => {
    const pass = formatPrePublishReport(evaluatePrePublishReport(okStats, expectations));
    expect(pass).toContain('5/5');
    expect(pass).not.toContain('누락 의심');

    const fail = formatPrePublishReport(
      evaluatePrePublishReport({ ...okStats, linkCardCount: 0 }, expectations)
    );
    expect(fail).toContain('누락 의심');
    expect(fail).toContain('link-card-count');
  });
});

describe('pre-publish assertion wiring (observation mode)', () => {
  it('runs the assertion inside publishBlogPost before the publish click', () => {
    const code = read('naverBlogAutomation.ts');
    const start = code.indexOf('async publishBlogPost(');
    expect(start).toBeGreaterThan(-1);
    const head = code.slice(start, start + 6000);
    expect(head).toMatch(/collectPrePublishStats\(/);
    expect(head).toMatch(/evaluatePrePublishReport\(/);
    expect(head).toMatch(/repairMissingHashtagsBeforePublish\(/);
    expect(head).toMatch(/isEditorBodyUnreadable/);
    expect(head).toMatch(/본문 판독 결과가 0자/);
    expect(head.indexOf('repairMissingHashtagsBeforePublish')).toBeLessThan(head.indexOf('PRE_PUBLISH_BLOCKED'));
    // Observation mode: assertion failures must never abort the publish.
    expect(head).toMatch(/\[PrePublish\] 검사 자체 실패/);
  });

  it('stashes tail expectations at the end of applyStructuredContent and resets them per run', () => {
    const code = read('automation/editorHelpers.ts');
    expect(code).toMatch(/self\.__prePublishExpectations = null/);
    expect(code).toMatch(/self\.__prePublishExpectations = \{/);
    expect(code).toMatch(/expectedImageMin:\s*resolved\.skipImages\s*\?\s*0\s*:\s*countExpectedPublishImages\(resolved\.images\)/);
    expect(code.indexOf('self.__prePublishExpectations = {')).toBeLessThan(
      code.indexOf('// 7. CTA 버튼 최종 확인')
    );
  });
});

// SPEC-STABILITY-2026 R6 — 단계적 차단 전환 (2026-06-12)
// 결정적 검사(본문/이미지/마커/해시태그)는 차단, 네이버 서버 의존 검사
// (링크카드/구분선)는 오탐 데이터 확보 전까지 관찰 유지.
describe('pre-publish hashtag repair wiring', () => {
  it('repairs missing hashtags at the editor tail before blocking publish', () => {
    const code = read('naverBlogAutomation.ts');
    const repair = code.slice(
      code.indexOf('private async repairMissingHashtagsBeforePublish'),
      code.indexOf('async publishBlogPost(')
    );
    expect(repair).toMatch(/getMissingExpectedHashtags/);
    expect(repair).toMatch(/applyHashtagsInBody\(missingHashtags,\s*\{/);
    expect(repair).toMatch(/ensureTailReady:\s*true/);
    expect(repair).toMatch(/leadingEnterCount:\s*5/);
    expect(repair).toMatch(/formatHashtagPresenceDiagnostics/);

    const apply = code.slice(
      code.indexOf('private async applyHashtagsInBody'),
      code.indexOf('// CTA')
    );
    expect(apply).toMatch(/ensureTailTypingReady/);
    expect(apply).toMatch(/dismissEditorTransientPanels/);
    expect(apply).toMatch(/leadingEnterCount/);
    expect(apply).toMatch(/apply-hashtags-before-type/);
    expect(apply).toMatch(/apply-hashtags-after-type/);
    expect(apply).toMatch(/apply-hashtags-after-retry/);
    expect(apply).toMatch(/HASHTAG_TAIL_NOT_READY/);
    expect(apply).toMatch(/apply-hashtags-tail-not-ready/);
    expect(apply).toMatch(/isEditorBodyUnreadable/);
    expect(apply).toMatch(/body-still-unreadable/);
    expect(apply).toMatch(/HASHTAG_APPLY_VERIFY_FAILED/);
    expect(apply).toMatch(/throw error/);
    expect(apply).not.toMatch(/최선 위치에 입력을 계속/);
    expect(apply).not.toMatch(/최선 위치에 재입력/);
  });

  it('emits TailDebug snapshots before hashtag blocking', () => {
    const code = read('naverBlogAutomation.ts');
    expect(code).toMatch(/emitTailDebugSnapshot/);
    expect(code).toMatch(/pre-publish-before-blocking/);
    expect(code).toMatch(/hashtag-repair-before/);
    expect(code).toMatch(/pre-publish-blocked/);
    expect(code).toMatch(/bodyTail/);
    expect(code).toMatch(/probableCause/);
    expect(code).toMatch(/bodyHashtagStatus/);
    expect(code).toMatch(/console\.warn\(line\)/);
  });
});

describe('renderer publish tail diagnostics', () => {
  it('emits TailDebug snapshots from renderer publish payload and error branches', () => {
    const code = read('renderer/modules/fullAutoFlow.ts');
    expect(code).toMatch(/emitRendererPublishTailDebug/);
    expect(code).toMatch(/renderer-payload-before-runAutomation/);
    expect(code).toMatch(/renderer-runAutomation-api-error/);
    expect(code).toMatch(/renderer-runAutomation-data-error/);
    expect(code).toMatch(/renderer-runAutomation-success/);
    expect(code).toMatch(/parsePrePublishMissingHashtags/);
    expect(code).toMatch(/parseBackendHashtagDebug/);
    expect(code).toMatch(/backendHashtagDebug/);
    expect(code).toMatch(/bodyHashtagStatus/);
    expect(code).toMatch(/contentTail/);
    expect(code).toMatch(/해시태그 누락 진단/);
    expect(code).toMatch(/\[TailDebug\]/);
  });
});

describe('R6 staged blocking', () => {
  it('blocks only on deterministic checks', async () => {
    const { BLOCKING_CHECKS, getBlockingFailures, evaluatePrePublishReport } = await import('../automation/prePublishAssertion.js');
    expect([...BLOCKING_CHECKS].sort()).toEqual(['body-min-chars', 'hashtag-presence', 'image-count', 'marker-leak']);
    const report = evaluatePrePublishReport(
      { bodyChars: 10, imageCount: 0, linkCardCount: 0, dividerCount: 0, leakedMarkers: [], bodyText: '' },
      { minBodyChars: 500, expectedImageMin: 1, expectedLinkCardMin: 2, expectedDividerMin: 1 }
    );
    const blocking = getBlockingFailures(report);
    const names = blocking.map((c: any) => c.name).sort();
    // link-card/divider 실패는 차단 목록에 없어야 한다 (서버 의존 — 관찰 유지)
    expect(names).toEqual(['body-min-chars', 'image-count']);
  });

  it('wires blocking into publishBlogPost with rethrow + no-blind-retry', () => {
    const { readFileSync } = require('fs');
    const code = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');
    expect(code).toMatch(/PRE_PUBLISH_BLOCKED/);
    // 검사 자체 실패 catch가 차단 throw를 삼키면 안 된다
    expect(code).toMatch(/PRE_PUBLISH_BLOCKED'\)\)\s*throw assertErr|startsWith\('PRE_PUBLISH_BLOCKED'\)/);
    const terminalBlock = code.slice(code.indexOf('const terminalErrors'), code.indexOf('const frameRecoverableErrors'));
    expect(terminalBlock).toMatch(/PRE_PUBLISH_BLOCKED/);
    expect(terminalBlock).toMatch(/POST_TAIL_INCOMPLETE/);
    expect(terminalBlock).toMatch(/HASHTAG_TAIL_NOT_READY/);
    expect(terminalBlock).toMatch(/HASHTAG_APPLY_VERIFY_FAILED/);
  });
});
