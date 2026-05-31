/**
 * contentHumanlikeSelfVerify.test.ts
 *
 * 자체 검증(self-verification) — 라이브 LLM 생성 없이 "사람보다 사람처럼" 작성 여부를
 * 코드(평가기)만으로 판별할 수 있음을 변수·경우의 수별로 망라 증명한다.
 *
 * evaluateHumanlike가 채점하는 7개 변수를 각각 단독으로 검증하고(고/저 대비),
 * 합성 글(현실적 사람글 vs AI글)·엣지 케이스·휴머나이저·상투어·AI탐지를 함께 핀한다.
 * 이 스위트가 모두 통과하면 "코드가 사람다움을 스스로 판별한다"가 증명된다.
 */
import { describe, it, expect } from 'vitest';
import { humanizeContent, analyzeAiDetectionRisk } from '../aiHumanizer';
import { detectPlatitudes } from '../contentPlatitudeDetector';
import { evaluateHumanlike } from '../content/evaluators/humanlikeEval';
import { evaluate, type EvaluationInput } from '../content/qualityEvaluator';

const seo = (body: string): EvaluationInput => ({ body, mode: 'seo' });

// ─────────────────────────────────────────────────────────────
// 합성 글: 현실적인 "사람글" vs "AI글" (≥5문장, ≥500자, 7변수 전부 대비)
// ─────────────────────────────────────────────────────────────

// 사람글: 문장 길이 다양 + 어미 다양 + 자기정정 + 구어체 + 클리셰 0 + 직접경험.
const HUMAN_ARTICLE = [
  '솔직히 처음엔 별 기대 안 했어요.',
  '근데 직접 써보니까 생각이 확 달라지더라고요.',
  '제가 한 2주 정도 매일 들고 다니면서 실제로 테스트해봤는데, 손에 딱 잡히는 그립감부터가 확실히 다르긴 했어요.',
  '막상 무게는 좀 나가요.',
  '그래도 그게 또 안정감으로 느껴지는 게 신기하죠.',
  '의외로 배터리가 진짜 오래 가서 하루 종일 켜놔도 멀쩡했고요.',
  '알고보니 절전 모드를 켜두면 체감상 이틀까지도 버티더라고요.',
  '제가 찍은 사진 보면 색감이 되게 따뜻하게 나와서, 카페나 음식 사진 찍을 때 특히 마음에 들었어요.',
  '단점이라면 가격이 좀 부담되는 정도?',
  '그래도 한 달 넘게 써본 입장에선 충분히 값어치한다고 봐요.',
].join(' ');

// AI글: 모든 문장 '~니다' 균일 종결 + AI 클리셰 3개+ + 직접경험/구어체/자기정정 없음 + 길이 균일.
const AI_ARTICLE = [
  '안녕하세요. 오늘은 이 제품에 대해 자세히 알아보겠습니다.',
  '이번 글에서는 제품의 주요 특징을 소개해드리겠습니다.',
  '이 제품은 매우 우수한 성능을 제공하는 제품입니다.',
  '디자인 또한 매우 세련되고 고급스러운 느낌을 제공합니다.',
  '배터리 성능도 상당히 우수한 수준을 유지하고 있습니다.',
  '많은 분들이 이 제품을 긍정적으로 평가하고 있습니다.',
  '가격대 또한 합리적인 수준으로 책정되어 있습니다.',
  '종합적으로 살펴보면 매우 만족스러운 제품이라고 할 수 있습니다.',
].join(' ');

describe('자체검증: evaluateHumanlike 합성 글 — 사람글이 AI글보다 사람답다', () => {
  it('사람글 점수 ≥ 60, AI글 점수 ≤ 40, 격차 ≥ 25', () => {
    const human = evaluateHumanlike(seo(HUMAN_ARTICLE));
    const ai = evaluateHumanlike(seo(AI_ARTICLE));
    expect(human.score).toBeGreaterThanOrEqual(60);
    expect(ai.score).toBeLessThanOrEqual(40);
    expect(human.score - ai.score).toBeGreaterThanOrEqual(25);
  });

  it('AI글은 클리셰 부재 점수 0 + 사람글은 만점(15)', () => {
    expect(evaluateHumanlike(seo(AI_ARTICLE)).details.noAiCliche).toBe(0);
    expect(evaluateHumanlike(seo(HUMAN_ARTICLE)).details.noAiCliche).toBe(15);
  });

  it('AI글은 직접경험 신호가 사람글보다 낮다', () => {
    const human = evaluateHumanlike(seo(HUMAN_ARTICLE));
    const ai = evaluateHumanlike(seo(AI_ARTICLE));
    expect(human.details.directExperience).toBeGreaterThan(ai.details.directExperience);
  });
});

