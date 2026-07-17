import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  countExpectedArticleTables,
  countExpectedPublishImages,
  buildExpectedOrderAnchors,
  evaluatePrePublishReport,
  findLeakedMarkers,
  formatHashtagPresenceDiagnostics,
  formatPrePublishReport,
  getBlockingFailures,
  getHashtagPresenceDiagnostics,
  getMissingExpectedHashtags,
  isEditorChromeOnlyText,
  isEditorBodyUnreadable,
  isPrePublishBodySuspiciouslyShort,
  selectPrePublishBodyText,
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

  it('fails when most of the planned image set is missing (severe shortfall = real failure)', () => {
    const report = evaluatePrePublishReport(
      { ...okStats, imageCount: 1 },
      { ...expectations, expectedImageMin: 3 }
    );
    expect(report.pass).toBe(false);
    expect(report.checks.find((c) => c.name === 'image-count')).toMatchObject({
      pass: false,
      actual: '1',
    });
  });

  it('tolerates user curation — a 1~2 image shortfall passes (user deletes bad/off-topic images live)', () => {
    // 6 planned, user deleted 1 hamster image → 5 present. Must NOT block the whole post.
    const five = evaluatePrePublishReport(
      { ...okStats, imageCount: 5 },
      { ...expectations, expectedImageMin: 6 }
    );
    expect(five.checks.find((c) => c.name === 'image-count')?.pass).toBe(true);
    // user deleted 2 → 4 present, still >= 70% → passes
    const four = evaluatePrePublishReport(
      { ...okStats, imageCount: 4 },
      { ...expectations, expectedImageMin: 6 }
    );
    expect(four.checks.find((c) => c.name === 'image-count')?.pass).toBe(true);
  });

  it('still blocks a fully image-less post when images were planned', () => {
    const report = evaluatePrePublishReport(
      { ...okStats, imageCount: 0 },
      { ...expectations, expectedImageMin: 6 }
    );
    expect(report.checks.find((c) => c.name === 'image-count')?.pass).toBe(false);
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

  it('hard-blocks publishing when a planned table is missing from SmartEditor', () => {
    const missing = evaluatePrePublishReport(
      { ...okStats, tableCount: 0 },
      { ...expectations, expectedTableMin: 1 },
    );
    const present = evaluatePrePublishReport(
      { ...okStats, tableCount: 1 },
      { ...expectations, expectedTableMin: 1 },
    );

    expect(missing.checks.find((check) => check.name === 'table-count')?.pass).toBe(false);
    expect(getBlockingFailures(missing).some((check) => check.name === 'table-count')).toBe(true);
    expect(present.checks.find((check) => check.name === 'table-count')?.pass).toBe(true);
  });

  it('reports a post whose section anchors exist but are out of order without using the ambiguous text check as a hard block', () => {
    const orderedAnchors = ['갈비탕과 곰탕', '전복죽', '닭죽'];
    const orderedText = '갈비탕과 곰탕 본문 전복죽 본문 닭죽 본문';
    const shuffledText = '전복죽 본문 갈비탕과 곰탕 본문 닭죽 본문';
    const ordered = evaluatePrePublishReport(
      { ...okStats, bodyText: orderedText },
      { ...expectations, expectedOrderedAnchors: orderedAnchors },
    );
    const shuffled = evaluatePrePublishReport(
      { ...okStats, bodyText: shuffledText },
      { ...expectations, expectedOrderedAnchors: orderedAnchors },
    );

    expect(ordered.checks.find((check) => check.name === 'section-order')?.pass).toBe(true);
    expect(shuffled.checks.find((check) => check.name === 'section-order')?.pass).toBe(false);
    expect(getBlockingFailures(shuffled).some((check) => check.name === 'section-order')).toBe(false);
  });

  it('builds stable beginning/middle/end anchors for a plain pasted body', () => {
    const body = [
      '첫 문단은 반드시 앞에 있어야 합니다.',
      '중간 문단은 영양 정보를 설명합니다.',
      '마지막 문단은 선택 기준을 정리합니다.',
    ].join('\n\n');
    const anchors = buildExpectedOrderAnchors(body, []);

    expect(anchors.length).toBeGreaterThanOrEqual(3);
    expect(anchors[0]).toContain('첫 문단');
    expect(anchors[anchors.length - 1]).toContain('마지막 문단');
  });

  it('normalizes heading anchors exactly like the subtitle writer', () => {
    expect(buildExpectedOrderAnchors('', [
      '1. 갈비탕과 곰탕:',
      '[소제목 2] 전복죽',
      '③ 닭죽',
    ])).toEqual(['갈비탕과 곰탕', '전복죽', '닭죽']);
  });

  it('uses marker-free text anchors for Q/A and list-style plain bodies', () => {
    const anchors = buildExpectedOrderAnchors([
      'Q1: 여름철 보양식은 어떻게 고르나요?',
      '',
      '- 소화가 잘되는 음식을 먼저 고릅니다.',
      '',
      'A1: 몸 상태에 맞춰 양을 조절합니다.',
    ].join('\n'), []);

    expect(anchors).toEqual([
      '여름철 보양식은 어떻게 고르나요?',
      '소화가 잘되는 음식을 먼저 고릅니다.',
      '몸 상태에 맞춰 양을 조절합니다.',
    ]);
  });
});

