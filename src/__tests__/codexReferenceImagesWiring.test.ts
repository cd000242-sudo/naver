// [2026-11-11] 묶음 3b — 배선(소스 단언): 화면 위치 · 번들 등록 · 호출 지점 전달 · 비우는 시점 · 건드리면 안 되는 파일.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const html = read('public/index.html');
const heading = read('src/renderer/modules/headingImageGen.ts');
const copyStatic = read('scripts/copy-static.mjs');

describe('화면 위치', () => {
  it('#mgmt-codex-reference 는 AI 활용 표시 바로 아래, 엔진별 로그인 줄 위에 있고 처음엔 숨겨져 있다', () => {
    const mark = html.indexOf('id="image-ai-mark-status"');
    const block = html.indexOf('id="mgmt-codex-reference"');
    const dropshot = html.indexOf('id="mgmt-dropshot-login"');
    expect(mark).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(mark);
    expect(block).toBeLessThan(dropshot);
    const between = html.slice(mark, block);
    expect(between).not.toMatch(/id="mgmt-(dropshot|genspark|flow)/);
    expect(html.slice(block - 120, block + 200)).toMatch(/display:\s*none/);
    expect(html).toMatch(/id="mgmt-codex-reference-file"[^>]*accept="image\/\*"[^>]*multiple|id="mgmt-codex-reference-file"[^>]*multiple[^>]*accept="image\/\*"/);
  });
});

describe('번들 등록', () => {
  const listIndex = (name: string) => {
    const hits = copyStatic.split(`'${name}'`).length - 1;
    expect(hits).toBe(1);
    return copyStatic.indexOf(`'${name}'`);
  };
  it('목록 유틸은 fullAutoUtils 보다, 화면 모듈은 imageManagementTab·headingImageGen 보다 먼저 한 번만 실린다', () => {
    expect(listIndex('codexReferenceImageList.js')).toBeLessThan(listIndex('fullAutoUtils.js'));
    expect(listIndex('codexReferenceImageList.js')).toBeLessThan(listIndex('codexReferenceImages.js'));
    expect(listIndex('codexReferenceImages.js')).toBeLessThan(listIndex('imageManagementTab.js'));
    expect(listIndex('codexReferenceImages.js')).toBeLessThan(listIndex('headingImageGen.js'));
  });
  it('새 파일은 300줄 이하, 번들 스코프 함수를 window 로 조회하지 않는다', () => {
    for (const file of ['src/renderer/utils/codexReferenceImageList.ts', 'src/renderer/modules/codexReferenceImages.ts']) {
      const source = read(file);
      expect(source.split('\n').length).toBeLessThanOrEqual(300);
      expect(source).not.toMatch(/\(window as any\)\??\.(codexUserReferenceOptions|clearCodexReferenceImages|refreshCodexReferenceImages|bindCodexReferenceImages)/);
    }
  });
});

describe('호출 지점 전달', () => {
  it('headingImageGen 의 Codex 로 갈 수 있는 6곳이 codexUserReferenceOptions 를 펼쳐 담는다', () => {
    expect(heading).toContain("from '../utils/codexReferenceImageList.js'");
    expect(heading.split('...codexUserReferenceOptions(').length - 1).toBe(6);
    // selected headings · shopping per-card · engine per-card · batch prefetch · regenerate (shopping) · regenerate (engine)
    expect(heading).toMatch(/items: itemsWithPrompts,\s*\.\.\.codexUserReferenceOptions\(provider\)/);
    expect(heading).toMatch(/thumbnailTextInclude: isThumbnailSection \? thumbnailTextInclude : false,\s*\.\.\.codexUserReferenceOptions\(imageSource, \{ isThumbnail: isThumbnailSection \}\)/);
    expect(heading).toMatch(/items: gsTabBatch,\s*\.\.\.codexUserReferenceOptions\(imageSource\)/);
    expect(heading).toMatch(/thumbnailTextInclude: allowTextForRegen \? thumbnailTextInclude : false,\s*\.\.\.codexUserReferenceOptions\(imageSource, \{ isThumbnail: headingIndex === 0 \}\)/);
  });
  it('전용 썸네일 호출 · 다른 엔진 분기는 참고 사진을 담지 않는다', () => {
    const thumb = heading.indexOf('const thumbnailResult = await generateImagesWithCostSafety({');
    expect(thumb).toBeGreaterThan(-1);
    expect(heading.slice(thumb, thumb + 700)).not.toContain('userReference');
  });
  it('실패 문구를 로그·토스트로 알리고, 수집 뒤 칸을 다시 그린다', () => {
    expect(heading).toMatch(/이미지 생성 실패: \$\{\(error as Error\)\.message\}`, 'images-log-output'\);\s*reportCodexReferenceFailure\(/);
    expect(heading).toMatch(/refreshCodexReferenceImages\(\);\s*const allImages: string\[\] = collected\.imageUrls;/);
  });
  it('중간 래퍼는 옵션을 통째로 넘긴다(골라 담지 않는다) — 렌더러 → preload', () => {
    const cost = read('src/renderer/modules/costAndAutoGen.ts');
    expect(cost).toContain('window.api.generateImages(options)');
    expect(cost).toMatch(/return \{\s*\.\.\.options,\s*postTitle: articleTitle,/);
    expect(cost).toMatch(/const guaranteeOptions = \{\s*\.\.\.options,/);
    expect(read('src/preload.ts')).toContain("generateImages: (options: any): Promise<GenerateImagesResult> =>\n    ipcRenderer.invoke('automation:generateImages', options)".replace(/\n/g, read('src/preload.ts').includes('\r\n') ? '\r\n' : '\n'));
  });
  it('렌더러 타입에 userReferenceImages 가 있다', () => {
    const dts = read('src/renderer/global.d.ts');
    const start = dts.indexOf('generateImages: (');
    expect(dts.slice(start, start + 900)).toMatch(/userReferenceImages\?: Array<\{ path: string; role: 'person' \| 'product' \}>/);
  });
});

describe('비우는 시점 · 초기화 연결 · 금지 파일', () => {
  it('발행이 끝나는 공통 지점(resetAfterPublish)에서 비운다', () => {
    const utils = read('src/renderer/utils/fullAutoUtils.ts');
    expect(utils).toContain("from './codexReferenceImageList.js'");
    const fn = utils.slice(utils.indexOf('export function resetAfterPublish'));
    expect(fn.slice(0, 2500)).toContain('clearCodexReferenceImages()');
  });
  it('이미지 탭 초기화가 화면을 연결한다', () => {
    const tab = read('src/renderer/modules/imageManagementTab.ts');
    expect(tab).toContain("from './codexReferenceImages.js'");
    expect(tab).toContain('bindCodexReferenceImages(');
  });
  it('사진 목록은 localStorage 에 저장하지 않는다(접힘 상태만 예외)', () => {
    // Only the fold state (a screen preference, key CODEX_REF_COLLAPSE_KEY) may touch localStorage — never the photo list.
    const calls = read('src/renderer/modules/codexReferenceImages.ts').match(/localStorage\.\w+\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.includes('CODEX_REF_COLLAPSE_KEY'))).toBe(true);
    expect(read('src/renderer/utils/codexReferenceImageList.ts')).not.toMatch(/localStorage/);
  });
  it('src/main.ts · contentGeneration.ts 는 이 묶음 이름을 모른다(건드리지 않았다)', () => {
    for (const file of ['src/main.ts', 'src/renderer/modules/contentGeneration.ts']) {
      expect(read(file)).not.toMatch(/codexReference|CodexReference|codexUserReferenceOptions/);
    }
  });
});
