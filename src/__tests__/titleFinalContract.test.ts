import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

import { evaluateTitleQuality } from '../contentTitleEvaluator';

/**
 * [2026-08-06 사용자 실측] "케이뱅크 황금캡슐 확인 가이드" — 상황도 클릭 이유도 없는
 * 템플릿 제목이 SEO 모드로 발행됐다.
 *
 * 원인: 제목 전용 프롬프트 계층(title/{mode}/{category}.prompt, 30개)이 본문 계층과
 * 정면 충돌했다. 본문은 "○○ 총정리/방법/완벽 가이드 금지 + 상황을 담아라"인데,
 * 제목 프롬프트는 "총정리·핵심만·빠르게 확인"을 클릭 트리거로 권하고 100점 예시까지
 * 그 틀로 제시하며 키워드 앞 N글자 배치를 강제했다. 모델은 제목 프롬프트를 따랐다.
 *
 * 해결: 최후미 오버레이(title/shared/title-final-contract.prompt)로 단일화 —
 * 본문 finalContract 와 같은 검증된 패턴.
 */
describe('title final contract — 최후미 오버레이', () => {
  const contract = readFileSync(
    new URL('../prompts/title/shared/title-final-contract.prompt', import.meta.url), 'utf8',
  );

  it('충돌 무효 선언 + 우선 순위 명시', () => {
    expect(contract).toMatch(/이 절이 위의 모든 제목 지시보다 우선한다/);
    expect(contract).toMatch(/충돌하는 것은 무효/);
  });

  it('클릭 이유(상황·구체 지점)를 요구한다', () => {
    expect(contract).toMatch(/독자가 이 글을 열어야 할 이유/);
    expect(contract).toMatch(/상황·조건·갈림길/);
    expect(contract).toMatch(/도입부 첫 문장이 바로 답/);
  });

  it('템플릿 종결어를 금지한다 (채점기 감점 목록과 정합)', () => {
    for (const word of ['총정리', '방법', '가이드', '핵심정리', '꿀팁']) {
      expect(contract, word).toContain(word);
    }
    expect(contract).toMatch(/확인 가이드/); // 실측 사례 명시
    expect(contract).toMatch(/알아보기|정리해봤습니다/);
  });

  it('키워드 앞 N글자 강제를 폐기한다', () => {
    expect(contract).toMatch(/첫 N글자·맨 앞 같은 고정 위치로/);
    expect(contract).toMatch(/어순을 비틀지 않는다/);
  });

  it('검색어투 소화·물음표 허용이 본문 계약과 같다', () => {
    expect(contract).toMatch(/꼬리는 자연스러운 문장으로 소화/);
    expect(contract).toMatch(/물음표 질문형/);
  });

  it('출력 형식은 바꾸지 않는다 (JSON 계약 보존)', () => {
    expect(contract).toMatch(/JSON 형식을 그대로 지킨다/);
    expect(contract).toMatch(/형식 규칙은 이 절이 바꾸지 않는다/);
  });

  it('후보 3개가 서로 다른 각도여야 한다', () => {
    expect(contract).toMatch(/서로 다른 각도/);
  });
});

describe('title final contract — 배선', () => {
  it('제목 생성이 카테고리 프롬프트 뒤에 계약을 붙인다', () => {
    const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
    expect(generator).toMatch(/title-final-contract\.prompt/);
    expect(generator).toMatch(/titlePrompt = `\$\{titlePrompt\}/);
  });

  it('계약 파일이 빌드 산출물에 복사되는 경로에 있다 (src/prompts 하위)', () => {
    const dir = fileURLToPath(new URL('../prompts/title/shared/', import.meta.url));
    expect(readdirSync(dir)).toContain('title-final-contract.prompt');
  });
});

describe('채점기 정합 — 계약이 막는 제목은 실제로 감점된다', () => {
  it('"확인 가이드"류는 감점되고 상황형은 만점', () => {
    const bad = evaluateTitleQuality('케이뱅크 황금캡슐 확인 가이드', '케이뱅크 황금캡슐', 'seo' as never, '경제');
    const good = evaluateTitleQuality(
      '케이뱅크 황금캡슐, 링크 눌렀는데 보상이 안 보일 때', '케이뱅크 황금캡슐', 'seo' as never, '경제',
    );
    expect(bad.score).toBeLessThan(good.score);
    expect(bad.issues.join(' ')).toMatch(/템플릿 종결어/);
    expect(good.score).toBeGreaterThanOrEqual(90);
  });
});
