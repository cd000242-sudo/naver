import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-08-31 사장님 실측] 카리나 홍콩 레드카펫 글의 첫 문장이 이랬다.
 *
 *   "카리나 관련 선택을 앞두고 있다면 내 상황에 맞는 조건인지부터 확인해 보세요.
 *    핵심 기준과 주의할 점을 순서대로 살펴보겠습니다."
 *
 * 모델이 쓴 문장이 아니다. contentPolicy 가 유사도 판정 뒤 도입부를 고정 템플릿으로
 * 갈아끼운 것이다. 대출·지원금 같은 정책 글에나 쓸 문장이라 연예 패션 글에는 맞지 않는다.
 *
 * 로그가 그 앞뒤를 보여준다.
 *   [SeoBodyQuality] 📊 80/100
 *   [QualityChecker] ✅ Critical 위반 없음
 *   [ContentPolicy] Generated draft repaired before image generation (2회)
 * 품질에 문제가 없다고 판정한 직후에 갈아끼웠다.
 *
 * 게다가 치료가 병보다 나쁘다. 목적은 "도입부가 최근 글과 겹치지 않게" 인데,
 * 걸린 글을 전부 같은 두 문장 중 하나로 시작하게 만든다 — 중복을 막겠다며 중복을 만든다.
 *
 * 사장님 지적이 이 판단의 기준이다.
 *   "글이 전문가가 읽어도 수긍하면서 맛있게 읽히는 글이어야 되는데, 오히려 LLM 으로
 *    글 쓴 게 더 나을 정도야. 이러면 내 툴을 API 비용 내가며 쓸 이유가 없어지잖아."
 *
 * 후처리는 모델 결과물을 지킬 때만 값어치가 있다. 못 고칠 바에는 그대로 두고 알린다.
 */
const SRC = resolve(__dirname, '../contentPolicy/orchestrator.ts');
const read = () => readFileSync(SRC, 'utf-8');

describe('도입부 고정 템플릿', () => {
  it('정책 글용 문장이 코드에 남아 있지 않다', () => {
    // 주석에는 사고 기록으로 그 문장이 인용돼 있다 — 코드 줄만 본다.
    const codeOnly = read().split('\n')
      .filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
      .join('\n');
    expect(codeOnly).not.toContain('관련 선택을 앞두고 있다면 내 상황에 맞는 조건인지부터');
    expect(codeOnly).not.toContain('정보를 찾고 있다면 눈에 띄는 문구보다 실제 사용 조건과');
  });

  it('유사도만으로 도입부를 갈아끼우지 않는다', () => {
    const codeOnly = read().split('\n')
      .filter((l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
      .join('\n');
    expect(codeOnly).not.toMatch(/rewriteIntroductionForSimilarity\(/);
  });

  it('도입부가 아예 비었을 때만 코드가 채운다', () => {
    // 빈 도입부는 글이 성립하지 않으므로 그때는 채워야 한다.
    expect(read()).toMatch(/!originalIntroduction/);
  });

  it('재작성 사유를 로그에 남긴다 — 왜 고쳤는지 모르면 다음에도 못 잡는다', () => {
    expect(read()).toMatch(/ContentPolicy[^\n]*(사유|reasons)/);
  });
});
