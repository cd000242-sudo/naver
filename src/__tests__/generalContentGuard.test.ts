import { describe, it, expect, afterEach } from 'vitest';
import {
  isGeneralContentGuardEnabled,
  hasGroundingSource,
  buildGeneralContentGuardBlock,
} from '../content/generalContentGuard';

const ENV_KEY = 'GENERAL_CONTENT_GUARD_V1';

describe('generalContentGuard — isGeneralContentGuardEnabled', () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('defaults to ON when the flag is unset', () => {
    delete process.env[ENV_KEY];
    expect(isGeneralContentGuardEnabled()).toBe(true);
  });

  it.each(['false', '0', 'off', 'FALSE', ' Off '])(
    'is OFF when flag is %s',
    (val) => {
      process.env[ENV_KEY] = val;
      expect(isGeneralContentGuardEnabled()).toBe(false);
    },
  );

  it('stays ON for any other value', () => {
    process.env[ENV_KEY] = 'true';
    expect(isGeneralContentGuardEnabled()).toBe(true);
  });
});

describe('generalContentGuard — hasGroundingSource', () => {
  it('is true when hasFactCheckSource === true', () => {
    expect(hasGroundingSource({ hasFactCheckSource: true })).toBe(true);
  });

  it('is true when rawText has real content (>=50 chars)', () => {
    expect(hasGroundingSource({ rawText: 'x'.repeat(60) })).toBe(true);
  });

  it('is true when sourceText has real content (>=50 chars)', () => {
    expect(hasGroundingSource({ sourceText: 'y'.repeat(50) })).toBe(true);
  });

  it('is false for an ungrounded keyword-only source', () => {
    expect(hasGroundingSource({ keywords: ['수국', '6월'] })).toBe(false);
  });

  it('is false when rawText is too short to be grounding', () => {
    expect(hasGroundingSource({ rawText: '짧음' })).toBe(false);
  });

  it('is false for null / non-object', () => {
    expect(hasGroundingSource(null)).toBe(false);
    expect(hasGroundingSource(undefined)).toBe(false);
    expect(hasGroundingSource('string')).toBe(false);
  });
});

describe('generalContentGuard — buildGeneralContentGuardBlock', () => {
  const block = buildGeneralContentGuardBlock();

  it('returns a non-empty trimmed block', () => {
    expect(block.length).toBeGreaterThan(200);
    expect(block).toBe(block.trim());
  });

  it('forbids fabricated first-person experience', () => {
    expect(block).toContain('체험 위장');
    expect(block).toContain('직접 가보니');
  });

  it('forbids fact fabrication and unverified hearsay', () => {
    expect(block).toContain('사실 날조');
    expect(block).toContain('들려왔다');
  });

  it('forbids fake reminiscence tense', () => {
    expect(block).toContain('가짜 회상체');
    expect(block).toContain('했었다');
  });

  it('forbids empty platitude closers', () => {
    expect(block).toContain('빈 마무리');
    expect(block).toContain('진짜 매력');
  });

  it('enforces information density (no repeated paragraphs)', () => {
    expect(block).toContain('정보 밀도');
    expect(block).toContain('새 정보 단위');
  });
});
