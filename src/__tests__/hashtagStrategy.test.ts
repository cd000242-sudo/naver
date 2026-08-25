/**
 * [2026-08-26] 해시태그 전략 — 실측 유입 글에서 뽑은 두 층 구조.
 *
 * 지금까지 해시태그에는 전략이 아무 데도 없었다. 스키마에 자리 5개와
 * "개수를 채우지 마라" 한 줄이 전부였고, 어떻게 만들지는 아무도 말해주지 않았다.
 *
 * 실측한 유입 글들은 단일어 + 조합 롱테일 두 층을 쓰고 있었다.
 *   사장님 SEO 글: #김병지 #박문성 + #김병지아들 #김병지칸쿤 #박문성김병지
 *   벤치마크(나솔): #나는솔로33기영숙직업 #나는솔로33기영숙센터장 #강남웰니스센터
 * 2층(조합)이 없으면 검색어와 겹칠 면이 그만큼 좁다.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildSystemPrompt } from '../promptLoader';

const ROOT = path.resolve(__dirname, '..');

describe('hashtag-strategy 파일', () => {
  const prompt = fs.readFileSync(path.join(ROOT, 'prompts/shared/hashtag-strategy.prompt'), 'utf-8');

  it('두 층(핵심어 + 조합 롱테일)을 요구한다', () => {
    expect(prompt).toContain('[HT-1]');
    expect(prompt).toContain('1층(핵심어)');
    expect(prompt).toContain('2층(조합 롱테일)');
    expect(prompt).toContain('2층이 없으면');
  });

  it('실측에서 뽑은 조합 예시를 담는다', () => {
    expect(prompt).toContain('#김병지칸쿤');
    expect(prompt).toContain('#나는솔로33기영숙직업');
  });

  it('모드별 개수를 가른다 (홈판은 태그로 들어오지 않는다)', () => {
    expect(prompt).toContain('[HT-2]');
    expect(prompt).toMatch(/SEO·정보성: 10~15개/);
    expect(prompt).toMatch(/홈판·피드: 3~7개/);
    expect(prompt).toMatch(/쇼핑: 8~12개/);
  });

  it('붙여쓰기와 변형 부풀리기 금지를 명시한다', () => {
    expect(prompt).toContain('띄어쓰기 없이 붙여 쓴다');
    expect(prompt).toContain('같은 말의 변형으로 개수를 부풀리지 않는다');
  });

  it('태그도 본문과 같은 사실 기준을 받는다', () => {
    expect(prompt).toContain('자료에 없는 인물·브랜드·사건을 태그로 만들지 마라');
    expect(prompt).toContain('무관한 유입은 이탈로 끝나고');
  });
});

describe('배선 — 콘텐츠 모드 전반', () => {
  it('seo·homefeed·mate·affiliate 에 실린다', () => {
    for (const mode of ['seo', 'homefeed', 'mate', 'affiliate'] as const) {
      expect(buildSystemPrompt(mode, 'entertainment'), mode).toContain('[HASHTAG]');
    }
  });

  it('이슈형 SEO 는 브리핑 골격과 해시태그 전략을 함께 받는다', () => {
    const prompt = buildSystemPrompt('seo', 'entertainment');
    expect(prompt).toContain('[IB-3]');   // 이슈 골격 (요약 표는 [BRIEF-HEAD] 로 이사)
    expect(prompt).toContain('[HT-1]');
  });

  it('홈판은 자기 골격을 유지하면서 해시태그만 더 받는다', () => {
    const prompt = buildSystemPrompt('homefeed', 'entertainment');
    expect(prompt).toContain('[ISSUE-STORY]');
    expect(prompt).toContain('[HT-2]');
    expect(prompt).not.toContain('[IB-1]');
  });
});
