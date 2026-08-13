/**
 * [2026-08-14] 소제목 모드 최적화 회귀 잠금.
 *
 * 문제: seo/base.prompt와 homefeed/base.prompt의 소제목 규칙이 사실상 같았다
 * ("각 소제목은 하위 질문 하나를 맡고 첫 1~2문장에 답한다"). 두 모드의 독자는
 * 정반대로 도착하는데(검색 질의 vs 피드 스크롤) 소제목은 서로 바꿔 써도 될 만큼
 * 균질했다. shared/strong-headings.prompt는 존재하지만 어느 경로에서도 로드되지
 * 않는 죽은 파일이라 커버가 안 됐다.
 *
 * 이 테스트가 잠그는 것:
 *   1. 모드별 소제목 스펙이 실제로 주입되고, 서로 교차 오염되지 않는다
 *   2. 스펙이 개수 강제·템플릿 강제로 퇴행하지 않는다 (근거우선 계약과 충돌 방지)
 *   3. 홈판에는 검색어 접두를 강제하지 않는다 (프롬프트 + 후처리 양쪽)
 *   4. 에이전트 모드 자기비평에도 모드별 소제목 기준이 실린다
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from '../promptLoader';
import { applyHeadingKeywordPatch, resolveHeadingKeywordPatchMax } from '../contentHeadingKeywordPatch';
import { wrapAsAgenticTask } from '../agentCli/agenticEnvelope';

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');

describe('소제목 스펙 파일', () => {
  const seo = read('prompts/shared/headings-seo.prompt');
  const homefeed = read('prompts/shared/headings-homefeed.prompt');

  it('SEO 스펙은 소제목을 질의 색인으로 정의한다', () => {
    expect(seo).toContain('[HEADINGS: SEO]');
    expect(seo).toContain('질의 축');
    expect(seo).toContain('목차');
    // 답을 미루는 훅은 홈판 장치이지 검색 유입 장치가 아니다.
    expect(seo).toContain('정체 숨김');
  });

  it('홈판 스펙은 소제목을 흐름 표지로 정의하고 검색어 접두를 금지한다', () => {
    expect(homefeed).toContain('[HEADINGS: 홈판]');
    expect(homefeed).toContain('흐름 표지');
    expect(homefeed).toContain('상황 → 갈림길 → 판단');
    expect(homefeed).toContain('검색어를 소제목 앞에 접두로 붙이지 않는다');
  });

  it('두 스펙 모두 개수·템플릿을 강제하지 않는다 (근거우선 계약 보존)', () => {
    for (const [label, prompt] of [['seo', seo], ['homefeed', homefeed]] as const) {
      expect(prompt, label).toContain('소제목 개수는 정보량에 맞춘다');
      // "정확히 N개", "반드시 N개" 류의 고정 개수 강제가 되살아나면 안 된다.
      expect(prompt, label).not.toMatch(/(정확히|반드시)\s*\d+\s*개/);
      // 모든 소제목에 감정축·1인칭을 의무화하던 옛 SECTION SH 방식 회귀 차단.
      expect(prompt, label).not.toMatch(/감정축|1인칭 경험 흔적/);
    }
  });
});

describe('모드별 주입 — 교차 오염 없음', () => {
  it('SEO 모드에는 SEO 스펙만 들어간다', () => {
    const prompt = buildSystemPrompt('seo', 'general');
    expect(prompt).toContain('[HEADINGS: SEO]');
    expect(prompt).not.toContain('[HEADINGS: 홈판]');
  });

  it('홈판 모드에는 홈판 스펙만 들어간다', () => {
    const prompt = buildSystemPrompt('homefeed', 'general');
    expect(prompt).toContain('[HEADINGS: 홈판]');
    expect(prompt).not.toContain('[HEADINGS: SEO]');
  });

  it('홈판 이슈형(연예·시사)은 스토리 골격이 소제목 스펙보다 뒤에 온다', () => {
    const prompt = buildSystemPrompt('homefeed', 'entertainment');
    const headingAt = prompt.indexOf('[HEADINGS: 홈판]');
    // 카테고리 프롬프트가 "[ISSUE-STORY] 골격이 뒤따른다"고 먼저 언급하므로
    // 골격 파일의 헤더 문구로 실제 주입 지점을 찾는다.
    const issueStoryAt = prompt.indexOf('[ISSUE-STORY] 이슈·인물·시사 전용 골격');
    expect(headingAt).toBeGreaterThan(-1);
    expect(issueStoryAt).toBeGreaterThan(-1);
    // 이슈형은 소제목 0~3개 서사형이라 스토리 골격이 마지막 말을 가져야 한다.
    expect(issueStoryAt).toBeGreaterThan(headingAt);
  });

  it('자체 소제목 계약이 있는 모드에는 공용 스펙을 주입하지 않는다', () => {
    for (const mode of ['mate', 'business', 'affiliate'] as const) {
      const prompt = buildSystemPrompt(mode, 'general');
      expect(prompt, mode).not.toContain('[HEADINGS: SEO]');
      expect(prompt, mode).not.toContain('[HEADINGS: 홈판]');
    }
  });
});

describe('소제목 키워드 접두 — 모드별 분기', () => {
  it('검색 모드는 접두를 유지하고 홈판만 끈다', () => {
    expect(resolveHeadingKeywordPatchMax('seo')).toBe(2);
    expect(resolveHeadingKeywordPatchMax('mate')).toBe(2);
    expect(resolveHeadingKeywordPatchMax('homefeed')).toBe(0);
  });

  it('홈판(max 0)은 접두를 붙이지 않지만 정리 패스는 계속 돈다', () => {
    const headings = [
      { title: '제습기에게 물어본 하루 전기세' },
      { title: '장마철에 하루 종일 돌려도 되나' },
    ];

    const homefeedResult = applyHeadingKeywordPatch(headings, '제습기 전기세', {
      maxPatches: resolveHeadingKeywordPatchMax('homefeed'),
    });
    expect(homefeedResult.patchedCount).toBe(0);
    // 접두는 안 붙지만 "제습기에게" 대상 조사 prefix 제거는 그대로 동작해야 한다.
    expect(homefeedResult.targetPrefixCleanedCount).toBe(1);
    expect(homefeedResult.headings[0].title).toBe('물어본 하루 전기세');
    expect(homefeedResult.headings[1].title).toBe('장마철에 하루 종일 돌려도 되나');

    const seoResult = applyHeadingKeywordPatch(headings, '제습기 전기세', {
      maxPatches: resolveHeadingKeywordPatchMax('seo'),
    });
    expect(seoResult.patchedCount).toBeGreaterThan(0);
  });
});

describe('에이전트 모드 자기비평', () => {
  it('홈판 에이전트는 검색어 접두 소제목을 스스로 잡는다', () => {
    const wrapped = wrapAsAgenticTask('[작업 명세 본문]', 'homefeed');
    expect(wrapped).toContain('검색어를 앞에 접두로 박은 소제목이 0건인가');
    expect(wrapped).toContain('상황 → 갈림길 → 판단');
  });

  it('SEO 에이전트는 질의 축 분배와 목차성을 스스로 잡는다', () => {
    const wrapped = wrapAsAgenticTask('[작업 명세 본문]', 'seo');
    expect(wrapped).toContain('서로 다른 질의 축');
    expect(wrapped).toContain('그 검색어의 목차가 되는가');
  });

  it('모드별 소제목 기준이 서로 섞이지 않는다', () => {
    expect(wrapAsAgenticTask('x', 'seo')).not.toContain('상황 → 갈림길 → 판단');
    expect(wrapAsAgenticTask('x', 'homefeed')).not.toContain('그 검색어의 목차가 되는가');
  });
});
