/**
 * contentHumanizationGuard.test.ts
 *
 * 회귀방지 net — "사람보다 사람처럼" 파이프라인 특성화 테스트.
 *
 * 핵심 휴머나이제이션/AI탐지 함수(aiHumanizer·contentPlatitudeDetector·humanlikeEval)는
 * 그동안 전용 테스트가 없어, 사람다움을 약화시키는 변경(예: 인간표현 주입률 완화)이
 * 일어나도 자동으로 잡히지 않았다. 이 테스트는 현재의 "사람다움 분별력"을 핀으로 고정해
 * 이후 변경이 사람다움을 약화시키면 실패하도록 한다. (절대값이 아닌 상대/구조 보장)
 */
import { describe, it, expect } from 'vitest';
import { humanizeContent, analyzeAiDetectionRisk } from '../aiHumanizer';
import { detectPlatitudes } from '../contentPlatitudeDetector';
import { evaluateHumanlike } from '../content/evaluators/humanlikeEval';
import { getSecondaryKeywordsFromSource } from '../contentKeywordHelpers';

// AI스러운 글: 모든 문장 '~니다' 종결, AI 특유 표현 4개+, 개인표현 없음, 균일한 길이.
const AI_LIKE = [
  '인공지능 기술은 매우 빠르게 발전하고 있습니다.',
  '다음과 같습니다.',
  '이 기술의 핵심은 대량의 데이터를 효율적으로 처리하는 것입니다.',
  '요약하자면 현대 사회에서 매우 중요한 기술이라고 할 수 있습니다.',
  '중요한 점은 올바른 활용 방법을 정확하게 이해하는 것입니다.',
  '많은 기업들이 이러한 기술을 적극적으로 도입하고 있습니다.',
  '결론적으로 미래의 핵심 기술로 자리잡을 것으로 예상됩니다.',
  '이러한 기술은 앞으로도 계속해서 성장할 것으로 보입니다.',
  '우리는 이러한 거대한 변화에 능동적으로 적응해야 합니다.',
  '앞으로 더욱 많은 분야에서 폭넓게 활용될 것으로 전망됩니다.',
  '따라서 지속적인 관심과 학습이 반드시 필요한 상황입니다.',
].join(' ');

// 사람스러운 글: 종결어미/길이 다양, 개인 경험 표현, AI 특유 표현 없음.
const HUMAN_LIKE = [
  '솔직히 말하면 나도 처음엔 반신반의했어요.',
  '근데 직접 해보니까 생각이 확 바뀌더라고요.',
  '제 경험상 이건 진짜 물건이에요.',
  '한 번은 새벽에 급하게 써야 했는데, 딱 3분 만에 끝났죠.',
  '어이가 없을 정도로 빨랐어요.',
  '알고 보니 설정 하나만 바꾸면 되는 거였더라고요.',
  '찾아보니까 의외로 다들 이걸 모르고 있었어요.',
  '그래서 까먹기 전에 정리해봤어요.',
  '별거 아닌 것 같아도 알면 진짜 편해요.',
].join(' ');

