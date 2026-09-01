import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { analyzeBenchmark } from '../analytics/benchmarkAnalyzer';
import { SIGNAL_HELP, describeSignal, formatSignalValue } from '../analytics/benchmarkPlainLanguage';

/**
 * [2026-09-02] 사장님 지적 둘 — "초보자들도 보기 쉽게", "박스가 투명해서 글씨가 겹쳐".
 *
 * 이전 카드는 부업 사용자에게 이렇게 말했다:
 *   "안전성 부족 심각 — 우리 35.0 vs 상위 노출 평균 65.0 (즉시 보완)"
 * 내부 지표 이름, 숨은 척도의 소수점, 그리고 무엇을 하라는 말은 없음.
 * 손쓸 수 없는 진단은 소음이다 — 사장님이 계속 말해온 그것이다.
 */

const SERP_REPORT = {
  keyword: '9월 환절기 침구 교체',
  baseline: {
    avgFinalScore: 60, medianFinalScore: 70, avgModeScore: 72, avgHumanlikeScore: 68,
    avgSafetyScore: 65, avgBodyLength: 3012.4, avgConcreteNumbers: 8.6, avgDirectExperience: 4.2,
    sampleSize: 5,
  },
} as never;

const OUR_EVAL = {
  finalScore: 64,
  modeScore: { score: 70 },
  humanlikeScore: { score: 55 },
  safetyScore: { score: 35 },
} as never;

function fixes(): string[] {
  return analyzeBenchmark(OUR_EVAL, 2311, 3, 1, SERP_REPORT).topPriorityFix;
}

describe('보완 문구는 사람이 쓰는 말과 할 일을 담는다', () => {
  it('내부 지표 이름을 그대로 내밀지 않는다', () => {
    const joined = fixes().join(' | ');
    expect(joined).not.toMatch(/안전성 부족/u);
    expect(joined).not.toMatch(/모드 적합도/u);
    expect(joined).not.toMatch(/구체 수치\(단위\)/u);
  });

  it('소수점을 보여주지 않는다 — 휴리스틱 점수에 0.1 단위 정밀도는 없다', () => {
    const joined = fixes().join(' | ');
    expect(joined).not.toMatch(/\d+\.\d/u);
  });

  it('개발자 말투("우리 vs 상위 노출 평균", "즉시 보완")를 쓰지 않는다', () => {
    const joined = fixes().join(' | ');
    expect(joined).not.toMatch(/우리 \d/u);
    expect(joined).not.toMatch(/즉시 보완/u);
    expect(joined).not.toMatch(/개선 권장/u);
  });

  it('항목마다 할 일이 한 줄 붙는다', () => {
    const list = fixes();
    expect(list.length).toBeGreaterThan(0);
    for (const line of list) {
      expect(line, `할 일이 없는 진단: ${line}`).toContain('→');
    }
  });

  it('단위가 지표에 맞는다 — 길이는 자, 점수는 점', () => {
    const joined = fixes().join(' | ');
    expect(joined).toMatch(/글 길이 [\d,]+자/u);
    expect(joined).toMatch(/표현 안전 \d+점/u);
  });

  it('길이는 순위 기준이 아니라고 분명히 말한다 — 분량 압박을 만들지 않는다', () => {
    const lengthLine = fixes().find((l) => l.includes('글 길이'));
    expect(lengthLine).toBeTruthy();
    expect(lengthLine).toContain('길이 자체는 순위 기준이 아닙니다');
  });

  it('겪은 이야기 부족은 사용자가 실제로 누를 수 있는 것을 가리킨다', () => {
    expect(SIGNAL_HELP['직접 경험 표현'].action).toContain('AI가 경험을 대신 써주기');
  });
});

describe('평문 사전 자체', () => {
  it('모르는 지표가 와도 빈칸을 만들지 않는다', () => {
    const help = describeSignal('앞으로 생길 새 지표');
    expect(help.label).toBe('앞으로 생길 새 지표');
  });

  it('천 단위를 읽기 쉽게 끊는다', () => {
    expect(formatSignalValue(3012.4, '자')).toBe('3,012자');
    expect(formatSignalValue(35, '점')).toBe('35점');
    expect(formatSignalValue(8.6, '개')).toBe('9개');
  });
});

describe('카드가 뒤를 가린다 — 투명 배경 회귀 잠금', () => {
  const code = readFileSync(resolve(__dirname, '..', 'renderer', 'renderer.ts'), 'utf-8');

  /*
   * 알파 0.20 짜리 배경 위에 흰 글씨를 얹고 있었다. 카드가 생성 옵션 패널 위에 떠서
   * 뒤 체크박스 라벨이 그대로 비쳐 글자가 겹쳤다(사장님 스크린샷).
   */
  it('불투명 바탕을 색조 밑에 깐다', () => {
    expect(code).toMatch(/const bgColor = `\$\{tint\}, #[0-9a-f]{6}`/u);
  });

  it('카드 제목에 SERP 같은 전문 용어를 쓰지 않는다', () => {
    expect(code).toContain("'검색 상위 글과 비교 — 좋습니다'");
    expect(code).not.toContain("'SERP 실측 비교 — 보완 필요'");
  });

  it('중앙값 같은 통계 용어를 카드에 띄우지 않는다', () => {
    const cardStart = code.indexOf('function showSerpAlertCard');
    const cardEnd = code.indexOf('function showSerpDetailModalFromAutoData');
    expect(cardStart).toBeGreaterThan(-1);
    expect(code.slice(cardStart, cardEnd)).not.toContain('중앙값');
  });

  it('할 일 문장을 80자에서 자르지 않는다 — 잘리면 무엇을 하라는지가 사라진다', () => {
    const cardStart = code.indexOf('function showSerpAlertCard');
    const cardEnd = code.indexOf('function showSerpDetailModalFromAutoData');
    expect(code.slice(cardStart, cardEnd)).not.toContain('.slice(0, 80)');
  });
});
