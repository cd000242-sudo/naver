/**
 * blueOceanGenerationWiring.test.ts
 *
 * SPEC-KEYWORD-ENDGAME Phase 2-B — 블루오션 자동선정이 글 생성에 연결됐는지 배선 잠금.
 * 인라인 번들/IPC 배선은 tsc가 못 잡는 사각지대라 소스 문자열로 고정한다.
 * (옵트인: 토글 OFF면 기존대로, ON이면 메인키워드의 저경쟁 연관어를 서브로 추가)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('블루오션 자동선정 생성 연결 배선', () => {
  it('공유 헬퍼가 토글 확인 후 findBlueOceanKeywords로 서브키워드를 추가한다', () => {
    const gen = read('src/renderer/modules/contentGeneration.ts');
    expect(gen).toContain('async function augmentKeywordListWithBlueOcean');
    expect(gen).toContain("getElementById('blueocean-auto-select')");
    expect(gen).toContain('findBlueOceanKeywords');
    // 옵트인: 토글 checked일 때만 동작
    expect(gen).toContain('.checked');
    // Mode A: keywordList에 push(메인 유지 + 서브 추가)
    expect(gen).toContain('keywordList.push');
  });

  it('URL·키워드 두 생성 경로가 모두 블루오션 헬퍼를 호출한다', () => {
    const gen = read('src/renderer/modules/contentGeneration.ts');
    const calls = (gen.match(/augmentKeywordListWithBlueOcean\(keywordList\)/g) || []).length;
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('토글 체크박스가 index.html에 존재한다', () => {
    const html = read('public/index.html');
    expect(html).toContain('id="blueocean-auto-select"');
  });

  it('preload이 findBlueOceanKeywords를 window.api로 노출한다', () => {
    const preload = read('src/preload.ts');
    expect(preload).toContain('findBlueOceanKeywords');
    expect(preload).toContain('keyword:findBlueOcean');
  });
});