describe('회귀방지 net: 사람다움/AI탐지 분별력', () => {
  describe('analyzeAiDetectionRisk', () => {
    it('AI스러운 글이 사람스러운 글보다 AI 탐지 위험 점수가 높다', () => {
      const ai = analyzeAiDetectionRisk(AI_LIKE);
      const human = analyzeAiDetectionRisk(HUMAN_LIKE);
      expect(ai.score).toBeGreaterThan(human.score);
      // AI 글은 최소 한 가지 이상 위험 신호를 잡아내야 한다.
      expect(ai.issues.length).toBeGreaterThan(0);
    });
  });

  describe('humanizeContent (strong)', () => {
    it('AI스러운 글을 실제로 변형한다(무수정 회귀 방지)', () => {
      const out = humanizeContent(AI_LIKE, 'strong', true);
      expect(out).not.toBe(AI_LIKE);
    });

    it('휴머나이즈 후 AI 탐지 위험이 증가하지 않는다', () => {
      const before = analyzeAiDetectionRisk(AI_LIKE).score;
      const after = analyzeAiDetectionRisk(humanizeContent(AI_LIKE, 'strong', true)).score;
      expect(after).toBeLessThanOrEqual(before);
    });

    it('강한 휴머나이즈도 거든요/잖아요류 말끝을 과다 삽입하지 않는다', () => {
      const out = humanizeContent(AI_LIKE, 'strong', true, 'community_fan');
      const crutchCount = (out.match(/거든요|잖아요|더라고요/g) ?? []).length;
      expect(crutchCount).toBeLessThanOrEqual(2);
    });
  });

  describe('detectPlatitudes', () => {
    it('일반론 남발 글을 임계 초과로 감지한다', () => {
      const result = detectPlatitudes({
        introduction:
          '보통 이런 경우에는 일반적으로 다양한 방법이 있습니다. 흔히 대체로 많은 분들이 여러 가지 방법을 시도합니다.',
        headings: [
          { title: '방법', body: '일반적으로 중요합니다. 다양한 선택지가 있을 수 있습니다.' },
        ],
      });
      expect(result.platitudeHitCount).toBeGreaterThan(3); // MAX_PLATITUDE_HITS
      expect(result.matchedTriggers.length).toBeGreaterThan(0);
      expect(result.exceedsThreshold).toBe(true);
    });
  });

  describe('evaluateHumanlike', () => {
    it('사람스러운 본문이 AI스러운 본문보다 사람다움 점수가 높다', () => {
      const human = evaluateHumanlike({ body: HUMAN_LIKE, mode: 'seo' });
      const ai = evaluateHumanlike({ body: AI_LIKE, mode: 'seo' });
      expect(human.score).toBeGreaterThan(ai.score);
    });

    it('입말 장식만 반복하는 글은 사람다움 점수에서 감점한다', () => {
      const overfit = [
        '와, 이건 진짜 놀랍거든요. 다들 그러잖아요. 이거 아는 사람 있죠?',
        '진짜 이 부분이 중요하거든요. 완전 의외더라고요. 찐으로 봐야 하거든요.',
        '솔직히 말해서 진짜 다시 보게 되잖아요. 여기서 봐야 할 건 이거거든요.',
        '헉, 또 진짜 포인트가 나오더라고요. 왜 아무도 말 안 해줬죠.',
      ].join(' ');
      const grounded = [
        '처음엔 단순한 가족 근황처럼 보였어요.',
        '그런데 오디션장에서 이름을 다르게 썼다는 대목이 나오면서 이야기가 달라졌습니다.',
        '부모 이름이 먼저 보이면 연기보다 배경이 먼저 읽힐 수 있죠.',
        '그래서 이 사안의 핵심은 화제성이 아니라, 먼저 평가받고 싶었던 선택에 가깝습니다.',
        '다만 법적 개명인지 활동명인지는 별도 확인이 필요해요.',
      ].join(' ');

      const overfitScore = evaluateHumanlike({ body: overfit, mode: 'homefeed' });
      const groundedScore = evaluateHumanlike({ body: grounded, mode: 'homefeed' });

      expect(overfitScore.details.conversationalCrutchPenalty).toBeLessThan(0);
      expect(overfitScore.score).toBeLessThan(groundedScore.score);
    });
  });

  // 토픽 의미장(seoEval #8) wiring 보장 — source.metadata.keywords[1..]가 연관어로 추출되어야
  // 품질게이트의 토픽 커버리지 평가가 실제로 활성화된다.
  describe('getSecondaryKeywordsFromSource', () => {
    it('keywords[1..]를 연관어로 추출한다', () => {
      const s = { metadata: { keywords: ['캠핑 의자', '경량', '접이식', '내구성'] } } as any;
      expect(getSecondaryKeywordsFromSource(s)).toEqual(['경량', '접이식', '내구성']);
    });

    it('primary 키워드 하나뿐이면 빈 배열', () => {
      expect(getSecondaryKeywordsFromSource({ metadata: { keywords: ['캠핑 의자'] } } as any)).toEqual([]);
    });

    it('keywords 부재/비배열이면 빈 배열(크래시 없음)', () => {
      expect(getSecondaryKeywordsFromSource({ metadata: {} } as any)).toEqual([]);
      expect(getSecondaryKeywordsFromSource({} as any)).toEqual([]);
    });

    it('공백 항목은 제거하고 trim한다', () => {
      const s = { metadata: { keywords: ['주', '  접이식  ', '', '   '] } } as any;
      expect(getSecondaryKeywordsFromSource(s)).toEqual(['접이식']);
    });

    it('본문 프롬프트와 동일 필터 — 1글자·순수숫자 연관어는 제외(생성↔평가 정합)', () => {
      const s = { metadata: { keywords: ['캠핑 의자', '경량', 'A', '2026', '접이식'] } } as any;
      // 'A'(1글자)·'2026'(순수숫자)는 본문 프롬프트가 주입하지 않으므로 #8 채점에서도 제외.
      expect(getSecondaryKeywordsFromSource(s)).toEqual(['경량', '접이식']);
    });
  });
});

// 2026-06-12 S18-3: markdown table rows must survive humanization — sentence
// joining / ending transforms would shred "| a | b |" rows into prose.
describe('humanizer table shield (S18-3)', () => {
  it('keeps markdown table rows byte-identical through strong humanization', async () => {
    const { humanizeContent } = await import('../aiHumanizer');
    const table = ['| 항목 | 정리 |', '| --- | --- |', '| 지급 조건 | 압류방지통장 등록이 먼저입니다 |'].join('\n');
    const content = ['주거급여 지급 조건을 확인했습니다. 계좌가 먼저입니다.', '', table, '', '이 표만 저장해두면 다시 보기 편합니다. 추가 서류도 같이 확인합니다.'].join('\n');
    const out = humanizeContent(content, 'strong', true);
    expect(out).toContain('| 항목 | 정리 |');
    expect(out).toContain('| --- | --- |');
    expect(out).toContain('| 지급 조건 | 압류방지통장 등록이 먼저입니다 |');
  });
});
