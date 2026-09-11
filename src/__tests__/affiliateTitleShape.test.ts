/**
 * [2026-09-10 실측] 쇼핑(제휴) 글 노출률이 45% 로 가장 낮았다. 저장본 11편을 갈라 보니
 * 제목 모양이 갈랐다.
 *
 *   미노출: 쿠쿠 건조분쇄형 에코웨일 2L 음식물처리기 CFD-FNL201DCGW/-G 선택
 *   미노출: [N단독구성] 종아리 마사지기 [N] 임신
 *   미노출: [1위 달성] X60 Ultra X60 Ultra 드리미 X60 Ultra      ← 같은 말 3번(생성 사고)
 *   미노출: 헬스헬퍼 맥스컷 프로 크롬 [슈퍼적립+사은품 증정]
 *
 *   1위: 50대 여성 정수리 탈모 고민: 푹 꺼진 뿌리 볼륨 살리는 샴푸법과 성분
 *   1위: 나연이 치과 진료 후 써본 혀클리너, 이게 뭐길래 하나요
 *   23위: 오아 클린이워터B-UV, 잇몸 예민하면 Strong에서 갈려요
 *
 * 수치: 모델명·브래킷·판촉문구 포함이 미노출군 5/6 vs 노출군 1/5.
 *       상황어(고민·기준·써본·이유) 포함이 노출군 4/5 vs 미노출군 1/6.
 *
 * 기전: 상품명·모델명으로 검색하면 상위가 스마트스토어·공식몰이라 블로그가 낄 자리가 없다.
 * "정수리 탈모 고민" 같은 상황어는 블로그가 1순위다.
 *
 * 이 파일은 그 모양을 코드로 잡는다. 막지는 않는다 — 경고와 근거만 낸다.
 */
import { describe, it, expect } from 'vitest';
import { auditAffiliateTitleShape, isStoreProductShapedKeyword } from '../content/affiliateTitleShape';

describe('auditAffiliateTitleShape — 실측 실패 제목을 잡는다', () => {
  it('규격 코드가 제목에 있으면 짚는다', () => {
    const r = auditAffiliateTitleShape('쿠쿠 건조분쇄형 에코웨일 2L 음식물처리기 CFD-FNL201DCGW/-G 선택');
    expect(r.issues.some((i) => i.kind === 'model-code')).toBe(true);
  });

  it('판촉 브래킷을 짚는다', () => {
    for (const t of ['[N단독구성] 종아리 마사지기 [N] 임신', '헬스헬퍼 맥스컷 프로 크롬 [슈퍼적립+사은품 증정]', '[1위 달성] X60 Ultra']) {
      expect(auditAffiliateTitleShape(t).issues.some((i) => i.kind === 'promo-bracket'), t).toBe(true);
    }
  });

  it('같은 말이 세 번 나오면 생성 사고다', () => {
    const r = auditAffiliateTitleShape('[1위 달성] X60 Ultra X60 Ultra 드리미 X60 Ultra');
    expect(r.issues.some((i) => i.kind === 'repeat')).toBe(true);
  });

  // [2026-09-11] 실측 — 노출 20/미노출 19 정답표에서 affiliate 미노출 8편 중 이 한 편만
  // 기존 네 규칙을 전부 빠져나갔다(상황어가 있어 no-situation 도 안 걸렸다).
  it('상품명이 중간에 잘린 제목을 짚는다', () => {
    const a = auditAffiliateTitleShape('오아 클린이워터B-UV 휴대용 무선B-, 잇몸 예민하면 Strong에서 갈려요');
    expect(a.issues.map(i => i.kind)).toContain('truncated');
  });

  it('정상 하이픈 표기는 잘린 것으로 보지 않는다 — 오탐 0', () => {
    for (const t of [
      '오아 클린이워터B-UV 휴대용 무선, 잇몸 예민하면 Strong에서 갈려요',
      '50대 여성 정수리 탈모 고민: 푹 꺼진 뿌리 볼륨 살리는 성분 고르는 기준',
      '나연이 치과 진료 후 써본 혀클리너, 이게 뭐길래 하나요',
    ]) {
      expect(auditAffiliateTitleShape(t).issues.map(i => i.kind)).not.toContain('truncated');
    }
  });

  it('상황어가 없으면 짚는다 — 상품명만으로는 스마트스토어를 못 이긴다', () => {
    expect(auditAffiliateTitleShape('닥터웰 종아리 공기압 마사지기 DR-5180 그레이').issues.some((i) => i.kind === 'no-situation')).toBe(true);
  });
});

