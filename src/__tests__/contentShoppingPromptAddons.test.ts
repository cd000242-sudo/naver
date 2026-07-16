import { describe, expect, it } from 'vitest';

import {
  appendShoppingOfficialSafetyGuard,
  buildShoppingOfficialSafetyGuard,
} from '../contentShoppingPromptAddons';

describe('contentShoppingPromptAddons', () => {
  it('keeps publisher-owned disclosure, no fake experience, and one CTA constraints', () => {
    const guard = buildShoppingOfficialSafetyGuard();

    expect(guard).toContain('쇼핑커넥트 공식 안전 가드');
    expect(guard).toContain('앱이 사용자가 설정한 원문을 글 최상단에 별도로 삽입');
    expect(guard).toContain('모델은 고지 문구를 생성·수정·요약·번역·반복하지 않는다');
    expect(guard).toContain('숨겨진 키워드');
    expect(guard).toContain('직접 써봤다');
    expect(guard).toContain('수집 당시 표시값');
    expect(guard).toContain('현재 판매가로 단정하지 않는다');
    expect(guard).toContain('고민 해결할 수 있을까요');
    expect(guard).toContain('CTA는 글 하단에 1회만');
  });

  it('appends the guard after the shopping prompt body', () => {
    const prompt = appendShoppingOfficialSafetyGuard('SHOPPING PROMPT');

    expect(prompt).toContain('SHOPPING PROMPT');
    expect(prompt).toContain('쇼핑커넥트 공식 안전 가드');
  });
});
