import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { evaluateTitleQuality } from '../contentTitleEvaluator';
import { removeDuplicatePhrases } from '../contentTitleDuplicateRemoval';
import {
  cleanupColonQuotePattern,
  cleanupStartingTitleTokens,
  cleanupTrailingTitleTokens,
  sanitizeTitleSpecialChars,
  stripOptionCombo,
  stripStoreTagBrackets,
} from '../contentTitleHelpers';

/**
 * [2026-09-02 사장님: "글을 잘 적는 것도 중요한데 문제는 팔려야 되잖아"]
 *
 * 19:05 닥터웰 실측 — 모델 후보 3개:
 *   1) 닥터웰 종아리 공기압 마사지기 닥터웰 종아리 마사지기 DR-5180 그레이 본체+다리, 설명서 소음 후기 (58자, selectedTitle)
 *   2) 닥터웰 에어웨이브 DR-5180 공기압 마사지기, 종아리 압박 위치 후기 (40자, 구매 축 있음)
 *   3) 닥터웰 종아리 공기압 마사지기 닥터웰 DR-5180 다리 마사지기, 유선 착용과 보관에서 볼 부분
 * 게이트는 1번만 보고 고쳐 써서 "…그레이 본체+다리, 설명서 소음 후기"(95점) 를 내보냈다. 2번은 버려졌다.
 * 고치는 규칙: 고쳐 쓰기 전에 후보를 같은 잣대로 채점해 최고점을 고른다. 구매 축 없는 제목은 크게 깎는다.
 */
const KW = '닥터웰 종아리 마사지기';
const REPAIRED_1 = '닥터웰 종아리 공기압 마사지기 DR-5180 그레이 본체+다리, 설명서 소음 후기';
const CAND_2 = '닥터웰 에어웨이브 DR-5180 공기압 마사지기, 종아리 압박 위치 후기';

describe('쇼핑 제목 채점 — 구매 축이 있는 후보가 상품명 나열을 이긴다', () => {
  it('실측 후보 2번이 고쳐 쓴 1번보다 높다', () => {
    const repaired = evaluateTitleQuality(REPAIRED_1, KW, 'affiliate' as never);
    const cand2 = evaluateTitleQuality(CAND_2, KW, 'affiliate' as never);
    expect(cand2.score).toBeGreaterThan(repaired.score);
    expect(repaired.issues.join(' ')).toMatch(/옵션·스토어 꼬리표|옵션 조합/u);
    expect(cand2.issues.join(' ')).not.toMatch(/옵션·스토어 꼬리표|옵션 조합/u);
  });

  it('구매 축 없는 쇼핑 제목은 -30 — 95점으로 통과하던 상품명 나열이 더는 안 된다', () => {
    const bare = evaluateTitleQuality('닥터웰 종아리 마사지기 DR-5180 그레이 본체+다리', KW, 'affiliate' as never);
    expect(bare.issues.join(' ')).toMatch(/구매 축 없음/u);
    expect(bare.score).toBeLessThanOrEqual(70);
  });
});

describe('배선: 최종 게이트는 고쳐 쓰기 전에 후보 최고점을 고른다', () => {
  const src = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8').replace(/\r/g, '');
  const gateAt = src.indexOf('[FinalQualityGate] ⚠️ 최종 제목 품질 미달');
  const gate = src.slice(gateAt, gateAt + 4500);

  it('후보를 같은 잣대로 채점해 최고점을 고르고, 후보가 전부 미달일 때만 고쳐 쓴다', () => {
    expect(gate).toMatch(/finalContent\.titleCandidates/u);
    expect(gate).toMatch(/bestCandidate\.score >= 50 && bestCandidate\.score > finalCheck\.score/u);
    expect(gate).toContain('후보 중 최고점 선택');
    // 고쳐 쓰기(복구)는 후보 선택이 안 됐을 때의 else 가지다
    expect(gate.indexOf('후보 중 최고점 선택')).toBeLessThan(gate.lastIndexOf('repair-title-after-quality-gate'));
  });

  /**
   * [2026-09-06 사장님: "특히 쇼핑모드로 제목을 생성해줄때가 문제야"] 닥터웰 2차 실측.
   * 모델 선택 "…DR-5180, 운동 후 다리 부종 관리로 써보니"(= 소제목 1·도입·판단·결론의 축)가
   * 키워드 중복(-40/-30)으로 0점 → 게이트가 후보 "착용 방식과 압박감은"(55점)으로 갈아탐 → TitlePayoff 40%.
   * 같은 제목을 제자리 수리 사슬에 넣으면 0 → 70점, 약속은 그대로다. 쇼핑은 후보로 가기 전에
   * 제자리 수리를 먼저 본다 — 수리본이 50 이상이면 그걸로 끝. 후보 최고점·고쳐 쓰기는 그 뒤다.
   */
  it('쇼핑은 후보 교체 전에 제자리 수리를 먼저 본다 — 약속 보존', () => {
    const rescueAt = gate.indexOf('제자리 수리로 통과');
    expect(rescueAt).toBeGreaterThan(0);
    expect(rescueAt).toBeLessThan(gate.indexOf('후보 중 최고점 선택'));
    expect(gate.slice(0, rescueAt)).toMatch(/finalMode === 'affiliate'[\s\S]{0,300}removeDuplicatePhrasesFromTitle\(/u);
    expect(gate.slice(0, rescueAt)).toMatch(/rescuedCheck\.score >= 50/u);
  });
});

describe('[2026-09-06 닥터웰 2차] 제자리 수리가 모델 선택을 바닥(50) 위로 올린다', () => {
  const PICKED = '다리 공기압 마사지기 닥터웰 공기압 마사지기 DR-5180, 운동 후 다리 부종 관리로 써보니';

  it('중복 키워드 제거만으로 0점 → 50점 이상, 구매 질문("운동 후 부종 관리")은 남는다', () => {
    const before = evaluateTitleQuality(PICKED, '다리 공기압 마사지기', 'affiliate' as never);
    expect(before.score).toBeLessThan(50);
    const rescued = removeDuplicatePhrases(
      cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(
        stripOptionCombo(stripStoreTagBrackets(sanitizeTitleSpecialChars(PICKED))),
      ))),
    ).trim();
    const after = evaluateTitleQuality(rescued, '다리 공기압 마사지기', 'affiliate' as never);
    expect(after.score).toBeGreaterThanOrEqual(50);
    expect(rescued).toContain('운동 후');
    expect(rescued).toContain('부종 관리');
  });
});

describe('[2026-09-03 헬스헬퍼] 쇼핑 제목을 망가뜨리던 두 단계', () => {
  const src = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8').replace(/\r/g, '');

  it('상품명 접두(45자 자르기)는 쇼핑에서 돌지 않는다 — 검색어 앞 배치가 대신한다', () => {
    const at = src.indexOf('isReviewArticleType(source?.articleType)');
    expect(src.slice(at, at + 700)).toMatch(/&& source\.contentMode !== 'affiliate'/u);
  });

  it('상품명≈키워드 조기 반환이 없다 — 게이트는 늘 돈다', () => {
    const fn = src.slice(src.indexOf('export function finalizeStructuredContent'), src.indexOf('[FinalQualityGate] ⚠️ 최종 제목 품질 미달'));
    expect(fn).not.toContain('return earlyContent;');
    expect(fn).toMatch(/skipKeywordPrefix = source\.contentMode !== 'affiliate';/u);
    expect(fn).toMatch(/if \(!skipKeywordPrefix\) \{/u);
  });
});