describe('실제로 노출된 제목은 통과시킨다 — 오탐이 재생성을 부르면 낭비다', () => {
  for (const t of [
    '50대 여성 정수리 탈모 고민: 푹 꺼진 뿌리 볼륨 살리는 샴푸법과 성분',
    '나연이 치과 진료 후 써본 혀클리너, 이게 뭐길래 하나요',
    '오아 클린이워터B-UV, 잇몸 예민하면 Strong에서 갈려요',
    '오아 메가에어라이트 써큘레이터 저소음 BLDC, 침실 무드등과 세척 편의성에서 갈리는 이유',
  ]) {
    it(`통과: ${t.slice(0, 24)}`, () => {
      expect(auditAffiliateTitleShape(t).issues).toHaveLength(0);
    });
  }
});

describe('계약', () => {
  it('빈 제목은 판정하지 않는다', () => {
    expect(auditAffiliateTitleShape('').issues).toEqual([]);
    expect(auditAffiliateTitleShape(undefined as never).issues).toEqual([]);
  });

  it('사유에 사람이 읽을 설명이 붙는다 — 근거 없는 경고는 고칠 수가 없다', () => {
    const r = auditAffiliateTitleShape('[1위 달성] X60 Ultra X60 Ultra 드리미 X60 Ultra');
    for (const issue of r.issues) expect(issue.message.length).toBeGreaterThan(8);
  });

  it('막지 않는다 — 경고만 낸다', () => {
    const r = auditAffiliateTitleShape('닥터웰 DR-5180');
    expect(r).not.toHaveProperty('blocked');
    expect(Array.isArray(r.issues)).toBe(true);
  });
});

describe('배선 핀', () => {
  const live = (needle: string): number => {
    const fs = require('fs') as typeof import('fs');
    return fs.readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8')
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .filter((l) => l.includes(needle))
      .length;
  };
  it('쇼핑 글 생성 뒤 제목 모양을 본다', () => {
    expect(live('auditAffiliateTitleShape(')).toBeGreaterThan(0);
  });
  it('사유를 로그에 남긴다 — 경고만 하고 막지 않는다', () => {
    expect(live('[ShoppingTitle]')).toBeGreaterThan(0);
    expect(live('throw new Error(titleShape')).toBe(0);
  });
  it('프롬프트 계약에 상황어 우선이 적혀 있다', () => {
    const fs = require('fs') as typeof import('fs');
    const prompt = fs.readFileSync(new URL('../prompts/affiliate/shopping_review.prompt', import.meta.url), 'utf8');
    expect(prompt).toMatch(/제목 앞머리는 사람의 상황/);
    expect(prompt).toMatch(/규격 코드/);
  });
});

describe('isStoreProductShapedKeyword — 제목 앞에 세울 말인지 가른다', () => {
  // 정답표 제휴 11편. 미노출 8편의 키워드는 전부 상품명 꼴, 노출 3편은 전부 상황어였다.
  const 상품명꼴 = [
    '[1위 달성] X60 Ultra X60 Ultra 드리미 X60 Ultra',
    '클린이워터b uv 잇몸 strong',
    '[N단독구성] 종아리 마사지기 [N] 임신',
    '쿠쿠 건조분쇄형 에코웨일 2L 음식물처리기 CFD-FNL201DCGW/-G 선택 전',
    '헬스헬퍼 맥스컷 프로 크롬 [슈퍼적립+사은품 증정]',
    '다리 공기압 마사지기 닥터웰 종아리 DR-5180',
  ];
  const 상황어 = [
    '나연이 치과 진료 후 써본 혀클리너, 이게 뭐길래 하나요',
    '오아 메가에어라이트 써큘레이터 저소음 BLDC, 침실 무드등과 세척 편의성에서 갈리는 이유',
    '정수리 탈모 볼륨 성분 고르는 기준',
  ];
  for (const k of 상품명꼴) {
    it(`상품명 꼴: ${k.slice(0, 22)}`, () => expect(isStoreProductShapedKeyword(k)).toBe(true));
  }
  for (const k of 상황어) {
    it(`상황어라 앞에 세워도 된다: ${k.slice(0, 22)}`, () => expect(isStoreProductShapedKeyword(k)).toBe(false));
  }
  it('빈 키워드는 판정하지 않는다 — 접두 단계가 이미 걸러낸다', () => {
    expect(isStoreProductShapedKeyword('')).toBe(false);
    expect(isStoreProductShapedKeyword('   ')).toBe(false);
  });
});
