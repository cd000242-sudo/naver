import { describe, expect, it } from 'vitest';
import {
  createPromptSnapshot,
  createProviderPromptEnvelope,
  type PromptSnapshotInput,
} from '../generation/promptSnapshot';

const lockedDisclosure = '[광고] 이 글은 제품 제공 및 소정의 수수료를 받을 수 있음을 고지합니다.';

const baseInput: PromptSnapshotInput = {
  promptVersion: 'content-v3.1',
  provenance: {
    source: 'full-auto-flow',
    templateVersion: 'shopping-review-2026-07',
    inputIds: ['campaign-42', 'product-81'],
  },
  semantic: {
    purpose: '실제 사용 정보를 바탕으로 구매 판단을 돕는 리뷰를 작성한다.',
    audience: {
      locale: 'ko-KR',
      needs: ['비교', '구매 전 확인'],
    },
    keywords: ['무선 청소기', '흡입력'],
    editorialRules: {
      tone: '친절하고 사실 중심',
      prohibitedClaims: ['최고', '무조건 효과'],
    },
  },
  lockedComplianceFragments: [lockedDisclosure, '가격과 재고는 발행 시점에 따라 달라질 수 있습니다.'],
};

describe('PromptSnapshot', () => {
  it('preserves raw semantic prompt fields and creates a deeply immutable snapshot', () => {
    const snapshot = createPromptSnapshot(baseInput);

    expect(snapshot).toMatchObject({
      version: 'prompt-snapshot.v1',
      promptVersion: baseInput.promptVersion,
      provenance: baseInput.provenance,
      semantic: baseInput.semantic,
      lockedComplianceFragments: baseInput.lockedComplianceFragments,
    });
    expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.semantic)).toBe(true);
    expect(Object.isFrozen(snapshot.semantic.audience)).toBe(true);
    expect(Object.isFrozen(snapshot.semantic.audience.needs)).toBe(true);
    expect(Object.isFrozen(snapshot.lockedComplianceFragments)).toBe(true);
    expect(Object.isFrozen(snapshot.provenance)).toBe(true);
    expect(Object.isFrozen(snapshot.provenance.inputIds)).toBe(true);
  });

  it('isolates the snapshot from mutations to caller-owned input values', () => {
    const mutableInput: PromptSnapshotInput = {
      ...baseInput,
      provenance: { ...baseInput.provenance, inputIds: [...baseInput.provenance.inputIds] },
      semantic: {
        ...baseInput.semantic,
        audience: {
          ...baseInput.semantic.audience,
          needs: [...baseInput.semantic.audience.needs],
        },
      },
      lockedComplianceFragments: [...baseInput.lockedComplianceFragments],
    };
    const snapshot = createPromptSnapshot(mutableInput);

    mutableInput.provenance.inputIds[0] = 'changed-campaign';
    (mutableInput.semantic.audience as { needs: string[] }).needs.push('changed need');
    mutableInput.lockedComplianceFragments[0] = 'changed disclosure';

    expect(snapshot.provenance.inputIds).toEqual(['campaign-42', 'product-81']);
    expect(snapshot.semantic.audience).toEqual({
      locale: 'ko-KR',
      needs: ['비교', '구매 전 확인'],
    });
    expect(snapshot.lockedComplianceFragments).toContain(lockedDisclosure);
  });

  it('requires non-empty locked compliance fragments before a provider can be called', () => {
    expect(() => createPromptSnapshot({
      ...baseInput,
      lockedComplianceFragments: undefined as never,
    })).toThrow(/locked compliance fragments/i);

    expect(() => createPromptSnapshot({
      ...baseInput,
      lockedComplianceFragments: [],
    })).toThrow(/locked compliance fragments/i);

    expect(() => createPromptSnapshot({
      ...baseInput,
      lockedComplianceFragments: ['   '],
    })).toThrow(/locked compliance fragment/i);
  });

  it('uses a stable hash for semantically identical snapshots without exposing raw prompt values', () => {
    const first = createPromptSnapshot(baseInput);
    const sameMeaningDifferentKeyOrder = createPromptSnapshot({
      ...baseInput,
      semantic: {
        editorialRules: { prohibitedClaims: ['최고', '무조건 효과'], tone: '친절하고 사실 중심' },
        keywords: ['무선 청소기', '흡입력'],
        audience: { needs: ['비교', '구매 전 확인'], locale: 'ko-KR' },
        purpose: '실제 사용 정보를 바탕으로 구매 판단을 돕는 리뷰를 작성한다.',
      },
    });

    expect(sameMeaningDifferentKeyOrder.hash).toBe(first.hash);
    expect(first.hash).not.toContain('무선 청소기');
  });

  it('creates a provider envelope that preserves the snapshot and only adds schema/transport metadata', () => {
    const snapshot = createPromptSnapshot(baseInput);
    const envelope = createProviderPromptEnvelope(snapshot, {
      provider: 'codex-mcp',
      outputSchema: {
        type: 'object',
        required: ['title', 'body', 'tags'],
      },
      transport: {
        protocol: 'streamable-http',
        tool: 'generate_blog_post',
      },
    });

    expect(envelope).toMatchObject({
      version: 'provider-prompt-envelope.v1',
      provider: 'codex-mcp',
      promptVersion: snapshot.promptVersion,
      promptHash: snapshot.hash,
      provenance: snapshot.provenance,
      semantic: snapshot.semantic,
      lockedComplianceFragments: snapshot.lockedComplianceFragments,
      outputSchema: {
        type: 'object',
        required: ['title', 'body', 'tags'],
      },
      transport: {
        protocol: 'streamable-http',
        tool: 'generate_blog_post',
      },
    });
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.outputSchema)).toBe(true);
    expect(Object.isFrozen(envelope.transport)).toBe(true);
  });

  it('rejects adapter attempts to override or omit locked fragments', () => {
    const snapshot = createPromptSnapshot(baseInput);

    expect(() => createProviderPromptEnvelope(snapshot, {
      provider: 'codex-mcp',
      lockedComplianceFragments: ['replacement'] as never,
    } as never)).toThrow(/locked compliance fragments/i);

    expect(() => createProviderPromptEnvelope(snapshot, {
      provider: 'codex-mcp',
      semantic: { purpose: 'replacement' } as never,
    } as never)).toThrow(/semantic/i);

    const alteredSnapshot = {
      ...snapshot,
      lockedComplianceFragments: ['replacement'],
    };
    expect(() => createProviderPromptEnvelope(
      alteredSnapshot,
      { provider: 'codex-mcp' },
    )).toThrow(/integrity/i);
  });
});
