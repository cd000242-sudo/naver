import { describe, it, expect } from 'vitest';
import { buildPersonaCard, getPersonaProfile } from '../authgrDefense.js';

describe('buildPersonaCard — Phase 4', () => {
  it('returns a non-empty WRITER PERSONA block for a known category', () => {
    const card = buildPersonaCard('tech');
    expect(card).toContain('[WRITER PERSONA]');
    expect(card).toContain('IT 업계');
    expect(card).toContain('페르소나 일관성 규칙');
  });

  it('falls back to the general profile for an unknown category', () => {
    const card = buildPersonaCard('not_a_category');
    const generalCard = buildPersonaCard('general');
    expect(card).toEqual(generalCard);
  });

  it('lists signatureExpressions as voice hints, not as templates', () => {
    const card = buildPersonaCard('travel');
    const profile = getPersonaProfile('travel');
    // Each signature must appear in the card as a bullet voice hint.
    for (const sig of profile.signatureExpressions) {
      expect(card).toContain(sig);
    }
    // The card must explicitly forbid direct mimicry.
    expect(card).toContain('직접 모방하지 말고');
    expect(card).toContain('두 번 이상');
  });

  it('does not contain raw injection-style commands (no JSON or placeholders)', () => {
    const card = buildPersonaCard('health');
    expect(card).not.toContain('{period}');
    expect(card).not.toContain('signatureExpressions');
  });

  it('produces stable output for the same category', () => {
    const a = buildPersonaCard('food');
    const b = buildPersonaCard('food');
    expect(a).toEqual(b);
  });
});
