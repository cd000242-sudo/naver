import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { selectAgentTaskPrompt, wrapAsHarmonyTask } from '../agentCli/agentHarmonyEnvelope';
import { wrapAsAgenticTask } from '../agentCli/agenticEnvelope';
import { DAILY_TITLE_EVIDENCE_SUBMISSION, DAILY_TITLE_POLICY } from '../main/services/dailyPublishingTitleReview';
import { titleCandidateKeys } from '../main/services/dailyPublishingTitleReviewContract';
import { DAILY_EDITORIAL_MARKER } from '../contentRequestSections';
import { resolveTitleLengthRange } from '../content/titleLengthPolicy';
import { resolveHeadingCountRange } from '../content/headingCountPolicy';
import { COMPLEMENT_KINDS, COMPLEMENT_RULES, EFFECT_PROMISE_PATTERN } from '../content/agentHarmony/harmonyPacketTypes';

const BASE = '[작업 명세 본문]\n주제: 테스트\n"따옴표"와 {중괄호} $특수 `백틱` 그대로.\n\n끝.';
const wrapped = wrapAsHarmonyTask(BASE, { mode: 'homefeed' });
const envelope = wrapped.slice(0, wrapped.length - BASE.length);

describe('wrapAsHarmonyTask', () => {
  it('keeps the base prompt verbatim at the end of the wrapped prompt', () => {
    expect(wrapped.endsWith(BASE)).toBe(true);
    expect(wrapped.split(BASE)).toHaveLength(2);
  });

  it('returns an empty / blank prompt unchanged', () => {
    expect(wrapAsHarmonyTask('', { mode: 'homefeed' })).toBe('');
    expect(wrapAsHarmonyTask('   ', { mode: 'homefeed' })).toBe('   ');
  });

  it('contains the 8 internal steps in order', () => {
    const keys = ['1. 자료 분석', '2. 독자·노출 전략', '3. 제목 후보', '4. 비교·선정', '5. 본문 작성', '6. 자기비평', '7. 지시 점검', '8. 수정·제출'];
    const positions = keys.map(key => envelope.indexOf(key));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(envelope).toContain('관측 자료 없음');
    expect(envelope).toContain('8~20%');
    expect(envelope).toContain('10~36%');
    expect(envelope).toContain('3~7단계');
  });

  it('contains the priority ladder in order, with the editorial marker and the bans-vs-encouragements note', () => {
    const rungs = ['① 사실 근거', '② 법적 안전', '③ 사용자가 직접 쓴 지시', '④ 제목 약속의 본문 보상', '⑤ 앱 형식 계약', '⑥ 문체·장치 권장', '⑦ 노출 관측'];
    const positions = rungs.map(rung => envelope.indexOf(rung));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(envelope).toContain(DAILY_EDITORIAL_MARKER);
    expect(envelope).toContain('4:1');
    expect(envelope).toContain('무색무취');
  });

  it('keeps the pure-JSON final message rule', () => {
    expect(envelope).toContain('마지막 메시지는 오직');
    expect(envelope).toContain('JSON 객체 하나');
    expect(envelope).toContain('마크다운 코드펜스');
    expect(envelope).toContain('한 글자라도');
  });

  it('injects the independent title-review criteria verbatim from the imported originals', () => {
    expect(envelope).toContain(DAILY_TITLE_POLICY);
    expect(envelope).toContain(DAILY_TITLE_EVIDENCE_SUBMISSION);
    const source = readFileSync(new URL('../agentCli/agentHarmonyEnvelope.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/DAILY_TITLE_POLICY[\s\S]*dailyPublishingTitleReview/);
    // never retyped: a distinctive phrase of the original policy must not appear in the envelope sources
    for (const file of ['agentHarmonyEnvelope.ts', 'agentHarmonyCriteria.ts']) {
      expect(readFileSync(new URL(`../agentCli/${file}`, import.meta.url), 'utf8')).not.toContain('실제 자료 안의 의외인 행동');
    }
  });

  it('writes the app criteria from imported constants and the deterministic checks', () => {
    const title = resolveTitleLengthRange('homefeed'), headings = resolveHeadingCountRange('homefeed');
    expect(envelope).toContain(`${title.min}~${title.max}`);
    expect(envelope).toContain(`${headings.min}~${headings.max}개`);
    for (const phrase of ['8~100자', '줄바꿈', '직접 인용', '지어내지', '귀속', '내부 표지']) expect(envelope).toContain(phrase);
  });

  it('records the measured heading-count note as an observation, not a cause', () => {
    for (const phrase of ['AUC 0.46', 'AUC 0.74', '5.4', '4.2', '5~6개', '쪼개지']) expect(envelope).toContain(phrase);
    expect(envelope).toContain('원인 단정이 아니다');
  });

  it('asks for exactly the two extra fields with the 8 candidate keys, the kinds and the rules', () => {
    expect(envelope).toContain('"harmonyPacket"');
    expect(envelope).toContain('"complementReport"');
    for (const key of titleCandidateKeys) expect(envelope).toContain(`"${key}"`);
    expect(envelope).toContain(COMPLEMENT_KINDS.join('|'));
    expect(envelope).toContain(COMPLEMENT_RULES.join('|'));
    expect(envelope).toContain('한 글자도 바꾸지 않고');
    expect(envelope).toContain('기존 JSON 필드는 하나도 빼지');
  });

  it('has no numeric score field and no effect-promise wording', () => {
    expect(envelope).not.toMatch(/"(score|rating|grade|점수|등급)"/i);
    expect(envelope).toContain('점수·등급·퍼센트로 매기지 않는다');
    expect(EFFECT_PROMISE_PATTERN.test(envelope)).toBe(false);
  });

  it('falls back to the plain agentic envelope for any mode other than homefeed', () => {
    expect(wrapAsHarmonyTask(BASE, { mode: 'seo' as never })).toBe(wrapAsAgenticTask(BASE, 'seo'));
  });
});

describe('selectAgentTaskPrompt (flag OFF must equal today)', () => {
  it('without harmony it is exactly wrapAsAgenticTask(prompt, mode)', () => {
    for (const mode of [undefined, 'homefeed', 'seo', 'affiliate', 'photo']) {
      expect(selectAgentTaskPrompt(BASE, { mode })).toBe(wrapAsAgenticTask(BASE, mode));
      expect(selectAgentTaskPrompt(BASE, { mode, harmony: undefined })).toBe(wrapAsAgenticTask(BASE, mode));
    }
  });

  it('raw and agenticEnvelope:false send the prompt untouched, harmony or not', () => {
    expect(selectAgentTaskPrompt(BASE, { raw: true, mode: 'homefeed' })).toBe(BASE);
    expect(selectAgentTaskPrompt(BASE, { agenticEnvelope: false, mode: 'homefeed' })).toBe(BASE);
    expect(selectAgentTaskPrompt(BASE, { raw: true, harmony: { mode: 'homefeed' } })).toBe(BASE);
    expect(selectAgentTaskPrompt(BASE, { agenticEnvelope: false, harmony: { mode: 'homefeed' } })).toBe(BASE);
  });

  it('with harmony it is wrapAsHarmonyTask and differs from the agentic envelope', () => {
    const harmony = selectAgentTaskPrompt(BASE, { mode: 'homefeed', harmony: { mode: 'homefeed' } });
    expect(harmony).toBe(wrapAsHarmonyTask(BASE, { mode: 'homefeed' }));
    expect(harmony).not.toBe(wrapAsAgenticTask(BASE, 'homefeed'));
  });
});
