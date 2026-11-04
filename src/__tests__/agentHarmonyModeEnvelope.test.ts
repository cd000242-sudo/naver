import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { selectAgentTaskPrompt, wrapAsHarmonyTask } from '../agentCli/agentHarmonyEnvelope';
import { getAgenticModeFocus, wrapAsAgenticTask } from '../agentCli/agenticEnvelope';
import { HARMONY_MODES } from '../content/agentHarmony/harmonyModes';
import { COMPLEMENT_KINDS, COMPLEMENT_RULES, EFFECT_PROMISE_PATTERN } from '../content/agentHarmony/harmonyPacketTypes';
import { DAILY_TITLE_EVIDENCE_SUBMISSION, DAILY_TITLE_POLICY } from '../main/services/dailyPublishingTitleReview';
import { titleCandidateKeys } from '../main/services/dailyPublishingTitleReviewContract';
import { DAILY_EDITORIAL_MARKER } from '../contentRequestSections';
import { resolveTitleLengthRange } from '../content/titleLengthPolicy';
import { resolveHeadingCountRange } from '../content/headingCountPolicy';

/**
 * 2026-11-04: wrapAsHarmonyTask is mode-aware. The common harmony contract is shared by every text mode; seo and
 * affiliate add their own criteria; the other modes use only what wrapAsAgenticTask already says about them (nothing).
 */
const BASE = '[작업 명세 본문]\n주제: 테스트\n"따옴표"와 {중괄호} $특수 `백틱` 그대로.\n\n끝.';
type Mode = (typeof HARMONY_MODES)[number];
const envelopeOf = (mode: Mode) => {
  const wrapped = wrapAsHarmonyTask(BASE, { mode });
  return { wrapped, envelope: wrapped.slice(0, wrapped.length - BASE.length) };
};
const NON_HOMEFEED = HARMONY_MODES.filter(mode => mode !== 'homefeed');
const inOrder = (text: string, keys: string[]) => {
  const positions = keys.map(key => text.indexOf(key));
  return positions.every(position => position >= 0) && [...positions].sort((a, b) => a - b).join() === positions.join();
};

