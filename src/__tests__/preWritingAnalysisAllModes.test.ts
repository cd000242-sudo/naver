import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

/**
 * [2026-08-05] 추론 선행의 전 모드 일반화 — 사용자 요구.
 *
 * "AI의 기능을 100% 발휘하려면 추론이 중요하다. 키워드를 주면 이 키워드가 왜 뜨는지
 *  실시간으로 추론해서, 어떤 글을 어떻게 써야 홈판·상위노출·메이트 선정이 되는지
 *  심층 추론한 뒤 제목·소제목·본문·이미지 프롬프트를 도출해야 한다. 어떤 모드든."
 *
 * 실측: 쇼핑 포함 전 모드가 buildContentJsonOutputFormat 한 함수를 타고(:2386 단일
 * 호출부), 스키마 첫 필드가 selectedTitle 이라 자료 분석 전에 제목부터 생성됐다.
 * 이슈픽에만 넣었던 issueAnalysis 를 preWritingAnalysis 로 일반화한다 —
 * 모드마다 추론 축이 다르다:
 *   SEO/mate   검색 의도 판정 + 본문이 답해야 할 질문(→소제목 대응)
 *   홈판       스크롤 멈춤 갭 (이슈픽은 확정/미확정/궁금증 갭 추가)
 *   쇼핑       구매 갈림 조건 + 근거 모드 판정 + 자료 관찰 우려
 *   업체       문의로 이어지는 고객 상황
 *
 * 환각 가드: "왜 지금 뜨는가"(whyNow)는 자료의 시점·사건 단서가 있을 때만 그 단서로
 * 추론하고, 없으면 "단서 없음"이라 적게 한다 — 트렌드 이유를 지어내는 통로를 막는다.
 *
 * 파서 안전: preWritingAnalysis 는 어떤 소비 코드에도 없어 본문에 누출될 수 없다.
 */

function format(mode: string, categoryHint = '생활'): string {
  return buildContentJsonOutputFormat({
    contentMode: mode, mode, source: { categoryHint },
    title: '', rawText: '테스트 자료 본문', primaryKeyword: '테스트', subKeywords: '',
  } as never);
}

const MODES = ['seo', 'homefeed', 'mate', 'affiliate', 'business'] as const;

describe('추론 선행 — 전 모드에서 분석이 제목보다 앞이다', () => {
  it.each(MODES)('%s 스키마에 preWritingAnalysis 가 있다', (mode) => {
    expect(format(mode)).toContain('"preWritingAnalysis"');
  });

  it.each(MODES)('%s 에서 분석이 selectedTitle 보다 앞이다', (mode) => {
    const f = format(mode);
    const a = f.indexOf('"preWritingAnalysis"');
    const t = f.indexOf('"selectedTitle"');
    expect(a).toBeGreaterThan(-1);
    expect(a, 'LLM 은 필드 순서대로 생성한다').toBeLessThan(t);
  });

  it.each(MODES)('%s 의 whyNow 가 단서를 능동 채굴하게 한다', (mode) => {
    // 크롤링·검색 API·지표가 이미 단서를 모아 오므로 "단서 없음" 조기 포기를
    // 허용하지 않는다. 단서 소스를 열거하고 실제로 훑게 강제하되,
    // 자료 밖 트렌드 이유 날조 금지는 유지한다.
    const f = format(mode);
    expect(f).toContain('"whyNow"');
    expect(f).toMatch(/뉴스[\s\S]{0,40}상위 노출 글|상위글 반복 지점/);
    expect(f).toMatch(/지식iN/);
    expect(f).toMatch(/검색량/);
    expect(f).toMatch(/지어내지 않/);
    expect(f).toMatch(/훑고도 시점 단서가 없으면|훑지 않고 건너뛰지 않는다/);
  });

  it.each(MODES)('%s 에서 분석을 본문에 옮기지 말라고 명시한다', (mode) => {
    expect(format(mode)).toMatch(/preWritingAnalysis[\s\S]{0,120}?본문에 옮기지 않는다/);
  });

  // [2026-08-06 라이브 실측] 키워드 "이런 엿같은 사랑 하영 누구"에서 "이런 엿같은
  // 사랑"(드라마 제목)이 일반 수식어로 취급됐다. 고유명사 판별은 전 모드 공통 축이다.
  it.each(MODES)('%s 의 공통 축에 고유명사 판별(entityCheck)이 있다', (mode) => {
    const f = format(mode);
    expect(f).toContain('"entityCheck"');
    expect(f).toMatch(/작품명[·,]?\s*인물명/);
  });

  it('홈판 titleRationale 은 피드에서 멈춤을 만드는 근거를 요구한다', () => {
    expect(format('homefeed')).toMatch(/피드 노출면|스크롤 중 어느 지점에서 멈춤/);
  });
});

describe('추론 선행 — 모드별 축', () => {
  it('SEO: 검색 의도 판정 + 답해야 할 질문 → 소제목 대응', () => {
    const f = format('seo');
    expect(f).toContain('"searchIntent"');
    expect(f).toContain('"mustAnswer"');
    expect(f).toMatch(/mustAnswer[\s\S]{0,200}?소제목/);
  });

  it('mate: SEO 축 + 인용 원자 후보', () => {
    const f = format('mate');
    expect(f).toContain('"searchIntent"');
    expect(f).toContain('"citationAtoms"');
  });

  it('홈판(일반): 멈춤 갭 — 자료 실재 소재만', () => {
    const f = format('homefeed', '반려동물');
    expect(f).toContain('"stopReason"');
    expect(f).toMatch(/자료에 실재/);
    expect(f).not.toContain('"curiosityGaps"'); // 이슈픽 전용 축은 없다
  });

  it('홈판(이슈픽): 확정/미확정/궁금증 갭 유지', () => {
    const f = format('homefeed', '연예');
    expect(f).toContain('"confirmed"');
    expect(f).toContain('"unconfirmed"');
    expect(f).toContain('"curiosityGaps"');
    expect(f).toMatch(/공적 활동/);
  });

  it('쇼핑: 구매 갈림 + 근거 모드 판정 + 관찰 우려', () => {
    const f = format('affiliate');
    expect(f).toContain('"purchaseDecision"');
    expect(f).toContain('"evidenceMode"');
    expect(f).toContain('"objections"');
    expect(f).toMatch(/FIRST_PARTY|REVIEW_SYNTHESIS|SPEC_ONLY/);
  });

  it('업체: 문의로 이어지는 고객 상황', () => {
    expect(format('business')).toContain('"inquiryTrigger"');
  });
});

describe('추론 선행 — 이미지 프롬프트도 추론에서 나온다', () => {
  it.each(MODES)('%s 에 imageDirection 이 있고 소제목 장면 도출을 지시한다', (mode) => {
    const f = format(mode);
    expect(f).toContain('"imageDirection"');
    expect(f).toMatch(/imagePrompt[\s\S]{0,160}?(?:구체 장면|장면에서 도출)/);
  });
});

describe('추론 선행 — 파서 안전 (본문 누출 불가)', () => {
  it('생성 소비 코드가 preWritingAnalysis 를 읽지 않는다', () => {
    const gen = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
    expect(gen).not.toMatch(/parsed\.preWritingAnalysis/);
  });
});
