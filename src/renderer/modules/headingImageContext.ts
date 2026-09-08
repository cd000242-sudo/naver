// src/renderer/modules/headingImageContext.ts
//
// 개별 소제목 이미지 생성이 쓸 "재료"를 모은다.
//
// [2026-09-08 사장님 실측] "같은 각도로 전부 비슷하게 나오잖아"
// 각도만 문제가 아니었다. 개별/빈칸 재생성 경로는 프롬프트를 동기 사전 치환
// 휴리스틱으로 만들었고, 그 결과가 한영 혼종이었다:
//
//   "대상 확인과 신청은 어디서 하나"
//     → "대상 check confirm과 application apply은 어디서 하나, professional
//        photography, natural lighting, high detail, cinematic composition, 4k"
//   "달력에 다시 놓인 같은 날짜" → "moon력에 다시 person 같은 날짜, ..."
//
// 모델이 읽을 수 있는 건 뒤 꼬리뿐인데 그 꼬리가 모든 소제목에 동일해,
// 무슨 소제목이든 같은 스톡 장면(책상·노트북)으로 수렴했다.
//
// 일괄 생성 경로(buildItemForHeading)는 이미 LLM 프롬프트 + 본문 근거를 쓴다.
// 같은 재료를 개별 경로에도 준다.

import { resolveSectionContentForImage } from '../../image/contextualImagePrompt.js';

export interface HeadingImageContext {
  articleTitle: string;
  globalSubject: string;
  articleContext: string;
  sectionContent: string;
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

/** 소제목 하나에 대한 글 맥락. 구조화 본문이 없으면 소제목만 남는다. */
export function buildHeadingImageContext(
  structured: any,
  headingTitle: string,
  fallbackTitle: string,
): HeadingImageContext {
  const headings = Array.isArray(structured?.headings) ? structured.headings : [];
  const normalize = (value: unknown): string =>
    String(value ?? '').replace(/\s+/gu, ' ').trim().toLowerCase();
  const target = normalize(headingTitle);
  const matched = headings.find((h: any) =>
    normalize(h?.title || h?.heading || h?.text) === target);

  const articleTitle = firstNonEmpty(structured?.selectedTitle, structured?.title, fallbackTitle);
  const globalSubject = firstNonEmpty(
    Array.isArray(structured?.keywords) ? structured.keywords.join(', ') : structured?.keywords,
    articleTitle,
  );
  const articleContext = firstNonEmpty(
    structured?.introduction, structured?.summary, structured?.description,
  );

  let sectionContent = '';
  try {
    sectionContent = String(resolveSectionContentForImage({
      heading: matched || { title: headingTitle },
      headings,
      bodyPlain: structured?.bodyPlain,
      maxChars: 900,
    }) || '').trim();
  } catch {
    sectionContent = '';
  }
  if (!sectionContent) {
    sectionContent = firstNonEmpty(matched?.content, matched?.summary);
  }

  return { articleTitle, globalSubject, articleContext, sectionContent };
}

/**
 * 프롬프트가 아직 한국어를 그대로 달고 있는가.
 *
 * 사전 치환 휴리스틱의 산출물은 한글이 남는다. 이 판정으로 휴리스틱 결과를
 * 걸러내고 LLM 결과를 우선한다.
 */
export function looksLikeUntranslatedPrompt(prompt: string): boolean {
  return /[가-힣]/u.test(String(prompt || ''));
}
