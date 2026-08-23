import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  analyzeParaphraseSource,
  buildParaphraseAnalysisPrompt,
  buildParaphraseUpgradeBrief,
  extractAnalysisJson,
  normalizeParaphraseAnalysis,
} from '../content/paraphraseSourceAnalysis';

const FULL_ANALYSIS = {
  clickReason: '마감일 전에 갈아타지 않으면 민영주택 청약을 못 넣는다는 점',
  mainKeyword: '주택청약통장 전환',
  subKeywords: ['청약저축 전환', '주택청약종합저축'],
  skeleton: ['마감일 제시', '통장별 인정 기준', '창구 준비물'],
  experienceSignals: ['창구에서 직접 물어보니'],
  evidenceAnchors: ['9월 30일', '청약부금'],
  gaps: ['전환 후 첫 납입일이 밀리면 어떻게 되는지'],
  exposureHypothesis: '마감 기한과 통장별 기준 차이를 한 화면에서 정리해 검색 의도를 정확히 받았다.',
};

describe('페러프레이징 1단 분석', () => {
  it('분석 프롬프트는 날조를 금지하고 검색형 메인키워드를 요구한다', () => {
    const prompt = buildParaphraseAnalysisPrompt({ title: '제목', body: '본문' });

    expect(prompt).toContain('지어내면');
    expect(prompt).toContain('검색창에 실제로 칠 법한 형태');
    expect(prompt).toContain('글을 다시 쓰지 마라');
  });

  it('코드펜스로 감싼 응답에서도 JSON을 건져낸다', () => {
    const raw = '```json\n{"mainKeyword":"주택청약통장 전환"}\n```';

    expect(extractAnalysisJson(raw)).toEqual({ mainKeyword: '주택청약통장 전환' });
  });

  it('모델 출력의 배열 길이와 문자열 길이를 경계에서 강제한다', () => {
    const normalized = normalizeParaphraseAnalysis({
      ...FULL_ANALYSIS,
      subKeywords: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      gaps: ['1', '2', '3', '4', '5', '6'],
      mainKeyword: '가'.repeat(80),
    });

    expect(normalized?.subKeywords).toHaveLength(5);
    expect(normalized?.gaps).toHaveLength(5);
    expect(normalized?.mainKeyword.length).toBe(40);
  });

  it('클릭 이유도 키워드도 없으면 재료로 쓰지 않는다', () => {
    expect(normalizeParaphraseAnalysis({ skeleton: ['도입'] })).toBeNull();
    expect(normalizeParaphraseAnalysis('문자열')).toBeNull();
  });

  it('브리프는 상위호환 지점과 보존할 사실을 재료로 넘긴다', () => {
    const brief = buildParaphraseUpgradeBrief(normalizeParaphraseAnalysis(FULL_ANALYSIS));

    expect(brief).toContain('전환 후 첫 납입일이 밀리면 어떻게 되는지');
    expect(brief).toContain('9월 30일');
    expect(brief).toContain('주택청약통장 전환');
    expect(brief).toContain('원본 문장을 재배열하는 수준이면 실패다');
  });

  it('분석이 없으면 브리프는 비어 있어 기존 프롬프트가 그대로 나간다', () => {
    expect(buildParaphraseUpgradeBrief(null)).toBe('');
  });

  it('모델 호출이 실패해도 예외를 던지지 않는다 — 페러프레이징은 계속되어야 한다', async () => {
    const callModel = vi.fn().mockRejectedValue(new Error('OpenAI 500'));

    await expect(
      analyzeParaphraseSource({ callModel }, { title: '제목', body: '본문' }),
    ).resolves.toBeNull();
  });

  it('본문이 비면 모델을 아예 부르지 않는다', async () => {
    const callModel = vi.fn();

    await expect(analyzeParaphraseSource({ callModel }, { title: '제목', body: '   ' })).resolves.toBeNull();
    expect(callModel).not.toHaveBeenCalled();
  });
});

describe('페러프레이징 키워드 출처', () => {
  const source = readFileSync(
    join(__dirname, '..', 'renderer', 'modules', 'contentGeneration.ts'),
    'utf8',
  );

  it('분석 키워드를 우선 쓰고 제목 쪼개기는 폴백으로만 남긴다', () => {
    // 제목 첫 조각을 메인키워드로 삼던 방식은 "9월 30일 청약통장 전환 마감?" 에서
    // 메인키워드를 '9월' 로 만들었다(실측). 다시 1순위가 되지 못하게 잠근다.
    const analyzedIndex = source.indexOf('const analyzedKeywords');
    const fallbackIndex = source.indexOf('const paraphraseKeywords = analyzedKeywords.length > 0');

    expect(analyzedIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(analyzedIndex);
    expect(source).toContain('analyzeParaphraseSourceSafely');
  });
});