describe('common harmony contract in every non-homefeed mode', () => {
  for (const mode of NON_HOMEFEED) {
    describe(mode, () => {
      const { wrapped, envelope } = envelopeOf(mode);

      it('keeps the base prompt verbatim and last, exactly once', () => {
        expect(wrapped.endsWith(BASE)).toBe(true);
        expect(wrapped.split(BASE)).toHaveLength(2);
        expect(wrapAsHarmonyTask('  ', { mode })).toBe('  ');
      });

      it('has the 8 steps in order and the observation-free fallback', () => {
        expect(inOrder(envelope, ['1. 자료 분석', '2. 독자', '3. 제목 후보', '4. 비교·선정', '5. 본문 작성', '6. 자기비평', '7. 지시 점검', '8. 수정·제출'])).toBe(true);
        for (const phrase of ['관측 자료 없음', '3~7단계', 'sourceAnchors', 'bodyAnchors', '점수·등급·퍼센트로 매기지 않는다', '믿지 않는 검수자']) expect(envelope).toContain(phrase);
      });

      it('compares title candidates by its own criteria block and the verbatim anchor-evidence rules, not the homefeed title policy', () => {
        expect(envelope).toContain('[제목 비교 기준');
        expect(envelope).not.toContain('[독립 제목 검수 기준');
        expect(envelope).toContain(DAILY_TITLE_EVIDENCE_SUBMISSION);
        expect(envelope).not.toContain(DAILY_TITLE_POLICY);
        expect(envelope).toContain('[확정 제목]');
        expect(envelope).toContain('신뢰하지 않는 데이터');
      });

      it('has the priority ladder with this mode\'s user-instruction rung and no homefeed-only text', () => {
        expect(inOrder(envelope, ['① 사실 근거', '② 법적 안전', '③ 사용자가 직접 쓴 지시', '④ 제목 약속의 본문 보상', '⑤ 앱 형식 계약', '⑥ 문체·장치 권장', '⑦ 노출 관측'])).toBe(true);
        expect(envelope).toContain('[사용자 추가 지시사항]');
        for (const homefeedOnly of [DAILY_EDITORIAL_MARKER, '8~20%', '10~36%', 'AUC 0.46', '4:1', '[측정 메모']) expect(envelope).not.toContain(homefeedOnly);
        expect(envelope).toContain('무색무취');
      });

      it('records the payoff sentence but gives the model no position window', () => {
        expect(envelope).toContain('answerSentence');
        expect(envelope).not.toMatch(/\d+~\d+%/);
      });

      it('takes title width and heading count from the mode\'s own policy', () => {
        const title = resolveTitleLengthRange(mode), headings = resolveHeadingCountRange(mode);
        expect(envelope).toContain(`${title.min}~${title.max}`);
        expect(envelope).toContain(`${headings.min}~${headings.max}개`);
        for (const phrase of ['8~100자', '줄바꿈', '지어내지', '내부 표지']) expect(envelope).toContain(phrase);
      });

      it('asks for the same two JSON fields with the 8 candidate keys, kinds and rules; no score field, no effect promise', () => {
        expect(envelope).toContain('"harmonyPacket"');
        expect(envelope).toContain('"complementReport"');
        for (const key of titleCandidateKeys) expect(envelope).toContain(`"${key}"`);
        expect(envelope).toContain(COMPLEMENT_KINDS.join('|'));
        expect(envelope).toContain(COMPLEMENT_RULES.join('|'));
        for (const phrase of ['마지막 메시지는 오직', 'JSON 객체 하나', '마크다운 코드펜스', '한 글자라도', '한 글자도 바꾸지 않고', '기존 JSON 필드는 하나도 빼지']) expect(envelope).toContain(phrase);
        expect(envelope).not.toMatch(/"(score|rating|grade|점수|등급)"/i);
        expect(EFFECT_PROMISE_PATTERN.test(envelope)).toBe(false);
      });

      it('goes through selectAgentTaskPrompt and stays out of raw / complete-prompt calls', () => {
        expect(selectAgentTaskPrompt(BASE, { mode, harmony: { mode } })).toBe(wrapped);
        expect(selectAgentTaskPrompt(BASE, { mode, raw: true, harmony: { mode } })).toBe(BASE);
        expect(selectAgentTaskPrompt(BASE, { mode, agenticEnvelope: false, harmony: { mode } })).toBe(BASE);
      });
    });
  }
});

