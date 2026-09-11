// src/content/affiliateTitleShape.ts
// [2026-09-10] 쇼핑(제휴) 글 제목이 검색에서 이길 모양인지 본다. 순수 함수.
//
// 실측: 저장본 11편 중 노출 5 · 미노출 6(45%). 다른 모드(홈판·SEO 83%)보다 낮았고,
// 제목 모양이 갈랐다.
//   모델명·브래킷·판촉문구 포함 — 미노출군 5/6 vs 노출군 1/5
//   상황어(고민·기준·써본·이유) 포함 — 노출군 4/5 vs 미노출군 1/6
//
// 기전: 상품명·모델명으로 검색하면 상위가 스마트스토어·공식몰이라 블로그가 낄 자리가 없다.
// "정수리 탈모 고민" 같은 상황어는 블로그가 1순위다. 돈이 나오는 모드가 가장 안 되는
// 자리를 골라 왔다는 뜻이다.
//
// 계약: **막지 않는다.** 경고와 근거만 낸다(게이트를 발행 차단으로 만들지 않는다는 원칙).
// 표본이 11편이라 단정하기엔 작다 — 근거를 눈에 보이게 해서 사람이 판단하게 한다.

export type AffiliateTitleIssueKind =
  | 'model-code'     // CFD-FNL201DCGW/-G 같은 규격 코드
  | 'promo-bracket'  // [슈퍼적립+사은품 증정] 같은 쇼핑몰 판촉 문구
  | 'repeat'         // 같은 말이 세 번 (생성 사고)
  | 'truncated'      // "휴대용 무선B-," 처럼 상품명이 중간에 잘려 박힌 것
  | 'no-situation';  // 상품명만 있고 사람의 상황·판단 기준이 없다

export interface AffiliateTitleIssue {
  readonly kind: AffiliateTitleIssueKind;
  readonly message: string;
}

export interface AffiliateTitleAudit {
  readonly issues: readonly AffiliateTitleIssue[];
}

/*
 * 규격 코드 — 영문 대문자 2자 이상 + 숫자가 이어지고 하이픈·슬래시가 섞인 꼴.
 * "DR-5180" 처럼 짧은 것도 포함한다. 사람은 이 문자열로 검색하지 않는다.
 * 다만 "B-UV" 처럼 짧고 발음되는 접미는 실제 노출된 제목에 있었으므로 제외한다(오탐 방지).
 */
const MODEL_CODE = /\b[A-Z]{2,}[A-Z0-9]*-?\d{3,}[A-Z0-9/-]*\b/;

/** 쇼핑몰이 붙이는 판촉 딱지. 검색어가 아니라 매대 문구다. */
const PROMO_BRACKET = /\[[^\]]*(?:단독|적립|사은품|증정|할인|쿠폰|특가|무료배송|\d+위\s*달성|N)[^\]]*\]/;

/*
 * 잘린 상품명 — 낱말이 하이픈으로 끝나고 곧바로 공백·구두점·끝이 온다.
 * 실측: 저장본 102편 중 1편만 걸린다("오아 클린이워터B-UV 휴대용 무선B-, ...") — 오탐 0.
 * 이 한 편은 다른 네 규칙을 전부 빠져나갔다(상황어가 있어서 no-situation 도 안 걸렸다).
 * 사람도 검색엔진도 이 조각으로는 이 글을 찾지 못한다.
 */
const DANGLING_FRAGMENT = /[A-Za-z가-힣0-9]-(?=[\s,.、·]|$)/;

/**
 * 사람이 그 상황에 있을 때 검색하는 말. 실제로 노출된 제목에 있던 것들이다.
 * 넓게 잡는다 — 없다고 막는 게 아니라 "없다" 고 알려 줄 뿐이라 오탐 비용이 낮다.
 */
const SITUATION = /고민|기준|고르는|고를|후기|써본|써보니|예민|비교|차이|이유|어떤|언제|어디|얼마|방법|뭐가|하나요|갈리|살리는|줄이는|필요|추천\s*할|앞두|처음/;

/** 같은 말이 세 번 이상 — "X60 Ultra X60 Ultra 드리미 X60 Ultra" 는 생성 사고다. */
function repeatedToken(title: string): string | null {
  const counts = new Map<string, number>();
  for (const raw of title.split(/\s+/)) {
    const token = raw.trim();
    if (token.length < 2) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  for (const [token, count] of counts) if (count >= 3) return token;
  return null;
}

export function auditAffiliateTitleShape(title: string): AffiliateTitleAudit {
  const text = String(title ?? '').trim();
  if (!text) return { issues: [] };

  const issues: AffiliateTitleIssue[] = [];

  const code = text.match(MODEL_CODE);
  if (code) {
    issues.push({
      kind: 'model-code',
      message: `규격 코드 "${code[0]}" 가 제목에 있습니다. 사람은 이 문자열로 검색하지 않고, 이 말의 상위는 스마트스토어·공식몰입니다. 코드는 본문에 두고 제목에서는 빼세요.`,
    });
  }

  const promo = text.match(PROMO_BRACKET);
  if (promo) {
    issues.push({
      kind: 'promo-bracket',
      message: `쇼핑몰 판촉 문구 "${promo[0]}" 가 제목에 있습니다. 매대 문구지 검색어가 아닙니다.`,
    });
  }

  const repeated = repeatedToken(text);
  if (repeated) {
    issues.push({
      kind: 'repeat',
      message: `"${repeated}" 가 제목에 세 번 이상 나옵니다 — 생성 사고입니다. 한 번만 남기세요.`,
    });
  }

  if (DANGLING_FRAGMENT.test(text)) {
    issues.push({
      kind: 'truncated',
      message: '상품명이 중간에 잘린 채 제목에 들어갔습니다 — 하이픈으로 끝나는 조각이 있습니다. 잘린 조각을 지우거나 완전한 이름으로 바꾸세요.',
    });
  }

  if (!SITUATION.test(text)) {
    issues.push({
      kind: 'no-situation',
      message: '제목에 사람의 상황이나 판단 기준이 없습니다. 상품명만으로는 스마트스토어를 이기기 어렵습니다 — "잇몸 예민하면", "정수리 탈모 고민" 처럼 언제 필요한 물건인지를 앞에 두세요.',
    });
  }

  return { issues };
}

/**
 * 이 키워드가 "스토어 상품명"인가 — 사람이 검색하는 말이 아니라 매대에 붙은 이름인가.
 *
 * 쓰는 곳: 제휴 제목의 키워드 접두 단계. 검색어를 앞에 세우려고 만든 단계인데, 제휴의
 * 메인 키워드는 스토어 상품명 그대로 들어온다("헬스헬퍼 맥스컷 프로 크롬 [슈퍼적립+사은품
 * 증정]"). 그래서 상황을 앞에 세우라는 계약을 지킨 제목 앞에 상품명이 통째로 다시 붙었다.
 *
 * 실측(정답표 11편): 키워드에 상황어가 있으면 노출 3/3, 없으면 0/6. 상품명으로 검색하면
 * 상위가 스마트스토어·공식몰이라 블로그가 낄 자리가 없다. 그 말을 제목 앞에 놓을 이유가 없다.
 */
export function isStoreProductShapedKeyword(keyword: string): boolean {
  const text = String(keyword ?? '').trim();
  if (!text) return false;
  if (PROMO_BRACKET.test(text)) return true;
  if (MODEL_CODE.test(text)) return true;
  return !SITUATION.test(text);
}