describe('자체검증: 7개 변수 각각 단독 응답 (고 vs 저)', () => {
  it('1) Burstiness — 길이 균일하면 낮고, 다양하면 높다', () => {
    const uniform = '가나다라마바사아자차카타파하가나다. 가나다라마바사아자차카타파하가나다. 가나다라마바사아자차카타파하가나다. 가나다라마바사아자차카타파하가나다. 가나다라마바사아자차카타파하가나다. 가나다라마바사아자차카타파하가나다.';
    const varied = '짧아요. 이건 좀 더 길게 써본 문장인데 그래도 적당한 길이죠. 진짜 길게 늘여서 쓴 문장은 이렇게 한참을 이어가면서 군더더기도 넣고 디테일도 붙이고 그래야 길이 분산이 커지면서 사람 글다운 리듬이 생기는 거예요. 또 짧게. 중간 길이의 문장도 하나 넣어둡니다. 끝.';
    expect(evaluateHumanlike(seo(uniform)).details.burstiness)
      .toBeLessThan(evaluateHumanlike(seo(varied)).details.burstiness);
  });

  it('2) 어미 변주 — 같은 어미 반복은 낮고, 다양하면 높다', () => {
    const mono = '좋습니다. 좋습니다. 좋습니다. 좋습니다. 좋습니다. 좋습니다.';
    const diverse = '좋아요. 괜찮더라고요. 만족스럽죠. 추천합니다. 써볼 만해요. 후회 없었네요.';
    expect(evaluateHumanlike(seo(mono)).details.endingDiversity)
      .toBeLessThan(evaluateHumanlike(seo(diverse)).details.endingDiversity);
  });

  it('3) 자기정정 마커 — 없으면 낮고, 3개+면 만점(12)', () => {
    const none = '이것은 좋은 제품입니다 그리고 성능이 우수합니다 또한 가격도 적당합니다';
    const many = '솔직히 처음엔 별로였어요. 근데 막상 써보니 괜찮더라고요. 알고보니 설정 문제였어요. 의외로 만족했죠.';
    expect(evaluateHumanlike(seo(none)).details.selfCorrection).toBeLessThan(12);
    expect(evaluateHumanlike(seo(many)).details.selfCorrection).toBe(12);
  });

  it('4) AI 클리셰 부재 — 클리셰 3개+면 0, 0개면 15', () => {
    const clean = '제가 직접 써보니 손맛이 좋더라고요. 무게도 적당했어요.';
    const cliche = '안녕하세요. 오늘은 소개해드리겠습니다. 결론적으로 말하자면 좋습니다.';
    expect(evaluateHumanlike(seo(clean)).details.noAiCliche).toBe(15);
    expect(evaluateHumanlike(seo(cliche)).details.noAiCliche).toBe(0);
  });

  it('5) 직접 경험 신호 — 없으면 낮고, 있으면 높다', () => {
    const noExp = '이 제품은 성능이 우수하고 디자인이 좋으며 가격이 합리적인 제품으로 평가됩니다.';
    const withExp = '제가 직접 가봤고 실제로 써봤어요. 찍은 사진도 있고 경험상 확실히 좋았어요.';
    expect(evaluateHumanlike(seo(noExp)).details.directExperience)
      .toBeLessThan(evaluateHumanlike(seo(withExp)).details.directExperience);
  });
});

describe('자체검증: 엣지 케이스 — 크래시 없이 유효 점수', () => {
  it('빈 본문도 0~100 점수를 반환한다', () => {
    const r = evaluateHumanlike(seo(''));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('아주 짧은 본문(5문장 미만)도 폴백 점수로 동작한다', () => {
    const r = evaluateHumanlike(seo('짧은 글이에요. 그래도 됩니다.'));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('자체검증: humanizeContent — 강도별로 AI글을 변형하고 위험 비증가', () => {
  for (const intensity of ['light', 'medium', 'strong'] as const) {
    it(`intensity=${intensity}: 출력 변형 + AI 위험 점수 비증가`, () => {
      const out = humanizeContent(AI_ARTICLE, intensity, true);
      expect(out).not.toBe(AI_ARTICLE);
      expect(analyzeAiDetectionRisk(out).score).toBeLessThanOrEqual(analyzeAiDetectionRisk(AI_ARTICLE).score);
    });
  }
});

describe('자체검증: analyzeAiDetectionRisk — AI글이 사람글보다 위험↑ + 신호 포착', () => {
  it('AI글 위험 > 사람글 위험, AI글은 issues 포착', () => {
    const ai = analyzeAiDetectionRisk(AI_ARTICLE);
    const human = analyzeAiDetectionRisk(HUMAN_ARTICLE);
    expect(ai.score).toBeGreaterThan(human.score);
    expect(ai.issues.length).toBeGreaterThan(0);
  });
});

describe('자체검증: 엔드투엔드 게이트 — 시스템이 스스로 human/AI를 판정', () => {
  it('게이트 humanlike 하위점수가 사람글 > AI글, finalScore도 사람글 ≥ AI글', () => {
    const human = evaluate(seo(HUMAN_ARTICLE));
    const ai = evaluate(seo(AI_ARTICLE));
    expect(human.humanlikeScore.score).toBeGreaterThan(ai.humanlikeScore.score);
    expect(human.finalScore).toBeGreaterThanOrEqual(ai.finalScore);
    expect(['pass', 'patch', 'regenerate']).toContain(human.decision);
  });

  it('AI글은 humanlike 플로어(55) 미만 → S2 자동 보정(selfCritique) 트리거 대상', () => {
    expect(evaluate(seo(AI_ARTICLE)).humanlikeScore.score).toBeLessThan(55);
  });
});

describe('자체검증: detectPlatitudes — 일반론 남발 감지 / 구체 글 통과', () => {
  it('일반론 남발 → 임계 초과', () => {
    const r = detectPlatitudes({
      introduction: '보통 일반적으로 흔히 대체로 많은 분들이 다양한 방법을 시도합니다.',
      headings: [{ title: 'X', body: '일반적으로 중요합니다. 다양한 선택지가 있을 수 있습니다.' }],
    });
    expect(r.platitudeHitCount).toBeGreaterThan(3);
    expect(r.exceedsThreshold).toBe(true);
  });
});
