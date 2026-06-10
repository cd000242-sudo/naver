import { describe, expect, it } from 'vitest';
import { stripCtaArtifactsFromBody } from '../automation/bodyArtifactCleanup';

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

describe('stripCtaArtifactsFromBody', () => {
  it('keeps a standalone section divider inside the body', () => {
    const body = `첫 문단입니다.\n\n${DIVIDER}\n\n둘째 문단입니다.`;
    const out = stripCtaArtifactsFromBody(body);
    expect(out).toContain(DIVIDER);
    expect(out).toContain('첫 문단입니다.');
    expect(out).toContain('둘째 문단입니다.');
  });

  it('removes a divider that carries a CTA url on the same line', () => {
    const body = `본문.\n${DIVIDER} https://example.com/deal\n끝.`;
    const out = stripCtaArtifactsFromBody(body);
    expect(out).not.toContain('https://example.com/deal');
    expect(out).toContain('본문.');
    expect(out).toContain('끝.');
  });

  it('removes a divider immediately above an AI-echoed CTA block', () => {
    const body = `본문.\n\n${DIVIDER}\n🔗 더 알아보기\n👉 https://example.com\n\n끝.`;
    const out = stripCtaArtifactsFromBody(body);
    expect(out).not.toContain('더 알아보기');
    expect(out).not.toContain('https://example.com');
    expect(out).not.toContain('━');
    expect(out).toContain('끝.');
  });

  it('removes CTA hook lines and bare CTA links', () => {
    const body = '본문.\n더 알아보기 →\n👉 https://example.com/x\n끝.';
    const out = stripCtaArtifactsFromBody(body);
    expect(out).not.toContain('더 알아보기');
    expect(out).not.toContain('example.com');
    expect(out).toContain('본문.');
  });

  it('drops trailing dividers at the very end of the body', () => {
    const body = `본문 마지막 문장.\n\n${DIVIDER}`;
    const out = stripCtaArtifactsFromBody(body);
    expect(out).not.toContain('━');
    expect(out.endsWith('본문 마지막 문장.')).toBe(true);
  });

  it('returns plain bodies untouched', () => {
    const body = '아무 마커도 없는 본문입니다.\n\n둘째 문단.';
    expect(stripCtaArtifactsFromBody(body)).toBe(body);
  });

  it('handles empty input safely', () => {
    expect(stripCtaArtifactsFromBody('')).toBe('');
  });
});
