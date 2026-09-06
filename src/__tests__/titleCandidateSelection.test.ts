import { describe, expect, it } from 'vitest';

import { measureTitleWidth } from '../content/titleLengthPolicy';
import { readFileSync } from 'fs';

import {
  isKeywordEcho,
  selectBestTitleCandidate,
  TITLE_SWAP_MIN_GAIN,
} from '../content/titleCandidateSelection';

/**
 * [2026-08-08 사용자 실측] 에이전트 모드에서 "제목 자동생성"을 골랐는데 입력 키워드가
 * 그대로 제목으로 나왔다. 본문·소제목도 검색하면 누구나 아는 내용 나열이었다.
 *
 * 조사 결과, 제목 품질 로직이 통째로 죽어 있었다.
 *   - 후보 재선택(evaluateTitleQuality 로 titleCandidates 중 최고점 선택)은
 *     generateTitleOnlyPatch 안에만 있었다.
 *   - 그 함수의 호출부 3곳은 전부 allowPaidPostGenerationRepair 뒤에 있고, 그 플래그는
 *     process.env.CONTENT_ALLOW_PAID_POST_GENERATION_REPAIR === '1' 를 요구한다.
 *     이 값은 앱 어디에서도 설정하지 않는다(유료 2차 생성 금지 정책, 테스트로 고정됨).
 *   - 결과: 채점기가 실제 발행 제목에 한 번도 관여하지 못했다.
 *
 * 후보는 이미 같은 호출에서 값을 치르고 받아온 것이므로 재선택은 추가 비용이 0이다.
 */
describe('titleCandidateSelection — 키워드 에코 판정', () => {
  it('키워드를 그대로 옮긴 제목을 잡는다', () => {
    expect(isKeywordEcho('케이뱅크 황금캡슐', '케이뱅크 황금캡슐')).toBe(true);
  });

  it('공백·대소문자 차이는 같은 것으로 본다', () => {
    expect(isKeywordEcho('케이뱅크  황금캡슐 ', '케이뱅크 황금캡슐')).toBe(true);
    expect(isKeywordEcho('Kbank Gold', 'kbank gold')).toBe(true);
  });

  it('키워드를 포함하되 문장이 붙으면 에코가 아니다', () => {
    expect(isKeywordEcho('케이뱅크 황금캡슐, 링크 눌렀는데 보상이 안 보일 때', '케이뱅크 황금캡슐')).toBe(false);
  });

  it('빈 값은 에코로 보지 않는다', () => {
    expect(isKeywordEcho('', '케이뱅크')).toBe(false);
    expect(isKeywordEcho('케이뱅크', '')).toBe(false);
  });
});

