import { describe, expect, it } from 'vitest';
import { resolveRunContentSource } from '../account/runContentSource.js';

// 2026-10-21: 이번 실행에만 쓸 글감 — 계정 키워드 순번(설정)을 바꾸지 않고 계정마다 지정한다.
describe('per-run content source', () => {
  it('uses a valid one-off keyword or https URL for that account only', () => {
    const options = { contentSources: { acc_a: { type: 'keyword', value: '  트렁크 경고음 원인 ' }, acc_b: { type: 'url', value: 'https://news.example.com/a' } } };
    expect(resolveRunContentSource(options, 'acc_a')).toEqual({ type: 'keyword', value: '트렁크 경고음 원인' });
    expect(resolveRunContentSource(options, 'acc_b')).toEqual({ type: 'url', value: 'https://news.example.com/a' });
    expect(resolveRunContentSource(options, 'acc_c')).toBeUndefined();
    expect(resolveRunContentSource(undefined, 'acc_a')).toBeUndefined();
  });
  it('refuses malformed, oversized or non-https sources instead of guessing', () => {
    for (const source of [{ type: 'keyword', value: '' }, { type: 'keyword', value: 'x'.repeat(201) }, { type: 'url', value: 'http://news.example.com' },
      { type: 'url', value: 'https://user:pw@news.example.com' }, { type: 'file', value: 'C:/a.txt' }]) {
      expect(() => resolveRunContentSource({ contentSources: { acc: source } }, 'acc')).toThrow('RUN_CONTENT_SOURCE_INVALID');
    }
  });
});
