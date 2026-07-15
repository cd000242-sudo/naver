import { describe, expect, it } from 'vitest';

import { assertEditorVisibleSnapshotUnchanged } from '../automation/editorVisibleSnapshot.js';
import { resolveNaverRunOptions } from '../automation/runOptionsPolicy.js';

describe('Content Quality V3 final Naver publish option path', () => {
  it('keeps the gated structured title and body authoritative over duplicate renderer fields', () => {
    const structuredContent = {
      selectedTitle: '**검증된 최종 제목**',
      bodyPlain: '1. 검증된 첫 문단\n\n2) 검증된 둘째 문단',
      hashtags: ['검증'],
    };

    const resolved = resolveNaverRunOptions({
      runOptions: {
        title: 'renderer가 다시 보낸 다른 제목',
        content: 'renderer가 다시 보낸 다른 본문',
        structuredContent,
        publishMode: 'publish',
      },
      defaults: {
        defaultTitle: '기본 제목',
        defaultContent: '기본 본문',
      },
    });

    expect(resolved.title).toBe('검증된 최종 제목');
    expect(resolved.content).toBe(structuredContent.bodyPlain);
    expect(resolved.structuredContent).toBe(structuredContent);
  });

  it('does not manufacture a V3-looking legacy identity while resolving plain legacy input', () => {
    const resolved = resolveNaverRunOptions({
      runOptions: {
        title: '레거시 제목',
        content: '레거시 본문',
        publishMode: 'publish',
      },
      defaults: {},
    });

    expect(resolved.title).toBe('레거시 제목');
    expect(resolved.content).toBe('레거시 본문');
    expect(resolved.structuredContent).toBeUndefined();
    expect(resolved).not.toHaveProperty('_contentQualityV3PostId');
    expect(resolved).not.toHaveProperty('_contentQualityV3Required');
    expect(resolved).not.toHaveProperty('_contentQualityV3PublishHandoff');
  });

  it('clones a deep-frozen V3 article into writer-owned mutable data', () => {
    const frozenHeading = Object.freeze({ title: '소제목', content: '본문 문장입니다.' });
    const frozenStructured = Object.freeze({
      _contentQualityV3Required: true,
      selectedTitle: '동결된 V3 제목',
      bodyPlain: '동결된 V3 본문입니다.',
      introduction: '서론 문장입니다.',
      headings: Object.freeze([frozenHeading]),
      conclusion: '마무리 문장입니다.',
      hashtags: Object.freeze(['검증']),
    });

    const resolved = resolveNaverRunOptions({
      runOptions: {
        title: frozenStructured.selectedTitle,
        content: frozenStructured.bodyPlain,
        structuredContent: frozenStructured,
        publishMode: 'publish',
      },
      defaults: {},
    });

    expect(resolved.structuredContent).not.toBe(frozenStructured);
    expect(resolved.structuredContent.headings).not.toBe(frozenStructured.headings);
    expect(Object.isFrozen(resolved.structuredContent)).toBe(false);
    expect(Object.isFrozen(resolved.structuredContent.headings[0])).toBe(false);
    expect(() => {
      resolved.structuredContent.bodyPlain = '작성기 전처리 결과';
      resolved.structuredContent.headings[0].content = '작성기 섹션 결과';
    }).not.toThrow();
    expect(frozenStructured.bodyPlain).toBe('동결된 V3 본문입니다.');
    expect(frozenStructured.headings[0].content).toBe('본문 문장입니다.');
  });

  it('fails closed when any final editor surface changes during commit validation', () => {
    const snapshot = Object.freeze({
      title: '검증된 제목',
      bodyText: '검증된 본문',
      linkCards: Object.freeze([Object.freeze({
        text: '검증된 카드',
        urls: Object.freeze(['https://example.test/item']),
        transformed: true,
      })]),
      bareUrls: Object.freeze([]),
      externalAnchorUrls: Object.freeze([]),
      opaqueVisualCount: 0,
    });

    expect(() => assertEditorVisibleSnapshotUnchanged(snapshot, structuredClone(snapshot)))
      .not.toThrow();
    expect(() => assertEditorVisibleSnapshotUnchanged(snapshot, {
      ...structuredClone(snapshot),
      bodyText: '검증 뒤 바뀐 본문',
    })).toThrow('V3_VISIBLE_SNAPSHOT_CHANGED_BEFORE_COMMIT');
    expect(() => assertEditorVisibleSnapshotUnchanged(snapshot, {
      ...structuredClone(snapshot),
      linkCards: [{
        text: '검증된 카드',
        urls: ['https://example.test/changed'],
        transformed: true,
      }],
    })).toThrow('V3_VISIBLE_SNAPSHOT_CHANGED_BEFORE_COMMIT');
  });
});
