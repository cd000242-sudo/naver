import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05] 홈판의 노출 축 — 사용자 지적으로 발견된 공백.
 *
 * "스크롤을 멈추려면 노출이 먼저 되어야 하잖아. 홈판 노출에 최적화되어야 하는 것 아니냐."
 *
 * 홈피드 파이프라인은 콘텐츠 풀 → 리트리버(AfterSearch/Click2Click) → 랭커 → 노출이고,
 * 클릭(멈춤)은 노출 뒤에 온다. 문서 쪽에서 조작 가능한 노출 레버 중 근거가 가장 강한 것이
 * **제목-본문 일치**다 — 네이버 피드메이커 스쿨[A] 축자:
 *   "제목과 본문 콘텐츠가 자연스러운 흐름으로 읽히도록" / "본문 무관 키워드 금지"
 *
 * 그런데 하네스에는 "제목과 본문 주제가 1:1로 일치" 조건이 **SEO 블록에만** 있었다.
 * 홈피드에 대해 요구된 것이 홈판에는 없고 SEO에만 있는 배치 오류였다.
 *
 * 멈춤 설계와의 관계: 제목이 궁금증을 만드는 것(멈춤)과 본문이 그 궁금증을 갚는 것(일치)은
 * 한 쌍이다. 일치 조건이 없으면 "멈추게 하라"는 압력이 낚시 제목으로 미끄러진다.
 */

const cjpf = readFileSync(new URL('../contentJsonPromptFormat.ts', import.meta.url), 'utf8');

function modeBlock(marker: string): string {
  const start = cjpf.indexOf(marker);
  if (start < 0) return '';
  const rest = cjpf.slice(start);
  const end = rest.indexOf("` : ''}");
  return end < 0 ? rest.slice(0, 1200) : rest.slice(0, end);
}

describe('홈판 제목 조건 — 노출 축', () => {
  const homefeed = modeBlock('[홈판 모드 제목 필수 조건]');
  const seo = modeBlock('[SEO 모드 제목 필수 조건]');

  it('홈판 블록이 실재한다', () => {
    expect(homefeed.length).toBeGreaterThan(0);
  });

  it('제목-본문 일치를 홈판에도 요구한다', () => {
    expect(
      homefeed,
      '피드메이커 스쿨[A]이 홈피드에 요구한 조건이 SEO에만 있었다',
    ).toMatch(/제목과 본문[^\n]*일치|주제 이탈 금지/);
  });

  it('mate의 일치 조건은 그대로다 (회귀 방지)', () => {
    // 조사 정정: "1:1로 일치"는 SEO가 아니라 mate 블록에 있었다.
    // 즉 홈판·SEO 둘 다 없었고, [A]가 홈피드에 요구한 조건이 정작 홈판에서 빠져 있었다.
    expect(modeBlock('[네이버 메이트 모드 제목 필수 조건]')).toMatch(/1:1로 일치/);
  });

  it('SEO는 의도 부합 조건을 유지한다 (회귀 방지)', () => {
    expect(seo).toMatch(/독자가 찾는 답/);
  });

  it('멈춤(궁금증)과 일치(갚기)가 한 쌍으로 명시된다', () => {
    // 제목이 만든 궁금증을 본문이 갚지 않으면 낚시다 — 멈춤 압력의 안전핀.
    expect(homefeed).toMatch(/본문이[^\n]*(?:갚|답)|도입[^\n]*(?:갚|답)/);
  });
});
