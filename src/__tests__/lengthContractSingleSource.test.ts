import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * [2026-08-26] 분량 계약 단일화.
 * 사장님 지시: "글자수가 중요하지 않다, 내용이 중요하다."
 * 예전 R0-5는 "2,500~3,300자에 맞춘다 / 짧으면 더 채우고"라 패딩 압력을 만들었고,
 * 같은 프롬프트의 체크리스트와 JSON 포맷 지시는 정반대로 패딩을 금지하고 있었다.
 */
const seoBase = readFileSync(
  join(__dirname, '..', 'prompts', 'seo', 'base.prompt'),
  'utf-8',
);
const jsonFormat = readFileSync(
  join(__dirname, '..', 'contentJsonPromptFormat.ts'),
  'utf-8',
);

describe('분량 계약은 한 곳에서만 정의된다', () => {
  it('R0-5는 채워야 할 글자수를 지정하지 않는다', () => {
    expect(seoBase).toMatch(/R0-5\. 분량은 목표가 아니라 결과다/);
    expect(seoBase).not.toMatch(/2,500~3,300자에 맞춘다/);
    expect(seoBase).not.toMatch(/목표보다 짧으면 핵심 정보·근거·구체 사례를 더 채우고/);
  });

  it('짧게 끝내는 것도 위반으로 함께 막는다 — 길이 대신 답의 완결로 본다', () => {
    expect(seoBase).toMatch(/약속한 질문이 남아 있으면 끝난 글이 아니다/);
  });

  it('JSON 포맷 지시도 목표 글자수를 제시하지 않는다', () => {
    expect(jsonFormat).not.toMatch(/목표 글자수: \$\{minChars\}자 안팎/);
    expect(jsonFormat).toMatch(/분량은 목표가 아니라 결과다/);
  });
});

describe('결론부에 고정 골격을 두지 않는다 (2026-08-26)', () => {
  it('"6줄 공식"과 "5개 체크리스트" 요구가 사라졌다', () => {
    // 실측: 인물 근황 글 끝에 "- 관계 확인 / - 소동 계기 / - 최근 근황" 목록이 붙어
    // 결론 문장과 엉켰다. 주제와 무관하게 매번 같은 덩어리가 붙는 구조였다.
    expect(seoBase).not.toMatch(/결론부 6줄 공식/);
    expect(seoBase).not.toMatch(/결론부 5개 체크리스트/);
    expect(seoBase).not.toMatch(/5개 항목 체크리스트 블록/);
  });

  it('R0-3(고정 위치 금지)과 같은 방향으로 다시 썼다', () => {
    expect(seoBase).toMatch(/\[결론부 — 공식 없음/);
    expect(seoBase).toMatch(/항목 수를 맞추지 마라/);
    expect(seoBase).toMatch(/결론마다 반복되는 덩어리/);
  });

  it('파생 Q&A도 실제 질문이 있을 때만으로 바뀌었다', () => {
    expect(seoBase).not.toMatch(/\[검색 종결 Q&A 패턴 — 필수\]/);
    expect(seoBase).toMatch(/실제 질문이 있을 때만/);
  });
});
