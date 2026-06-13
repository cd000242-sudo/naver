import { describe, expect, it } from 'vitest';
import {
  calculateSimilarity,
  checkDuplicateHeadings,
  detectDuplicateContent,
  removeRepeatedFullContent,
  validateHeadingOrder,
} from '../contentDuplicateHeuristics';

const headings = [
  { title: 'First heading' },
  { title: 'Second heading' },
  { title: 'Third heading' },
];

describe('contentDuplicateHeuristics', () => {
  it('scores identical text higher than unrelated text', () => {
    const identical = calculateSimilarity('dry air moves through laundry', 'dry air moves through laundry');
    const unrelated = calculateSimilarity('dry air moves through laundry', 'fresh seafood market price');

    expect(identical).toBeGreaterThan(0.9);
    expect(unrelated).toBeLessThan(0.3);
  });

  it('keeps heading order validation permissive for generation stability', () => {
    expect(validateHeadingOrder([], 'guide')).toEqual({ valid: true, errors: [] });
    expect(validateHeadingOrder(headings, 'guide')).toEqual({ valid: true, errors: [] });
    expect(validateHeadingOrder(new Array(12).fill(0).map((_, index) => ({ title: `H${index}` })), 'guide')).toEqual({ valid: true, errors: [] });
  });

  it('gates only empty or materially short generated content', () => {
    expect(detectDuplicateContent('', headings).valid).toBe(false);
    expect(detectDuplicateContent('x'.repeat(399), headings).valid).toBe(false);
    expect(detectDuplicateContent('x'.repeat(400), headings).valid).toBe(false);
    expect(detectDuplicateContent('x'.repeat(400), headings, true).valid).toBe(true);
    expect(detectDuplicateContent('x'.repeat(800), headings).valid).toBe(true);
  });

  it('detects repeated heading titles without blocking normal repeated mentions', () => {
    const repeated = 'First heading\nbody\nFirst heading\nbody\nFirst heading\nbody';
    const normal = 'First heading\nbody\nSecond heading\nbody';

    expect(checkDuplicateHeadings(repeated, [{ title: 'First heading' }]).valid).toBe(false);
    expect(checkDuplicateHeadings(normal, headings).valid).toBe(true);
  });

  it('removes repeated full article heading sequences', () => {
    const repeated = [
      'Intro',
      'First heading',
      'alpha body',
      'Second heading',
      'beta body',
      'Third heading',
      'gamma body',
      'First heading',
      'alpha body',
      'Second heading',
      'beta body',
      'Third heading',
      'gamma body',
    ].join('\n');

    const cleaned = removeRepeatedFullContent(repeated, headings);

    expect(cleaned).toContain('First heading');
    expect(cleaned.indexOf('First heading')).toBe(cleaned.lastIndexOf('First heading'));
  });
});
