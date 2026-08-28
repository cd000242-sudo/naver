// src/content/factSourceTierPolicy.ts
// 팩트체크 근거를 "무엇으로 모을지" 정한다. 호출 수가 아니라 구성이 문제였다.
//
// [2026-08-28 사장님 실측] 앱이 뽑은 글을 외부 LLM에 비평시키니 틀린 사실이 나왔다.
// 팩트체크 기능은 꺼져 있지 않았다 — 돌았는데 통과시켰다.
//
// naverFactCheckRAG 기본값이 블로그 5 / 뉴스 3 / 지식iN 3 이었다. 근거 11개 중 8개가
// 블로그·지식iN이다. **블로그를 근거로 블로그를 검증**하니, 틀린 정보가 퍼져 있으면
// 오히려 "확인됨"이 된다. 사장님 팩트 규칙이 "블로그·요약글만 근거인 수치는 표에서
// 제외한다"고 못박은 것과 정확히 반대로 동작하고 있었다.
//
// 네이버 검색 API는 일 25,000건 무료다. 그래서 호출 수를 줄이는 게 아니라 **구성을 바꾼다**.
// 공공정보(지원금·수당·공고)는 뉴스로 몰고 블로그·지식iN을 0으로 내린다. 추가 과금 0원.
//
// 일반 주제는 손대지 않는다. 후기·정보성 글에서는 블로그가 실제로 유용한 재료이고,
// 여기서 바꾸면 기존 수집 품질이 회귀한다.

import { isPublicInfoTopic } from './publicInfoFactTable.js';

export interface FactSourceMix {
  readonly blogCount: number;
  readonly newsCount: number;
  readonly kinCount: number;
  /** 로그·리포트용 사유. */
  readonly reason: string;
}

/** 기존 동작 그대로 — 일반 주제의 기본 구성. */
export const GENERAL_SOURCE_MIX: FactSourceMix = Object.freeze({
  blogCount: 5,
  newsCount: 3,
  kinCount: 3,
  reason: '일반 주제 — 기본 구성(블로그5/뉴스3/지식iN3)',
});

/**
 * 공공정보 전용 — 등급 낮은 소스를 끄고 뉴스를 늘린다.
 * 총 호출 대상 건수는 11 → 10 으로 오히려 줄지만, 전부 뉴스다.
 */
export const PUBLIC_INFO_SOURCE_MIX: FactSourceMix = Object.freeze({
  blogCount: 0,
  newsCount: 10,
  kinCount: 0,
  reason: '공공정보 주제 — 블로그·지식iN 제외, 뉴스 10건으로 대체',
});

/**
 * 대량 수집기(sourceAssembler.collectNaverSearchContent)용 구성.
 *
 * [2026-08-29 실측] "4차 민생지원금" 으로 돌렸더니 재료가 **블로그 30개**로 채워졌다.
 * 위의 FactSourceMix 는 naverFactCheckRAG 경로에만 걸려 있었고, 정작 **글을 쓰는 주
 * 재료**를 모으는 이 수집기는 blog 30 / news 20 / webkr 10 을 하드코딩하고 있었다.
 * 본문 크롤러(collectTopArticleFullTexts)를 안 부르던 것과 같은 종류의 누락이다.
 *
 * 공공정보는 블로그를 끄고 그만큼 뉴스로 돌린다. 네이버 검색 API 는 일 25,000건
 * 무료라 뉴스를 늘려도 추가 과금이 없다.
 */
export interface FactSourceBulkMix {
  readonly blogCount: number;
  readonly newsCount: number;
  readonly webDocCount: number;
  readonly reason: string;
}

/** 기존 동작 그대로 — 일반 주제. */
export const GENERAL_BULK_MIX: FactSourceBulkMix = Object.freeze({
  blogCount: 30,
  newsCount: 20,
  webDocCount: 10,
  reason: '일반 주제 — 기본 구성(블로그30/뉴스20/웹문서10)',
});

/** 공공정보 전용 — 블로그를 끄고 뉴스로 돌린다. 총 건수는 같다. */
export const PUBLIC_INFO_BULK_MIX: FactSourceBulkMix = Object.freeze({
  blogCount: 0,
  newsCount: 50,
  webDocCount: 10,
  reason: '공공정보 주제 — 블로그 제외, 뉴스 50건으로 대체',
});

export function resolveBulkSourceMix(query: string): FactSourceBulkMix {
  return isPublicInfoTopic({ keyword: String(query || '') })
    ? PUBLIC_INFO_BULK_MIX
    : GENERAL_BULK_MIX;
}

export interface FactSourceTopic {
  readonly keyword?: string;
  readonly title?: string;
  readonly topic?: string;
}

/** 키워드만으로 판단한다 — 이 시점엔 아직 본문도 자료도 없다. */
export function resolveFactSourceMix(topic: FactSourceTopic): FactSourceMix {
  const signal = {
    title: topic.title,
    topic: topic.topic,
    keyword: topic.keyword,
  };
  return isPublicInfoTopic(signal) ? PUBLIC_INFO_SOURCE_MIX : GENERAL_SOURCE_MIX;
}
