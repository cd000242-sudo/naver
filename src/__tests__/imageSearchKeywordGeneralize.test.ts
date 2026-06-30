import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guard: AI 자동수집 이미지 검색어를 API 없이 로컬에서 일반화 (2026-06-23).
 *
 * User error (screenshot): "이미지를 찾을 수 없습니다 — 검색어: '방탄소년단 진, 브라질 3관왕
 * 소식에 팬덤이 진짜 놀란 이유?' → 0개". Root: when Gemini batchOptimizeSearchQueries (429 등)
 * and extractCoreSubject fail, the fallback searched the FULL article title (hooking sentence),
 * which is too specific → Naver image search returns 0.
 *
 * Fix: a local (no-API) generalizer keeps the leading core tokens and drops hook/filler words, and
 * runs as an extra fallback stage. The thumbnail heading ("🖼️ 썸네일") searches the article's core
 * keyword (so the title image is used, not an unrelated vlog image).
 *
 * The generalizer is mirrored here to verify the reasoning produces a searchable keyword.
 */
function localGeneralizeImageQuery(text: string, maxTokens = 4): string {
  if (!text) return '';
  const STOP = new Set(['소식', '이유', '진짜', '정말', '놀란', '충격', '화제', '근황', '공개', '숨겨진', '그것', '이것', '모두', '드디어', '결국', '과연', '바로', '대박', '최초', '단독', '이', '가', '은', '는', '을', '를', '에', '도', '와', '과', '의', '로']);
  const tokens = text
    .replace(/[?!.…,"'()[\]·•~-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t && !STOP.has(t));
  return tokens.slice(0, maxTokens).join(' ').trim();
}

describe('image search keyword generalization', () => {
  it('reduces a hooking title to its leading core entities', () => {
    const out = localGeneralizeImageQuery('방탄소년단 진, 브라질 3관왕 소식에 팬덤이 진짜 놀란 이유?', 4);
    expect(out).toBe('방탄소년단 진 브라질 3관왕');
    // the hook tail must be gone
    expect(out).not.toContain('이유');
    expect(out).not.toContain('놀란');
  });

  it('broader (2-token) form keeps just the subject', () => {
    expect(localGeneralizeImageQuery('방탄소년단 진, 브라질 3관왕 소식에 팬덤이 진짜 놀란 이유?', 2)).toBe('방탄소년단 진');
  });

  it('the renderer wires the local generalizer + thumbnail-uses-title-keyword fallback', () => {
    const src = read('renderer/modules/headingImageGen.ts');
    expect(src).toContain('const localGeneralizeImageQuery');
    expect(src).toMatch(/heading\.includes\('썸네일'\) \? searchKeyword/);
  });
});
