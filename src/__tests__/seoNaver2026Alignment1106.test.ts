/**
 * [2026-11-06] SEO 모드를 네이버 2026 변경에 맞춘다 (사장님 "지금 로직에 맞게 상위노출될 수 있도록 수정개선").
 *
 * 근거 (조사 보고, 네이버 공식 발표):
 *   - 2025-11 신뢰도 중심 통합 랭킹 → 2026-10-15 정식 개편: 공신력·공식성·전문성 높은 출처를 위에 둔다.
 *   - 2026-07-06 스팸 사례 공지: 키워드 반복·남용, 같은 틀로 문장 일부만 바꾼 대량 발행.
 *
 * 앱 점검에서 나온 문제:
 *   1. 경제·정책 정보 글("2026 청년도약계좌 조건")에도 사건·의혹용 골격과 주장 규율이 붙었다 ('경제' → society).
 *   2. 도입에서 출처를 도메인("newsfreezone.co.kr은 …")으로 쓰고, 종료된 제도의 현재 상태는 글 중간에 묻혔다.
 *   3. 해시태그 13개 중 12개가 메인 키워드를 담았고, 소제목 2개 앞에 키워드를 강제로 붙였다.
 *   4. 요약 표 예시가 "기준일 = 오늘 날짜" 한 줄로 모든 글을 같은 틀로 만들었다.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFullPrompt } from '../promptLoader';
import { buildModeBasedPrompt } from '../contentGenerator';
import { skipsIncidentOverlays } from '../content/issueOverlayGate';
import { clampHashtags, resolveHashtagCountRange } from '../content/hashtagCountPolicy';
import { resolveHeadingKeywordPatchMax } from '../contentHeadingKeywordPatch';

const SRC = path.join(__dirname, '..');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');

const ISSUE_BRIEF = '[실측 상위노출 골격 — 이슈형 전용]';
const CLAIM_DISCIPLINE = '[주장·사실 규율 — 사건/의혹 글 전용]';
const prompt = (mode: 'seo' | 'mate' | 'homefeed', hint: string, keyword: string) =>
  buildFullPrompt(mode, hint, false, undefined, undefined, undefined, undefined, undefined, keyword);

describe('incident overlays skip economy information posts', () => {
  it('SEO 경제 정보 글에는 사건·의혹용 골격과 주장 규율을 붙이지 않는다', () => {
    const text = prompt('seo', '경제', '2026 청년도약계좌 조건');
    expect(text).not.toContain(ISSUE_BRIEF);
    expect(text).not.toContain(CLAIM_DISCIPLINE);
  });

  it('메이트도 같다', () => {
    const text = prompt('mate', '경제', '국민취업지원제도 1유형 조건');
    expect(text).not.toContain(ISSUE_BRIEF);
    expect(text).not.toContain(CLAIM_DISCIPLINE);
  });

  it('경제 글이어도 키워드에 사건 신호가 있으면 그대로 붙인다', () => {
    const text = prompt('seo', '경제', '주가조작 혐의 수사 착수');
    expect(text).toContain(ISSUE_BRIEF);
    expect(text).toContain(CLAIM_DISCIPLINE);
  });

  it('사회 · 연예 카테고리는 바뀌지 않는다 (대조)', () => {
    expect(prompt('seo', '사회', '2026 청년도약계좌 조건')).toContain(ISSUE_BRIEF);
    expect(prompt('seo', '연예', '배우 열애 인정')).toContain(CLAIM_DISCIPLINE);
  });

  it('홈판 경제 글은 바뀌지 않는다 (대조)', () => {
    expect(prompt('homefeed', '경제', '2026 청년도약계좌 조건')).toContain('[ISSUE-STORY]');
  });

  // [2026-11-06 실측] 단위 시험은 통과했지만 실제 생성에서는 사건용 골격이 그대로 붙었다 —
  // contentGenerator 가 buildFullPrompt 에 넘기던 키워드(primaryKeyword || keywords[0])는 실제 소스에서 비어 있고,
  // 키워드는 metadata.keywords[0] 에 있다. CTR 훅이 같은 인자를 쓰므로 판정 전용 인자를 따로 둔다.
  it('판정 전용 키워드(11번째 인자)로도 경제 정보 글에서 사건용 블록을 뺀다', () => {
    const text = buildFullPrompt('seo', '경제', false, undefined, undefined, undefined, undefined, undefined, undefined, undefined, '2026 청년도약계좌 조건');
    expect(text).not.toContain(ISSUE_BRIEF);
    expect(text).not.toContain(CLAIM_DISCIPLINE);
    const incident = buildFullPrompt('seo', '경제', false, undefined, undefined, undefined, undefined, undefined, undefined, undefined, '주가조작 혐의 수사 착수');
    expect(incident).toContain(ISSUE_BRIEF);
  });

  it('contentGenerator 가 metadata 키워드를 판정 전용 인자로 넘긴다', () => {
    const generator = read('contentGenerator.ts');
    expect(generator).toMatch(
      /\(source as any\)\.structureGuideBlock,[^\n]*\n\s*getPrimaryKeywordFromSource\(source as any\),[^\n]*\n\s*\);/u,
    );
  });

  it('게이트 함수 — 키워드를 모르면 예전처럼 붙인다', () => {
    expect(skipsIncidentOverlays('seo', '경제', undefined)).toBe(false);
    expect(skipsIncidentOverlays('seo', '경제', '')).toBe(false);
    expect(skipsIncidentOverlays('seo', '경제', '금리 인상')).toBe(true);
    expect(skipsIncidentOverlays('homefeed', '경제', '금리 인상')).toBe(false);
    expect(skipsIncidentOverlays('seo', '시사', '금리 인상')).toBe(false);
  });
});

describe('keyword overuse is reduced (7/6 spam notice)', () => {
  it('SEO · 메이트는 소제목 키워드 접두를 1개까지, 홈판은 0', () => {
    expect(resolveHeadingKeywordPatchMax('seo')).toBe(1);
    expect(resolveHeadingKeywordPatchMax('mate')).toBe(1);
    expect(resolveHeadingKeywordPatchMax('homefeed')).toBe(0);
  });

  const tags = [
    '#청년도약계좌', '#청년도약계좌조건', '#2026청년도약계좌', '#청년도약계좌나이', '#청년도약계좌소득기준',
    '#청년미래적금', '#정부기여금', '#비과세', '#군복무', '#중위소득',
  ];

  it('메인 키워드가 들어간 해시태그는 3개까지만 남기고 순서를 지킨다', () => {
    const out = clampHashtags(tags, 'seo', { primaryKeyword: '2026 청년도약계좌 조건' }).hashtags;
    expect(out.filter((t) => t.includes('청년도약계좌'))).toEqual(['#청년도약계좌', '#청년도약계좌조건', '#2026청년도약계좌']);
    expect(out).toEqual(['#청년도약계좌', '#청년도약계좌조건', '#2026청년도약계좌', '#청년미래적금', '#정부기여금', '#비과세', '#군복무', '#중위소득']);
  });

  it('메이트도 같고, 키워드를 모르거나 다른 모드면 그대로 둔다 (대조)', () => {
    expect(clampHashtags(tags, 'mate', { primaryKeyword: '2026 청년도약계좌 조건' }).hashtags).toHaveLength(8);
    expect(clampHashtags(tags, 'seo').hashtags).toHaveLength(10);
    expect(clampHashtags(tags, 'homefeed', { primaryKeyword: '2026 청년도약계좌 조건' }).hashtags).toHaveLength(7);
    expect(clampHashtags(tags, 'business', { primaryKeyword: '2026 청년도약계좌 조건' }).hashtags).toHaveLength(10);
  });

  it('개수 기준(SEO 10~15)은 그대로다 — 채우기도 하지 않는다', () => {
    expect(resolveHashtagCountRange('seo')).toMatchObject({ min: 10, max: 15 });
  });

  it('해시태그 전략 프롬프트가 같은 기준을 모델에게 말한다', () => {
    const strategy = read('prompts', 'shared', 'hashtag-strategy.prompt');
    expect(strategy).toContain('메인 키워드가 들어간 태그는 3개까지');
    expect(strategy).toMatch(/나머지.*메인 키워드 없이/su);
  });
});

describe('closing user-part rule: the current status of a changed system comes first', () => {
  // [2026-11-06 실측] 시스템 파트의 R0-4 만으로는 같은 자료·같은 프롬프트에서 두 번 중 한 번만 지켜졌다
  //   (청년도약계좌 "신규 가입 종료"). 모델이 가장 강하게 따르는 사용자 파트 끝의 모드별 필수 조건에도 넣는다.
  const RULE = '자료에 제도·서비스가 종료·중단·연장·개정됐다는 내용이 있으면 제목이나 도입 첫 3문장 안에 그 현재 상태를 쓴다';
  const make = (mode: string) => ({
    sourceType: 'custom_text', rawText: '청년도약계좌 신규 가입은 종료됐다. 기존 가입자는 유지할 수 있다.'.repeat(30),
    title: '청년도약계좌 조건', contentMode: mode, toneStyle: 'friendly', metadata: { keywords: ['청년도약계좌 조건'] } as any,
  }) as any;

  it.each(['seo', 'mate'])('%s 모드 사용자 파트에 들어 있다', (mode) => {
    expect(buildModeBasedPrompt(make(mode), mode as any, undefined, 1800)).toContain(RULE);
  });

  it('홈판 · 업체 모드에는 넣지 않는다 (대조)', () => {
    expect(buildModeBasedPrompt(make('homefeed'), 'homefeed' as any, undefined, 1800)).not.toContain(RULE);
    expect(buildModeBasedPrompt(make('business'), 'business' as any, undefined, 1800)).not.toContain(RULE);
  });
});

describe('SEO prompt follows the 2026 trust-based ranking', () => {
  const base = read('prompts', 'seo', 'base.prompt');
  const brief = read('prompts', 'shared', 'fact-brief-header.prompt');

  it('종료·중단·연장·개정된 제도는 현재 상태를 제목이나 첫 문장에 먼저 쓴다', () => {
    expect(base).toContain('종료·중단·연장·개정된 상태라면 그 현재 상태를 제목이나 도입 첫 문장에 먼저 쓴다');
  });

  it('공식 기관 자료의 값을 먼저 쓰고, 출처는 기관·매체 이름으로 쓰며 도메인은 쓰지 않는다', () => {
    expect(base).toContain('공식 기관 자료의 값을 먼저 쓴다');
    expect(base).toContain('웹 주소·도메인은 쓰지 않는다');
  });

  it('같은 구성을 글마다 되풀이하지 않는다 (같은 틀 대량 발행 = 스팸)', () => {
    expect(base).toContain('같은 구성을 글마다 되풀이하지 않는다');
  });

  it('요약 표는 비교할 사실이 3개 이상일 때만, 기준일 행은 자료에 날짜가 있을 때만', () => {
    expect(brief).toContain('비교할 사실이 3개 이상일 때만');
    expect(brief).toContain('기준일 행은 자료에 시행일·개정일·마감일이 있을 때만');
    expect(brief).not.toContain('"label": "기준일", "value": "2026년 8월 26일"');
  });

  it('prompt files stay LF-only (baseline manifest files)', () => {
    for (const rel of [['prompts', 'seo', 'base.prompt'], ['prompts', 'shared', 'fact-brief-header.prompt'], ['prompts', 'shared', 'hashtag-strategy.prompt']]) {
      expect(readFileSync(path.join(SRC, ...rel)).includes(0x0d)).toBe(false);
    }
  });
});