describe('countExpectedArticleTables', () => {
  it('counts valid markdown and HTML tables without counting ordinary pipes', () => {
    const content = [
      '| Item | Value |',
      '| --- | --- |',
      '| Basic | 10 |',
      '',
      'A | B is ordinary prose here.',
      '',
      '<table><tr><td>One</td></tr></table>',
    ].join('\n');

    expect(countExpectedArticleTables(content)).toBe(2);
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

describe('selectPrePublishBodyText', () => {
  it('prefers the complete editor root over a non-empty partial component snapshot', () => {
    const fullBody = Array.from({ length: 80 }, (_, index) => `完整 본문 문장 ${index + 1}입니다.`).join('\n');
    const partialTail = '이전글 후킹 문구\nhttps://blog.naver.com/example\n#태그1 #태그2';

    const selected = selectPrePublishBodyText({
      componentText: partialTail,
      rootText: fullBody,
      fallbackText: '',
    });

    expect(selected.source).toBe('root-text');
    expect(selected.text).toBe(fullBody);
    expect(selected.text.length).toBeGreaterThan(partialTail.length * 5);
  });

  it('keeps component text when it is the most complete valid snapshot', () => {
    const selected = selectPrePublishBodyText({
      componentText: '첫 문단입니다.\n둘째 문단입니다.\n셋째 문단입니다.',
      rootText: '첫 문단입니다.',
      fallbackText: '',
    });

    expect(selected.source).toBe('component-text');
    expect(selected.text).toContain('셋째 문단');
  });
});

describe('isPrePublishBodySuspiciouslyShort', () => {
  it('flags a positive read that fell well short of the planned body', () => {
    // The live failure: planned >=1282, editor read only 161 — a transient/partial
    // read that must be re-confirmed, not treated as a truncated post.
    expect(isPrePublishBodySuspiciouslyShort({ ...okStats, bodyChars: 161 }, { minBodyChars: 1282 })).toBe(true);
  });

  it('does not flag a read that meets the planned minimum', () => {
    expect(isPrePublishBodySuspiciouslyShort({ ...okStats, bodyChars: 1300 }, { minBodyChars: 1282 })).toBe(false);
  });

  it('leaves zero-char / empty reads to isEditorBodyUnreadable', () => {
    expect(isPrePublishBodySuspiciouslyShort({ ...okStats, bodyChars: 0 }, { minBodyChars: 1282 })).toBe(false);
    expect(isPrePublishBodySuspiciouslyShort(null, { minBodyChars: 1282 })).toBe(false);
  });

  it('publish flow settles + re-acquires the frame before blocking on a short read', () => {
    // Locks the wiring: a short read must trigger a re-measure loop, not an
    // immediate block. Guards against regressing back to single-read blocking.
    const flow = read('naverBlogAutomation.ts');
    expect(flow).toMatch(/isPrePublishBodySuspiciouslyShort\(stats, expectations\)/);
    expect(flow).toMatch(/pre-publish-short-read-resettle/);
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

  it('treats SmartEditor toolbar/image chrome text as unreadable body text', () => {
    const chromeOnlyStats: PrePublishStats = {
      bodyChars: 193,
      imageCount: 0,
      linkCardCount: 0,
      dividerCount: 0,
      leakedMarkers: [],
      bodyText: [
        '제목',
        '사진 편집',
        '작게',
        '문서 너비',
        'AI 사용 설정',
        '사진 설명을 입력하세요',
      ].join('\n'),
    };

    expect(isEditorChromeOnlyText(chromeOnlyStats.bodyText || '', chromeOnlyStats.bodyChars)).toBe(true);
    expect(isEditorBodyUnreadable(chromeOnlyStats)).toBe(true);
    expect(getHashtagPresenceDiagnostics(chromeOnlyStats, {
      expectedHashtags: ['#alpha'],
    }).probableCause).toBe('editor-chrome-selected-instead-of-body');
  });

  it('collects pre-publish stats from the SmartEditor document root, not global editor panels', () => {
    const source = readFileSync(new URL('../automation/prePublishAssertion.ts', import.meta.url), 'utf8');
    const fn = source.slice(
      source.indexOf('export async function collectPrePublishStats'),
      source.length
    );

    expect(fn).toMatch(/article\.se-components-wrap/);
    expect(fn).toMatch(/componentText/);
    expect(fn).toMatch(/bodySource/);
    expect(fn).toMatch(/fallbackText/);
    expect(fn).toMatch(/selectPrePublishBodyText\(raw\)/);
    expect(fn).toMatch(/contenteditable="true"/);
    expect(fn).not.toMatch(/document\.body/);
    expect(fn).not.toMatch(/componentText\.trim\(\)\s*\?\s*componentText/);
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
    const end = code.indexOf('private async applyPlainContent(', start);
    expect(end).toBeGreaterThan(start);
    const head = code.slice(start, end);
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
    expect(apply).toMatch(/apply-hashtags-tail-not-ready/);
    expect(apply).toMatch(/apply-hashtags-tail-not-ready-fail-open/);
    expect(apply).toMatch(/isEditorBodyUnreadable/);
    expect(apply).toMatch(/body-still-unreadable/);
    expect(apply).toMatch(/발행을 중단하지 않습니다/);
    expect(apply).not.toMatch(/HASHTAG_TAIL_NOT_READY/);
    expect(apply).not.toMatch(/throw new Error\(`HASHTAG_APPLY_VERIFY_FAILED/);
    expect(apply).not.toMatch(/최선 위치에 입력을 계속/);
    expect(apply).not.toMatch(/최선 위치에 재입력/);
  });

  it('emits TailDebug snapshots before the advisory-or-strict publish decision', () => {
    const code = read('naverBlogAutomation.ts');
    expect(code).toMatch(/emitTailDebugSnapshot/);
    expect(code).toMatch(/pre-publish-before-decision/);
    expect(code).toMatch(/hashtag-repair-before/);
    expect(code).toMatch(/pre-publish-warning/);
    expect(code).toMatch(/pre-publish-blocked-strict/);
    expect(code).toMatch(/bodyTail/);
    expect(code).toMatch(/bodySource:\s*stats\.bodySource/);
    expect(code).toMatch(/bodyCandidateChars:\s*stats\.bodyCandidateChars/);
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

describe('pre-publish diagnostics', () => {
  it('blocks only on deterministic checks', async () => {
    const { BLOCKING_CHECKS, getBlockingFailures, evaluatePrePublishReport } = await import('../automation/prePublishAssertion.js');
    expect([...BLOCKING_CHECKS].sort()).toEqual([
      'body-min-chars',
      'image-count',
      'marker-leak',
      'table-count',
    ]);
    const report = evaluatePrePublishReport(
      { bodyChars: 10, imageCount: 0, linkCardCount: 0, dividerCount: 0, leakedMarkers: [], bodyText: '' },
      { minBodyChars: 500, expectedImageMin: 1, expectedLinkCardMin: 2, expectedDividerMin: 1 }
    );
    const blocking = getBlockingFailures(report);
    const names = blocking.map((c: any) => c.name).sort();
    // link-card/divider 실패는 차단 목록에 없어야 한다 (서버 의존 — 관찰 유지)
    expect(names).toEqual(['body-min-chars', 'image-count']);
  });

  it('keeps deterministic checks observable by default and blocks only when strict verification is explicitly enabled', () => {
    const { readFileSync } = require('fs');
    const code = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');
    expect(code).toMatch(/PRE_PUBLISH_BLOCKED/);
    expect(code).toMatch(/strictPrePublishVerification\?: boolean/);
    expect(code).toMatch(/this\.options\.strictPrePublishVerification === true/);
    expect(code).toMatch(/발행을 계속합니다/);
    // 검사 자체 실패 catch가 차단 throw를 삼키면 안 된다
    expect(code).toMatch(/PRE_PUBLISH_BLOCKED'\)\)\s*throw assertErr|startsWith\('PRE_PUBLISH_BLOCKED'\)/);
    const terminalBlock = code.slice(code.indexOf('const terminalErrors'), code.indexOf('const frameRecoverableErrors'));
    expect(terminalBlock).toMatch(/PRE_PUBLISH_BLOCKED/);
    expect(terminalBlock).toMatch(/POST_TAIL_INCOMPLETE/);
    expect(terminalBlock).not.toMatch(/HASHTAG_TAIL_NOT_READY/);
    expect(terminalBlock).not.toMatch(/HASHTAG_APPLY_VERIFY_FAILED/);
  });
});
