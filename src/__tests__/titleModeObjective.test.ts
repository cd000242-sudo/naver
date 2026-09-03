import { describe, it, expect } from 'vitest';
import { scoreDanglingEnding, scoreSearchMatch, isSearchDrivenTitleMode, scorePurchaseAxis } from '../content/titleModeObjective';
import { evaluateTitleQuality } from '../contentTitleEvaluator';
import { buildSituationTitleContract } from '../content/situationTitleContract';

/**
 * [2026-08-26 사장님 지시] 제목은 모드가 이겨야 하는 판에 맞춰 나와야 한다.
 * SEO·메이트·쇼핑·업체는 검색으로 먹고사니 제목에 검색어가 물려 있어야 하고,
 * 홈판은 피드에서 싸우니 검색어를 억지로 끌어오면 안 된다.
 */
describe('검색 모드 제목은 검색어와 물려야 한다', () => {
  const kw = '청약통장 해지 방법';

  it('검색어를 버린 제목이 물린 제목과 동점이 되지 않는다', () => {
    // 수정 전에는 셋 다 100점이었다 — 검색으로 먹고사는 글이 검색어 없는 제목을
    // 달고 나갈 수 있었다는 뜻이다.
    const matched = evaluateTitleQuality('청약통장 해지, 2년 안 채웠을 때 갈리는 지점', kw, 'seo' as any).score;
    const dropped = evaluateTitleQuality('2년 안 채우고 나오면 갈리는 지점', kw, 'seo' as any).score;
    expect(matched).toBeGreaterThan(dropped);
  });

  it('검색어 이탈은 사유로 남는다', () => {
    const r = evaluateTitleQuality('2년 안 채우고 나오면 갈리는 지점', kw, 'seo' as any);
    expect(r.issues.join(' ')).toMatch(/검색어 이탈/);
  });

  it('홈판은 검색어 맞물림을 채점하지 않는다 (피드는 검색이 아니다)', () => {
    expect(isSearchDrivenTitleMode('homefeed')).toBe(false);
    expect(scoreSearchMatch('2년 안 채우고 나오면 갈리는 지점', kw, 'homefeed').points).toBe(0);
  });

  it('검색으로 먹고사는 네 모드에 모두 적용된다', () => {
    for (const mode of ['seo', 'mate', 'affiliate', 'business']) {
      expect(isSearchDrivenTitleMode(mode)).toBe(true);
      // 충분히 물렸으면 결함 없음(0). 버렸으면 감점.
      expect(scoreSearchMatch('청약통장 해지 방법이 갈리는 조건', kw, mode).points).toBe(0);
      expect(scoreSearchMatch('2년 안 채우면 갈리는 조건', kw, mode).points).toBeLessThan(0);
    }
  });

  it('가산점을 주지 않는다 — 가산은 다른 항목의 감점을 흡수해 결함을 가린다', () => {
    // 실측으로 잡은 함정: 구매 축이 없어 -10 이어야 할 쇼핑 제목이
    // 검색어 맞물림 +15에 상쇄되어 100점으로 나왔다. 점수는 Math.min(100)으로 잘린다.
    for (const t of ['청약통장 해지 방법이 갈리는 조건', '청약통장 들고 있는데 지금 어떻게 하나', '전혀 다른 제목']) {
      expect(scoreSearchMatch(t, kw, 'seo').points).toBeLessThanOrEqual(0);
    }
  });

  it('부분 맞물림은 이탈보다 약하게 깎는다', () => {
    const partial = scoreSearchMatch('청약통장 들고 있는데 지금 어떻게 하나', kw, 'seo');
    const away = scoreSearchMatch('2년 안 채우고 나오면 갈리는 지점', kw, 'seo');
    expect(partial.covered).toBe(1);
    expect(partial.points).toBeLessThan(0);
    expect(partial.points).toBeGreaterThan(away.points);
  });
});

