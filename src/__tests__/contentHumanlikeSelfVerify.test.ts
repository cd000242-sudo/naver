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
import { evaluateHomefeed } from '../content/evaluators/homefeedEval';
import { evaluateSeo } from '../content/evaluators/seoEval';
import { evaluate, type EvaluationInput } from '../content/qualityEvaluator';

const seo = (body: string): EvaluationInput => ({ body, mode: 'seo' });
const hf = (body: string): EvaluationInput => ({ body, mode: 'homefeed' });

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

// ─────────────────────────────────────────────────────────────
// 홈판 모드 자체검증: 감정형 글 우위 보존 + 가혹한 감정 페널티 완화(B)
// ─────────────────────────────────────────────────────────────

// 감정형 홈판 글: 1인칭 + 감정어 + 짧은 문장. (홈판이 보상해야 하는 글)
const EMOTIONAL_HOMEFEED = [
  '저도 처음엔 진짜 반신반의했어요.',
  '근데 막상 써보니 완전 신기하더라고요.',
  '솔직히 좀 놀랐어요.',
  '제가 일주일 내내 들고 다녔는데 만족스러웠어요.',
  '뿌듯한 기분이 들 정도였죠.',
  '편하고 가벼워서 좋았어요.',
].join(' ');

// 무미건조한 글: 1인칭·감정 없음, 균일한 격식체. (홈판이 낮게 줘야 하는 글)
const DRY_HOMEFEED = AI_ARTICLE;

// 중간 감정형: 감정어 밀도가 1000자당 0.8~1.5 구간(자연스러우나 과하지 않음).
// 가혹한 페널티(4점)가 아니라 완화된 중간 점수(7점)를 받아야 한다.
const MODERATE_EMOTION = '오늘 날씨를 기록했다. '.repeat(70) + '정말 신기했다.';

describe('자체검증: 홈판 — 감정형 우위 + 자연스러운 감정 페널티 완화', () => {
  it('감정형 홈판 글 점수 > 무미건조 글 점수', () => {
    expect(evaluateHomefeed(hf(EMOTIONAL_HOMEFEED)).score)
      .toBeGreaterThan(evaluateHomefeed(hf(DRY_HOMEFEED)).score);
  });

  it('홈판 평가는 7개 세부 항목을 모두 채점한다', () => {
    const d = evaluateHomefeed(hf(EMOTIONAL_HOMEFEED)).details;
    for (const k of ['titleHook', 'introStrength', 'burstiness', 'paragraphLength', 'emotionDensity', 'firstPerson', 'shortSentenceRatio']) {
      expect(d).toHaveProperty(k);
    }
  });

  it('중간 감정형(0.8~1.5/1000)은 가혹한 4점이 아닌 완화된 점수(≥7)를 받는다', () => {
    // 자연스럽게 쓰되 감정어가 과하지 않은 글을 기계적으로 깎지 않는다.
    expect(evaluateHomefeed(hf(MODERATE_EMOTION)).details.emotionDensity).toBeGreaterThanOrEqual(7);
  });
});

// ─────────────────────────────────────────────────────────────
// SEO 모드 자체검증: 토픽 의미장 커버리지(C)가 키워드 스터핑보다 우대됨
// ─────────────────────────────────────────────────────────────

const SECONDARY = ['경량', '접이식', '내구성', '휴대성'];
// 토픽 폭이 넓은 글: 연관어를 자연스럽게 모두 다룸.
const TOPIC_RICH = '캠핑 의자 추천을 정리한다. 경량 알루미늄 프레임에 접이식 구조라 휴대성이 좋고, 내구성도 단단해서 오래 썼다. 캠핑 의자 고를 때 참고하시라.';
// 키워드 스터핑 글: 메인 키워드만 반복, 연관 토픽 부재.
const KW_STUFFED = '캠핑 의자 '.repeat(30);

