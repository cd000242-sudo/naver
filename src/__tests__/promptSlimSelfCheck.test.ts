import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-08-26] SEO base.prompt 의 [SECTION 13] 자가 점검 체크리스트(1,412자, 30항목)를 지웠다.
 *
 * 사장님 질문: "프롬프트가 4만자 이상일 필요가 있을까?? 죽은 프롬프트까지 같이 올리는 거 아냐?"
 *
 * 30항목을 앞 섹션과 하나씩 대조한 결과 전부 되풀이였다 — "B1~B20 0건인가"는 SECTION 9,
 * "HW 8개 이상인가"도 SECTION 9, "같은 어미 2회 연속"은 SECTION 10, R0-5 는 이름까지 그대로
 * 인용하고 있었다. 질문으로 바꿔 다시 적는다고 새 제약이 생기지 않는다.
 *
 * 게다가 대가가 있었다. 모델이 이 블록을 "검증하라"가 아니라 "쓸 내용"으로 받아
 * "솔직하게 자체비평하겠습니다" 를 본문에 적었고, forbiddenPhrases 의 메타비평 목록과
 * stripMetaCritiqueLines 가 그 줄을 지우고 있었다 — 지시가 만든 문제를 코드가 막는 구조다.
 *
 * 실제 강제는 [SECTION 14] 최종 교정 벽(3줄)과 코드 게이트가 한다.
 */
const BASE = resolve(__dirname, '../prompts/seo/base.prompt');
const read = () => readFileSync(BASE, 'utf-8');

describe('SEO 프롬프트 자가 점검 체크리스트 제거', () => {
  it('체크리스트 블록이 없다', () => {
    const prompt = read();
    expect(prompt).not.toMatch(/\[SECTION 13\][^\n]*자가 점검 체크리스트/);
    expect(prompt).not.toMatch(/\[Anti-Hallucination\]/);
    expect(prompt).not.toMatch(/HW1~HW15 중 8개 이상 적용되었는가/);
  });

  it('자문형 체크박스가 없다', () => {
    // 남은 □ 3개는 [통합랭킹 생존 체크리스트] — "이렇게 써라"는 지시문이다.
    // 지운 건 "~했는가?" 로 앞 규칙을 되묻던 자문형뿐이다.
    const selfAsking = (read().match(/^□.*(?:인가|는가|았는가)\?/gm) || []);
    expect(selfAsking).toEqual([]);
  });

  it('실제 강제 장치인 최종 교정 벽은 남아 있다', () => {
    expect(read()).toMatch(/\[SECTION 14\] FINAL SELF-CORRECTION WALL/);
  });

  it('메타 표현 금지는 최종 교정 벽이 계속 말한다', () => {
    expect(read()).toMatch(/점검 결과는 출력하지 마라/);
  });

  it('제거 후에도 규칙 자체는 앞 섹션에 남아 있다 — 규칙을 지운 게 아니다', () => {
    const prompt = read();
    expect(prompt).toMatch(/B1\./);          // 블랙리스트 원본
    expect(prompt).toMatch(/HW1\./);         // 사람 글 지문 원본
    expect(prompt).toMatch(/QUMA/);          // 이미지 일관성 원본
  });
});
