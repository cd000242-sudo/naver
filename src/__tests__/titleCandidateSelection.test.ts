import { describe, expect, it } from 'vitest';
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
