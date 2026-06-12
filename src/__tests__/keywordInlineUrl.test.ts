import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * 키워드 입력 안에 URL을 섞어 넣으면("키워드, https://...") URL은 자동으로
 * 참고자료(rssUrl)로 분리하고 나머지만 키워드로 쓴다 (2026-06-12 사용자 요청).
 * URL이 키워드/제목으로 새면 안 된다 (기존: shopTitle URL 가드가 사후 차단만).
 */
describe('키워드 인라인 URL 분리 (2026-06-12)', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'modules', 'fullAutoFlow.ts'), 'utf-8');

  it('키워드 토큰에서 URL을 분리한다', () => {
    expect(src).toContain('inlineReferenceUrls');
    expect(src).toMatch(/keywordList = rawTokens\.filter/);
  });

  it('rssUrl 우선순위: 명시 URL → 키워드 인라인 URL → 업체 리서치 URL', () => {
    expect(src).toMatch(/rssUrl: urls\.length > 0 \? urls\[0\] : \(inlineReferenceUrls\[0\] \|\| businessResearchUrl \|\| undefined\)/);
  });

  it('키워드 제목 기능에 URL이 새지 않는다 (cleanedKeywords 사용)', () => {
    expect(src).toContain('cleanedKeywords');
    expect(src).not.toMatch(/keyword: formData\.keywords \|\| titleStr/);
  });
});