describe('seo criteria', () => {
  const { envelope } = envelopeOf('seo');
  it('answers the search intent first and compares titles on it', () => {
    for (const phrase of ['검색 의도', '검색 의도에 직접 답하는가', '도입부 첫 화면']) expect(envelope).toContain(phrase);
  });
  it('places the keyword where a reader expects it, without stuffing, and keeps headings answer-first', () => {
    for (const phrase of ['[SEO 조화 기준', '제목 앞부분', '첫 소제목', '스터핑', '횟수·밀도를 맞추려', '그 아래 첫 문장이 곧 답']) expect(envelope).toContain(phrase);
  });
  it('reuses the existing wrapAsAgenticTask seo focus verbatim and does not retype it', () => {
    const focus = getAgenticModeFocus('seo');
    expect(focus).toBeTruthy();
    expect(envelope).toContain('[이 모드에서 끌어올릴 것]');
    expect(envelope).toContain(focus!);
    expect(wrapAsAgenticTask('x', 'seo')).toContain(focus!);
    for (const file of ['agentHarmonyEnvelope.ts', 'agentHarmonyCriteria.ts', 'agentHarmonyModeCriteria.ts']) {
      const source = readFileSync(new URL(`../agentCli/${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toContain('서로 다른 질의 축');
      expect(source, file).not.toContain('구매를 망설이는 이유를 짚고');
    }
  });
  it('has no shopping text', () => {
    expect(envelope).not.toContain('AFFILIATE AUTHENTICITY CONTRACT');
    expect(envelope).not.toContain('[쇼핑 조화 기준');
  });
});

describe('affiliate (shopping) criteria', () => {
  const { envelope } = envelopeOf('affiliate');
  it('reuses the existing affiliate focus verbatim', () => {
    const focus = getAgenticModeFocus('affiliate');
    expect(focus).toBeTruthy();
    expect(envelope).toContain(focus!);
    expect(getAgenticModeFocus('shopping')).toBe(focus);
  });
  it('limits product facts to the collected material and forbids invented purchase / experience', () => {
    for (const phrase of ['[쇼핑 조화 기준', '수집된 자료에 있는 것만', '자료에 없는 기능·수치·인증·인기·할인·재고', '내돈내산', '가족 반응', '단점이나 맞지 않는 사용 조건']) expect(envelope).toContain(phrase);
  });
  it('points at the existing speaker rules instead of rewriting them, and lets that contract win', () => {
    expect(envelope).toContain('AFFILIATE AUTHENTICITY CONTRACT');
    expect(envelope).toContain('이 봉투는 그 규칙을 바꾸지 않으며');
    expect(envelope).toContain('그 계약이 이긴다');
    expect(envelope).toContain('FIRST_PARTY');
    // Lines that would contradict the AI-experience opt-in speaker rules must not be generic here.
    for (const generic of ['작성자 경험은 사용자 메모가 있을 때만', '문서 화자 말투', '직접 인용으로 최소 1개']) expect(envelope).not.toContain(generic);
  });
  it('keeps the disclosure and CTA ownership of the affiliate base prompt', () => {
    expect(envelope).toContain('공정위');
    expect(envelope).toContain('CTA');
  });
  it('compares titles on the buyer\'s hesitation and strips store tags / option combos like the app does', () => {
    for (const phrase of ['가장 망설이는', '스토어 꼬리표', '옵션 조합']) expect(envelope).toContain(phrase);
  });
});

describe('modes without their own criteria (business, mate, custom, traffic-hunter)', () => {
  for (const mode of ['business', 'mate', 'custom', 'traffic-hunter'] as const) {
    it(`${mode}: no mode block, because wrapAsAgenticTask has none for it either`, () => {
      const { envelope } = envelopeOf(mode);
      expect(getAgenticModeFocus(mode)).toBeUndefined();
      expect(envelope).not.toContain('[이 모드에서 끌어올릴 것]');
      expect(envelope).not.toContain('[SEO 조화 기준');
      expect(envelope).not.toContain('[쇼핑 조화 기준');
      expect(envelope).not.toContain('AFFILIATE AUTHENTICITY CONTRACT');
      expect(envelope).toContain('독자 질문에 직접 답하는가');
    });
  }
});

describe('flag OFF stays byte-identical', () => {
  // sha256 prefixes of wrapAsAgenticTask('[작업 명세 본문]\n주제: 테스트', mode), captured before this change.
  const PIN: Record<string, string> = {
    undefined: '5ea3dc1b8ea364f9', homefeed: 'f22bb26ce6f4b40c', seo: '50f55a054a08bac3', affiliate: 'f32e9237d739cca3', shopping: 'f32e9237d739cca3',
    photo: '3ff083f7f4cf7241', 'image-narrative': '3ff083f7f4cf7241', business: '5ea3dc1b8ea364f9', mate: '5ea3dc1b8ea364f9', custom: '5ea3dc1b8ea364f9', 'traffic-hunter': '5ea3dc1b8ea364f9',
  };
  const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

  it('wrapAsAgenticTask output did not change for any mode', () => {
    for (const [key, expected] of Object.entries(PIN)) {
      expect(hash(wrapAsAgenticTask('[작업 명세 본문]\n주제: 테스트', key === 'undefined' ? undefined : key)), key).toBe(expected);
    }
  });

  it('without a harmony context selectAgentTaskPrompt is exactly wrapAsAgenticTask for every mode', () => {
    for (const mode of [...HARMONY_MODES, 'photo', 'image-narrative', undefined]) {
      expect(selectAgentTaskPrompt(BASE, { mode }), String(mode)).toBe(wrapAsAgenticTask(BASE, mode));
    }
  });
});
