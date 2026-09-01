import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  EXPERIENCE_CATEGORY_HINTS,
  buildKinAnswerBlock,
  isExperienceCategory,
} from '../content/kinExperienceMaterial.js';
import { ARTICLE_TYPE_TO_HINT } from '../shared/categoryTaxonomy.js';

/**
 * [2026-09-01] 경험 재료의 문이 정작 경험이 필요한 곳에서 닫혀 있었다.
 *
 * 사장님이 뽑아 보여준 비염 글은 '건강' 이라 이 파이프가 한 번도 돌지 않았다.
 * 상품리뷰('쇼핑')도 마찬가지였다 — "써보니 이렇더라" 가 전부인 자리에서
 * 겪은 사람 말을 한 줄도 넣지 않았다. 모델에게 남은 선택지는 지어내기뿐이다.
 *
 * 문을 열되, 그 답변을 그대로 믿으면 위험한 세 축에는 경고를 함께 실어 보낸다.
 * 기존 헤더는 "남의 경험을 내 것으로 바꾸지 마라"를 막고,
 * CATEGORY_CAUTION 은 "그 답변 자체를 사실로 믿지 마라"를 막는다 — 다른 층이다.
 */

const SAMPLE = [
  '비염이 심하시면 습도를 50% 근처로 두시는 게 낫습니다. 너무 높이면 곰팡이가 생겨서 오히려 나빠지는 경우가 많습니다.',
  '가습기는 종류보다 청소 주기가 훨씬 중요합니다. 일주일을 넘기면 물통 안쪽에 물때가 끼고, 그 상태로 틀면 그대로 들이마시게 되니 주 1회는 꼭 닦으시는 게 좋습니다.',
];

describe('경험 재료 게이트 — 열려야 할 축', () => {
  it.each([['건강'], ['쇼핑'], ['자동차'], ['스포츠']])(
    '%s 은 경험군이다 — 겪은 사람 말이 판단의 재료인 주제',
    (hint) => {
      expect(isExperienceCategory(hint)).toBe(true);
    },
  );

  it('비염 글이 타는 경로가 실제로 열린다 (health → 건강 → 게이트 통과)', () => {
    expect(ARTICLE_TYPE_TO_HINT.health).toBe('건강');
    expect(isExperienceCategory(ARTICLE_TYPE_TO_HINT.health)).toBe(true);
  });

  it('상품리뷰 글이 타는 경로가 실제로 열린다 (shopping_review → 쇼핑)', () => {
    expect(ARTICLE_TYPE_TO_HINT.shopping_review).toBe('쇼핑');
    expect(isExperienceCategory(ARTICLE_TYPE_TO_HINT.shopping_review)).toBe(true);
  });
});

describe('경험 재료 게이트 — 닫아 둔 축은 그대로', () => {
  it.each([['사회'], ['경제'], ['연예'], ['IT'], ['영화'], ['드라마']])(
    '%s 은 경험군이 아니다 — 겪은 사람 말보다 확인된 사실이 앞선다',
    (hint) => {
      expect(isExperienceCategory(hint)).toBe(false);
    },
  );

  it('모든 경험군 힌트는 택소노미가 실제로 발급하는 값이다 (죽은 문 방지)', () => {
    const issued = new Set(Object.values(ARTICLE_TYPE_TO_HINT));
    for (const hint of EXPERIENCE_CATEGORY_HINTS) {
      expect(issued.has(hint), `"${hint}" 는 아무 글 종류도 발급하지 않는다 — 문이 죽어 있다`).toBe(true);
    }
  });
});

describe('안전선 — 답변을 그대로 믿으면 위험한 축', () => {
  it('건강: 의료인이 아니라는 사실과 병원 확인 안내가 재료에 함께 실린다', () => {
    const block = buildKinAnswerBlock(SAMPLE, '건강');
    expect(block).toContain('의료인이 아닌 일반인');
    expect(block).toContain('병원에서 확인하세요');
    expect(block).toContain('진단 · 치료 · 복용량 · 효과를 사실로 옮기지 마세요');
  });

  it('쇼핑: 홍보성 답변 경고와 "조건만 가져와라" 지시가 실린다', () => {
    const block = buildKinAnswerBlock(SAMPLE, '쇼핑');
    expect(block).toContain('홍보성 답변');
    expect(block).toContain('제품명 · 업체명 추천은 근거로 쓰지 말고');
  });

  it('자동차: 차종·연식 차이와 정비소 확인 안내가 실린다', () => {
    const block = buildKinAnswerBlock(SAMPLE, '자동차');
    expect(block).toContain('차종과 연식');
    expect(block).toContain('정비소에서 확인할 지점');
  });

  it('위험하지 않은 축에는 군더더기를 붙이지 않는다', () => {
    for (const hint of ['육아', '여행', '요리', '스포츠', undefined]) {
      const block = buildKinAnswerBlock(SAMPLE, hint);
      expect(block).not.toContain('의료인이 아닌');
      expect(block).not.toContain('홍보성 답변');
      expect(block).not.toContain('차종과 연식');
    }
  });

  it('안전선이 붙어도 기존 계약(1인칭 전환 금지)은 그대로 남는다', () => {
    const block = buildKinAnswerBlock(SAMPLE, '건강');
    expect(block).toContain('1인칭 경험으로 바꾸');
    expect(block).toContain('[답변 1]');
    expect(block).toContain('[답변 2]');
  });

  it('재료가 없으면 안전선만 남는 빈 블록을 만들지 않는다', () => {
    expect(buildKinAnswerBlock([], '건강')).toBe('');
    expect(buildKinAnswerBlock(['짧음'], '건강')).toBe('');
  });
});

describe('배선: main.ts 가 카테고리를 수집기에 넘긴다', () => {
  const code = readFileSync(resolve(__dirname, '..', 'main.ts'), 'utf-8');

  it('카테고리 없이 호출하면 안전선이 영원히 안 붙는다 — 인자를 넘기는지 본다', () => {
    expect(code).toMatch(/collectKinExperienceAnswers\(kinQuery,\s*3,\s*kinCategoryHint\)/u);
  });
});
