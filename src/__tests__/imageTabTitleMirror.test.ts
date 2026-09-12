/**
 * [2026-09-12 사장님 요청] "반자동 편집에 붙여넣기가 되면 이미지관리탭 콘텐츠 입력 제목
 * 필드에 자동으로 제목이 들어가도록."
 *
 * 자동 입력 자체는 생성 후처리에 있었다. 붙여넣기에서 비어 있던 이유는 그 시점의
 * selectedTitle 이 없기 때문이다 — 붙여넣기는 본문만 들어오고 제목은 편집 화면 칸에 있다.
 * 이 계열은 id 하나만 어긋나도 조용히 죽으므로 소스로 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('이미지 관리 탭 제목 미러링', () => {
  it('편집 화면 제목칸을 폴백으로 읽는다 — 붙여넣기에는 selectedTitle 이 없다', () => {
    const src = read('../renderer/modules/contentGeneration.ts');
    const fn = src.slice(src.indexOf('export function syncImageTabTitle'));
    expect(fn.slice(0, 1200)).toMatch(/unified-generated-title/);
    expect(fn.slice(0, 1200)).toMatch(/image-title/);
  });

  it('후처리가 미러링을 부른다 — 생성·붙여넣기 경로가 같은 함수를 쓴다', () => {
    const src = read('../renderer/modules/contentGeneration.ts');
    expect(src).toMatch(/syncImageTabTitle\(structuredContent\?\.selectedTitle\);/);
  });

  it('제목을 고치면 따라간다 — 렌더러가 미러를 배선한다', () => {
    const src = read('../renderer/modules/contentGeneration.ts');
    expect(src).toMatch(/export function initImageTabTitleMirror/);
    expect(src).toMatch(/addEventListener\('input', \(\) => syncImageTabTitle\(\)\)/);
    expect(read('../renderer/renderer.ts')).toMatch(/initImageTabTitleMirror\(\);/);
  });

  it('빈 제목으로 기존 값을 지우지 않는다', () => {
    const src = read('../renderer/modules/contentGeneration.ts');
    const fn = src.slice(src.indexOf('export function syncImageTabTitle'));
    expect(fn.slice(0, 1200)).toMatch(/if \(!title \|\| target\.value === title\) return;/);
  });

  it('화면에 두 입력칸이 모두 있다', () => {
    const html = read('../../public/index.html');
    expect(html).toMatch(/id="image-title"/);
    expect(html).toMatch(/id="unified-generated-title"/);
  });
});