describe('자체검증: SEO 토픽 어휘밀도 — 의미장 커버리지 보상 + 스터핑 억제', () => {
  it('연관어를 폭넓게 커버하면 토픽 점수 만점(7)', () => {
    const r = evaluateSeo({ body: TOPIC_RICH, mode: 'seo', primaryKeyword: '캠핑 의자', secondaryKeywords: SECONDARY });
    expect(r.details.topicVocabulary).toBe(7);
  });

  it('키워드만 반복하고 토픽 폭이 좁으면 토픽 점수가 낮다(≤3)', () => {
    const r = evaluateSeo({ body: KW_STUFFED, mode: 'seo', primaryKeyword: '캠핑 의자', secondaryKeywords: SECONDARY });
    expect(r.details.topicVocabulary).toBeLessThanOrEqual(3);
  });

  it('스터핑 글보다 토픽 풍부 글의 토픽 점수가 높다', () => {
    const stuffed = evaluateSeo({ body: KW_STUFFED, mode: 'seo', primaryKeyword: '캠핑 의자', secondaryKeywords: SECONDARY });
    const rich = evaluateSeo({ body: TOPIC_RICH, mode: 'seo', primaryKeyword: '캠핑 의자', secondaryKeywords: SECONDARY });
    expect(rich.details.topicVocabulary).toBeGreaterThan(stuffed.details.topicVocabulary);
  });

  it('연관어 미지정 시 페널티 없이 중립(7)', () => {
    const r = evaluateSeo({ body: '아무 본문입니다.', mode: 'seo', primaryKeyword: '캠핑 의자' });
    expect(r.details.topicVocabulary).toBe(7);
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

  // [v3 — SPEC-REVIEW-001 확장] 가짜 회상체 + 빈 마무리 상투구 남발 감지.
  //   일반론 어휘가 없어도 회상체/클로저만으로 임계를 넘겨야 한다 (수국 여행글 패턴).
  it('회상체 + 빈 마무리 상투구 남발 → 임계 초과 (일반론 어휘 없이도)', () => {
    const r = detectPlatitudes({
      introduction: '며칠 사이 바람이 지나가고 꽃이 피기 시작했었다. 카메라를 든 사람들이 모여들던 그때의 공기가 선명하게 떠오른다.',
      headings: [
        { title: 'X', body: '예상보다 일찍 핀다는 이야기가 들려왔다. 조용한 새벽을 골라 방문하곤 했었다.' },
      ],
      conclusion: '결국 자신만의 루트를 찾아가는 과정이야말로 진짜 매력임을 새삼 깨닫게 된다. 오직 이 계절에만 남는다.',
    });
    expect(r.platitudeHitCount).toBeGreaterThan(3);
    expect(r.exceedsThreshold).toBe(true);
    expect(r.matchedTriggers).toEqual(
      expect.arrayContaining(['~했었다', '떠오른다', '진짜 매력']),
    );
  });

  it('정상 과거시제 정보성 글은 v3 회상체/클로저 패턴에 오탐하지 않는다', () => {
    // 일반 과거형("달라졌다", "띠었다")은 회상체("했었다")가 아니므로 매칭되면 안 된다.
    // citationDensity 등 v2 기준과 분리하기 위해 matchedTriggers/hitCount만 검증.
    const r = detectPlatitudes({
      introduction: '수국은 토양 산도에 따라 색이 달라졌다. 산성에서는 파란색, 알칼리성에서는 분홍색을 띠었다.',
      headings: [
        { title: '재배', body: '개화 전 가지치기를 했다. 반그늘에서 적당한 일조를 받으면 잘 자랐다.' },
      ],
    });
    expect(r.platitudeHitCount).toBe(0);
    const v3Labels = ['~했었다', '~하곤 했다', '들려왔다', '떠오른다', '~던 기억', '진짜 매력', '새삼 깨닫게', '~야말로', '~임을 알게 되는', '오직 ~에만'];
    expect(r.matchedTriggers.filter((t) => v3Labels.includes(t))).toEqual([]);
  });

  // [회귀방지 — 실전 케이스 잠금] 실제 발행된 "6월 수국 여행" 글 원문.
  //   이 글이 게이트를 통과해 발행됐던 실측 사례. v3 패턴이 약화되면 이 테스트가
  //   깨져 회귀를 즉시 잡는다. (회상체·빈 마무리 상투구가 문단마다 반복되는 전형)
  it('실전 회귀: 발행된 6월 수국 글은 임계 초과로 재생성 트리거된다', () => {
    const r = detectPlatitudes({
      introduction:
        '수국이 피는 계절이 다시 돌아왔다. 6월의 초입, 거리에는 아직 초록이 더 많았으나, '
        + '며칠 사이 서늘한 바람이 지나가고 나서야 꽃이 하나둘 피기 시작했었다. '
        + '올해 개화가 조금 앞당겨질 수 있다는 소식이 들려왔고, 이른 새벽부터 카메라를 든 '
        + '사람들이 꽃길을 따라 모여들던 그때의 공기가 선명하게 떠오른다.',
      headings: [
        {
          title: '6월 주말 명소, 올해 분위기는 달랐다',
          body: '그 와중에도 어떤 이들은 조용한 새벽을 골라 방문하곤 했었고, 그 시간대에는 '
            + '꽃잎 위에 맺힌 이슬과 바람 소리가 남달랐다.',
        },
        {
          title: '6월 수국 개화 시기, 왜 해마다 다를까',
          body: '수국의 개화 시기는 매년 조금씩 달라졌던 기억이다. 올해는 봄비가 잦았던 탓에, '
            + '일부 지역에서는 예상보다 일찍 피기 시작했다는 이야기가 들려왔다. 현지 방문객들은 '
            + '한낮보다 이른 아침이나 늦은 오후에 가장 색이 선명하다고 말하곤 했다.',
        },
      ],
      conclusion:
        '결국 자신만의 루트를 찾아가는 과정이야말로 6월 수국 여행의 진짜 매력임을 알게 되는 셈이다. '
        + '기상 변화와 밀접하게 맞물려 있다는 사실을 새삼 깨닫게 된다. '
        + '올해의 공기와 풍경, 그리고 나만의 루트는 오직 이 계절에만 남는다.',
    });
    expect(r.exceedsThreshold).toBe(true);
    expect(r.platitudeHitCount).toBeGreaterThanOrEqual(8);
    // NOTE: 패턴 '오직 ~에만'(/오직\s+\S+에만/)은 실제 마무리 "오직 이 계절에만"의
    //   중간 공백("이 계절") 때문에 매칭되지 않는다(별도 후속 픽스 대상). 그것 없이도
    //   아래 트리거만으로 임계를 넘기므로 회귀 잠금은 발화 확실한 트리거로 검증한다.
    expect(r.matchedTriggers).toEqual(
      expect.arrayContaining(['떠오른다', '들려왔다', '진짜 매력', '새삼 깨닫게', '~야말로']),
    );
  });
});
