import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';
import { checkVerdictStructure, describeVerdictStructure } from '../content/verdictStructure';

/**
 * [2026-09-06 R2] 관점 계약 — 사장님 기준: "도입에서 던진 문제를 끝까지 붙잡는 구성과
 * 분명한 관점", "제목의 공감을 본문이 끝까지 이어받아야 해".
 *
 * 레버는 스키마 필드다(산문 지시는 무시된다 — contentJsonPromptFormat.ts 머리말 실측).
 * 모델은 JSON 을 필드 순서대로 쓰므로, headings 앞에 finalVerdict 를 두면 소제목을 쓰기
 * 전에 판단을 먼저 세운다. 결론 계약은 모드별로 "finalVerdict 로 돌아온다"로 교체한다 —
 * 기존 "핵심 요약" 계약과 병기하면 모델은 둘 중 쉬운 요약을 고른다.
 *
 * V3 경로(contentQualityV3/prompt.ts)는 이 스키마를 타지 않으므로 이 계약의 대상이 아니다.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

function format(mode: string, categoryHint = '생활'): string {
  return buildContentJsonOutputFormat({
    contentMode: mode, mode, source: { categoryHint },
    title: '', rawText: '테스트 자료 본문', primaryKeyword: '테스트', subKeywords: '',
  } as never);
}

const MODES = ['seo', 'homefeed', 'mate', 'affiliate', 'business', 'custom'] as const;

describe('finalVerdict — 판단이 소제목보다 앞이다', () => {
  it.each(MODES)('%s 스키마에 finalVerdict 가 titleCandidates 뒤·headings 앞에 있다', (mode) => {
    const f = format(mode);
    const verdict = f.indexOf('"finalVerdict"');
    const titles = f.indexOf('"titleCandidates"');
    const headings = f.indexOf('"headings"');
    expect(verdict).toBeGreaterThan(-1);
    expect(verdict).toBeGreaterThan(titles);
    expect(verdict, 'LLM 은 필드 순서대로 생성한다').toBeLessThan(headings);
  });

  it.each(MODES)('%s 의 finalVerdict 는 preWritingAnalysis 밖(top-level)에 있다 — 설계 메모 금지 조항에 안 걸린다', (mode) => {
    const f = format(mode);
    const analysisEnd = f.indexOf('"selectedTitle"');
    expect(f.indexOf('"finalVerdict"')).toBeGreaterThan(analysisEnd);
  });

  it('finalVerdict 는 자료 근거·조건 분기·결론 복귀·라벨 금지를 한 자리에서 말한다', () => {
    const f = format('seo');
    const at = f.indexOf('"finalVerdict"');
    const field = f.slice(at, at + 400);
    expect(field).toMatch(/자료/);
    expect(field).toMatch(/조건/);
    expect(field).toMatch(/conclusion/);
    expect(field).toMatch(/라벨/);
  });
});

describe('결론 계약 — 모드별로 finalVerdict 로 돌아온다 (병기 아님, 교체)', () => {
  it.each(MODES)('%s 의 결론 계약이 finalVerdict 를 가리킨다', (mode) => {
    expect(format(mode)).toMatch(/(?:conclusion|결론)[^\n]{0,80}finalVerdict/);
  });

  it('요약 반복형 결론 계약("핵심 요약 2~3줄")은 남아 있지 않다', () => {
    for (const mode of MODES) expect(format(mode)).not.toContain('핵심 요약 2~3줄');
    expect(read('prompts/mate/base.prompt')).not.toContain('핵심 요약 2~3줄');
  });

  it('쇼핑의 가격·옵션·배송 확인 1회 안내와 홈판의 복합 CTA 금지는 유지된다', () => {
    expect(format('affiliate')).toContain('현재 가격·옵션·배송 조건 확인을 1회만 안내');
    expect(format('homefeed')).toContain('댓글·저장·공유를 동시에 요구하지 않는다');
  });

  it('메이트 라벨 금지에 "최종 판정" 꼴도 포함된다', () => {
    expect(format('mate')).toMatch(/"최종 판정"/);
  });
});

describe('구조 검사 — 경고만, 발행 차단 없음', () => {
  it('둘 다 있으면 ✅ 와 판단 미리보기', () => {
    const r = checkVerdictStructure({ finalVerdict: '  매일 쓰는 사람에게만 값을 한다  ', conclusion: '결국 …' });
    expect(r.issues).toEqual([]);
    expect(describeVerdictStructure(r)).toBe('[Verdict] ✅ 판단 "매일 쓰는 사람에게만 값을 한다"');
  });

  it('finalVerdict 가 없거나 결론이 비면 항목별로 경고한다', () => {
    const r = checkVerdictStructure({ conclusion: '' });
    expect(r.issues).toHaveLength(2);
    expect(describeVerdictStructure(r)).toMatch(/^\[Verdict\] ⚠️ finalVerdict 비어 있음.*conclusion 비어 있음/);
  });

  it('문자열이 아닌 finalVerdict 는 비어 있는 것으로 본다', () => {
    expect(checkVerdictStructure({ finalVerdict: { text: 'x' }, conclusion: 'y' }).issues).toHaveLength(1);
    expect(checkVerdictStructure(null).issues).toHaveLength(2);
  });

  it('긴 판단은 80자에서 자른다', () => {
    const long = '가'.repeat(100);
    expect(describeVerdictStructure(checkVerdictStructure({ finalVerdict: long, conclusion: 'y' }))).toContain(`${'가'.repeat(80)}…`);
  });
});

describe('배선 — runPostGenValidator 자리에서 로그와 __verdictStructure 를 남긴다', () => {
  const gen = read('contentGenerator.ts');
  it('logVerdictStructure 가 정의되고 runPostGenValidator 에서 호출된다', () => {
    expect(gen).toContain('function logVerdictStructure(content: any): void {');
    expect(gen).toMatch(/logTitleAnswer\(content, source\);\s*logVerdictStructure\(content\);/);
    expect(gen).toContain('(content as any).__verdictStructure = result;');
  });
  it('bodyPlain 조립은 headings 만 쓴다 — finalVerdict 가 본문으로 새는 경로가 없다', () => {
    expect(gen).not.toMatch(/bodyPlain[^\n]*finalVerdict/);
  });
});
