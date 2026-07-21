/**
 * [v2.11.136] URL 원본 빈약 시 심화 보강 회귀 잠금.
 *
 * 사용자 보고: URL로 생성 시 원본이 짧으면 결과도 빈약. URL 모드는 "원본
 * 100% 보존 + 부풀리지 말 것"이라, 확장 근거가 없어 안전하게 빈약해진다.
 * 사용자 선택 "빈약할 때만 자동 보강": baseBody < 1500자이고 보충 가능한
 * URL(네이버블로그/스토어 제외)이면 상위글 풀텍스트를 보조 자료로 덧붙인다.
 * 원본은 1순위 유지, 보충은 실제 크롤링이라 환각 없음.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('URL 빈약 원본 심화 보강 배선', () => {
  const src = read('sourceAssembler.ts');

  it('임계(1500자) 미만 + 보충 가능 URL일 때 상위글 풀텍스트를 수집한다', () => {
    expect(src).toMatch(/URL_THIN_SUPPLEMENT_THRESHOLD = 1500/);
    expect(src).toContain('const hasSupplementableUrl');
    expect(src).toMatch(/collectTopArticleFullTexts\(supplementQuery, naverClientId, naverClientSecret\)/);
    // 보강 실행 조건이 hasSupplementableUrl로 게이트됨
    expect(src).toMatch(/if \(\s*hasSupplementableUrl/);
  });

  it('네이버 블로그/스마트스토어 URL은 보강 제외(단일 원본 충실도)', () => {
    expect(src).toMatch(/hasSupplementableUrl\s*=[\s\S]{0,200}!urlPatterns\.some\(\(u\) => \/blog\\\.naver\\\.com\/i\.test\(u\)\)[\s\S]{0,60}!isNaverStoreUrl/);
  });

  it('원본이 충분(>=1500)하면 보강하지 않는다 (빈약할 때만)', () => {
    // 하한 500 + 상한 1500 범위 조건이 명시돼 있어야 한다.
    expect(src).toMatch(/baseBody\.length >= 500\s*&&\s*baseBody\.length < URL_THIN_SUPPLEMENT_THRESHOLD/);
  });

  it('보충 실패는 원본으로 계속 진행 (발행 무중단)', () => {
    expect(src).toMatch(/URL 심화보강\] 실패[\s\S]{0,40}원본으로 진행/);
  });

  it('보충 자료는 "참고 자료"로 명확히 구분돼 원본과 섞이지 않음', () => {
    expect(src).toMatch(/참고 자료 \(관련 상위글/);
  });
});