describe('모드마다 제목 계약이 자기 판에 맞게 갈린다', () => {
  const build = (m: any) =>
    buildSituationTitleContract(m, { rawText: 'x'.repeat(300) } as any);

  it('쇼핑은 구매 축, 업체는 지역+업종이 필수축이다', () => {
    expect(build('affiliate')).toMatch(/\[구매 축 — 필수\]/);
    expect(build('business')).toMatch(/\[지역·업종 축 — 필수\]/);
  });

  it('업체 홍보는 검색용임을 명시하고 순위·추천 단정을 막는다', () => {
    const c = build('business');
    expect(c).toMatch(/\[업체 홍보 모드/);
    expect(c).toMatch(/피드용이 아니라 검색용/);
    expect(c).toMatch(/잘하는 곳/); // 금지 예시로 등장
    expect(c).toMatch(/지역·업종이 없는 제목은 쓰지 않는다/);
  });

  it('홈판은 검색어를 억지로 끌어오지 말라고 한다', () => {
    expect(build('homefeed')).toMatch(/검색어를 맞출 필요가 없다/);
  });

  it('모드마다 다른 계약이 나온다 — 일반 문구로 뭉개지지 않는다', () => {
    const seen = new Set(
      (['seo', 'homefeed', 'affiliate', 'business'] as const).map((m) => build(m)),
    );
    expect(seen.size).toBe(4);
  });
});

describe('쇼핑 제목은 구매 축이 있어야 한다', () => {
  const kw = '오아 메가에어라이트 써큘레이터';

  it('구매 축이 없으면 결함으로 본다 (계약: 최소 1개 필수)', () => {
    const withAxis = evaluateTitleQuality('오아 메가에어라이트 써큘레이터, 원룸에서 저소음으로 쓸 만한지', kw, 'affiliate' as any);
    const bare = evaluateTitleQuality('오아 메가에어라이트 써큘레이터 사용 후기', kw, 'affiliate' as any);
    expect(withAxis.score).toBeGreaterThan(bare.score);
    expect(bare.issues.join(' ')).toMatch(/구매 축 없음/);
  });

  it('용도·대상·공간·비교조건 네 갈래를 모두 인정한다', () => {
    for (const t of ['써큘레이터 침실용으로 두 달', '써큘레이터 아기 있는 집에서', '원룸 써큘레이터 배치', '저소음 써큘레이터 실사용']) {
      expect(scorePurchaseAxis(t, 'affiliate').points).toBe(0);
    }
  });

  it('쇼핑이 아닌 모드는 건드리지 않는다', () => {
    for (const mode of ['seo', 'homefeed', 'business', 'mate']) {
      expect(scorePurchaseAxis('아무 제목', mode).points).toBe(0);
    }
  });
});

describe('홈판 제목 길이 계약 (2026-08-26 사장님 실측)', () => {
  // 발행본 제목 51자: "박수홍 가족 괌행 비행기 지연 내렸다 다시 탄 게 아니었어요, KE415에서 실제 내려진 건"
  // 채점기는 홈판 42자 초과에 -60점(가장 큰 감점)을 매기는데, 프롬프트는 홈판 제목
  // 길이를 한 번도 말하지 않았다. SEO는 22~42자, 쇼핑·업체는 25~45자가 있었다.
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const issueStory = readFileSync(
    join(__dirname, '..', 'prompts', 'homefeed', 'issue-story.prompt'),
    'utf-8',
  );

  it('홈판 상황형 제목에 길이가 생겼다', () => {
    const c = buildSituationTitleContract('homefeed', { rawText: 'x'.repeat(300) } as any);
    expect(c).toMatch(/28~42자/);
    expect(c).toMatch(/피드 카드에서 잘리면/);
  });

  it('이슈픽 3공식에도 길이가 생겼다 — 미완성 서술은 짧아야 산다', () => {
    expect(issueStory).toMatch(/24~40자/);
    expect(issueStory).toMatch(/그냥 잘린 것.*으로 보여 후킹이 죽는다/);
  });

  it('미완성 서술 허용은 유지한다 — 끊는 것 자체는 이 골격의 장치다', () => {
    expect(issueStory).toMatch(/미완성 서술로 끊는 것은 허용된다/);
  });

  it('길이를 채우려 늘리지 말라고 양쪽 모두 못박는다', () => {
    expect(buildSituationTitleContract('homefeed', {} as any)).toMatch(/길이를 채우려고 수식을 붙이지 마라/);
    expect(issueStory).toMatch(/키워드를 더 넣겠다고 늘리지 마라/);
  });

// [2026-09-03 생성 실측] "닥터웰 종아리 마사지기 DR-5180, 운동 뒤 유선 사용은" — 조사로 끝나 잘린 문장으로 읽힌다
describe('scoreDanglingEnding — 쇼핑 제목의 조사 종결', () => {
  it('은/는/이/가 로 끝나면 -15, 물음·서술어·명사로 닫으면 0', () => {
    expect(scoreDanglingEnding('닥터웰 종아리 마사지기 DR-5180, 운동 뒤 유선 사용은', 'affiliate').points).toBe(-15);
    expect(scoreDanglingEnding('닥터웰 종아리 마사지기, 소음·보관은', 'affiliate').points).toBe(-15);
    expect(scoreDanglingEnding('닥터웰 종아리 마사지기, 유선인데 괜찮을까', 'affiliate').points).toBe(0);
    expect(scoreDanglingEnding('닥터웰 종아리 마사지기, 소음에서 갈린다', 'affiliate').points).toBe(0);
    expect(scoreDanglingEnding('닥터웰 종아리 마사지기 사기 전 볼 것', 'affiliate').points).toBe(0);
    expect(scoreDanglingEnding('닥터웰 종아리 마사지기, 운동 뒤 유선 사용은?', 'affiliate').points).toBe(0);
  });
  it('쇼핑 밖 모드는 건드리지 않는다', () => {
    expect(scoreDanglingEnding('추석 냉장고 정리는', 'seo').points).toBe(0);
  });
});

// [2026-09-03 4차 생성 실측] 제품 조건·조건 물음도 구매 축이다
describe('scorePurchaseAxis — 제품 조건·조건 물음', () => {
  it('소음/보관/설명서 같은 제품 조건이나 "괜찮을까/고를 때" 물음이 있으면 감점하지 않는다', () => {
    expect(scorePurchaseAxis('닥터웰 종아리 마사지기 DR-5180, 소음 있는 다리 안마기 괜찮을까', 'affiliate').points).toBe(0);
    expect(scorePurchaseAxis('닥터웰 종아리 마사지기 DR-5180, 보관 공간까지 보고 고를 때', 'affiliate').points).toBe(0);
    expect(scorePurchaseAxis('닥터웰 종아리 마사지기 DR-5180 그레이 본체+다리', 'affiliate').points).toBe(-30);
  });
});
});
