import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { reconcileProviderWithModel } from '../main/reconcileProviderWithModel';

/**
 * [2026-09-02 실측 4회] expected=claude, selected=openai-gpt41, actual=openai
 *
 * 부팅이 낡은 계정(lastActiveUserId)을 먼저 복원해 렌더러가 그 계정 값으로 화면을 그린 뒤,
 * 진짜 계정으로 바뀌어도 알림이 없어 화면은 옛 이름표(claude)를 보낸다.
 * main 은 새 계정의 모델(openai-gpt41)을 고르고, 벤더가 어긋나 던진다.
 *
 * 같은 부류가 세 번째다(2026-06-30 에이전트 · 08-19 라디오 복원 · 오늘).
 * 화면 이름표를 고치는 수정은 늘 한 곳을 남겼다. 이제 이름표를 믿지 않는다 —
 * 모델이 SSOT 고, provider 는 그 모델의 벤더로 맞춘다. 모델은 바뀌지 않는다.
 */

describe('렌더러 이름표와 선택 모델의 벤더가 어긋나면 모델 쪽으로 맞춘다', () => {
  it('실측 조합: 라벨 claude · 모델 openai-gpt41 → openai (모델은 그대로)', () => {
    const r = reconcileProviderWithModel('claude', 'openai-gpt41');
    expect(r.provider).toBe('openai');
    expect(r.corrected).toBe(true);
    expect(r.reason).toContain('openai-gpt41');
  });

  /*
   * 벤더가 넷이다. 특정 조합만 막으면 다음 조합에서 같은 사고가 난다 —
   * 형태로 도는지 확인한다.
   */
  it.each([
    ['openai', 'claude-sonnet', 'claude'],
    ['gemini', 'claude-haiku', 'claude'],
    ['claude', 'gemini-3.5-flash', 'gemini'],
    ['openai', 'perplexity-sonar', 'perplexity'],
  ])('라벨 %s · 모델 %s → %s', (label, model, expected) => {
    const r = reconcileProviderWithModel(label, model);
    expect(r.provider).toBe(expected);
    expect(r.corrected).toBe(true);
  });

  it('맞으면 손대지 않는다 — 경고도 없어야 한다', () => {
    const r = reconcileProviderWithModel('openai', 'openai-gpt41');
    expect(r).toEqual({ provider: 'openai', corrected: false });
  });
});

describe('손대면 안 되는 자리', () => {
  /*
   * 에이전트는 사용자가 명시로 고른 0과금 경로다. API 로 바꾸면
   * 2026-06-30 과금 사고가 돌아온다 — unifiedDOMCache 와 같은 규칙이다.
   */
  it.each([['agent-codex'], ['agent-claude'], ['agent-gemini']])(
    '에이전트 라벨 %s 은 모델이 뭐든 그대로다',
    (agent) => {
      const r = reconcileProviderWithModel(agent, 'openai-gpt41');
      expect(r.provider).toBe(agent);
      expect(r.corrected).toBe(false);
    },
  );

  it('모델이 에이전트면 API 라벨을 건드리지 않는다', () => {
    const r = reconcileProviderWithModel('openai', 'agent-codex');
    expect(r.corrected).toBe(false);
  });

  it('라벨이 비거나 모델이 비면 그대로 — 추측하지 않는다', () => {
    expect(reconcileProviderWithModel('', 'openai-gpt41').corrected).toBe(false);
    expect(reconcileProviderWithModel('claude', '').corrected).toBe(false);
    expect(reconcileProviderWithModel(undefined, undefined).corrected).toBe(false);
  });

  it('모델을 못 풀면 그대로 — 뒤의 벤더 단언이 제 몫을 한다', () => {
    const r = reconcileProviderWithModel('claude', 'no-such-model-xyz');
    expect(r.provider).toBe('claude');
    expect(r.corrected).toBe(false);
  });

  it('알려진 API 벤더가 아닌 라벨(커스텀)은 건드리지 않는다', () => {
    const r = reconcileProviderWithModel('custom-thing', 'openai-gpt41');
    expect(r.corrected).toBe(false);
  });
});

describe('배선: main 이 벤더 단언 전에 이름표를 맞춘다', () => {
  const main = readFileSync(resolve(__dirname, '..', 'main.ts'), 'utf-8').replace(/\r/g, '');

  it('assembleContentSource 직후, generator 를 그대로 쓰지 않고 맞춘다', () => {
    expect(main).toMatch(/reconcileProviderWithModel\(/u);
    // 맞추기 전 원본 라벨은 별도 변수로 남긴다 — 로그에 둘 다 찍기 위해서다
    expect(main).toMatch(/const rawProvider = payload\.assembly\.generator \?\? source\.generator \?\? 'gemini';/u);
  });

  it('맞췄으면 조용히 넘기지 않고 경고를 찍는다', () => {
    expect(main).toMatch(/if \(providerFix\.corrected\)[\s\S]{0,200}console\.warn/u);
  });
});
