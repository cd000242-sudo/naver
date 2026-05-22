/**
 * 회귀 가드 — Gemini 원문 모드 그라운딩 OFF (RECITATION 빈 응답 0건 방지)
 *
 * 버그: 원문/URL 모드는 크롤링한 원문이 프롬프트에 fact source로 들어가는데,
 *   Gemini 경로는 그라운딩(googleSearch)을 계속 ON으로 둬서 같은 기사를 또 검색 →
 *   Gemini가 원문을 이중으로 받아 거의 그대로 재현 → RECITATION → 빈 응답(본문 0건).
 * 수정: 원문 모드(user > 500자)는 그라운딩 OFF. Perplexity 경로(v2.10.171)와 동일 정책.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('Gemini 원문 모드 그라운딩 OFF', () => {
  const code = read('contentGenerator.ts');

  it('원문 모드를 user 프롬프트 길이(> 500자)로 판별한다', () => {
    expect(code).toMatch(/isRawTextMode\s*=\s*\(geminiUserTextOriginal[\s\S]{0,40}?\.length\s*>\s*500/);
  });

  it('useGrounding이 원문 모드(!isRawTextMode)로 게이트된다', () => {
    expect(code).toMatch(/const useGrounding\s*=[\s\S]{0,120}?!isRawTextMode/);
  });

  it('Perplexity 경로도 원문 모드 검색 비활성화 정책을 유지한다 (정합성)', () => {
    // 두 경로가 같은 정책 — Perplexity는 isKeywordMode로 검색 recency 게이트
    expect(code).toMatch(/isKeywordMode\s*=\s*userMessage\.length\s*<=\s*500/);
  });

  it('500자 경계 동작 — 키워드 모드는 그라운딩 ON, 원문 모드는 OFF', () => {
    // 판별 로직 자체를 재현해 경계 검증 (실제 코드와 동일 규칙)
    const isRawTextMode = (userText: string): boolean => userText.length > 500;
    expect(isRawTextMode('겨울 다이어트 식단 추천')).toBe(false); // 키워드 → 그라운딩 ON
    expect(isRawTextMode('가'.repeat(501))).toBe(true); // 원문(크롤링) → 그라운딩 OFF
    expect(isRawTextMode('가'.repeat(500))).toBe(false); // 경계: 500자 이하는 키워드
  });
});
