import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  annotateSearchOnlyCompounds,
  isSearchOnlyCompound,
} from '../content/searchOnlyCompoundKeyword';
import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

/**
 * [2026-09-02 실측] 자료의 겉모습이 본문에 새어 나갔다. 두 갈래였다.
 *
 * ① 남의 글 제목을 근거처럼 인용
 *    "2026년 9월 1일 '환절기 침구 교체 언제가 좋을까?
 *     9월 침실 정리 순서 6단계'도 같은 기준을 앞세웠어요."
 *    자료 헤더가 "[자료 N — 제목]" · "【제목】" 형태라 모델에겐 인용할 문장으로 보인다.
 *    감지기 materialLabelLeak 는 우리 내부 용어("상위글")만 찾으므로 구조적으로 못 잡는다.
 *
 * ② 검색용 조합어를 본문에서 설명
 *    "9월침실정리라는 표현이 붙은 이유도 침실 전체를 …"
 *    사람이 쓰는 말이 아닌데 진짜 서브키워드 옆에 원문 그대로 실렸다.
 *
 * 둘 다 감지 후 재작성이 아니라 자료·프롬프트 형태를 바꿔 막는다.
 */

describe('자료 머리말이 남의 글 제목을 인용 대상에서 제외한다', () => {
  const assembler = readFileSync(resolve(__dirname, '..', 'sourceAssembler.ts'), 'utf-8');

  it('제목이 다른 사람 글의 이름이라고 말한다', () => {
    expect(assembler).toContain('다른 사람이 쓴 글의 이름');
    expect(assembler).toContain('근거로 인용하거나 본문에 옮겨 적지 마라');
  });

  it('무엇을 대신 쓸지 알려 준다 — 금지만 하면 모델이 임의로 고른다', () => {
    expect(assembler).toContain('제목이 아니라 그 아래 본문의 수치·조건·절차');
  });

  it('기존 내부 라벨 규칙을 밀어내지 않는다', () => {
    // [2026-09-02] M1 — 안내문 자체도 내부 표기임을 함께 선언한다
    expect(assembler).toContain('이 묶음의 이름과 번호표, 그리고 이 안내문 자체는 내부 표기다');
  });
});

describe('검색용 조합어를 형태로 가른다', () => {
  it('실측 조합어를 잡는다', () => {
    expect(isSearchOnlyCompound('9월침실정리')).toBe(true);
  });

  /*
   * 형태 규칙이라 코드에 적힌 적 없는 조합도 잡힌다.
   * 여기가 빨개지면 누군가 형태 규칙을 낱말 나열로 되돌린 것이다.
   */
  it.each([['2026년연말정산'], ['3월이사준비물'], ['1인가구자취요리']])(
    '%s 처럼 코드에 없는 조합도 잡는다',
    (token) => {
      expect(isSearchOnlyCompound(token)).toBe(true);
    },
  );

  it('멀쩡한 낱말은 건드리지 않는다', () => {
    for (const ok of ['침실정리', '제습기', '9월', '2026년', '구스 이불', 'iPhone17']) {
      expect(isSearchOnlyCompound(ok), `${ok} 가 조합어로 오판됐다`).toBe(false);
    }
  });

  it('조합어에만 표시를 붙이고 나머지는 원문 그대로 둔다', () => {
    const out = annotateSearchOnlyCompounds('구스 이불, 9월침실정리, 차렵이불 세탁');
    expect(out).toContain('9월침실정리(검색용 조합어');
    expect(out).toContain('구스 이불');
    expect(out).toContain('차렵이불 세탁');
    expect(out).not.toContain('구스 이불(검색용');
  });

  it('조합어가 없으면 입력을 그대로 돌려준다', () => {
    const plain = '구스 이불, 차렵이불 세탁';
    expect(annotateSearchOnlyCompounds(plain)).toBe(plain);
    expect(annotateSearchOnlyCompounds('')).toBe('');
  });
});

describe('배선: 표시가 실제 프롬프트에 실린다', () => {
  it('서브 키워드 자리에 조합어 표시가 붙는다', () => {
    const prompt = buildContentJsonOutputFormat({
      contentMode: 'seo',
      mode: 'seo',
      source: { rawText: '원본', title: '제목', metadata: {} } as never,
      title: '제목',
      rawText: '원본',
      primaryKeyword: '침구 교체',
      subKeywords: '구스 이불, 9월침실정리',
    });
    expect(prompt).toContain('9월침실정리(검색용 조합어');
    // [2026-09-02] M3 — 표시문이 '띄어 써라' 에서 '언급·설명 금지' 로 바뀌었다 (베란다 글이 표기를 서술한 실측)
    expect(prompt).toContain('언급하거나 설명하지 마라');
  });
});
