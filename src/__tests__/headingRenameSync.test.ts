import { describe, expect, it } from 'vitest';

import { applyHeadingRenames } from '../content/headingRenameSync';

/**
 * [2026-09-01] 소제목을 고쳐도 독자에게는 옛 소제목이 나갔다.
 *
 * contentHeadingOptimizer.syncHeadingsWithBodyPlain 은 빈 껍데기다 —
 * 로그 한 줄만 찍고 끝인데, 호출부가 셋이다(contentGenerator :6597 · :6799 · :6828).
 * 그 앞에서 소제목을 실제로 바꾸는 곳이 둘이다.
 *   optimizeHeadingsForMode      모드별 소제목 보정
 *   applyHeadingKeywordPatch     SEO 메인키워드 앞배치
 *
 * 발행은 headings[] 가 아니라 bodyPlain 을 타이핑한다. 그래서 두 보정이
 * 독자에게 한 번도 도달하지 않았다. SEO 키워드 패치도 마찬가지다.
 *
 * 더 위험한 것: 발행 코드가 소제목 문자열을 본문에서 글자 그대로 찾는다
 * (editorHelpers:935 bodyText.includes(title), :966 bodyText.indexOf(h.title)).
 * 어긋나면 이미지 넣을 자리를 못 찾는다 — 사장님이 겪은 이미지 슬롯 소실과 같은 계열이다.
 *
 * 옛 휴리스틱 동기화를 되살리지 않는다(그건 의도적으로 껐던 것이다).
 * 바꾸기 전후 문자열을 우리가 알고 있으므로 리터럴 치환이면 충분하다.
 */
describe('소제목을 바꾸면 본문도 같이 바뀐다', () => {
  it('bodyPlain 의 옛 소제목이 새 소제목으로 교체된다', () => {
    const body = '도입부입니다.\n\n성에 제거\n\n전원을 끄세요.';
    const out = applyHeadingRenames(body, [{ from: '성에 제거', to: '냉동실 성에 제거 순서' }]);
    expect(out).toContain('냉동실 성에 제거 순서');
    expect(out).not.toContain('\n성에 제거\n');
  });

  it('여러 개를 한 번에 바꾼다', () => {
    const body = '가 소제목\n\n내용1\n\n나 소제목\n\n내용2';
    const out = applyHeadingRenames(body, [
      { from: '가 소제목', to: '첫째 축' },
      { from: '나 소제목', to: '둘째 축' },
    ]);
    expect(out).toContain('첫째 축');
    expect(out).toContain('둘째 축');
  });

  it('본문 중간에 같은 말이 있어도 소제목 줄만 바꾼다', () => {
    // "성에 제거" 가 설명 문장 안에도 있다. 줄 전체가 그 소제목일 때만 바꾼다.
    const body = '성에 제거\n\n성에 제거는 전원을 끄고 시작합니다.';
    const out = applyHeadingRenames(body, [{ from: '성에 제거', to: '성에 제거 순서' }]);
    expect(out).toBe('성에 제거 순서\n\n성에 제거는 전원을 끄고 시작합니다.');
  });

  it('마크다운 소제목 표기도 함께 바꾼다', () => {
    const body = '## 성에 제거\n\n내용';
    expect(applyHeadingRenames(body, [{ from: '성에 제거', to: '성에 제거 순서' }]))
      .toBe('## 성에 제거 순서\n\n내용');
  });
});

describe('망가뜨리지 않는다', () => {
  it('바뀐 것이 없으면 본문을 그대로 돌려준다', () => {
    const body = '내용입니다.';
    expect(applyHeadingRenames(body, [])).toBe(body);
    expect(applyHeadingRenames(body, [{ from: '없는 소제목', to: '새것' }])).toBe(body);
  });

  it('from 과 to 가 같으면 건드리지 않는다', () => {
    const body = '성에 제거\n\n내용';
    expect(applyHeadingRenames(body, [{ from: '성에 제거', to: '성에 제거' }])).toBe(body);
  });

  it('정규식 특수문자가 든 소제목도 안전하다', () => {
    const body = '가격 (2026) 정리\n\n내용';
    expect(applyHeadingRenames(body, [{ from: '가격 (2026) 정리', to: '가격 기준' }]))
      .toBe('가격 기준\n\n내용');
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(applyHeadingRenames('', [{ from: 'a', to: 'b' }])).toBe('');
    expect(() => applyHeadingRenames(undefined as never, undefined as never)).not.toThrow();
  });
});