describe('titleCandidateSelection — 재선택 정책', () => {
  const scoreBy = (table: Record<string, number>) => (title: string) => table[title] ?? 50;

  it('키워드 에코면 후보로 교체한다 (사용자 실측 케이스)', () => {
    const result = selectBestTitleCandidate({
      selectedTitle: '케이뱅크 황금캡슐',
      candidates: [
        { text: '케이뱅크 황금캡슐, 링크 눌렀는데 보상이 안 보일 때', score: 95 },
        { text: '케이뱅크 황금캡슐 확인 가이드', score: 80 },
      ],
      keyword: '케이뱅크 황금캡슐',
      scoreTitle: scoreBy({
        '케이뱅크 황금캡슐, 링크 눌렀는데 보상이 안 보일 때': 96,
        '케이뱅크 황금캡슐 확인 가이드': 65,
      }),
    });
    expect(result.changed).toBe(true);
    expect(result.reason).toBe('keyword-echo');
    expect(result.title).toBe('케이뱅크 황금캡슐, 링크 눌렀는데 보상이 안 보일 때');
  });

  it('에코를 에코로 바꾸지 않는다', () => {
    const result = selectBestTitleCandidate({
      selectedTitle: '케이뱅크 황금캡슐',
      candidates: [{ text: '케이뱅크  황금캡슐' }],
      keyword: '케이뱅크 황금캡슐',
      scoreTitle: () => 90,
    });
    expect(result.changed).toBe(false);
  });

  it('점수가 확실히 높은 후보만 채택한다 (점수 노이즈로 흔들리지 않음)', () => {
    const base = {
      selectedTitle: 'A 제목',
      candidates: [{ text: 'B 제목' }],
      keyword: '키워드',
    };
    const small = selectBestTitleCandidate({
      ...base,
      scoreTitle: scoreBy({ 'A 제목': 80, 'B 제목': 80 + TITLE_SWAP_MIN_GAIN - 1 }),
    });
    expect(small.changed).toBe(false);

    const big = selectBestTitleCandidate({
      ...base,
      scoreTitle: scoreBy({ 'A 제목': 80, 'B 제목': 80 + TITLE_SWAP_MIN_GAIN }),
    });
    expect(big.changed).toBe(true);
    expect(big.reason).toBe('higher-score');
    expect(big.title).toBe('B 제목');
  });

  it('후보가 없거나 비어 있으면 원본을 유지한다', () => {
    for (const candidates of [undefined, [], [{ text: '  ' }], 'not-an-array']) {
      const result = selectBestTitleCandidate({
        selectedTitle: '원본 제목',
        candidates,
        keyword: '키워드',
        scoreTitle: () => 10,
      });
      expect(result.changed, String(candidates)).toBe(false);
      expect(result.title).toBe('원본 제목');
    }
  });

  it('selectedTitle 이 비면 최고점 후보를 세운다', () => {
    const result = selectBestTitleCandidate({
      selectedTitle: '',
      candidates: [{ text: '낮은 후보' }, { text: '높은 후보' }],
      keyword: '키워드',
      scoreTitle: scoreBy({ '낮은 후보': 40, '높은 후보': 90 }),
    });
    expect(result.changed).toBe(true);
    expect(result.title).toBe('높은 후보');
  });

  it('채점기가 던져도 무너지지 않는다 (발행 차단 금지)', () => {
    const result = selectBestTitleCandidate({
      selectedTitle: '원본 제목',
      candidates: [{ text: '후보 제목' }],
      keyword: '키워드',
      scoreTitle: () => { throw new Error('scorer boom'); },
    });
    expect(result.changed).toBe(false);
    expect(result.title).toBe('원본 제목');
  });
});

