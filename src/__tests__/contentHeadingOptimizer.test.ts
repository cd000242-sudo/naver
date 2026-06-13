import { describe, expect, it } from 'vitest';
import {
  dedupeRepeatedPhrasesInHeadingTitle,
  normalizeHeadingKeyForOptimization,
  optimizeHeadingsForMode,
  optimizeHomefeedHeadingTitle,
  optimizeSeoHeadingTitle,
  syncHeadingsWithBodyPlain,
} from '../contentHeadingOptimizer.js';

describe('contentHeadingOptimizer', () => {
  it('normalizes heading keys for duplicate detection', () => {
    expect(normalizeHeadingKeyForOptimization('  <b>제목: 테스트!</b> ')).toBe('제목테스트');
  });

  it('deduplicates repeated heading words and suffix phrases', () => {
    expect(dedupeRepeatedPhrasesInHeadingTitle('제습기 제습기 빨래 건조 빨래 건조')).toBe('제습기 빨래 건조');
  });

  it('cleans seo ordinal prefixes without forcing keyword prefixes', () => {
    expect(optimizeSeoHeadingTitle('01) 제습기와 서큘레이터 같이 쓰는 이유')).toBe('제습기와 서큘레이터 같이 쓰는 이유');
  });

  it('cleans homefeed trailing generic labels', () => {
    expect(optimizeHomefeedHeadingTitle('EP.2 장마철 빨래 냄새 정리')).toBe('장마철 빨래 냄새');
  });

  it('optimizes headings in place while preserving other heading fields', () => {
    const content = {
      headings: [
        { title: '1. 첫 번째 소제목', content: '본문 1' },
        { title: '1. 첫 번째 소제목', content: '본문 2' },
        { title: '', content: '본문 3' },
      ],
    };

    optimizeHeadingsForMode(content, { contentMode: 'seo', metadata: { keywords: ['제습기'] } });

    expect(content.headings[0]).toEqual({ title: '첫 번째 소제목', content: '본문 1' });
    expect(content.headings[1].title).toBe('첫 번째 소제목 (2)');
    expect(content.headings[2].title).toBe('소제목 3');
  });

  it('keeps heading/body sync disabled to preserve AI-generated headings', () => {
    const content = {
      bodyPlain: '본문에서 다른 소제목을 발견할 수 있습니다.',
      headings: [{ title: '원래 소제목', content: '본문' }],
    };

    syncHeadingsWithBodyPlain(content);

    expect(content.headings[0].title).toBe('원래 소제목');
  });
});
