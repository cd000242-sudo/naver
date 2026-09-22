import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  humanizeContent,
  humanizeContentWithReport,
  getLastHumanizeReport,
} from '../aiHumanizer';

const AI_TEXT = '안녕하세요. 오늘은 이 제품을 소개해드리겠습니다. 물론 확실히 중요한 점은 이겁니다. 요약하자면 만족스럽습니다.';

describe('aiHumanizer — determinism', () => {
  it('same input produces identical output across 20 runs, for every intensity', () => {
    for (const intensity of ['off', 'light', 'medium', 'strong'] as const) {
      const outputs = new Set<string>();
      for (let i = 0; i < 20; i++) {
        outputs.add(humanizeContent(AI_TEXT, intensity, true, 'community_fan'));
      }
      expect(outputs.size, `intensity=${intensity} produced non-deterministic output`).toBe(1);
    }
  });

  it('no Math.random reference remains in the source file', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'aiHumanizer.ts'), 'utf-8');
    expect(src).not.toContain('Math.random');
  });

  it('off intensity returns the input unchanged', () => {
    expect(humanizeContent(AI_TEXT, 'off', true)).toBe(AI_TEXT);
  });
});

describe('aiHumanizer — protected spans', () => {
  const cases: string[] = [
    '노트북 가격은 3,414만원입니다.',
    '행사 날짜는 2026년 9월 1일입니다.',
    '화면 크기는 12.3인치입니다.',
    'NVIDIA RTX 모델을 사용합니다.',
    '그는 「정말 좋다」라고 적었습니다.',
  ];

  it.each(cases)('%s — every intensity leaves the protected span untouched', (text) => {
    for (const intensity of ['light', 'medium', 'strong'] as const) {
      const out = humanizeContent(text, intensity, true, 'professional');
      // Extract the protected token substring depending on the case and assert survival.
      if (text.includes('3,414만원')) expect(out).toContain('3,414만원');
      if (text.includes('2026년 9월 1일')) expect(out).toContain('2026년 9월 1일');
      if (text.includes('12.3인치')) expect(out).toContain('12.3인치');
      if (text.includes('NVIDIA')) {
        expect(out).toContain('NVIDIA');
        expect(out).toContain('RTX');
      }
      if (text.includes('「정말 좋다」')) expect(out).toContain('「정말 좋다」');
    }
  });

  it('caller-supplied protectedTerms are never altered', () => {
    const text = '가비아는 좋은 서비스를 제공합니다. 확실히 그렇습니다.';
    const out = humanizeContent(text, 'strong', true, undefined, { protectedTerms: ['가비아'] });
    expect(out).toContain('가비아');
  });

  it('no protected-span placeholder token leaks into the output', () => {
    const text = '가격은 12,000원이고 NVIDIA GPU를 씁니다. "정말 좋아요"라고 했습니다.';
    for (const intensity of ['light', 'medium', 'strong'] as const) {
      const out = humanizeContent(text, intensity, true);
      expect(out).not.toMatch(/⟦PROT\d+⟧/);
    }
  });
});

describe('aiHumanizer — report', () => {
  it('humanizeContentWithReport returns the intensity and a change list', () => {
    const { text, report } = humanizeContentWithReport(AI_TEXT, 'strong', { silent: true });
    expect(text).not.toBe(AI_TEXT);
    expect(report.intensity).toBe('strong');
    expect(Array.isArray(report.changes)).toBe(true);
    expect(report.changes.length).toBeGreaterThan(0);
  });

  it('getLastHumanizeReport reflects the most recent call', () => {
    humanizeContent(AI_TEXT, 'light', true);
    const report = getLastHumanizeReport();
    expect(report.intensity).toBe('light');
  });

  it('off intensity produces an empty change list', () => {
    const { report } = humanizeContentWithReport(AI_TEXT, 'off', { silent: true });
    expect(report.changes).toEqual([]);
  });
});
