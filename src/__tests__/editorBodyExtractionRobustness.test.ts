/**
 * 발행 단계 본문 유실 회귀 가드 (v2.11.134 배치).
 *
 * 사용자 보고 "누락" 3대 원인 잠금:
 *  1) 균등분배 산식 — ceil 기반 start가 배열을 넘어 뒤쪽 소제목이 빈 본문으로 발행.
 *  2) 마무리 중복 정리 — 범용 담화 표지("마지막으로" 등)가 든 본문 중간 문단을 통째 삭제.
 *  3) unwantedPhrases — 문구가 든 줄 전체 삭제(1줄=1문단 모바일 형식에서 문단 증발).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { extractBodyForHeading, sliceBalancedUnits } from '../automation/editorHelpers';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const self = { log: () => undefined } as any;

describe('sliceBalancedUnits — 균등분배 산식', () => {
  it('units >= headings이면 모든 소제목이 빈 청크 없이 전체를 순서대로 커버한다', () => {
    const units = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      const chunk = sliceBalancedUnits(units, i, 7);
      expect(chunk.length, `heading ${i} chunk`).toBeGreaterThan(0);
      seen.push(...chunk);
    }
    expect(seen).toEqual(units);
  });

  it('units < headings이면 앞쪽 소제목부터 1개씩 배정한다 (전부 앞으로 몰림 방지)', () => {
    const units = ['a', 'b', 'c'];
    expect(sliceBalancedUnits(units, 0, 5)).toEqual(['a']);
    expect(sliceBalancedUnits(units, 1, 5)).toEqual(['b']);
    expect(sliceBalancedUnits(units, 2, 5)).toEqual(['c']);
    expect(sliceBalancedUnits(units, 3, 5)).toEqual([]);
    expect(sliceBalancedUnits(units, 4, 5)).toEqual([]);
  });
});

describe('extractBodyForHeading — 균등분배 폴백에서 뒤쪽 소제목 공백 차단', () => {
  it('문단 10개 · 소제목 7개: 모든 소제목이 비어있지 않은 본문을 받는다', () => {
    const paragraphs = Array.from(
      { length: 10 },
      (_, i) => `문단 ${i + 1}의 내용입니다. 실제 정보가 들어있는 충분히 긴 문단입니다.`,
    );
    const fullBody = paragraphs.join('\n\n');
    // 소제목 제목이 본문에 전혀 없음 → 매칭 실패 → 균등분배 폴백 경로
    const headings = Array.from({ length: 7 }, (_, i) => ({ title: `본문에없는소제목${i}` }));
    for (let i = 0; i < 7; i++) {
      const out = extractBodyForHeading(self, fullBody, headings[i].title, i, 7, headings);
      expect(out.trim().length, `소제목 ${i + 1} 본문`).toBeGreaterThan(0);
    }
  });
});

describe('extractBodyForHeading — 마무리 정리가 본문 중간을 지우지 않는다', () => {
  // allHeadings 없이 "제목: 내용" 형식 → 정리 블록이 실행되는 경로(path2)
  it('본문 중간의 "마지막으로 ..." 안내 줄은 마무리 중복 정리에서 살아남는다', () => {
    const fullBody = [
      '신청 방법: 준비물부터 확인하세요.',
      '주민센터 방문 전에 신분증과 등본을 챙기세요.',
      '마지막으로 접수 마감 시간은 평일 오후 6시입니다.',
      '접수가 끝나면 문자로 결과 안내를 받게 됩니다.',
      '오늘 정리한 내용으로 글을 마칩니다.',
      '다음에 또 만나요.',
    ].join('\n');
    const out = extractBodyForHeading(self, fullBody, '신청 방법', 0, 1, undefined);
    expect(out).toContain('마감 시간은 평일 오후 6시');
    expect(out).toContain('문자로 결과 안내');
  });

  it('"도움이 되었으면" 문구가 문장 끝에 붙은 정보 줄은 문구만 제거되고 정보는 남는다', () => {
    const fullBody = [
      '환급 절차: 순서대로 진행하면 됩니다.',
      '국세청 홈택스에서 환급 계좌를 먼저 등록해야 하는데, 도움이 되었으면 합니다.',
      '등록 다음 날부터 조회가 가능합니다.',
    ].join('\n');
    const out = extractBodyForHeading(self, fullBody, '환급 절차', 0, 1, undefined);
    expect(out).toContain('환급 계좌를 먼저 등록');
    expect(out).not.toContain('도움이 되었으면');
  });

  it('순수 마무리 상투구 줄은 여전히 삭제된다 (기존 정리 의도 보존)', () => {
    const fullBody = [
      '정리 팁: 핵심만 남기세요.',
      '라벨을 붙여두면 다음에 찾기 쉽습니다.',
      '이 정보가 도움이 되셨기를 바랍니다.',
    ].join('\n');
    const out = extractBodyForHeading(self, fullBody, '정리 팁', 0, 1, undefined);
    expect(out).toContain('라벨을 붙여두면');
    expect(out).not.toContain('도움이 되셨기를');
  });
});

describe('정적 잠금 — 유실 유발 패턴 제거 확인', () => {
  const code = read('automation/editorHelpers.ts');

  it('마무리 상투구 목록에 범용 담화 표지가 없다 (마지막으로/끝으로/정리하면/요약하면)', () => {
    const listBlocks = code.match(/const SECTION_CLOSING_DEDUP_PATTERNS: RegExp\[\] = \[[\s\S]*?\];/g) || [];
    expect(listBlocks.length).toBe(1);
    for (const block of listBlocks) {
      expect(block).not.toMatch(/\/마지막으로\/gi/);
      expect(block).not.toMatch(/\/끝으로\/gi/);
      expect(block).not.toMatch(/\/정리하면\/gi/);
      expect(block).not.toMatch(/\/요약하면\/gi/);
    }
    // 인라인 사본이 부활하지 않도록 잠금 — 정리는 공유 헬퍼 한 곳에서만.
    expect(code).not.toMatch(/const closingPatterns = \[/);
    expect(code).not.toMatch(/const unwantedPhrases = \[/);
  });

  it('마무리 소제목 오염 제거의 하드코딩 트리거(코스트코 hack)와 전량삭제 루프가 없다', () => {
    expect(code).not.toMatch(/마무리\\s\*:\.\*코스트코/);
    expect(code).not.toMatch(/hasClosingContent \|\| foundClosingTitle/);
  });

  it('균등분배 5개 지점이 전부 sliceBalancedUnits를 사용한다 (ceil 산식 잔존 금지)', () => {
    expect(code).not.toMatch(/Math\.ceil\(lines\.length \/ headings\.length\)/);
    expect(code).not.toMatch(/Math\.ceil\(allLines\.length \/ headings\.length\)/);
    expect(code).not.toMatch(/Math\.ceil\(sentences\.length \/ headings\.length\)/);
    expect(code).not.toMatch(/Math\.ceil\(sentences\.length \/ totalHeadings\)/);
    expect(code).not.toMatch(/Math\.ceil\(paragraphs\.length \/ totalHeadings\)/);
    const uses = code.match(/sliceBalancedUnits(\(|<)/g) || [];
    // 정의 1 + 사용 6 (909/1697/1721/1796/3420/3433 지점)
    expect(uses.length).toBeGreaterThanOrEqual(7);
  });

  it('깨진 제목 제거 정규식(공백 낀 \\s * 패턴)이 없다', () => {
    expect(code).not.toContain('^\\\\s * ${escapedTitleForRegex}');
  });
});
