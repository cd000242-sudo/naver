// 구조 참고 배선 잠금 — "칸만 만들고 저장/전달에서 빠뜨리는" 사고를 막는다.
// 이 파이프라인은 한 군데만 끊겨도 사용자 입력이 조용히 무시된다.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { isSupportedPostUrl, pickHeadingLines } from '../main/ipc/exposedStructureHandlers';

const ROOT = resolve(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf-8');

describe('URL 판정', () => {
  it('네이버 블로그 글 주소만 받는다', () => {
    expect(isSupportedPostUrl('https://blog.naver.com/leader_248/224381447188')).toBe(true);
    expect(isSupportedPostUrl('https://m.blog.naver.com/leader_248/224381447188')).toBe(true);
  });
  it('블로그 홈·다른 사이트·빈값은 거른다', () => {
    for (const bad of ['https://blog.naver.com/leader_248', 'https://example.com/a/1', '', 'leader_248']) {
      expect(isSupportedPostUrl(bad)).toBe(false);
    }
  });
});

describe('소제목 추정', () => {
  it('짧고 종결어미 없는 줄만 고른다', () => {
    const picked = pickHeadingLines([
      '화장실 문 뒤에서 나온 반응',
      '그래서 이런 일이 있었습니다.',
      '46세와 47세, 표기가 엇갈리는 지점',
      '짧음',
      '이건 아주 긴 문장이라 소제목으로 보기 어렵고 본문에 가까운 줄입니다 정말로 깁니다',
    ].join('\n'));
    expect(picked).toContain('화장실 문 뒤에서 나온 반응');
    expect(picked).toContain('46세와 47세, 표기가 엇갈리는 지점');
    expect(picked).not.toContain('그래서 이런 일이 있었습니다.');
    expect(picked).not.toContain('짧음');
  });
});

describe('배선 — 한 군데만 끊겨도 입력이 무시된다', () => {
  it('UI 입력칸이 있다', () => {
    const html = read('public', 'index.html');
    expect(html).toContain('id="exposed-structure-url"');
    expect(html).toContain('id="exposed-structure-analyze-btn"');
  });

  it('IPC 가 등록된다', () => {
    expect(read('src', 'main.ts')).toContain('registerExposedStructureHandlers()');
    expect(read('src', 'main', 'ipc', 'exposedStructureHandlers.ts'))
      .toContain("ipcMain.handle('structure:analyzeExposedUrl'");
  });

  it('preload 로 노출된다', () => {
    const preload = read('src', 'preload.ts');
    expect(preload).toContain('analyzeExposedStructure');
    expect(preload).toContain("ipcRenderer.invoke('structure:analyzeExposedUrl', url)");
  });

  it('렌더러가 초기화하고 전역으로 내보낸다', () => {
    const renderer = read('src', 'renderer', 'renderer.ts');
    expect(renderer).toContain('initExposedStructureRef()');
    expect(renderer).toContain('getExposedStructureBlock = getExposedStructureBlock');
  });

  it('생성 옵션 두 경로(URL·키워드) 모두에 실린다', () => {
    const gen = read('src', 'renderer', 'modules', 'contentGeneration.ts');
    expect((gen.match(/structureGuideBlock:/g) || []).length).toBe(2);
  });

  it('프롬프트에 실제로 주입된다', () => {
    const loader = read('src', 'promptLoader.ts');
    expect(loader).toContain('structureGuideBlock?: string');
    expect(loader).toContain('const trimmedStructure');
    // 이스케이프에 휘둘리지 않게 핵심만 본다 — 블록이 실제로 프롬프트에 더해지는가
    expect(loader).toMatch(/finalPrompt \+= .{0,12}trimmedStructure/);
  });

  it('생성기가 세 호출부 모두에서 넘긴다', () => {
    const cg = read('src', 'contentGenerator.ts');
    expect((cg.match(/structureGuideBlock/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('번들 인라인 목록에 등록돼 있다 (누락 시 런타임에만 터진다)', () => {
    expect(read('scripts', 'copy-static.mjs')).toContain("'exposedStructureRef.js'");
  });
});
