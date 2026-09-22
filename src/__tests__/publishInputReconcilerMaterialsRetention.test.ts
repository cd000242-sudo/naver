import { describe, expect, it } from 'vitest';
import { isProvenancePlaceholderFact, reconcilePublishPolicyInput } from '../contentPolicy/publishInputReconciler';
import { makeGoodDraft, makePolicyInput } from './contentPolicyFixtures';

/*
 * [2026-09-22] A coverage-drift filter that drops every source material the
 * user actually supplied is a false negative, not evidence the materials
 * don't apply — it must retain the originals instead of silently emptying
 * the array (that emptying is what fed the SOURCE_MATERIALS_MISSING gap).
 */
describe('reconcilePublishPolicyInput — source material retention on drift', () => {
  it('keeps original source materials when the coverage filter would drop all of them', () => {
    const draft = makeGoodDraft();
    const input = makePolicyInput({
      source_materials: [{
        type: 'reference',
        title: '완전히 무관한 제목',
        content: '본문과 전혀 겹치지 않는 무관한 내용입니다 zzz qqq wwww',
        source_id: 'unrelated-1',
      }],
    });

    const result = reconcilePublishPolicyInput(input, draft, { semiAutoMode: false, contextMissing: true });

    expect(result.source_materials).toHaveLength(1);
    expect(result.source_materials?.[0].source_id).toBe('unrelated-1');
    expect(result.materialsRetainedDespiteDrift).toBe(true);
  });

  it('does not set the flag when at least one material still covers the body', () => {
    const draft = makeGoodDraft();
    const input = makePolicyInput();

    const result = reconcilePublishPolicyInput(input, draft, { semiAutoMode: false, contextMissing: true });

    expect(result.materialsRetainedDespiteDrift).toBeUndefined();
  });

  it('does not set the flag when there were no source materials to begin with', () => {
    const draft = makeGoodDraft();
    const input = makePolicyInput({ source_materials: [] });

    const result = reconcilePublishPolicyInput(input, draft, { semiAutoMode: false, contextMissing: true });

    expect(result.source_materials).toEqual([]);
    expect(result.materialsRetainedDespiteDrift).toBeUndefined();
  });
});

describe('isProvenancePlaceholderFact', () => {
  it('matches the known publish-boundary and SmartScheduler placeholders', () => {
    expect(isProvenancePlaceholderFact('사용자가 반자동 편집 화면에서 최종 원고를 직접 확인했다.')).toBe(true);
    expect(isProvenancePlaceholderFact('발행 경계에서 최종 제목과 본문을 기준으로 원고를 다시 확인했다.')).toBe(true);
    expect(isProvenancePlaceholderFact('사용자가 SmartScheduler에 발행할 주제를 직접 등록했다.')).toBe(true);
  });

  it('matches the generic "사용자가 … 직접 등록/확인했다" shape for other adapters', () => {
    expect(isProvenancePlaceholderFact('사용자가 멀티계정 화면에서 발행 주제를 직접 등록했다.')).toBe(true);
  });

  it('does not match a real business fact', () => {
    expect(isProvenancePlaceholderFact('작업 전 가족이 귀중품을 먼저 확인한다.')).toBe(false);
    expect(isProvenancePlaceholderFact('')).toBe(false);
  });
});