describe('배선 — 라이브 단일 제출 경로', () => {
  const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');

  it('유료 수리 경로가 아니라 파싱 직후에 재선택한다', () => {
    expect(generator).toMatch(/import \{ selectBestTitleCandidate \}/);
    const call = generator.indexOf('selectBestTitleCandidate({');
    expect(call).toBeGreaterThan(0);
    // 재선택 지점은 유료 수리 게이트(allowPaidPostGenerationRepair) 앞이어야 한다.
    expect(call).toBeLessThan(generator.indexOf('allowPaidPostGenerationRepair && allowLegacyPostDraftLlm'));
  });

  it('사용자가 제목을 잠갔으면 건드리지 않는다', () => {
    expect(generator).toMatch(/if \(!source\.useKeywordAsTitle && !source\.manualTitleOverride\) \{/);
  });
});

describe('배선 — 에이전트 자기비평 체크리스트', () => {
  const envelope = readFileSync(new URL('../agentCli/agenticEnvelope.ts', import.meta.url), 'utf8');

  it('제목 계약을 자기비평 항목으로 갖는다', () => {
    expect(envelope).toMatch(/입력 키워드를 그대로 제목에 옮겨놓지 않았는가/);
    expect(envelope).toMatch(/상황·조건·시점·갈림길 중 최소 하나가 제목에/);
    expect(envelope).toMatch(/템플릿 종결어로 끝내지 않았는가/);
  });

  it('본문이 "누구나 아는 내용 나열"인지 스스로 묻는다', () => {
    expect(envelope).toMatch(/검색하면 누구나 아는 내용을 나열만 하지 않았는가/);
    expect(envelope).toMatch(/읽어야 할 이유/);
  });
});

describe('배선 — 라이브 제목 계약(situationTitleContract)', () => {
  const contract = readFileSync(new URL('../content/situationTitleContract.ts', import.meta.url), 'utf8');

  it('사용자 실측 종결어를 금지 목록에 담는다', () => {
    for (const banned of ['확인 가이드', '확인 방법', '가이드', '핵심정리', '꿀팁']) {
      expect(contract, banned).toContain(banned);
    }
  });

  it('키워드 그대로 내놓는 것을 금지한다', () => {
    expect(contract).toMatch(/입력 키워드를 그대로 제목으로 내놓지 않는다/);
  });
});

/**
 * [2026-08-27 사장님 실측] 홈판 53자 제목이 발행됐다. 평가기는 -60(42자 초과)으로
 * 29점을 매겼는데, 선별기는 점수만 비교하므로 "덜 나쁜 긴 제목"이 이겼다.
 * 독자는 점수를 보지 않는다 — 피드에서 잘린 제목을 본다. 잘림이 점수보다 앞선다.
 */
describe('길이 계약이 점수보다 앞선다', () => {
  const LONG = '전현무 나혼산 조작설 카자흐스탄 정부의 지원 발표와 사전에 섭외된 것 아니냐는 조작 의혹의 시작';
  const FIT = '전현무 카자흐스탄 즉흥 여행 조작설, 무편집 영상이 뒤집었다';

  it('선택된 제목이 상한을 넘으면 점수가 낮아도 들어맞는 후보로 간다', () => {
    const result = selectBestTitleCandidate({
      selectedTitle: LONG,
      candidates: [{ text: FIT }],
      keyword: '전현무 나혼산',
      mode: 'homefeed',
      scoreTitle: (t) => (t === LONG ? 90 : 40), // 긴 쪽이 더 높은 점수여도
    });
    expect(result.changed).toBe(true);
    expect(result.title).toBe(FIT);
    expect(result.reason).toBe('length-contract');
  });

  it('후보가 전부 길면 그대로 둔다 — 코드가 제목을 자르지 않는다', () => {
    const other = `${LONG} 추가`;
    const result = selectBestTitleCandidate({
      selectedTitle: LONG,
      candidates: [{ text: other }],
      keyword: '전현무 나혼산',
      mode: 'homefeed',
      scoreTitle: () => 50,
    });
    expect(result.title).toBe(LONG);
    expect(result.reason).toBe('kept');
  });

  it('모드를 모르면 가장 느슨한 범위만 쓴다 — 홈판 상한으로 남을 재단하지 않는다', () => {
    // [2026-08-27] 상한이 폭 기준으로 바뀌었다. 예전 시료는 44자였지만 숫자·공백이
    //   섞여 35.5폭이라 이제 계약 안이다 — 순한글로 바꿔 폭으로도 넘게 한다.
    // 42.5폭: 홈판(42) 초과지만 폴백 범위(45) 안이다.
    const midLength = '카자흐스탄으로 떠난 즉흥 여행을 둘러싼 조작설을 뒤집은 무편집 영상과 그날의 공항 풍경';
    expect(measureTitleWidth(midLength)).toBeGreaterThan(42);
    expect(measureTitleWidth(midLength)).toBeLessThanOrEqual(45);

    const withoutMode = selectBestTitleCandidate({
      selectedTitle: midLength,
      candidates: [{ text: FIT }],
      keyword: '전현무 나혼산',
      scoreTitle: (t) => (t === midLength ? 90 : 40),
    });
    expect(withoutMode.reason).not.toBe('length-contract');

    // 같은 제목이라도 홈판이라고 알려주면 계약이 걸린다.
    const withMode = selectBestTitleCandidate({
      selectedTitle: midLength,
      candidates: [{ text: FIT }],
      keyword: '전현무 나혼산',
      mode: 'homefeed',
      scoreTitle: (t) => (t === midLength ? 90 : 40),
    });
    expect(withMode.reason).toBe('length-contract');
  });

  it('길이가 맞는 제목은 예전 규칙대로 점수로만 판단한다', () => {
    const result = selectBestTitleCandidate({
      selectedTitle: FIT,
      candidates: [{ text: '전현무 조작설 무편집 영상이 보여준 공항의 30분' }],
      keyword: '전현무 나혼산',
      mode: 'homefeed',
      scoreTitle: (t) => (t === FIT ? 90 : 40),
    });
    expect(result.reason).toBe('kept');
  });
});

/**
 * [2026-09-06 사장님: "특히 쇼핑모드로 제목을 생성해줄때가 문제야"] 닥터웰 DR-5180 실측.
 * 모델은 "매일 꺼내 쓰기엔 어떨까"(95)를 골랐고 본문(도입 첫 문장·소제목 1·finalVerdict)을
 * 그 질문으로 썼다. 채점기는 '구매 축 없음' -30 으로 70점을 매기고 "착용 방식이 편할까"(100)로
 * 갈아탔는데, 본문 어디에도 착용 방식은 없다. 쇼핑 후보 3개는 같은 상품에 구매 질문만 다른
 * 제목이라, 본문을 다 쓴 뒤 점수만 보고 바꾸면 제목의 약속을 본문이 못 받는다.
 * 쇼핑 16편 전수: 교체 4/4 전부 모델 원선택이 본문 축이었고, 교체 글 관통 miss 2/3 vs 비교체 1/6.
 * 약속을 바꾸지 않는 교체(에코·길이)만 남긴다.
 */
describe('쇼핑 — 약속 보존(preservePromise): 점수로는 제목을 갈아타지 않는다', () => {
  const PICKED = '다리 공기압 마사지기 닥터웰 DR-5180, 매일 꺼내 쓰기엔 어떨까';
  const OTHER = '다리 공기압 마사지기 고를 때 닥터웰 DR-5180 착용 방식이 편할까';
  const scoreLive = (t: string) => (t === PICKED ? 70 : 100);

  it('실측 케이스: 100점 후보가 있어도 모델이 고른 70점 제목을 지킨다', () => {
    const result = selectBestTitleCandidate({
      selectedTitle: PICKED,
      candidates: [{ text: PICKED }, { text: OTHER }],
      keyword: '다리 공기압 마사지기',
      mode: 'affiliate',
      preservePromise: true,
      scoreTitle: scoreLive,
    });
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('kept');
    expect(result.title).toBe(PICKED);
  });

  it('보존을 켜지 않으면 예전대로 점수로 교체한다 (다른 모드 불변)', () => {
    const result = selectBestTitleCandidate({
      selectedTitle: PICKED,
      candidates: [{ text: OTHER }],
      keyword: '다리 공기압 마사지기',
      mode: 'affiliate',
      scoreTitle: scoreLive,
    });
    expect(result.reason).toBe('higher-score');
  });

  it('키워드 에코는 약속이 아니다 — 보존 중에도 교체한다', () => {
    const result = selectBestTitleCandidate({
      selectedTitle: '다리 공기압 마사지기',
      candidates: [{ text: OTHER }],
      keyword: '다리 공기압 마사지기',
      mode: 'affiliate',
      preservePromise: true,
      scoreTitle: () => 80,
    });
    expect(result.reason).toBe('keyword-echo');
    expect(result.title).toBe(OTHER);
  });

  it('상한 초과는 독자가 잘린 제목을 보므로 보존 중에도 교체한다', () => {
    const LONG = '다리 공기압 마사지기 닥터웰 DR-5180 그레이 본체 다리 세트 매일 꺼내 쓰기엔 번거롭지 않을까 궁금하다면';
    const result = selectBestTitleCandidate({
      selectedTitle: LONG,
      candidates: [{ text: OTHER }],
      keyword: '다리 공기압 마사지기',
      mode: 'affiliate',
      preservePromise: true,
      scoreTitle: () => 80,
    });
    expect(result.reason).toBe('length-contract');
    expect(result.title).toBe(OTHER);
  });

  it('selectedTitle 이 비면 보존할 약속이 없다 — 최고점 후보를 세운다', () => {
    const result = selectBestTitleCandidate({
      selectedTitle: '',
      candidates: [{ text: PICKED }, { text: OTHER }],
      keyword: '다리 공기압 마사지기',
      mode: 'affiliate',
      preservePromise: true,
      scoreTitle: scoreLive,
    });
    expect(result.changed).toBe(true);
    expect(result.title).toBe(OTHER);
  });
});

describe('배선 — 쇼핑은 꼬리표를 제자리에서 떼고, 약속은 보존한다', () => {
  const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
  const call = generator.indexOf('selectBestTitleCandidate({');
  const around = generator.slice(Math.max(0, call - 1200), call + 900);

  it('재선택은 쇼핑에서 preservePromise 를 켠다', () => {
    expect(around).toMatch(/preservePromise:\s*mode === 'affiliate'/);
  });

  it('교체 대신 스토어 꼬리표("본체+다리", 대괄호)를 선택 제목에서 먼저 뗀다 — 순기능은 유지', () => {
    // 교체 4편 중 3편의 원선택에 "그레이 본체+다리" 가 붙어 있었다. 교체를 끄면 이게 그대로 나가므로
    // 최종 게이트(1913)와 같은 헬퍼로 재선택 전에 제자리에서 제거한다.
    expect(around).toMatch(/if \(mode === 'affiliate'\)[\s\S]{0,200}stripOptionCombo\(stripStoreTagBrackets\(String\(parsed\.selectedTitle/);
  });
});
