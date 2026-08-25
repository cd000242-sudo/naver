/**
 * [2026-08-26] SEO 브리핑 골격 — 사장님 실제 검색 유입 글 4편에서 추출한 형태.
 *
 * 그 글들은 앱이 아니라 LLM 챗봇으로 쓴 것인데 공통 골격이 뚜렷했다.
 *   글 맨 앞 사실 요약 표 → 날짜 앵커 도입부 → 전개 순서 소제목(인용 활용)
 *   → 중간 구조 표 → 시사점 마무리. 그리고 FAQ 가 하나도 없었다.
 *
 * 우리 SEO 는 정반대였다 — 요약 표를 강제하지 않고, ES-3 으로 FAQ 3~6개를 강제했다.
 * 근거가 이슈형(연예·시사)에서 나왔으므로 같은 카테고리에만 먼저 건다. 절차·비용
 * 글까지 넓히는 것은 효과를 실측한 뒤 결정한다.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildSystemPrompt } from '../promptLoader';

const ROOT = path.resolve(__dirname, '..');

describe('issue-brief 골격 파일', () => {
  const prompt = fs.readFileSync(path.join(ROOT, 'prompts/shared/issue-brief-structure.prompt'), 'utf-8');

  it('이슈형 고유 요소만 담는다 (요약 표·날짜 앵커는 헤더로 이사)', () => {
    expect(prompt).toContain('[IB-3]');
    expect(prompt).toContain('발단 → 전개 → 반박·쟁점 → 현재·전망');
    expect(prompt).toContain('[IB-4]');
    expect(prompt).toContain('[IB-5]');
    expect(prompt).toContain('시사점');
    // 중복 정의가 남아 있으면 두 파일이 서로 다른 말을 하게 된다.
    expect(prompt).not.toContain('[IB-1]');
    expect(prompt).not.toContain('[IB-2]');
    expect(prompt).toContain('[BRIEF-HEAD] 가 이미 요구한다');
  });

  it('FAQ 를 이 골격에서 제외하되 이슈형 한정임을 못박는다', () => {
    expect(prompt).toContain('[IB-6]');
    expect(prompt).toContain('FAQ 섹션이 하나도 없었다');
    expect(prompt).toContain('ES-3');
    // 절차·비용 글은 되묻는 주제라 FAQ 가 유효하다 — 여기까지 끄면 안 된다.
    expect(prompt).toContain('이슈형에만');
    expect(prompt).toContain('절차·비용·자격');
  });

  it('형태를 채우려고 사실을 만들지 말라고 못박는다', () => {
    expect(prompt).toContain('형태보다 사실이 먼저다');
  });

  it('ES 와 충돌하면 이 절이 우선한다고 명시한다', () => {
    expect(prompt).toMatch(/exposure-structure\(ES\).*이 절이 우선/s);
  });
});

describe('배선 — 이슈형 SEO 에만 얹는다', () => {
  it('연예·시사 SEO 에는 이슈 골격이 실린다', () => {
    for (const hint of ['entertainment', 'society']) {
      const prompt = buildSystemPrompt('seo', hint);
      expect(prompt, hint).toContain('[IB-3]');
      expect(prompt, hint).toContain('[BRIEF-HEAD]');
    }
  });

  it('실용 카테고리는 헤더만 받고 전개 순서 규칙은 안 받는다', () => {
    // 사장님 지적: 요약 표·날짜 앵커는 절차·비용 글에 오히려 더 맞는다.
    // 다만 "발단→해명→쟁점"은 여권 재발급 글에 성립하지 않으므로 이슈형에만 남긴다.
    for (const hint of ['tips', 'health', 'travel', 'general']) {
      const prompt = buildSystemPrompt('seo', hint);
      expect(prompt, hint).toContain('[BRIEF-HEAD]');
      expect(prompt, hint).toContain('| 구분 | 내용 |');
      expect(prompt, hint).not.toContain('[IB-3]');
      expect(prompt, hint).not.toContain('[IB-6]');
    }
  });

  it('홈판에는 얹지 않는다 (홈판은 issue-story 골격이 따로 있다)', () => {
    const prompt = buildSystemPrompt('homefeed', 'entertainment');
    expect(prompt).not.toContain('[IB-3]');
    expect(prompt).toContain('[ISSUE-STORY]'); // 홈판은 자기 골격 유지 // 홈판은 자기 골격 유지
  });

  it('소제목 스펙 뒤에 와서 전개 순서 규칙이 마지막 말을 갖는다', () => {
    const prompt = buildSystemPrompt('seo', 'entertainment');
    const headingSpecAt = prompt.indexOf('[HEADINGS: SEO]');
    const briefAt = prompt.indexOf('[IB-3]');
    expect(headingSpecAt).toBeGreaterThan(-1);
    expect(briefAt).toBeGreaterThan(headingSpecAt);
  });

  it('FAQ 를 강제하던 ES-3 보다 뒤에 온다 (IB-6 가 이겨야 한다)', () => {
    const prompt = buildSystemPrompt('seo', 'entertainment');
    expect(prompt.indexOf('[IB-6]')).toBeGreaterThan(prompt.indexOf('[ES-3]'));
  });
});

/**
 * [2026-08-26 사장님 지적으로 분리] "실용 카테고리도 구조를 똑같이 해야 하지 않나?"
 *
 * 맞는 지적이었다. 다만 전부는 아니다.
 *   요약 표·날짜 앵커 → 절차·비용 글에 **오히려 더** 맞는다(신청 조건·요금·기준일).
 *   전개 순서 소제목  → "여권 재발급 방법"에 발단·해명이 없다. 이슈형에만.
 *   FAQ 배제         → 절차·자격은 실제로 되묻는 주제라 FAQ 가 유효하다. 이슈형에만.
 * 그래서 앞 둘만 fact-brief-header 로 떼어내 전 카테고리에 건다.
 */
describe('fact-brief-header — 주제를 가리지 않는 첫 화면', () => {
  const header = fs.readFileSync(path.join(ROOT, 'prompts/shared/fact-brief-header.prompt'), 'utf-8');

  it('요약 표와 날짜 앵커 둘만 담는다', () => {
    expect(header).toContain('[BH-1]');
    expect(header).toContain('[BH-2]');
    expect(header).toContain('| 구분 | 내용 |');
    expect(header).toContain('YYYY년 M월 D일 기준,');
  });

  it('라벨을 주제별로 짓게 안내한다 (기계적 반복 방지)', () => {
    expect(header).toContain('주제에 맞게 직접 짓는다');
    for (const axis of ['당사자 / 쟁점', '대상 / 신청 기간', '기본 요금', '후보 / 갈리는 지점']) {
      expect(header, axis).toContain(axis);
    }
  });

  it('표가 본문을 대신하지 못하게 막는다', () => {
    expect(header).toContain('표는 입구이고');
    expect(header).toContain('확인되지 않은 칸은 만들지 않는다');
    expect(header).toContain('같은 라벨');
  });

  it('날짜 앵커의 이유를 남긴다 (정책·요금은 바뀐다)', () => {
    expect(header).toContain('언제 기준인지가 그 자체로 정보다');
  });

  it('mate 모드도 함께 받는다', () => {
    expect(buildSystemPrompt('mate', 'tips')).toContain('[BRIEF-HEAD]');
  });

  it('홈판에는 얹지 않는다 (피드는 표로 읽지 않는다)', () => {
    expect(buildSystemPrompt('homefeed', 'entertainment')).not.toContain('[BRIEF-HEAD]');
  });
});
