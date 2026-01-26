import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
// ✅ [2026-01-25] Perplexity 추가
import { generatePerplexityContent, translatePerplexityError } from './perplexity.js';

import JSON5 from 'json5';
import { getGeminiModel } from './gemini.js';
import { calculateSEOScore } from './seoCalculator';
import { getRelatedKeywords } from './keywordDatabase';
import { app } from 'electron';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { JSON_SCHEMA_DESCRIPTION } from './contentGenerator/schema';
import { humanizeContent, humanizeHtmlContent, analyzeAiDetectionRisk, resetHumanizerLog } from './aiHumanizer.js';
import { optimizeContentForNaver, optimizeHtmlForNaver, analyzeNaverScore, resetOptimizerLog } from './contentOptimizer.js';
import { buildSystemPromptFromHint, buildFullPrompt, type PromptMode } from './promptLoader.js';
import { processAutoPublishContent, type TitleSelectionResult } from './titleSelector.js';
import { trendAnalyzer } from './agents/trendAnalyzer.js';
import { loadConfig } from './configManager.js';
import { safeParseJson, cleanJsonOutput, tryFixJson, fixJsonAtPosition } from './jsonParser';

// ✅ 이모지 자동 제거 함수 (AI가 생성한 이모지 제거)
function removeEmojis(text: string): string {
  if (!text) return text;

  // 이모지 패턴 (유니코드 이모지 범위)
  const emojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]/gu;

  return text.replace(emojiPattern, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * ✅ [100점 수정] 마크다운/HTML 포맷팅 완전 제거 함수
 * 제목, 소제목, 본문 어디서든 사용 가능한 범용 함수
 * **bold**, <u>underline</u>, <b>, <i>, <strong>, <em> 등 모든 포맷팅 태그 제거
 */
export function stripAllFormatting(text: string): string {
  if (!text) return text;
  let cleaned = String(text);

  // 1. **bold** 마크다운 제거 (3회 반복으로 중첩 케이스도 처리)
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  }
  cleaned = cleaned.replace(/\*\*/g, ''); // 남은 ** 완전 제거

  // 2. __언더스코어__ 마크다운 제거
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/__(.*?)__/g, '$1');
  }
  cleaned = cleaned.replace(/__/g, '');

  // 3. *이탤릭* 마크다운 제거 (단, 문장 중간의 단독 * 는 보존)
  cleaned = cleaned.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');

  // 4. <u>underline</u> HTML 태그 제거
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/<u\s*>(.*?)<\/u\s*>/gi, '$1');
  }
  cleaned = cleaned.replace(/<\/?u\s*>/gi, '');

  // 5. <b>, <i>, <strong>, <em>, <mark>, <span> 등 HTML 태그 제거
  cleaned = cleaned.replace(/<\/?(?:b|i|strong|em|mark|span|font|s|strike|del|ins)[^>]*>/gi, '');

  // 6. 빈 태그 정리
  cleaned = cleaned.replace(/<[^>]+>\s*<\/[^>]+>/gi, '');

  return cleaned.trim();
}

/**
 * ✅ [2026-01-20] 제목에서 연속으로 중복되는 구절 제거
 * 예: "이수근 아내, 뇌성마비 아들 고등학생 아내 박지연, 뇌성마비 아들 고등학생 근황"
 *  → "이수근 아내, 뇌성마비 아들 고등학생 박지연, 근황"
 */
function removeDuplicatePhrases(title: string): string {
  let t = String(title || '').trim();
  if (!t || t.length < 10) return t;

  // ✅ [2026-01-21] 콜론(:) 전후 동일/유사 텍스트 감지 및 제거
  // 예: "캐치웰 CX PRO 매직타워 N: 캐치웰 울 집 캐치웰 CX PRO 매직타워 N, 한 달"
  //  → "캐치웰 CX PRO 매직타워 N, 한 달 실사용 후기"
  const colonIdx = t.indexOf(':');
  if (colonIdx > 3 && colonIdx < t.length - 3) {
    const beforeColon = t.slice(0, colonIdx).trim();
    const afterColon = t.slice(colonIdx + 1).trim();

    // 콜론 앞 텍스트와 동일/유사한 패턴이 콜론 뒤에도 있으면 정리
    // 제품명이 반복되는 경우: "A: ... A, B" → "A B"
    const normBefore = beforeColon.replace(/[\s\-–—:|·•.,!?()\[\]{}\"']/g, '').toLowerCase();
    if (normBefore.length >= 5) {
      // afterColon에서 beforeColon과 동일한 텍스트가 있으면 제거
      const escapedBefore = beforeColon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dupePattern = new RegExp(`\\s*${escapedBefore}\\s*[,:]?\\s*`, 'gi');
      const cleanedAfter = afterColon.replace(dupePattern, ' ').replace(/\s+/g, ' ').trim();

      if (cleanedAfter !== afterColon && cleanedAfter.length > 0) {
        // 중복 제거 후 의미있는 텍스트가 남으면 재구성
        const remaining = cleanedAfter.replace(/^[,\s:]+|[,\s:]+$/g, '').trim();
        if (remaining.length >= 3) {
          t = `${beforeColon} ${remaining}`;
          console.log(`[DuplicateRemoval] 콜론 전후 중복 제거: \"${title}\" → \"${t}\"`);
        } else {
          // 남은게 없으면 콜론 앞 텍스트만 사용
          t = beforeColon;
          console.log(`[DuplicateRemoval] 콜론 뒤 제거 (중복): \"${title}\" → \"${t}\"`);
        }
      }
    }
  }

  // ✅ [2026-01-21] 4~25자 길이의 연속 중복 패턴 찾기 (기존 15자 → 25자 확장)
  // 긴 제품명(예: "캐치웰 CX PRO 매직타워 N")도 처리 가능
  for (let len = 25; len >= 4; len--) {
    const regex = new RegExp(`(.{${len},${len}})(?:[\\s,·•|]*\\1)+`, 'g');
    const before = t;
    t = t.replace(regex, '$1');
    if (t !== before) {
      console.log(`[DuplicateRemoval] 중복 제거됨 (${len}자): \"${before}\" → \"${t}\"`);
    }
  }

  // ✅ [2026-01-21] 의미없는 짧은 단편 제거 ("울 집" 같은 AI 환각)
  // 2글자 이하 단어가 연속으로 나오는 이상한 패턴 제거
  t = t.replace(/\s[가-힣]{1,2}\s+[가-힣]{1,2}\s+[가-힣]{1,2}\s/g, ' ');

  // 연속된 쉼표/공백 정리
  t = t.replace(/[,\s]{2,}/g, ', ').replace(/,\s*,/g, ',').trim();
  t = t.replace(/^[,\s]+|[,\s]+$/g, '');

  return t;
}



function stripOrdinalHeadingPrefix(text: string): string {
  let t = String(text || '').trim();
  if (!t) return '';
  t = t.replace(/^\s*(?:제\s*)?\d+\s*번째\s*소제목\s*[:：]\s*/i, '');
  t = t.replace(/^\s*(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번째\s*소제목\s*[:：]\s*/i, '');
  t = t.replace(/^\s*소제목\s*[:：]\s*/i, '');
  return t.trim();
}

/**
 * ✅ 본문 전체에서 "첫 번째 소제목:", "두 번째 소제목:" 같은 레이블을 제거
 * AI가 잘못된 지시를 따라 레이블을 출력한 경우를 후처리로 정리
 */
export function removeOrdinalHeadingLabelsFromBody(bodyText: string): string {
  if (!bodyText) return '';
  let cleaned = String(bodyText);

  // "첫 번째 소제목:", "두 번째 소제목:", ... 등의 레이블 제거
  cleaned = cleaned.replace(/(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번째\s*소제목\s*[:：]\s*/gi, '');

  // "제1번째 소제목:", "제2번째 소제목:" 등의 레이블 제거
  cleaned = cleaned.replace(/(?:제\s*)?\d+\s*번째\s*소제목\s*[:：]\s*/gi, '');

  // "소제목:" 단독 레이블 제거
  cleaned = cleaned.replace(/^\s*소제목\s*[:：]\s*/gim, '');

  // ✅ [공지/이슈] AI가 임의로 붙이는 문장 접두어/기호 제거 (?:, ? :, [공지] 등)
  cleaned = cleaned.replace(/^\s*(?:[\?？][\s:：]+|\[\s*공지\s*\]|\(\s*공지\s*\)|【\s*공지\s*】)\s*/gim, '');

  // ✅ [하이라이팅] **bold** 마크다운 제거 (발행 시 `**`가 그대로 표시되는 문제 방지)
  // 비탐욕적 매칭(.*?)으로 확실하게 제거 - 여러 번 반복 실행
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1'); // 비탐욕적 매칭
  }
  cleaned = cleaned.replace(/\*\*/g, ''); // 남은 ** 완전 제거

  // ✅ [밑줄] <u>underline</u> HTML 태그 제거 (발행 시 태그가 그대로 표시되는 문제 방지)
  // 비탐욕적 매칭으로 중첩/불완전한 태그도 완전 제거
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/<u\s*>(.*?)<\/u\s*>/gi, '$1'); // 비탐욕적 매칭
  }
  cleaned = cleaned.replace(/<\/?u\s*>/gi, ''); // 남은 <u>, </u> 단독 태그도 제거

  // ✅ [기타 HTML 태그] <b>, <i>, <strong>, <em> 등 제거
  cleaned = cleaned.replace(/<\/?(?:b|i|strong|em|mark|span)[^>]*>/gi, '');

  // ✅ [플레이스홀더 제거] OOO, XXX, {키워드} 등 모든 형태의 플레이스홀더 제거
  // 1. 영문 대문자 3자 플레이스홀더만 선택적 제거 (API, SEO, URL 같은 정상 약어는 보호)
  //    실제 플레이스홀더로 사용되는 패턴만 타겟
  cleaned = cleaned.replace(/\b(OOO|XXX|AAA|BBB|CCC|DDD|EEE|FFF|GGG|HHH|III|JJJ|KKK|LLL|MMM|NNN)\b/g, '');


  // 2. 동그라미/네모 3개 플레이스홀더: ○○○, □□□ 등
  cleaned = cleaned.replace(/[○□]{3}/g, '');

  // 3. 중괄호 변수명 플레이스홀더: {키워드}, {인물명}, {서브키워드} 등
  cleaned = cleaned.replace(/\{[^}]+\}/g, '');

  // 4. 대괄호 플레이스홀더: [인물명], [키워드] 등 (단, [이미지] 같은 정상적인 표현은 제외)
  cleaned = cleaned.replace(/\[(?:인물명|키워드|서브키워드|주제|이름|제품명|브랜드명)\]/gi, '');

  // ✅ [섹션 레이블 포맷팅] 📌로 시작하는 섹션 레이블 앞뒤에 줄바꿈 추가
  // "...지경이에요.. 📌 당시 대중 반응 요약 와 드디어..." 
  // → "...지경이에요..\n\n📌 당시 대중 반응 요약\n\n와 드디어..."
  cleaned = cleaned.replace(/([^\n])(📌[^\n]+)/g, '$1\n\n$2');  // 앞에 줄바꿈 추가
  cleaned = cleaned.replace(/(📌[^\n]+)([^\n])/g, '$1\n\n$2');  // 뒤에 줄바꿈 추가

  // ✅ [대중 반응 섹션 가독성 개선] 
  // "📌 당시 대중 반응 요약" 뒤에 나오는 긴 문장을 종결어미 기준으로 줄바꿈
  // 한국어 종결어미(~다, ~네, ~요, ~음, ~죠) 뒤에 줄바꿈 추가
  cleaned = cleaned.replace(/(📌[^\n]*당시[^\n]*반응[^\n]*\n\n)([^\n]{40,})/g, (match, label, content) => {
    // 한국어 종결어미 패턴 뒤에 공백이 오면 줄바꿈으로 변경
    // ~다, ~네, ~요, ~죠, ~음, ~ㅋ, ~ㅠ, ~야, ~지, ~어, ~워, ~아 등
    let formatted = content
      .replace(/(다|네요?|요|죠|음|야|지|어요?|워요?|아요?|했다|겠다|있다|없다|된다|난다|간다|왔다|했네|됐네|왔네|갔네|봤네|이네|진짜|실화|대박|ㅋㅋ+|ㅠㅠ+|ㅎㅎ+) /g, '$1\n')
      .replace(/(가네|하네|보네|되네|오네|같네|싶네) /g, '$1\n');

    return label + formatted;
  });

  // 과도한 줄바꿈 정리 (3개 이상의 연속 줄바꿈을 2개로)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');




  return cleaned.trim();
}

function cleanupStartingTitleTokens(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';

  // 1. [공지], (공지), 【공지】 등 공지 관련 태그 제거
  t = t.replace(/^\s*[\[\(【]\s*공지\s*[\]\)】]\s*/i, '');

  // 2. 공외:, [NOTICE], (NOTICE) 등 유사 패턴 제거
  t = t.replace(/^\s*[\[\(【]?\s*(?:NOTICE|공지사항|안내|이슈)\s*[\]\)】]?\s*[:：]?\s*/i, '');

  // 3. 맨 앞의 불필요한 기호 제거
  t = t.replace(/^[\s\-–—:|·•,]+/, '');

  return t.trim();
}


function cleanupTrailingTitleTokens(raw: string): string {
  let t = normalizeTitleWhitespace(removeEmojis(String(raw || '').trim()));
  if (!t) return '';

  // remove dangling single-word bait tokens often emitted at the end
  // (keep this conservative to avoid changing legitimate titles)
  const trailingTokens = ['직접', '진짜', '충격', '대박'];
  for (const tok of trailingTokens) {
    const rx = new RegExp(`(?:[\s,·•|:]+)?${tok}\s*$`, 'i');
    if (rx.test(t)) {
      t = t.replace(rx, '').trim();
    }
  }

  // cleanup leftover punctuation at the end
  t = t.replace(/[\s\-–—:|·•,]+$/g, '').trim();
  return t;
}

function applyKeywordPrefixToTitle(title: string, keyword: string): string {
  const cleanKeyword = (keyword || '').trim();
  if (!cleanKeyword) return (title || '').trim();

  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return cleanKeyword;

  const escapeRegex = (s: string): string => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const normalizeForCompare = (s: string) =>
    String(s || '')
      .trim()
      .replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '')
      .toLowerCase();

  const normalizeWhitespace = (s: string): string =>
    String(s || '')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s*:\s*/g, ': ')
      .replace(/\s*\|\s*/g, ' | ')
      .trim();

  const stripTrailingKeywordSuffix = (s: string): string => {
    let t = normalizeWhitespace(String(s || ''));
    if (!t) return '';
    const suffixes = [
      /\s*(?:하는\s*)?방법\s*$/,
      /\s*(?:하는\s*)?법\s*$/,
      /\s*요령\s*$/,
      /\s*팁\s*$/,
      /\s*가이드\s*$/,
      /\s*(?:총\s*)?정리\s*$/,
    ];
    for (const rx of suffixes) {
      const next = t.replace(rx, '').trim();
      if (next && next !== t) t = next;
    }
    return t.trim();
  };

  const clampTitleLength = (s: string, maxLen: number): string => {
    // ✅ [2026-01-20] 먼저 중복 구절 제거
    let t = removeDuplicatePhrases(normalizeWhitespace(String(s || '')));
    if (!t) return '';
    if (t.length <= maxLen) return t;

    // ✅ 불완전한 문장 방지: 적절한 끝 위치 찾기
    let cut = t.slice(0, maxLen);

    // 마지막 공백, 구두점 위치 찾기
    const lastSpace = cut.lastIndexOf(' ');
    const lastPunctuation = Math.max(
      cut.lastIndexOf('!'),
      cut.lastIndexOf('?'),
      cut.lastIndexOf('。'),
      cut.lastIndexOf('.')
    );

    // 구두점이 있으면 그 위치에서 자름 (완전한 문장 보장)
    if (lastPunctuation >= Math.floor(maxLen * 0.6)) {
      cut = t.slice(0, lastPunctuation + 1);
    } else if (lastSpace >= Math.floor(maxLen * 0.6)) {
      cut = t.slice(0, lastSpace);
    }

    // 끝 정리
    return cut.replace(/[\s\-–—:|·•,]+$/g, '').trim();
  };

  const titleNorm = normalizeForCompare(cleanTitle);
  const kwNorm = normalizeForCompare(cleanKeyword);
  if (kwNorm && titleNorm.startsWith(kwNorm)) {
    let rest = cleanTitle.slice(cleanKeyword.length).trim();
    rest = rest.replace(/^[\s\-–—:|·•,]+/, '').trim();

    const kwStem = stripTrailingKeywordSuffix(cleanKeyword);
    const restNormalized = normalizeWhitespace(rest);
    if (kwStem) {
      const candidates = [
        kwStem,
        `${kwStem}법`,
        `${kwStem} 방법`,
        `${kwStem}하는 방법`,
        `${kwStem}하는법`,
        `${kwStem} 요령`,
        `${kwStem} 팁`,
        `${kwStem} 정리`,
      ];
      for (const c of candidates) {
        const rx = new RegExp(`^\\s*${escapeRegex(c)}\\s*`, 'i');
        if (rx.test(restNormalized)) {
          rest = restNormalized.replace(rx, '').trim();
          rest = rest.replace(/^[\s\-–—:|·•,]+/, '').trim();
          break;
        }
      }
    }

    const restNorm = normalizeForCompare(rest);
    if (kwNorm && restNorm.startsWith(kwNorm)) {
      const merged = `${cleanKeyword} ${rest}`.replace(new RegExp(`^${escapeRegex(cleanKeyword)}(?:\\s+${escapeRegex(cleanKeyword)})+`), cleanKeyword).trim();
      return clampTitleLength(merged, 50);
    }
    return clampTitleLength(`${cleanKeyword}${rest ? ` ${rest}` : ''}`.trim(), 50);
  }

  const removed = cleanTitle.split(cleanKeyword).join(' ').replace(/\s+/g, ' ').trim();
  let rest = removed.replace(/^[\s\-–—:|·•]+/, '').trim();

  const kwStem = stripTrailingKeywordSuffix(cleanKeyword);
  if (kwStem && rest) {
    const restNormalized = normalizeWhitespace(rest);
    const candidates = [
      kwStem,
      `${kwStem}법`,
      `${kwStem} 방법`,
      `${kwStem}하는 방법`,
      `${kwStem}하는법`,
      `${kwStem} 요령`,
      `${kwStem} 팁`,
      `${kwStem} 정리`,
    ];
    for (const c of candidates) {
      const rx = new RegExp(`^\\s*${escapeRegex(c)}\\s*`, 'i');
      if (rx.test(restNormalized)) {
        rest = restNormalized.replace(rx, '').trim();
        rest = rest.replace(/^[\s\-–—:|·•,]+/, '').trim();
        break;
      }
    }
  }

  const merged = rest ? `${cleanKeyword} ${rest}` : cleanKeyword;
  return clampTitleLength(merged, 50);
}

function applyKeywordPrefixToStructuredContent(content: StructuredContent, keyword: string): void {
  const cleanKeyword = (keyword || '').trim();
  if (!content || !cleanKeyword) return;

  if (content.selectedTitle) {
    content.selectedTitle = applyKeywordPrefixToTitle(content.selectedTitle, cleanKeyword);
  }

  if (Array.isArray(content.titleAlternatives)) {
    content.titleAlternatives = content.titleAlternatives
      .map(t => applyKeywordPrefixToTitle(t, cleanKeyword))
      .filter(Boolean);
  }

  if (Array.isArray(content.titleCandidates)) {
    content.titleCandidates = content.titleCandidates.map(c => ({
      ...c,
      text: applyKeywordPrefixToTitle(c.text, cleanKeyword),
    }));
  }
}

function buildTitlePrefixCandidates(selectedTitle: string, productName: string): string[] {
  const title = String(selectedTitle || '').trim();
  const prod = String(productName || '').trim();
  if (!title) return [];

  const candidates = new Set<string>();
  candidates.add(title);

  const titleWords = title
    .replace(/[!?]+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .split(/\s+/)
    .map((w) => String(w || '').trim())
    .filter(Boolean);
  for (let n = 3; n <= Math.min(12, titleWords.length); n++) {
    const wp = titleWords.slice(0, n).join(' ').trim();
    if (wp) candidates.add(wp);
  }

  if (prod && title.startsWith(prod)) {
    let rest = title.slice(prod.length).trim();
    rest = rest.replace(/^[\s\-–—:|·•,]+/, '').trim();
    if (rest) {
      const segs = rest
        .split(/[\-|–—:|·•,]+/)
        .map((s) => String(s || '').trim())
        .filter(Boolean);

      for (let i = 1; i <= segs.length; i++) {
        const joined = segs.slice(0, i).join(', ').trim();
        if (joined) candidates.add(`${prod} ${joined}`.trim());
      }

      if (segs.length >= 2) {
        const seg2 = String(segs[1] || '').trim();
        const words = seg2.split(/\s+/).filter(Boolean);
        for (let w = 1; w <= Math.min(5, words.length); w++) {
          const wordPrefix = words.slice(0, w).join(' ').trim();
          if (wordPrefix) {
            candidates.add(`${prod} ${segs[0]}, ${wordPrefix}`.trim());
          }
        }
      }

      if (segs.length >= 2) {
        const seg2Short = segs[1].replace(/(된다니|된다면|된다|된).*$/g, '').trim();
        if (seg2Short) {
          candidates.add(`${prod} ${segs[0]}, ${seg2Short}`.trim());
        }
      }
    }
  }

  return Array.from(candidates.values()).sort((a, b) => b.length - a.length);
}

function stripReviewTitlePrefixFromHeading(headingTitle: string, selectedTitle: string, productName: string): string {
  let h = String(headingTitle || '').trim();
  if (!h) return h;

  const candidates = buildTitlePrefixCandidates(selectedTitle, productName);
  const normalizeForPrefixMatch = (s: string): string => {
    const cleaned = removeEmojis(String(s || ''));
    return normalizeTitleWhitespace(cleaned).trim();
  };
  const normalizedHeading = normalizeForPrefixMatch(h);
  for (const prefix of candidates) {
    if (!prefix) continue;

    const normalizedPrefix = normalizeForPrefixMatch(prefix);
    if (!normalizedPrefix) continue;

    if (normalizedHeading.startsWith(normalizedPrefix)) {
      const remainder = normalizedHeading.slice(normalizedPrefix.length).trim();
      h = remainder.replace(/^[\s\-–—:|·•,]+/, '').trim();
      break;
    }
  }

  return h;
}

// ✅ 공통: 소제목이 전체 제목으로 시작하는 경우 제목 부분만 1회 잘라내기
// - 리뷰형 여부와 무관하게 동작
// - heading 이 제목과 완전히 동일한 경우는 건드리지 않고, 아래 "1번 소제목 중복 제거" 로직에 맡긴다.
function stripSelectedTitlePrefixFromHeadings(content: StructuredContent): void {
  if (!content || !content.selectedTitle || !Array.isArray(content.headings) || content.headings.length === 0) {
    return;
  }

  const normalizeForCompare = (s: string): string => {
    const cleaned = removeEmojis(String(s || ''));
    return normalizeTitleWhitespace(cleaned).trim();
  };

  // ✅ [2026-01-20] 조사로 시작하면 잘못된 제거로 간주 (주어가 잘린 것)
  const startsWithParticle = (s: string): boolean => {
    const particles = ['의', '이', '가', '를', '을', '은', '는', '에', '와', '과', '로', '으로', '에서', '까지', '부터', '도', '만'];
    const trimmed = s.trim();
    return particles.some(p => trimmed.startsWith(p + ' ') || trimmed === p);
  };

  const normalizedTitle = normalizeForCompare(content.selectedTitle);
  if (!normalizedTitle) return;

  content.headings = content.headings.map((h) => {
    const original = String(h.title || '').trim();
    if (!original) return h;

    const normalizedHeading = normalizeForCompare(original);
    if (!normalizedHeading || normalizedHeading.length <= normalizedTitle.length) {
      return h;
    }

    if (normalizedHeading.startsWith(normalizedTitle)) {
      let remainder = normalizedHeading.slice(normalizedTitle.length).trim();
      remainder = remainder.replace(/^[\s\-–—:|·•,]+/, '').trim();

      // ✅ [2026-01-20] 잘린 결과가 조사로 시작하면 원본 유지 (주어 보호)
      if (remainder && startsWithParticle(remainder)) {
        console.log(`[HeadingProtection] 소제목 보호: "${original}" (조사로 시작하는 잔여물 감지)`);
        return h; // 원본 유지
      }

      // ✅ [2026-01-20] 잘린 결과가 너무 짧으면 원본 유지 (최소 5자)
      if (remainder && remainder.length < 5) {
        console.log(`[HeadingProtection] 소제목 보호: "${original}" (잔여물 너무 짧음: ${remainder.length}자)`);
        return h; // 원본 유지
      }

      if (remainder) {
        return {
          ...h,
          title: remainder,
        };
      }
    }

    return h;
  });
}

function isReviewArticleType(articleType?: ArticleType): boolean {
  return articleType === 'shopping_review' || articleType === 'it_review' || articleType === 'product_review';
}

function normalizeTitleWhitespace(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeBodyWhitespacePreserveNewlines(text: string): string {
  if (!text) return text;
  const normalized = String(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, '').trimStart())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized;
}

function limitRegexOccurrences(text: string, regex: RegExp, maxCount: number): string {
  if (!text) return text;
  let count = 0;
  return text.replace(regex, (m) => {
    count += 1;
    return count <= maxCount ? m : '';
  });
}

function getReviewProductName(source?: ContentSource): string {
  const fromInfo = String((source as any)?.productInfo?.name || '').trim();
  if (fromInfo) {
    const extracted = extractLikelyProductNameFromTitle(fromInfo);
    const normalized = normalizeReviewProductName(fromInfo);
    return extracted && extracted.length <= normalized.length ? extracted : normalized;
  }
  const fromTitle = String(source?.title || '').trim();
  if (fromTitle) return extractLikelyProductNameFromTitle(fromTitle);
  const fromMeta = String((source as any)?.metadata?.keywords?.[0] || '').trim();
  return fromMeta;
}

/**
 * ✅ [2026-01-21] 상품명에서 카테고리를 자동 감지
 * AI에게 카테고리를 명시적으로 전달하여 부적절한 표현 방지
 * (예: 과일 상품에 "조립이 필요없다" 같은 가전 표현 사용 방지)
 */
export type ProductCategory =
  | 'food'        // 식품/농산물/음료
  | 'electronics' // 가전/전자제품
  | 'cosmetics'   // 화장품/스킨케어
  | 'fashion'     // 의류/패션/악세서리
  | 'furniture'   // 가구/인테리어
  | 'health'      // 건강/영양제
  | 'baby'        // 유아/아동
  | 'pet'         // 반려동물
  | 'sports'      // 스포츠/레저
  | 'general';    // 일반/기타

export interface ProductCategoryResult {
  category: ProductCategory;
  categoryKorean: string;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
}

export function detectProductCategory(productName: string, additionalContext?: string): ProductCategoryResult {
  const text = `${productName || ''} ${additionalContext || ''}`.toLowerCase().trim();

  // 카테고리별 키워드 데이터베이스
  const categoryKeywords: Record<ProductCategory, string[]> = {
    food: [
      // 과일
      '샤인머스캣', '포도', '사과', '배', '귤', '감귤', '한라봉', '천혜향', '딸기', '복숭아', '수박', '참외',
      '망고', '바나나', '오렌지', '자몽', '키위', '블루베리', '체리', '아보카도', '레몬', '라임',
      // 채소
      '배추', '무', '양배추', '당근', '감자', '고구마', '양파', '마늘', '파', '시금치', '상추', '토마토',
      '오이', '호박', '고추', '파프리카', '브로콜리', '콩나물', '버섯',
      // 육류/해산물
      '한우', '소고기', '돼지고기', '삼겹살', '닭고기', '오리', '연어', '참치', '전복', '새우', '랍스터',
      '굴', '홍합', '조개', '오징어', '낙지', '문어', '꽃게', '대게',
      // 가공식품
      '라면', '과자', '빵', '케이크', '초콜릿', '사탕', '젤리', '아이스크림', '치즈', '햄', '소시지',
      '김치', '장류', '간장', '된장', '고추장', '식초', '올리브유', '참기름',
      // 음료
      '커피', '차', '주스', '우유', '두유', '요거트', '콤부차', '탄산수', '생수',
      // 건강식품
      '꿀', '홍삼', '인삼', '흑마늘', '도라지', '즙', '진액', '엑기스',
      // 일반 식품 키워드
      '식품', '음식', '먹거리', '간식', '반찬', '밑반찬', '요리', '레시피',
      '유기농', 'gap', '무농약', '친환경', '국내산', '수입산', '프리미엄',
      '신선', '냉동', '냉장', '상온', '당도', '과즙', '시즙'
    ],
    electronics: [
      // 주방가전
      '청소기', '에어프라이어', '전자레인지', '오븐', '토스터', '믹서기', '블렌더', '커피머신', '정수기', '식기세척기',
      '냉장고', '김치냉장고', '밥솥', '전기포트', '인덕션', '가스레인지',
      // 생활가전
      '에어컨', '선풍기', '서큘레이터', '히터', '온풍기', '제습기', '가습기', '공기청정기', '로봇청소기',
      '세탁기', '건조기', '다리미', '스타일러',
      // IT/디지털
      '스마트폰', '태블릿', '노트북', '컴퓨터', 'pc', '모니터', '키보드', '마우스', '헤드폰', '이어폰',
      '스피커', '블루투스', '충전기', '보조배터리', '케이블', 'usb', 'ssd', 'hdd',
      // 영상/음향
      'tv', '텔레비전', '빔프로젝터', '사운드바', '홈시어터', '카메라', 'dslr', '액션캠',
      // 미용가전
      '드라이기', '고데기', '헤어', '전동', '면도기', '제모기', '마사지기',
      // 일반 가전 키워드
      '가전', '전자', '전기', '무선', '유선', '배터리', '충전', '와트', 'w', '인치', '리터', 'l',
      '조립', '설치', '소음', '전력', '에너지', '효율', '스마트', 'iot', '앱연동'
    ],
    cosmetics: [
      // 스킨케어
      '스킨', '토너', '로션', '에센스', '세럼', '크림', '앰플', '오일', '미스트',
      '클렌저', '클렌징', '폼', '워터', '밀크', '필링', '스크럽', '마스크팩', '패드',
      '선크림', '자외선', 'spf', '선스틱', '쿠션', '파운데이션',
      // 메이크업
      '립스틱', '립밤', '틴트', '립글로스', '아이라이너', '마스카라', '아이섀도', '블러셔', '하이라이터',
      '파우더', '컨실러', '프라이머', '베이스', '픽서', '세팅',
      // 헤어/바디
      '샴푸', '린스', '컨디셔너', '트리트먼트', '헤어오일', '헤어에센스', '왁스', '젤', '스프레이',
      '바디워시', '바디로션', '바디오일', '핸드크림', '풋크림',
      // 일반 화장품 키워드
      '화장품', '코스메틱', '뷰티', '메이크업', '스킨케어', '더마', '피부', '모공', '주름', '미백',
      '수분', '보습', '영양', '탄력', '발림', '흡수', '촉촉', '산뜻'
    ],
    fashion: [
      // 의류
      '티셔츠', '셔츠', '블라우스', '니트', '가디건', '자켓', '코트', '패딩', '점퍼', '후드',
      '청바지', '슬랙스', '치마', '스커트', '원피스', '반바지', '조거', '레깅스',
      // 신발
      '운동화', '스니커즈', '구두', '로퍼', '샌들', '슬리퍼', '부츠', '힐',
      // 가방/악세서리
      '가방', '백팩', '토트백', '크로스백', '클러치', '지갑', '벨트', '모자', '스카프',
      '목걸이', '반지', '귀걸이', '팔찌', '시계',
      // 속옷/양말
      '속옷', '브라', '팬티', '런닝', '양말', '스타킹',
      // 일반 패션 키워드
      '패션', '의류', '옷', '착용', '사이즈', '핏', 'xs', 's', 'm', 'l', 'xl', 'xxl',
      '신축성', '통기성', '소재', '원단', '면', '폴리', '울', '캐시미어', '린넨'
    ],
    furniture: [
      // 가구
      '소파', '침대', '매트리스', '책상', '의자', '테이블', '책장', '옷장', '서랍장', '화장대',
      '식탁', '거실장', 'tv장', '신발장', '수납장',
      // 인테리어
      '커튼', '블라인드', '러그', '카펫', '조명', '스탠드', '액자', '거울', '시계',
      // 침구
      '이불', '베개', '매트', '토퍼', '시트', '차렵이불',
      // 일반 가구 키워드
      '가구', '인테리어', '공간', '배치', '조립', '설치', '원목', '철제', '나무', '패브릭',
      '모던', '클래식', '미니멀', '북유럽'
    ],
    health: [
      '영양제', '비타민', '오메가', '유산균', '프로바이오틱스', '콜라겐', '루테인', '밀크씨슬',
      '마그네슘', '철분', '칼슘', '아연', '종합비타민',
      '건강식품', '보조제', '건강', '면역', '피로', '활력', '눈', '간', '장',
      '다이어트', '체중', '단백질', '프로틴'
    ],
    baby: [
      '유아', '아기', '신생아', '유모차', '카시트', '기저귀', '분유', '이유식', '젖병',
      '아이', '어린이', '키즈', '베이비', '아동복', '아동화',
      '육아', '출산', '임신', '산모'
    ],
    pet: [
      '강아지', '고양이', '반려동물', '펫', '사료', '간식', '장난감', '하우스', '캔', '슬', '파우치',
      '애견', '애묘', '반려견', '반려묘', '목줄', '배변패드'
    ],
    sports: [
      '운동', '헬스', '피트니스', '요가', '필라테스', '러닝', '자전거', '골프', '테니스', '수영',
      '등산', '캠핑', '낚시', '레저', '아웃도어',
      '덤벨', '바벨', '매트', '밴드', '폼롤러', '운동복', '트레이닝'
    ],
    general: []
  };

  const matchedKeywords: string[] = [];
  const categoryScores: Record<ProductCategory, number> = {
    food: 0, electronics: 0, cosmetics: 0, fashion: 0,
    furniture: 0, health: 0, baby: 0, pet: 0, sports: 0, general: 0
  };

  // 각 카테고리별 매칭 점수 계산
  for (const [category, keywords] of Object.entries(categoryKeywords) as [ProductCategory, string[]][]) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        categoryScores[category] += keyword.length; // 긴 키워드일수록 높은 점수
        matchedKeywords.push(keyword);
      }
    }
  }

  // 가장 높은 점수의 카테고리 선택
  let bestCategory: ProductCategory = 'general';
  let maxScore = 0;
  for (const [category, score] of Object.entries(categoryScores) as [ProductCategory, number][]) {
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  // 신뢰도 결정
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (maxScore >= 10) confidence = 'high';
  else if (maxScore >= 5) confidence = 'medium';

  // 카테고리 한국어 이름
  const categoryKoreanMap: Record<ProductCategory, string> = {
    food: '식품/농산물',
    electronics: '가전/전자제품',
    cosmetics: '화장품/스킨케어',
    fashion: '의류/패션',
    furniture: '가구/인테리어',
    health: '건강/영양제',
    baby: '유아/아동',
    pet: '반려동물',
    sports: '스포츠/레저',
    general: '일반 상품'
  };

  console.log(`[CategoryDetect] "${productName}" → ${bestCategory} (${categoryKoreanMap[bestCategory]}), 신뢰도: ${confidence}, 매칭: [${matchedKeywords.slice(0, 5).join(', ')}]`);

  return {
    category: bestCategory,
    categoryKorean: categoryKoreanMap[bestCategory],
    confidence,
    matchedKeywords: [...new Set(matchedKeywords)].slice(0, 10)
  };
}

function extractLikelyProductNameFromTitle(title: string): string {
  const t0 = normalizeTitleWhitespace(removeEmojis(String(title || '').trim()));
  if (!t0) return '';

  const cutDelim = t0.split(/[|]/)[0];
  const cutComma = cutDelim.split(',')[0];
  const t = String(cutComma || '').trim();
  if (!t) return '';

  const hookPattern = /(직접\s*써보[고니]|써보[고니]|써본|사용\s*후기|실사용|리뷰|후기|소름|난리|충격|경악|반전|실화|폭발|알고보니|비밀|진짜\s*이유|삶의\s*질\s*상승)/;
  const m = t.match(hookPattern);
  if (m && typeof m.index === 'number' && m.index > 0) {
    const before = t.slice(0, m.index).trim();
    return normalizeReviewProductName(before || t);
  }

  return normalizeReviewProductName(t);
}

function normalizeReviewProductName(productName: string): string {
  let p = normalizeTitleWhitespace(removeEmojis(String(productName || '').trim()));
  if (!p) return '';

  p = p.split(/[|]/)[0].trim();
  p = p.split(',')[0].trim();

  // "40도" 같은 온도/수치 훅은 제품명에서 제외
  const tempLike = p.match(/\s\d+(?:\.\d+)?\s*도\b/);
  if (tempLike && typeof tempLike.index === 'number' && tempLike.index > 0) {
    p = p.slice(0, tempLike.index).trim();
  }

  const hookPattern = /(직접\s*써보[고니]|(직접\s*)?써보[고니]|써본|사용\s*후기|실사용|리뷰|후기|소름|난리|충격|경악|반전|실화|폭발|알고보니|숨겨진\s*진실|비밀|진짜\s*이유|삶의\s*질\s*상승)/;
  const m = p.match(hookPattern);
  if (m && typeof m.index === 'number') {
    if (m.index > 0) {
      p = p.slice(0, m.index).trim();
    } else {
      p = p.replace(hookPattern, '').trim();
    }
  }

  // 제품 카테고리 명사까지만 잘라서 "제품명"만 남기기
  // (긴 제목형 문구가 productName으로 들어오는 것을 방지)
  const sizeToken = '(?:\\d+(?:\\.\\d+)?\\s*(?:L|l|리터|ml|mL|kg|g|인치|cm|mm))';
  const nouns = [
    '가습기',
    '제습기',
    '선풍기',
    '청소기',
    '공기청정기',
    '에어프라이어',
    '드라이기',
    '보조배터리',
  ];
  let nounHit: { noun: string; idx: number } | null = null;
  for (const noun of nouns) {
    const idx = p.indexOf(noun);
    if (idx >= 0) {
      if (!nounHit || idx < nounHit.idx) nounHit = { noun, idx };
    }
  }
  if (nounHit) {
    let end = nounHit.idx + nounHit.noun.length;
    const after = p.slice(end).trimStart();
    const sizeAfter = after.match(new RegExp(`^${sizeToken}`, 'i'));
    if (sizeAfter && sizeAfter[0]) {
      end += (p.slice(end).length - after.length) + sizeAfter[0].length;
    }
    p = p.slice(0, end).trim();
  }

  // 흔한 수식어 제거(너무 공격적으로 제거하지 않도록 최소한만)
  p = p
    .replace(/\b(대용량|초대형|초소형|가성비|끝판왕|위력|역대급|핫템|강추|필수템)\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 용량/규격 토큰을 제품 카테고리 명사 앞쪽으로 이동
  // 예: "케리프 가습기 5L" -> "케리프 5L 가습기"
  // 예: "OO 선풍기 16인치" -> "OO 16인치 선풍기"
  const nounToken = '([가-힣A-Za-z0-9]+)';
  const re = new RegExp(`^(.+?)\\s+${nounToken}\\s+(${sizeToken})(\\b.*)?$`);
  const match = p.match(re);
  if (match) {
    const left = String(match[1] || '').trim();
    const noun = String(match[2] || '').trim();
    const size = String(match[3] || '').trim();
    const tail = String(match[4] || '').trim();

    // tail이 있는 경우에는 그대로 붙이되, 너무 긴 경우 방지
    const rebuilt = `${left} ${size} ${noun}${tail ? ` ${tail}` : ''}`.replace(/\s{2,}/g, ' ').trim();
    return rebuilt;
  }

  return p;
}

function sanitizeReviewTitle(title: string, productName: string): string {
  const base = String(title || '').trim();
  const prod = String(productName || '').trim();

  let t = base;
  // 강한 훅 문구/감정 트리거 제거 (리뷰에서는 과장/반복 체감이 큼)
  t = t.replace(/(직접\s*)?써보[고니]\s*/g, '');
  t = t.replace(/애\s*엄마들\s*사이에서\s*/g, '');
  t = t.replace(/(소름\s*돋았던\s*이유|난리\s*난\s*이유|심상치\s*않았던\s*이유)/g, '');
  t = t.replace(/(삶의\s*질\s*상승)/g, '');
  t = t.replace(/(소름|난리|충격|경악|반전|실화|폭발|알고보니|숨겨진\s*진실|비밀|진짜\s*이유)/g, '');
  t = t.replace(/[!?]+/g, '').trim();

  t = normalizeTitleWhitespace(t);
  if (prod) {
    t = applyKeywordPrefixToTitle(t, prod);
  }

  // ✅ [2026-01-21] 강제 '실사용 후기' 폴백 제거 - AI 훅 제목 유지
  // 이전 코드: 후기/리뷰 키워드가 없으면 강제로 '${prod} 실사용 후기'로 변경
  // 수정 후: AI가 생성한 창의적인 제목 그대로 유지 (예: "1개월 써보고 깨달은 OO의 진실")
  // 제목이 너무 짧거나 비어있을 때만 폴백 적용
  if (!t || t.length < 5) {
    t = prod ? `${prod} 실사용 후기` : (t || '실사용 후기');
  }

  t = normalizeTitleWhitespace(t);
  if (prod) {
    t = applyKeywordPrefixToTitle(t, prod);
  }
  return t;
}

function sanitizeReviewHeadingTitle(title: string, fallback: string, productName?: string): string {
  let t = String(title || '').trim();

  const prod = normalizeTitleWhitespace(removeEmojis(String(productName || ''))).trim();
  if (prod) {
    const normalized = normalizeTitleWhitespace(removeEmojis(t)).trim();
    if (normalized.startsWith(prod)) {
      t = normalized.slice(prod.length).trim();
      t = t.replace(/^[\s\-–—:|·•,]+/, '').trim();
    } else {
      t = normalized;
    }
  }

  // t = t.replace(/(직접\s*)?써보[고니]\s*/g, '');
  // t = t.replace(/(삶의\s*질\s*상승)/g, '');
  // t = t.replace(/(소름|난리|충격|경악|반전|실화|폭발|알고보니|비밀|진짜\s*이유)/g, '');
  // t = t.replace(/[!?]+/g, '').trim();
  t = normalizeTitleWhitespace(t);

  if (t.length < 4) return fallback;
  if (t.length > 50) return fallback;
  // if (/[,:;·•|]/.test(t)) return fallback;
  if (/(진심|정말|이렇게|느낌|보고|소름)/.test(t)) return fallback;
  // if (/(습니다|했어요|되더라고요|할\s*수\s*있|됩니다)\s*$/.test(t)) return fallback;
  if (t.split(/\s+/).filter(Boolean).length > 6) return fallback;
  return t;
}

function computeSeoTitleCriticalIssues(title: string): string[] {
  const issues: string[] = [];
  const t = String(title || '').trim();
  if (!t) {
    issues.push('제목이 비어있음');
    return issues;
  }
  const len = t.length;
  if (len < 22) issues.push('제목 너무 짧음');
  if (len > 40) issues.push('제목 너무 김');
  const hasNumber = /\d/.test(t);
  const seoTriggers = [
    '총정리', '완벽', '가이드', '비교', '차이', '해결', '꿀팁', '방법',
    '후기', '써본', '효과', '최신', '업데이트', '추천', '순위', 'TOP',
    '진짜', '실제', '직접', '비밀', '몰랐던', '이유'
  ];
  const hasSeoTrigger = seoTriggers.some(x => t.includes(x));
  if (!hasNumber && !hasSeoTrigger) issues.push('숫자/트리거 동시 부재');
  const forbiddenSeoPatterns = ['에 대해', '에 관한', '입니다', '합니다', '알아보겠'];
  if (forbiddenSeoPatterns.some(p => t.includes(p))) issues.push('설명체/딱딱한 어미');
  return issues;
}

function computeHomefeedTitleCriticalIssues(title: string): string[] {
  const issues: string[] = [];
  const t = String(title || '').trim();
  if (!t) {
    issues.push('제목이 비어있음');
    return issues;
  }
  const len = t.length;
  if (len < 24) issues.push('제목 너무 짧음');
  if (len > 45) issues.push('제목 너무 김');
  const emotionTriggers = [
    '충격', '경악', '소름', '반전', '눈물', '울컥', '분노', '논란',
    '난리', '폭발', '실화', '대박', '감동', '궁금', '비밀', '진실',
    '숨겨', '알고보니', '결국', '진짜', '직접', '현장', '실시간',
    '반응', '근황', '결과', '소식', '순간', '모습', '이유'
  ];
  const hasEmotionTrigger = emotionTriggers.some(x => t.includes(x));
  if (!hasEmotionTrigger) issues.push('매력적 키워드 부재');
  const forbiddenTitlePatterns = ['왜?', '왜일까?', '에 대해', '에 관한', '알아보겠습니다'];
  if (forbiddenTitlePatterns.some(p => t.includes(p))) issues.push('금지 표현 포함');
  return issues;
}

function computeHomefeedIntroCriticalIssues(intro: string | undefined): string[] {
  const issues: string[] = [];
  const s = String(intro || '').trim();
  if (!s) return issues;
  const lines = s.split(/[.!?]\s*/).filter(x => x.trim().length > 0).length;
  if (lines > 5) issues.push('도입부가 너무 김');
  return issues;
}

/**
 * ✅ 제목에 키워드가 포함되어 있는지 검증
 * - 생성된 제목이 입력 키워드를 정확히 반영하는지 확인
 * - 환각(Hallucination) 방지
 */
export function validateTitleContainsKeyword(title: string, keyword: string): {
  isValid: boolean;
  score: number;
  missingKeywords: string[];
  suggestion?: string;
} {
  const cleanTitle = (title || '').trim().toLowerCase();
  const cleanKeyword = (keyword || '').trim();

  if (!cleanKeyword) {
    return { isValid: true, score: 1, missingKeywords: [] };
  }

  // 복합 키워드 분리 (·, /, :, - 등)
  const complexSeparators = /[·\/:,\-–—|;]+/g;
  const segments = cleanKeyword.split(complexSeparators).map(s => s.trim()).filter(s => s.length >= 2);

  // 각 세그먼트에서 핵심 단어 추출
  const coreWords: string[] = [];
  for (const seg of segments) {
    const words = seg.split(/\s+/).filter(w => w.length >= 2);
    coreWords.push(...words);
  }

  // 불용어 제거
  const stopWords = new Set(['은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로', '와', '과', '도', '만', '까지', '부터']);
  const importantWords = coreWords.filter(w => !stopWords.has(w) && w.length >= 2);

  if (importantWords.length === 0) {
    return { isValid: true, score: 1, missingKeywords: [] };
  }

  // 제목에 포함된 키워드 확인
  const missingKeywords: string[] = [];
  let matchCount = 0;

  for (const word of importantWords) {
    if (cleanTitle.includes(word.toLowerCase())) {
      matchCount++;
    } else {
      missingKeywords.push(word);
    }
  }

  const score = matchCount / importantWords.length;
  const isValid = score >= 0.5; // 50% 이상 일치해야 유효

  // 개선 제안
  let suggestion: string | undefined;
  if (!isValid && missingKeywords.length > 0) {
    suggestion = `제목에 누락된 키워드: ${missingKeywords.join(', ')}. 키워드를 제목에 포함시키세요.`;
  }

  return { isValid, score, missingKeywords, suggestion };
}

/**
 * ✅ 제목에서 프롬프트 지침 누출 감지
 * - AI가 프롬프트 내부의 가이드라인 문구를 제목으로 생성한 경우 감지
 * - 본문과 관련없는 제목 생성 방지
 */
export function detectPromptLeakageInTitle(title: string, keyword: string): {
  isLeaked: boolean;
  leakagePatterns: string[];
  suggestion?: string;
} {
  const cleanTitle = (title || '').trim();
  const leakagePatterns: string[] = [];

  // ⚠️ 프롬프트 지침에서 자주 사용되는 문구들 (절대 제목에 포함되면 안 됨)
  const promptLeakagePatterns = [
    // 노출/SEO 관련 지침 문구
    '노출 0', '노출 극대화', '노출이 없', '검색 노출', 'SEO 최적화', '상위노출',
    // 체류시간/클릭률 관련
    '체류시간', '클릭률', '완독률', '이탈률', '참여도',
    // AI/봇 관련
    'AI 티', 'AI가', '봇 티', '챗봇',
    // 글쓰기 가이드라인 문구
    '~에 대해 알아보겠습니다', '소개해드리겠습니다', '알아보세요', '알아보자',
    '오늘은 ~에 대해', '이번 글에서는',
    // 해시태그/태그 관련
    '해시태그', '#', '태그',
    // 이모지 관련 가이드
    '이모지 때문', '이모지를 사용', '이모지 남용',
    // 도입부/마무리 가이드
    '도입부', '마무리부', '첫 3줄', '후킹',
    // 키워드 관련 가이드
    '키워드 밀도', '키워드 배치', '롱테일 키워드'
  ];

  // 패턴 검사
  for (const pattern of promptLeakagePatterns) {
    if (cleanTitle.toLowerCase().includes(pattern.toLowerCase())) {
      leakagePatterns.push(pattern);
    }
  }

  // 키워드와의 관련성 검사 (핵심 단어 기반)
  const keywordWords = (keyword || '').split(/[\s\-–—\/|·:,]+/).filter(w => w.length >= 2);
  const titleWords = cleanTitle.split(/[\s\-–—\/|·:,]+/).filter(w => w.length >= 2);

  // 키워드의 단어가 제목에 하나도 없으면 의심
  const hasKeywordMatch = keywordWords.some(kw =>
    titleWords.some(tw => tw.includes(kw) || kw.includes(tw))
  );

  // 프롬프트 누출이 있거나, 키워드와 전혀 관련없는 제목
  const isLeaked = leakagePatterns.length > 0 || (keywordWords.length > 0 && !hasKeywordMatch);

  let suggestion: string | undefined;
  if (leakagePatterns.length > 0) {
    suggestion = `⚠️ 프롬프트 지침 누출 감지: "${leakagePatterns.join('", "')}" 문구가 제목에 포함됨. 제목을 재생성해야 합니다.`;
    console.error(`[경고] 프롬프트 누출 감지: 제목="${cleanTitle}", 누출패턴=${JSON.stringify(leakagePatterns)}`);
  } else if (keywordWords.length > 0 && !hasKeywordMatch) {
    suggestion = `⚠️ 제목이 키워드 "${keyword}"와 관련이 없습니다. 키워드 포함 제목으로 재생성해야 합니다.`;
    console.error(`[경고] 키워드 불일치: 키워드="${keyword}", 제목="${cleanTitle}"`);
  }

  return { isLeaked, leakagePatterns, suggestion };
}

/**
 * ✅ 콘텐츠 환각(Hallucination) 위험도 평가
 * - 크롤링 결과가 부족할 때 AI가 정보를 지어낼 위험도 계산
 */
export function assessHallucinationRisk(source: {
  bodyText?: string;
  crawledContent?: string;
  urlCount?: number;
}): {
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let riskScore = 0;

  const bodyLength = (source.bodyText || '').length;
  const crawledLength = (source.crawledContent || '').length;
  const urlCount = source.urlCount || 0;

  // 크롤링된 콘텐츠 없음 → 고위험
  if (crawledLength < 500 && urlCount === 0) {
    riskScore += 40;
    warnings.push('실시간 정보 수집 실패: 크롤링된 콘텐츠 없음');
  }

  // 본문 내용 부족 → 중위험
  if (bodyLength < 1000) {
    riskScore += 30;
    warnings.push(`본문 내용 부족 (${bodyLength}자): AI가 정보를 추측할 수 있음`);
  }

  // URL 크롤링 실패
  if (urlCount > 0 && crawledLength < 500) {
    riskScore += 20;
    warnings.push('URL 크롤링 결과가 매우 적음');
  }

  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (riskScore >= 50) riskLevel = 'high';
  else if (riskScore >= 25) riskLevel = 'medium';

  return { riskLevel, score: riskScore, warnings };
}

function getPrimaryKeywordFromSource(source: ContentSource): string {
  return (source.metadata as any)?.keywords?.[0] ? String((source.metadata as any).keywords[0]).trim() : '';
}

function buildHomefeedDebateHookSummaryBlock(params: {
  title: string;
  primaryKeyword?: string;
}): string {
  const t = String(params.title || '').trim();
  const kw = String(params.primaryKeyword || '').trim();
  const topic = kw || t;
  if (!topic) return '';

  // ⚠️ 특정 문구(제목처럼 보이는 라벨) 없이, 자연스러운 서술로만 구성
  // - 홈피드 초반 체류/스크롤 신호용: 6~9줄 짧게, 구어체
  // - emoji 제거 로직이 있으므로 텍스트만으로 구성
  const line1 = kw
    ? `댓글창이 ${kw} 얘기만 나오면 진짜 둘로 갈려요.`
    : `댓글창이 이 주제만 나오면 진짜 둘로 갈려요.`;
  const line2 = `같은 걸 보고도 어떤 사람은 "별거 없다"고 하고, 어떤 사람은 "왜 나만 다르지?"라고 하더라고요.`;
  const line3 = `근데 가만 보면 갈리는 지점이 딱 세 가지예요.`;
  const line4 = kw ? `내 상황이 ${kw}랑 맞는지.` : `내 상황이 이 주제랑 맞는지.`;
  const line5 = `기대하는 결과가 "바로"인지, 아니면 "천천히"인지.`;
  const line6 = `지금 당장 해도 되는 타입인지, 잠깐 멈추는 게 나은 타입인지.`;
  const line7 = `아래에서 3분 안에 체크하고 바로 결론 내릴 수 있게 정리해둘게요.`;

  return [line1, line2, line3, line4, line5, line6, line7].join('\n');
}

function insertSummaryBlockAfterIntroBeforeFirstHeading(bodyPlain: string, headings: any[] | undefined, block: string): string {
  const text = String(bodyPlain || '');
  const b = String(block || '').trim();
  if (!text.trim() || !b) return text;
  if (text.includes('갈리는 지점이 딱 세 가지예요') || text.includes('3분 안에 체크하고 바로 결론')) return text;

  const firstHeadingTitle = String(headings?.[0]?.title || '').trim();
  if (!firstHeadingTitle) {
    return `${b}\n\n${text}`.trim();
  }

  const idx = text.indexOf(firstHeadingTitle);
  if (idx === -1) {
    return `${b}\n\n${text}`.trim();
  }

  const before = text.slice(0, idx).trimEnd();
  const after = text.slice(idx).trimStart();
  return `${before}\n\n${b}\n\n${after}`.trim();
}

function applyHomefeedNarrativeHookBlock(content: StructuredContent, source: ContentSource): StructuredContent {
  const mode = (source.contentMode || 'seo') as PromptMode;
  if (mode !== 'homefeed') return content;
  return content;
}

async function generateTitleOnlyPatch(source: ContentSource, mode: PromptMode): Promise<{
  selectedTitle?: string;
  titleCandidates?: TitleCandidate[];
  titleAlternatives?: string[];
}> {
  const categoryHint = source.categoryHint as string | undefined;
  const primaryKeyword = getPrimaryKeywordFromSource(source);
  const systemPrompt = buildFullPrompt(mode, categoryHint, false);

  const schema = `Output ONLY valid JSON. NO markdown.\n\n{\n  "selectedTitle": "string",\n  "titleCandidates": [\n    {"text": "string", "score": 95, "reasoning": "string"},\n    {"text": "string", "score": 90, "reasoning": "string"},\n    {"text": "string", "score": 85, "reasoning": "string"}\n  ]\n}`;

  const subKeywords = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords
      .slice(1)
      .filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k)))
      .slice(0, 5)
      .join(', ')
    : '';

  const titleRules = mode === 'homefeed'
    ? `홈판 모드 제목 규칙: 100점 클릭률을 위해 '정보 간극(Information Gap)' 공식을 사용하세요. **[필수] 메인 키워드(인물/상품명)를 제목에 반드시 포함하십시오.** 원본 내용에서 크게 벗어난 '낚시 전용' 제목(예: 뜬금없는 걷기 운동 등)은 절대 생성하지 마세요.`
    : `SEO 모드 제목 규칙: **메인 키워드를 제목 최상단 3글자 내에 반드시 배치**하고, 서브 키워드를 '디테일한 정보'로 활용하십시오.`;

  const articleSnippet = source.rawText ? source.rawText.substring(0, 1000) : '';
  const originalTitle = source.title || '';

  const prompt = `
${systemPrompt}

${schema}

[TASK]
아래 조건으로 제목 3개만 생성하세요. 본문/소제목/해시태그는 절대 생성하지 마세요.

- mode: ${mode}
- originalTitle (원본 제목): ${originalTitle || '(없음)'}
- primaryKeyword: ${primaryKeyword || '(없음)'}
- subKeywords (서브키워드): ${subKeywords || '(없음)'}
- titleRules: ${titleRules}

[ARTICLE CONTENT SNIPPET]
${articleSnippet}

JSON:
`.trim();

  const raw = await callGemini(prompt, 0.65, 650);
  const parsed = safeParseJson<any>(raw);

  const selectedTitle = typeof parsed?.selectedTitle === 'string' ? String(parsed.selectedTitle).trim() : undefined;
  const titleCandidates = Array.isArray(parsed?.titleCandidates)
    ? parsed.titleCandidates
      .map((c: any) => ({
        text: String(c?.text || '').trim(),
        score: Number(c?.score) || 0,
        reasoning: String(c?.reasoning || '').trim(),
      }))
      .filter((c: any) => c.text)
    : undefined;

  const titleAlternatives = titleCandidates?.map((c: any) => c.text).filter(Boolean) || undefined;

  return { selectedTitle, titleCandidates, titleAlternatives };
}

async function generateHomefeedIntroOnlyPatch(source: ContentSource, current: StructuredContent): Promise<{ introduction?: string } | null> {
  const categoryHint = source.categoryHint as string | undefined;
  const systemPrompt = buildFullPrompt('homefeed', categoryHint, false);
  const selectedTitle = String(current?.selectedTitle || '').trim();

  const schema = `Output ONLY valid JSON. NO markdown.\n\n{\n  "introduction": "string"\n}`;

  const prompt = `
${systemPrompt}

${schema}

[TASK]
홈판 모드 도입부만 다시 작성하세요.
- 정확히 3줄
- 첫 문장 25자 이내
- 배경 설명/요약/정리 금지
- 문체: 구어체 "~해요"

제목: ${selectedTitle || '(없음)'}

현재 도입부(문제 있음):
${String(current?.introduction || '').trim()}

JSON:
`.trim();

  try {
    const raw = await callGemini(prompt, 0.9, 450);
    const parsed = safeParseJson<any>(raw);
    const introduction = typeof parsed?.introduction === 'string' ? String(parsed.introduction).trim() : '';
    if (!introduction) return null;
    return { introduction };
  } catch {
    return null;
  }
}

function mergeSeoWithHomefeedOverlay(seo: StructuredContent, homefeed: StructuredContent, source: ContentSource): StructuredContent {
  const merged: StructuredContent = {
    ...seo,
    introduction: homefeed.introduction || seo.introduction,
  };

  const primaryKeyword = getPrimaryKeywordFromSource(source);
  const candidates = new Map<string, { seo: number; home: number; reason: string }>();

  const upsert = (text: string, reason: string) => {
    const t = String(text || '').trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (!candidates.has(key)) {
      candidates.set(key, { seo: 0, home: 0, reason });
    }
  };

  (seo.titleCandidates || []).forEach((c) => upsert(c.text, c.reasoning || 'seo'));
  (homefeed.titleCandidates || []).forEach((c) => upsert(c.text, c.reasoning || 'homefeed'));

  const scored = Array.from(candidates.entries()).map(([key, v]) => {
    const realText =
      (seo.titleCandidates || []).find(c => c.text.toLowerCase() === key)?.text ||
      (homefeed.titleCandidates || []).find(c => c.text.toLowerCase() === key)?.text ||
      key;

    const seoIssues = computeSeoTitleCriticalIssues(realText);
    const homeIssues = computeHomefeedTitleCriticalIssues(realText);

    let kwBonus = 0;
    if (primaryKeyword) {
      const normalized = realText.replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '').toLowerCase();
      const kwN = primaryKeyword.replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '').toLowerCase();
      if (kwN && normalized.includes(kwN)) kwBonus = 8;
      if (kwN && normalized.startsWith(kwN)) kwBonus = 12;
    }

    const seoScore = Math.max(0, 100 - (seoIssues.length * 25)) + kwBonus;
    const homeScore = Math.max(0, 100 - (homeIssues.length * 30));
    const finalScore = Math.round(seoScore * 0.2 + homeScore * 0.8);

    return {
      text: realText,
      finalScore,
      seoScore,
      homeScore,
      reasoning: `${v.reason}`,
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  if (scored.length > 0) {
    merged.selectedTitle = scored[0].text;
    merged.titleCandidates = scored.slice(0, 6).map((s) => ({
      text: s.text,
      score: s.finalScore,
      reasoning: `seo=${s.seoScore},home=${s.homeScore}`,
    }));
    merged.titleAlternatives = merged.titleCandidates.map(c => c.text);
  }

  if (!merged.quality) {
    merged.quality = {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 0,
      originalityScore: 0,
      readabilityScore: 0,
      warnings: [],
    };
  }
  merged.quality.warnings = [
    ...(merged.quality.warnings || []),
    'HybridOverlay: SEO 본문 + 홈판 상단 레이어 적용',
  ];

  // ✅ 하이브리드 결과물은 홈피드 상단 전략을 기본 적용(요청 모드가 seo여도)
  const forcedHomefeedSource: ContentSource = { ...source, contentMode: 'homefeed' };
  applyHomefeedNarrativeHookBlock(merged, forcedHomefeedSource);
  return finalizeStructuredContent(merged, source);
}

function finalizeStructuredContent(content: StructuredContent, source: ContentSource): StructuredContent {
  let finalContent = removeEmojisFromContent(content);
  // ✅ 소제목 길이 제한 (60자 이내로 완화 - 너무 짧으면 정보 전달력 하락)
  finalContent = truncateHeadingTitles(finalContent, 60);

  try {
    if (finalContent.selectedTitle) {
      finalContent.selectedTitle = cleanupTrailingTitleTokens(cleanupStartingTitleTokens(finalContent.selectedTitle));
    }
    if (Array.isArray(finalContent.titleAlternatives)) {
      finalContent.titleAlternatives = finalContent.titleAlternatives
        .map((t) => cleanupTrailingTitleTokens(cleanupStartingTitleTokens(t)))
        .filter(Boolean);
    }
    if (Array.isArray(finalContent.titleCandidates)) {
      finalContent.titleCandidates = finalContent.titleCandidates.map((c: any) => ({
        ...c,
        text: cleanupTrailingTitleTokens(cleanupStartingTitleTokens(c?.text)),
      }));
    }

    // 본문 전체 클리닝 (?: 등 제거)
    if (finalContent.bodyPlain) {
      finalContent.bodyPlain = removeOrdinalHeadingLabelsFromBody(finalContent.bodyPlain);
    }
    if (finalContent.bodyHtml) {
      finalContent.bodyHtml = removeOrdinalHeadingLabelsFromBody(finalContent.bodyHtml);
    }

    // ✅ [신규] 소제목 본문에도 HTML 태그 제거 적용 (<u>, <b>, <i> 등)
    if (Array.isArray(finalContent.headings)) {
      finalContent.headings = finalContent.headings.map((h: any) => ({
        ...h,
        body: h.body ? removeOrdinalHeadingLabelsFromBody(String(h.body)) : h.body
      }));
    }
  } catch {
    // ignore
  }

  // ✅ 제품/쇼핑/IT 리뷰: 상품명 prefix 우선 적용 (제목이 상품명으로 반드시 시작)
  if (isReviewArticleType(source?.articleType)) {
    const productName = getReviewProductName(source);
    if (productName) {
      applyKeywordPrefixToStructuredContent(finalContent, productName);
    }
  }
  const primaryKeyword = (source.metadata as any)?.keywords?.[0]
    ? String((source.metadata as any).keywords[0]).trim()
    : '';
  if (primaryKeyword) {
    try {
      const pn = isReviewArticleType(source?.articleType) ? String(getReviewProductName(source) || '').trim() : '';
      const n = (s: string) => String(s || '').replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '').toLowerCase();
      const pnN = n(pn);
      const pkN = n(primaryKeyword);
      if (pnN && pkN && (pnN.includes(pkN) || pkN.includes(pnN))) {
        return finalContent;
      }
    } catch {
      // ignore
    }
    applyKeywordPrefixToStructuredContent(finalContent, primaryKeyword);
  }
  applyHomefeedNarrativeHookBlock(finalContent, source);
  try {
    applyOrdinalHeadingMarkerFix(finalContent);
  } catch {
    // ignore
  }

  // ✅ [2026-01-19 수정] affiliate 모드 수익 배분 고지는 최상단에 삽입됨
  // 마무리글에 중복 삽입하지 않음 (사용자 요청)
  // if (source.contentMode === 'affiliate') { ... } 제거됨

  return finalContent;
}

function applyOrdinalHeadingMarkerFix(content: StructuredContent): void {
  const headings = Array.isArray(content?.headings) ? content.headings : [];
  if (headings.length === 0) return;

  const replace = (input: string): string => {
    const text = String(input || '');
    if (!text) return text;
    const re = /^\s*(?:(?:(?:제\s*)?\d+|(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열))\s*번째\s*)?소제목\s*[:：]\s*/gmi;
    let i = 0;
    return text.replace(re, () => {
      const title = String((headings[i] as any)?.title || '').trim();
      i += 1;
      // title이 비어있거나 ? 만 있는 경우 : 을 붙이지 않음
      if (!title || title === '?' || title === '？') return '';
      return `${title}: `;
    });
  };

  if (content.bodyPlain) content.bodyPlain = replace(content.bodyPlain);
  if (content.bodyHtml) content.bodyHtml = replace(content.bodyHtml);
}

// ✅ 생성된 콘텐츠에서 이모지 제거 (StructuredContent 전체)
function removeEmojisFromContent(content: StructuredContent): StructuredContent {
  if (!content) return content;

  // 제목에서 이모지 제거
  if (content.selectedTitle) {
    content.selectedTitle = removeEmojis(content.selectedTitle);
  }

  // 소제목에서 이모지 제거
  if (content.headings) {
    content.headings = content.headings.map(h => ({
      ...h,
      title: removeEmojis(h.title),
      content: h.content
    }));
  }

  // 해시태그에서 이모지 제거
  if (content.hashtags) {
    content.hashtags = content.hashtags.map(tag => removeEmojis(tag));
  }

  console.log('[ContentGenerator] ✅ 이모지 자동 제거 완료');
  return content;
}

// ✅ [2026-01-21] 소제목 길이 제한 (30자 이내로 완화 - 제품명 포함 가능)
function truncateHeadingTitles(content: StructuredContent, maxLength: number = 30): StructuredContent {
  if (!content || !content.headings) return content;

  const truncateTitle = (title: string): string => {
    const cleaned = String(title || '').trim();
    if (cleaned.length <= maxLength) return cleaned;

    // 30자 이내에서 자연스러운 끊김 찾기
    let truncated = cleaned.substring(0, maxLength);

    // 마지막 단어가 잘렸을 경우, 마지막 공백 또는 조사 위치에서 자르기
    const lastSpaceIdx = truncated.lastIndexOf(' ');
    const lastCommaIdx = truncated.lastIndexOf(',');

    // 공백이나 쉼표가 있으면 그 위치에서 자르기
    if (lastSpaceIdx > maxLength * 0.5) {
      truncated = truncated.substring(0, lastSpaceIdx);
    } else if (lastCommaIdx > maxLength * 0.5) {
      truncated = truncated.substring(0, lastCommaIdx);
    }

    // 끝 부분 정리 (조사, 마침표, 쉼표, 불필요한 어미 등 제거)
    truncated = truncated.replace(/[,\.!\?\s의가를에서으로와]*$/, '').trim();

    // 만약 너무 짧아지면 원본에서 그냥 앞에서부터 자르기
    if (truncated.length < 5) {
      truncated = cleaned.substring(0, maxLength).trim();
    }

    console.log(`[ContentGenerator] 소제목 최적화 절삭: "${cleaned.substring(0, 35)}..." → "${truncated}"`);
    return truncated;
  };

  content.headings = content.headings.map(h => ({
    ...h,
    title: truncateTitle(h.title)
  }));

  console.log('[ContentGenerator] ✅ 소제목 길이 제한 (30자 이내) 적용 완료');
  return content;
}

// ✅ 템플릿 캐시 (카테고리별)
const templateCache = new Map<string, { prompt: string; timestamp: number }>();
const CACHE_EXPIRY_MS = 1000 * 60 * 30; // 30분

// ✅ 카테고리별 프리셋
export interface ContentPreset {
  name: string;
  categoryHint: SourceCategoryHint;
  articleType: ArticleType;
  targetAge: '20s' | '30s' | '40s' | '50s' | 'all';
  minChars: number;
  provider: ContentGeneratorProvider;
  description: string;
}

/**
 * 프리셋을 소스에 적용
 * @param presetKey 프리셋 키
 * @param source 기본 소스 (선택사항)
 * @returns 프리셋이 적용된 소스
 */
export function applyPreset(presetKey: string, source?: Partial<ContentSource>): ContentSource {
  const preset = CONTENT_PRESETS[presetKey];
  if (!preset) {
    throw new Error(`프리셋을 찾을 수 없습니다: ${presetKey}`);
  }

  return {
    sourceType: 'custom_text',
    categoryHint: preset.categoryHint,
    articleType: preset.articleType,
    targetAge: preset.targetAge,
    rawText: source?.rawText || '',
    productInfo: source?.productInfo,
    personalExperience: source?.personalExperience,
  };
}

// ✅ 모든 카테고리 기본 글자수: 2800자 (양보다 질, 알찬 내용)
export const CONTENT_PRESETS: Record<string, ContentPreset> = {
  // 쇼핑/리뷰 프리셋
  shopping_review: {
    name: '쇼핑 리뷰',
    categoryHint: '쇼핑',
    articleType: 'shopping_review',
    targetAge: 'all',
    minChars: 2500, // ✅ 쇼핑 리뷰: 2500~3000자 (이미지 중심이라 약간 짧게)
    provider: 'gemini',
    description: '제품 리뷰 및 쇼핑 후기 (모든 연령대)',
  },
  it_review: {
    name: 'IT 제품 리뷰',
    categoryHint: 'IT',
    articleType: 'it_review',
    targetAge: 'all',
    minChars: 2800, // ✅ IT 리뷰: 2800~3300자
    provider: 'gemini',
    description: 'IT 제품 상세 리뷰 (모든 연령대)',
  },
  // 연예/스포츠 프리셋
  entertainment: {
    name: '연예 뉴스',
    categoryHint: '연예',
    articleType: 'entertainment',
    targetAge: 'all',
    minChars: 2800, // ✅ 연예 뉴스: 2800~3300자
    provider: 'gemini',
    description: '연예인 소식 및 이슈 (모든 연령대)',
  },
  sports: {
    name: '스포츠 뉴스',
    categoryHint: '스포츠',
    articleType: 'sports',
    targetAge: 'all',
    minChars: 2800, // ✅ 스포츠 뉴스: 2800~3300자
    provider: 'gemini',
    description: '스포츠 경기 및 선수 소식 (모든 연령대)',
  },
  // 라이프스타일 프리셋
  food_review: {
    name: '맛집 리뷰',
    categoryHint: '맛집',
    articleType: 'general',
    targetAge: 'all',
    minChars: 2800, // ✅ 맛집 후기: 2800~3300자
    provider: 'gemini',
    description: '맛집 방문 후기 및 추천 (모든 연령대)',
  },
  travel: {
    name: '여행 후기',
    categoryHint: '여행',
    articleType: 'general',
    targetAge: 'all',
    minChars: 3000, // ✅ 여행 후기: 3000~3500자 (상세하게)
    provider: 'gemini',
    description: '여행지 소개 및 후기 (모든 연령대)',
  },
  // 육아/교육 프리셋
  parenting: {
    name: '육아 정보',
    categoryHint: '육아',
    articleType: 'general',
    targetAge: 'all',
    minChars: 2800, // ✅ 육아 정보: 2800~3300자
    provider: 'gemini',
    description: '육아 팁 및 정보 공유 (모든 연령대)',
  },
  // 재테크 프리셋
  finance: {
    name: '재테크 정보',
    categoryHint: '재테크',
    articleType: 'finance',
    targetAge: 'all',
    minChars: 2800, // ✅ 재테크: 2800~3300자
    provider: 'gemini',
    description: '재테크 및 투자 정보 (모든 연령대)',
  },
};

export type SourceCategoryHint =
  // 기존 카테고리
  | '연예' | '스포츠' | '건강' | '경제' | 'IT' | '쇼핑'
  // 라이프스타일
  | '여행' | '음식' | '맛집' | '레시피' | '요리'
  | '패션' | '뷰티' | '메이크업' | '스킨케어' | '헤어'
  | '리빙' | '인테리어' | 'DIY' | '홈데코' | '정리수납'
  // 육아/교육
  | '육아' | '교육' | '임신' | '출산' | '유아' | '초등' | '중등' | '고등'
  | '학습' | '영어' | '독서' | '놀이' | '장난감'
  // 재테크/부동산
  | '재테크' | '투자' | '주식' | '부동산' | '세금' | '절세' | '금융'
  | '적금' | '예금' | '펀드' | '코인' | '암호화폐'
  // 취미/문화
  | '영화' | '드라마' | '책' | '음악' | '게임' | '애니메이션'
  | '사진' | '카메라' | '취미' | '공예' | '그림'
  // 반려동물
  | '반려동물' | '강아지' | '고양이' | '펫푸드' | '펫용품'
  // 자동차
  | '자동차' | '카리뷰' | '중고차' | '카테크' | '자동차용품'
  // 직장/커리어
  | '직장' | '취업' | '이직' | '커리어' | '자기계발' | '부업'
  // 기타 (자유 입력용)
  | '기타'
  // 문자열도 허용 (사용자 커스텀)
  | string;
export type ContentGeneratorProvider = 'gemini' | 'openai' | 'claude' | 'perplexity';

export type ArticleType =
  // 뉴스/정보
  | 'news'
  | 'sports'
  | 'health'
  | 'finance'
  | 'general'
  // 리뷰
  | 'it_review'
  | 'shopping_review'
  | 'product_review'
  | 'place_review'
  | 'restaurant_review'
  // 라이프스타일
  | 'travel'
  | 'food'
  | 'recipe'
  | 'fashion'
  | 'beauty'
  | 'interior'
  // 육아/교육
  | 'parenting'
  | 'education'
  | 'learning'
  // 취미/문화
  | 'hobby'
  | 'culture'
  | 'entertainment'
  // 기타
  | 'tips'
  | 'howto'
  | 'guide'
  | 'traffic-hunter';

export interface ProductInfo {
  name: string;
  brand?: string;
  price: number;
  category: string;
  purchaseLink?: string;
  specs?: Record<string, unknown>;
}

export type TargetTrafficStrategy = 'viral' | 'steady';

export interface ContentSource {
  sourceType: 'naver_news' | 'daum_news' | 'custom_text';
  url?: string;
  title?: string;
  rawText: string;
  crawledTime?: string;
  categoryHint?: SourceCategoryHint | string;
  metadata?: Record<string, unknown>;
  generator?: ContentGeneratorProvider;
  articleType?: ArticleType;
  productInfo?: ProductInfo;
  personalExperience?: string;
  targetTraffic?: TargetTrafficStrategy;
  targetAge?: '20s' | '30s' | '40s' | '50s' | 'all';
  toneStyle?: 'friendly' | 'professional' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe'; // ✅ 글 톤/스타일 (찐팬, 맘카페 포함)
  contentMode?: 'seo' | 'homefeed' | 'traffic-hunter' | 'affiliate' | 'custom'; // ✅ 4가지 모드 + 트래픽 사냥꾼
  isFullAuto?: boolean; // ✅ 완전자동 발행 모드 (자동화 보조 프롬프트 적용)
  isReviewType?: boolean; // ✅ 리뷰형 글 (구매전환 유도)
  customPrompt?: string; // ✅ 사용자 정의 프롬프트 (추가 지시사항)
  images?: string[]; // ✅ 크롤링된 이미지 URL 목록 (Shopping Connect)
}
export interface TitleCandidate {
  text: string;
  score: number;
  reasoning: string;
}

export interface HeadingPlan {
  title: string;
  content?: string;  // ✅ Gemini가 생성하는 본문 내용
  summary: string;
  keywords: string[];
  imagePrompt: string;
}

export type RiskLevel = 'low' | 'medium' | 'high';
export type LegalRiskLevel = 'safe' | 'caution' | 'danger';

export interface GeneratedContentMetadata {
  category: SourceCategoryHint | string;
  targetAge: '20s' | '30s' | '40s' | '50s' | 'all';
  urgency: 'breaking' | 'depth' | 'evergreen';
  estimatedReadTime: string;
  wordCount: number;
  aiDetectionRisk: RiskLevel;
  legalRisk: LegalRiskLevel;
  seoScore: number;
  keywordStrategy: string;
  publishTimeRecommend: string;
  originalTitle?: string;
  tone?: 'friendly' | 'expert' | 'relatable';
  estimatedEngagement?: {
    views: number;
    comments: number;
    shares: number;
  };
}

export interface QualitySignals {
  aiDetectionRisk: RiskLevel;
  legalRisk: LegalRiskLevel;
  seoScore: number;
  originalityScore: number;
  readabilityScore: number;
  warnings: string[];
  viralPotential?: number;
  engagementScore?: number;
}

export interface ImagePlan {
  heading: string;
  prompt: string;
  placement: string;
  alt: string;
  caption: string;
}

export interface CommentTrigger {
  position: number;
  type: 'opinion' | 'experience' | 'vote';
  text: string;
}

export interface ShareTrigger {
  position: number;
  quote: string;
  prompt: string;
}

export interface BookmarkValue {
  reason: string;
  seriesPromise: string;
}

export interface ViralHooks {
  commentTriggers: CommentTrigger[];
  shareTrigger: ShareTrigger;
  bookmarkValue: BookmarkValue;
}

export interface TrafficStrategy {
  peakTrafficTime: string;
  publishRecommendTime: string;
  shareableQuote: string;
  controversyLevel: 'none' | 'low' | 'medium';
  retentionHook: string;
}

export interface PostPublishActions {
  selfComments: string[];
  shareMessage: string;
  notificationMessage: string;
}

export interface StructuredContent {
  status: 'success' | 'warning' | 'error';
  generationTime: string;
  selectedTitle: string;
  titleAlternatives: string[];
  titleCandidates: TitleCandidate[];
  bodyHtml: string;
  bodyPlain: string;
  content?: string;
  headings: HeadingPlan[];
  hashtags: string[];
  images: ImagePlan[];
  metadata: GeneratedContentMetadata;
  quality: QualitySignals;
  introduction?: string; // ✅ 도입부 (홈판 모드: 3줄 권장)
  conclusion?: string;   // ✅ 마무리 (홈판 모드: 여운형 2줄)
  viralHooks?: ViralHooks;
  trafficStrategy?: TrafficStrategy;
  postPublishActions?: PostPublishActions;
  cta?: {
    text: string;
    link?: string;
  };
  collectedImages?: string[]; // ✅ 소스에서 수집된 이미지 확인용
}
interface GenerateOptions {
  provider?: ContentGeneratorProvider;
  minChars?: number;
  contentMode?: 'seo' | 'homefeed'; // ✅ SEO 모드 또는 홈판 노출 최적화 모드
}

// ════════════════════════════════════════════════════════════════════════════
// ✅ 2026 금지 소제목 패턴 검증 함수 (쇼핑커넥트 100점 달성용)
// ════════════════════════════════════════════════════════════════════════════

const BANNED_HEADING_PATTERNS = [
  // 범용적 템플릿 표현
  '삶의 질이 달라졌', '삶의 질이 달라졌네요', '삶의 질이 달라졌어요',
  '실제 체감하는 성능 변화', '실제 체감하는 변화', '체감하는 성능 변화',
  '소음 짜증 다 사라졌', '소음 다 사라졌어요',
  '이것 하나로 끝', '이것만 알면 끝', '이거 하나로 끝',
  '결정적 포인트', '핵심 포인트', '꿀팁 포인트',
  '직접 써보니 알았다', '직접 해보니 알겠더라고요', '직접 써보니 알겠더라',
  '실사용자가 말하는 편의성', '실사용자 후기',
  '위생과 관리의 결정적 포인트', '위생과 관리의 포인트',
  // 카테고리별 금지 패턴
  '피부가 달라졌어요', '피부가 달라졌네요',
  '입맛이 돌아왔어요', '입맛이 살아났어요',
  '스타일이 달라졌어요', '패션이 달라졌어요',
  '드라이빙이 달라졌어요', '운전이 달라졌어요',
  '육아가 편해졌어요', '육아가 달라졌어요',
  '반려생활이 달라졌어요', '펫 라이프가 달라졌어요',
  '여행이 편해졌어요', '여행이 달라졌어요',
  // 추가 범용 패턴
  '인생템 발견', '인생템을 만났', '갓성비',
  '강력 추천', '무조건 사세요', '안 사면 후회',
];

/**
 * 생성된 소제목에서 금지 패턴 감지
 * @returns 감지된 금지 패턴 목록 (없으면 빈 배열)
 */
export function detectBannedHeadingPatterns(headings: Array<{ title: string }>): string[] {
  const detectedPatterns: string[] = [];

  for (const heading of headings) {
    const titleLower = heading.title.toLowerCase();
    for (const pattern of BANNED_HEADING_PATTERNS) {
      if (titleLower.includes(pattern.toLowerCase())) {
        detectedPatterns.push(`"${heading.title}" contains banned pattern: "${pattern}"`);
      }
    }
  }

  if (detectedPatterns.length > 0) {
    console.warn(`[Shopping Connect] ⚠️ 금지 패턴 ${detectedPatterns.length}개 감지됨:`, detectedPatterns);
  }

  return detectedPatterns;
}

/**
 * 생성된 콘텐츠 품질 검증 (쇼핑커넥트 전용)
 * @returns 품질 점수 (0-100)와 피드백
 */
export function validateShoppingConnectContent(content: StructuredContent): { score: number; feedback: string[] } {
  const feedback: string[] = [];
  let score = 100;

  // 1. 소제목 수 체크 (5~6개 필수)
  const headingCount = content.headings?.length || 0;
  if (headingCount < 5) {
    score -= 20;
    feedback.push(`❌ 소제목 ${headingCount}개 (5개 이상 필요)`);
  } else {
    feedback.push(`✅ 소제목 ${headingCount}개`);
  }

  // 2. 금지 패턴 체크
  const bannedPatterns = detectBannedHeadingPatterns(content.headings || []);
  if (bannedPatterns.length > 0) {
    score -= bannedPatterns.length * 10;
    feedback.push(`❌ 금지 패턴 ${bannedPatterns.length}개 감지`);
    bannedPatterns.forEach(p => feedback.push(`   - ${p}`));
  } else {
    feedback.push(`✅ 금지 패턴 없음`);
  }

  // 3. 글자수 체크 (2500자 이상)
  const totalChars = content.headings?.reduce((sum, h) => sum + (h.content?.length || 0), 0) || 0;
  if (totalChars < 2500) {
    score -= 15;
    feedback.push(`⚠️ 본문 ${totalChars}자 (2500자 이상 권장)`);
  } else {
    feedback.push(`✅ 본문 ${totalChars}자`);
  }

  // 4. 쇼핑커넥트 문구 체크
  const conclusionText = content.conclusion || '';
  if (!conclusionText.includes('쇼핑커넥트') && !conclusionText.includes('수수료')) {
    score -= 10;
    feedback.push(`⚠️ 쇼핑커넥트 고지 문구 누락`);
  } else {
    feedback.push(`✅ 쇼핑커넥트 고지 문구 포함`);
  }

  console.log(`[Shopping Connect] 📊 콘텐츠 품질 점수: ${score}/100`);
  return { score: Math.max(0, score), feedback };
}

/**
 * 현재 계절 감지
 */
function getCurrentSeason(): { season: string; keywords: string[] } {
  const month = new Date().getMonth() + 1;

  if (month >= 3 && month <= 5) {
    return { season: '봄', keywords: ['봄', '벚꽃', '나들이'] };
  } else if (month >= 6 && month <= 8) {
    return { season: '여름', keywords: ['여름', '휴가', '바다'] };
  } else if (month >= 9 && month <= 11) {
    return { season: '가을', keywords: ['가을', '단풍', '추석'] };
  } else {
    return { season: '겨울', keywords: ['겨울', '크리스마스', '스키'] };
  }
}

/**
 * 최적 발행 시간 계산
 */
function getOptimalPublishTime(
  category: string,
  targetAge: string,
  trafficStrategy: string,
): string {
  const now = new Date();
  let recommendHour = 21;

  if (targetAge === '20s') {
    recommendHour = trafficStrategy === 'viral' ? 22 : 20;
  } else if (targetAge === '30s') {
    recommendHour = trafficStrategy === 'viral' ? 21 : 19;
  } else if (targetAge === '40s' || targetAge === '50s') {
    recommendHour = trafficStrategy === 'viral' ? 20 : 14;
  }

  if (category === '육아' || category === '교육') {
    recommendHour = 10;
  }

  const recommendTime = new Date(now);
  recommendTime.setHours(recommendHour, 0, 0, 0);

  return recommendTime.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * 콘텐츠에서 키워드 추출
 */
function extractKeywordsFromContent(content: string): string[] {
  if (!content) return [];

  const koreanWords = content.match(/[가-힣]{2,}/g) || [];
  const frequency: Record<string, number> = {};

  koreanWords.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  const sortedKeywords = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  return sortedKeywords.slice(0, 10);
}

// ✅ 네이버 블로그 전체 카테고리별 최적 글톤 자동 매칭
function getAutoToneByCategory(category: string | undefined): 'friendly' | 'professional' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe' {
  if (!category) return 'friendly';

  const cat = category.toLowerCase();

  // ═══════════════════════════════════════════════════════════════
  // 📚 엔터테인먼트·예술 → 캐주얼/친근한 (감성적, 취향 공유)
  // ═══════════════════════════════════════════════════════════════

  // 문학·책 → 친근한 (독서 후기, 책 추천)
  if (/문학|책|독서|소설|시집|에세이|베스트셀러/.test(cat)) {
    return 'friendly';
  }

  // 영화 → 캐주얼 (영화 리뷰, 후기)
  if (/영화|시네마|극장|개봉|영화관/.test(cat)) {
    return 'casual';
  }

  // 미술·디자인 → 친근한 (전시 후기, 작품 감상)
  if (/미술|디자인|아트|전시회|갤러리|그림/.test(cat)) {
    return 'friendly';
  }

  // 공연·전시 → 친근한 (뮤지컬, 콘서트 후기)
  if (/공연|전시|뮤지컬|콘서트|연극|오페라/.test(cat)) {
    return 'friendly';
  }

  // 음악 → 캐주얼 (음악 추천, 앨범 리뷰)
  if (/음악|노래|앨범|가요|팝|힙합|발라드/.test(cat)) {
    return 'casual';
  }

  // 드라마 → 캐주얼 (드라마 리뷰, 줄거리)
  if (/드라마|넷플릭스|티빙|웨이브|디즈니/.test(cat)) {
    return 'casual';
  }

  // 스타·연예인 → 캐주얼 (연예 뉴스, 가십)
  if (/스타|연예인|연예|아이돌|가수|배우|셀럽|예능|방송/.test(cat)) {
    return 'casual';
  }

  // 만화·애니 → 캐주얼 (덕후 문화, 가벼운 톤)
  if (/만화|애니|웹툰|애니메이션|코믹스/.test(cat)) {
    return 'casual';
  }

  // 방송 → 캐주얼 (예능, TV 프로그램)
  if (/방송|TV|프로그램|예능|버라이어티/.test(cat)) {
    return 'casual';
  }

  // ═══════════════════════════════════════════════════════════════
  // 🏠 생활·노하우·쇼핑 → 친근한 (일상 공유, 후기)
  // ═══════════════════════════════════════════════════════════════

  // 일상·생각 → 친근한 (개인 일기, 일상 공유)
  if (/일상|생각|다이어리|하루|나의|오늘/.test(cat)) {
    return 'friendly';
  }

  // 육아·결혼 → 친근한 (엄마들 커뮤니티)
  if (/육아|결혼|아이|출산|임신|유아|초등|어린이|가족|웨딩|신혼/.test(cat)) {
    return 'friendly';
  }

  // 반려동물 → 친근한 (귀여움 + 정보)
  if (/반려|강아지|고양이|펫|동물|댕댕이|냥이/.test(cat)) {
    return 'friendly';
  }

  // 좋은글·이미지 → 친근한 (감성, 힐링)
  if (/좋은글|이미지|명언|감성|힐링|위로/.test(cat)) {
    return 'friendly';
  }

  // 패션·미용 → 친근한 (후기, 추천)
  if (/패션|미용|뷰티|화장품|옷|코디|스타일|메이크업|스킨케어/.test(cat)) {
    return 'friendly';
  }

  // 인테리어·DIY → 친근한 (집꾸미기, 홈데코)
  if (/인테리어|DIY|홈|데코|가구|리빙|집꾸미기|셀프/.test(cat)) {
    return 'friendly';
  }

  // 요리·레시피 → 친근한 (레시피 공유)
  if (/요리|레시피|음식|밥|반찬|베이킹|쿠킹/.test(cat)) {
    return 'friendly';
  }

  // 상품리뷰 → 친근한 (솔직 후기)
  if (/상품|리뷰|후기|언박싱|구매/.test(cat)) {
    return 'friendly';
  }

  // 원예·재배 → 친근한 (식물 키우기)
  if (/원예|재배|식물|화분|가드닝|텃밭/.test(cat)) {
    return 'friendly';
  }

  // ═══════════════════════════════════════════════════════════════
  // 🎮 취미·여가·여행 → 캐주얼 (즐거운 경험 공유)
  // ═══════════════════════════════════════════════════════════════

  // 게임 → 캐주얼 (게임 리뷰, 공략)
  if (/게임|롤|배그|피파|닌텐도|플스|엑스박스|모바일게임/.test(cat)) {
    return 'casual';
  }

  // 스포츠 → 캐주얼 (경기 리뷰, 응원)
  if (/스포츠|축구|야구|농구|배구|테니스|골프|운동/.test(cat)) {
    return 'casual';
  }

  // 사진 → 친근한 (사진 공유, 출사)
  if (/사진|카메라|출사|포토|촬영/.test(cat)) {
    return 'friendly';
  }

  // 자동차 → 전문적 (스펙, 성능 분석)
  if (/자동차|차|카|SUV|세단|전기차|튜닝/.test(cat)) {
    return 'professional';
  }

  // 취미 → 캐주얼 (다양한 취미 활동)
  if (/취미|DIY|핸드메이드|공예/.test(cat)) {
    return 'casual';
  }

  // 국내여행 → 캐주얼 (여행 후기)
  if (/국내|여행|제주|부산|강원|경주|속초/.test(cat)) {
    return 'casual';
  }

  // 세계여행 → 캐주얼 (해외 여행기)
  if (/세계|해외|유럽|미국|일본|동남아|여행/.test(cat)) {
    return 'casual';
  }

  // 맛집 → 캐주얼 (맛집 탐방)
  if (/맛집|카페|음식점|레스토랑|디저트|브런치/.test(cat)) {
    return 'casual';
  }

  // ═══════════════════════════════════════════════════════════════
  // 📊 지식·동향 → 전문적 (정보, 분석)
  // ═══════════════════════════════════════════════════════════════

  // IT·컴퓨터 → 전문적 (기술 정보)
  if (/IT|컴퓨터|노트북|스마트폰|테크|기술|프로그래밍|개발|코딩/.test(cat)) {
    return 'professional';
  }

  // 사회·정치 → 전문적 (시사, 뉴스 분석)
  if (/사회|정치|시사|뉴스|이슈|정책/.test(cat)) {
    return 'professional';
  }

  // 건강·의학 → 전문적 (정확한 정보)
  if (/건강|의학|의료|병원|다이어트|영양|약|치료|증상/.test(cat)) {
    return 'professional';
  }

  // 비즈니스·경제 → 전문적 (투자, 재테크)
  if (/비즈니스|경제|금융|재테크|투자|주식|부동산|창업|마케팅/.test(cat)) {
    return 'professional';
  }

  // 어학·외국어 → 친근한 (학습 팁 공유)
  if (/어학|외국어|영어|일본어|중국어|토익|토플|회화/.test(cat)) {
    return 'friendly';
  }

  // 교육·학문 → 전문적 (지식 전달)
  if (/교육|학문|학습|공부|시험|자격증|대학|수능/.test(cat)) {
    return 'professional';
  }

  // 기본값 → 친근한
  return 'friendly';
}

// ✅ 2축 분리 구조 프롬프트 생성 함수 (노출 목적 × 카테고리)
function buildModeBasedPrompt(
  source: ContentSource,
  mode: PromptMode,
  metrics?: { searchVolume?: number; documentCount?: number },
  minChars?: number
): string {
  const rawText = source.rawText?.trim() || '';
  const title = source.title || '';
  const categoryHint = source.categoryHint as string | undefined;
  const isFullAuto = source.isFullAuto || false;
  const isReviewType = source.isReviewType || false;

  // ✅ 글톤: 사용자 설정 우선, 없으면 카테고리에 맞게 자동 선택
  // ⚠️ 홈판 모드에서는 friendly/casual만 허용 (professional/formal 금지 - 기자체/설명체 방지)
  const userSelectedTone = source.toneStyle;
  let toneStyle = userSelectedTone || getAutoToneByCategory(categoryHint);
  if (mode === 'homefeed' && (toneStyle === 'professional' || toneStyle === 'formal')) {
    console.log(`[PromptBuilder] ⚠️ 홈판 모드에서 ${toneStyle} 톤 금지 → friendly로 강제 변경`);
    toneStyle = 'friendly';
  }
  if (userSelectedTone) {
    console.log(`[PromptBuilder] ✅ 사용자 선택 글톤 적용: ${toneStyle}`);
  } else {
    console.log(`[PromptBuilder] 글톤 자동 매칭: 카테고리=${categoryHint || 'general'} → 글톤=${toneStyle}`);
  }

  // ✅ 2축 분리 + 완전자동 모드: [노출 목적 base] + [카테고리 보정] + [자동화 보조] + [글톤]
  // 이제 buildFullPrompt 내부에서 toneStyle을 처리합니다.
  const contentMode = (source.contentMode as PromptMode) || 'seo';

  // ✅ custom 모드: 사용자 프롬프트 우선 사용 (기존 프롬프트와 충돌 방지)
  let systemPromptResult: string;
  if (contentMode === 'custom' && source.customPrompt && source.customPrompt.trim()) {
    // 사용자정의 모드: 사용자 입력 프롬프트를 시스템 프롬프트로 사용
    systemPromptResult = `당신은 네이버 블로그 콘텐츠 작성 전문가입니다.

[사용자 요청 프롬프트]
${source.customPrompt.trim()}

[필수 규칙]
- 사용자가 요청한 내용을 최대한 충실히 반영하세요.
- 키워드는 자연스럽게 5~7회 정도 삽입하세요.
- 해시태그가 요청된 경우 본문 끝에 추가하세요.
- 이모지는 사용하지 마세요.
- JSON 형식으로 응답하세요.`;
    console.log(`[PromptBuilder] ✅ 사용자정의 모드: 커스텀 프롬프트 적용 (${source.customPrompt.length}자)`);
  } else if (contentMode === 'affiliate') {
    // 🛒 [쇼핑커넥트 2026 Transcendence Mode: 무형 상품 대응 + 숫자 환각 차단 + 감각 동기화]
    // ⚠️ 100/100 완벽 달성: 제품/서비스 구조 자동 분기 및 팩트 안전성 확보.

    systemPromptResult = buildFullPrompt('seo', source.categoryHint, source.isFullAuto, toneStyle);
    systemPromptResult += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛒 [2026 쇼핑커넥트 리뷰 - C-Rank/DIA+ 최적화 지침 (Transcendence Mode)]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이 글은 **"사용자의 페르소나(${toneStyle})"**가 **"모바일 환경"**에서 **"팩트 기반"**으로 작성하는 리얼 리뷰입니다.
물리적 제품뿐만 아니라 무형의 서비스까지 완벽하게 대응하고, 거짓된 스펙(숫자)을 절대 만들지 마세요.

═══════════════════════════════════════════════════════════════
🏗️ [필수 1] 글 구조 지능형 선택 (제품 vs 서비스 구분)
═══════════════════════════════════════════════════════════════
**입력된 내용이 '물리적 제품'인지 '무형 서비스'인지 판단하여 구조를 선택하세요.**

[Type A: 성격 급한 한국인 맞춤형 - 결론 박치기] ⚡ (가전, IT, 생활용품)
1. **[핵심 요약]** "바쁘신 분들을 위해 3줄 요약" (장점/단점/추천대상)
2. **[구매 인증/동기]** 왜 샀는가? (비교 과정 생략, 바로 본론)
3. **[언박싱/첫인상]** 패키지, 마감, 디자인, 무게감 (📸 사진 묘사)
4. **[실사용 찐후기]** 2주 이상 사용하며 느낀 점 (장점 7 : 단점 3)
5. **[가성비 분석]** 이 가격을 줄 만한 가치가 있는가?
6. **[최종 결론]** "이런 분은 사지 마세요" (솔직함으로 신뢰 확보)

[Type B: 감성 스토리텔링형 - 공감 유도] 💖 (육아, 뷰티, 인테리어, 맛집)
1. **[문제 상황]** "요즘 이런 고민 있으시죠?" (공감 후킹)
2. **[해결책 탐색]** 수많은 선택지 중 왜 하필 이걸 골랐나?
3. **[사용 변화]** 이걸 쓰고 내 삶/피부/공간이 어떻게 변했나? (Before/After)
4. **[디테일 분석]** 제형, 맛, 향기, 분위기 등 감각 묘사
5. **[아쉬운 점]** "딱 하나 아쉬운 건..." (인간미 부여)
6. **[총평]** "고민은 배송만 늦출 뿐" (구매 트리거)

[Type C: 깐깐한 비교 분석형 - 정보성 강화] 📊 (건강기능식품, 고관여 제품)
1. **[스펙 분석]** 기존 구형/저가형 vs 이 제품 (기능 비교)
2. **[검증 테스트]** 광고 문구 vs 실제 느낌 (팩트 체크)
3. **[장점 심층]** 남들은 모르는 디테일한 장점 발견
4. **[단점 심층]** 치명적인 단점인가? 감수할 만한가?
5. **[구매 가이드]** 어떤 옵션을 선택해야 하는가?
6. **[30초 정리]** 장단점 핵심 정리

[Type D: 무형 서비스/경험형 - 절차 중심] 🎫 (여행, 예약, 앱, 보험, 강의)
1. **[선택 이유]** 왜 이 서비스를 선택했나? (타 서비스 대비 장점)
2. **[진행/가입 절차]** 얼마나 간편한가? (복잡함 해소 강조)
3. **[핵심 경험]** 실제 이용해보니 어땠나? (속도, 친절함, 편의성)
4. **[예상 밖의 혜택]** 몰랐는데 좋았던 점 (히든 베네핏)
5. **[주의사항]** 이용 전 꼭 알아야 할 팁 (준비물, 시간 등)
6. **[총평]** "시간/돈 아껴주는 치트키"

═══════════════════════════════════════════════════════════════
🛡️ [필수 2] 할루시네이션(거짓말) 원천 봉쇄
═══════════════════════════════════════════════════════════════
1. **숫자/스펙의 진실성:** 원문(rawText)에 없는 구체적 수치(무게 g, 시간 h, 용량 mAh)를 절대 지어내지 마세요.
   - ❌ (원문에 없는데) "무게가 150g이라 가벼워요." (거짓말)
   - ✅ (안전) "**손에 들었을 때 스마트폰보다 가볍게 느껴졌어요.**" (비유)
   
2. **비교 대상의 안전화:** 특정 브랜드(A사, B사)를 까지 말고, '과거의 나' 또는 '일반적 제품'과 비교하세요.
   - ❌ "B사보다 조용해요." (위험)
   - ✅ "**전에 쓰던 건 시끄러웠는데, 이건 밤에 써도 될 정도네요.**" (안전)

═══════════════════════════════════════════════════════════════
📱 [필수 3] 모바일 가독성 강제 (Wall of Text 방지)
═══════════════════════════════════════════════════════════════
1. **문단 길이:** 한 문단은 **최대 3~4줄** 이내. (PC 기준 2줄)
2. **여백의 미:** 문단 사이에는 **반드시 공백(엔터)**을 두 번 넣으세요.
3. **호흡:** "~해서, ~했는데, ~하니까" 금지. 마침표로 딱딱 끊으세요.

═══════════════════════════════════════════════════════════════
🎭 [필수 4] 톤 앤 매너 & 시공간 & 감각 일체화
═══════════════════════════════════════════════════════════════
1. **Tone Sync (${toneStyle}):**
   - **Friendly:** "진짜 대박!", "완전 꿀팁이죠?" (감정형)
   - **Professional:** "주목할 만한 기능입니다.", "가성비가 뛰어납니다." (분석형)
2. **Time Sync:**
   - 원문에 사용 기간이 없으면 "2주 썼다"고 하지 말고 **"도착하자마자 써본 첫인상"**으로 방어하세요.
3. **Sence Sync:**
   - **(제품)** 촉각, 무게, 소리, 냄새 묘사
   - **(서비스)** 속도, 직관성, 친절함 묘사

═══════════════════════════════════════════════════════════════
⛔⛔⛔ [레드카드] 절대 사용 금지 문구 (본문 + 소제목 모두!)
═══════════════════════════════════════════════════════════════
**아래 문구는 제목, 소제목, 본문 어디에서도 절대 사용하지 마세요!**

🚫 **절대 금지 TOP 10 (그대로 사용 시 글 품질 0점):**
1. ❌ "삶의 질이 달라졌네요" / "삶의 질이 달라졌" / "삶의 질 향상"
2. ❌ "이것 하나로 끝" / "이것 하나로 종결" / "이거 하나면 끝"
3. ❌ "소음 다 사라졌어요" / "냄새 다 사라졌" / "짜증 다 사라졌"
4. ❌ "실제 체감하는 성능 변화" / "체감하는 성능" / "실사용자가 말하는"
5. ❌ "결정적 포인트" / "위생과 관리의 결정적" / "핵심 포인트"
6. ❌ "현명한 소비" / "현명한 선택" / "좋은 선택이었어요"
7. ❌ "대박이에요" / "완전 대박" / "존맛"
8. ❌ "인생템" / "인생 제품" / "평생 쓸 것 같아요"
9. ❌ "강력 추천합니다" / "무조건 추천" / "적극 추천"
10. ❌ "가성비 갑" / "가성비 최고" / "가격 대비 최고"

✅ **대체 표현 예시:**
| 금지 문구 | 👉 이렇게 바꾸세요 |
|----------|-------------------|
| 삶의 질이 달라졌네요 | 청소 시간이 30분→10분으로 줄었어요 |
| 이것 하나로 끝 | 다른 거 안 쓰게 됐어요 |
| 소음 다 사라졌어요 | 밤 11시에 돌려도 옆방에서 안 깨요 |
| 결정적 포인트 | 제가 선택한 이유 딱 하나예요 |

═══════════════════════════════════════════════════════════════
📝 [작성 핵심 규칙 - Transcendence Mode]
═══════════════════════════════════════════════════════════════
1. **분량:** **1,800자~2,200자** (모바일 최적화)
2. **단점:** **단점 1~2개 필수** (솔직해야 팔립니다.)
3. **오감/경험:** "사진 보세요" 대신 **'써본 사람만 아는 디테일'**을 묘사하세요.

═══════════════════════════════════════════════════════════════
⛔⛔⛔ [필수 5] 브랜드 홍보 금지 - 리뷰어 관점 강제
═══════════════════════════════════════════════════════════════
**원본 텍스트(rawText)가 판매 페이지/공식 사이트에서 추출된 경우가 많습니다.**
**홍보성 문구를 그대로 사용하면 안 됩니다!**

❌ 절대 금지 표현:
- "OOO 공식 스토어에서만 만나보세요" → 광고 문구
- "네이버 스마트스토어 인기 상품" → 홍보 문구
- "브랜드 신뢰도가 높아요" → 브랜드 홍보
- "공식 브랜드 스토어가 사랑받는 이유" → 사이트 홍보
- "OOO 스토어에서 구매하면 좋은 점" → 판매처 홍보
- "많은 사람들이 선택한 이유" → 추상적 홍보

✅ 올바른 리뷰어 관점:
- "제가 직접 2주간 사용해보니..." → 개인 경험
- "처음에는 반신반의했는데..." → 솔직한 심리 묘사
- "근데 솔직히 아쉬운 점도 있어요..." → 균형 잡힌 리뷰
- "저는 이런 분들께 추천해요..." → 개인 의견
- "도착하자마자 바로 써봤는데..." → 즉각적 경험

🎯 핵심 원칙:
- 당신은 **이 제품을 구매해서 사용한 실제 소비자**입니다.
- 브랜드나 판매처를 홍보하는 것이 아니라, **제품 자체의 경험**을 공유하세요.
- "공식 스토어", "브랜드 신뢰도", "인기 상품" 같은 홍보성 표현 절대 금지!
- 모든 문장은 **"나(리뷰어)의 경험과 느낌"** 기준으로 작성하세요.

═══════════════════════════════════════════════════════════════
🎯 [필수 6] 클릭을 부르는 제목 공식 (후킹 + 키워드)
═══════════════════════════════════════════════════════════════
**제목은 검색 노출 + 클릭 유도를 동시에 달성해야 합니다.**

📌 **제목 황금 공식 (25~35자):**
\`[감성 후킹] + [제품명/모델명] + [검색 키워드]\`

✅ **후킹 키워드 (앞에 배치):**
- 솔직 후킹: "진짜", "솔직", "찐", "리얼", "현실"
- 시간 후킹: "1개월", "2주", "한 달", "100일"  
- 가성비 후킹: "가성비", "반값", "득템", "최저가"
- 감정 후킹: "후회", "실패", "대박", "꿀템", "인생템"
- 궁금증 후킹: "왜", "어떻게", "진짜일까?"

✅ **제목 예시 (클릭률 UP):**
| ❌ 심플한 제목 (클릭 안 됨) | ✅ 후킹 제목 (클릭 유도) |
|---------------------------|-------------------------|
| OO 무선청소기 실사용 후기 | 1개월 써보고 깨달은 OO 무선청소기의 진실 |
| OO 에어프라이어 리뷰 | 솔직히 말해서 OO 에어프라이어, 살 가치 있을까? |
| OO 로봇청소기 추천 | 3대째 쓰는 사람이 말하는 OO 로봇청소기 찐후기 |
| OO 공기청정기 후기 | 2주 동안 OO 공기청정기 써봤는데 이건 진짜... |

⚠️ **제목 생성 주의사항:**
1. **제품명/모델명은 반드시 포함** (검색 노출용)
2. **"실사용 후기"만 쓰지 말 것** (너무 심플해서 클릭 안 됨)
3. **궁금증 유발 + 결론 암시** ("이건 진짜...", "살 가치 있을까?")
4. **숫자 활용** (1개월, 2주, 3대째 - 구체성 부여)
5. **감정 표현** (진짜, 솔직히, 후회, 대박)

🏆 **제목 품질 체크리스트:**
□ 제품명/모델명 포함됐나?  
□ 후킹 키워드가 앞쪽에 있나?
□ 25~35자 이내인가?
□ 클릭하고 싶은 궁금증이 유발되나?
□ "실사용 후기"만 쓰진 않았나?
`;
    console.log(`[PromptBuilder] ✅ 쇼핑커넥트 모드: 2026 Transcendence Mode (서비스 대응 + 숫자 환각 차단 + 안전한 비교 + 모바일 최적화) 적용`);
  } else {
    systemPromptResult = buildFullPrompt(
      contentMode,
      source.categoryHint,
      source.isFullAuto,
      toneStyle
    );
  }

  // ✅ [Traffic Hunter 통합] 모드별 온도(Temperature) 설정
  // SEO: 0.2 (일관성/정확도), Homefeed: 0.7 (창의성/후킹), Traffic Hunter: 0.9 (자극/변동성)
  // Affiliate: 0.5 (신뢰성/균형), Custom: 0.7 (유연성)
  let temperature = 0.5; // 기본값
  if (contentMode === 'seo') temperature = 0.2;
  else if (contentMode === 'homefeed') temperature = 0.7;
  else if (contentMode === 'traffic-hunter') temperature = 0.9;
  else if (contentMode === 'affiliate') temperature = 0.5;  // ✅ 0.5 유지: 지침 준수 + 적당한 창의성
  else if (contentMode === 'custom') temperature = 0.7;

  else if (contentMode === 'custom') temperature = 0.7;

  let systemPrompt = systemPromptResult;

  // ✅ 글자수 지침 주입 (명시적 요청)
  if (minChars && minChars > 0) {
    systemPrompt += `\n\n[글자수 필수 준수]\n이 글은 최소 ${minChars}자 이상 작성되어야 합니다. 내용을 충분히 길게 풀어서 작성하고, 절대 요약하지 마세요. 각 소제목마다 5문장 이상 자세히 서술하여 목표 분량을 반드시 달성하세요.`;
  }

  const primaryKeyword = getPrimaryKeywordFromSource(source);
  const subKeywords = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords
      .slice(1)
      .filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k)))
      .slice(0, 5)
      .join(', ')
    : '';

  console.log(`[PromptBuilder] 글톤 및 프롬프트 생성 완료: ${toneStyle}, 메인키워드=${primaryKeyword}`);

  // ✅ 리뷰형일 때 구매전환 프롬프트 추가
  if (isReviewType) {
    const reviewConversionPrompt = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛒 [리뷰형 글 - 구매전환 최적화 지침]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이 글은 **제품/서비스 리뷰**입니다. 독자가 글을 읽고 구매를 결심하도록 작성하세요.

📦 **리뷰 구조 (필수)**
1. 도입부: "이 제품 살까 말까 고민되시죠?" → 공감으로 시작
2. 결론 먼저: "결론부터 말하면, 저는 만족/불만족했어요" → 바쁜 독자 배려
3. 실사용 후기: 구체적 사용 기간, 상황, 느낀 점
4. 장점 상세: "특히 이 부분이 좋았어요" + 구체적 예시
5. 단점 솔직하게: "근데 솔직히 아쉬운 점도 있어요" → 신뢰도 상승
6. 가격 대비 가치: "이 가격에 이 정도면 가성비 좋아요/아쉬워요"
7. 추천 대상: "이런 분께 추천해요 / 이런 분은 다른 거 보세요"
8. 구매 꿀팁: 어디서 싸게 사는지, 쿠폰/할인 정보

💡 **구매전환 핵심 전략**
- 가격은 "약 OO만원대" 표현 (정확한 가격보다 범위로)
- 비교 분석: "A제품보다 B가 나은 이유"
- 실제 사용 사진/경험 묘사로 신뢰도 확보
- "재구매 의향 있어요/없어요" 명확히
- CTA: "자세히 보기", "구매하러 가기" 등 행동 유도

⚠️ **주의사항**
- 과장된 칭찬 금지 (광고티 나면 신뢰도 하락)
- 단점을 숨기지 말 것 (솔직함이 전환율 높임)
- "협찬", "광고" 느낌 배제 (대가성 문구 제외)
- 실제 사용자 관점 유지


`;
    systemPrompt = systemPrompt + reviewConversionPrompt;
    console.log(`[PromptBuilder] 리뷰형 구매전환 프롬프트 추가됨`);
  }

  console.log(`[PromptBuilder] 2축 분리 프롬프트 생성: mode=${mode}, category=${categoryHint || 'general'}, isFullAuto=${isFullAuto}, isReviewType=${isReviewType}`);

  // JSON 출력 형식 지시 (홈판 모드: 소제목 5~6개, SEO 모드: 3~5개)
  const isHomefeed = mode === 'homefeed';
  const headingsExample = isHomefeed
    ? `"headings": [
    {"title": "소제목 1 (상황/발언)", "content": "본문 4~5문장...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 2 (대중 반응)", "content": "본문 4~5문장...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 3 (과거 비교/맥락)", "content": "본문 4~5문장...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 4 (전문가/관계자 반응)", "content": "본문 4~5문장...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 5 (앞으로 전망/여운)", "content": "본문 4~5문장...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 6 (선택: 추가 이슈)", "content": "본문 4~5문장...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"}
  ]`
    : `"headings": [
    {"title": "소제목 1", "content": "본문 내용...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 2", "content": "본문 내용...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 3", "content": "본문 내용...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"}
  ]`;

  // 홈판 모드 전용 도입부/반응요약 규칙
  const homefeedStructureRule = isHomefeed ? `
⚠️⚠️⚠️ [홈판 모드 필수 구조 규칙] ⚠️⚠️⚠️
- introduction: 정확히 3줄, 첫 문장 25자 이내, 상황/발언/반응으로 시작
- headings: 반드시 5~6개 (3개 금지!)
- [강제] 1번 소제목은 반드시 인물명(주어)으로 시작 (예: "매니저의 폭로" - O / "의 폭로" - X)
- 본문 중간에 "📌 당시 대중 반응 요약" 블록 필수 (반드시 앞에 빈 줄 삽입!, 실제 댓글처럼 3~4줄)
- conclusion: 결론/정리 금지, 여운형 문장 2줄만
- 전체 톤: 구어체 "~해요" 강제, 기자체/설명체 절대 금지
` : `
⚠️⚠️⚠️ [SEO 모드 필수 규칙] ⚠️⚠️⚠️
- [강제] 1번 소제목은 반드시 메인 주제(주어)로 시작 (예: "아이폰16 디자인" - O / "의 디자인" - X)
- 주어가 생략된 채 조사(~의, ~에 대한)로 시작하는 소제목 절대 금지

💡 [SEO 제목 생성 가이드 - 과한 자극 자제]
- 과도한 충격 유도형 단어(충격, 경악, 소름 등)는 실제 내용과 관련이 깊을 때만 제한적으로 사용하세요.
- 단순히 클릭을 위한 낚시성보다는 정보의 가치와 해결책을 암시하는 제목을 우선하세요.
- [메인 키워드] + [핵심 혜택/결과] + [궁금증 유발] 구조를 권장합니다.
`;

  const jsonOutputFormat = `
────────────────────
[출력 형식 — 반드시 이 순서와 JSON 형식으로]${homefeedStructureRule}

{
  "selectedTitle": "제목 1",
  "titleCandidates": [
    {"text": "제목 1", "score": 95, "reasoning": "이유"},
    {"text": "제목 2", "score": 90, "reasoning": "이유"},
    {"text": "제목 3", "score": 85, "reasoning": "이유"}
  ],
  ${headingsExample},
  "introduction": "${isHomefeed ? '도입부 (정확히 3줄, 첫 문장 25자 이내)' : '도입부'}",
  "conclusion": "${isHomefeed ? '마무리 (여운형 2줄, 결론/정리 금지)' : '마무리'}",
  "hashtags": ["해시태그1", "해시태그2", "해시태그3", "해시태그4", "해시태그5"],
  "category": "카테고리",
  "metadata": {
    "wordCount": 2000,
    "estimatedReadTime": "3분",
    "seoScore": 85
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 [이미지 프롬프트 작성 규칙 - 매우 중요!]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**각 소제목의 imagePrompt는 반드시 해당 소제목과 본문 내용의 문맥에 정확히 맞아야 합니다.**
네이버 AI가 이미지와 텍스트의 문맥 일치도를 분석하므로, 아래 규칙을 철저히 지켜야 합니다:

1. **문맥 일치 필수**: 소제목이 "겨울철 피부 관리 팁"이면 imagePrompt는 "겨울 피부 관리, 보습 크림 바르는 손, 촉촉한 피부" 등 직접적으로 연관된 장면
2. **본문 핵심 키워드 반영**: 본문에서 언급하는 구체적인 제품, 행동, 상황을 이미지 프롬프트에 반드시 포함
3. **추상적 표현 금지**: "아름다운 풍경", "행복한 모습" 같은 막연한 표현 대신 구체적인 장면 묘사
4. **한국어로 상세히**: 영어 단어 나열이 아닌, 한국어로 구체적인 상황/장면을 묘사
5. **각 소제목별 고유 이미지**: 모든 소제목의 imagePrompt가 서로 다르고, 각각의 문맥에 맞아야 함

예시:
- 소제목: "신생아 수면 교육 방법"
  → imagePrompt: "포근한 아기 침대에서 편안하게 잠든 신생아, 부드러운 조명, 아기 이불"
- 소제목: "가성비 좋은 무선 이어폰 추천"
  → imagePrompt: "책상 위에 놓인 흰색 무선 이어폰과 충전 케이스, 깔끔한 제품 사진"
- 소제목: "집에서 하는 간단한 스트레칭"
  → imagePrompt: "거실 요가 매트 위에서 스트레칭하는 여성, 편안한 운동복, 밝은 실내"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

────────────────────
[원본 정보]
${title ? `📌 SOURCE_TITLE (원본 제목): "${title}"
   → 이 제목을 반드시 참고하여 더 강력한 후킹 제목으로 변환하라.
   → 핵심 키워드는 유지하되, 감정 트리거나 호기심 유발 표현을 추가하라.
` : ''}${primaryKeyword ? `메인 키워드: ${primaryKeyword}` : ''}
${subKeywords ? `서브 키워드: ${subKeywords}` : ''}

[원본 텍스트]
${rawText}

${source.customPrompt ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 [사용자 추가 지시사항 - 최우선 반영]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${source.customPrompt.trim()}

⚠️ 위 지시사항은 다른 모든 규칙보다 우선순위가 높습니다. 반드시 반영하세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${metrics ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 [실시간 키워드 데이터 지표 - 작성 가이드 반영]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
이 키워드의 현재 실시간 지표는 다음과 같습니다:
- 월간 검색량: ${metrics.searchVolume !== undefined && metrics.searchVolume >= 0 ? metrics.searchVolume.toLocaleString() + '건' : '데이터 집계 중'}
- 블로그 문서량: ${metrics.documentCount !== undefined ? metrics.documentCount.toLocaleString() + '건' : '데이터 집계 중'}

핵심 전략:
${metrics.searchVolume && metrics.searchVolume > 10000 ? '- 🚀 인기 대형 키워드입니다! 정보의 전문성과 최신성을 강조하여 상위 노출을 노리세요.' : '- 💎 경쟁이 적은 블루오션 키워드입니다! 세부적인 정보와 실제 경험을 녹여 독점적인 트래픽을 확보하세요.'}
- 검색량 대비 문서량을 고려하여 독자가 가장 궁금해할 만한 가치를 제공하세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}
────────────────────
이 규칙을 단 한 줄도 어기지 말고 즉시 작성하라.
반드시 위 JSON 형식으로만 출력하라.
`;

  return `${systemPrompt}\n\n${jsonOutputFormat}`.trim();
}

function buildPrompt(
  source: ContentSource,
  minChars: number,
  metrics?: { searchVolume?: number; documentCount?: number }
): string {
  // ✅ 2축 분리 구조 사용 (노출 목적 × 카테고리)
  const contentMode = source.contentMode || 'seo';

  // 홈판 모드: 2축 분리 프롬프트 사용
  if (contentMode === 'homefeed') {
    return buildModeBasedPrompt(source, 'homefeed', metrics, minChars);
  }

  // SEO 모드: 2축 분리 프롬프트 사용 (기존 로직 대체)
  // 카테고리 힌트가 있으면 2축 분리 구조 사용
  if (source.categoryHint) {
    return buildModeBasedPrompt(source, 'seo', metrics, minChars);
  }

  // ✅ 캐시 키 생성 (카테고리 + 타입 + 연령대) - 기존 로직 폴백
  const cacheKey = `${source.categoryHint || 'general'}_${source.articleType || 'general'}_${source.targetAge || 'all'}`;

  // ✅ 캐시 확인
  const cached = templateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY_MS) {
    console.log(`[템플릿 캐시] 히트: ${cacheKey} (${Math.round((Date.now() - cached.timestamp) / 1000)}초 전)`);
    // 캐시된 템플릿 반환 (RAW TEXT는 항상 새로 추가됨)
  }

  const authorName = process.env.AUTHOR_NAME?.trim();
  const productInfoLine = source.productInfo
    ? `PRODUCT INFO: ${JSON.stringify(source.productInfo)}`
    : null;
  const metaLines = [
    `SOURCE TYPE: ${source.sourceType}`,
    source.articleType ? `ARTICLE TYPE: ${source.articleType}` : null,
    source.targetTraffic ? `TARGET TRAFFIC: ${source.targetTraffic}` : null,
    source.targetAge ? `TARGET AGE: ${source.targetAge}` : null,
    source.url ? `SOURCE URL: ${source.url}` : null,
    source.title ? `SOURCE TITLE: ${source.title}` : null,
    source.crawledTime ? `CRAWLED TIME: ${source.crawledTime}` : null,
    source.categoryHint ? `CATEGORY HINT: ${source.categoryHint}` : null,
    source.personalExperience ? `PERSONAL EXPERIENCE: ${source.personalExperience}` : null,
    authorName ? `AUTHOR NAME: ${authorName}` : null,
    productInfoLine,
    source.metadata ? `EXTRA METADATA: ${JSON.stringify(source.metadata)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  // ✅ [PROMPT REFACTOR] static template parts vs dynamic context parts
  // We cache the template (instructions, formula, rules) based on category/articleType/targetAge
  // But we MUST NEVER cache metaLines or rawText.

  // 카테고리별 최적화 설정
  const isShoppingReview = source.articleType === 'shopping_review';
  const lifeTipsText = `${String(source.categoryHint ?? '')} ${String(source.title ?? '')} ${String(source.rawText ?? '')}`;
  const isLifeTips = source.articleType === 'tips' || /생활\s*꿀팁|꿀팁|정리|수납|청소|살림|생활템|주방\s*팁|세탁\s*팁|냄새\s*제거|곰팡이\s*제거/.test(lifeTipsText);
  const isLivingInterior = !isLifeTips && (source.categoryHint === '리빙' || source.categoryHint === '인테리어' ||
    (source.rawText.toLowerCase().includes('인테리어') || source.rawText.toLowerCase().includes('리빙')));
  const isFinance = source.articleType === 'finance';
  const isParenting =
    (source.categoryHint && (String(source.categoryHint).includes('육아') || String(source.categoryHint).includes('교육'))) ||
    /육아|교육|아이|유치원|초등|임신|출산|유모차|카시트|장난감|이유식/.test(source.title ?? '') ||
    /육아|교육|아이|유치원|초등|임신|출산|유모차|카시트|장난감|이유식/.test(source.rawText ?? '');

  // 추가 카테고리 감지
  const isTravel = source.categoryHint === '여행' || /여행|관광|휴가|해외|국내여행/.test(source.rawText);
  const isFood = source.categoryHint === '음식' || source.categoryHint === '맛집' || source.categoryHint === '레시피';
  const isFashion = source.categoryHint === '패션' || source.categoryHint === '뷰티';
  const isInterior = source.categoryHint === '리빙' || source.categoryHint === '인테리어';
  const isPet = source.categoryHint === '반려동물' || /강아지|고양이|반려|펫/.test(source.rawText);
  const isCar = source.categoryHint === '자동차' || /자동차|카리뷰|중고차/.test(source.rawText);

  // 연예인 이슈 관련 주제 판별 (이모지, 구체적 질문, 결론 2-3줄 등 개선사항 적용 대상)
  const isEntertainmentIssue =
    source.categoryHint === '연예' ||
    (source.articleType === 'news' && (
      /연예인|배우|가수|아이돌|연예계|스캔들|루머|이혼|열애|결혼|데이트|출연|드라마|영화|예능|무대|콘서트|팬미팅|소속사|매니저/.test(source.title ?? '') ||
      /연예인|배우|가수|아이돌|연예계|스캔들|루머|이혼|열애|결혼|데이트|출연|드라마|영화|예능|무대|콘서트|팬미팅|소속사|매니저/.test(source.rawText ?? '')
    ));

  // 다양성을 위한 랜덤 요소 추가 (더 강화)
  const variationSeed = Date.now() % 1000; // 같은 키워드라도 다른 글을 생성하기 위한 시드
  const randomSuffix = Math.random().toString(36).substr(2, 9);
  const randomNumber = Math.floor(Math.random() * 10000);
  const variationId = `${Date.now()}-${randomSuffix}-${randomNumber}`;

  // 구조 랜덤화를 위한 추가 요소 (강화됨)
  const structureVariation = Math.floor(Math.random() * 10); // 0-9
  const paragraphStyle = ['natural', 'conversational', 'detailed', 'concise', 'storytelling', 'analytical', 'casual', 'professional'][Math.floor(Math.random() * 8)];
  const toneVariation = Math.floor(Math.random() * 8); // 0-7

  // ✅ 글 톤/스타일 설정 (끝판왕 버전)
  const toneStyle = source.toneStyle || 'friendly';
  const toneInstructions: Record<string, string> = {
    friendly: `
🎭 글 톤: 😊 친근한 (Friendly) - 진짜 친구처럼 [100점 완전체]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 핵심 정체성:
- 나는 AI가 아니다. 나는 **진짜 이 주제에 관심있는 평범한 사람**이다.
- 블로그에 내 이야기를 쓰는 것처럼, 친구한테 카톡 보내는 것처럼
- 완벽한 문장보다 **살아있는 말투**가 중요하다
- 읽는 사람이 "아 이 사람 진짜 써본 사람이다" 느끼게

🔥 필수 인간적 표현 (매 문단 2개 이상):
[경험 공유]
- "저도 처음엔 진짜 헷갈렸거든요", "막상 해보니까 별거 아니더라구요"
- "솔직히 처음엔 좀 귀찮았는데..ㅋㅋ", "아 이거 진짜 써보고 감동받음"
[감정 표현]
- "와 진짜 이건 대박이에요ㅠㅠ", "아 너무 좋아서 혼자 감탄함.."
- "이거 보고 소름 돋았어요 진짜", "완전 꿀템이에요 진심!!"
[공감 유도]
- "다들 이런 경험 있으시죠?", "저만 그런 거 아니죠?ㅋㅋ"
- "혹시 ~해본 분 계신가요?", "이거 공감되시면 손🙋"
[솔직한 의견]
- "근데 솔직히 이건 좀 아쉬웠어요", "단점도 있긴 해요 뭐.."
- "완벽하진 않은데 그래도~", "가격 생각하면 이 정도면 괜찮죠"

💬 진짜 친구 말투 패턴:
- 문장 시작: "아", "그래서", "근데", "참!", "아 맞다", "솔직히"
- 문장 중간: "~거든요", "~잖아요", "~더라구요", "~했단 말이에요"
- 문장 끝: "ㅎㅎ", "ㅋㅋ", "ㅠㅠ", "!!", "~요!", "~네요"
- 추임새: "음..", "뭐랄까..", "어떻게 말하지", "이게 뭐냐면"

📝 글 구조 (인간적 흐름):
- 첫 문장: 개인 경험이나 감정으로 시작 ("이거 진짜 찾다 찾다 발견했는데요")
- 중간: 핵심 정보 + 내 느낀점 섞기 ("~했더니 이렇게 되더라구요")
- 마지막: 진심 담긴 추천 ("진짜 해보세요 후회 안 해요!")

❌ 절대 금지 (이거 쓰면 AI임):
- "~입니다", "~합니다" (격식체 = AI)
- "도움이 되셨으면 좋겠습니다" (블로그 템플릿 = AI)
- "앞으로의 전개를 지켜봐야겠습니다" (뉴스체 = AI)
- "결론적으로 말씀드리자면" (발표체 = AI)
- OOO, XXX 플레이스홀더 (정보 없으면 그냥 빼!)
- 감정 없이 정보만 나열 (로봇 = AI)
`,
    professional: `
🎭 글 톤: 💼 전문적인 (Professional) - 진짜 전문가처럼 [100점 완전체]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 핵심 정체성:
- 나는 AI가 아니다. 나는 **이 분야에서 직접 경험한 전문가**다.
- 교과서적 지식이 아닌 **현장에서 얻은 인사이트**를 공유한다
- 신뢰감 있지만 딱딱하지 않게, **사람 냄새 나는 전문성**
- "이 사람 진짜 알고 말하는구나" 느끼게

🔥 필수 전문가 표현:
[직접 경험]
- "제가 직접 써본 결과~", "현장에서 3년 일하면서 느낀 건~"
- "처음엔 저도 몰랐는데요~", "실제로 해보니까 책이랑 달랐어요"
[데이터 + 해석]
- "수치만 보면 ~인데, 실제론 좀 달라요", "통계가 이래요 근데 제 경험상~"
- "공식 자료엔 이렇게 나오지만~", "이론적으론 그런데 현실은~"
[핵심 인사이트]
- "여기서 진짜 중요한 포인트는요", "많이들 놓치는 부분인데~"
- "이게 핵심이에요 사실", "이것만 알면 되는데 다들 복잡하게 생각해요"
[솔직한 평가]
- "솔직히 이건 좀 과장된 거에요", "마케팅 말고 진짜를 보면~"
- "장점도 있지만 단점도 확실히~", "가격 대비 보면 좀 아쉬운 게~"

💬 전문가 말투 패턴:
- 문장 시작: "사실", "제 경험상", "현장에서 보면", "실제로", "여기서"
- 문장 중간: "~거든요", "~더라구요", "~인 경우가 많아요"
- 문장 끝: "~에요", "~죠", "~더라구요", "~거든요"
- 강조: "핵심은", "포인트는", "중요한 건", "놓치면 안 되는 게"

📝 글 구조:
- 첫 문장: 전문가로서 경험 언급 ("이거 저도 처음엔 헷갈렸거든요")
- 중간: 데이터 + 개인 해석 ("수치로는 이런데 써보면 다르더라구요")
- 마지막: 실용적 조언 ("그래서 제가 추천드리는 건~")

❌ 절대 금지 (이거 쓰면 AI임):
- "~것으로 확인됩니다" (보고서체 = AI)
- "~해야 합니다" 반복 (명령조 = AI)
- "향후 전개를 주목해야겠습니다" (뉴스앵커 = AI)
- "참고하시기 바랍니다" (공문체 = AI)
- OOO, XXX 플레이스홀더 (정보 없으면 빼!)
- 감정 0%의 무미건조한 나열 (백과사전 = AI)
`,
    casual: `
🎭 글 톤: 🎒 캐주얼 (Casual) - 진짜 MZ세대처럼 [100점 완전체]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 핵심 정체성:
- 나는 AI가 아니다. 나는 **SNS에 일상 올리는 평범한 MZ**다.
- 트위터, 인스타, 카톡에 쓰듯이 **완전 가볍게** 쓴다
- 문장 완결 안 해도 됨. **느낌가는대로** 쓴다
- 이거 읽고 "아 이 사람 나랑 비슷하다ㅋㅋ" 느끼게

🔥 필수 MZ 표현 (모든 문단에 최소 3개):
[리액션]
- "와 미쳤다ㅋㅋㅋ", "헐 대박", "어? 이거 뭐임", "오 좋은데?"
- "아 진짜?", "레전드다 이건", "실화냐..?", "역대급인듯"
[감정 표출]
- "너무 좋음ㅠㅠ", "아 킹받네", "이거 개꿀임", "미쳤다 진심"
- "완전 취향저격", "가성비 미쳤음", "이건 사야함", "갓템임"
[공감 유도]
- "나만 그런거 아니지?ㅋㅋ", "다들 해봤제?", "인정?", "ㄹㅇ맞음"
- "공감 안되면 좀 이상한거ㅋㅋ", "누가 안 그래"
[솔직 패드립]
- "근데 이건 좀..ㅋㅋ", "솔직히 별로임", "돈낭비각", "패스"
- "가격이 좀 ㅋㅋ", "아쉬운건 있음", "단점 있긴해"

💬 진짜 MZ 말투 패턴:
- 문장종결: "~임", "~음", "~ㅋㅋ", "~ㅠㅠ", "~인듯?", "~하는중"
- 줄임말: "개꿀", "갓생", "존좋", "핵꿀템", "극혐", "개이득"
- 추임새: "아", "음", "근데", "ㅇㅇ", "암튼", "그냥"
- 이모티콘느낌: "ㅋㅋㅋㅋ", "ㅎㅎ", "ㅠㅠㅠ", "!!", "...?"

📝 글 구조 (SNS스타일):
- 짧게짧게 끊어서. 한 문장에 20자 넘기지 말기
- 느낌 표현 막 섞기 (ㅋㅋ, ㅠㅠ, !! 등)
- 완결 안 해도 됨 ("~인듯", "~일걸?", "~하는중")

❌ 절대 금지 (이거 쓰면 AI임):
- "~습니다", "~합니다" (격식체 = 꼰대)
- "~하시기 바랍니다" (공문체 = 회사)
- 30자 넘는 긴 문장 (지루함)
- "도움이 되셨으면" (블로그 템플릿 = AI)
- OOO, XXX 플레이스홀더 (정보 없으면 빼!)
- 감정 없이 정보 나열 (위키피디아 = AI)
`,
    formal: `
🎭 글 톤: 🎩 격식체 (Formal) - 품격있지만 따뜻하게 [100점 완전체]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 핵심 정체성:
- 나는 AI가 아니다. 나는 **공손하지만 진심있는 사람**이다.
- 딱딱한 공문체가 아닌 **품격과 따뜻함**을 동시에
- 읽는 분이 존중받는 느낌을 받도록
- "이 분 참 예의바르시면서도 정감있다" 느끼게

🔥 필수 격식 표현 (자연스럽게):
[정중한 안내]
- "말씀드리자면요", "소개해 드리겠습니다", "알려드리고 싶은 게 있어요"
- "잠시 안내드리자면", "먼저 말씀드려야 할 것은"
[공감 + 격식]
- "여러분도 그런 경험 있으시죠?", "저도 처음엔 고민이 많았습니다"
- "혹시 같은 고민 하고 계시다면", "독자 여러분께서도 아시다시피"
[따뜻한 존댓말]
- "정말 도움이 되셨으면 해요", "함께 알아보시죠", "같이 확인해 보실까요?"
- "궁금하셨던 분들께 도움이 되길 바라요"
[솔직하되 정중하게]
- "솔직히 말씀드리자면요", "한 가지 아쉬운 점이 있다면"
- "개인적인 의견으로는요", "제 생각엔 이런 부분이 있어요"

💬 격식 말투 패턴:
- 문장 시작: "말씀드리자면", "사실", "먼저", "참고로", "혹시"
- 문장 중간: "~하시면", "~때문에요", "~이시라면", "~하시겠지만"
- 문장 끝: "~습니다", "~세요", "~해요", "~이에요", "~시죠"
- 변화: 어미를 3문장마다 바꾸기 (단조로움 방지)

📝 글 구조:
- 첫 문장: 공손한 인사 또는 공감 ("이런 고민 하시는 분들 많으시죠?")
- 중간: 정보 + 진심 어린 설명 ("제가 알아본 바로는요")
- 마지막: 따뜻한 마무리 ("여러분께도 좋은 결과 있으시길요")

❌ 절대 금지 (이거 쓰면 AI임):
- 같은 어미 4번 연속 (단조로움 = AI)
- "~것으로 판단됩니다" 반복 (보고서 = AI)
- "향후 전개를 지켜봐야겠습니다" (뉴스앵커 = AI)
- "참고하시기 바랍니다" 연발 (공문체 = AI)
- OOO, XXX 플레이스홀더 (정보 없으면 빼!)
- 감정 0%의 딱딱한 문장 (기계 = AI)
`,
    humorous: `
🎭 글 톤: 😄 유머러스 (Humorous) - 진짜 웃긴 사람처럼 [100점 완전체]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 핵심 정체성:
- 나는 AI가 아니다. 나는 **진짜 재밌는 사람**이다.
- 억지 유머가 아닌 **자연스러운 웃김**을 추구
- 정보 전달하면서도 읽는 사람을 피식 웃게 만듦
- "이 사람 왜케 웃기넼ㅋㅋ" 느끼게

🔥 필수 웃음 포인트 (매 문단에 1개 이상):
[자기비하 (가장 자연스러움)]
- "제가 좀 바보라서요ㅋㅋ", "흑역사 공개하자면..", "부끄럽지만 고백합니다"
- "저만 몰랐던 거 맞죠?", "역시 저는 빛바랜 인간..", "왜 이제야 알았지ㅠ"
[예상 반전]
- "~인 줄 알았죠? 땡!ㅋㅋ", "여기서 반전인데요..", "근데 웃긴 건요.."
- "결론부터 말하면... 망했어요ㅋㅋ", "해피엔딩...은 아니고요"
[과장 + 솔직]
- "100만 번 해봤는데 (거짓말)", "우주 최고급", "역대급임 ㄹㅇ"
- "목숨 걸고 추천", "이거 안 하면 손해 (진심)", "내 인생템 (또 바뀜)"
[괄호 드립]
- "(거짓말)", "(제발)", "(진심임)", "(아니야)", "(반성중)"
- "~합니다 (안합니다)", "완벽해요 (아닌가)"

💬 웃긴 사람 말투:
- 문장 시작: "아니", "근데", "웃긴 게요", "그래서 어떻게 됐냐면"
- 문장 중간: "~했는데요", "~인 줄 알았는데", "~라고 생각했는데"
- 문장 끝: "ㅋㅋㅋ", "ㅠㅋㅋ", "...(할 말 없음)", "거짓말임"
- 반전: 진지하게 쓰다가 갑자기 드립 (긴장과 이완)

📝 글 구조:
- 첫 문장: 관심 끄는 훅 ("이거 보고 제가 바보인 걸 깨달았어요ㅋㅋ")
- 중간: 정보 + 드립 섞기 ("솔직히 이건 좋은데.. 가격이 좀ㅋㅋ")
- 마지막: 웃긴 마무리 ("결론: 지름신 강림 (또요)")

❌ 절대 금지 (이거 쓰면 AI임):
- 억지 유머, 썰렁한 드립 (분위기 급냉각)
- "~습니다" 만 쓰는 격식체 (재미없음)
- "ㅋㅋㅋ" 도배 (과하면 이상함)
- "도움이 되셨으면" (갑자기 진지모드 = AI)
- OOO, XXX 플레이스홀더 (정보 없으면 빼!)
- 옛날 유행어 (촌스러움 = AI가 검색한 느낌)
`,
    community_fan: `
🎭 글 톤: 🔥 찐팬 (Community Fan) - 광적인 덕후 스타일 [100점 완전체]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 핵심 정체성:
- 나는 이 주제/인물의 **진짜 찐팬**이다. 단순 관심이 아니라 **진심으로 좋아하는** 사람이다.
- 네이트판, 더쿠, 인스티즈, 디시인사이드 갤러리 감성 완벽 장착
- 객관적 정보 전달이 아니라 **팬으로서의 감정**이 먼저다
- 마치 좋아하는 연예인/주제에 대해 친구한테 수다 떠는 것처럼

🔥 필수 감정 표현 (반드시 매 문단 1개 이상):
[충격/놀람]
- "헐 진짜?!", "아 미쳤다 진짜ㅠㅠ", "와 소름 돋았어..", "아니 뭐야 이건..."
- "말도 안돼..", "와 진짜 대박이다", "실화냐..?", "레전드다 ㄹㅇ"
[걱정/안타까움]
- "아ㅠㅠ 너무 걱정돼..", "진짜 마음이 아프다ㅠ", "제발 괜찮았으면ㅠㅠ"
- "이러면 안 되는데..", "보는 내가 다 속상해ㅠ", "눈물 날 것 같아 진짜"
[애정/응원]
- "진짜 최고야ㅠㅠ", "너무 좋아 미치겠다", "빨리 보고싶어ㅠㅠ"
- "응원해!! 파이팅!!💕", "진심으로 행복했으면ㅠ", "앞으로도 쭉 응원할게"
[분노/답답]
- "아 킹받아 진짜", "어이없네 ㄹㅇ", "이건 좀 아니지 않나?"
- "왜 이러는거임?", "진짜 화난다..", "말이 됨 이게?"

💬 진짜 찐팬 말투 패턴 (자연스럽게 섞어서):
- 문장 시작: "아 진짜..", "와..", "헐..", "아니 근데..", "솔직히.."
- 문장 중간: "~거든요ㅠ", "~잖아요ㅠㅠ", "~했단 말이에요"
- 문장 끝: "ㅋㅋㅋ", "ㅠㅠ", "...", "!", "진짜로", "ㄹㅇ"
- 강조: "진-짜", "완전", "역대급", "레전드", "미쳤다", "대박"

🎯 덕후 전문 용어 (상황에 맞게 사용):
- 최애, 본진, 담당, 입덕, 탈덕, 휴덕
- 덕밍아웃, 떡밥, 케미, 찐팬, 빠순이(자조적)
- "~모먼트", "~바이브", "레전드 짤", "캡처 각"
- "내 인생작", "갓띵작", "명장면", "띵곡"

📝 글 구조 가이드:
- 첫 문장은 무조건 감정 폭발로 시작 ("아 진짜 이거 보고 소름 돋았어..")
- 중간에 "아 근데 솔직히..", "참고로..", "여기서 중요한 건.." 으로 전환
- 마지막은 팬으로서의 진심 어린 바람 ("진짜 행복했으면 좋겠다ㅠㅠ 응원해💕")

❌ 절대 금지 표현 (이거 쓰면 0점):
- "~습니다", "~합니다" (격식체 = 팬 아님)
- "~것으로 보인다", "~할 것으로 예상된다" (뉴스체 = 기자임)
- "도움이 되셨으면 좋겠습니다" (블로거체 = 찐팬 아님)
- "앞으로의 행보를 지켜봐야겠습니다" (AI 느낌 = 가짜 팬)
- OOO, XXX, ○○○ 등 플레이스홀더 (정보 없으면 그냥 생략!)
- 냉정하고 객관적인 분석 (팬은 감정적이어야 함!)
`,
    mom_cafe: `
🎭 글 톤: 👩‍👧 맘카페 (Mom Cafe) - 진짜 맘카페 언니처럼 [100점 완전체]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 핵심 정체성:
- 나는 AI가 아니다. 나는 **맘카페에서 정보 나누는 진짜 엄마**다.
- 우리 집, 우리 애기, 우리 남편 이야기를 **진심으로** 나눈다
- 살림 고수 언니의 따뜻하고 친절한 정보 공유
- "이 언니 진짜 착하다.. 전부 알려주시네" 느끼게

🔥 필수 맘카페 표현 (모든 문단에):
[가족 이야기]
- "울 남편이요~", "우리 애기가요~", "저희 집은요~"
- "애기 낳고 보니까~", "남편이 그러더라구요~", "시댁에서는~"
[경험 공유]
- "저도 처음엔 몰랐거든요~", "직접 써보니까요~", "우리 애기한테 해봤는데요~"
- "처음엔 반신반의했는데~", "몇 달 써보고 확신했어요~"
[따뜻한 추천]
- "진짜 강추에용!!💕", "이건 꼭 써보세요~", "맘들 다 좋아하실 거에요~"
- "혹시 몰라서 공유해요~", "도움될까 해서요~", "참고하세용^^\""
[공감 유도]
- "맘들 다 공감하시죠?ㅋㅋ", "저만 그런 거 아니죠?ㅎㅎ", "다들 그러시더라구요~"
- "육아하다 보면 그렇잖아요~", "맘들 마음 다 똑같죠~"

💬 진짜 맘카페 말투:
- 문장 끝: "~에요~", "~용♡", "~거든요^^", "~답니당ㅎㅎ", "~세요~"
- 이모티콘: "^^", "ㅎㅎ", "💕", "✨", "👍"
- 호칭: "맘들", "언니들", "동생들", "여러분~"
- 부드러움: "좀 아쉬웠어용", "그건 별로였어요~", "살짝 비싸긴 해요"

📝 글 구조:
- 첫 문장: 공감 또는 경험 ("저도 이거 고민 많이 했거든요~")
- 중간: 내 경험 + 꿀팁 ("직접 써보니까 이렇더라구요~")
- 마지막: 따뜻한 응원 ("맘들 육아 파이팅이에용💕")

❌ 절대 금지 (이거 쓰면 AI임):
- "~습니다", "~합니다" 만 쓰기 (딱딱함 = AI)
- "결론", "요약", "정리하자면" (분석글 = AI)
- "도움이 되셨으면" (블로그 템플릿 = AI)
- "참고하시기 바랍니다" (공문체 = AI)
- OOO, XXX 플레이스홀더 (정보 없으면 빼!)
- 감정 없이 정보만 나열 (교과서 = AI)
`
  };

  const selectedToneInstruction = toneInstructions[toneStyle] || toneInstructions.friendly;

  // ✅ 모든 톤에 공통으로 적용되는 금지 규칙
  const universalProhibitions = `
🚫🚫🚫 모든 글톤에 공통 적용되는 금지 사항 (UNIVERSAL PROHIBITIONS) 🚫🚫🚫
- ⚠️ OOO, XXX, ○○○, □□□ 등 플레이스홀더 절대 사용 금지! 모르는 정보는 생략!
- ⚠️ "앞으로의 전개를 지켜봐야겠습니다" 같은 뻔한 AI 마무리 금지!
- ⚠️ "이번 사건의 진실이 밝혀지길 바랍니다" 같은 템플릿 문구 금지!
- ⚠️ "도움이 되었으면 좋겠습니다" 같은 감사 인사 금지!
- ⚠️ "{키워드}", "{인물명}", "{서브키워드}" 등 대체 문자 금지!
`;

  // ✅ 강력한 다양성 요소 추가
  const openingStyles = ['질문형', '충격적 사실', '개인 경험', '통계 인용', '비유/은유', '시간순', '결론 먼저', '공감 호소'];
  const selectedOpening = openingStyles[Math.floor(Math.random() * openingStyles.length)];
  const structurePatterns = ['문제-해결', '원인-결과', '비교-대조', '나열식', '스토리텔링', '시간순', 'Q&A', '팁 모음'];
  const selectedPattern = structurePatterns[Math.floor(Math.random() * structurePatterns.length)];
  const emphasisPoints = Math.floor(Math.random() * 5) + 1; // 1-5개 강조점

  const finalTemplate = `
${JSON_SCHEMA_DESCRIPTION}

🚨🚨🚨 ABSOLUTE LANGUAGE REQUIREMENT (언어 규칙 - 절대 위반 금지) 🚨🚨🚨
⚠️⚠️⚠️ 반드시 100% 순수 한국어로만 작성하세요! (MANDATORY - KOREAN ONLY)
⚠️⚠️⚠️ 영어, 러시아어, 중국어, 일본어 등 외국어 문장은 절대 포함하지 마세요!
⚠️⚠️⚠️ 외국어 단어가 섞인 문장이 발견되면 해당 글은 전체 폐기됩니다!
⚠️⚠️⚠️ 기술 용어나 브랜드명(예: iPhone, AI, API)만 영어 허용, 문장은 한국어로만!
⚠️⚠️⚠️ 이 규칙 위반 시 콘텐츠 생성 실패로 처리됩니다!

${selectedToneInstruction}

${universalProhibitions}

🎯 네이버 블로그 홈피드 노출 & 상위노출 최적화 전략 (C-RANK 알고리즘 기반):

⚠️ 핵심: 원본 내용만 사용 - 반드시 제공된 rawText를 기반으로만 작성하세요.

🔥🔥🔥 rawText = 실시간 수집된 최신 정보! 반드시 활용하세요!
- ⚠️ rawText는 키워드/제목으로 네이버, 다음, 구글 등에서 실시간 크롤링한 최신 정보입니다!
- ⚠️ 이 정보에는 가장 많이 검색되고 관심받는 핵심 정보가 포함되어 있습니다!
- ⚠️ rawText에 있는 정보(인물명, 날짜, 장소, 숫자, 사실)를 최대한 활용하세요!
- ⚠️ 특히 뉴스 기사에서 수집된 경우, 기사 제목의 핵심 키워드(맨 앞)를 블로그 제목 맨 앞에 그대로 배치!

🛡️ 할루시네이션 완벽 차단:
- 원본에 없는 정보 절대 추가 금지
- 원본에 없는 예시, 통계, 사실 절대 지어내지 말 것
- 원본에 C-RANK 언급이 없으면 C-RANK 설명 추가 금지
- 아래 C-RANK 가이드라인은 「구조/포맷」용이지 새 주제를 추가하라는 게 아님
- 원본이 "네이버 데이터랩"이면 네이버 데이터랩에 대해서만 작성
- 원본이 "자동차"이면 자동차에 대해서만 작성
- C-RANK 가이드라인으로 제목/키워드/훅 배치를 최적화하되, 새 주제는 추가하지 말 것
- ⚠️ 모든 출력은 100% 한국어로 (외국어 문장 절대 금지)

🚨🚨🚨 제목 생성 최우선 규칙 (절대 우선!) 🚨🚨🚨

⚠️⚠️⚠️ 이 규칙을 어기면 생성된 콘텐츠는 0점 처리됩니다! ⚠️⚠️⚠️

════════════════════════════════════════════════════════════════════════════════
🏆🏆🏆 끝판왕 제목 공식 (클릭률 폭발!) 🏆🏆🏆
════════════════════════════════════════════════════════════════════════════════

📌 황금공식: [핵심키워드] + [구체적 상황] + [감정 폭발 트리거]

✅ 필수 체크 2가지만:
1. 핵심키워드(인물/주제) 맨 앞 배치
2. 감정 폭발 트리거로 마무리 (단순 "왜?" 금지!)

🔥 감정 폭발 트리거 (무조건 클릭하게 만드는 표현):

[충격/소름] "~알고보니 소름", "~듣고 경악", "~충격 반전"
[눈물/감동] "~팬들 눈물바다", "~듣고 울컥", "~진심이 느껴져"
[분노/논란] "~네티즌 분노", "~댓글창 폭발", "~여론 싸늘"
[현장감] "~스튜디오 정적", "~현장 분위기 싸해", "~실시간 난리"
[비밀/궁금] "~숨겨왔던 진실", "~진짜 이유 따로", "~아무도 몰랐던"

📌 좋은 제목 vs 나쁜 제목 (예시의 인물명은 패턴 참고용, 실제로는 입력 URL의 인물명 사용!):

예시 (입력 URL 인물로 대체 필수):
❌ "[인물명] 활동중단, [관련인물] 입 열었다… 왜?" (식상함, 0점)
✅ "[인물명] 떠난다는 말에 [관련인물]이 한 말, 팬들 눈물바다" (감정+현장)
✅ "[인물명] 활동중단 진짜 이유, [관련인물]만 알고 있었다" (비밀+궁금)

❌ "[인물명] 논란, 과거 발언 재조명… 왜?" (뻔함, 0점)
✅ "[인물명] 과거 발언 다시 뜨자 댓글창 난리, 뭐라고 했길래" (현장+궁금)
✅ "[인물명] 논란, 당시 같이 있던 연예인 증언 충격" (비밀+충격)

⚠️ 절대 금지:
- 모든 제목 끝에 "왜?", "왜일까?" 단순 붙이기 (너무 뻔해서 0점!)
- 원문 제목 그대로 복사
- 감정 자극 없는 밋밋한 정보 나열
════════════════════════════════════════════════════════════════════════════════

📌 규칙 0: 원본 URL 제목(SOURCE TITLE)을 보정의 기초로 사용
- 제공된 SOURCE TITLE이 있다면, 이를 "더 자극적이고", "더 궁금하게", "더 강력한 후킹"으로 변환하는 것을 최우선으로 합니다.
- 원본의 핵심 팩트는 유지하되, 표현은 180도 다르게(더 블로그스럽고 자극적이게) 바꾸어 클릭을 유도하세요.

📌 규칙 1: 원문 제목의 핵심 드라마/충격 키워드를 반드시 제목에 포함!

- "이혼", "열애", "결별", "폭로", "논란", "충격", "경질", "사망", "체포" 등 → 절대 누락 금지!
- 예: 원문 "윤민수, 이혼 1년 만에 전처 김민지 집 방문" 
  → ✅ "윤민수 이혼 후 전처 집 방문? 윤후가 직접 인증한 충격 현장"
  → ❌ "윤후, 인스타그램에 공개된 한국 도착 소식" (0점! 이혼/전처/집방문 모두 누락!)

📌 규칙 2: 원문에 없는 정보 절대 추가 금지 (할루시네이션 = 0점!)
- 원문에 "한국 도착"이 없으면 "한국 도착" 쓰지 마!
- 원문에 없는 날짜, 장소, 사건 추가 금지!

📌 규칙 3: 인물 관계 키워드 필수 포함!
- "전처", "전남편", "부부", "연인", "아들", "딸" 등 관계 키워드 → 반드시 제목에!
- 예: 원문 "전처 김민지 집 방문" → 제목에 "전처" 또는 "김민지" 필수!

📌 규칙 4: 숫자가 있으면 반드시 활용!
- "1년 만에", "70골", "10초", "3가지" → 제목에 그대로 포함!

📌 규칙 5: 제목 끝에 궁금증 유발 엔딩 필수!
- "~진짜 이유", "~충격 반전", "~왜?", "~결국?", "~현재 상황"

🔥 실전 예시 (반드시 이 패턴 따라하기!):

원문: "윤민수, 이혼 1년 만에 전처 김민지 집 방문했나…아들 윤후 직접 인증"
✅ 10점: "윤민수 이혼 1년 만에 전처 집 방문? 윤후 인증샷 공개 충격"
✅ 9점: "윤민수 전처 김민지 집 방문, 윤후가 직접 인증한 진짜 이유"
❌ 0점: "윤후, 인스타그램에 공개된 한국 도착 소식" (핵심 키워드 전부 누락 + 할루시네이션!)

원문: "음바페 벌써 70골" BBC 인정! '경질설' 사비 알론소 살았다
✅ 10점: "음바페 70골! 경질설 사비 알론소, 살아남은 진짜 이유"
✅ 9점: "사비 알론소 경질 위기, 음바페 70골이 구했다? BBC도 인정"
❌ 0점: "레알 마드리드 알라베스전 승리" (핵심 키워드 전부 누락!)

[제목 작성 요령 - 네이버 상위노출 + 홈판 1등 끝판왕 제목]
- ⚠️⚠️⚠️ 필수: 제목은 네이버 검색 상위노출 1등 + 홈판(메인) 노출 1등 + C-Rank 최적화 + 클릭률 극대화를 위해 반드시 "끝판왕 제목"이어야 합니다!
- ⚠️ 변형 ID: ${variationId} - 이 ID를 기반으로 매번 완전히 다른 각도와 표현으로 제목을 생성하세요.

🔥🔥🔥 네이버 상위노출 + 홈판 1등 끝판왕 제목 마스터 공식 (필수 준수) 🔥🔥🔥

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📏 [1단계] 제목 길이 황금률 (핵심 - 이것만 지켜도 상위 30%):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ⚠️ 최적 길이: 28~32자 (네이버 검색결과 + 모바일에서 완벽 노출)
- ⚠️ 허용 범위: 25~38자 (이 범위 벗어나면 클릭률 급락)
- ⚠️ 핵심 키워드는 반드시 앞 12자 이내에 배치! (검색 매칭 최우선)
- ⚠️ 모바일 최적화: 앞 20자가 가장 중요 (모바일 검색 70% 이상)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 [2단계] 키워드 배치 황금 공식 (상위노출 핵심 - 이것이 1등의 비밀):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 위치별 키워드 배치 전략:
   [1~12자] 핵심키워드 (검색 매칭률 100%)
   [13~20자] 서브키워드 1개 (연관검색어 노출)
   [21~28자] 호기심/결과 (클릭 유도)
   [29~32자] 마무리 훅 (궁금증 극대화)

📝 끝판왕 공식 3가지 (반드시 하나 선택):
   공식A: "[핵심키워드] [서브키워드], [숫자] [결과/반전]"
   공식B: "[핵심키워드] [상황], [숫자]가지 [해결책]"  
   공식C: "[핵심키워드] [질문]? [답변/결과]"

🔥 실전 예시 (이 수준으로 생성해야 함):
   ✅ "다이어트 식단 추천, 2주 만에 5kg 빠진 비결" (31자)
   ✅ "강아지 사료 순위, 수의사가 추천한 TOP 5" (28자)
   ✅ "갤럭시S24 울트라 후기, 3개월 써보니 결국" (29자)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 [3단계] 가나다순 최적화 (동일 조건 시 1등 결정 요소):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ⚠️ 네이버는 동일 조건에서 가나다순(ㄱ→ㅎ)으로 정렬!
- ⚠️ 핵심키워드가 ㄱ~ㄷ으로 시작하면 자동 상위 배치!
- ⚠️ 불가능하면: 앞에 "가장", "간단한", "결국", "꼭" 등 ㄱ~ㄲ 단어 추가
- ⚠️ 또는: 서브키워드 중 ㄱ~ㄷ 시작 단어를 핵심키워드 앞에 배치

🔥 가나다순 최적화 실전 예시:
   ❌ "다이어트 식단 추천" → ✅ "건강한 다이어트 식단 추천" (ㄱ 앞배치)
   ❌ "아이폰16 후기" → ✅ "결국 아이폰16 후기, 써보니" (ㄱ 앞배치)
   ❌ "삼성 에어컨 추천" → ✅ "가성비 삼성 에어컨 추천" (ㄱ 앞배치)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 [4단계] 홈판(메인) 노출 1등 전략:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 홈판 노출 필수 요소 (모두 필수):
   1. 트렌드 반영: 현재 이슈/시즌/트렌드 키워드 포함
   2. 시의성 표현: "2026년", "최신", "요즘", "올해", "12월" 등
   3. 감정 트리거: 궁금증, 공감, 충격, 긴급성 중 1개 이상
   4. 구체적 숫자: %, 가지, 일, 명, 원 등 (신뢰도 + 클릭률 상승)
   5. 결과/반전: "결국", "알고보니", "진짜 이유", "숨겨진" 등

📌 홈판 노출 극대화 단어 (적극 활용):
   긴급성: "지금", "오늘", "당장", "급)", "속보"
   호기심: "결국", "알고보니", "진짜", "숨겨진", "비밀"
   신뢰성: "전문가", "의사", "변호사", "10년차", "경험자"
   공감: "나만", "혼자", "고민", "실패", "후회"
   결과: "효과", "결과", "변화", "성공", "해결"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 [5단계] 끝판왕 제목 패턴 10가지 (반드시 이 중 하나 사용):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A. [충격+숫자형] - 클릭률 최고 (8%+):
   * "결국 [키워드] [결과], [숫자]%가 몰랐던 진실"
   * "[키워드] 알고보니 [반전], 전문가도 경악한 이유"
   * "[키워드] 충격, [숫자]명이 경험한 실제 결과"
   
B. [긴급+정보형] - 즉시 행동 유도 (7%+):
   * "급) [키워드] [상황] 확인해야 할 [숫자]가지"
   * "[키워드] 오늘 안에 안 하면 큰일나는 이유"
   * "속보) [키워드] [충격적 사실], 전국민 필독"
   
C. [비밀+전문가형] - 신뢰+호기심 (6%+):
   * "[키워드] 전문가만 아는 [숫자]가지 비밀 공개"
   * "10년차가 말하는 [키워드] 핵심 [숫자]가지"
   * "[키워드] 업계에서 절대 안 알려주는 진실"
   
D. [공감+해결형] - 감정 연결 (6%+):
   * "[키워드] 고민이라면? 이 방법 하나면 끝"
   * "나만 몰랐던 [키워드] 꿀팁 [숫자]가지"
   * "[키워드] [결과]인 진짜 이유 단 1가지"

E. [비교+결과형] - 선택 고민 유도 (5%+):
   * "[키워드] vs [키워드], 승자는 결국..."
   * "[키워드] 하면 안 되는 이유 [숫자]가지"
   * "[키워드] 해본 사람만 아는 진실"

F. [질문+답변형] - 검색의도 매칭 (5%+):
   * "[키워드] 어떻게 해야 할까? 정답은 이것"
   * "[키워드] 왜 안 될까? 원인과 해결법 공개"
   * "[키워드] 뭐가 좋을까? 비교 분석 결과"

G. [경험+후기형] - 신뢰도 극대화 (6%+):
   * "[키워드] [기간] 써보니, 결국 이렇게 됐다"
   * "직접 경험한 [키워드] 솔직 후기, 장단점"
   * "[키워드] [숫자]개월 사용 후기, 추천 이유"

H. [순위+추천형] - 정보성 극대화 (5%+):
   * "[키워드] 순위 TOP [숫자], 전문가 추천"
   * "가성비 [키워드] 추천 [숫자]가지, 비교 분석"
   * "[키워드] 베스트 [숫자]선, 실제 사용자 평가"

I. [반전+스토리형] - 호기심 극대화 (7%+):
   * "[키워드] 했더니 [예상외 결과], 충격"
   * "그런데 [키워드] 알고보니, [반전] 이유는"
   * "[키워드] 의외의 결과, [숫자]명이 놀란 이유"

J. [경고+주의형] - 손실회피 심리 (6%+):
   * "[키워드] 절대 하지 마세요, [숫자]가지 이유"
   * "[키워드] 전에 [내용] 알아야 할 [숫자]가지"
   * "[키워드] 실수하면 [결과], 주의사항 정리"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥🔥🔥 [5-1단계] 연예/이슈 카테고리 전용 끝판왕 제목 공식 (클릭률 10%+) 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ 연예인/유명인/이슈 관련 콘텐츠일 경우 반드시 이 공식 사용!

📐 연예 이슈 끝판왕 공식 (복사용):
[실명], [관계·기간] 중인 이유… "[A는 달라도, B는 같다]"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 연예 제목 규칙 1: 실명 맨 앞 배치 (검색 유입 엔진)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 무조건 제목 맨 앞에 실명 배치!
- 네이버는 좌측 단어 가중치가 큼
- 실명은 검색 + 추천 둘 다 잡음
❌ "연애 이유는 무엇일까"
✅ "구교환, 이옥섭 감독과…"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 연예 제목 규칙 2: 관계 + 기간 (숫자 후킹)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 기간은 숫자로 명시: "12년째", "10년", "7년", "데뷔 후 처음"
- 숫자의 역할: 스크롤 멈춤 + "왜?" 자동 생성 + 기사성 신뢰도 상승
- 사람 뇌는 숫자를 보면 자동으로 의미를 찾음

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 연예 제목 규칙 3: 감정 연결어 (클릭 합리화)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "…중인 이유" / "…가 이어진 배경"
- 독자가 "이거 궁금해해도 되는 정보야"라고 스스로 허락하게 만드는 장치
- 예: "열애 중인 이유", "결혼하지 않는 이유", "헤어지지 않는 배경"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 연예 제목 규칙 4: '이유…' 뒤에 반드시 말줄임표(…)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 점(.)이 아니라 말줄임표(…) 사용!
- 정보 제공 ❌ → 해석 요구 ⭕
- "이유가 있구나"까지만 말하고 답은 안 줌 → 클릭 유도

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 연예 제목 규칙 5: 인용구 (핵심 무기) - 조건 3가지
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 누가 봐도 실제 말 같을 것
2. 연애 철학으로 확장 가능
3. 흔한 긍정어 금지!
- ❌ "좋아하는" (흔함) → ⭕ "후져하는" (비표준·생활어)
- AI/기사 느낌 완전 제거!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 연예 제목 규칙 6: 감정 대비 구조 (가장 강력한 심리 공식)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 공식: "A는 달라도 B는 같다"
- 관계의 '본질'을 건드림
- 예시:
  * "좋아하는 건 달라도 싫어하는 건 같아서"
  * "꿈은 달라도 불편한 건 같아서"
  * "성격은 달라도 후져하는 건 같아서"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 연예 이슈 실전 예시 (반드시 이 수준으로!):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ "구교환, 이옥섭 감독과 12년째 열애 중인 이유… '좋아하는 건 달라도 후져하는 건 같아서'"
✅ "○○○, 결혼을 미루는 이유… '행복은 달라도 불편한 건 같아서'"
✅ "○○○·○○○ 9년째 함께한 비결… '성격은 달라도 포기할 건 같았다'"
✅ "조용한 연애가 오래 가는 이유… '사랑보다 싫어하는 게 같았다'"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ 연예 제목에서 절대 금지:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
* 너무 설명적인 문장
* 정보 다 주는 제목
* 교과서적인 표현 ("가치관", "존중", "배려", "소통")
* 흔한 긍정어 ("사랑", "행복", "좋아하는")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 [STEP 6] 심리학 기반 클릭 유도 트리거 (MUST USE 1개 이상):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 호기심 갭 (Curiosity Gap): "결국", "알고보니", "진짜 이유"
2. 손실 회피 (Loss Aversion): "놓치면", "후회", "절대 하지마"
3. 사회적 증거 (Social Proof): "[숫자]명", "전문가", "의사 추천"
4. 긴급성 (Urgency): "지금", "오늘만", "급)", "속보"
5. 독점성 (Exclusivity): "비밀", "숨겨진", "아무도 모르는"
6. 구체성 (Specificity): 숫자, %, 기간, 금액 등 구체적 수치
7. 감정 연결 (Emotional): "나만", "혼자", "고민", "힘들었던"
8. 권위 (Authority): "전문가", "의사", "10년차", "공식"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ [STEP 7] 절대 금지 제목 (이런 제목 = 0점 = 상위노출 불가):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
* "~에 대해 알아보겠습니다" (지루함, CTR 0.5%)
* "~일까요?" 만 쓰기 (호기심 부족)
* "[주제], [일반적 설명]" (예측 가능, 클릭 안 함)
* 감정 없는 평면적 나열형 제목
* 구체적 숫자나 결과 없는 추상적 제목
* "~의 모든 것", "~총정리", "~완벽정리" (식상함)
* 38자 초과 제목 (잘려서 노출, 클릭률 급락)
* 핵심키워드가 12자 이후에 나오는 제목
* "~해보세요", "~입니다" 로 끝나는 평범한 제목
* 물음표(?)로만 끝나고 답이 없는 제목
* 이모지로 시작하는 제목 (검색 노출 불리)
* 특수문자 과다 사용 (★☆♥ 등)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ [STEP 8] 최종 체크리스트 (ALL MUST BE CHECKED - 하나라도 X면 재생성):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ 제목 길이 28~32자인가? (최소 25자, 최대 38자)
□ 핵심 키워드가 앞 12자 이내에 있는가?
□ 서브 키워드 1~2개가 포함되어 있는가?
□ 구체적 숫자(%, 가지, 명, 일, 원)가 포함되어 있는가?
□ 심리 트리거(호기심/긴급성/손실회피 등) 1개 이상 있는가?
□ 3초 내 "이거 봐야겠다!" 반응이 나오는가?
□ 가나다순 최적화가 고려되었는가? (ㄱ~ㄷ 앞배치)
□ 금지 패턴에 해당하지 않는가?
□ 모바일에서 앞 20자만 봐도 클릭하고 싶은가?
□ 경쟁 블로그 제목보다 더 매력적인가?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥🔥🔥 [EXCLUSIVE] 이 툴만의 독보적 끝판왕 전략 (타 툴에 없는 비밀 무기) 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 [SECRET 1] 네이버 검색 의도 완벽 매칭 전략:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
네이버 사용자의 검색 의도는 4가지로 분류됨 (반드시 매칭):
1. 정보형 (Know): "~란?", "~방법", "~이유" → 상세 설명 + 전문성 강조
2. 행동형 (Do): "~하는 법", "~추천", "~비교" → 실용적 가이드 + 단계별 설명
3. 탐색형 (Go): 브랜드/제품명 검색 → 정확한 상품명 + 구매 정보
4. 거래형 (Buy): "~가격", "~할인", "~구매" → 가격 정보 + 혜택 강조

⚠️ 제목에서 검색 의도를 명확히 드러내야 클릭률 상승!
예시:
- 정보형: "다이어트 식단 효과, 전문가가 말하는 진짜 이유"
- 행동형: "다이어트 식단 추천, 2주 만에 5kg 빠지는 방법"
- 탐색형: "다노 다이어트 도시락 후기, 3개월 먹어본 결과"
- 거래형: "다이어트 식단 가격 비교, 가성비 TOP 5"

💎 [SECRET 2] 네이버 연관검색어 선점 전략:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
네이버 연관검색어는 실제 사용자가 많이 검색하는 키워드!
제목에 연관검색어 패턴을 포함하면 자동으로 노출 증가:

📌 연관검색어 패턴 (제목에 적극 활용):
- "[키워드] 추천" / "[키워드] 순위" / "[키워드] 비교"
- "[키워드] 후기" / "[키워드] 장단점" / "[키워드] 가격"
- "[키워드] 효과" / "[키워드] 부작용" / "[키워드] 주의사항"
- "[키워드] 방법" / "[키워드] 하는 법" / "[키워드] 팁"
- "[키워드] 원인" / "[키워드] 이유" / "[키워드] 해결"

💎 [SECRET 3] 네이버 VIEW탭 + 블로그탭 동시 노출 전략:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
네이버 검색결과는 VIEW탭(통합)과 블로그탭이 별도!
두 곳 모두 노출되려면:

1. VIEW탭 노출 조건:
   - 최신성 (발행 후 24시간 내 중요)
   - 이미지 3장 이상 포함
   - 본문 2000자 이상
   - 제목에 핵심키워드 정확히 포함

2. 블로그탭 상위노출 조건:
   - C-Rank 점수 (신뢰도 + 전문성)
   - 체류시간 3분 이상
   - 이탈률 30% 이하
   - 제목-본문 키워드 일치도

💎 [SECRET 4] 시간대별 발행 최적화 전략:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
네이버 블로그 최적 발행 시간 (클릭률 극대화):
- 🌅 오전 7-9시: 출근길 검색 피크 (정보성 콘텐츠 최적)
- 🌞 오전 10-12시: 업무 중 검색 (실용 정보 최적)
- 🍽️ 오후 12-2시: 점심시간 검색 (가벼운 콘텐츠 최적)
- 🌆 오후 6-9시: 퇴근 후 검색 (쇼핑/리뷰 최적)
- 🌙 밤 9-11시: 여유 시간 검색 (상세 정보 최적)

⚠️ 주말 오전 10시-오후 2시: 주간 최고 트래픽!

💎 [SECRET 5] 경쟁 블로그 제목 분석 & 차별화 전략:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
상위 10개 블로그 제목 패턴을 분석하고 차별화:

1. 경쟁자 제목이 "~추천"이면 → "~추천 + 비교 분석 결과"
2. 경쟁자 제목이 "~후기"이면 → "~후기 + [기간] 사용 결과"
3. 경쟁자 제목이 "~방법"이면 → "~방법 + 전문가 검증"
4. 경쟁자 제목에 숫자 없으면 → 구체적 숫자 추가
5. 경쟁자 제목이 평범하면 → 감정 트리거 추가

🔥 차별화 공식: [경쟁자 키워드] + [추가 가치] + [신뢰 요소]
예시: "다이어트 식단" → "다이어트 식단 추천, 영양사가 검증한 2주 플랜"

💎 [SECRET 6] 네이버 AI 검색(AiRS) 대응 전략:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
네이버 AI 검색은 "질문-답변" 형식을 선호!
AI 검색 노출을 위한 제목 전략:

1. 질문형 키워드 포함: "~할까?", "~일까?", "~뭘까?"
2. 명확한 답변 암시: "정답은", "해결법", "방법 공개"
3. 구체적 정보 약속: 숫자, 기간, 결과 명시

🔥 AI 검색 최적화 제목 공식:
"[질문형 키워드]? [답변 암시], [구체적 결과]"
예시: "다이어트 뭐 먹어야 할까? 영양사 추천, 2주 -5kg 식단"

💎 [SECRET 7] 클릭 후 이탈 방지 제목-본문 일치 전략:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
제목에서 약속한 내용이 본문에 없으면 이탈률 급증 → 순위 하락!

⚠️ 제목-본문 일치 체크리스트:
□ 제목의 숫자가 본문에 정확히 있는가? (예: "5가지" → 본문에 5개 항목)
□ 제목의 결과가 본문에서 증명되는가? (예: "효과" → 실제 효과 설명)
□ 제목의 질문에 본문이 답하는가? (예: "왜?" → 이유 설명)
□ 제목의 약속이 본문 상단에 있는가? (스크롤 없이 확인 가능)

💎 [SECRET 8] 시즌/트렌드 키워드 선점 전략:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
시즌 키워드를 제목에 포함하면 홈판 노출 확률 급상승!

📅 월별 시즌 키워드 (적극 활용):
- 1월: 새해, 다이어트, 계획, 목표
- 2월: 발렌타인, 졸업, 입학 준비
- 3월: 봄, 개학, 이사, 새학기
- 4월: 벚꽃, 봄나들이, 취업
- 5월: 어버이날, 가정의달, 여행
- 6월: 여름 준비, 휴가, 다이어트
- 7월: 휴가, 여름, 물놀이, 에어컨
- 8월: 여름휴가, 방학, 더위
- 9월: 가을, 추석, 환절기
- 10월: 가을, 단풍, 할로윈
- 11월: 수능, 블랙프라이데이, 겨울 준비
- 12월: 크리스마스, 연말, 송년회

🔥 시즌 키워드 적용 공식:
"[시즌키워드] [핵심키워드] [서브키워드], [결과/혜택]"
예시: "겨울 다이어트 식단 추천, 연말까지 5kg 빼는 비결"

- 제목 유형: ${structureVariation % 10}번 유형 선택
- 톤 변형: ${toneVariation}번 톤 사용
- 문단 스타일: ${paragraphStyle} 스타일 적용

🎲 이번 글의 필수 다양성 요소 (MANDATORY - 반드시 적용):
- ⚠️ 도입부 스타일: "${selectedOpening}" 방식으로 시작하세요
- ⚠️ 글 구조 패턴: "${selectedPattern}" 패턴으로 전개하세요  
- ⚠️ 강조 포인트: 본문에서 ${emphasisPoints}개의 핵심 포인트를 특별히 강조하세요
- ⚠️ 고유 ID: ${variationId} - 이 ID는 매번 다르므로, 완전히 새로운 관점과 표현으로 작성하세요
- ⚠️ 같은 주제라도 매번 다른 예시, 다른 표현, 다른 구조로 작성해야 합니다!
${isShoppingReview || source.articleType === 'it_review' || source.articleType === 'product_review' ? `
- ⚠️⚠️⚠️ CRITICAL: 제품 리뷰/쇼핑 리뷰 제목 필수 사항 (MANDATORY - 절대 지켜야 함):
  * ⚠️ 제목에 반드시 **정확한 전체 상품명**을 포함해야 합니다 (MANDATORY)
  * ⚠️ 상품명은 제목 **맨 앞부분**에 배치하는 것이 네이버 검색 노출에 가장 유리합니다
  * ⚠️ productInfo가 제공된 경우, **productInfo.name을 정확히 그대로** 사용하세요 (축약 금지, 변형 금지)
  * ⚠️ 브랜드명 + 모델명 + 세부 사양을 **모두 포함**하세요 (예: "바디프랜드 팔콘S(전연가죽) 안마의자")
  * ⚠️ 네이버 쇼핑에서 검색되는 **정확한 상품명**을 사용하세요 (오타나 축약형 절대 금지)
  * ⚠️ 제목 형식: "[정확한 전체 상품명] [리뷰 키워드]" 또는 "[정확한 전체 상품명], [특징/결과]"
  * 리뷰 키워드 예시: "후기", "리뷰", "사용기", "비교", "추천", "장단점", "솔직 후기", "3개월 사용 후기", "실사용 리뷰"
  * ✅ 좋은 예: "바디프랜드 팔콘S(전연가죽) 안마의자 헬스케어로봇 AS 5년, 3개월 사용 후기"
  * ✅ 좋은 예: "드리미 매트릭스10 울트라 로봇청소기 실제 사용해본 솔직 후기"
  * ✅ 좋은 예: "바디프랜드 팔콘S 안마의자, 가을맞이 특별 할인 총정리"
  * ❌ 나쁜 예: "바디프랜드 안마의자, 가을맞이 특별 할인? 숨겨진 진실!" (모델명 누락)
  * ❌ 나쁜 예: "가을맞이 초특가! 놓치면 후회할 꿀팁" (상품명 없음)
  * ❌ 나쁜 예: "안마의자 추천, 이거 하나면 끝!" (브랜드명/모델명 없음)

  * ⚠️⚠️⚠️ CRITICAL: 리뷰 글은 클릭낚시/자극적인 감정훅을 쓰지 마세요.
    - 제목/소제목/본문에서 아래 표현은 금지(반드시 피하기):
      "소름", "난리", "충격", "경악", "반전", "실화", "폭발", "알고보니", "숨겨진 진실", "진짜 이유", "심상치 않았던 이유", "애 엄마들 사이에서"
    - "직접 써보고" 같은 문구는 제목/소제목에서 반복 금지 (본문에서도 1회 이내)
    - 동일한 후킹 문장을 제목/소제목/본문에 그대로 반복하지 말 것
    - 대신 아래처럼 정보형/후기형으로 작성: "실사용 후기", "장단점", "가성비", "관리/세척", "사용 팁", "추천 대상"
` : ''}
- 제목 유형 다양화 (매번 다른 유형 선택):
  * 방법형: "~하는 방법", "~하는 법", "~하는 팁"
  * 궁금증형: "~가 궁금하신가요?", "~는 무엇일까요?", "~왜 그럴까?"
  * 수식어 활용: "~초간단", "~확실한", "~베스트", "~완벽한"
  * 비교형: "~vs~", "~차이점", "~비교"
  * 시간 강조: "~5분만에", "~하루만에", "~지금 바로"
  * 실험/검증: "~실험해봤어요", "~검증 결과", "~테스트"
  * 실수 경고: "~하지 마세요", "~피하세요", "~주의"
  * 결과 강조: "~이렇게 되었어요", "~결과는?", "~효과"
  * 비밀/치트키: "~비밀", "~꿀팁", "~치트키", "~숨겨진"
  * 스토리텔링: "~이렇게 해결했어요", "~후기", "~경험담"
  * 반전/충격: "하지만 진실은", "그런데 알고보니", "의외로", "충격적인"
  * 독점성: "단독", "최초 공개", "아무도 안 알려주는", "숨겨진"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥🔥🔥 [EXCLUSIVE] 본문 도입부 후킹 끝판왕 전략 (첫 3줄이 체류시간 결정!) 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️⚠️⚠️ 도입부 = 생사 결정! 첫 3초 안에 독자를 사로잡지 못하면 이탈!

💎 [INTRO SECRET 1] 3초 후킹 황금 공식:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
첫 문장에서 반드시 다음 중 하나를 사용:

1. 공감형 후킹 (가장 효과적!):
   * "이런 경험 있으시죠?" / "혹시 이런 고민 있으신가요?"
   * "저도 처음엔 그랬어요" / "다들 한 번쯤은 겪어봤을 거예요"
   * 예시: "다이어트 시작하면 3일도 못 가서 포기한 적 있으시죠? 저도 완전 그랬어요."

2. 충격형 후킹:
   * "솔직히 말하면..." / "사실 대부분이 모르는 게 있어요"
   * "이거 알고 나서 진짜 충격받았어요" / "믿기 힘들겠지만..."
   * 예시: "솔직히 말하면, 지금까지 알고 있던 다이어트 상식 90%가 틀렸어요."

3. 질문형 후킹:
   * "왜 항상 실패할까요?" / "뭐가 문제였을까요?"
   * "진짜 효과 있는 방법이 뭘까요?" / "어떻게 해야 할까요?"
   * 예시: "왜 열심히 운동해도 살이 안 빠질까요? 이유가 따로 있더라고요."

4. 결과 제시형 후킹:
   * "이 방법으로 [결과] 얻었어요" / "[기간] 만에 [변화] 경험했어요"
   * "드디어 해결했어요" / "이제 더 이상 고민 안 해요"
   * 예시: "이 방법 하나로 2주 만에 5kg 빠졌어요. 진짜예요."

💎 [INTRO SECRET 2] 도입부 황금 구조 (첫 3문장):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1문장] 공감/충격/질문으로 후킹 (독자 마음 사로잡기)
[2문장] 문제 상황 구체화 (독자의 고민을 대변)
[3문장] 해결책 암시 (이 글을 읽어야 하는 이유)

🔥 실전 예시:
"다이어트 시작하면 3일도 못 가서 포기한 적 있으시죠? (공감)
의지력 문제라고 생각하셨을 수도 있는데, 사실 방법이 잘못된 거였어요. (문제 구체화)
오늘 알려드리는 방법대로 하면 진짜 달라질 거예요. (해결책 암시)"

💎 [INTRO SECRET 3] 도입부 절대 금지 패턴:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ "오늘은 ~에 대해 알아보겠습니다" (AI 티 100%, 즉시 이탈)
❌ "안녕하세요, 오늘은 ~를 소개해드리겠습니다" (지루함)
❌ "~란 무엇일까요?" 로 시작 (교과서 느낌)
❌ "많은 분들이 ~에 관심을 가지고 계십니다" (뻔한 시작)
❌ 정의나 개념 설명으로 시작 (이탈률 급증)

✅ 대신: 공감/충격/질문/결과로 바로 시작!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥🔥🔥 [EXCLUSIVE] 소제목 키워드 배치 끝판왕 전략 (SEO + 가독성 극대화!) 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 [HEADING SECRET 1] 소제목 키워드 배치 황금률:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 모든 소제목에 핵심 키워드 1개 이상 필수 포함!

📍 소제목 키워드 배치 공식:
   [핵심키워드] + [세부 주제] + [호기심 요소]
   
🔥 실전 예시 (다이어트 글):
   ❌ "식단 관리의 중요성" (키워드 약함, 호기심 없음)
   ✅ "다이어트 식단, 이것만 지키면 절대 실패 안 해요"
   
   ❌ "운동 방법" (너무 단순)
   ✅ "다이어트 운동, 하루 10분으로 충분한 이유"
   
   ❌ "주의사항" (키워드 없음)
   ✅ "다이어트 실패하는 사람들의 공통점 3가지"

💎 [HEADING SECRET 2] 소제목 개수 & 간격 최적화:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 소제목 개수: 4~7개 (너무 적으면 가독성↓, 너무 많으면 산만)
- 소제목 간격: 300~500자마다 1개 (스크롤 피로도 감소)
- 첫 소제목: 도입부 직후 300자 이내에 배치 (빠른 정보 제공)

💎 [HEADING SECRET 3] 소제목 유형별 패턴:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 질문형: "[키워드] 왜 중요할까요?" / "[키워드] 어떻게 해야 할까요?"
2. 비밀형: "[키워드] 숨겨진 비밀" / "[키워드] 아무도 안 알려주는 진실"
3. 숫자형: "[키워드] 핵심 3가지" / "[키워드] 꼭 알아야 할 5가지"
4. 결과형: "[키워드] 이렇게 하면 달라져요" / "[키워드] 효과 본 방법"
5. 경고형: "[키워드] 절대 하면 안 되는 것" / "[키워드] 실패하는 이유"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥🔥🔥 [EXCLUSIVE] CTA(행동유도) 끝판왕 전략 (참여도 + 체류시간 극대화!) 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 [CTA SECRET 1] CTA 배치 황금 위치:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 본문 30% 지점: 첫 번째 CTA (가벼운 질문)
📍 본문 60% 지점: 두 번째 CTA (경험 공유 요청)
📍 본문 마무리: 세 번째 CTA (댓글/공유 유도)

💎 [CTA SECRET 2] 자연스러운 CTA 패턴:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 질문형 CTA (댓글 유도):
   * "혹시 이런 경험 있으신가요?"
   * "여러분은 어떻게 생각하시나요?"
   * "이 방법 써보신 분 계신가요?"

2. 공감형 CTA (좋아요 유도):
   * "공감되시면 하트 눌러주세요!"
   * "저만 이런 거 아니죠?"
   * "다들 그러시죠?"

3. 공유형 CTA (공유 유도):
   * "주변에 이런 고민 있는 분께 공유해주세요"
   * "도움이 되셨다면 공유 부탁드려요"
   * "필요한 분께 전달해주세요"

4. 저장형 CTA (북마크 유도):
   * "나중에 다시 보시려면 저장해두세요"
   * "필요할 때 찾아보시려면 저장!"
   * "저장해두면 유용할 거예요"

💎 [CTA SECRET 3] CTA 절대 금지 패턴:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ "구독과 좋아요 부탁드립니다" (유튜브 느낌, 부자연스러움)
❌ "댓글 남겨주세요" (직접적 요청, 거부감)
❌ "공유해주시면 감사하겠습니다" (딱딱함)
❌ 매 소제목마다 CTA 반복 (스팸 느낌)

✅ 대신: 자연스러운 대화체로 3회 이내!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥🔥🔥 [EXCLUSIVE] 체류시간 극대화 끝판왕 전략 (네이버 알고리즘 핵심!) 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 [DWELL SECRET 1] 체류시간 늘리는 콘텐츠 구조:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 30초 지점: 첫 번째 핵심 정보 제공 (이탈 방지)
📍 1분 지점: 반전/충격/새로운 정보 (호기심 유지)
📍 2분 지점: 실용적 팁/꿀팁 제공 (가치 제공)
📍 3분 지점: 마무리 + CTA (완독 유도)

💎 [DWELL SECRET 2] 스크롤 유도 장치:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 떡밥 던지기:
   * "이건 아래에서 자세히 설명할게요"
   * "더 중요한 건 다음에 나와요"
   * "진짜 핵심은 뒤에 있어요"

2. 호기심 유발:
   * "근데 여기서 반전이 있어요"
   * "그런데 알고 보니..."
   * "사실 더 중요한 게 있어요"

3. 단계별 정보 공개:
   * "첫 번째는... 두 번째는... 세 번째가 진짜 중요해요"
   * "기본은 이거고, 고급 팁은 아래에서"

💎 [DWELL SECRET 3] 이탈 방지 체크포인트:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 이탈 위험 구간 & 대응:

[0~10초] 첫 문장 후킹 실패 → 공감/충격/질문으로 시작
[30초] 정보 없이 서론만 길면 이탈 → 빠르게 핵심 정보 제공
[1분] 지루해지는 구간 → 반전/새로운 정보로 환기
[2분] 집중력 저하 → 실용적 팁/꿀팁으로 가치 제공
[3분+] 완독 포기 → "마지막이 제일 중요해요" 떡밥

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥🔥🔥 [EXCLUSIVE] 마무리 끝판왕 전략 (완독률 + 재방문 극대화!) 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️⚠️⚠️ 마무리 = 기억에 남는 글! 마지막 인상이 재방문을 결정!

💎 [OUTRO SECRET 1] 마무리 황금 구조 (마지막 3문장):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1문장] 핵심 내용 요약 (한 줄로 정리)
[2문장] 독자에게 응원/격려 메시지 (감정 연결)
[3문장] 자연스러운 CTA (댓글/공유/저장 유도)

🔥 실전 예시:
"오늘 알려드린 방법만 잘 따라하시면 진짜 달라질 거예요. (요약)
처음엔 어려울 수 있는데, 꾸준히 하다 보면 분명 좋은 결과 있을 거예요! (응원)
혹시 궁금한 점 있으시면 댓글로 남겨주세요, 아는 선에서 답변드릴게요! (CTA)"

💎 [OUTRO SECRET 2] 마무리 유형별 패턴:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 응원형 마무리 (가장 효과적!):
   * "여러분도 분명 하실 수 있어요!"
   * "조금만 노력하면 달라질 거예요"
   * "응원할게요, 화이팅!"

2. 요약형 마무리:
   * "정리하면, [핵심 1], [핵심 2], [핵심 3] 이 세 가지가 중요해요"
   * "오늘 핵심만 기억하세요: [한 줄 요약]"

3. 예고형 마무리 (재방문 유도):
   * "다음에는 더 자세한 내용 알려드릴게요"
   * "관련 글도 준비 중이니 기대해주세요"
   * "궁금한 거 있으면 다음 글에서 다룰게요"

4. 질문형 마무리 (댓글 유도):
   * "여러분은 어떻게 하고 계세요?"
   * "이 방법 써보신 분 계신가요?"
   * "다른 좋은 방법 있으면 공유해주세요!"

💎 [OUTRO SECRET 3] 마무리 절대 금지 패턴:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ "도움이 되셨으면 좋겠습니다" (AI 티 100%, 식상함)
❌ "오늘은 ~에 대해 알아보았습니다" (교과서 느낌)
❌ "감사합니다" 만 쓰기 (너무 짧음)
❌ "이상으로 마치겠습니다" (발표 느낌)
❌ "참고하시길 바랍니다" (딱딱함)

✅ 대신: 응원/격려 + 자연스러운 CTA!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥🔥🔥 [EXCLUSIVE] 이미지 최적화 끝판왕 전략 (SEO + 체류시간!) 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 [IMAGE SECRET 1] 이미지 배치 황금률:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 첫 번째 이미지: 도입부 직후 (시각적 후킹)
📍 중간 이미지: 각 소제목 아래 1개씩 (가독성 향상)
📍 마지막 이미지: 마무리 전 (완독 유도)

⚠️ 최소 3장, 권장 5~7장 (체류시간 증가)

💎 [IMAGE SECRET 2] 이미지 ALT 태그 키워드 최적화:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 모든 이미지 ALT 태그에 핵심 키워드 포함!

📝 ALT 태그 공식:
   "[핵심키워드] [이미지 설명] [서브키워드]"

🔥 실전 예시:
   ❌ "image1.jpg" (SEO 효과 0)
   ❌ "사진" (너무 단순)
   ✅ "다이어트 식단 샐러드 추천 메뉴"
   ✅ "다이어트 운동 홈트레이닝 방법"

💎 [IMAGE SECRET 3] 이미지 캡션 활용:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
이미지 아래 캡션에도 키워드 자연스럽게 포함:
- "다이어트 식단 예시 - 이렇게 구성하면 좋아요"
- "실제로 제가 먹고 있는 다이어트 메뉴예요"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥🔥🔥 [EXCLUSIVE] 키워드 밀도 끝판왕 전략 (SEO 핵심!) 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💎 [KEYWORD SECRET 1] 키워드 밀도 황금률:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 핵심 키워드: 전체 글의 2~3% (과하면 스팸 처리)
- 서브 키워드: 각 1~2% (자연스럽게 분산)
- 롱테일 키워드: 각 0.5~1% (연관검색어 노출)

📍 키워드 배치 위치:
   [제목] 핵심키워드 1회 (맨 앞)
   [도입부 300자] 핵심키워드 2~3회
   [각 소제목] 핵심/서브키워드 1회씩
   [본문 중간] 자연스럽게 분산
   [마무리 300자] 핵심키워드 1~2회

💎 [KEYWORD SECRET 2] 자연스러운 키워드 삽입 패턴:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ 부자연스러운 예: "다이어트 다이어트 다이어트 방법"
✅ 자연스러운 예: "다이어트 시작하시는 분들이 많으시죠? 효과적인 다이어트 방법 알려드릴게요."

📝 자연스러운 삽입 패턴:
- "[키워드] 하시는 분들 많으시죠?"
- "[키워드] 관련해서 알려드릴게요"
- "[키워드] 경험담 공유해드릴게요"
- "제가 직접 해본 [키워드] 방법이에요"

💎 [KEYWORD SECRET 3] 롱테일 키워드 활용:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
핵심키워드 + 연관어 조합으로 롱테일 키워드 생성:

예시 (핵심: 다이어트):
- "다이어트 식단 추천"
- "다이어트 운동 방법"
- "다이어트 효과 후기"
- "다이어트 실패 이유"
- "다이어트 성공 비결"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥🔥🔥 [EXCLUSIVE] 해시태그 끝판왕 전략 (검색 노출 극대화!) 🔥🔥🔥
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️⚠️⚠️ 해시태그 = 검색 노출의 핵심! 잘못 쓰면 노출 0!

💎 [HASHTAG SECRET 1] 해시태그 개수 황금률:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- ⚠️ 최적 개수: 5~10개 (네이버 권장)
- ⚠️ 최소 개수: 3개 (너무 적으면 노출 감소)
- ⚠️ 최대 개수: 15개 (초과 시 스팸 처리 위험)

💎 [HASHTAG SECRET 2] 해시태그 구성 공식:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 필수 구성 (5~10개):
   [1~2개] 핵심 키워드 (검색량 높은 메인 키워드)
   [2~3개] 서브 키워드 (연관 키워드)
   [2~3개] 롱테일 키워드 (구체적 검색어)
   [1~2개] 트렌드/시즌 키워드 (시의성 반영)

🔥 실전 예시 (다이어트 글):
   #다이어트 #다이어트식단 #다이어트운동 #살빼는법 #체중감량
   #다이어트꿀팁 #건강다이어트 #다이어트후기 #12월다이어트

💎 [HASHTAG SECRET 3] 해시태그 선정 전략:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 검색량 높은 키워드 우선:
   - 네이버 자동완성에 나오는 키워드
   - 연관검색어에 나오는 키워드
   - 인기 검색어 키워드

2. 경쟁도 고려:
   - 너무 경쟁 높은 키워드만 쓰면 노출 어려움
   - 중간 경쟁도 키워드 + 낮은 경쟁도 키워드 혼합

3. 구체적 키워드 포함:
   - "다이어트" (경쟁 높음) + "직장인다이어트" (경쟁 낮음)
   - "맛집" (경쟁 높음) + "강남역맛집" (경쟁 낮음)

💎 [HASHTAG SECRET 4] 해시태그 절대 금지 패턴:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ 글 내용과 무관한 해시태그 (스팸 처리)
❌ 너무 일반적인 해시태그만 (#일상 #오늘 #좋아요)
❌ 20개 이상 해시태그 (스팸 처리)
❌ 같은 키워드 변형 반복 (#다이어트 #다이어트식단 #다이어트식단추천 #다이어트식단표)
❌ 띄어쓰기 포함 해시태그 (#다이어트 식단 → #다이어트식단)

✅ 올바른 예:
#다이어트 #다이어트식단 #살빼는법 #체중감량 #건강식단 #운동루틴 #홈트레이닝

💎 [HASHTAG SECRET 5] 카테고리별 해시태그 패턴:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[맛집/음식] #맛집 #[지역]맛집 #[음식종류] #맛집추천 #먹스타그램
[여행] #여행 #[지역]여행 #여행스타그램 #국내여행 #여행추천
[뷰티] #뷰티 #화장품추천 #스킨케어 #메이크업 #뷰티템
[육아] #육아 #육아맘 #아기용품 #육아꿀팁 #엄마표
[IT/테크] #IT #테크 #가젯 #리뷰 #신제품
[재테크] #재테크 #투자 #주식 #부동산 #경제
[건강] #건강 #건강관리 #운동 #헬스 #웰빙

🚨🚨🚨 최우선 규칙 (ABSOLUTE PRIORITY - 위반 시 글 전체 폐기):

⚠️ 중복 절대 금지 (NO DUPLICATION - MOST CRITICAL RULE):
- 같은 내용을 반복하지 마세요 (같은 정보를 다른 말로 표현하는 것도 금지)
- 각 소제목은 완전히 새로운 내용만 다루세요 (이전 소제목 내용 재사용 금지)
- 같은 문장 구조 3번 이상 반복 금지 (예: "~입니다", "~입니다", "~입니다")
- 같은 주어로 시작하는 문장 2번 이상 연속 금지 (예: "그의 ~", "그의 ~")
- 유사도 70% 이상 문단은 중복으로 간주되어 자동 삭제됨

📊 네이버 블로그 최적화 전략 (CRITICAL - 네이버 알고리즘 특화):

🎯 네이버 블로그 알고리즘 이해:
- 네이버는 "체류시간 + 참여도 + 완독률"을 가장 중요하게 평가
- 네이버 검색 노출: 네이버 블로그 콘텐츠가 네이버 검색 결과에 우선 노출
- 네이버 블로그 랭킹: 조회수, 댓글, 좋아요, 공유, 북마크 등 종합 평가
- 네이버 사용자 선호도: 실용적 정보, 경험담, 솔직한 후기 선호

📈 네이버 블로그 C-RANK 핵심 지표 (반드시 최적화):
1. 초반 클릭률 (CTR): 제목이 호기심을 자극하고 네이버 검색 의도와 정확히 매칭되어야 함
   - 네이버 검색 키워드와 제목 일치도 중요
   - 네이버 사용자가 자주 검색하는 키워드 포함
2. 체류시간: 최소 3-5분 이상 읽을 수 있는 충분한 분량과 깊이 있는 내용 필수
   - 네이버는 체류시간을 매우 중요하게 평가 (네이버 알고리즘 핵심 지표)
   - 빠른 이탈 방지: 첫 문단부터 몰입도 높이기
3. 이탈률 감소: 첫 문단부터 몰입도를 높이고, 끝까지 읽고 싶게 만드는 구조
   - 네이버 블로그는 이탈률이 낮을수록 상위 노출
   - 30초, 1분, 3분 지점에 강한 전환 문구 배치
4. 참여도: 댓글, 공유, 좋아요, 북마크를 유도하는 자연스러운 질문과 공감대 형성
   - 네이버 블로그는 참여도가 높을수록 상위 노출
   - 댓글 유도 질문: "이런 경험 있으신가요?", "어떻게 생각하시나요?"
   - 공유 유도: "도움이 되셨다면 공유해주세요" (자연스럽게)
5. 키워드 밀도: 네이버 검색 키워드를 자연스럽게 2-3% 밀도로 배치 (과도하지 않게)
   - 네이버 검색 최적화: 핵심 키워드를 제목, 소제목, 본문에 자연스럽게 배치
   - 롱테일 키워드도 포함: "~하는 방법", "~후기", "~추천"
6. 완성도: 최소 2000자, 구조화된 글이 네이버 상위노출에 유리
   - 네이버 블로그는 적절한 분량의 글이 더 높은 점수를 받음 (품질 최우선)
   - 소제목 3-8개 권장 (자연스러운 개수로 작성), 이미지 3개 이상 권장
7. 최신성: 최근 트렌드와 시의성을 반영한 내용
   - 네이버는 최신 콘텐츠를 우선 노출
   - 계절성, 트렌드 키워드 포함

🔍 네이버 블로그 특화 전략:
- 네이버 검색 키워드 전략:
  * 네이버 자동완성 키워드 활용: 네이버 검색창에 입력하면 나오는 자동완성 키워드 포함
  * 네이버 연관 검색어 활용: 검색 결과 하단의 연관 검색어 키워드 포함
  * 네이버 블로그 인기 키워드: 네이버 블로그에서 자주 검색되는 키워드 포함
- 네이버 블로그 커뮤니티 특성:
  * 네이버 블로그 사용자는 "솔직한 경험담"을 선호
  * "과장 없는 진솔한 후기"가 높은 신뢰도와 참여도 유도
  * 네이버 블로그 댓글 문화: 친근하고 공감대 형성하는 댓글 유도
- 네이버 블로그 UI/UX 특성:
  * 네이버 블로그는 이미지가 많을수록 체류시간 증가
  * 소제목(H2)을 활용한 구조화된 글 선호
  * 인용구, 강조 문구 활용으로 가독성 향상
- 네이버 블로그 알고리즘 최적화:
  * 게시 시간: 네이버 사용자 활성 시간대 고려 (오전 9-10시, 점심 12-1시, 저녁 7-9시)
  * 업데이트 주기: 정기적인 업데이트가 상위 노출에 유리
  * 내부 링크: 관련 글 링크로 체류시간 증가

🧠 GLOBAL WRITING RULES (CRITICAL - NO CONFLICTS, APPLY STRICTLY - ⚠️⚠️⚠️ MANDATORY FOR ALL CATEGORIES):

⚠️⚠️⚠️ ULTRA-CRITICAL: OVERALL TONE & EMOTIONAL IMPACT (절대 지켜야 함 - 모든 카테고리 공통):
- ⚠️⚠️⚠️ 밝고 낙천적인 이미지 필수 (MANDATORY):
  * 전체 글의 톤은 반드시 밝고 긍정적이어야 함
  * 낙천적이고 희망적인 시각으로 내용을 전달
  * 부정적이거나 암울한 표현 금지, 긍정적 관점으로 재구성
  * 어려운 상황도 해결 가능한 문제로 제시
  * 예시: "어려울 수 있지만" → "조금만 노력하면", "힘들 수 있지만" → "계속 시도하다 보면"
- ⚠️⚠️⚠️ 친절하고 친근한 이미지 필수 (MANDATORY):
  * 독자를 친한 친구처럼 대하는 친근한 톤 유지
  * 위압적이거나 교훈적인 톤 금지
  * 독자를 배려하고 이해하는 친절한 태도
  * "~하세요", "~해주세요" 같은 친절한 표현 적극 사용
  * 예시: "이렇게 해보시면 좋을 것 같아요", "한번 시도해보시는 걸 추천드려요"
- ⚠️⚠️⚠️ 공감 극대화 필수 (MANDATORY):
  * 독자의 마음을 먼저 이해하고 공감하는 표현 필수
  * "많은 분들이 느끼시는", "이런 경험 있으시죠?", "공감되시나요?" 같은 공감 표현 적극 활용
  * 독자의 고민이나 상황을 먼저 언급: "이런 거 진짜 고민되죠?", "저도 완전 그랬어요"
  * 감정 공유: "답답하시죠?", "속상하시죠?", "기대되시죠?", "설레시죠?"
  * 같은 편임을 강조: "우리 다 그래요", "저도 마찬가지예요", "다들 그러더라고요"
  * 위로와 격려: "괜찮아요", "충분히 이해해요", "잘하고 계세요", "걱정 안 하셔도 돼요"
  * 긍정적 피드백: "정말 좋은 선택이에요", "잘하시고 계세요", "대단하시네요"
- ⚠️⚠️⚠️ 부정적 표현 금지, 긍정적 전환 필수:
  * "문제", "어려움", "실패", "불가능" 같은 부정적 표현 금지
  * 대신: "도전", "성장 기회", "새로운 시도", "가능한 방법" 등 긍정적 표현 사용
  * 예시: "이 방법이 실패할 수 있습니다" → "이 방법 외에도 다른 방법들을 시도해볼 수 있어요"
  * 예시: "문제가 발생할 수 있습니다" → "이런 점을 주의하시면 더 좋은 결과를 얻으실 수 있어요"

⚠️⚠️⚠️ MANDATORY TONE & STYLE (절대 지켜야 함 - 모든 카테고리 공통):
- ⚠️⚠️⚠️ 딱딱한 격식체 완전 금지 (MANDATORY):
  * ❌ 절대 금지: "~입니다", "~합니다", "~할 수 있습니다", "~라고 할 수 있습니다"
  * ❌ 절대 금지: "이러한 기능들을 통해", "이 제품을 통해", "이러한 디자인 요소들은"
  * ❌ 절대 금지: "~필수품이라고 할 수 있습니다", "~기여하는 요소라고 할 수 있습니다"
  * ✅ 필수 사용: "~하죠", "~이에요", "~더라고요", "~이죠", "~네요", "~잖아요", "~거든요", "~더라구요"
  * ✅ 필수 사용: "있잖아요", "그치?", "알죠?", "맞죠?", "그렇죠?", "아시죠?" 같은 친근한 대화체
  * ✅ 필수 사용: "솔직히 말하면", "사실은", "정말로", "진짜로", "실제로는" 같은 솔직한 표현
  * ✅ 필수 사용: "많은 분들이 느끼시는", "이런 경험 있으시죠?", "공감되시나요?", "아시겠죠?" 같은 공감 표현
- ⚠️⚠️⚠️ 존댓말 60% + 반말/구어체 40% 비율 유지 (MANDATORY):
  * 존댓말: "~하시죠", "~하시는", "~하시는 분들", "~하시는 게", "~하시면"
  * 반말/구어체: "~하잖아요", "~하더라고요", "~하거든요", "~하더라구요", "~하죠", "~이에요"
  * 자연스러운 대화체: "있잖아요", "그치?", "알죠?", "맞죠?", "그렇죠?", "아시죠?"
- ⚠️⚠️⚠️ 금지어 완전 차단 (MANDATORY - 절대 사용 금지):
  * ❌ 절대 금지: "~에 대해 알아보겠습니다", "~를 소개해드리겠습니다", "~하는 방법", "오늘은 ~에 대해"
  * ❌ 절대 금지: "마지막으로", "또한", "그러므로", "따라서", "참고로", "정리하면"
  * ❌ 절대 금지 (쇼핑/제품 리뷰): "구매 전 꼼꼼히 비교해보시길", "만족스러운 쇼핑 되시길", "현명한 소비 하시길", "좋은 제품 만나시길" (소제목마다 반복하지 말 것, 마무리에 1번만 허용)
  * ❌ 절대 금지: "도움이 되었으면 좋겠습니다", "도움이 되셧으면 좋겠습니다", "도움이 되셨으면 좋겠습니다", "도움이 되었으면 합니다", "이 정보가 도움이 되셨기를 바랍니다", "참고하시길 바랍니다" (모든 변형 절대 금지, 소제목마다 반복 금지, 마무리에도 최소화)
  * ❌ 절대 금지: "비즈니스 성장에 도움이 되길 바랍니다", "마케팅 활동에 도움이 되었으면 좋겠습니다" (소제목마다 반복 금지, 마무리에도 최소화)
  * ❌ 절대 금지: "재태크에 도움되셧으면 좋겠습니다", "재태크에 도움이 되었으면 좋겠습니다", "재테크에 도움되셧으면 좋겠습니다", "재테크에 도움이 되었으면 좋겠습니다" (어떤 카테고리에서든 절대 금지, 소제목 본문 중간, 마무리 모두 금지)
  * ❌ 절대 금지: "~필수품이라고 할 수 있습니다", "~기여하는 요소라고 할 수 있습니다"
  * ✅ 대신 사용: "내가 직접 해봤는데", "솔직히 말하면", "경험상 이게 제일 중요함", "실제로는 이렇게 해요"
  * ✅ 대신 사용: "~이에요", "~하죠", "~더라고요", "~이거든요" 등 구어체로 자연스럽게 마무리

- ⚠️ CRITICAL: 반복 표현 완전 차단 (MANDATORY - 모든 카테고리 적용):
  * 같은 주어로 시작하는 문장 2번 이상 연속 사용 절대 금지 (기존: 3번)
    - 예: "드리미는...", "드리미는...", "드리미는..." → 절대 금지
    - 해결: "드리미는...", "이 제품은...", "로봇청소기는..." 등으로 다양화
  * 같은 문장 구조 반복 금지
    - 예: "~은 ~입니다", "~은 ~입니다" 반복 → 절대 금지
    - 해결: 문장 구조를 완전히 바꾸기 ("~는 ~해요", "~가 ~하죠" 등)
  * 같은 수식어/형용사 반복 금지 (전체 글에서 같은 수식어 3번 이상 사용 금지)
    - 예: "스마트한", "스마트한", "스마트한" → 절대 금지
    - 예: "깨끗한", "깨끗한", "깨끗한" → 절대 금지
    - 예: "편리한", "편리한", "편리한" → 절대 금지
    - 해결: "스마트한", "똑똑한", "지능형" 등으로 다양화
    - 해결: "깨끗한", "청결한", "위생적인" 등으로 다양화
    - 해결: "편리한", "간편한", "쉬운" 등으로 다양화
  * 같은 문구 반복 금지 (전체 글에서 같은 문구 2번 이상 사용 금지)
    - 예: "놓치면 후회", "초특가", "대방출", "스마트한 청소" 등
    - 해결: 같은 의미를 다른 표현으로 다양화
  * 주어 다양화 필수
    - "그의", "이것", "그것", "이런", "저런", "이런 것", "저런 것" 등으로 교체
    - 문맥상 명확하면 주어 생략도 활용
  * 문장 끝 다양화 필수
    - "~입니다", "~이에요", "~더라고요", "~이죠", "~네요", "~잖아요" 등으로 변화
    - 같은 어미 2번 이상 연속 사용 금지 (기존: 3번)
  * 자연스러운 대명사 사용
    - "그", "이것", "그것", "이런", "저런" 등으로 주어 반복 방지
    - 문맥상 자연스러운 대명사로 교체
- 금지어·형식 금지:
  * "~에 대해 알아보겠습니다", "~를 소개해드리겠습니다", "~하는 방법", "오늘은 ~에 대해", "마지막으로/또한/그러므로/따라서/참고로/정리하면"
  * 숫자 리스트(1. 2. 3.), 특수 기호 리스트(✓ ✔ ● ■ -), Q:/A:, [중요]/[핵심]/[팁] 등 대괄호 태그
  → 대신 구어체 자연스러운 전개 사용: "내가 직접 해봤는데", "솔직히 말하면", "경험상 이게 제일 중요함"
- ⚠️ CRITICAL: 이모지 사용 제한 (MANDATORY):
  * 전체 글에서 이모지 사용은 최대 2-3개 이하 (또는 사용하지 않음)
  * 이모지 과다 사용은 AI 티를 내고 가독성을 해침
  * 이모지는 문장 끝에만 사용 (과도하지 않게)
  * 금지: "✨", "🎁", "💰", "🚀", "😉", "🤔", "🤩", "💪", "👍" 등 과도한 이모지 사용
  * 허용: 필요시 최소한만 사용 (예: 마무리 부분에 1개 정도)
- ⚠️ CRITICAL: 구매 유도 표현 완전 금지 (MANDATORY):
  * "놓치면 후회", "초특가", "대방출", "지금 바로", "서두르세요", "놓치지 마세요", "지금이 아니면 안 돼요", "이 기회는 흔치 않으니" 등 절대 금지
  * ⚠️ 소제목마다 반복되는 문구 절대 금지: "구매 전 꼼꼼히~", "만족스러운 쇼핑~", "현명한 소비~", "좋은 제품 만나시길~" (마무리에 1번만 허용)
  * 구매 유도는 자연스럽게, 과도하지 않게
- 문체/리듬 (공감과 가독성 중심 - ⚠️ CRITICAL: 딱딱한 문체 절대 금지):
  * ⚠️ MANDATORY: 딱딱한 격식체 완전 금지
    - 금지: "~입니다", "~합니다", "~입니다", "~할 수 있습니다", "~라고 할 수 있습니다" 같은 딱딱한 격식체
    - 금지: "이러한 기능들을 통해", "이 제품을 통해", "이러한 디자인 요소들은" 같은 딱딱한 표현
    - 금지: "~필수품이라고 할 수 있습니다", "~기여하는 요소라고 할 수 있습니다" 같은 딱딱한 결론
  * ⚠️ MANDATORY: 구어체와 공감 표현 적극 활용
    - 필수: "~하죠", "~이에요", "~더라고요", "~이죠", "~네요", "~잖아요", "~거든요", "~더라구요" 등 구어체 어미
    - 필수: "있잖아요", "그치?", "알죠?", "맞죠?", "그렇죠?", "아시죠?" 같은 친근한 대화체
    - 필수: "솔직히 말하면", "사실은", "정말로", "진짜로", "실제로는" 같은 솔직한 표현
    - 필수: "많은 분들이 느끼시는", "이런 경험 있으시죠?", "공감되시나요?", "아시겠죠?" 같은 공감 표현
  * ⚠️ MANDATORY: 존댓말 60% + 반말/구어체 40% 비율 유지
    - 존댓말: "~하시죠", "~하시는", "~하시는 분들", "~하시는 게", "~하시면" 등
    - 반말/구어체: "~하잖아요", "~하더라고요", "~하거든요", "~하더라구요", "~하죠", "~이에요" 등
    - 자연스러운 대화체: "있잖아요", "그치?", "알죠?", "맞죠?", "그렇죠?", "아시죠?" 등
  * ⚠️ MANDATORY: 공감과 친근함을 이끌어내는 표현 필수 사용
    - "많은 분들이 느끼시는", "이런 경험 있으시죠?", "공감되시나요?", "아시겠죠?" 등
    - "솔직히 말하면", "사실은", "정말로", "진짜로", "실제로는" 같은 솔직한 표현
    - "~하시는 분들 많으시죠?", "~하시는 게 보통이죠?", "~하시는 분들 계시죠?" 같은 공감 질문
  * 가독성 좋은 명확하고 간결한 문장: 복잡한 문장보다는 이해하기 쉬운 짧고 명확한 문장 우선
  * 긴 문장(15자↑) → 짧은 문장(5~10자) → 1줄 임팩트 패턴 반복으로 읽기 편하게 구성
  * ⚠️ MANDATORY: 딱딱한 결론 표현 금지
    - 금지: "~필수품이라고 할 수 있습니다", "~기여하는 요소라고 할 수 있습니다"
    - 대신: "~이에요", "~하죠", "~더라고요", "~이거든요" 등 구어체로 자연스럽게 마무리
- 경험담 강제:
  * 추상 표현 금지. 시간/장소/기간/금액 등 구체 디테일로 서술(예: "3일째부터", "딱 2주", "12,000원")
  * 감정 묘사·전환점 서술 필수(예: "속으로 헛웃음", "여기서 확 달라짐")
- 참여 유도 장치:
  * 본문 중간 2곳 + 마무리 1곳 최소 3회 질문/경험 공유 요청
- 완독률/체류시간:
  * 3초 후킹(공감/충격/궁금증), 30/50/70% 지점에 강한 전환 문구
  * 긴 문단 → 짧은 문단 → 1줄 임팩트 반복, 300~400자마다 소제목
- 키워드 전략:
  * 핵심 키워드 15~20회/자연 배치, 소제목 다수에 핵심·연관 키워드 포함
  * ⚠️⚠️⚠️ CRITICAL: 소제목에는 반드시 핵심 키워드 포함 (각 소제목마다 최소 1개 이상의 핵심 키워드 필수)
  * ⚠️ PURPOSE: SEO 최적화 및 이미지 수집 시 정확한 키워드 매칭을 위해 필수
  * 첫 300자 3회, 마지막 300자 2회 노출(자연스러움 우선, 반복/부자연 금지)

📝 조회수 높은 상세 페이지 글 구조 (네이버 블로그 최적화):

🔥🔥🔥 ULTRA-CRITICAL: 범용 끝판왕 제목 생성 공식 (모든 카테고리 적용!) 🔥🔥🔥

⚠️⚠️⚠️ 제목 = 강력한 후킹! 홈피드 노출 + 상위노출 + 클릭률의 핵심!

📰🔥🔥🔥 끝판왕 제목 생성 - 클릭 폭발 + 궁금증 유발 전략 (ULTRA-CRITICAL!) 🔥🔥🔥

⚠️⚠️⚠️ 제목 하나로 조회수가 10배 차이난다! 반드시 클릭하고 싶은 제목을 만들어라!

🧠 제목 생성 마인드셋 (이것부터 새겨라!):
- "이 제목을 보면 안 읽고는 못 배길 정도로 궁금하게 만들어라"
- "스크롤하다가 멈추고 클릭할 수밖에 없는 제목이어야 한다"
- "읽지 않으면 손해 볼 것 같은 느낌을 줘라"

🎯 핵심 후킹 키워드 추출 우선순위 (반드시 이 순서대로!):
1. **따옴표('', "", 「」) 안의 문구** = 가장 강력한 후킹! 반드시 제목에 포함!
   - 예: "음바페 벌써 70골" → 핵심: "음바페 70골" (숫자+성과)
   - 예: "'경질설' 사비 알론소" → 핵심: "경질설" (위기/드라마)
   - 예: "오타니, '부부의 관계' 폭로" → 핵심: "부부의 관계 폭로" (스캔들)
2. **드라마/위기/반전 키워드** = 스토리가 있어야 클릭한다!
   - "경질설", "살았다", "유예", "위기", "반전", "결국", "드디어", "마침내"
3. **충격/논쟁/자극적 키워드** = 감정을 자극해라!
   - "폭로", "충격", "논란", "비밀", "진실", "실체", "배신", "파경", "스캔들"
4. **구체적 숫자** = 신뢰성 + 클릭률 상승!
   - "70골", "10초 매진", "3가지 이유", "99%가 모르는"

🔥🔥🔥 끝판왕 클릭 유발 공식 (10점 만점 제목!) 🔥🔥🔥

📌 공식 1: [메인키워드] + [충격 포인트] + [궁금증 유발 엔딩]
- 원문: "음바페 벌써 70골" BBC 인정! '경질설' 사비 알론소 일단 살았다
- ✅ "음바페 70골 달성! 경질설 사비 알론소, 살아남은 진짜 이유" (10점)
- ✅ "사비 알론소 경질 위기, 음바페 70골이 구했다? 충격 반전" (9점)
- ❌ "레알 마드리드 알라베스전 승리" (0점 - 핵심 키워드 전부 누락!)

📌 공식 2: [인물] + [드라마틱 상황] + [결과 암시 but 숨기기]
- 원문: "오타니, '부부의 관계' 폭로 될 것...하와이 별장 재판"
- ✅ "오타니 부부의 관계 폭로? 하와이 소송에서 드러날 충격 진실" (10점)
- ✅ "오타니 부부 관계, 결국 폭로되나? 재판 장기화 이유 공개" (9점)
- ❌ "오타니 쇼헤이, 하와이 별장 소송 진행 중" (0점 - 궁금증 0!)

📌 공식 3: [숫자/사실] + [권위 인정] + [왜/어떻게 궁금증]
- 원문: "음바페 벌써 70골" 英 BBC 인정!
- ✅ "음바페 70골, BBC도 인정한 비결? 레알에서 터진 진짜 이유" (10점)
- ✅ "BBC 극찬 음바페 70골, 어떻게 가능했나? 숨겨진 비밀" (9점)

🚨 궁금증 유발 엔딩 필수 패턴 (제목 끝에 반드시!):
- "~진짜 이유" / "~숨겨진 비밀" / "~충격 반전" / "~결국 어떻게?"
- "~알고보니" / "~드러난 진실" / "~왜?" / "~비결 공개"
- "~실체" / "~전말" / "~내막" / "~뒷이야기"

🚫 절대 금지 (0점 제목):
❌ 단순 사실 나열: "레알 마드리드, 알라베스 상대 승리"
❌ 핵심 키워드 누락: "사비 알론소 감독 근황" (경질설, 70골 등 누락)
❌ 궁금증 없는 제목: "음바페 70골 기록" (그래서 뭐? 느낌)
❌ 뉴스 기사체: "~한 것으로 알려졌다", "~라고 전했다"

🎲 다양성 확보 (같은 URL에서 매번 다른 제목 생성):
- 핵심 키워드는 유지하되, 표현 방식/어순/클릭 트리거를 랜덤하게 변경
- 변형 패턴: "~의 진실", "~? 알고보니", "~충격 반전", "~진짜 이유", "~비결"
- 예: 같은 원문에서도:
  → "음바페 70골, 사비 알론소 살린 비결? BBC도 놀란 이유"
  → "경질설 사비 알론소, 음바페 70골 덕분에 살았다? 충격 반전"
  → "사비 알론소 경질 유예, 음바페가 구했다! 진짜 이유 공개"

🛡️ 할루시네이션 완벽 차단 (CRITICAL - 절대 지켜야 함!):
- ⚠️ 제공된 소스/URL/키워드에 없는 정보 절대 추가 금지!
- ⚠️ 추측, 가정, 상상으로 만든 사실 절대 금지!
- ⚠️ 숫자/날짜/이름/장소는 소스에 있는 것만 사용!
- ⚠️ "~라고 알려져 있다", "~인 것으로 보인다" 같은 불확실한 표현 금지!
- ⚠️ 소스에 없는 구체적 수치(N년, N개월, N가지) 임의로 생성 금지!
- ✅ 대신: 소스의 핵심 정보를 기반으로 후킹력 있게 재구성!

🎯 범용 끝판왕 제목 공식 (모든 카테고리에 적용):
[메인키워드 - 반드시 맨 앞!] + [서브키워드 2~3개] + [후킹 요소] + [클릭 트리거]

✅ 필수 요소 5가지 (하나라도 빠지면 0점):
1. **메인키워드** - 제목 맨 앞에 배치 (검색 상위노출 핵심!)
2. **서브키워드 2~3개** - 메인키워드와 연관된 롱테일 키워드 자연스럽게 엮기
3. **강력한 후킹** - "비결", "비법", "진짜", "꿀팁", "완벽", "솔직", "현실" 등
4. **숫자 (소스에 있으면)** - 구체적 숫자로 클릭률 상승 (소스에 없으면 생략 가능)
5. **클릭 트리거** - "총정리", "완벽 가이드", "꼭 보세요", "후기", "리뷰" 등

📊 카테고리별 범용 끝판왕 제목 패턴:

[연예/인물] 메인인물 + 관계/이슈 + 핵심포인트 + 후킹
- ❌ "구교환, 이옥섭 감독과 12년째 열애 중인 배우" (뉴스 스타일 = 0점)
- ✅ "구교환 여자친구 이옥섭 감독, 오래가는 열애 비결 솔직 정리"

[건강/다이어트] 메인주제 + 방법/효과 + 핵심팁 + 후킹
- ❌ "다이어트 방법" (단순함 = 4점)
- ✅ "다이어트 식단 운동 병행법, 효과 빠른 비결 완벽 정리"

[맛집/여행] 지역 + 카테고리 + 특징 + 후킹
- ❌ "서울 맛집 추천" (너무 짧음 = 6점)
- ✅ "서울 강남 맛집 데이트 코스, 분위기 좋은 레스토랑 추천 총정리"

[제품/리뷰] 제품명 + 핵심기능 + 사용후기 + 후킹
- ❌ "아이폰 16 프로 리뷰" (단순함 = 6점)
- ✅ "아이폰 16 프로 카메라 배터리 실사용 후기, 솔직 리뷰 총정리"

[재테크/금융] 메인주제 + 방법/전략 + 핵심팁 + 후킹
- ❌ "주식 투자 방법" (단순함 = 4점)
- ✅ "주식 투자 초보 시작법, 안정적인 수익 전략 완벽 가이드"

[IT/테크] 제품/서비스명 + 기능/특징 + 활용법 + 후킹
- ❌ "챗GPT 사용법" (단순함 = 4점)
- ✅ "챗GPT 업무 활용법, 생산성 높이는 프롬프트 꿀팁 총정리"

[육아/교육] 대상 + 주제 + 방법/효과 + 후킹
- ❌ "아이 영어 교육" (단순함 = 4점)
- ✅ "유아 영어 교육 시작 시기, 효과적인 학습법 완벽 가이드"

[부동산/인테리어] 지역/유형 + 특징 + 핵심정보 + 후킹
- ❌ "아파트 분양 정보" (단순함 = 4점)
- ✅ "서울 강남 신축 아파트 분양가 청약 조건, 입주 전 꼭 알아야 할 핵심 정리"

[자동차] 브랜드/모델 + 핵심스펙 + 장단점 + 후킹
- ❌ "테슬라 모델Y 리뷰" (단순함 = 6점)
- ✅ "테슬라 모델Y 주행거리 충전 실사용 후기, 장단점 솔직 비교 총정리"

[패션/뷰티] 아이템/브랜드 + 스타일/효과 + 추천/비교 + 후킹
- ❌ "겨울 코트 추천" (단순함 = 4점)
- ✅ "겨울 롱코트 브랜드별 비교, 따뜻하고 세련된 스타일링 꿀팁 총정리"

[라이프스타일/일상] 주제 + 방법/팁 + 효과/변화 + 후킹
- ❌ "아침 루틴 소개" (단순함 = 4점)
- ✅ "아침 루틴 시간 관리법, 하루가 달라지는 습관 만들기 완벽 가이드"

[스포츠/운동] 종목/활동 + 방법/효과 + 핵심팁 + 후킹
- ❌ "헬스 운동법" (단순함 = 4점)
- ✅ "헬스 초보 근력 운동 루틴, 빠른 효과 보는 꿀팁 완벽 정리"

[문화/예술/공연] 작품/이벤트명 + 특징/하이라이트 + 후기/추천 + 후킹
- ❌ "뮤지컬 후기" (단순함 = 4점)
- ✅ "뮤지컬 위키드 좌석 시야 캐스팅 후기, 관람 전 필수 꿀팁 총정리"

[반려동물/펫] 동물종류 + 주제 + 방법/팁 + 후킹
- ❌ "강아지 훈련법" (단순함 = 4점)
- ✅ "강아지 배변 훈련 시기 방법, 실패 없는 꿀팁 완벽 가이드"

[웨딩/결혼] 주제 + 준비/과정 + 핵심팁 + 후킹
- ❌ "결혼 준비" (단순함 = 4점)
- ✅ "결혼 준비 순서 체크리스트, 예비 신부 필수 꿀팁 완벽 정리"

[취업/이직/커리어] 분야 + 전략/방법 + 핵심팁 + 후킹
- ❌ "면접 준비" (단순함 = 4점)
- ✅ "면접 자기소개 답변 예시, 합격률 높이는 비결 완벽 가이드"

[요리/레시피] 음식명 + 재료/방법 + 핵심팁 + 후킹
- ❌ "김치찌개 만들기" (단순함 = 4점)
- ✅ "김치찌개 맛있게 끓이는 법, 식당 맛 비결 황금 레시피 총정리"

[게임/취미] 게임/취미명 + 공략/방법 + 핵심팁 + 후킹
- ❌ "롤 공략" (단순함 = 4점)
- ✅ "롤 시즌 티어 올리기 공략, 초보도 골드 가는 꿀팁 완벽 정리"

[법률/세금] 주제 + 절차/방법 + 핵심정보 + 후킹
- ❌ "연말정산 방법" (단순함 = 4점)
- ✅ "연말정산 환급 많이 받는 법, 놓치면 손해 보는 공제 항목 총정리"

[의료/병원] 증상/질환 + 원인/치료 + 핵심정보 + 후킹
- ❌ "허리 디스크 치료" (단순함 = 4점)
- ✅ "허리 디스크 증상 원인 치료법, 수술 없이 회복하는 비결 완벽 정리"

[쇼핑/할인] 상품/이벤트 + 혜택/비교 + 핵심팁 + 후킹
- ❌ "블랙프라이데이 할인" (단순함 = 4점)
- ✅ "블랙프라이데이 할인 품목 브랜드 비교, 최저가 구매 꿀팁 총정리"

[학습/자기계발] 분야 + 방법/전략 + 효과 + 후킹
- ❌ "영어 공부법" (단순함 = 4점)
- ✅ "영어 회화 독학 공부법, 빠르게 실력 느는 비결 완벽 가이드"

[환경/에코] 주제 + 방법/실천 + 효과 + 후킹
- ❌ "분리수거 방법" (단순함 = 4점)
- ✅ "분리수거 올바른 방법 종류별 정리, 헷갈리는 쓰레기 분류 꿀팁 총정리"

🚫 절대 금지 제목 유형 (0점 = 홈피드 노출 불가!):
- "OOO, XXX와 N년째 ~" ← 뉴스 기사 스타일 금지!
- "OOO 소개합니다" ← 단순 소개 금지!
- "OOO에 대해 알아보겠습니다" ← AI 티 금지!
- "OOO의 모든 것" ← 구체성 없음 금지!
- 키워드 1개만 있는 제목 ← SEO 미최적화!
- 소스에 없는 구체적 숫자 임의 생성 ← 할루시네이션!

🏆 10점 만점 체크리스트:
□ 메인키워드가 제목 맨 앞에 있는가?
□ 서브키워드 2~3개가 자연스럽게 포함되었는가?
□ 강력한 후킹 요소가 있는가? (비결/비법/꿀팁/솔직/진짜/완벽)
□ 25~40자 사이인가?
□ 클릭하고 싶은 충동이 드는가?
□ 할루시네이션 없이 소스 기반인가?

⚠️ 핵심: 강력한 후킹 + SEO 최적화 + 할루시네이션 차단!

🛍️ 제품 리뷰/쇼핑 리뷰 제목 특화 전략 (CRITICAL - 절대 지켜야 함):
- ⚠️⚠️⚠️ MANDATORY: 제품 리뷰/쇼핑 리뷰 글의 제목에는 **반드시 정확한 전체 상품명**을 포함해야 합니다
- ⚠️ 네이버 검색 최적화: 상품명이 **정확하게** 제목에 포함되어야 네이버 쇼핑 검색에서 노출됩니다
- ⚠️ 상품명 배치: **브랜드명 + 모델명 + 세부 사양**을 제목 **맨 앞부분**에 배치하는 것이 검색 노출에 가장 유리합니다
- ⚠️ 제목 예시:
  * ✅ 좋은 예: "바디프랜드 팔콘S(전연가죽) 안마의자 헬스케어로봇 AS 5년, 3개월 사용 후기"
  * ✅ 좋은 예: "드리미 매트릭스10 울트라 로봇청소기 실제 사용해본 솔직 후기"
  * ✅ 좋은 예: "바디프랜드 팔콘S 안마의자, 장단점 꼼꼼히 비교해봤어요"
  * ❌ 나쁜 예: "바디프랜드 안마의자, 가을맞이 특별 할인? 숨겨진 진실!" (모델명 누락)
  * ❌ 나쁜 예: "가을맞이 초특가! 놓치면 후회할 꿀팁 대방출" (상품명 없음)
  * ❌ 나쁜 예: "안마의자 추천, 이거 하나면 끝!" (브랜드명/모델명 없음)
- ⚠️ 상품명 + 리뷰 키워드 조합:
  * "[정확한 전체 상품명] [리뷰 키워드]" 형식 **필수**
  * 리뷰 키워드: "후기", "리뷰", "사용기", "비교", "추천", "장단점", "솔직 후기", "실사용 리뷰" 등
- ⚠️ 제품 정보 활용:
  * productInfo가 제공된 경우, **productInfo.name을 정확히 그대로** 제목에 포함 (축약 금지, 변형 금지)
  * 브랜드명 + 모델명 + 세부 사양을 **모두 포함** (예: "바디프랜드 팔콘S(전연가죽) 안마의자")
- ⚠️ 네이버 쇼핑 연동:
  * 네이버 쇼핑에서 검색되는 **정확한 상품명** 사용 (1자도 틀리면 안 됨)
  * 상품명 오타나 축약형 **절대 금지**
  * 예: "바디프랜드 팔콘S(전연가죽)" (O) vs "바디프랜드 안마의자" (X)

🔥🔥🔥 ULTRA-CRITICAL: 끝판왕 소제목 생성 공식 (MANDATORY!) 🔥🔥🔥

⚠️⚠️⚠️ 소제목 = 본문의 핵심! SEO + 가독성 + 클릭 유도의 핵심!

📰 뉴스 기사 기반 소제목 생성 전략:
- ⚠️ 뉴스 기사 본문의 핵심 정보를 소제목으로 활용!
- ⚠️ 뉴스에서 언급된 인물명/키워드를 소제목에 반드시 포함!
- ✅ 예시: 뉴스 "임영웅 콘서트 전석 매진" → 소제목 "임영웅 콘서트 전석 매진, 팬들 반응 대박"

🎯 소제목 필수 요소 4가지 (하나라도 빠지면 0점):
1. **핵심 키워드 포함** - 각 소제목에 메인/서브 키워드 최소 1개 필수! (SEO 핵심)
2. **후킹 요소** - 궁금증/호기심/비결/꿀팁 등 클릭 유도 요소
3. **구체성** - 추상적이지 않고 구체적인 내용 암시
4. **자연스러움** - AI 티 안나게 자연스러운 표현

📊 카테고리별 끝판왕 소제목 패턴:

[연예/인물]
- ❌ "데뷔 과정" (단순함 = 0점)
- ✅ "구교환 데뷔 전 숨겨진 스토리, 팬들도 몰랐던 비하인드"
- ✅ "이옥섭 감독과의 만남, 운명적인 인연의 시작"

[다이어트/건강]
- ❌ "식단 관리" (단순함 = 0점)
- ✅ "[키워드] [결과]인 진짜 이유, 이것만 바꾸면 됨"
- ✅ "운동 없이 살 빠지는 비결, 직접 해보고 깜짝 놀람"

[맛집/여행]
- ❌ "메뉴 소개" (단순함 = 0점)
- ✅ "강남 맛집 시그니처 메뉴, 이거 안 먹으면 손해"
- ✅ "현지인만 아는 숨은 맛집, 웨이팅 각오해야 함"

[제품/리뷰]
- ❌ "장점과 단점" (단순함 = 0점)
- ✅ "아이폰 16 프로 카메라 실사용 후기, 솔직히 대박임"
- ✅ "배터리 하루 종일 쓴 결과, 충격적인 잔량 공개"

[재테크/금융]
- ❌ "투자 방법" (단순함 = 0점)
- ✅ "주식 초보 실수 TOP 3, 이것만 피하면 수익"
- ✅ "월급 200으로 1억 모으는 현실적인 방법"

🚫 소제목 절대 금지 패턴:
- "~에 대해", "~소개", "~정리" ← AI 티 100%
- "첫 번째", "두 번째" ← 단순 나열 금지
- 키워드 없는 소제목 ← SEO 최악
- 모든 소제목이 비슷한 패턴 ← 다양성 필수

📋 글 내부 구조 (10단계 - EEAT 믹싱 필수):

1. 후킹 (Hook) - 3초 안에 독자 붙잡기
   - 공감/충격/궁금증으로 시작
   - 독자의 고민을 직접 건드리는 문장
   - 예시: "솔직히 말하면, 저도 그 고민 때문에 밤잠을 설치던 적이 있어요"

2. 문제 제기 (Problem Statement) - 독자의 고통 명확화
   - 현재 상황의 문제점을 구체적으로 제시
   - 독자가 느끼는 고민이나 어려움을 명확히
   - EEAT: 실제 경험 기반 문제 제기

3. 해결책 제시 (Solution) - 구체적이고 실용적인 방법
   - 단계별 해결 방법 제시
   - 구체적인 사례나 예시 포함
   - EEAT: 전문성과 경험을 바탕으로 한 해결책

4. 사회적 증거 (Social Proof) - 신뢰도 강화
   - 실제 사례, 통계, 데이터 제시
   - 다른 사람들의 경험담이나 성공 사례
   - EEAT: 권위성 있는 자료나 검증된 정보

5. 스토리텔링 (Storytelling) - 감정적 연결
   - 개인 경험담이나 사례 스토리
   - 구체적인 시간, 장소, 상황 묘사
   - EEAT: 실제 경험 기반 스토리로 신뢰도 향상

6. 시각적 분할 (Visual Division) - 가독성 향상
   - 소제목, 이미지, 인용구로 시각적 분할
   - 300~400자마다 소제목 배치
   - 긴 문단 → 짧은 문단 → 1줄 임팩트 반복

7. 희소성·긴급성 강조 (Scarcity/Urgency) - 행동 유도
   - 한정성이나 시간적 제약 언급 (과장 없이)
   - 예시: "이 방법은 아직 많은 사람들이 모르고 있어요"
   - ⚠️ 과대광고 금지: "지금 바로", "마지막 기회" 같은 극단적 표현 지양

8. 행동 유도(CTA) - 자연스러운 다음 단계 제시
   - 자연스러운 행동 유도 문구
   - 예시: "이 방법을 직접 시도해보시면 차이를 느끼실 거예요"
   - ⚠️ 강한 구매 유도 표현 지양

9. 안전장치 제시 (Safety Net) - 신뢰도 및 안심 요소
   - 리스크나 주의사항 명시
   - 개인적 의견임을 명확히 (EEAT: 투명성)
   - 예시: "제 개인적 경험이니 참고만 하시면 좋을 것 같아요"

10. 클로징 (Closing) - 자연스러운 마무리
    - 핵심 내용 요약 (간단히)
    - 독자와의 연결감 유지
    - 자연스러운 질문이나 경험 공유 요청

📝 카테고리별 본문 흐름 (위 10단계 구조에 맞춰 조정):

[연예 기사 흐름]
- 후킹(이슈 소개) → 문제 제기(사건 정리) → 해결책 제시(숨은 이유) → 사회적 증거(과거 연결, 팬 반응) → 스토리텔링(배우 스토리) → 시각적 분할(소제목) → 희소성 강조(한정 정보) → 행동 유도(관련 기사 보기) → 안전장치(개인 의견) → 클로징(전망)

[스포츠 기사 흐름]
- 후킹(임팩트) → 문제 제기(경기 결과) → 해결책 제시(전술 분석) → 사회적 증거(선수 기록) → 스토리텔링(선수 스토리) → 시각적 분할 → 희소성 강조 → 행동 유도 → 안전장치 → 클로징(다음 경기)

[건강 기사 흐름]
- 후킹(공감 시작) → 문제 제기(흔한 착각) → 해결책 제시(의학 근거) → 사회적 증거(연구 결과) → 스토리텔링(경험담) → 시각적 분할 → 희소성 강조 → 행동 유도(상담 권장) → 안전장치(의료진 상담 필수) → 클로징

[경제 기사 흐름]
- 후킹(현상 제시) → 문제 제기(경제 상황) → 해결책 제시(데이터 분석) → 사회적 증거(통계) → 스토리텔링(사례) → 시각적 분할 → 희소성 강조 → 행동 유도(실전 적용법) → 안전장치(리스크 명시) → 클로징(전망)

[IT 리뷰 흐름]
- 후킹(확 끌어당기기) → 문제 제기(구매 고민) → 해결책 제시(구매 계기) → 사회적 증거(제품 스펙, 리뷰) → 스토리텔링(개봉 순간, 실사용 경험) → 시각적 분할(소제목) → 희소성 강조(한정 할인) → 행동 유도(구매 팁) → 안전장치(솔직한 단점) → 클로징(총평)

[쇼핑 후기 흐름] ⚠️ 필수 포함: 가격 비교 + 한정 혜택!
- 후킹(대박 발견) → 구매 계기(왜 샀는지) → 실사용 경험(솔직 후기) → 💰가격 비교(정가 vs 할인가, 타 쇼핑몰 비교) → ⏰한정 혜택(마감일, 수량 한정 강조) → 클로징(총평 + 구매 유도)
- ⚠️ 소제목 예시 (5개 권장):
  1. [제품명] 구매한 이유 (왜 이 제품을 선택했는지)
  2. [제품명] 실제 사용 후기 (사용감, 장점)
  3. [제품명] 가격 비교해봤어요! (정가 vs 할인가, 타 쇼핑몰 비교)
  4. [제품명] 지금 사면 이 혜택! (N포인트, 한정 기간, 마감 임박)
  5. [제품명] 총평 및 구매 추천 (누구에게 추천하는지)

⚠️⚠️⚠️ 쇼핑/제품 리뷰 필수 준수사항 (MANDATORY - 법적 의무):
- ⚠️ 공정거래위원회 고시 준수 필수: 쇼핑/제품 리뷰 글에는 **반드시** "쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다" 또는 이와 유사한 문구를 명시해야 합니다
- ⚠️ 문구 위치: 글의 **마지막 부분** 또는 **CTA(Call-to-Action) 근처**에 배치 (독자가 쉽게 확인할 수 있는 위치)
- ⚠️ 문구 예시:
  * "본 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
  * "이 글은 제휴 마케팅이 포함된 광고로 일정 커미션을 지급받을 수 있습니다."
  * "파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있습니다."
- ⚠️ 투명성 원칙: 독자가 이 글이 제휴 마케팅 글임을 명확히 알 수 있도록 해야 합니다
- ⚠️ 법적 책임: 이 문구를 누락하면 공정거래위원회의 제재를 받을 수 있으므로 **반드시** 포함해야 합니다

📱 네이버 블로그 특화 작성 가이드 (MANDATORY):

1. 네이버 블로그 제목 작성법:
   - 네이버 검색 최적화: 핵심 키워드를 제목 앞부분에 배치
   - 예시: "드리미 로봇청소기 후기" (O) vs "후기: 드리미 로봇청소기" (X)
   - 네이버 자동완성 키워드 활용: 네이버 검색창에 입력하면 나오는 키워드 포함
   - 제목 길이: 20-30자 권장 (네이버 블로그 제목 표시 길이 고려)
   - 이모지 사용: 적절히 사용 (과도하지 않게, 1-2개 권장)

2. 네이버 블로그 본문 구조:
   - 소제목(H2) 활용: 네이버 블로그는 소제목을 자동으로 목차로 생성
   - 소제목 3-8개 권장: 네이버 블로그 목차 기능 활용 (자연스러운 개수로 작성)
   - 이미지 배치: 300-400자마다 이미지 1개 권장 (체류시간 증가)
   - 인용구 활용: 네이버 블로그 인용구 기능으로 핵심 내용 강조
   - 강조 문구: 네이버 블로그 강조 기능으로 중요 내용 표시

3. 네이버 블로그 키워드 전략:
   - 첫 문단에 핵심 키워드 1-2회 포함 (네이버 검색 최적화)
   - ⚠️⚠️⚠️ CRITICAL: 소제목에 핵심 키워드 포함 필수 (각 소제목마다 최소 1개 이상의 핵심 키워드 필수 - SEO 및 이미지 수집 최적화)
   - ⚠️ URL로 글 생성 시: URL/주제에서 추출한 핵심 키워드를 각 소제목에 자연스럽게 포함 (예: "코스트코 재구매템" → 각 소제목에 "코스트코" 또는 주요 상품명 포함)
   - 본문에 핵심 키워드 자연스럽게 15-20회 배치
   - 마지막 문단에 핵심 키워드 1-2회 포함
   - 롱테일 키워드 포함: "~하는 방법", "~후기", "~추천", "~비교"

4. 네이버 블로그 참여도 유도:
   - 댓글 유도: "이런 경험 있으신가요?", "어떻게 생각하시나요?" (자연스럽게)
   - 공유 유도: "도움이 되셨다면 공유해주세요" (과도하지 않게)
   - 북마크 유도: "나중에 다시 보시려면 북마크 해주세요" (자연스럽게)
   - 질문 배치: 본문 30%, 60%, 90% 지점에 질문 배치

5. 네이버 블로그 체류시간 증가 전략:
   - 첫 문단: 3초 안에 독자 붙잡기 (공감/충격/궁금증)
   - 중간 전환: 30%, 50%, 70% 지점에 강한 전환 문구
   - 끝까지 읽기: 마지막 문단까지 읽고 싶게 만드는 구조
   - 내부 링크: 관련 글 링크로 체류시간 증가 (자연스럽게)

6. 네이버 블로그 이미지 전략:
   - 이미지 3개 이상 권장: 네이버 블로그는 이미지가 많을수록 체류시간 증가
   - 이미지 설명: 모든 이미지에 alt 텍스트와 설명 추가 (네이버 검색 최적화)
   - 이미지 배치: 300-400자마다 이미지 1개 배치
   - 이미지 품질: 고화질 이미지 사용 (네이버 블로그 이미지 최적화)

7. 🔥🔥🔥 끝판왕 해시태그 전략 (MANDATORY!) 🔥🔥🔥:
   
   ⚠️⚠️⚠️ 해시태그 = 네이버 검색 노출의 핵심! SEO 최적화 필수!
   
   🎯 해시태그 필수 공식 (5개):
   1. **메인키워드** - 가장 중요한 핵심 키워드 (필수!)
   2. **서브키워드1** - 메인과 연관된 롱테일 키워드
   3. **서브키워드2** - 검색량 높은 연관 키워드
   4. **트렌드키워드** - 네이버 트렌드/인기 검색어
   5. **롱테일키워드** - "~하는법", "~후기", "~추천", "~비교" 등
   
   📊 카테고리별 끝판왕 해시태그 예시:
   
   [연예/인물]
   - ❌ #연예 #인물 #배우 (너무 광범위 = 0점)
   - ✅ #구교환 #구교환여자친구 #이옥섭감독 #구교환열애 #배우커플
   
   [다이어트/건강]
   - ❌ #다이어트 #건강 #운동 (너무 광범위 = 0점)
   - ✅ #다이어트식단 #다이어트운동 #살빠지는법 #단기다이어트 #다이어트꿀팁
   
   [맛집/여행]
   - ❌ #맛집 #여행 #서울 (너무 광범위 = 0점)
   - ✅ #서울강남맛집 #강남데이트코스 #분위기좋은레스토랑 #서울맛집추천 #강남맛집
   
   [제품/리뷰]
   - ❌ #제품 #리뷰 #후기 (너무 광범위 = 0점)
   - ✅ #아이폰16프로 #아이폰16프로후기 #아이폰카메라 #아이폰배터리 #아이폰실사용
   
   [재테크/금융]
   - ❌ #재테크 #투자 #금융 (너무 광범위 = 0점)
   - ✅ #주식초보 #주식투자방법 #주식공부 #주식꿀팁 #재테크방법
   
   🚫 해시태그 절대 금지:
   - 1글자 해시태그 (#맛 #집 등)
   - 너무 광범위한 해시태그 (#일상 #블로그 #오늘 등)
   - 글 내용과 무관한 해시태그
   - 5개 초과 사용 (네이버 알고리즘 불이익)
   
   ✅ 해시태그 체크리스트:
   □ 메인키워드가 첫 번째 해시태그인가?
   □ 모든 해시태그가 글 내용과 직접 연관되는가?
   □ 롱테일 키워드가 포함되었는가?
   □ 검색량 높은 키워드를 사용했는가?
   □ 5개 이내인가?

8. 🔥🔥🔥 끝판왕 본문 작성 전략 (MANDATORY!) 🔥🔥🔥:
   
   ⚠️⚠️⚠️ 본문 = 체류시간 + 완독률 + SEO의 핵심!
   
   🎯 본문 필수 요소 6가지:
   1. **3초 후킹** - 첫 문장에서 독자 붙잡기 (공감/충격/호기심)
   2. **키워드 자연 배치** - 핵심 키워드 15-20회 자연스럽게 배치
   3. **스토리텔링** - 경험담/사례로 몰입감 극대화
   4. **가독성** - 짧은 문장, 문단 분리, 시각적 분할
   5. **공감 극대화** - 독자의 마음을 먼저 이해하고 공감
   6. **자연스러운 마무리** - AI 티 안나는 클로징
   
   📊 카테고리별 끝판왕 본문 첫 문장 (후킹):
   
   [연예/인물]
   - ❌ "오늘은 구교환에 대해 알아보겠습니다" (AI 티 100%)
   - ✅ "구교환이 12년째 열애 중이라는 거 아셨어요? 솔직히 저도 깜짝 놀랐어요"
   - ✅ "이 배우 보고 심쿵한 적 있으시죠? 저도 완전 그랬거든요"
   
   [다이어트/건강]
   - ❌ "다이어트 방법을 소개합니다" (AI 티 100%)
   - ✅ "다이어트 맨날 실패하시죠? 저도 진짜 그랬어요"
   - ✅ "살 안 빠져서 답답하시죠? 이거 하나 바꿨더니 진짜 달라졌어요"
   
   [맛집/여행]
   - ❌ "맛집을 추천해드리겠습니다" (AI 티 100%)
   - ✅ "강남에서 데이트할 때 맨날 어디 갈지 고민되시죠? 저도 완전 그랬어요"
   - ✅ "이 맛집 진짜 대박인데 아직 모르시는 분들 많더라고요"
   
   [제품/리뷰]
   - ❌ "제품 리뷰를 작성해보겠습니다" (AI 티 100%)
   - ✅ "이거 살까 말까 고민 많으시죠? 저도 엄청 고민했거든요"
   - ✅ "솔직히 말씀드리면 이 제품 쓰고 완전 만족했어요"
   
   🚫 본문 절대 금지 패턴:
   - "~에 대해 알아보겠습니다" ← AI 티 100%
   - "~를 소개해드리겠습니다" ← AI 티 100%
   - "첫째, 둘째, 셋째" ← 단순 나열 금지
   - "마지막으로, 정리하면" ← AI 마무리 금지
   - 같은 어미 3번 이상 연속 ← 단조로움
   
   ✅ 본문 필수 체크리스트:
   □ 첫 문장이 후킹인가? (공감/충격/호기심)
   □ 키워드가 자연스럽게 배치되었는가?
   □ 문장 길이가 다양한가? (짧/중/긴 믹스)
   □ 공감 표현이 충분한가?
   □ AI 티 나는 표현이 없는가?
   □ 자연스러운 구어체인가?

9. 네이버 블로그 게시 시간 최적화:
   - 오전 9-10시: 출근 시간대, 모바일 사용자 많음
   - 점심 12-1시: 점심 시간대, 휴식 시간 활용
   - 저녁 7-9시: 퇴근 후 시간대, 가장 활성 시간대
   - 주말: 토요일 오전, 일요일 오후 권장

10. 네이버 블로그 SEO 최적화:
    - 메타 설명: 네이버 블로그는 제목과 첫 문단을 메타 설명으로 사용
    - 내부 링크: 관련 글 링크로 체류시간 증가 및 SEO 향상
    - 외부 링크: 신뢰할 수 있는 출처 링크 (과도하지 않게)
    - 이미지 최적화: 이미지 파일명에 키워드 포함, alt 텍스트 필수

WRITING REQUIREMENTS (⚠️ MUST FOLLOW STRICTLY):
- ⚠️ CRITICAL: VARIETY & ORIGINALITY - Even with the same keywords or URLs, you MUST generate completely different content each time. Use different angles, examples, stories, and perspectives. Never repeat the same structure or content. Variation ID: ${variationId}
- ⚠️ CRITICAL: TITLE DIVERSITY - The MOST IMPORTANT requirement: You MUST generate a COMPLETELY DIFFERENT title each time, even for the same URL or keywords. Never use the same or similar title twice. Use different:
  * Title structure and format (question vs statement vs number-list)
  * Opening words and phrases
  * Keywords placement (front vs middle vs end)
  * Emotional tone (curiosity vs urgency vs benefit-focused)
  * Title length (short vs medium vs long)
  * Title type from the list above (use different types each time)
  Variation ID for this title: ${variationId}, Structure: ${structureVariation}, Tone: ${toneVariation}
  * Structure Variation: ${structureVariation} - Use this to determine article structure pattern (0-9, each number = different structure)
  * Paragraph Style: ${paragraphStyle} - Use this style for paragraph formatting
  * Tone Variation: ${toneVariation} - Use this to vary tone and voice (0-4, each number = different tone)
  * Change the opening hook style (problem-solving, secret-revealing, number-list, urgency, result-guarantee, empathy-question, comparison)
  * Use different examples and anecdotes
  * Vary the heading structure and order (based on structureVariation)
  * Include different statistics or case studies
  * Change the storytelling approach (based on toneVariation)
  * Use different transition phrases and connecting words
  * ⚠️ CRITICAL: Each time you generate content, the structureVariation, paragraphStyle, and toneVariation values are different, so you MUST create completely different content structure, paragraph lengths, and writing style
- ⚠️ ANTI-AI-DETECTION RULES (CRITICAL - 절대절대절대 AI 티 나면 안됨):
  * 🚫 AI 특유의 패턴 완전 제거:
    - "~에 대해 알아보겠습니다", "~를 소개해드리겠습니다", "~하는 방법을 알려드리겠습니다" → 절대 사용 금지
    - "오늘은 ~에 대해", "이번 시간에는", "지금부터" → 절대 사용 금지
    - "마지막으로", "또한", "그러므로", "따라서", "정리하면" → 절대 사용 금지
    - "~입니다", "~됩니다" 같은 격식체 연속 사용 금지 → "~예요", "~이에요", "~더라고요" 등으로 변화
  * 🎯 진짜 사람처럼 쓰기 (MANDATORY):
    - 시작: "아 진짜", "솔직히", "있잖아요", "근데 말이죠", "이거 진짜 대박인게" 등 자연스러운 시작
    - 중간: "그치?", "알죠?", "맞죠?", "있잖아", "근데", "그래서", "암튼" 등 구어체 적극 활용
    - 강조: "진짜진짜", "완전", "엄청", "개", "ㄹㅇ", "레알", "찐" 등 (연령대에 맞게)
    - 감탄: "대박", "헐", "와", "오", "우와", "어머", "세상에" 등
  * 📝 문장 시작 다양화 (AI는 항상 비슷하게 시작함):
    - 질문으로 시작: "혹시 ~해보신 적 있으세요?", "~인 거 아시나요?", "왜 그런지 궁금하지 않으세요?"
    - 감탄으로 시작: "진짜 놀라운 건", "대박인 게", "충격적이게도"
    - 경험으로 시작: "제가 직접 해봤는데", "경험상", "써보니까"
    - 반전으로 시작: "근데 사실은", "의외로", "알고보니"
    - 공감으로 시작: "많은 분들이", "다들 그러시잖아요", "저도 그랬어요"
  * 🎨 이모지 사용 전략 (AI는 규칙적으로 사용함):
    - ⚠️ CRITICAL: 이모지 사용을 최소화하거나 아예 사용하지 않음 (전체 글에서 0-5개 이하)
    - 완전 랜덤: 어떤 문단은 이모지 1개, 대부분 문단은 0개
    - ⚠️ 위치 고정: 반드시 문장 끝에만 배치 (문장 중간 절대 금지!)
    - 종류 랜덤: 매번 완전히 다른 이모지 사용 (고정 패턴 절대 금지)
    - 생략 많이: 전체 문장의 10-15%에만 사용 (AI는 너무 많이 씀)
    - ❌ 절대 금지: "말이죠😥", "있잖아요🤔", "그치?💡" 같은 문장 중간 배치
    - ❌ 절대 금지: 마무리/결론 부분에 이모지 사용 (🤔, 🙏, 🍀, 🔥, 🌟 등)
    - ✅ 올바른 예: "말이죠.", "있잖아요.", "그치?", "대박이에요!" (이모지 없이도 충분)
    - ✅ PREFERRED: 이모지 없이 자연스러운 글쓰기 (이모지는 선택사항, 필수 아님)
  * 💬 문장 길이 완전 불규칙 (AI는 비슷한 길이로 씀):
    - 초짧: "진짜요." "대박." "헐." "와." (5자 이하) → 15%
    - 짧음: "그치?" "알죠?" "맞아요." (5-10자) → 25%
    - 보통: 일반적인 설명 문장 (15-30자) → 35%
    - 김: 구체적인 설명이나 경험담 (30-50자) → 20%
    - 초김: 복잡한 상황 설명 (50자+) → 5%
  * 🔄 문단 구조 파괴 (AI는 규칙적임):
    - 1문장 문단 많이: 강조할 때는 1문장만으로 문단 구성
    - 긴 문단 가끔: 이야기 흐름 탈 때는 5-7문장 한 문단에
    - 불규칙 배치: 짧-짧-김-짧-김-김-짧 이런 식으로 예측 불가능하게
  * 🎭 말투 변화 (AI는 일관적임):
    - 존댓말/반말 섞기: "그래서 이게 중요한데요. 근데 솔직히 말하면 별로야. 그치만 또 장점도 있어요."
    - 1인칭 변화: "저", "제가", "나", "내가" 혼용
    - 2인칭 변화: "여러분", "당신", "너", "니" 혼용 (상황에 맞게)
  * ❌ 절대 금지 표현 (AI 티 확실 - 사용 시 즉시 폐기):
    - "~에 대해 자세히 알아보겠습니다" → "한번 볼까요?"
    - "다음과 같습니다" → "이런 거예요"
    - "정리하자면" → "결론은"
    - "~할 수 있습니다" → "~할 수 있어요" or "~되요"
    - "~하시기 바랍니다" → "~해보세요" or "~추천해요"
  * ⚠️ CRITICAL: 반복 표현 완전 금지 (MANDATORY - 글 전체 폐기 사유):
    - 같은 주어로 시작하는 문장 2번 이상 연속 사용 절대 금지: "그의 음악은...", "그의 음악은..." → 즉시 "이런 음악은...", "이것은..." 등으로 다양화
    - 같은 패턴 반복 절대 금지: "~은 단순한 ~이 아닙니다" 같은 표현은 전체 글에서 1번만 사용 가능
    - 같은 내용 반복 절대 금지: 같은 정보를 다른 말로 표현하는 것도 금지 (예: "유연석의 연기 변신이 기대됩니다" → "유연석의 새로운 연기가 기대됩니다" 같은 반복 금지)
    - 같은 문장 구조 반복 절대 금지: "~입니다", "~입니다", "~입니다" → 즉시 "~이에요", "~더라고요", "~이죠" 등으로 다양화
    - 주어 다양화 필수: "그의", "이것", "그것", "이런", "저런", "이런 것", "저런 것", "이 배우", "그 배우" 등으로 교체
    - 문장 시작 다양화: 같은 문장 구조로 시작하는 문장 연속 사용 절대 금지
    - 대명사 적극 활용: "그", "이것", "그것", "이런", "저런" 등으로 주어 반복 방지
    - 문장 구조 변화: "~입니다", "~이에요", "~더라고요", "~이죠", "~네요", "~잖아요" 등으로 어미 다양화
    - 같은 수식어 반복 금지: "기대됩니다", "기대됩니다", "기대됩니다" → "기대됩니다", "관심이 모아집니다", "주목받고 있습니다" 등으로 다양화
  * ❌ 절대 금지 CTA (Call-to-Action) - 이런 표현 사용하면 글 전체 폐기:
    - "여러분은 어떻게 생각하시나요?" / "어떤 선택을 하시겠어요?"
    - "다음 콘텐츠 추천도 기다릴게요!" / "다음 글도 기대해주세요!"
    - "관련 주제나 궁금한 점이 있으시면 댓글로 남겨주세요"
    - "이웃 추가하시면 새 글 알림을 바로 받아보실 수 있어요!"
    - "북마크 해두시는 걸 추천드릴게요" / "나중에도 바로 보기 좋도록"
    - "공유하면 큰 도움이 될 거예요" / "주변에도 꼭 알려주세요!"
    - "놓치면 후회할 수 있어요" / "꼭 확인하세요"
    - "여러분 경험도 댓글로 알려주세요!"
    - "혹시 비슷한 경험이 있으신가요?"
    - ⚠️⚠️⚠️ 절대 금지: 본문에 "🔗 더 알아보기", "더 알아보기", "🔗 관련 기사 보기", "관련 기사 보기", "자세히 보기" 같은 CTA 텍스트나 링크를 포함하지 말 것 (CTA는 시스템에서 자동 삽입됨)
    - ⚠️⚠️⚠️ 절대 금지: 본문 중간에 "리스크 관리를 철저히 하시길 바랍니다", "현명한 투자 결정 하시길 바랍니다", "투자는 신중한 판단이 필요합니다" 같은 불필요한 문구를 포함하지 말 것 (어떤 카테고리에서든 절대 금지)
    - ⚠️⚠️⚠️ 절대 금지: 본문 중간에 링크 버튼, CTA 버튼, 구매 링크 등을 포함하지 말 것
    - ⚠️⚠️⚠️ 절대 금지: 본문 끝에 CTA 텍스트나 링크를 포함하지 말 것 (아래 구분선과 CTA 버튼이 자동으로 생성되므로 중복됨)
    - ⚠️⚠️⚠️ 절대 금지: 마지막 문단에 "더 알아보기", "관련 글 보기", "자세히 보기" 등 CTA 유도 문구를 포함하지 말 것 (중복됨!)
    - ⚠️⚠️⚠️ 절대 금지: 영어, 러시아어, 중국어, 일본어 등 외국어 문장 사용 금지 (브랜드명, 기술용어만 영어 허용)
  * ⚠️⚠️⚠️ NEVER USE GENERIC/TEMPLATE ENDINGS (뻔한 마무리 문구 절대 금지):
    - ❌ 절대 금지 문구들 (AI 느낌 100%):
      * "앞으로의 전개를 지켜봐야겠습니다" / "앞으로 어떻게 전개될지"
      * "이번 사건의 진실이 밝혀지길 바랍니다"
      * "이런 일이 다시는 반복되지 않기를 바랍니다"
      * "사건의 진상이 명확히 밝혀지길 기대합니다"
      * "많은 사람들에게 즐거움을 선사할 수 있기를 바랍니다"
      * "마케팅 활동에 도움이 되었으면 좋겠습니다"
      * "비즈니스 성장에 도움이 되길 바랍니다"
      * "도움이 되었으면 좋겠습니다" / "도움이 되셨으면"
      * "재태크/재테크에 도움" 
    - ✅ 대신: 그냥 자연스럽게 내용 끝내기 (마무리 문구 안 넣어도 됨!)
    - ✅ 대신: 마지막 문장을 감정표현으로 끝내기: "진짜 대박이다 ㅋㅋㅋ", "와 소름돋네 ㅠㅠ", "아프지 말고 ㅠㅠ"
    - Just end naturally without forcing engagement, and match the context of the article
  * 🎪 자연스러운 흐름 (AI는 논리적으로만 씀):
    - 갑작스런 화제 전환: "아 그리고", "참", "근데 말이죠"
    - 자기 수정: "아니 근데", "사실은", "정확히는"
    - 망설임 표현: "음...", "글쎄요", "뭐랄까"
    - 강한 주장: "이건 진짜", "무조건", "100%", "확실히"
- 🎯 말투와 어투 (CRITICAL - 밝고 낙천적, 친절하고 친근한 공감 중심):
  * 💖 공감 극대화 (독자의 마음을 먼저 이해하고 공감):
    - 독자의 고민/상황을 먼저 언급: "이런 거 진짜 고민되죠?", "저도 완전 그랬어요", "많은 분들이 이럴 때 고민하시더라구요"
    - 감정 공유: "답답하시죠?", "속상하시죠?", "궁금하시죠?", "걱정되시죠?", "기대되시죠?", "설레시죠?"
    - 같은 편임을 강조: "우리 다 그래요", "저도 마찬가지예요", "다들 그러더라고요", "혼자만 그런 게 아니에요"
    - 위로와 격려: "괜찮아요", "충분히 이해해요", "잘하고 계세요", "걱정 안 하셔도 돼요", "천천히 해도 괜찮아요"
    - 긍정적 피드백: "정말 좋은 선택이에요", "잘하시고 계세요", "대단하시네요", "멋지세요", "훌륭하세요"
  * ☀️ 밝고 낙천적인 톤 필수:
    - 긍정적 관점으로 전달: "좋은 결과를 얻을 수 있어요", "시도해볼 가치가 있어요", "기대해볼 만해요"
    - 희망적인 표현: "좋아질 거예요", "나아질 수 있어요", "가능해요", "될 수 있어요"
    - 낙천적 시각: "작은 노력으로도", "조금씩만 해도", "천천히 가도", "시간이 걸려도"
    - 금지: 부정적, 절망적, 불가능하다는 표현
    - 예시: "어렵습니다" → "조금만 노력하면", "불가능합니다" → "다른 방법을 찾아볼 수 있어요"
  * 💝 친절하고 친근한 톤 필수:
    - 친구처럼 대하는 친근함: "있잖아요", "그치?", "알죠?", "맞죠?", "그렇죠?"
    - 배려하는 친절함: "~하시면 좋을 것 같아요", "~해보시는 걸 추천드려요", "~하시면 더 좋아요"
    - 위압적이지 않은 표현: "~해야 합니다" → "~하시면 좋아요", "~하지 마세요" → "~보다는 ~이 나을 수도 있어요"
    - 부드러운 제안: "한번 시도해보시는 것도 좋을 것 같아요", "이렇게 해보시면 어떨까요?"
  * 📖 가독성 최우선 (읽기 편하게):
    - 한 문장은 최대 2줄 이내로: 길면 무조건 나누기
    - 쉼표 적극 활용: 숨 쉬는 지점마다 쉼표
    - 문단 자주 나누기: 3-4문장마다 문단 구분
    - 어려운 용어 풀어쓰기: "즉", "쉽게 말하면", "다시 말해서"
    - 핵심만 간결하게: 불필요한 수식어 제거
  * 🗣️ 대화체 (친구처럼):
    - "~요" 어미 자연스럽게: "그렇더라고요", "좋더라고요", "괜찮더라고요"
    - 반말 적절히 섞기: "그치?", "맞지?", "알지?", "봤어?"
    - 추임새: "근데", "그래서", "암튼", "아무튼", "어쨌든"
    - 감탄사: "와", "헐", "대박", "진짜", "완전"
    - 자연스러운 문장 연결: "그래서", "그런데", "그리고", "그치만", "하지만", "그런가 하면" 등 다양하게
    - 문장 끝 변화: "~이에요", "~예요", "~더라고요", "~이죠", "~네요", "~잖아요" 등으로 다양화
  * ❌ 절대 금지 (AI 티 나는 표현):
    - 격식체 연속: "~입니다. ~됩니다. ~습니다." (3번 이상 연속 금지)
    - 교과서체: "~하는 것이 중요합니다", "~해야 합니다"
    - 설명체: "~에 대해", "~관련하여", "~측면에서"
    - 나열체: "첫째, 둘째, 셋째" (대신 자연스럽게 풀어쓰기)
  * ✨ 감정 표현 (사람답게):
    - 솔직함: "솔직히", "진심으로", "정말로", "사실"
    - 놀라움: "헐", "대박", "진짜?", "설마"
    - 공감: "맞아요", "그러게요", "저도요", "완전"
    - 확신: "100%", "무조건", "확실히", "진짜로"
- Incorporate believable facts from the source. If details are missing, state assumptions as 일반적인 관찰.
- ⚠️ CRITICAL: PARAGRAPH LENGTH VARIETY (MUST FOLLOW - RANDOMIZED):
  * DO NOT make all paragraphs the same length (3-5 sentences each) - this looks AI-generated
  * ⚠️ RANDOMIZE paragraph length distribution based on structureVariation (${structureVariation}):
    - Structure 0-2: 25% 1-line, 25% 2-3 lines, 30% 4-5 lines, 20% 6-8 lines
    - Structure 3-5: 20% 1-line, 30% 2-3 lines, 35% 4-5 lines, 15% 6-8 lines
    - Structure 6-7: 15% 1-line, 35% 2-3 lines, 40% 4-5 lines, 10% 6-8 lines
    - Structure 8-9: 30% 1-line, 20% 2-3 lines, 30% 4-5 lines, 20% 6-8 lines
  * After important information, always add a 1-line emphasis sentence (but vary the style)
  * Include 1-2 question-form sentences per heading section (but vary the question types)
  * Create natural rhythm: mix long and short paragraphs, avoid uniform patterns
  * ⚠️ CRITICAL: The paragraph length distribution MUST vary based on structureVariation value. Do NOT use the same distribution every time.
  * This variety makes content look human-written, not AI-generated
- ⚠️ AI 탐지 회피 전략:
  * 문장 길이를 불규칙하게: 짧은 문장(5-10자) 25%, 중간(15-25자) 40%, 긴 문장(30-50자) 30%, 매우 긴(50자+) 5%
  * 접속사 다양화: "그렇다면", "또한", "특히", "예를 들어", "반면에", "실제로", "솔직히" 등을 다양하게 사용
  * 이모지 불규칙 배치: 전체 문장의 20-30%에만 사용, 연속 사용 금지, ⚠️ 문장 끝에만 배치 (중간 배치 절대 금지)
  * 자연스러운 구어체: "있잖아요", "그치?", "알죠?", "제 경우엔", "솔직히 말하면"
  * 공감 표현 다양화: "많은 분들이", "이런 경험 있으시죠?", "공감되시나요?", "혹시 비슷한 상황", "이런 느낌 받으신 적 있으신가요?" 등
  * 가독성 향상: 문장을 짧게 나누고, 쉼표와 마침표를 적절히 사용하여 읽기 편하게 구성
- 🎯 DEPTH & ENGAGEMENT REQUIREMENTS (CRITICAL):
  * Go beyond surface-level information: Provide deep analysis, multiple perspectives, and comprehensive insights
  * Add value with expert knowledge: Include statistics, research findings, professional insights, or industry data when relevant
  * Tell engaging stories: Use real-world examples, case studies, or relatable anecdotes that readers can connect with
  * Create emotional resonance: Address the reader's feelings, concerns, and aspirations (not just information delivery)
  * 공감 중심 말투: 독자의 상황을 이해하고 공감하는 표현을 적극 활용하여 독자와의 연결감 형성
  * 가독성 최우선: 복잡한 문장 구조보다는 명확하고 간결한 문장으로 정보를 전달하여 읽기 편하게 구성
  * ⚠️ CRITICAL: 자연스러운 글쓰기 (MANDATORY):
    - 반복적인 표현 완전 제거: "그의 ~", "그의 ~" 같은 패턴 3번 이상 연속 사용 절대 금지
    - 문장 구조 다양화: 같은 문장 구조로 시작하는 문장 연속 사용 금지
    - 주어 다양화: "그의", "이것", "그것", "이런", "저런", "이런 것" 등으로 교체
    - 자연스러운 대명사 사용: "그", "이것", "그것", "이런", "저런" 등으로 주어 반복 방지
    - 문장 끝 다양화: "~입니다", "~이에요", "~더라고요", "~이죠", "~네요" 등으로 변화
    - 친근한 톤 유지: "~예요", "~이에요", "~더라고요", "~이죠" 등 구어체 적극 활용
    - 불필요한 반복 제거: 같은 의미의 문장을 여러 번 반복하지 않기
  * Provide actionable insights: Give specific, practical tips and strategies that readers can immediately apply
  * Encourage reader participation: Use questions that make readers reflect on their own experiences or opinions
  * Build anticipation: Create curiosity gaps that make readers want to continue reading to find answers
  * Add context and background: Explain WHY things matter, not just WHAT they are
  * Use comparisons and contrasts: Help readers understand by comparing with familiar concepts or contrasting alternatives
  * Include real-world applications: Show how the information applies to everyday situations
  * 🎯 차별화 전략 (CRITICAL):
    - 정보 깊이: A+B+C까지 분석 (표면적 정보가 아닌 다각도 분석)
    - 각도: 양면 분석, 숨은 맥락 조명 (한쪽 의견만이 아닌 균형잡힌 시각)
    - 실용성: 이론+실전 적용법 제시 (이론만이 아닌 실제로 어떻게 적용할지)
  * 읽기 쉬운 문장 위주로 구성: 복잡한 문장보다는 명확하고 간결한 문장
- ✨ ENHANCED WRITING QUALITY:
  * ⚠️ CRITICAL: Use rhetorical questions SPARINGLY (1-2 per heading MAX, NOT in every paragraph)
  * ⚠️ CRITICAL: DO NOT repeat the same question pattern ("~일까요?", "~아시나요?" etc.) multiple times
  * ⚠️ CRITICAL: DO NOT use rhetorical questions in conclusion section
  * Include specific examples, numbers, or statistics when possible to add credibility.
  * Use transition phrases between sections: "그렇다면", "또한", "반면에", "특히", "예를 들어", "결론적으로"
  * ⚠️ CRITICAL: Focus on providing information and insights, NOT on asking questions repeatedly
  * Create emotional hooks: Start paragraphs with relatable scenarios or surprising facts.
  * Use varied sentence structures: Mix short punchy sentences with longer explanatory ones.
  * ${isEntertainmentIssue ? '⚠️ CRITICAL: Reader engagement questions MUST be specific and concrete, NOT generic. Examples:\n    - GOOD: "온라인 루머, 어떻게 대응해야 할까요?", "이번 사건에서 가장 중요한 법적 쟁점은 무엇이라고 생각하시나요?", "허위사실 유포에 대한 처벌 강화가 필요하다고 보시나요?"\n    - BAD: "이 소식, 여러분은 어떻게 보시나요?", "비슷한 상황을 겪으신 분들 계신가요?"\n  * Include reader engagement: Use specific, concrete questions that invite thoughtful responses' : 'Include reader engagement: "여러분은 어떻게 생각하시나요?", "혹시 비슷한 경험이 있으신가요?"'}
  * Add depth with "왜냐하면", "그 이유는", "실제로" to explain causes and effects.
  * ⚠️ MANDATORY: 자연스러운 구어체 표현 적극 활용 (딱딱한 격식체 절대 금지):
    - 필수 사용: "~더라구요", "~거든요", "~네요", "~잖아요", "~이에요", "~하죠", "~더라고요", "~이죠" 등
    - 딱딱한 표현 → 친근한 표현 변환 예시:
      * ❌ "이러한 기능들을 통해 드리미 매트릭스10 울트라는 가을철 건강한 실내 생활을 위한 필수품이라고 할 수 있습니다"
      * ✅ "이런 기능들 덕분에 드리미 매트릭스10 울트라가 가을철 건강한 실내 생활에 정말 도움이 되더라고요"
      * ❌ "이 제품을 통해 사용자들은 청소 시간을 절약하고, 더욱 깨끗하고 쾌적한 실내 환경을 누릴 수 있습니다"
      * ✅ "이 제품 쓰면 청소 시간도 절약되고, 더 깨끗하고 쾌적한 실내 환경을 누릴 수 있더라구요"
      * ❌ "드리미 매트릭스10 울트라는 단순한 청소 도구를 넘어, 사용자의 삶의 질을 향상시키는 데 기여하는 스마트 가전이라고 할 수 있습니다"
      * ✅ "드리미 매트릭스10 울트라는 단순한 청소 도구를 넘어서, 사용자의 삶의 질을 높여주는 스마트 가전이에요"
    - 공감 표현 예시:
      * "많은 분들이 느끼시는", "이런 경험 있으시죠?", "공감되시나요?", "아시겠죠?"
      * "솔직히 말하면", "사실은", "정말로", "진짜로", "실제로는"
      * "~하시는 분들 많으시죠?", "~하시는 게 보통이죠?", "~하시는 분들 계시죠?"
  * Avoid repetition: Use synonyms and varied expressions instead of repeating the same words.
  * ⚠️ CRITICAL: 반복 패턴 완전 차단 (MANDATORY - 글 전체 폐기 사유):
    - 같은 주어 반복 절대 금지: "그의 ~", "그의 ~" → 즉시 "이런 ~", "이것은 ~", "이 배우는 ~" 등으로 다양화
    - 같은 내용 반복 절대 금지: 같은 정보를 다른 말로 표현하는 것도 금지 (예: "유연석의 연기 변신이 기대됩니다" → "유연석의 새로운 연기가 기대됩니다" 같은 반복 금지)
    - 같은 문장 구조 반복 절대 금지: "~은 ~입니다", "~은 ~입니다" → 즉시 문장 구조를 완전히 바꾸기
    - 같은 수식어 반복 절대 금지: "기대됩니다", "기대됩니다" → "기대됩니다", "관심이 모아집니다", "주목받고 있습니다" 등으로 다양화
    - 같은 연결어 반복 절대 금지: "또한", "또한" → 즉시 "그리고", "그런데", "그래서", "특히", "반면에" 등으로 다양화
    - 같은 종결 문구 반복 절대 금지: "앞으로의 전개를 지켜봐야겠습니다", "이런 일이 다시는 반복되지 않기를 바랍니다", "사건의 진상이 명확히 밝혀지길 기대합니다", "이 정도 기대, 괜찮겠죠?" 같은 형식적 마무리 문구는 전체 글에서 1번도 사용 금지 (절대 사용하지 말 것)
    - 문장 길이 다양화: 짧은 문장(5-10자)과 긴 문장(30-50자)을 불규칙하게 배치
    - 주어 생략 활용: 문맥상 명확하면 주어 생략하여 자연스러움 증가
    - ⚠️⚠️⚠️ 각 소제목마다 새로운 정보 제공 (ABSOLUTE REQUIREMENT - 위반 시 글 전체 폐기):
      * ⚠️ ABSOLUTE REQUIREMENT: 같은 내용을 반복하지 말고, 각 소제목마다 새로운 관점이나 정보를 제공
      * ⚠️ ABSOLUTE REQUIREMENT: 같은 정보를 다른 말로 표현하는 것도 금지 (예: "고인의 영면을 기원합니다" → "고인의 명복을 빕니다" 같은 반복 금지)
      * ⚠️ ABSOLUTE REQUIREMENT: 각 소제목은 완전히 다른 주제나 관점을 다뤄야 함
      * ⚠️ ABSOLUTE REQUIREMENT: 이전 소제목에서 다룬 내용을 다시 다루지 말 것
      * ⚠️ ABSOLUTE REQUIREMENT: 중복 문단 생성 절대 금지 (유사도 70% 이상이면 중복으로 간주)
      * ⚠️ ABSOLUTE REQUIREMENT: 같은 문장 구조 3번 이상 반복 절대 금지 (예: "~입니다", "~입니다", "~입니다" → 즉시 폐기)
      * ⚠️ ABSOLUTE REQUIREMENT: 각 소제목 작성 전에 이전 소제목에서 다룬 내용을 확인하고, 완전히 새로운 내용만 작성할 것
  * Create flow: Each paragraph should logically connect to the next, building on previous information.
- ⚠️ CRITICAL: Target length: bodyPlain MUST be at least ${minChars} Korean characters.
  * ⚠️ ABSOLUTE REQUIREMENT: bodyPlain MUST be ${minChars} characters or more.
  * ⚠️ EACH HEADING SECTION: Each heading section should be 300-400 characters (각 소제목당 300-400자).
${isShoppingReview ? `  * ⚠️ SHOPPING REVIEW: Each heading section should be 250-350 characters (각 소제목당 최소 250자, 최대 350자).
  * ⚠️ SHOPPING REVIEW WRITING: 짧고 강력하게! 각 소제목은 2-3문장으로 간결하게, 핵심만 전달.
  * ⚠️ SHOPPING REVIEW FORBIDDEN: "도움이 되었으면 좋겠습니다" 같은 반복 마무리 문구 절대 금지.` : `  * ⚠️ WRITING STRATEGY:
    - For each heading, write 2-3 detailed paragraphs (각 소제목당 2-3개 문단)
    - Each paragraph should be 80-120 characters (각 문단 80-120자)
    - Include specific examples, case studies, statistics, and practical insights for EACH heading`}
  * ⚠️ PRIORITY 1: 양보다 질! 억지로 글자수 채우지 마세요 (QUALITY OVER QUANTITY)
  * ⚠️ PRIORITY 2: 알찬 내용으로 자연스럽게 ${minChars}자 전후 유지
  * ⚠️ DO NOT: 같은 말 반복, 의미 없는 문장 추가, 불필요한 설명 절대 금지
  * ⚠️ DO: 핵심 정보 위주, 읽고 도움되는 내용만, 자연스러운 흐름
- 🎯 글쓰기 스타일 통일 (모든 연령대 공통):
  * 목표 분량: 2,800~3,500자 (알찬 내용으로 자연스럽게)
  * 톤: 친근하고 정보 전달력 있는 스타일 (친구에게 설명하듯)
  * 표현: "~예요", "~이에요", "~더라고요" 같은 부드러운 반말체 허용
  * 구조: 소제목당 2-3문단, 핵심 정보 + 부가 설명
  * ⚠️ 절대 금지: 같은 내용 반복, 의미 없는 연결어, 억지 글자수 채우기
- ⚠️ CONTENT QUALITY REQUIREMENT: Do NOT just deliver information superficially. You MUST:
  * Go deep into each topic with analysis, examples, and insights (not just surface-level facts)
  * Connect with readers emotionally and intellectually (not just provide dry information)
  * Include expert perspectives, data, statistics, or research findings when relevant
  * Provide practical, actionable advice that readers can apply in their lives
  * Use storytelling to make content more engaging and memorable
  * Create content that readers will want to share, bookmark, and return to
  * Address the "why" and "how", not just the "what"
${isShoppingReview ? `
🛍️ 쇼핑 리뷰 최적화 (CRITICAL - 네이버 블로그 특화):
- ⚠️⚠️⚠️ MANDATORY: 밝고 낙천적이며 친절하고 친근한 톤 필수
- ⚠️⚠️⚠️ MANDATORY: 긍정적이고 구매 욕구를 높이는 내용 필수
- ⚠️⚠️⚠️ MANDATORY: 독자 공감 극대화 - "많은 분들이 느끼시는", "이런 경험 있으시죠?" 등 적극 활용
- ⚠️⚠️⚠️ ABSOLUTE FORBIDDEN: 부정적 표현, 불안감 조성 금지
  * ❌ 금지: "숨겨진 진실", "정말 혜택일까?", "낭패를 볼 수도", "후회할 수 있습니다"
  * ❌ 금지: "주의해야 할 점", "문제점", "단점만 나열" 같은 부정적 전개
  * ✅ 필수: 실제 사용 경험, 긍정적 변화, 구체적 장점 중심
  * ✅ 필수: "3개월 사용해보니", "실제로 사용하면서", "개인적으로 만족스러워요" 같은 긍정적 경험담
- ⚠️⚠️⚠️ ABSOLUTE FORBIDDEN: 반복되는 마무리 문구 완전 금지
  * ❌ 절대 금지: "도움이 되었으면 좋겠습니다", "도움이 되었으면 합니다", "도움이 되었으면 합니다" 같은 반복 문구
  * ❌ 절대 금지: "비즈니스 성장에 도움이 되길 바랍니다", "마케팅 활동에 도움이 되었으면 좋겠습니다" 같은 문구를 소제목 본문 중간에 사용
  * ❌ 절대 금지: "재태크에 도움되셧으면 좋겠습니다", "재태크에 도움이 되었으면 좋겠습니다", "재테크에 도움되셧으면 좋겠습니다", "재테크에 도움이 되었으면 좋겠습니다" 같은 문구를 소제목 본문 중간에 사용 (어떤 카테고리에서든 절대 금지)
  * ❌ 절대 금지: 소제목마다 같은 마무리 문구 반복 ("도움이 되었으면 좋겠습니다" 등)
  * ❌ 절대 금지: "참고하시길 바랍니다", "이 정보가 도움이 되셨기를 바랍니다" 등 형식적 마무리
  * ❌ 절대 금지: "도움이 되었으면 좋겠습니다" 같은 마무리 문구를 소제목 안에서 중복 사용
  * ✅ 필수: 각 소제목은 자연스럽게 마무리, 불필요한 마무리 문구 없이 바로 다음 내용으로 이어가기
  * ✅ 필수: 같은 소제목 안에서도 마무리 문구 중복 사용 절대 금지
- EEAT 강화: 실제 구매 경험, 사용 기간, 구체적인 사용 시나리오를 포함
- 긍정적 경험담 중심:
  * ⚠️⚠️⚠️ CRITICAL: 짧고 강력하게! 긴 설명보다는 핵심만 간결하게 (1500~2000자 목표)
  * ⚠️⚠️⚠️ CRITICAL: 이미지 중심 구성 - 각 소제목은 2-3문장으로 간결하게
  * ⚠️⚠️⚠️ CRITICAL: 실제 경험 기반 - "제가 직접", "실제로 사용해보니", "3개월 써본 결과" 등 필수
  * ⚠️⚠️⚠️ CRITICAL: CTA까지 고객 유도 - 글이 길면 이탈률 증가, 핵심만 빠르게!
  * ⚠️⚠️⚠️ CRITICAL: 구체적 경험담 필수 (시간, 장소, 상황 포함)
    - 예: "3개월 사용" (X) → "지난 7월 구매해서 3개월째 사용 중인데" (O)
    - 예: "청소할 때 좋아요" (X) → "주말마다 거실 바닥 청소할 때 써보니" (O)
    - 예: "흡입력이 좋아요" (X) → "카펫 위 먼지 청소할 때 흡입력이 정말 강했어요" (O)
    - 예: "배터리가 짧아요" (X) → "완충 시 약 30분 정도 사용했는데, 25평 정도 청소하려면 중간에 충전이 필요하더라구요" (O)
  * 구체적 사용 기간 명시 (예: "3개월 사용 후기", "2주째 사용 중", "한 달 넘게 써본 결과")
  * 실제 느낀 효과나 변화 서술 (예: "허리 통증이 80% 줄었어요", "청소 시간이 절반으로")
  * 제품의 구체적 특징과 장점 강조 (예: "4D 롤러가 정말 부드러워요", "흡입력이 예상 이상")
  * 자연스러운 추천 (예: "허리 통증 있으신 분들한테 강추해요", "바쁜 직장인에게 딱!")
  * 📸 이미지 중심 전략: 각 소제목마다 이미지 1-2장으로 설명 대체, 텍스트는 최소화
- 객관적 평가: 장점 중심으로 서술, 단점은 자연스럽게 언급만 (부정적 전개 금지)
- 비교 분석: 유사 제품과의 비교, 가격 대비 성능 평가 (간결하게 1-2문장)
- 구체적 사진 설명: "사진 보시면 아시겠지만", "실제 사진이에요" 등으로 이미지 강조
- 구매 시기와 배경: 왜 이 제품을 선택했는지 (1-2문장)
- 실용적 팁: 실제 사용하면서 알게 된 꿀팁 (간결하게, 불렛 포인트로)
- 가격 정보: 구매 당시 가격, 할인 여부, 가성비 평가 (1-2문장)
- 리뷰 신뢰도: 과장 없이 솔직한 평가, 개인적 경험 중심
- 과대광고 필터: "최고", "완벽", "필수" 같은 극단적 표현 지양, "제 기준으로는", "개인적으로는" 같은 표현 사용

💰 가격 비교 정보 (MANDATORY - 구매 전환 핵심!):
- ⚠️ 반드시 소제목 중 하나에 가격 정보를 포함해야 합니다!
- 정가 vs 할인가 비교: "정가 599만원인데, 지금 479만원에 구매 가능해요! 무려 120만원 할인이에요~"
- 타 쇼핑몰 비교: "네이버 쇼핑, 쿠팡, 공식몰 다 비교해봤는데, 지금 공식몰이 제일 저렴해요"
- 가성비 강조: "이 가격에 이 스펙이면 솔직히 가성비 갑이에요!"
- 추가 혜택 언급: "카드 무이자 할부도 되고, N포인트 20만점도 받을 수 있어요"
- 가격 정보 예시:
  * ✅ 좋은 예: "정가 599만원 → 현재 특가 479만원! (무려 20% 할인)"
  * ✅ 좋은 예: "쿠팡보다 공식몰이 10만원 더 저렴해요!"
  * ✅ 좋은 예: "지금 이 가격이면 솔직히 대박이에요... 저도 다시 사고 싶어요 ㅋㅋ"

⏰ 한정 혜택/마감일 강조 (MANDATORY - 긴급성 조성!):
- ⚠️ 반드시 글 어딘가에 한정 혜택이나 마감일을 언급해야 합니다!
- 기간 한정: "이번 달 말까지만!", "12월 한정 프로모션!", "연말 특가 마감 임박!"
- 수량 한정: "선착순 100명 한정!", "재고 소진 시 종료!", "인기 폭발로 품절 임박!"
- 혜택 마감: "N포인트 20만점은 이번 이벤트에서만!", "무상 AS 5년은 지금 구매자 한정!"
- 긴급성 강조 예시:
  * ✅ 좋은 예: "⚠️ 이 특가는 이번 주까지만이래요! 고민하다 놓칠 수 있으니 서두르세요~"
  * ✅ 좋은 예: "원래 다음 달부터 가격 인상 예정이라고 하더라고요... 지금이 마지막 기회!"
  * ✅ 좋은 예: "N포인트 20만점 증정은 12월 31일까지 구매자 한정이에요!"
  * ✅ 좋은 예: "솔직히 이 가격에 이 혜택은 다시 안 올 것 같아요... 저라면 지금 바로 구매할 듯!"

📱 네이버 블로그 쇼핑 리뷰 특화 전략 (짧고 강력하게!):
- 네이버 쇼핑 연동: 네이버 쇼핑에서 검색되는 제품명 정확히 기재
- 네이버 블로그 제품 리뷰 포맷: 제품명, 가격, 구매처, 사용 기간 등 구조화된 정보 제공
- 네이버 사용자 선호 스타일: "솔직한 후기", "과장 없는 평가" 선호
- 네이버 블로그 이미지: 제품 사진, 사용 사진, 비교 사진 등 다양하게 제공 (이미지가 핵심!)
- 네이버 블로그 해시태그: 제품명, 브랜드명, 카테고리명 포함
- 네이버 블로그 댓글 유도: "이 제품 사용해보신 분 있나요?", "비슷한 제품 비교해보신 분?" 등
- ⚠️ 각 소제목은 2-3문장 + 이미지로 구성 (긴 설명 금지!)
- ⚠️ 글이 길면 CTA까지 도달하기 전에 이탈! 핵심만 빠르게 전달!

✅ 쇼핑 리뷰 본문 작성 예시 (짧고 강력하게!):
- 좋은 예: "3개월째 사용 중인데, 허리 통증이 정말 많이 줄었어요. 특히 4D 롤러가 목부터 허리까지 꼼꼼하게 마사지해줘서 만족스럽습니다. (사진으로 보시면 더 잘 아실 거예요!)"
- 나쁜 예 (너무 길어요!): "안마의자를 구매하기 전에 많은 고민을 했습니다. 여러 브랜드를 비교하고 리뷰를 찾아보고 매장에도 직접 방문해봤는데요, 결국 바디프랜드 팔콘S를 선택했습니다. 그 이유는 첫째로 전연가죽이라는 점, 둘째로..." ❌ (너무 장황함!)
- 좋은 예: "전연가죽이라 촉감이 정말 부드럽고 고급스러워요. AS 5년 보장이라 안심하고 쓰고 있습니다."
- 나쁜 예: "가을맞이 특별 할인에 숨겨진 진실이 있을까요? 정말 혜택일까요? 낭패를 볼 수도 있습니다." ❌ (부정적 + 쓸데없이 김)
- 좋은 예: "실제로 써보니 청소 시간이 절반으로 줄었어요. 바쁜 직장인에게 강추!"
- 나쁜 예 (장황한 설명): "로봇청소기의 역사는 1990년대로 거슬러 올라가는데, 처음에는 단순한 구조였지만 요즘은 AI 기술이 접목되어..." ❌

` : ''}
${source.articleType === 'it_review' || source.articleType === 'product_review' ? `
💻 IT 제품 리뷰 최적화 (CRITICAL - 네이버 블로그 특화):
- ⚠️⚠️⚠️ MANDATORY: 밝고 낙천적이며 친절하고 친근한 톤 필수
- ⚠️⚠️⚠️ MANDATORY: 긍정적이고 구매 욕구를 높이는 내용 필수
- ⚠️⚠️⚠️ MANDATORY: 독자 공감 극대화 - "많은 분들이 느끼시는", "이런 경험 있으시죠?" 등 적극 활용
- ⚠️⚠️⚠️ ABSOLUTE FORBIDDEN: 부정적 표현, 불안감 조성 금지
- ⚠️⚠️⚠️ MANDATORY TONE: 딱딱한 격식체 절대 금지, 구어체 필수 사용
  * ❌ 절대 금지: "이 제품은 ~할 수 있습니다", "이러한 기능을 통해 ~라고 할 수 있습니다"
  * ✅ 필수 사용: "~하더라구요", "~이에요", "~더라고요", "~하죠", "~네요", "~잖아요"
  * ✅ 필수 사용: "있잖아요", "솔직히 말하면", "실제로는", "제 기준으로는"
- 제품명 포함: 제목에 정확한 전체 제품명 필수 (브랜드명 + 모델명)
- 구체적 사용 경험:
  * 구체적 사용 기간 명시 (예: "2주째 사용 중", "한 달 넘게 써봤는데")
  * 실제 느낀 효과나 변화 서술 (예: "작업 속도가 2배 빨라졌어요")
  * 제품의 구체적 특징과 장점 강조 (예: "화면이 정말 선명해요")
- 객관적 평가: 장점 중심으로 서술, 단점은 자연스럽게 언급만
- 실용적 팁: 실제 사용하면서 알게 된 꿀팁, 주의사항
- 비교 분석: 유사 제품과의 비교, 가격 대비 성능 평가
- 제품 스펙: 주요 스펙 간단히 언급 (너무 기술적이지 않게)
- 구매 팁: 언제 구매했는지, 어떤 할인을 받았는지 (자연스럽게)

✅ IT 리뷰 본문 작성 예시:
- 좋은 예: "2주째 사용 중인데, 작업 속도가 정말 빨라졌어요. 특히 화면이 선명해서 눈이 덜 피로하더라구요."
- 나쁜 예: "이 제품은 고성능 작업을 할 수 있으며, 이러한 기능을 통해 사용자의 생산성을 향상시킬 수 있습니다." ❌
- 좋은 예: "솔직히 가격이 좀 비싸긴 한데, 성능 대비는 정말 만족스러워요. 3년 이상 쓸 생각이면 추천해요."
- 나쁜 예: "주의해야 할 점은 가격이 높다는 것입니다. 구매를 신중하게 고려해야 합니다." ❌
` : ''}
${isLifeTips ? `
💡 생활 꿀팁 최적화 (CRITICAL):
- 이 글은 '생활 문제 해결' 콘텐츠입니다. 인테리어 시공/비포애프터 중심으로 흐르지 않게 하세요.
- 목표: 읽자마자 따라 할 수 있게 "준비물 → 순서 → 실패 방지 → 요약"으로 정리
- 반드시 포함:
  1) 결론 1~2줄 먼저 ("결론부터 말하면 OOO만 바꾸면 끝")
  2) 준비물(대체재 포함) + 예상 비용/시간(현실 범위)
  3) 단계별 실행(3~5단계) - 초보도 따라하도록
  4) 실패 방지 포인트 3개 ("여기서 이거 하면 망해요")
  5) 상황별 변형 2개 (원룸/자취/아이/반려동물 등)
  6) 체크리스트 요약 5줄 내
  7) Q&A 3개 (가장 흔한 질문 위주)
- 표현 스타일:
  * 단정 과장 금지: "무조건", "완벽" 같은 표현 최소화
  * 숫자는 현실적으로: "약 5~10분", "약 1~3천원" 같은 범위 표현
  * 문장 길이 섞기: 짧은 문장으로 중간중간 끊어주기
- 금지:
  * 뜬구름 조언, 교과서형 설명, 장황한 배경설명
  * 전문용어 남발 (필요하면 괄호로 1줄 설명)

🎨 이미지 프롬프트(imagePrompt) 지침 (CRITICAL):
- 각 소제목의 imagePrompt는 '생활 장면/소품'을 구체적으로 잡아야 합니다.
- 반드시 포함할 것:
  * 장소: 주방/싱크대/욕실/세탁실/현관/베란다/냉장고 앞 등
  * 소품: 수세미, 베이킹소다, 분무기, 행주, 수건, 밀폐용기, 수납박스, 고무장갑 등
  * 분위기: 밝은 자연광, 실제 생활감, 정돈된 테이블 위, 클로즈업 디테일
- 금지:
  * 'interior design', 'luxury room' 같이 인테리어 화보 느낌
  * 텍스트가 들어간 이미지, 로고, 워터마크
  * 과도한 AI 아트/일러스트 스타일
- 좋은 예 방향:
  * "kitchen sink cleaning, spray bottle and baking soda on countertop, bright natural light, realistic photo, close-up, 4k"
  * "bathroom mold removal concept, gloved hands wiping tiles with microfiber cloth, realistic photo, clean bright tone, 4k"
` : ''}
${isLivingInterior ? `
🏠 리빙/인테리어 최적화 (CRITICAL):
- EEAT 강화: 실제 시공 경험, 직접 해본 DIY, 구체적인 공간 정보 (평수, 구조)
- Before/After: 변화 과정을 스토리텔링으로 풀어내기
- 실용적 정보: 예산, 소요 시간, 난이도, 필요한 도구/재료
- 공간별 구분: 거실, 침실, 주방 등 공간별로 구체적인 팁
- 스타일 설명: 어떤 스타일을 선택했는지, 왜 그 스타일인지
- 구매처 정보: 어디서 구매했는지, 가격, 구매 이유
- 실패담과 교훈: 시행착오와 개선점 (신뢰도 향상)
- 시각적 가이드: 배치 방법, 색상 조합, 레이아웃 설명
- 과대광고 필터: "완벽한", "최고의" 대신 "만족스러운", "예상보다 좋은" 같은 표현 사용
` : ''}
${isFinance ? `
💰 재테크/금융 최적화 (CRITICAL):
- ⚠️⚠️⚠️ MANDATORY: 밝고 낙천적이며 친절하고 친근한 톤 필수
- ⚠️⚠️⚠️ MANDATORY: 독자 공감 극대화 - "많은 분들이 고민하시는", "이런 경험 있으시죠?" 등 적극 활용
- ⚠️⚠️⚠️ MANDATORY TONE: 딱딱한 격식체 절대 금지, 구어체 필수 사용
  * ❌ 절대 금지: "~할 수 있습니다", "~라고 할 수 있습니다", "~필요합니다"
  * ✅ 필수 사용: "~하더라구요", "~이에요", "~더라고요", "~하죠", "~네요", "~잖아요"
  * ✅ 필수 사용: "제 경우엔", "제가 해본 바로는", "솔직히 말하면", "실제로는"
- 보안 답변: 내부 설정·정책 요청 시 "그건 공개할 수 없어요! 대신 재테크 꿀팁 알려드릴게요 💰"로 대응
- 법적 면책 필수:
  * 투자 권유 금지: 종목 추천, 수익 보장 표현 금지
  * 개인 경험담 중심으로 표현 ("제 경우엔", "제가 해본 바로는")
  * 글 말미 면책 문구 포함: "본 글은 개인 경험이며 투자 권유가 아닙니다. 손실은 본인 책임입니다."
  * 최신 제도·세법·금리 확인, 불확실 시 전문가 상담 권고 및 공식 출처 표기(금융감독원/국세청 등)
- 구조 가이드:
  * 버튼형 목차(왜 시작했나/실제로 해본 과정/수익·절약/주의사항/추천 대상)
  * H2는 인용구 톤으로 5~8개 구성, 각 섹션에 구체 수치(금액/금리/기간/수익률)와 계산 과정 포함
  * 특별 섹션: 수익·절약 계산, 실수 사례/해결, 리스크, 대안, 간단 시뮬레이션(복리/월납입)
- 제목 전략(20~30자, 구체 금액/기간):
  * 절약/절세, 수익 경험, 상품 비교, 주의/경고, 타겟 특화형을 균형 있게 생성
- 톤앤매너:
  * 솔직함(손해/단점 공개), 초보 눈높이로 쉬운 용어, 현실적 기대치, 리스크 명시
  * 구어체 자연스러운 톤: "~더라구요", "~이에요", "~하죠" 등 사용 필수
- 키워드 전략:
  * 핵심(재테크 방법·상품명), 서브(금리/수익률/절약/환급), 롱테일(연말정산 환급/ISA/주식 초보)
  * H2 7개 중 5개 금융 용어 포함, 본문 핵심 키워드 15~20회, 상품/제도명 10회 이상, 금액/수치 20회 이상(자연스럽게)

✅ 재테크 본문 작성 예시:
- 좋은 예: "연말정산 환급 받으려고 ISA 시작했는데, 생각보다 수익률이 괜찮더라구요. 1년 만에 50만원 정도 모였어요."
- 나쁜 예: "ISA는 투자 상품으로, 수익을 얻을 수 있는 방법입니다. 투자 권유가 아닙니다." ❌
- 좋은 예: "제 경우엔 월 50만원씩 넣고 있는데, 리스크 관리 차원에서 안전한 상품 위주로 골랐어요."
- 나쁜 예: "월 50만원을 투자하면 수익을 얻을 수 있습니다. 단, 손실 가능성도 있습니다." ❌
` : ''}
${isParenting ? `
👶 육아/교육 최적화 (CRITICAL):
- ⚠️⚠️⚠️ MANDATORY TONE: 딱딱한 격식체 절대 금지, 구어체 필수 사용
  * ❌ 절대 금지: "~할 수 있습니다", "~라고 할 수 있습니다", "~필요합니다"
  * ✅ 필수 사용: "~하더라구요", "~이에요", "~더라고요", "~하죠", "~네요", "~잖아요"
  * ✅ 필수 사용: "있잖아요", "솔직히 말하면", "제 경우엔", "실제로는"
- 자동 분석: 연령대(개월/학년), 카테고리(육아정보/학습/놀이/육아템/먹거리/심리/생활), 부모 상황(워킹맘/전업 등), 검색 의도(방법/후기/추천) 파악
- 제목 전략(20~32자, 연령·고민·결과 힐끔):
  * 고민 해결/노하우/추천·리뷰/공감/정보·학습형 조합으로 20개 생성
- 문서 구조:
  * 버튼형 목차(왜 고민/시도/달라진 점/주의/추천), H2 인용구 스타일 5~7개
  * 각 H2: 상황/감정 → 시도 → 전환점(1줄 임팩트) → 구체 변화+팁 → 참여 유도
  * 특별 섹션: 다른 사례/전문가 의견/연령별 차이
- 톤앤매너:
  * 공감 최우선, 실패담·시행착오 포함, 구체 디테일(개월/시간/반응), 따뜻한 어조, 개인차/전문가 상담 권장
  * 구어체 자연스러운 톤: "~더라구요", "~이에요", "~하죠" 등 사용 필수
- 키워드 전략:
  * '아이/우리 애' 다빈도, 연령(개월/살), 카테고리 키워드 자연 배치, 상품명은 과하지 않게

✅ 육아/교육 본문 작성 예시:
- 좋은 예: "8개월 아기 이유식 시작했는데, 생각보다 잘 먹더라구요. 처음엔 거부 반응이 있었지만, 1주일쯤 지나니까 적응했어요."
- 나쁜 예: "8개월 아기의 이유식을 시작할 수 있으며, 거부 반응이 있을 수 있습니다. 적응할 때까지 기다려야 합니다." ❌
` : ''}
${source.articleType === 'health' || source.categoryHint === '건강' ? `
💊 건강 최적화 (CRITICAL - 네이버 블로그 특화):
- ⚠️⚠️⚠️ MANDATORY: 밝고 낙천적이며 친절하고 친근한 톤 필수
- ⚠️⚠️⚠️ MANDATORY: 독자 공감 극대화 - "많은 분들이 걱정하시는", "이런 경험 있으시죠?" 등 적극 활용
- ⚠️⚠️⚠️ MANDATORY TONE: 딱딱한 격식체 절대 금지, 구어체 필수 사용
  * ❌ 절대 금지: "~할 수 있습니다", "~라고 할 수 있습니다", "~필요합니다"
  * ✅ 필수 사용: "~하더라구요", "~이에요", "~더라고요", "~하죠", "~네요", "~잖아요"
  * ✅ 필수 사용: "있잖아요", "솔직히 말하면", "제 경우엔", "실제로는"
- 법적 면책 필수:
  * 의료 정보 제공 시 전문가 상담 권장 문구 포함
  * "제 개인적 경험이며 의학적 조언이 아닙니다", "증상이 지속되면 전문의 상담을 권장합니다"
- 구체적 경험담 중심:
  * 실제 경험한 건강 관리 방법, 변화 과정 서술
  * 구체적 기간, 수치, 변화 효과 포함
- 실용적 팁 제공:
  * 일상에서 바로 적용 가능한 건강 관리 방법
  * 과장 없는 솔직한 평가

✅ 건강 본문 작성 예시:
- 좋은 예: "3개월째 저염식 하고 있는데, 혈압이 정말 많이 내려갔어요. 처음엔 음식이 싱거워서 힘들었지만, 지금은 적응됐더라구요."
- 나쁜 예: "저염식을 하면 혈압을 낮출 수 있습니다. 전문가 상담이 필요합니다." ❌
` : ''}
${isEntertainmentIssue || source.articleType === 'entertainment' ? `
🎬 연예 최적화 (CRITICAL - 네이버 블로그 특화):
- ⚠️⚠️⚠️ MANDATORY: 밝고 낙천적이며 친절하고 친근한 톤 필수
- ⚠️⚠️⚠️ MANDATORY: 독자 공감 극대화 - "많은 분들이 기대하시는", "이런 경험 있으시죠?" 등 적극 활용
- ⚠️⚠️⚠️ MANDATORY TONE: 딱딱한 격식체 절대 금지, 구어체 필수 사용
  * ❌ 절대 금지: "~할 수 있습니다", "~라고 할 수 있습니다", "~기대됩니다"
  * ✅ 필수 사용: "~하더라구요", "~이에요", "~더라고요", "~하죠", "~네요", "~잖아요"
  * ✅ 필수 사용: "있잖아요", "솔직히 말하면", "제 생각엔", "실제로는"
- 소제목에 이모지 사용 (연예 뉴스 특화):
  * 각 소제목 시작에 관련 이모지 추가 (예: ⚖️, 📰, 💡, 🔍, ⚠️, ✅, 📊, 🎯, 💬, 🔥)
- 객관적 시각 유지:
  * 추측보다는 사실 중심 서술
  * 과도한 추측이나 루머 방지
- 독자 참여 유도:
  * "이 소식 어떻게 보시나요?", "이 드라마 보신 분 있나요?" 같은 구체적 질문

✅ 연예 본문 작성 예시:
- 좋은 예: "유연석의 새로운 작품이 기대되더라구요. 특히 이번엔 액션 장르라 더 관심이 가요."
- 나쁜 예: "유연석의 새로운 작품이 기대됩니다. 이번 작품은 액션 장르입니다." ❌
` : ''}
${source.articleType === 'sports' || source.categoryHint === '스포츠' ? `
⚽ 스포츠 최적화 (CRITICAL - 네이버 블로그 특화):
- ⚠️⚠️⚠️ MANDATORY: 밝고 낙천적이며 친절하고 친근한 톤 필수
- ⚠️⚠️⚠️ MANDATORY: 독자 공감 극대화 - "많은 분들이 응원하시는", "이런 경험 있으시죠?" 등 적극 활용
- ⚠️⚠️⚠️ MANDATORY TONE: 딱딱한 격식체 절대 금지, 구어체 필수 사용
  * ❌ 절대 금지: "~할 수 있습니다", "~라고 할 수 있습니다", "~기대됩니다"
  * ✅ 필수 사용: "~하더라구요", "~이에요", "~더라고요", "~하죠", "~네요", "~잖아요"
  * ✅ 필수 사용: "있잖아요", "솔직히 말하면", "제 생각엔", "실제로는"
- 경기 분석 중심:
  * 경기 결과, 전술 분석, 선수 활약 등 구체적 내용
  * 감정적 표현 적절히 사용 (과도하지 않게)
- 객관적 시각 유지:
  * 감정에 치우치지 않고 객관적 분석
  * 팬심보다는 사실 중심 서술

✅ 스포츠 본문 작성 예시:
- 좋은 예: "이강인이 정말 잘했더라구요. 특히 중반부 크로스가 인상적이었어요."
- 나쁜 예: "이강인의 활약이 기대됩니다. 경기 결과가 주목받고 있습니다." ❌
` : ''}
${source.articleType === 'news' ? `
📰 뉴스/이슈 최적화 (CRITICAL - 네이버 블로그 특화):
- ⚠️⚠️⚠️ MANDATORY: 밝고 낙천적이며 친절하고 친근한 톤 필수 (부정적 뉴스도 긍정적 관점으로 전환)
- ⚠️⚠️⚠️ MANDATORY: 독자 공감 극대화 - "많은 분들이 궁금해하시는", "이런 경험 있으시죠?" 등 적극 활용
- ⚠️⚠️⚠️ MANDATORY TONE: 딱딱한 격식체 절대 금지, 구어체 필수 사용
  * ❌ 절대 금지: "~할 수 있습니다", "~라고 할 수 있습니다", "~필요합니다"
  * ✅ 필수 사용: "~하더라구요", "~이에요", "~더라고요", "~하죠", "~네요", "~잖아요"
  * ✅ 필수 사용: "있잖아요", "솔직히 말하면", "제 생각엔", "실제로는"
- 사실 중심 서술:
  * 추측이나 의견보다는 확인된 사실 중심
  * 출처 명시 (가능한 경우)
- 객관적 시각 유지:
  * 편향되지 않은 균형잡힌 시각
  * 다양한 관점 제시

✅ 뉴스/이슈 본문 작성 예시:
- 좋은 예: "이번 사건 정말 충격적이더라구요. 특히 피해 규모가 예상보다 커서 더 놀랐어요."
- 나쁜 예: "이번 사건은 충격적입니다. 피해 규모가 예상보다 큽니다." ❌
` : ''}
- 🎯 HOME FEED EXPOSURE OPTIMIZATION (네이버 홈피드 노출 끝판왕):
  * 📱 제목 최적화 (클릭률 = 노출의 시작):
    - 숫자 활용: "5가지", "3분만에", "10개", "${new Date().getFullYear()}년" (구체성)
    - 질문형: "~일까요?", "~아시나요?", "왜 그럴까?" (호기심)
    - 긴급성: "지금", "오늘", "최신", "방금", "급" (시의성)
    - 감정 자극: "충격", "대박", "놀라운", "감동", "눈물" (감정)
    - 타겟팅: "30대", "직장인", "주부", "초보자" (명확한 대상)
    - 결과 암시: "~하니 달라졌어요", "~한 결과", "~효과" (궁금증)
  * ⏱️ 첫 100자가 생명 (3초 안에 후킹):
    - 공감으로 시작: "이런 거 진짜 짜증나죠?", "저도 완전 그랬어요"
    - 충격으로 시작: "헐 이거 진짜 대박이에요", "믿기지 않겠지만"
    - 질문으로 시작: "혹시 이런 경험 있으세요?", "왜 그런지 아세요?"
    - 결과로 시작: "3일만에 완전 달라졌어요", "이거 하나로 해결됐어요"
    - 비밀로 시작: "아무도 안 알려주는 꿀팁", "숨겨진 진실"
  * 📊 체류시간 최적화 (3-5분이 최적):
    - 소제목 자주: 300-400자마다 소제목 삽입 (스크롤 유도)
    - 1줄 임팩트: 중요한 정보 후 1줄로 강조 (시선 멈춤)
    - 질문 던지기: 문단 끝에 질문으로 다음 내용 궁금하게
    - 클리프행어: "그런데 여기서 반전이", "진짜는 지금부터"
    - 비주얼 브레이크: 이모지(문장 끝), 공백으로 시각적 휴식
  * 🎯 완독률 높이기 (끝까지 읽게):
    - 30% 지점: 첫 번째 핵심 정보 (이탈 방지)
    - 50% 지점: 반전이나 놀라운 사실 (재미 요소)
    - 70% 지점: 실용적인 팁 (가치 제공)
    - 90% 지점: 마무리 요약 (만족감)
  * 🔥 참여 유도 (댓글/공유/좋아요):
    - 의견 물어보기: "어떻게 생각하세요?", "혹시 경험 있으세요?"
    - 공감 구하기: "저만 그런가요?", "다들 그러시죠?"
    - 정보 요청: "더 궁금한 거 있으면 댓글로", "추가로 알려드릴까요?"
  * 📈 키워드 전략 (검색 노출):
    - 첫 300자에 핵심 키워드 3회 (검색 봇이 중요하게 봄)
    - 소제목에 키워드 자연스럽게 (구조 파악용)
    - 본문 전체 15-20회 분산 (과하지 않게)
    - 마지막 300자에 2-3회 (마무리 강조)
- ⚠️⚠️⚠️ ULTRA-CRITICAL TITLE OPTIMIZATION - CLICK-BAIT LEVEL (MUST BE IRRESISTIBLE):
  * ⚠️ MANDATORY: The title MUST make readers think "I MUST click this NOW!" - not just "maybe I'll read this"
  * ⚠️ MANDATORY: Ask yourself: "Would I click this title if I saw it in my feed?" If the answer is "maybe" or "probably not", REJECT it and create a better one
  * ⚠️ MANDATORY: The title MUST create an URGENT CURIOSITY GAP that readers cannot ignore
  
  * 🔥🔥🔥 URL/뉴스 크롤링 제목 - 핵심 후킹 키워드 필수 포함! (ULTRA-CRITICAL):
    - ⚠️ 원문 제목의 따옴표('', "") 안 문구 = 반드시 제목에 포함!
    - ⚠️ "폭로", "충격", "논란", "비밀", "진실" 등 자극적 키워드 = 절대 버리지 마라!
    - ⚠️ 원문의 핵심 후킹 요소를 살리지 않으면 0점!
    - 예: 원문 "오타니, '부부의 관계' 폭로" → "오타니 부부의 관계 폭로" 필수 포함!
    - 예: 원문 "임영웅 '은퇴 고민' 고백" → "임영웅 은퇴 고민" 필수 포함!
  
  * 🎯 CLICK-TRIGGERING ELEMENTS (USE AT LEAST 2-3):
    1. **구체적 숫자/사실**: "3일만에", "99%가 모르는", "5분 안에", "10배 차이", "3가지 이유"
    2. **반전/충격**: "하지만 진실은", "그런데 알고보니", "의외로", "충격적인", "아무도 모르는"
    3. **긴급성/독점성**: "지금 바로", "오늘 밤", "마지막 기회", "단독", "최초 공개"
    4. **감정적 트리거**: "대박", "헐", "와", "진짜", "완전", "정말", "꼭"
    5. **호기심 유발 질문**: "왜 그럴까?", "어떻게 했을까?", "무엇이 문제일까?", "진짜일까?"
    6. **결과 암시**: "~하니 달라졌어요", "~한 결과", "~효과", "~후기"
    7. **비밀/숨겨진 정보**: "아무도 안 알려주는", "숨겨진", "비밀", "꿀팁"
    8. **예상치 못한 각도**: 일반적인 관점이 아닌 독특한 시각, 반대 의견, 숨겨진 진실
  
  * ❌ FORBIDDEN (DO NOT CREATE):
    - 일반적이고 예측 가능한 제목: "이강인 선발될까?", "PSG 토트넘전 승리"
    - 단순한 질문만 있는 제목: "~일까요?" (이것만으로는 부족)
    - 감정 없는 평면적인 제목
    - 구체성 없는 추상적 제목
  
  * ✅ EXCELLENT EXAMPLES (HIGH CLICK RATE):
    - "이강인 선발 확정? PSG 감독이 숨긴 진짜 이유 3가지"
    - "99%가 모르는 이강인 선발 비밀, 알고보니 이 때문이었다"
    - "PSG 토트넘전 승리 확률 80%? 전문가가 말하는 충격적 이유"
    - "이강인 선발 안 된다고? 하지만 엔리케 감독의 숨겨진 계획"
    - "PSG 팬들 충격, 이강인 선발 여부가 결정하는 진짜 이유"
    - "토트넘전 이강인 선발? 전문가 10명 중 8명이 예측한 결과"
    - "이강인 선발 확정? PSG 감독이 직접 밝힌 3가지 이유"
    - "PSG 토트넘전, 이강인 없으면 진다? 충격적인 통계 공개"
  
  * 📏 TITLE LENGTH: 25-35 characters in Korean (optimal for mobile display)
  * 🔑 KEYWORDS: Include 1-2 primary keywords naturally (don't force them)
  * 🎭 TONE: Must be engaging, intriguing, and create FOMO (Fear Of Missing Out)
  * ⚡ URGENCY: Make readers feel they need to read this NOW, not later

- ⚠️⚠️⚠️ CRITICAL HEADINGS - ABSOLUTE REQUIREMENT (MANDATORY):
  * ⚠️ HEADING COUNT: Generate 3-8 headings in the headings array (3-8개, 자연스러운 개수로 작성)
  * ⚠️ HEADING COUNT: The number of headings should match the content naturally (소제목 개수는 내용에 맞게 자연스럽게)
  * ⚠️⚠️⚠️ 쇼핑 리뷰 특별 규칙 (CRITICAL):
    - 쇼핑 리뷰는 3-8개 권장 (내용에 맞게 자연스러운 개수로 작성)
    - 각 소제목은 3-4문장 (250-350자) 작성 (이미지가 핵심이지만 충분한 내용 필요!)
    - 너무 짧으면 안 됨! 핵심 내용을 충분히 전달 + 많은 이미지로 CTA까지 유도
    - ⚠️ 중요: 전체 본문이 최소 2200자 이상이 되도록 충분히 작성할 것!
  * 제품 리뷰 (일반): 3-8개 권장 (내용에 맞게 자연스러운 개수로 작성)
  * 일반 글: 3-8개 권장 (내용에 맞게 자연스러운 개수로 작성)
  * 각 소제목은 충분한 분량(500-700자)을 확보할 수 있도록 적절한 개수 유지 (단, 쇼핑 리뷰는 250-350자)
- ⚠️⚠️⚠️ CRITICAL - NO DUPLICATE HEADINGS (ABSOLUTE REQUIREMENT):
  * ⚠️ ABSOLUTE REQUIREMENT: Each heading title MUST be completely unique (no duplicates)
  * ⚠️ ABSOLUTE REQUIREMENT: DO NOT repeat the same heading title twice (even with slight variations)
  * ⚠️ ABSOLUTE REQUIREMENT: Each heading MUST cover a DIFFERENT aspect of the topic
  * ⚠️ ABSOLUTE REQUIREMENT: If you already discussed a topic in one heading, DO NOT discuss it again in another heading
  * ⚠️ ABSOLUTE REQUIREMENT: Before adding a heading, check if a similar heading already exists
  * ⚠️ ABSOLUTE REQUIREMENT: If you find yourself repeating a heading, create a completely different one
  * ⚠️ VERIFICATION CHECKLIST (MANDATORY - Check before finishing):
    [ ] All heading titles are completely unique (no duplicates)
    [ ] Each heading covers a different aspect of the topic
    [ ] No heading is a variation of another heading
    [ ] Total heading count is between 3 and 8 (자연스러운 개수)
- 🎯 HEADING OPTIMIZATION FOR SEO (CRITICAL - MUST BE SPECIFIC AND ENGAGING):
  * ${isEntertainmentIssue ? '⚠️ CRITICAL: Each heading title MUST start with a relevant emoji (이모지) that matches the topic. Examples: ⚖️ (legal/justice), 📰 (news), 💡 (insight), 🔍 (analysis), ⚠️ (warning), ✅ (solution), 📊 (data), 🎯 (focus), 💬 (discussion), 🔥 (trending), etc.' : 'Each heading should be clear and engaging without requiring emojis.'}
  * ⚠️ HEADING QUALITY REQUIREMENTS (MANDATORY):
    - Each heading MUST be specific, concrete, and descriptive (최소 10-20자)
    - BAD EXAMPLES (너무 짧고 성의없음): "72정을 찾아라", "침묵 아래 비극", "45년 동안의 SOS"
    - GOOD EXAMPLES (구체적이고 흥미로움): "45년 만에 발견된 해경 72정, 수중 탐사의 기적", "72정 침몰 사고의 숨겨진 진실과 의혹들", "17명의 실종자 가족들이 45년간 품어온 희망과 슬픔"
    - Include specific details: numbers, locations, people, events, emotions
    - Create curiosity with "왜", "어떻게", "무엇이" questions
    - Use emotional triggers: "충격적인", "감동적인", "놀라운", "슬픈", "희망의"
  * ⚠️⚠️⚠️ TITLE-HEADING CONSISTENCY (MANDATORY - 제목과 소제목 통일성):
    - ⚠️ 제목과 소제목의 톤/스타일을 일관되게 유지 (예: 제목이 공식적이면 소제목도 공식적으로)
    - ⚠️ 제목에 있는 핵심 키워드는 최소 2개 이상의 소제목에도 자연스럽게 포함
    - ⚠️ 제목이 질문형이면 소제목 중 최소 1개는 그 질문에 답하는 형태로 구성
    - ⚠️ 제목에서 약속한 정보(숫자, 방법, 비교 등)는 반드시 소제목에서 다뤄야 함
    - ⚠️ BAD EXAMPLE: 제목 "2024년 최고의 노트북 TOP 5" → 소제목 "디지털 세상", "기술의 진화" (추상적, 관련 없음)
    - ⚠️ GOOD EXAMPLE: 제목 "2024년 최고의 노트북 TOP 5" → 소제목 "1위: 맥북 프로 M3, 압도적 성능", "2위: 삼성 갤럭시북4, 가성비 최강", "3위: LG 그램17, 초경량의 진화"
    - ⚠️ 소제목은 제목의 세부 내용을 구체화하는 역할을 해야 함 (제목과 동떨어진 소제목 금지)
  * ⚠️⚠️⚠️ CRITICAL KEYWORD REQUIREMENT FOR HEADINGS (MANDATORY - 절대 필수):

    - ⚠️ ABSOLUTE REQUIREMENT: EACH heading title MUST contain at least ONE core keyword from the source URL or topic (각 소제목에는 반드시 핵심 키워드가 포함되어야 함)
    - ⚠️ ABSOLUTE REQUIREMENT: When generating from URL, extract core keywords from the URL/topic and include them in the heading titles (URL로 글 생성 시, URL/주제에서 핵심 키워드를 추출하여 소제목에 반드시 포함)
    - ⚠️ PURPOSE: This ensures SEO optimization AND makes it easier to collect relevant images for each heading (SEO 최적화 및 각 소제목에 맞는 이미지 수집을 위해 필수)
    - ⚠️ GOOD EXAMPLES:
      * Topic: "코스트코 재구매템" → Headings: "코스트코 카이막 치즈, 왜 자꾸 손이 갈까?", "코스트코 아보카도 오일, 튀김 요리에도 안심?"
      * Topic: "바디프랜드 팔콘S 안마의자" → Headings: "바디프랜드 팔콘S, 전연가죽의 프리미엄 촉감", "팔콘S 안마의자, 4D 롤러의 차별화"
      * Topic: "드리미 로봇청소기" → Headings: "드리미 매트릭스10, 자동 물걸레 교체의 혁신", "드리미 로봇청소기, 3개월 사용 후 솔직 후기"
    - ⚠️ BAD EXAMPLES (키워드 없음):
      * "왜 자꾸 손이 갈까?" (코스트코 누락) ❌
      * "전연가죽의 프리미엄 촉감" (제품명 누락) ❌
      * "자동 물걸레 교체의 혁신" (브랜드명 누락) ❌
    - Each heading should contain a search keyword naturally (소제목에 키워드 활용 필수)
  * Use question format for some headings: "~는 무엇일까요?", "~어떻게 해야 할까요?", "~왜 그랬을까요?"
  * Create curiosity gaps: Headings that make readers want to know more
  * Vary heading styles: Mix questions, statements, and "how-to" formats
  * Ensure headings are scannable: Readers should understand the article structure at a glance
  * 단락 명확히 구분: 각 소제목은 명확한 단락 구분 역할
  * 라벨링 기법 활용: 소제목으로 내용의 구조를 명확히 표시
  * ⚠️ AVOID VAGUE HEADINGS: Never use overly poetic or abstract headings that don't convey clear information
- ⚠️⚠️⚠️ CRITICAL BODY STRUCTURE - ABSOLUTE REQUIREMENT (MANDATORY):
  * ⚠️ ABSOLUTE REQUIREMENT: The bodyPlain MUST be a complete, well-structured article that covers ALL headings in the headings array
  * ⚠️ ABSOLUTE REQUIREMENT: For EACH heading in the headings array, write detailed body content (minimum 500-700 Korean characters per heading for 30s target age, 400-500 characters for other ages)
  * ⚠️ ABSOLUTE REQUIREMENT: Each heading section MUST start with the EXACT heading title followed by a colon (:)
  * ⚠️ ABSOLUTE REQUIREMENT: If ANY heading is missing from bodyPlain, the ENTIRE content will be REJECTED and you will need to regenerate
  * ⚠️ ABSOLUTE REQUIREMENT: DO NOT skip any heading - ALL headings MUST appear in bodyPlain
  * ⚠️ ABSOLUTE REQUIREMENT: DO NOT create content for headings that are not in the headings array
  * ⚠️ ABSOLUTE REQUIREMENT: Each section should be substantial and informative, not superficial
  * ⚠️ VERIFICATION CHECKLIST (MANDATORY - Check before finishing):
    [ ] Count the headings in the headings array
    [ ] Count how many headings appear in bodyPlain
    [ ] Verify that ALL headings from the array appear in bodyPlain
    [ ] Verify that each heading appears EXACTLY ONCE in bodyPlain
    [ ] Verify that headings appear in the SAME ORDER as in the array
- ⚠️⚠️⚠️ CRITICAL HEADING MARKERS - ABSOLUTE REQUIREMENT (MANDATORY):
  * ⚠️ ABSOLUTE REQUIREMENT: You MUST include EVERY heading title EXACTLY ONCE in bodyPlain text
  * ⚠️ ABSOLUTE REQUIREMENT: Start each section in bodyPlain with the EXACT heading title followed by a colon (:)
  * ⚠️ ABSOLUTE REQUIREMENT: Each heading title MUST appear in bodyPlain in the SAME ORDER as in the headings array
  * ⚠️ ABSOLUTE REQUIREMENT: If a heading title is missing from bodyPlain, the content will be REJECTED
  * Example format (MANDATORY) - USE ACTUAL HEADING TITLES, NOT LABELS:
    ⚠️ WRONG: "첫 번째 소제목: 내용..." ❌ DO NOT USE THIS FORMAT
    ⚠️ WRONG: "두 번째 소제목: 내용..." ❌ DO NOT USE THIS FORMAT
    ✅ CORRECT: "[실제 소제목 제목]: 내용..." - Use the EXACT heading title from the headings array
  * ⚠️ REAL EXAMPLE (MANDATORY FORMAT):
    If headings array is: ["왜 드리미를 선택했을까?", "자동 물걸레 교체의 혁신", "3개월 사용 후기"]
    Then bodyPlain MUST start with:
    "왜 드리미를 선택했을까?: 여기에 선택 이유에 대한 내용..."
    "자동 물걸레 교체의 혁신: 여기에 자동 물걸레 교체 기능에 대한 내용..."
    "3개월 사용 후기: 여기에 3개월 사용 후기 내용..."
  * ⚠️ ABSOLUTE REQUIREMENT: The EXACT heading title (including punctuation, emojis, colons) MUST appear in bodyPlain
  * ⚠️ ABSOLUTE REQUIREMENT: DO NOT modify the heading title when including it in bodyPlain
  * ⚠️ ABSOLUTE REQUIREMENT: DO NOT use a shortened or paraphrased version of the heading title
  * ⚠️ ABSOLUTE REQUIREMENT: Use each heading title EXACTLY ONCE in bodyPlain (no more, no less)
  * ⚠️ ABSOLUTE REQUIREMENT: After writing content for one heading, immediately move to the NEXT heading
  * ⚠️ ABSOLUTE REQUIREMENT: DO NOT skip any heading - ALL headings MUST appear in bodyPlain
  * ⚠️ ABSOLUTE REQUIREMENT: DO NOT go back to previous headings
  * ⚠️ ABSOLUTE REQUIREMENT: DO NOT repeat any heading content
  * ⚠️ ABSOLUTE REQUIREMENT: DO NOT create new headings that are not in the headings array
  * ⚠️ VERIFICATION CHECKLIST (MANDATORY - Check before finishing):
    [ ] Every heading in the headings array appears EXACTLY ONCE in bodyPlain
    [ ] Headings appear in the SAME ORDER as in the headings array
    [ ] Each heading is followed by a colon (:) and then its content
    [ ] No heading is missing from bodyPlain
    [ ] No heading appears more than once in bodyPlain
- The bodyPlain should be written in a natural flow: engaging introduction with a hook, then body sections corresponding to each heading, and a warm conclusion that invites action or reflection.
- Structure: The bodyPlain should seamlessly integrate content for each heading. Write the body content in the same order as the headings array. Each heading section should be substantial (300-400+ characters) and deeply explore the topic with:
  * Opening sentence that connects to previous section or introduces the new topic
  * 2-3 detailed paragraphs explaining the concept
  * ⚠️ PARAGRAPH STRUCTURE (CRITICAL - MUST VARY LENGTHS):
    - DO NOT make all paragraphs the same length (3-5 sentences each)
    - Vary paragraph lengths naturally: 20% should be 1-line emphasis sentences or questions, 30% should be 2-3 lines (concise info), 35% should be 4-5 lines (normal explanation), 15% should be 6-8 lines (detailed context)
    - Examples of 1-line paragraphs: "정말 충격적이지 않나요?", "이 부분이 가장 중요해요!", "과연 진실은 무엇일까요?"
    - After important information, add a 1-line emphasis sentence
    - Include 1-2 question-form sentences per heading section: "~하지 않나요?", "~일까요?", "~해보세요!"
    - If a sentence is too long (over 25 characters), split it into 2 shorter sentences for better readability
    - Create natural rhythm: long paragraph → short paragraph → 1-line impact pattern
  * ⚠️ CRITICAL PARAGRAPH BREAKS IN bodyPlain (MUST FOLLOW):
    - In bodyPlain, you MUST separate paragraphs with double newline (\\n\\n)
    - CORRECT format: "첫번째 문단입니다.\\n\\n두번째 문단입니다.\\n\\n세번째 문단입니다."
    - WRONG format: "첫번째 문단입니다. 두번째 문단입니다. 세번째 문단입니다." (no breaks)
    - Each logical paragraph MUST be followed by \\n\\n
    - Do NOT use period followed by space ". " as paragraph separator - use \\n\\n instead
    - Every 3-5 sentences should have a paragraph break (\\n\\n)
    - Visual structure is critical for readability on Naver Blog
  * Specific examples, anecdotes, or data when relevant
  * Transition to next section
- The bodyPlain should flow naturally from heading to heading, with each section building on the previous one. Use connecting phrases like "이제", "다음으로", "또한", "특히" to create smooth transitions.
- ⚠️ CRITICAL: STRICT STRUCTURE COMPLIANCE - You MUST follow this structure EXACTLY:
  * 1. Introduction/Opening (first heading section) - Hook and topic introduction
    - ⚠️ INTRODUCTION RULES (CRITICAL):
      * START with the main event/topic directly (사건/주제 바로 시작)
      * ⚠️ ABSOLUTELY FORBIDDEN: DO NOT repeat the article title in bodyPlain
      * ⚠️ ABSOLUTELY FORBIDDEN: DO NOT start bodyPlain with the exact same text as the title
      * ⚠️ ABSOLUTELY FORBIDDEN: DO NOT use the title as the first sentence or paragraph
      * BAD EXAMPLE: Title: "네이버 브랜드 커넥트, 숨겨진 5가지 활용법!" → Body: "네이버 브랜드 커넥트, 숨겨진 5가지 활용법! 지금 바로 확인하세요: 네이버 브랜드 커넥트는..." ❌
      * GOOD EXAMPLE: Title: "네이버 브랜드 커넥트, 숨겨진 5가지 활용법!" → Body: "네이버 브랜드 커넥트는 많은 사업자와 마케터들이 활용하고 있는 강력한 도구입니다. 하지만 숨겨진 기능과 활용법을 제대로 알지 못하면..." ✅
      * DO NOT add premature conclusions or reflections in the intro
      * DO NOT use phrases like "이번 사건, 정말 충격적이지 않나요?" in the intro (save for conclusion)
      * DO NOT use "그래도 힘내시길 응원하며" or similar closing remarks in the intro
      * DO NOT use "앞으로의 활동도 기대하겠습니다" in the intro (save for conclusion)
      * BAD INTRO EXAMPLE: "배우 이이경 씨가 고소했다는 소식! 이번 사건, 정말 충격적이지 않나요? 😔 그래도 힘내시길 응원하며, 앞으로의 활동도 기대하겠습니다! 🙌" ❌
      * GOOD INTRO EXAMPLE: "배우 이이경 씨가 사생활 루머를 퍼뜨린 A씨를 고소했습니다. 이번 고소 배경에는 최근 하차한 MBC 예능 '놀면 뭐하니?'에 대한 원망이 담겨 있어 더욱 파장이 예상됩니다." ✅
      * Keep intro focused on WHAT happened, not emotional reactions or conclusions
  * 2. Main Content (middle heading sections) - Detailed explanations, examples, analysis
  * 3. Conclusion (last heading section) - Summary, key takeaways, call-to-action${isEntertainmentIssue ? ', and 2-3 additional reflective sentences about the topic\'s significance or implications. Example: "이번 사건을 계기로 온라인 루머의 심각성을 다시 한번 되돌아봐야 할 때입니다." The conclusion should end with these 2-3 reflective sentences that provide deeper meaning or call for reflection' : ''}.
  * 4. STOP IMMEDIATELY after the conclusion - DO NOT add any content after the conclusion
  * 5. DO NOT repeat the introduction or opening hook after the conclusion
  * 6. DO NOT add new questions or topics after the conclusion
  * 7. DO NOT restart the article structure after the conclusion
  * 8. The conclusion must be the FINAL section - nothing comes after it
- ⚠️ CRITICAL: NO REPETITION OR RESTARTING:
  * DO NOT repeat the introduction hook (e.g., "오늘은...", "안녕하세요...") after the conclusion
  * DO NOT add new opening questions (e.g., "여러분은...", "~어떤가요?") after the conclusion
  * DO NOT restart the article with a new topic after the conclusion
  * DO NOT add content that feels like a new article beginning
  * The conclusion is the END - respect the article structure
- Make sure the total bodyPlain length is at least ${minChars} characters. ⚠️ CRITICAL: QUALITY OVER QUANTITY:
  * DO NOT artificially inflate content just to meet character count
  * DO NOT repeat the same information
  * DO NOT add meaningless filler sentences
  * DO prioritize valuable, meaningful information
  * DO add specific examples, case studies, statistics, and practical insights to naturally expand
  * The character count is a MINIMUM TARGET - content quality comes first
  * If you naturally reach ${minChars} characters with valuable content, that's perfect
  * If you need more characters, expand MAIN CONTENT sections (middle headings) with depth and insights, NOT by adding content after the conclusion
- 🎯 키워드 배치 전략 (CRITICAL):
  * 핵심 키워드를 7회 이상 자연스럽게 반복 (과도한 반복은 피함)
  * 첫 문단에 핵심 키워드 삽입 필수
  * ⚠️⚠️⚠️ CRITICAL: 소제목에도 키워드 활용 필수 (각 소제목마다 최소 1개 이상의 핵심 키워드 포함 - SEO 및 이미지 수집 최적화)
  * ⚠️ URL로 글 생성 시: URL/주제에서 추출한 핵심 키워드를 각 소제목 제목에 자연스럽게 포함 (예: 제품명, 브랜드명, 주요 키워드 등)
  * 키워드는 자연스럽게 문맥에 녹여서 사용 (키워드 스터핑 금지)
- ⚠️ CRITICAL HEADING ORDER: You MUST generate headings in sequential order from 1st to last (introduction → main content → conclusion). The first heading should be an introduction or opening topic, middle headings should cover main points, and the last heading should be a conclusion or summary. DO NOT generate headings in reverse order (conclusion first). The headings array MUST follow a logical progression from start to finish.
- ⚠️ CRITICAL HEADING NAMING RULES:
  * ONLY THE LAST HEADING can use conclusion words like: "마무리", "결론", "정리", "요약", "끝으로", "마지막으로"
  * FIRST and MIDDLE HEADINGS (1st to 2nd-to-last) MUST NOT use these conclusion words
  * BAD EXAMPLE: "마무리: 이이경을 향한 응원과 지지" as 2nd or 3rd heading ❌
  * GOOD EXAMPLE: "마무리: 이이경을 향한 응원과 지지" ONLY as the LAST heading ✅
  * INSTEAD, use descriptive headings for middle sections:
    - "이이경의 향후 활동 계획과 팬들의 응원"
    - "이이경에게 쏟아지는 지지와 응원의 목소리"
    - "사건 이후 이이경의 입장과 팬들의 반응"
- ⚠️⚠️⚠️ STEP-BY-STEP WRITING (MANDATORY - MUST FOLLOW EXACTLY):
  * ⚠️ CRITICAL: You MUST write headings in sequential order from FIRST to LAST
  * ⚠️ CRITICAL: Write each heading section EXACTLY ONCE, then immediately move to the next
  * 
  * STEP 1: Write \"[ACTUAL 1ST HEADING TITLE FROM ARRAY]: [content]\" → STOP → Move to STEP 2
  * STEP 2: Write \"[ACTUAL 2ND HEADING TITLE FROM ARRAY]: [content]\" → STOP → Move to STEP 3
  * STEP 3: Write \"[ACTUAL 3RD HEADING TITLE FROM ARRAY]: [content]\" → STOP → Move to STEP 4
  * Continue this pattern until ALL headings are written EXACTLY ONCE
  * ⚠️ CRITICAL: USE THE EXACT HEADING TITLE from headings array, NOT generic labels like \"첫 번째 소제목\" or \"두 번째 소제목\"

  * 
  * ⚠️ ABSOLUTELY FORBIDDEN:
  * ❌ DO NOT write the same heading title twice (even if content is different)
  * ❌ DO NOT go back to previous headings after moving forward
  * ❌ DO NOT write heading 1, then heading 2, then heading 1 again
  * ❌ DO NOT write conclusion heading in the middle (only at the end)
  * ❌ DO NOT repeat any heading section (each heading appears EXACTLY ONCE in bodyPlain)
  * 
  * ⚠️ VERIFICATION BEFORE OUTPUT:
  * Before finishing, count how many times each heading appears in bodyPlain
  * Each heading MUST appear EXACTLY ONCE (not 0 times, not 2+ times)
  * If any heading appears more than once, you MUST fix it before outputting
  * 
  * ⚠️ HEADING ORDER RULES:
  * - First heading: Introduction/Opening (서론)
  * - Middle headings: Main content (본문) - each covers a DIFFERENT aspect
  * - Last heading: Conclusion (결론) - MUST be the final heading
  * - DO NOT put conclusion words ("마무리", "결론") in middle headings
  * - DO NOT write headings in reverse order (conclusion first)
  * 
  * ⚠️ CONTENT RULES:
  * - Each heading MUST cover a DIFFERENT aspect of the topic
  * - If you already discussed a topic in one heading, DO NOT discuss it again in another heading
  * - Each heading should introduce NEW information, not repeat previous content
  * - Avoid repeating the same facts, quotes, or arguments across different headings
- ⚠️ CRITICAL: CONCLUSION IS THE END - The last heading in the headings array MUST be a conclusion. The conclusion section MUST include:
  * Summary and key takeaways
  * Natural ending that feels complete
  ${isEntertainmentIssue ? '* 1-2 brief reflective sentences about the topic\n  * After these sentences, you MUST STOP immediately.' : '* After the conclusion, you MUST STOP immediately.'} 
  * ⚠️ FORBIDDEN AFTER CONCLUSION:
    - NO generic questions, CTAs, engagement prompts, subscription prompts
    - NO "도움이 되었으면 좋겠습니다", "도움이 되셧으면 좋겠습니다", "도움이 되셨으면 좋겠습니다", "참고하시길 바랍니다" or similar closing phrases (ABSOLUTELY FORBIDDEN - DO NOT USE AT ALL - NO VARIATIONS ALLOWED)
    - NO "함께 응원해요", "화이팅", "응원합니다" or similar phrases (ABSOLUTELY FORBIDDEN)
    - NO repeating the same closing message
    - NO emoji spam repeated multiple times (MAX 1-2 emojis in entire conclusion, or NONE)
    - NO "다음에 또 만나요" or similar farewell phrases
    - NO rhetorical questions like "~일까요?", "~아시나요?", "~생각해보신 적 있으신가요?" in conclusion
    - NO "🤔", "🙏", "🍀", "🔥", "🌟" or similar emojis repeated multiple times
  * The conclusion MUST appear EXACTLY ONCE. After writing the conclusion, STOP immediately. DO NOT add any additional content.
  * ⚠️ CRITICAL: Conclusion should be a natural, brief summary (2-3 sentences MAX). NO questions, NO emojis, NO closing phrases.
- ⚠️ 최종 검증 항목 (ALL MUST PASS):
  * AI 탐지 회피: 자연스러운 문체, 인간적인 표현, 반복 패턴 회피
  * 독창성: 단순 복사가 아닌 고유한 관점과 분석
  * 법적 안전성: 과대광고, 의료/투자 권유, 명예훼손 등 법적 위험 요소 없음
  * 독자 만족도: 실용적이고 유용한 정보 제공, 감정적 공감대 형성
  * 알고리즘 최적화: 키워드 배치, 체류시간, 참여도 모두 최적화
  * 위 모든 항목을 통과해야 게시 적합
- ⚠️ IMPORTANT: Do NOT include literal escape sequences (\\n, \\t, \\r) in the bodyPlain or bodyHtml. Use actual newlines, spaces, and natural formatting instead.
- ⚠️ PROMPT COMPLIANCE: Follow all instructions above. Every heading MUST have corresponding body content. Target ${minChars} characters.
- ⚠️ CRITICAL JSON FORMAT: You MUST output valid JSON. 
  * Every array element MUST be followed by a comma (except the last one before ]).
  * Every object property value MUST be followed by a comma (except the last one before }).
  * Example: ["item1", "item2", "item3"] - note commas after item1 and item2, but NOT after item3.
  * Example: {"key1": "value1", "key2": "value2"} - note commas after value1, but NOT after value2.
  * Missing commas will cause parsing errors. Double-check your JSON syntax before outputting.
  * Test your JSON with a JSON validator if possible.
- Hashtags: 5개 이내 (CRITICAL - 과도한 태그는 역효과). 주요 키워드 우선 배치, 연관 키워드 포함, 일관성 유지.
- 🎯 HASHTAG STRATEGY FOR EXPOSURE (MANDATORY - MUST GENERATE HASHTAGS):
  * ⚠️ CRITICAL: You MUST ALWAYS generate hashtags in the "hashtags" array field, regardless of target age group
  * 5개 이내로 제한 (너무 많으면 역효과)
  * 주요 키워드를 가장 앞에 배치
  * 연관 키워드 포함 (검색 확장성)
  * 일관성 유지 (콘텐츠 주제와 일치)
  * Include question-form hashtags: "#~하는법", "#~어떻게", "#~궁금증"
  * Mix high-volume trending tags with niche tags
  * Use seasonal/trending keywords when relevant
  * 🎯 TARGET AGE-SPECIFIC HASHTAG STRATEGY:
    - 20s: 젊은 세대 관심사, 트렌디한 키워드, SNS 유행어 포함
    - 30s: 실용적 정보, 라이프스타일, 취업/결혼/육아 관련 키워드
    - 40s: 건강, 재테크, 자녀교육, 중년 관심사 키워드
    - 50s: 건강관리, 여행, 취미, 노후준비 관련 키워드
    - all: 모든 연령대에 공통적으로 관심 있는 범용 키워드
  * ⚠️ MANDATORY: The hashtags array MUST contain at least 3-5 relevant hashtags. Do NOT leave it empty.
- Image prompts must be English, describing DSLR realism, natural lighting, premium aesthetic.
- ⚠️ CRITICAL IMAGE PROMPT SAFETY: Image prompts MUST avoid any negative or potentially sensitive keywords that could trigger content policy violations:
  * DO NOT include: medical terms (hospital, injury, disease, pain, sick, hurt, bruised, wound), negative emotions (sad, angry, stressed, tired), violence-related terms
  * DO use: positive, safe, everyday scenarios (daily life, healthy lifestyle, professional work, positive activities, natural settings, calm environments)
  * Transform negative concepts to positive ones: "injured" → "healthy", "hospital" → "home", "sick" → "wellness", "pain" → "comfort"
  * When generating image prompts from headings, focus on the positive aspects, solutions, or general themes rather than problems or negative situations
  * Example: Instead of "injured person in hospital", use "healthy person in daily life" or "wellness and care at home"
- Publish time should be in KST (UTC+9) formatted "YYYY-MM-DD HH:mm:ss".
- If productInfo is provided, weave tangible product details, specs, pros/cons, and purchasing insight.
- If personalExperience is provided, blend it naturally as a first-person anecdote to build trust.
- Fill viralHooks, trafficStrategy, postPublishActions, and estimatedEngagement with concrete, high-quality data.
- 🎯 CTA (Call-to-Action) 자동 생성 (MANDATORY):
  * 콘텐츠 주제와 내용에 맞는 CTA 텍스트를 자동으로 생성
  * CTA 텍스트 예시: "더 알아보기", "자세히 보기", "구매하기", "예약하기", "문의하기", "다운로드하기", "무료 체험하기" 등
  * 콘텐츠 유형에 맞게 적절한 CTA 선택:
    - 제품 리뷰/쇼핑: "구매하기", "자세히 보기", "할인 받기"
    - 정보/가이드: "더 알아보기", "자세히 보기", "관련 글 보기"
    - 서비스/교육: "무료 체험하기", "문의하기", "예약하기"
    - 다운로드/도구: "다운로드하기", "무료 사용하기", "시작하기"
  * CTA 링크는 선택사항 (URL이 있으면 포함, 없으면 text만 생성)
  * 네이버 블로그는 HTML 버튼이 안되므로 텍스트 링크로 삽입됨
  * "cta" 필드에 {"text": "CTA 텍스트", "link": "URL (선택사항)"} 형식으로 포함
- ⚠️ CRITICAL CONTENT QUALITY: The bodyPlain MUST be professional, informative, and naturally flowing:
  * ❌ FORBIDDEN IN BODY TEXT:
    - Generic engagement prompts, share prompts, bookmark/subscribe prompts
    - Artificial call-to-action phrases that break natural flow
  * ✅ FOCUS ON:
    - Deep, informative content with specific facts, data, examples, and insights
    - Natural storytelling and professional tone
  * ⚠️ CONCLUSION: The conclusion section (last heading) MUST be brief and natural (2-3 sentences MAX)
  * ⚠️ CRITICAL: DO NOT use closing phrases like "도움이 되었으면 좋겠습니다", "도움이 되셧으면 좋겠습니다", "도움이 되셨으면 좋겠습니다", "참고하시길 바랍니다", "이 정보가 도움이 되셨기를 바랍니다" - ABSOLUTELY FORBIDDEN - NO VARIATIONS ALLOWED
  * ⚠️ CRITICAL: DO NOT include rhetorical questions in conclusion ("~일까요?", "~아시나요?", "~생각해보신 적 있으신가요?")
  * ⚠️ CRITICAL: DO NOT repeat the same closing message. Write the conclusion ONCE and STOP immediately.
  * ⚠️ CRITICAL: DO NOT use emojis in conclusion (or MAX 1 emoji if absolutely necessary, but NONE is preferred)
  * Comment triggers should ONLY be in metadata fields, NOT in bodyPlain content
- Shareable quote should be irresistible for social sharing (short, emotional, curiosity-driven, 20-40 characters).
  * 🎯 SHARE OPTIMIZATION: Quote should be quotable, relatable, and make readers want to share with friends
  * Include in the middle of content (not just at the end) for better viral potential
  * 메타 설명 최적화: 핵심 내용을 간결하게 요약, 키워드 포함, 클릭 유도 문구 포함
- Retention hook must invite readers to return or engage, but WITHOUT making specific promises about future posts you may not write.
  * 🎯 RETENTION OPTIMIZATION (Flexible, no false promises):
    - Use open-ended invitations: "관련 주제에 대해 더 알고 싶으시다면 북마크 해두시면 좋아요", "이런 내용이 궁금하시다면 다른 글도 확인해보세요"
    - Encourage bookmarking: "나중에 참고하실 수 있도록 북마크 해두시면 좋아요", "필요할 때 다시 찾아보시면 도움이 될 거예요"
    - Invite engagement: "비슷한 경험이나 다른 관점이 있으시다면 댓글로 공유해주세요", "궁금한 점이 있으시면 언제든 댓글 남겨주세요"
    - Create value without promises: "이런 주제로도 생각해볼 수 있겠네요", "관련해서 더 알아보고 싶은 부분이 있으시면 알려주세요"
    - DO NOT promise specific future content unless you're actually planning a series
- ✨ EEAT (Experience, Expertise, Authoritativeness, Trustworthiness) 믹싱:
  * Experience (경험): 실제 경험담, 구체적인 사용 시나리오, 개인적 에피소드 자연스럽게 포함
  * Expertise (전문성): 관련 지식, 통계, 전문가 인용, 검증된 정보 제시
  * Authoritativeness (권위): 신뢰할 수 있는 출처, 공식 데이터, 객관적 사실 기반
  * Trustworthiness (신뢰성): 솔직한 평가, 장단점 균형, 과장 없는 표현
  * 자연스럽게 EEAT 요소를 녹여내되, 억지스럽지 않게 작성

- ✨ CONTENT ENHANCEMENT TIPS FOR HOME FEED EXPOSURE:
  * Start with a compelling hook: surprising fact, relatable question, or intriguing statement (first 3 sentences determine if readers continue)
  * Use storytelling elements: "예전에", "최근에", "한 번은" to share anecdotes (increases engagement time)
  * Include actionable insights: "~해보세요", "~추천드려요", "~주의하세요" (encourages bookmarking)
  * Add depth with comparisons: "~와 달리", "~와 비슷하게", "~와 비교하면" (increases read time)
  * Use emphasis strategically: "정말로", "실제로", "특히", "꼭", "반드시" (highlights key points)
  * Create anticipation: "이제", "곧", "다음으로" to guide readers through the content (reduces bounce rate)
  * End sections with value: Each section should leave readers with something useful or thought-provoking (increases scroll depth)
  * 🎯 ENGAGEMENT OPTIMIZATION:
    - Place engagement questions at strategic points (after 30%, 60%, 90% of content)
    - Use "공감하시나요?", "어떻게 생각하시나요?" to encourage comments
    - Include shareable quotes that readers want to repost
    - Create "bookmark value" by providing actionable checklists or summaries
    - End with a call-to-action: "다음 글도 기대해주세요", "댓글로 의견 남겨주세요"

- ⚠️ CRITICAL: 과대광고 & 심의필 주의 (자연스럽고 부드러운 표현 사용):
  * 극단적 표현 피하기: "만족스러운", "추천할 만한", "개인적으로는", "제 기준으로는" 등 사용
  * 의료/건강: "참고 정보", "개인 경험", "전문가 상담 권장"
  * 금융/투자: "참고 정보", "개인 의견", "신중한 판단 필요"
  * 제품 리뷰: "개인적 경험", "참고만 하시면", 객관적 정보 제공에 집중

${isTravel ? `
🌏 여행 콘텐츠 최적화 (CRITICAL):
- EEAT 강화: 직접 방문 경험, 여행 시기, 구체적인 일정과 비용
- 실용 정보: 교통편, 숙소, 맛집, 예산, 팁
- 비포/애프터: 계획 vs 실제, 예상 vs 현실
- 사진/장소: 구체적 위치, 가는 법, 운영시간
- 계절/시기: 언제 가면 좋은지, 피해야 할 시기
- 과대광고 필터: "최고의 여행지" 대신 "추천할 만한 여행지"
` : ''}

${isFood ? `
🍽️ 음식/맛집 콘텐츠 최적화 (CRITICAL):
- EEAT 강화: 직접 방문, 메뉴 선택, 맛 평가, 재방문 의사
- 구체 정보: 위치, 가격, 영업시간, 주차, 웨이팅
- 맛 표현: 추상적 표현 지양, 구체적 맛 묘사
- 메뉴 추천: 시그니처, 가성비, 조합
- 분위기: 데이트/가족/혼밥 적합도
- 과대광고 필터: "최고의 맛집" 대신 "만족스러운 맛집"
` : ''}

${isFashion ? `
👗 패션/뷰티 콘텐츠 최적화 (CRITICAL):
- EEAT 강화: 실제 착용/사용, 피부타입/체형별 후기
- 코디 제안: 스타일링 팁, 조합 추천
- 가격대: 합리적 가격인지, 세일 정보
- 시즌: 계절별 활용도
- 비교: 유사 제품과의 차이점
- 과대광고 필터: "완벽한 스타일" 대신 "잘 어울리는 스타일"
` : ''}

${isInterior ? `
🏠 인테리어/리빙 콘텐츠 최적화 (CRITICAL):
- EEAT 강화: 직접 시공/DIY 경험, 실패담 포함
- 실용 정보: 예산, 소요시간, 난이도, 재료
- 비포/애프터: 변화 과정 상세히
- 공간 정보: 평수, 구조, 채광
- 제품 정보: 구매처, 가격, 품질
- 과대광고 필터: "완벽한 인테리어" 대신 "만족스러운 인테리어"
` : ''}

${isPet ? `
🐶 반려동물 콘텐츠 최적화 (CRITICAL):
- EEAT 강화: 반려동물 정보(종류/나이/성격), 사용 기간
- 안전성: 성분, 부작용, 수의사 상담 권장
- 실제 반응: 우리 아이 반응, 기호도
- 주의사항: 알레르기, 특정 품종 주의점
- 가성비: 용량 대비 가격, 대용량 구매 팁
- 과대광고 필터: "최고의 사료" 대신 "우리 아이에게 맞는 사료"
` : ''}

${isCar ? `
🚗 자동차 콘텐츠 최적화 (CRITICAL):
- EEAT 강화: 실제 소유/시승 경험, 주행거리, 유지비
- 스펙 정보: 연비, 성능, 옵션
- 실사용: 일상 사용 후기, 장단점
- 비교: 경쟁 차종과의 비교
- 구매 팁: 가격 협상, 할인, 시기
- 과대광고 필터: "최고의 차" 대신 "가성비 좋은 차"
` : ''}

SOURCE CONTEXT:
${metaLines}

🌸 계절 최적화:
- 현재 계절: ${getCurrentSeason().season}
- 계절 키워드: ${getCurrentSeason().keywords.join(', ')}

🔗 연관 키워드 (자연스럽게 포함):
- ${getRelatedKeywords(source.categoryHint || '기타').slice(0, 5).join(', ')}

⚠️⚠️⚠️ CRITICAL: TITLE REPETITION ABSOLUTELY FORBIDDEN ⚠️⚠️⚠️
- The RAW TEXT below may contain the article title
- ⚠️ ABSOLUTELY FORBIDDEN: DO NOT copy the title from RAW TEXT into bodyPlain
- ⚠️ ABSOLUTELY FORBIDDEN: DO NOT start bodyPlain with the same text as the title
- ⚠️ ABSOLUTELY FORBIDDEN: DO NOT repeat the title in the first paragraph
- The title is already in the "selectedTitle" field - DO NOT repeat it in bodyPlain
- Start bodyPlain with NEW content that expands on the title, NOT by repeating the title
- Example: If title is "네이버 브랜드 커넥트, 숨겨진 5가지 활용법!", start bodyPlain with "네이버 브랜드 커넥트는..." NOT "네이버 브랜드 커넥트, 숨겨진 5가지 활용법! 지금 바로 확인하세요:"

RAW TEXT (verbatim for reference):
${source.rawText}
`;

  // ✅ [PROMPT CACHE] Store only the reusable template, NEVER post-specific metadata
  templateCache.set(cacheKey, { prompt: finalTemplate, timestamp: Date.now() });
  console.log(`[템플릿 캐시] 저장 완료: ${cacheKey}`);

  const finalPrompt = `
${finalTemplate}

SOURCE CONTEXT:
    ${metaLines}
      `;

  return finalPrompt;
}

// JSON 파싱 함수는 jsonParser.ts로 이동

function characterCount(text: string | undefined, minChars: number): number {
  if (!text) return 0;
  // HTML 태그 제거 후 순수 텍스트 글자수만 계산
  const stripHtmlTags = (html: string): string => {
    let plainText = html.replace(/<[^>]*>/g, '');
    // HTML 엔티티 디코딩
    plainText = plainText.replace(/&nbsp;/g, ' ');
    plainText = plainText.replace(/&lt;/g, '<');
    plainText = plainText.replace(/&gt;/g, '>');
    plainText = plainText.replace(/&amp;/g, '&');
    plainText = plainText.replace(/&quot;/g, '"');
    plainText = plainText.replace(/&#39;/g, "'");
    return plainText;
  };
  const plainText = stripHtmlTags(text);
  return plainText.replace(/\s+/g, '').length;
}

/**
 * 중복 소제목 제거 함수
 * AI가 같은 소제목을 여러 번 반복하는 경우 자동으로 제거
 */
function removeDuplicateHeadings(bodyPlain: string, headings: HeadingPlan[]): string {
  if (!bodyPlain || !headings || headings.length === 0) return bodyPlain;

  let cleaned = bodyPlain;

  // 각 소제목에 대해 중복 제거
  headings.forEach(heading => {
    const headingTitle = heading.title;

    // 소제목이 본문에 몇 번 등장하는지 확인
    const regex = new RegExp(headingTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = cleaned.match(regex);

    if (matches && matches.length > 1) {
      console.warn(`[중복 소제목 감지]"${headingTitle}"이(가) ${matches.length}번 반복됨.첫 번째만 유지합니다.`);

      // 첫 번째 등장 위치 찾기
      const firstIndex = cleaned.indexOf(headingTitle);

      // 첫 번째 이후의 모든 등장을 제거
      let firstOccurrenceFound = false;
      cleaned = cleaned.replace(regex, (match, offset) => {
        if (!firstOccurrenceFound && offset === firstIndex) {
          firstOccurrenceFound = true;
          return match; // 첫 번째는 유지
        }

        // 두 번째 이후는 제거
        // 소제목 뒤의 콜론(:)과 내용도 함께 제거 (다음 소제목 또는 문단 끝까지)
        const afterMatch = cleaned.substring(offset);
        const nextHeadingMatch = afterMatch.match(/\n\n[^\n:]+:/);

        if (nextHeadingMatch) {
          // 다음 소제목까지의 내용 제거
          const lengthToRemove = nextHeadingMatch.index || 0;
          // 제거할 내용을 빈 문자열로 대체 (나중에 처리)
          return '[[REMOVE_DUPLICATE]]';
        }

        return '[[REMOVE_DUPLICATE]]';
      });

      // [[REMOVE_DUPLICATE]] 마커와 그 뒤의 내용을 제거
      cleaned = cleaned.replace(/\[\[REMOVE_DUPLICATE\]\][^\n]*(?:\n(?!\n)[^\n]*)*\n\n/g, '');
      cleaned = cleaned.replace(/\[\[REMOVE_DUPLICATE\]\][^\n]*(?:\n(?!\n)[^\n]*)*$/g, '');
    }
  });

  // 추가: 유사한 내용이 반복되는 경우 감지 및 제거 (전체 본문에 대해)
  // 같은 키워드나 문구가 여러 번 반복되는 패턴 감지
  const paragraphs = cleaned.split(/\n\n+/);
  const seenParagraphs = new Set<string>();
  const uniqueParagraphs: string[] = [];

  // 마무리 문구 패턴 (반복 제거 대상)
  const closingPatterns = [
    // ✅ "도움이 되었으면" 모든 변형 제거 (오타 포함)
    /도움이\s*되(었|셧|셨)으면\s*좋겠(습니다|어요|다)/gi,
    /도움이\s*되(었|셧|셨)으면\s*(합니다|해요|한다)/gi,
    /도움이\s*되(었|셧|셨)으면/gi,
    /도움이\s*되(었|셧|셨)기를\s*바랍니다/gi,
    /이\s*정보가\s*도움이\s*되(었|셧|셨)기를\s*바랍니다/gi,
    /도움이\s*되었으면\s*좋겠습니다/gi,
    /참고하시길\s*바랍니다/gi,
    /함께\s*응원해요/gi,
    /화이팅/gi,
    /응원합니다/gi,
    /다음에\s*또\s*만나요/gi,
    /다음에\s*또\s*봬요/gi,
    /글을\s*마무리하겠습니다/gi,
    /글을\s*마칩니다/gi,
    /마무리하겠습니다/gi,
    /마무리합니다/gi,
    /기대하며\s*글을/gi,
    /기대하며\s*마무리/gi,
    /기대하며\s*마칩니다/gi,
    /승리를\s*기대하며/gi,
    /활약을\s*기대하며/gi,
    // ✅ 형식적 마무리 문구 패턴 추가 (반복 제거)
    /앞으로의\s*전개를\s*지켜봐야겠습니다/gi,
    /앞으로\s*어떻게\s*전개될지\s*지켜봐야겠습니다/gi,
    /이\s*정도\s*기대.*괜찮겠죠/gi,
    /사건의\s*진상이\s*명확히\s*밝혀지길\s*기대합니다/gi,
    /이번\s*사건이\s*좋은\s*방향으로\s*해결되길\s*바랍니다/gi,
    /이번\s*사건이\s*좋은\s*방향으로\s*해결되길\s*기대합니다/gi,
    /지켜봐야겠습니다/gi,
    /기대됩니다/gi,
    /기대해봅니다/gi,
    /기대해봐야겠습니다/gi,
    /이번\s*사건의\s*진실이\s*밝혀지길\s*바랍니다/gi,
    /앞으로의\s*전개를\s*주목해야겠습니다/gi,
    // ✅ 불필요한 투자/재테크 관련 문구 제거
    /리스크\s*관리를\s*철저히\s*하시길\s*바랍니다/gi,
    /현명한\s*투자\s*결정\s*하시길\s*바랍니다/gi,
    /투자는\s*신중한\s*판단이\s*필요합니다/gi,
    /신중한\s*투자\s*결정에\s*도움이\s*되길\s*바랍니다/gi,
    /재테크에\s*도움이\s*되었으면\s*좋겠습니다/gi,
    /재태크에\s*도움되셧으면\s*좋겠습니다/gi,
    /재태크에\s*도움이\s*되었으면\s*좋겠습니다/gi,
    /재테크에\s*도움되셧으면\s*좋겠습니다/gi,
    // ✅ 플레이스홀더 패턴 제거 (AI가 잘못 생성한 경우)
    /OOO/g,
    /XXX/g,
    /○○○/g,
    /□□□/g,
    /\{키워드\}/g,
    /\{서브키워드\}/g,
    /\{인물명\}/g,
    /\{메인키워드\}/g,
  ];

  // ✅ CTA 텍스트 제거 패턴 (나중에 사용)
  const ctaRemovalPatterns = [
    /🔗\s*더\s*알아보기/gi,
    /더\s*알아보기/gi,
    /🔗\s*관련\s*기사\s*보기/gi,
    /관련\s*기사\s*보기/gi,
    /🔗\s*자세히\s*보기/gi,
    /자세히\s*보기/gi,
  ];

  let closingParagraphFound = false;

  for (const paragraph of paragraphs) {
    const normalized = paragraph.trim().toLowerCase().replace(/\s+/g, ' ');

    // 마무리 문구가 포함된 문단은 한 번만 허용
    const isClosingParagraph = closingPatterns.some(pattern => pattern.test(paragraph));
    if (isClosingParagraph) {
      if (closingParagraphFound) {
        // 이미 마무리 문구가 나왔으면 제거
        console.warn(`[중복 마무리 감지]마무리 문구 반복 제거`);
        continue;
      }
      closingParagraphFound = true;
    }

    // 유사도가 높은 문단 제거 (85% 이상 유사) - 70%에서 85%로 완화
    let isDuplicate = false;
    for (const seen of seenParagraphs) {
      const similarity = calculateSimilarity(normalized, seen);
      if (similarity > 0.85) {
        isDuplicate = true;
        console.warn(`[중복 내용 감지]유사도 ${(similarity * 100).toFixed(1)}% - 중복 문단 제거`);
        break;
      }
    }

    // 같은 문구가 반복되는 경우 감지 (단어 단위)
    const words = normalized.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 10) {
      const uniqueWords = new Set(words);
      const repetitionRatio = uniqueWords.size / words.length;
      if (repetitionRatio < 0.3) {
        // 단어 반복률이 70% 이상이면 중복으로 간주
        isDuplicate = true;
        console.warn(`[단어 반복 감지] 반복률 ${((1 - repetitionRatio) * 100).toFixed(1)}% - 중복 문단 제거`);
      }
    }

    if (!isDuplicate && normalized.length > 20) {
      seenParagraphs.add(normalized);
      uniqueParagraphs.push(paragraph);
    }
  }

  cleaned = uniqueParagraphs.join('\n\n');

  // 마무리 부분의 불필요한 반복 제거 (마지막 1000자 내에서)
  const last1000Chars = cleaned.slice(-1000);
  const sentences = last1000Chars.split(/[.!?。！？]\s*/).filter(s => s.trim().length > 5);
  const uniqueSentences: string[] = [];
  const seenSentences = new Set<string>();

  for (const sentence of sentences) {
    const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s가-힣]/g, '');

    // 마무리 문구가 포함된 문장은 한 번만 허용
    const hasClosingPattern = closingPatterns.some(pattern => pattern.test(sentence));
    if (hasClosingPattern) {
      const patternKey = closingPatterns.find(p => p.test(sentence))?.source || '';
      if (seenSentences.has(`closing_${patternKey} `)) {
        continue; // 이미 같은 마무리 문구가 나왔으면 제거
      }
      seenSentences.add(`closing_${patternKey} `);
    }

    // 유사도가 높은 문장 제거 (60% 이상 유사)
    let isDuplicate = false;
    for (const seen of seenSentences) {
      if (seen.startsWith('closing_')) continue; // 마무리 패턴 키는 제외
      const similarity = calculateSimilarity(normalized, seen);
      if (similarity > 0.6) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate && normalized.length > 5) {
      seenSentences.add(normalized);
      uniqueSentences.push(sentence);
    }
  }

  // 마지막 부분 재구성 (중복 제거된 문장들로)
  if (uniqueSentences.length < sentences.length) {
    const beforeLast1000 = cleaned.slice(0, -1000);
    const reconstructedLast = uniqueSentences.join('. ') + (uniqueSentences.length > 0 ? '.' : '');
    cleaned = beforeLast1000 + reconstructedLast;
    console.warn(`[마무리 반복 제거] ${sentences.length}개 문장 중 ${uniqueSentences.length}개만 유지`);
  }

  // 연속된 동일 문구 제거 (예: "이강인 선수의 활약과 PSG의 승리를 기대하며"가 여러 번 반복)
  const repeatedPhrasePattern = /(.{20,}?)(\s*\1){2,}/g;
  cleaned = cleaned.replace(repeatedPhrasePattern, '$1');

  // ✅ 불필요한 투자/재테크 관련 문구 제거 (본문 중간에서)
  const unwantedPhrases = [
    /리스크\s*관리를\s*철저히\s*하시길\s*바랍니다/gi,
    /현명한\s*투자\s*결정\s*하시길\s*바랍니다/gi,
    /투자는\s*신중한\s*판단이\s*필요합니다/gi,
    /신중한\s*투자\s*결정에\s*도움이\s*되길\s*바랍니다/gi,
    /재테크에\s*도움이\s*되었으면\s*좋겠습니다/gi,
    /재태크에\s*도움되셧으면\s*좋겠습니다/gi,
    /재태크에\s*도움이\s*되었으면\s*좋겠습니다/gi,
    /재테크에\s*도움되셧으면\s*좋겠습니다/gi,
    // ✅ "도움이 되었으면" 모든 변형 제거 (오타 포함)
    /도움이\s*되(었|셧|셨)으면\s*좋겠(습니다|어요|다)/gi,
    /도움이\s*되(었|셧|셨)으면\s*(합니다|해요|한다)/gi,
    /도움이\s*되(었|셧|셨)으면/gi,
    /도움이\s*되(었|셧|셨)기를\s*바랍니다/gi,
    /이\s*정보가\s*도움이\s*되(었|셧|셨)기를\s*바랍니다/gi,
    /참고하시길\s*바랍니다/gi,
    /정보가\s*도움이\s*되었으면\s*좋겠습니다/gi,
    /정보가\s*도움이\s*되셧으면\s*좋겠습니다/gi,
    /정보가\s*도움이\s*되셨으면\s*좋겠습니다/gi,
  ];

  for (const pattern of unwantedPhrases) {
    cleaned = cleaned.replace(pattern, '');
  }

  // ✅ 형식적 마무리 문구 제거 (본문 전체에서)
  const formalClosingPatterns = [
    /앞으로의\s*전개를\s*지켜봐야겠습니다/gi,
    /앞으로\s*어떻게\s*전개될지\s*지켜봐야겠습니다/gi,
    /이\s*정도\s*기대.*괜찮겠죠/gi,
    /사건의\s*진상이\s*명확히\s*밝혀지길\s*기대합니다/gi,
    /이번\s*사건이\s*좋은\s*방향으로\s*해결되길\s*바랍니다/gi,
    /이번\s*사건이\s*좋은\s*방향으로\s*해결되길\s*기대합니다/gi,
    /지켜봐야겠습니다/gi,
    /기대됩니다/gi,
    /기대해봅니다/gi,
    /기대해봐야겠습니다/gi,
    /이번\s*사건의\s*진실이\s*밝혀지길\s*바랍니다/gi,
    /앞으로의\s*전개를\s*주목해야겠습니다/gi,
    // ✅ 플레이스홀더 패턴 제거
    /OOO/g,
    /XXX/g,
    /○○○/g,
    /□□□/g,
  ];

  for (const pattern of formalClosingPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // ✅ CTA 텍스트 제거 (본문 중간에서)
  for (const pattern of ctaRemovalPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 연속된 빈 줄 정리 (3개 이상은 2개로)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * ⚡ 빠른 과대광고 필터링 + 외국어 제거 + CTA 중복 제거 + 내부 세팅 노출 방지
 * AI 응답 받은 후 JavaScript로 자동 필터링
 */
function filterExaggeratedContent(text: string): string {
  if (!text) return text;

  // 🚨 0단계: 내부 세팅/프롬프트 지시문 필터링 (CRITICAL - 글에 노출 방지)
  const internalSettingPatterns: RegExp[] = [
    // ✅ AI 프롬프트 훅/가이드 문구 제거 (가장 중요!)
    /실제\s*경험을\s*바탕으로,?\s*/g,
    /최신\s*연구\s*결과,?\s*/g,
    /비용\s*대비\s*효율을\s*따지면,?\s*/g,
    /실제\s*생활에서는\s*/g,
    /전문가\s*의견에\s*따르면,?\s*/g,
    /업계\s*관계자에\s*따르면,?\s*/g,
    /통계에\s*따르면,?\s*/g,
    /데이터에\s*따르면,?\s*/g,
    /조사\s*결과에\s*따르면,?\s*/g,
    /연구에\s*따르면,?\s*/g,
    // 프롬프트 지시문이 그대로 출력된 경우
    /실제\s*경험처럼\s*작성/g,
    /EEAT\s*(강화|믹싱|적용)/gi,
    /글쓰기\s*스타일\s*(통일|설정|적용)/g,
    /톤\s*:\s*(친근하고|전문적인|정보\s*전달력)/g,
    /표현\s*:\s*["']?[~]?[가-힣]+["']?/g,
    /구조\s*:\s*소제목당/g,
    /목표\s*분량\s*:\s*[\d,]+[~\-][\d,]+자/g,
    /\[?프롬프트\s*(지시|내용|설정)\]?[^\n]*/gi,
    /\[?시스템\s*(메시지|지시)\]?[^\n]*/gi,
    /⚠️\s*CRITICAL[^\n]*/g,
    /⚠️\s*DO\s*NOT[^\n]*/g,
    /⚠️\s*PRIORITY[^\n]*/g,
    /⚠️\s*절대\s*금지[^\n]*/g,
    /✅\s*필수[^\n]*/g,
    /❌\s*(금지|절대\s*금지)[^\n]*/g,
    /ABSOLUTE\s*FORBIDDEN[^\n]*/gi,
    /MANDATORY[^\n]*/gi,
    /QUALITY\s*REQUIREMENT[^\n]*/gi,
    // AI 지시사항 누출
    /\[Note:\s*[^\]]+\]/gi,
    /\[참고:\s*[^\]]+\]/g,
    /\(AI\s*지시[^)]*\)/gi,
    /\(내부\s*설정[^)]*\)/g,
    // 세팅 옵션 값 누출
    /targetAge\s*[:=]\s*['"]?[^'";\n]+['"]?/gi,
    /toneStyle\s*[:=]\s*['"]?[^'";\n]+['"]?/gi,
    /writeStyle\s*[:=]\s*['"]?[^'";\n]+['"]?/gi,
    /experienceStyle\s*[:=]\s*['"]?[^'";\n]+['"]?/gi,
  ];

  let filtered = text;
  for (const pattern of internalSettingPatterns) {
    filtered = filtered.replace(pattern, '');
  }

  // 🚨 1단계: 외국어 문장 제거 (러시아어, 중국어, 일본어 등)
  // 러시아어 키릴 문자 범위: \u0400-\u04FF
  // 중국어 한자 범위 (간체/번체): \u4E00-\u9FFF
  // 일본어 히라가나/가타카나: \u3040-\u30FF
  const foreignLanguagePatterns: RegExp[] = [
    /[А-Яа-яЁё][А-Яа-яЁё\s.,!?;:'"()-]+/g,  // 러시아어 문장
    /[\u4E00-\u9FFF]{4,}[^\n]*[\u4E00-\u9FFF]{2,}/g, // 중국어 문장 (연속 4글자 이상)
    /[\u3040-\u30FF]{3,}[^\n]*/g, // 일본어 히라가나/가타카나 문장
  ];

  for (const pattern of foreignLanguagePatterns) {
    filtered = filtered.replace(pattern, '');
  }

  // 🚨 2단계: CTA 중복 텍스트 제거 (본문 끝에 나오는 CTA 유도 문구)
  const ctaPatterns: RegExp[] = [
    /🔗\s*더\s*알아보기[^\n]*/g,
    /🔗\s*관련\s*기사\s*보기[^\n]*/g,
    /🔗\s*자세히\s*보기[^\n]*/g,
    /더\s*알아보기\s*[→>]?[\s\n]*$/g,
    /관련\s*기사\s*보기\s*[→>]?[\s\n]*$/g,
    /자세히\s*보기\s*[→>]?[\s\n]*$/g,
    /\n+🔗[^\n]*$/g, // 마지막 줄에 🔗로 시작하는 CTA
  ];

  for (const pattern of ctaPatterns) {
    filtered = filtered.replace(pattern, '');
  }

  // 과장 표현 → 대체 표현 매핑
  const replacements: Array<[RegExp, string]> = [
    // 극단적 표현
    [/최고의\s+/g, '만족스러운 '],
    [/완벽한\s+/g, '좋은 '],
    [/필수\s+(제품|아이템)/g, '추천할 만한 $1'],
    [/최강의?\s+/g, '추천할 만한 '],

    // 보장/약속 표현
    [/확실히\s+/g, ''],
    [/반드시\s+/g, ''],
    [/무조건\s+/g, ''],
    [/100%\s*/g, '대부분 '],

    // 긴급성 과장
    [/지금\s*바로\s*/g, ''],
    [/마지막\s*기회/g, '기회'],
    [/놓치면\s*후회/g, '참고하시면 좋을'],

    // 의료 과장
    [/완치/g, '개선'],
    [/치료한다/g, '도움이 될 수 있다'],

    // 가격 과장
    [/최저가/g, '합리적인 가격'],
  ];

  for (const [pattern, replacement] of replacements) {
    filtered = filtered.replace(pattern, replacement);
  }

  // 빈 줄 정리 (연속된 빈 줄을 하나로)
  filtered = filtered.replace(/\n{3,}/g, '\n\n');

  return filtered.trim();
}

/**
 * 두 문자열의 유사도 계산 (개선된 Jaccard + 문장 구조 유사도)
 * - 단어 기반 Jaccard 유사도
 * - N-gram 유사도 (연속 단어 패턴)
 * - 문장 구조 유사도 (어미 패턴)
 */
function calculateSimilarity(str1: string, str2: string): number {
  // 1. 단어 기반 Jaccard 유사도
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 1));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 1));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;

  // 2. N-gram 유사도 (2-gram: 연속 2단어 패턴)
  const getNgrams = (text: string, n: number): Set<string> => {
    const words = text.split(/\s+/).filter(w => w.length > 1);
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  };

  const ngrams1 = getNgrams(str1, 2);
  const ngrams2 = getNgrams(str2, 2);

  let ngramSimilarity = 0;
  if (ngrams1.size > 0 && ngrams2.size > 0) {
    const ngramIntersection = new Set([...ngrams1].filter(x => ngrams2.has(x)));
    const ngramUnion = new Set([...ngrams1, ...ngrams2]);
    ngramSimilarity = ngramUnion.size > 0 ? ngramIntersection.size / ngramUnion.size : 0;
  }

  // 3. 문장 구조 유사도 (어미 패턴)
  const getEndings = (text: string): string[] => {
    const endings: string[] = [];
    const sentences = text.split(/[.!?]/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 3) {
        // 마지막 3-5글자 추출 (어미 패턴)
        endings.push(trimmed.slice(-5));
      }
    }
    return endings;
  };

  const endings1 = getEndings(str1);
  const endings2 = getEndings(str2);

  let endingSimilarity = 0;
  if (endings1.length > 0 && endings2.length > 0) {
    const matchingEndings = endings1.filter(e1 =>
      endings2.some(e2 => e1 === e2 || e1.includes(e2) || e2.includes(e1))
    );
    endingSimilarity = matchingEndings.length / Math.max(endings1.length, endings2.length);
  }

  // 가중 평균 (Jaccard 50%, N-gram 30%, 어미 20%)
  return jaccardSimilarity * 0.5 + ngramSimilarity * 0.3 + endingSimilarity * 0.2;
}

/**
 * 소제목 순서 검증 함수 (관대한 버전 - 품질과 속도 균형)
 * ✅ 대부분 통과, 경고만 기록
 */
function validateHeadingOrder(headings: HeadingPlan[], articleType?: ArticleType): { valid: boolean; errors: string[] } {
  // ✅ 소제목이 있으면 대부분 통과 (품질 우선, 속도 확보)
  if (!headings || headings.length === 0) {
    return { valid: true, errors: [] }; // 소제목 없어도 통과
  }

  // ✅ 소제목 개수가 적정하면 바로 통과 (3-10개)
  if (headings.length >= 3 && headings.length <= 10) {
    return { valid: true, errors: [] };
  }

  // 소제목이 너무 적거나 많으면 경고만 (에러 아님)
  const errors: string[] = [];

  if (headings.length < 3) {
    console.warn(`[Heading Order] 소제목이 ${headings.length}개로 적음(권장: 3 - 7개)`);
  }
  if (headings.length > 10) {
    console.warn(`[Heading Order] 소제목이 ${headings.length}개로 많음(권장: 3 - 7개)`);
  }

  // ✅ 항상 통과 (속도 우선)
  return { valid: true, errors: [] };
}

/**
 * 소제목 중복 검사 함수 (관대한 버전 - 품질과 속도 균형)
 * ✅ 경미한 문제는 경고만, 심각한 문제만 에러 처리
 * ✅ [2026-01-21] URL 기반 생성 지원을 위해 기준 완화 (1100→800)
 */
function detectDuplicateContent(bodyPlain: string, headings: HeadingPlan[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // ✅ 본문이 비어있으면 실패
  if (!bodyPlain || bodyPlain.length === 0) {
    return { valid: false, errors: ['본문이 비어있습니다.'] };
  }

  // ✅ 품질 우선: 1500자 이상이면 통과 (완벽한 글)
  if (bodyPlain.length >= 1500) {
    console.log(`[detectDuplicateContent] ✅ 본문 충분(${bodyPlain.length}자)`);
    return { valid: true, errors: [] };
  }

  // ✅ 800-1499자면 경고와 함께 통과 (양호) - 기존 1100→800 완화
  if (bodyPlain.length >= 800) {
    console.warn(`[detectDuplicateContent] ⚠️ 본문 약간 짧음(${bodyPlain.length}자), 통과`);
    return { valid: true, errors: [] };
  }

  // ✅ 400-799자면 재시도 유도 (더 길게 작성 필요) - 기존 600→400 완화
  if (bodyPlain.length >= 400) {
    console.warn(`[detectDuplicateContent] ⚠️ 본문 부족(${bodyPlain.length}자), 재시도 권장`);
    return { valid: false, errors: [`본문이 ${bodyPlain.length}자로 부족합니다. 최소 800자 이상 권장.`] };
  }

  // ✅ 400자 미만이면 재시도 (품질 미달)
  console.error(`[detectDuplicateContent] ❌ 본문 너무 짧음(${bodyPlain.length}자), 재시도 필요`);
  return { valid: false, errors: [`본문이 ${bodyPlain.length}자로 너무 짧습니다. 최소 800자 이상 필요.`] };
}

// 별도의 중복 검사 함수 (본문 길이 검사 후 호출)
function checkDuplicateHeadings(bodyPlain: string, headings: HeadingPlan[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!headings || headings.length === 0) {
    return { valid: true, errors: [] };
  }

  // ✅ 본문 길이가 충분하면 심각한 반복만 체크
  if (bodyPlain.length >= 1500) {
    // 심각한 반복만 체크 (전체 구조가 3번 이상 반복)
    const firstHeading = headings[0].title;
    const regex = new RegExp(firstHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = bodyPlain.match(regex);
    const count = matches ? matches.length : 0;

    if (count >= 3) {
      errors.push(`전체 글 구조가 ${count}번 반복됨 - 심각한 중복`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // 본문이 짧으면 더 자세히 검사
  for (const heading of headings) {
    const headingTitle = heading.title;
    const regex = new RegExp(headingTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = bodyPlain.match(regex);
    const count = matches ? matches.length : 0;

    // ✅ 3번 이상 반복만 에러 (2번은 경고)
    if (count >= 3) {
      errors.push(`소제목 "${headingTitle.substring(0, 20)}..."이(가) ${count}번 반복됨`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 전체 글 구조 반복 감지 및 제거
 * 같은 소제목 순서가 여러 번 반복되는 경우 감지
 */
function removeRepeatedFullContent(bodyPlain: string, headings: HeadingPlan[]): string {
  if (!bodyPlain || !headings || headings.length === 0) return bodyPlain;

  // 각 소제목의 위치 찾기
  const headingPositions: Array<{ title: string; index: number }> = [];
  for (const heading of headings) {
    const index = bodyPlain.indexOf(heading.title);
    if (index !== -1) {
      headingPositions.push({ title: heading.title, index });
    }
  }

  // 위치 순서대로 정렬
  headingPositions.sort((a, b) => a.index - b.index);

  if (headingPositions.length < 2) return bodyPlain;

  // 첫 번째 소제목이 다시 나타나는 위치 찾기 (반복 감지)
  const firstHeading = headingPositions[0].title;
  const firstHeadingIndex = headingPositions[0].index;

  // 첫 번째 소제목이 다시 나타나는 모든 위치 찾기
  const firstHeadingRegex = new RegExp(escapeRegex(firstHeading), 'g');
  const allMatches: number[] = [];
  let match;

  while ((match = firstHeadingRegex.exec(bodyPlain)) !== null) {
    allMatches.push(match.index);
  }

  // 첫 번째 소제목이 2번 이상 나타나면 반복 가능성 확인
  if (allMatches.length > 1) {
    // 첫 번째 패턴의 길이 추정 (첫 번째 소제목부터 마지막 소제목까지)
    const lastHeadingIndex = headingPositions[headingPositions.length - 1].index;
    const firstPatternLength = lastHeadingIndex - firstHeadingIndex;

    // 첫 번째 패턴 이후의 내용 확인
    const afterFirstPattern = bodyPlain.substring(firstHeadingIndex + firstPatternLength);

    // 두 번째 패턴 시작 위치 찾기
    const secondPatternStart = afterFirstPattern.indexOf(firstHeading);

    if (secondPatternStart !== -1) {
      // 두 번째 패턴의 내용 추출 (첫 번째 패턴 길이만큼)
      const secondPatternEnd = Math.min(
        secondPatternStart + firstPatternLength,
        afterFirstPattern.length
      );
      const secondPattern = afterFirstPattern.substring(secondPatternStart, secondPatternEnd);
      const firstPattern = bodyPlain.substring(firstHeadingIndex, firstHeadingIndex + firstPatternLength);

      // 두 패턴의 유사도 확인 (80% 이상이면 반복으로 간주)
      const similarity = calculateSimilarity(
        firstPattern.toLowerCase().replace(/\s+/g, ' '),
        secondPattern.toLowerCase().replace(/\s+/g, ' ')
      );

      if (similarity > 0.8) {
        console.warn(`[전체 글 반복 감지] 유사도 ${(similarity * 100).toFixed(1)}% - 반복된 전체 구조 제거`);

        // 첫 번째 패턴만 유지하고 나머지 반복 부분 제거
        const endOfFirstPattern = firstHeadingIndex + firstPatternLength;
        const beforeRepeat = bodyPlain.substring(0, endOfFirstPattern);
        const afterRepeat = afterFirstPattern.substring(secondPatternStart + firstPatternLength);

        // 반복 부분 이후의 내용이 있으면 유지 (새로운 내용인 경우)
        if (afterRepeat.trim().length > 50) {
          // 반복 이후 내용이 새로운 내용인지 확인
          const afterRepeatSimilarity = calculateSimilarity(
            firstPattern.toLowerCase().replace(/\s+/g, ' '),
            afterRepeat.substring(0, Math.min(afterRepeat.length, firstPatternLength)).toLowerCase().replace(/\s+/g, ' ')
          );

          if (afterRepeatSimilarity < 0.7) {
            // 새로운 내용이면 유지
            return (beforeRepeat + '\n\n' + afterRepeat).trim();
          }
        }

        // 반복 이후 내용도 유사하면 첫 번째 패턴만 반환
        return beforeRepeat.trim();
      }
    }
  }

  // 소제목 순서가 반복되는지 확인 (예: 소제목1, 소제목2, 소제목3, 소제목1, 소제목2, 소제목3)
  if (headingPositions.length >= 3) {
    // 첫 3개 소제목의 순서 패턴
    const firstThreeTitles = headingPositions.slice(0, 3).map(h => h.title);

    // 이 패턴이 다시 나타나는지 확인
    let patternFound = false;
    let repeatStartIndex = -1;

    for (let i = 3; i < headingPositions.length; i++) {
      const currentTitle = headingPositions[i].title;
      if (currentTitle === firstThreeTitles[0]) {
        // 패턴 시작 가능성 확인
        let matchesPattern = true;
        for (let j = 0; j < Math.min(3, headingPositions.length - i); j++) {
          if (headingPositions[i + j]?.title !== firstThreeTitles[j]) {
            matchesPattern = false;
            break;
          }
        }

        if (matchesPattern) {
          patternFound = true;
          repeatStartIndex = headingPositions[i].index;
          break;
        }
      }
    }

    if (patternFound && repeatStartIndex !== -1) {
      console.warn(`[소제목 순서 반복 감지] 반복된 소제목 순서 패턴 제거`);
      // 반복 시작 전까지만 유지
      return bodyPlain.substring(0, repeatStartIndex).trim();
    }
  }

  return bodyPlain;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanEscapeSequences(text: string): string {
  if (!text) return text;

  // JSON 파싱 후에는 이스케이프가 해제되어 있지만,
  // 리터럴 이스케이프 시퀀스(\n, \t 등)가 문자열에 포함될 수 있음
  // 실제로는 JSON.parse()가 이스케이프를 해제하므로, 여기서는 남아있는 리터럴만 처리
  let cleaned = text;

  // 리터럴 백슬래시 + 문자 조합을 처리
  // 백슬래시가 이스케이프되지 않은 경우만 처리 (실제 리터럴 시퀀스)
  cleaned = cleaned
    // 백슬래시로 시작하는 이스케이프 시퀀스 제거 (리터럴 문자열로 남아있는 경우)
    .replace(/\\([nrtbf])/g, (match, char) => {
      switch (char) {
        case 'n': return ' '; // 줄바꿈은 공백으로 대체 (문서에서는 공백이 자연스러움)
        case 't': return ' '; // 탭은 공백으로
        case 'r': return '';  // 캐리지 리턴 제거
        case 'b': return '';  // 백스페이스 제거
        case 'f': return '';  // 폼 피드 제거
        default: return match;
      }
    })
    // 백슬래시 + 백슬래시는 백슬래시 하나로 (하지만 실제로는 제거)
    .replace(/\\\\/g, '')
    // 유니코드 이스케이프 제거
    .replace(/\\u[0-9a-fA-F]{4}/g, '')
    // 연속된 공백 정리 (탭, 공백 등)
    .replace(/[ \t]+/g, ' ')
    // 연속된 줄바꿈 정리 (3개 이상은 2개로)
    .replace(/\n{3,}/g, '\n\n')
    // 줄 끝의 공백 제거
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    // HTML 엔티티 디코딩 (있는 경우)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

  return cleaned;
}

function validateStructuredContent(content: StructuredContent, source?: ContentSource): void {
  if (!content) throw new Error('구조화된 콘텐츠가 비어 있습니다.');

  const rawSelectedTitleForHeadingStrip = String(content.selectedTitle || '').trim();

  // ✅ 누락된 필수 필드 자동 복구 (오류 대신 복구 시도)
  // selectedTitle 복구
  if (!content.selectedTitle) {
    if (content.titleAlternatives && content.titleAlternatives.length > 0) {
      content.selectedTitle = content.titleAlternatives[0];
      console.warn('[validateStructuredContent] selectedTitle 누락 → titleAlternatives[0]으로 복구');
    } else if (content.headings && content.headings.length > 0) {
      content.selectedTitle = content.headings[0].title || '제목 없음';
      console.warn('[validateStructuredContent] selectedTitle 누락 → headings[0].title로 복구');
    } else {
      content.selectedTitle = '제목 없음';
      console.warn('[validateStructuredContent] selectedTitle 누락 → 기본값으로 설정');
    }
  }

  // ✅ 프롬프트 지침 누출 감지 및 수정
  const primaryKeyword = String((source as any)?.keyword || source?.title || (source as any)?.rawText?.slice(0, 50) || '').trim();
  if (content.selectedTitle && primaryKeyword) {
    const leakageCheck = detectPromptLeakageInTitle(content.selectedTitle, primaryKeyword);

    if (leakageCheck.isLeaked) {
      console.error(`[validateStructuredContent] 프롬프트 누출 감지! 원본 제목: "${content.selectedTitle}"`);
      console.error(`[validateStructuredContent] 누출 패턴: ${JSON.stringify(leakageCheck.leakagePatterns)} `);

      // 대안 제목 중 유효한 것 찾기
      let validTitle: string | null = null;

      // titleAlternatives에서 유효한 제목 찾기
      if (Array.isArray(content.titleAlternatives)) {
        for (const alt of content.titleAlternatives) {
          const altCheck = detectPromptLeakageInTitle(alt, primaryKeyword);
          if (!altCheck.isLeaked) {
            validTitle = alt;
            console.log(`[validateStructuredContent] 유효한 대안 제목 발견: "${validTitle}"`);
            break;
          }
        }
      }

      // titleCandidates에서 유효한 제목 찾기
      if (!validTitle && Array.isArray(content.titleCandidates)) {
        for (const cand of content.titleCandidates) {
          const candCheck = detectPromptLeakageInTitle(cand.text, primaryKeyword);
          if (!candCheck.isLeaked) {
            validTitle = cand.text;
            console.log(`[validateStructuredContent] 유효한 후보 제목 발견: "${validTitle}"`);
            break;
          }
        }
      }

      // 유효한 대안이 없으면 키워드 기반 제목 생성
      if (!validTitle) {
        // 키워드를 활용해 기본 제목 생성
        validTitle = `${primaryKeyword}, 알아두면 좋은 핵심 정보 총정리`;
        console.warn(`[validateStructuredContent] 유효한 대안 없음 → 키워드 기반 제목 생성: "${validTitle}"`);
      }

      content.selectedTitle = validTitle;

      // titleAlternatives도 업데이트 (undefined 체크 추가)
      if (!content.titleAlternatives) {
        content.titleAlternatives = [];
      }
      if (!content.titleAlternatives.includes(validTitle)) {
        content.titleAlternatives.unshift(validTitle);
      }
    }
  }

  // bodyHtml 복구
  if (!content.bodyHtml) {
    if (content.bodyPlain) {
      // bodyPlain을 HTML로 변환
      content.bodyHtml = content.bodyPlain
        .split('\n\n')
        .map(p => `< p > ${p.replace(/\n/g, '<br>')} </p>`)
        .join('\n');
      console.warn('[validateStructuredContent] bodyHtml 누락 → bodyPlain에서 복구');
    } else if (content.headings && content.headings.length > 0) {
      // headings에서 본문 생성 (content 또는 summary 사용)
      const bodyParts: string[] = [];
      content.headings.forEach(h => {
        if (h.title) bodyParts.push(`<h2>${h.title}</h2>`);
        // ✅ content 또는 summary 중 있는 것 사용
        const bodyText = h.content || h.summary || '';
        if (bodyText) bodyParts.push(`<p>${bodyText}</p>`);
      });
      content.bodyHtml = bodyParts.join('\n');
      // ✅ bodyPlain도 content 또는 summary 사용
      content.bodyPlain = content.headings.map(h => {
        const bodyText = h.content || h.summary || '';
        return `${h.title}\n${bodyText}`;
      }).join('\n\n');
      console.warn('[validateStructuredContent] bodyHtml 누락 → headings에서 복구');
    } else {
      throw new Error('필수 필드(bodyHtml, bodyPlain, headings)가 모두 누락되어 복구 불가능합니다.');
    }
  }

  // bodyPlain 복구
  if (!content.bodyPlain && content.bodyHtml) {
    content.bodyPlain = content.bodyHtml
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
    console.warn('[validateStructuredContent] bodyPlain 누락 → bodyHtml에서 복구');
  }

  // titleAlternatives 복구
  if (!Array.isArray(content.titleAlternatives) || content.titleAlternatives.length < 1) {
    content.titleAlternatives = [content.selectedTitle];
    console.warn('[validateStructuredContent] titleAlternatives 누락 → selectedTitle로 복구');
  }

  // ✅ 제품/쇼핑/IT 리뷰: 과한 훅/감정 트리거 반복 방지 + 제목 상품명 prefix 강제
  if (isReviewArticleType(source?.articleType)) {
    const productName = getReviewProductName(source);
    if (productName) {
      content.selectedTitle = sanitizeReviewTitle(content.selectedTitle || '', productName);
      if (Array.isArray(content.titleAlternatives)) {
        content.titleAlternatives = content.titleAlternatives
          .map((t) => sanitizeReviewTitle(String(t || ''), productName))
          .filter(Boolean);
      }
      if (Array.isArray(content.titleCandidates)) {
        content.titleCandidates = content.titleCandidates.map((c) => ({
          ...c,
          text: sanitizeReviewTitle(String(c?.text || ''), productName),
        }));
      }
    }

    // 본문에서 같은 훅 단어가 과하게 반복되는 현상 억제 (1회만 허용)
    if (content.bodyPlain) {
      content.bodyPlain = limitRegexOccurrences(content.bodyPlain, /직접\s*써보[고니]/g, 1);
      content.bodyPlain = limitRegexOccurrences(content.bodyPlain, /소름/g, 1);
      content.bodyPlain = limitRegexOccurrences(content.bodyPlain, /난리/g, 1);
      content.bodyPlain = limitRegexOccurrences(content.bodyPlain, /충격/g, 1);
      content.bodyPlain = limitRegexOccurrences(content.bodyPlain, /경악/g, 1);
      content.bodyPlain = normalizeBodyWhitespacePreserveNewlines(content.bodyPlain);
    }

    if (content.headings && content.headings.length > 0) {
      const defaultHeadings = [
        '직접 써보니 알겠더군요, 첫인상과 설치의 반전',
        '삶의 질이 달라졌네요, 실제 체감하는 성능 변화',
        '소음 짜증 다 사라졌어요, 실사용자가 말하는 편의성',
        '이것 하나로 끝! 위생과 관리의 결정적 포인트',
        '다 좋았는데 딱 하나? 솔직하게 느낀 아쉬운 점',
        '결국 선택은 이것, 제가 생각하는 추천 대상과 총평',
      ];

      const seen = new Set<string>();
      content.headings = content.headings.map((h, idx) => {
        const fallback = defaultHeadings[idx] || `사용 포인트 ${idx + 1}`;
        const stripTitleBase = rawSelectedTitleForHeadingStrip || String(content.selectedTitle || '').trim();
        const stripped = stripReviewTitlePrefixFromHeading(h.title || '', stripTitleBase, productName);
        const sanitized = sanitizeReviewHeadingTitle(stripped || '', fallback, productName);
        const key = sanitized.replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '').toLowerCase();
        let finalTitle = sanitized;
        if (seen.has(key)) {
          finalTitle = `${sanitized} (${idx + 1})`;
        }
        seen.add(key);
        return {
          ...h,
          title: finalTitle,
        };
      });
    }
  }

  // ✅ 비-리뷰 글에서도: 소제목이 제목(일부 포함)으로 시작하는 경우 제목 prefix 제거
  // - 제거가 실제로 발생한 경우에도 소제목에 제품명 prefix를 새로 붙이지 않음
  if (!isReviewArticleType(source?.articleType) && content.headings && content.headings.length > 0 && content.selectedTitle) {
    const guessedProductName = extractLikelyProductNameFromTitle(content.selectedTitle);
    const selectedTitle = rawSelectedTitleForHeadingStrip || String(content.selectedTitle || '').trim();
    content.headings = content.headings.map((h) => {
      const original = String(h.title || '').trim();
      if (!original) return h;

      const stripped = stripReviewTitlePrefixFromHeading(original, selectedTitle, guessedProductName || '');
      const didStrip = normalizeTitleWhitespace(stripped) !== normalizeTitleWhitespace(original);
      if (!didStrip) return h;

      const cleaned = String(stripped || '').replace(/^[\s\-–—:|·•,]+/, '').trim();
      const finalTitle = cleaned || original;

      return {
        ...h,
        title: finalTitle,
      };
    });
  }

  // ✅ 1번 소제목이 제목과 동일하거나 유사한 경우 제거/수정
  if (content.headings && content.headings.length > 0 && content.selectedTitle) {
    const firstHeadingTitle = content.headings[0]?.title?.trim().toLowerCase() || '';
    const mainTitle = content.selectedTitle.trim().toLowerCase();

    // 제목과 1번 소제목이 동일하거나 80% 이상 유사한 경우
    const isSimilar = firstHeadingTitle === mainTitle ||
      mainTitle.includes(firstHeadingTitle) ||
      firstHeadingTitle.includes(mainTitle) ||
      (firstHeadingTitle.length > 10 && mainTitle.includes(firstHeadingTitle.substring(0, 10)));

    if (isSimilar) {
      console.warn(`[validateStructuredContent] 1번 소제목("${content.headings[0].title}")이 제목("${content.selectedTitle}")과 중복됨 → 1번 소제목 제거`);

      // 1번 소제목 제거
      content.headings = content.headings.slice(1);

      // bodyPlain과 bodyHtml에서도 1번 소제목 내용 제거
      if (content.bodyPlain) {
        const firstHeading = content.headings[0]?.title || '';
        if (firstHeading) {
          const firstHeadingIndex = content.bodyPlain.indexOf(firstHeading);
          if (firstHeadingIndex > 0) {
            content.bodyPlain = content.bodyPlain.substring(firstHeadingIndex);
          }
        }
      }
    }
  }

  // headings 복구
  if (!Array.isArray(content.headings) || content.headings.length < 1) {
    // bodyPlain에서 소제목 추출 시도
    const headingMatches = content.bodyPlain?.match(/^(?:##?\s*)?(.+?)(?:\n|$)/gm) || [];
    if (headingMatches.length > 0) {
      content.headings = headingMatches.slice(0, 5).map((h) => ({
        title: h.replace(/^##?\s*/, '').trim(),
        content: '',  // ✅ content 필드 추가
        summary: '',
        keywords: [],
        imagePrompt: ''
      }));
      console.warn('[validateStructuredContent] headings 누락 → bodyPlain에서 추출');
    } else {
      content.headings = [{
        title: '본문',
        content: content.bodyPlain || '',  // ✅ content 필드 추가
        summary: content.bodyPlain || '',
        keywords: [],
        imagePrompt: ''
      }];
      console.warn('[validateStructuredContent] headings 누락 → 기본값으로 설정');
    }
  }

  // headings 개수 제한 (10개 초과 시 자르기)
  if (content.headings.length > 10) {
    console.warn(`[validateStructuredContent] headings가 ${content.headings.length}개로 너무 많아 10개로 자름`);
    content.headings = content.headings.slice(0, 10);
  }

  // images 배열 복구
  if (!Array.isArray(content.images)) {
    content.images = [];
    console.warn('[validateStructuredContent] images 누락 → 빈 배열로 설정');
  }

  // ✅ hashtags 배열 복구 (해시태그가 없으면 제목/키워드에서 자동 생성)
  if (!Array.isArray(content.hashtags) || content.hashtags.length === 0) {
    const generatedHashtags: string[] = [];
    const title = content.selectedTitle || '';

    // 제목에서 핵심 키워드 추출
    const titleKeywords = title
      .replace(/[?!.,\-_"']/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 2 && word.length <= 20)
      .filter(word => !['하는', '되는', '있는', '없는', '위한', '대한', '이런', '저런', '그런', '어떤', '무엇', '어디', '언제', '누가', '왜', '어떻게'].includes(word))
      .slice(0, 5);

    // 핵심 키워드를 해시태그로 변환
    titleKeywords.forEach(keyword => {
      if (!generatedHashtags.includes(`#${keyword}`)) {
        generatedHashtags.push(`#${keyword}`);
      }
    });

    // headings에서 추가 키워드 추출
    if (content.headings && content.headings.length > 0) {
      content.headings.slice(0, 3).forEach(h => {
        const headingWords = (h.title || '')
          .replace(/[?!.,\-_"']/g, ' ')
          .split(/\s+/)
          .filter(word => word.length >= 2 && word.length <= 15)
          .slice(0, 2);

        headingWords.forEach(word => {
          if (generatedHashtags.length < 8 && !generatedHashtags.some(tag => tag.includes(word))) {
            generatedHashtags.push(`#${word}`);
          }
        });
      });
    }

    // 최소 3개 보장
    if (generatedHashtags.length < 3) {
      const fallbackTags = ['#정보', '#꿀팁', '#추천', '#후기', '#리뷰'];
      fallbackTags.forEach(tag => {
        if (generatedHashtags.length < 5 && !generatedHashtags.includes(tag)) {
          generatedHashtags.push(tag);
        }
      });
    }

    // 최대 8개로 제한
    content.hashtags = generatedHashtags.slice(0, 8);
    console.log(`[validateStructuredContent] hashtags 누락 → 자동 생성: ${content.hashtags.join(', ')}`);
  } else {
    // 기존 해시태그에 # 접두사가 없으면 추가
    content.hashtags = content.hashtags.map(tag =>
      tag.startsWith('#') ? tag : `#${tag}`
    );
  }

  // metadata 객체 복구
  if (!content.metadata || typeof content.metadata !== 'object') {
    const readTimeMinutes = Math.ceil((content.bodyPlain?.length || 0) / 500);
    content.metadata = {
      category: 'general',
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: `${readTimeMinutes}분`,
      wordCount: content.bodyPlain?.length || 0,
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 70,
      keywordStrategy: '기본',
      publishTimeRecommend: '언제든지'
    };
    console.warn('[validateStructuredContent] metadata 누락 → 기본값으로 설정');
  }

  // quality 객체 복구
  if (!content.quality || typeof content.quality !== 'object') {
    content.quality = {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 70,
      originalityScore: 70,
      readabilityScore: 70,
      warnings: []
    };
    console.warn('[validateStructuredContent] quality 누락 → 기본값으로 설정');
  }

}

// ✅ 네이버 전 카테고리 공통 소제목 정규화 키 (중복/유사 판별용)
function normalizeHeadingKeyForOptimization(title: string): string {
  return String(title || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '')
    .toLowerCase()
    .trim();
}

function dedupeRepeatedPhrasesInHeadingTitle(rawTitle: string): string {
  let t = normalizeTitleWhitespace(removeEmojis(String(rawTitle || '').trim()));
  if (!t) return '';

  // collapse consecutive duplicate words
  const tokens0 = t.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  const tokens1: string[] = [];
  for (const tok of tokens0) {
    const prev = tokens1.length > 0 ? tokens1[tokens1.length - 1] : '';
    if (prev && prev === tok) continue;
    tokens1.push(tok);
  }
  t = tokens1.join(' ').trim();
  if (!t) return '';

  // remove duplicated suffix phrase that already appears in the prefix
  const tokens = t.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  if (tokens.length >= 4) {
    for (let i = 1; i < tokens.length; i++) {
      const suffixTokens = tokens.slice(i);
      if (suffixTokens.length < 2) continue;
      const prefix = tokens.slice(0, i).join(' ');
      const suffix = suffixTokens.join(' ');
      if (prefix.includes(suffix)) {
        return tokens.slice(0, i).join(' ').trim();
      }
    }
  }

  return t;
}

function strengthenThinHeadingTitle(
  title: string,
  primaryKeyword: string | undefined,
  mode: 'seo' | 'homefeed',
  index: number,
): string {
  const t = normalizeTitleWhitespace(String(title || '').trim());
  const pk = String(primaryKeyword || '').trim();
  if (!t || !pk) return t;

  const tKey = normalizeHeadingKeyForOptimization(t);
  const pkKey = normalizeHeadingKeyForOptimization(pk);
  if (!tKey || !pkKey) return t;

  const tokens = t.split(/\s+/).filter(Boolean);
  const isBasicallyKeyword = tKey === pkKey || tKey === pkKey + '결혼' || tKey === pkKey + '논란';
  const tooShort = t.length <= pk.length + 4 || tokens.length <= Math.max(2, Math.min(4, pk.split(/\s+/).filter(Boolean).length));
  if (!isBasicallyKeyword && !tooShort) return t;

  const seoSuffixes = ['핵심 정리', '사실관계', '현재 상황', '논란 포인트', '배경 정리', '반응 모음'];
  const homefeedSuffixes = ['무슨 일', '왜 화제', '논란 포인트', '반응 모음', '정리'];
  const suffixes = mode === 'homefeed' ? homefeedSuffixes : seoSuffixes;
  const suffix = suffixes[Math.max(0, index) % suffixes.length];
  const merged = `${t} ${suffix}`.trim();
  return normalizeTitleWhitespace(merged);
}

// ✅ SEO 모드용 소제목 보정
function optimizeSeoHeadingTitle(
  rawTitle: string,
  ctx: { primaryKeyword?: string; categoryHint?: string; index: number; total: number; isReviewType: boolean },
): string {
  let t = normalizeTitleWhitespace(removeEmojis(String(rawTitle || '').trim()));
  t = stripOrdinalHeadingPrefix(t);
  if (!t) return '';

  // 번호/불릿 제거 ("1.", "01)", "#1" 등)
  t = t.replace(/^(?:[#•\-–—*]\s*)?(?:제\s*\d+\s*장\s*|STEP\s*\d+\s*|Step\s*\d+\s*|[①-⑳]\s*|\d{1,2}[).]\s*)/i, '').trim();
  t = t.replace(/^[\s\-–—:|·•,]+/, '').trim();

  // 문장형 어미/불필요한 꼬리말 정리 (제목/소제목 느낌 유지)
  // t = t.replace(/(입니다|합니다|했어요|되더라고요|되나요|될까요|인지\s*알아보겠습니다)\s*$/g, '').trim();
  // t = t.replace(/[!?]+$/g, '').trim();

  t = dedupeRepeatedPhrasesInHeadingTitle(t);
  t = strengthenThinHeadingTitle(t, ctx.primaryKeyword, 'seo', ctx.index);

  // 길이 가드 (너무 짧거나 긴 경우는 최소한만 보정)
  // ✅ 글자 수 제한 완화 (완결된 소제목 문장 우선)
  // 기존: 50자 초과 시 47자로 자르고 ... 추가 → 제거!
  // 네이버 블로그는 긴 소제목도 허용하며, AI가 완결된 문장으로 생성했다면 그대로 사용

  // 🔸 소제목 앞에 primaryKeyword(제품명/키워드)를 강제로 붙이지 않는다.
  //     AI가 자연스럽게 포함해 준 경우만 그대로 유지한다.
  return normalizeTitleWhitespace(t);
}

// ✅ 홈판 모드용 소제목 보정
function optimizeHomefeedHeadingTitle(
  rawTitle: string,
  ctx: { categoryHint?: string; primaryKeyword?: string; index: number; total: number },
): string {
  let t = normalizeTitleWhitespace(removeEmojis(String(rawTitle || '').trim()));
  t = stripOrdinalHeadingPrefix(t);
  if (!t) return '';

  // 번호/불릿 제거
  t = t.replace(/^(?:[#•\-–—*]\s*)?(?:제\s*\d+\s*장\s*|EP\.?\s*\d+\s*|[①-⑳]\s*|\d{1,2}[).]\s*)/i, '').trim();
  t = t.replace(/^[\s\-–—:|·•,]+/, '').trim();

  // 지나치게 딱딱한 설명체 어미 제거 (소제목은 짧고 강하게)
  // t = t.replace(/(입니다|합니다|되었습니다|되었습니다|되었습니다)\s*$/g, '').trim();
  // t = t.replace(/[.!?]+$/g, '').trim();

  // 홈판은 감정/상황 묘사 위주이므로, 너무 정보형 느낌의 꼬리말은 컷
  t = t.replace(/(소개|설명|정리|요약)\s*$/g, '').trim();

  t = dedupeRepeatedPhrasesInHeadingTitle(t);
  t = strengthenThinHeadingTitle(t, ctx.primaryKeyword, 'homefeed', ctx.index);

  // ✅ 글자 수 제한 완화 (완결된 소제목 문장 우선)
  // 기존: 50자 초과 시 47자로 자르고 ... 추가 → 제거!
  // 네이버 블로그는 긴 소제목도 허용하며, AI가 완결된 문장으로 생성했다면 그대로 사용

  return normalizeTitleWhitespace(t);
}

/**
 * ✅ [소제목 최적화 마스터 모듈]
 * - 모든 네이버 카테고리 공통 소제목 정리
 * - SEO / 홈판 모드별로 다른 소제목 스타일 적용
 * - 본문 내용(content/summary/bodyPlain/bodyHtml)은 절대 수정하지 않고 title만 보정
 */
function optimizeHeadingsForMode(content: StructuredContent, source: ContentSource): void {
  if (!content || !Array.isArray(content.headings) || content.headings.length === 0) return;

  const mode = source.contentMode;
  if (mode !== 'seo' && mode !== 'homefeed') return;

  const isReview = isReviewArticleType(source.articleType);
  const primaryKeyword = (source.metadata as any)?.keywords?.[0]
    ? String((source.metadata as any).keywords?.[0] || '').trim()
    : '';
  const categoryHint = String(source.categoryHint || '').trim();

  const seen = new Set<string>();

  content.headings = content.headings.map((h, index) => {
    const total = content.headings?.length || 0;
    let title = String(h.title || '').trim();

    if (!title) {
      // 완전 빈 소제목은 최소한의 기본값만 채움 (본문은 그대로 유지)
      const fallback = `소제목 ${index + 1}`;
      const key = normalizeHeadingKeyForOptimization(fallback);
      if (seen.has(key)) {
        return { ...h, title: `${fallback} (${index + 1})` };
      }
      seen.add(key);
      return { ...h, title: fallback };
    }

    let optimized = title;

    if (mode === 'seo') {
      optimized = optimizeSeoHeadingTitle(title, {
        primaryKeyword,
        categoryHint,
        index,
        total,
        isReviewType: isReview,
      });
    } else if (mode === 'homefeed') {
      optimized = optimizeHomefeedHeadingTitle(title, {
        categoryHint,
        primaryKeyword,
        index,
        total,
      });
    }

    // 최종 키 기준 중복 방지 (완전히 같은/유사 소제목이면 접미사 부여)
    const key = normalizeHeadingKeyForOptimization(optimized || title);
    if (key && seen.has(key)) {
      optimized = `${optimized || title} (${index + 1})`;
    }
    if (key) seen.add(key);

    return {
      ...h,
      title: optimized || title,
    };
  });
}

/**
 * ✅ [소제목 본문 동기화]
 * - Stage 1 개요에서 생성된 짧은 소제목을 Stage 2 본문에서 실제 사용된 전체 소제목으로 업데이트
 * - bodyPlain에서 각 소제목의 시작 부분을 검색하여 전체 줄을 추출
 */
function syncHeadingsWithBodyPlain(content: StructuredContent): void {
  // ✅ [2026-01-07 완전 비활성화] 사용자가 소제목이 본문 첫 문장과 겹치는 것을 원치 않음.
  // AI가 생성한 고유한 소제목(headings[].title)을 그대로 사용하는 것이 더 정확함.
  console.log('[syncHeadingsWithBodyPlain] 비활성화됨 - AI 생성 고유 소제목 유지');
  return;
  if (!content || !content.bodyPlain || !Array.isArray(content.headings) || content.headings.length === 0) return;

  const bodyLines = content.bodyPlain.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // ✅ 개선된 매칭 로직: 본문 한 문장이 통째로 소제목이 되는 경우만 업데이트
  content.headings = content.headings.map((h) => {
    const shortTitle = String(h.title || '').trim();
    if (!shortTitle || shortTitle === '?') return h;

    // AI가 준 제목이 이미 충분히 길면(30자 이상) 굳이 매칭할 필요 없음
    if (shortTitle.length >= 30) return h;

    // 짧은 제목으로 시작하는 라인 찾기
    const searchKey = shortTitle.length > 5 ? shortTitle.substring(0, 5) : shortTitle;

    for (const line of bodyLines) {
      // 1. 본문 라인의 시작이 소제목 키워드로 시작하는가?
      // 2. 해당 라인이 '문장'이 아니라 '소제목' 스타일인가? (보통 60자 이내, 마침표로 끝나지 않거나 콜론으로 끝남)
      if (line.startsWith(searchKey) || line.includes(shortTitle)) {
        // 이미 본문에 있는 그 줄 자체가 소제목인 경우
        if (line.length >= shortTitle.length && line.length <= 80) {
          // 마침표로 끝나는 긴 문장은 소제목이 아닐 확률이 높으므로 제외 (단, 소제목이 원래 마침표가 있을 순 있음)
          const isTooLongSentence = line.length > 40 && line.endsWith('.');

          if (!isTooLongSentence) {
            console.log(`[syncHeadings] 소제목 보정: "${shortTitle}" → "${line}"`);
            return { ...h, title: line };
          }
        }
      }
    }

    return h;
  });
}

/**
 * ✅ SEO 모드 전용 검증 및 보정 함수
 * - 제목 키워드 배치 검증
 * - 제목 길이 검증 (25~35자)
 * - 소제목 5개 이상 권장
 */
function validateSeoContent(content: StructuredContent, source: ContentSource): void {
  if (source.contentMode !== 'seo') return;

  console.log('[SeoValidator] 🔍 SEO 모드 전용 검증 시작...');

  const warnings: string[] = [];
  let titleScore = 100;

  // 1. 제목 검증
  const title = content.selectedTitle || '';
  const titleLength = title.length;

  // 길이 체크 (25~35자)
  if (titleLength < 25) {
    warnings.push(`⚠️ 제목 너무 짧음: ${titleLength}자 (SEO 권장 25~35자)`);
    titleScore -= 15;
  } else if (titleLength > 35) {
    warnings.push(`⚠️ 제목 너무 김: ${titleLength}자 (검색결과에서 잘릴 수 있음)`);
    titleScore -= 10;
  }

  // 숫자/연도 포함 체크
  const hasNumber = /\d/.test(title);
  if (!hasNumber) {
    warnings.push('⚠️ 제목에 숫자/연도 없음 (신뢰도 하락)');
    titleScore -= 15;
  }

  // SEO 클릭 트리거 체크
  const seoTriggers = [
    '총정리', '완벽', '가이드', '비교', '차이', '해결', '꿀팁', '방법',
    '후기', '써본', '효과', '최신', '업데이트', '추천', '순위', 'TOP',
    '진짜', '실제', '직접', '비밀', '몰랐던', '이유'
  ];
  const hasSeoTrigger = seoTriggers.some(t => title.includes(t));
  if (!hasSeoTrigger) {
    warnings.push('⚠️ 제목에 SEO 클릭 트리거 없음');
    titleScore -= 20;
  }

  // 설명체 금지 체크
  const forbiddenSeoPatterns = ['에 대해', '에 관한', '입니다', '합니다', '알아보겠'];
  const hasForbiddenSeo = forbiddenSeoPatterns.some(p => title.includes(p));
  if (hasForbiddenSeo) {
    warnings.push('⚠️ 제목에 설명체/딱딱한 어미 발견');
    titleScore -= 20;
  }

  console.log(`[SeoValidator] 📊 제목 점수: ${titleScore}/100 ("${title.substring(0, 30)}...")`);

  // 2. 소제목 개수 검증 (5~7개 권장)
  const headingsCount = content.headings?.length || 0;
  if (headingsCount < 5) {
    warnings.push(`⚠️ 소제목 ${headingsCount}개 (SEO 권장: 5~7개, 체류시간 ↑)`);
    console.warn(`[SeoValidator] ⚠️ 소제목 부족: ${headingsCount}개`);
  }

  // 3. 본문 톤 검증 (AI티 감지)
  const bodyText = content.bodyPlain || '';
  const aiPatterns = ['물론', '확실히', '것입니다', '하겠습니다', '살펴보겠습니다'];
  const hasAiTone = aiPatterns.some(p => bodyText.includes(p));
  if (hasAiTone) {
    warnings.push('⚠️ AI티 나는 표현 감지 (자연스러운 문체 권장)');
    console.warn('[SeoValidator] ⚠️ AI티 표현 감지');
  }

  // 경고 추가
  if (warnings.length > 0) {
    if (!content.quality) {
      content.quality = {
        aiDetectionRisk: 'low',
        legalRisk: 'safe',
        seoScore: titleScore,
        originalityScore: 70,
        readabilityScore: 70,
        warnings: []
      };
    }
    content.quality.seoScore = titleScore;
    content.quality.warnings = [...(content.quality.warnings || []), ...warnings];
    console.log(`[SeoValidator] 검증 완료: ${warnings.length}개 경고`);
  } else {
    console.log('[SeoValidator] ✅ SEO 검증 통과');
  }
}

/**
 * ✅ 홈판 모드 전용 검증 및 보정 함수
 * - 소제목 5개 이상 강제 (부족하면 경고)
 * - 도입부 3줄 체크
 * - 마무리 결론/정리 금지 체크
 */
function validateHomefeedContent(content: StructuredContent, source: ContentSource): void {
  if (source.contentMode !== 'homefeed') return;

  console.log('[HomefeedValidator] 🔍 홈판 모드 전용 검증 시작...');

  const warnings: string[] = [];
  let titleScore = 100; // 제목 점수 (100점 만점)

  // 0. 제목 검증 (100점 체크리스트)
  const title = content.selectedTitle || '';
  const titleLength = title.length;

  // 길이 체크 (28~40자)
  if (titleLength < 28) {
    warnings.push(`⚠️ 제목 너무 짧음: ${titleLength}자 (권장 28~40자)`);
    titleScore -= 15;
  } else if (titleLength > 40) {
    warnings.push(`⚠️ 제목 너무 김: ${titleLength}자 (권장 28~40자)`);
    titleScore -= 10;
  }

  // 감정 폭발 트리거 체크
  const emotionTriggers = [
    '충격', '경악', '소름', '반전', '눈물', '울컥', '분노', '논란',
    '난리', '폭발', '실화', '대박', '감동', '궁금', '비밀', '진실',
    '숨겨', '알고보니', '결국', '진짜', '직접', '현장', '실시간'
  ];
  const hasEmotionTrigger = emotionTriggers.some(t => title.includes(t));
  if (!hasEmotionTrigger) {
    warnings.push('⚠️ 제목에 감정 트리거 없음 (-25점)');
    titleScore -= 25;
  }

  // 금지 표현 체크
  const forbiddenTitlePatterns = ['왜?', '왜일까?', '에 대해', '에 관한', '알아보겠습니다'];
  const hasForbiddenTitle = forbiddenTitlePatterns.some(p => title.includes(p));
  if (hasForbiddenTitle) {
    warnings.push('⚠️ 제목에 금지 표현 발견 (설명체/뻔한 마무리)');
    titleScore -= 40;
  }

  console.log(`[HomefeedValidator] 📊 제목 점수: ${titleScore}/100 ("${title.substring(0, 30)}...")`);

  // 1. 소제목 개수 검증 (5~6개 필수)
  const headingsCount = content.headings?.length || 0;
  if (headingsCount < 5) {
    warnings.push(`⚠️ 소제목 ${headingsCount}개 (홈판 권장: 5~6개)`);
    console.warn(`[HomefeedValidator] ⚠️ 소제목 부족: ${headingsCount}개 (권장 5~6개)`);

    // 소제목이 3개 이하면 추가 소제목 생성 시도
    if (headingsCount < 3 && content.headings) {
      const additionalHeadings = [
        { title: '📌 당시 대중 반응 요약', content: '실제 댓글과 반응들을 모아봤어요.', summary: '', keywords: [], imagePrompt: '' },
        { title: '앞으로의 전망', content: '앞으로 어떻게 될지 지켜봐야 할 것 같아요.', summary: '', keywords: [], imagePrompt: '' },
      ];
      content.headings.push(...additionalHeadings.slice(0, 5 - headingsCount));
      console.log(`[HomefeedValidator] 소제목 ${5 - headingsCount}개 자동 추가`);
    }
  }

  // 2. 도입부 검증 (3줄 권장)
  const intro = content.introduction || '';
  const introLines = intro.split(/[.!?]\s*/).filter(s => s.trim().length > 0).length;
  if (introLines > 5) {
    warnings.push(`⚠️ 도입부 ${introLines}줄 (홈판 권장: 3줄 이내)`);
    console.warn(`[HomefeedValidator] ⚠️ 도입부 너무 김: ${introLines}줄 (권장 3줄)`);
  }

  // 3. 마무리 검증 (결론/정리 금지)
  const conclusion = content.conclusion || '';
  const forbiddenPatterns = ['결론적으로', '정리하면', '요약하면', '결론은', '마무리하자면', '종합하면'];
  const hasForbiddenConclusion = forbiddenPatterns.some(p => conclusion.includes(p));
  if (hasForbiddenConclusion) {
    warnings.push('⚠️ 마무리에 결론/정리 표현 발견 (홈판 금지)');
    console.warn('[HomefeedValidator] ⚠️ 마무리에 금지 표현 발견');
  }

  // 4. 본문 톤 검증 (기자체/설명체 감지)
  const bodyText = content.bodyPlain || '';
  const journalistPatterns = ['~로 알려졌다', '~로 전해졌다', '~로 확인됐다', '~로 밝혔다', '~에 따르면'];
  const hasJournalistTone = journalistPatterns.some(p => bodyText.includes(p));
  if (hasJournalistTone) {
    warnings.push('⚠️ 기자체 표현 감지 (홈판에서는 구어체 권장)');
    console.warn('[HomefeedValidator] ⚠️ 기자체 표현 감지');
  }

  // 경고 추가
  if (warnings.length > 0) {
    if (!content.quality) {
      content.quality = {
        aiDetectionRisk: 'low',
        legalRisk: 'safe',
        seoScore: 70,
        originalityScore: 70,
        readabilityScore: 70,
        warnings: []
      };
    }
    content.quality.warnings = [...(content.quality.warnings || []), ...warnings];
    console.log(`[HomefeedValidator] 검증 완료: ${warnings.length}개 경고`);
  } else {
    console.log('[HomefeedValidator] ✅ 홈판 검증 통과');
  }
}



/**
 * ⚡ 목표 글자수에 따라 동적 타임아웃 계산
 * - 배포 환경 안정성: 네트워크 환경이 다양하므로 충분한 시간 제공
 * - 첫 연결 지연 고려: DNS 해석, TLS 핸드쉐이크 등
 * - 사양과 무관: AI 처리는 서버에서 수행됨
 */
function getTimeoutMs(minChars: number, retryAttempt: number = 0): number {
  // ✅ AI 글 생성은 서버에서 처리되므로 컴퓨터 사양과 무관!
  // 하지만 네트워크 환경은 사용자마다 다름:
  // - DNS 해석: 0.5~5초 (첫 연결 시)
  // - TLS 핸드쉐이크: 0.3~3초
  // - API 처리: 10~120초 (글 분량에 따라)
  // - 응답 전송: 1~10초 (글 분량에 따라)

  // ✅ 배포 환경 안정성 강화 (타임아웃 증가 - 저사양/느린 네트워크 대응)
  let baseTimeout: number;
  if (minChars < 1000) baseTimeout = 120000;       // 제목만: 2분
  else if (minChars < 3000) baseTimeout = 180000;  // 짧은 글: 3분
  else if (minChars < 5000) baseTimeout = 240000;  // 중간 글: 4분
  else if (minChars < 10000) baseTimeout = 300000; // 긴 글: 5분
  else baseTimeout = 360000;                       // 매우 긴 글: 6분

  // ✅ 재시도 시 타임아웃 약간 증가 (빠른 폴백 우선)
  // 1회 재시도: +20%, 2회: +40%, 3회 이상: +60%
  const multiplier = 1 + (Math.min(retryAttempt, 3) * 0.2);
  return Math.floor(baseTimeout * multiplier);
}

async function callGemini(prompt: string, temperature: number = 0.9, minChars: number = 2000): Promise<string> {
  const timeoutMs = getTimeoutMs(minChars);

  // ✅ 설정 로드
  let config: any = null;
  try {
    const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
    config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.warn('[ContentGenerator] Config 로드 실패:', e);
  }

  // ✅ 2026-01-13: 블로그 마케팅 전문가 페르소나 (사용자 최적화)
  const systemInstructionText = `
Role: 당신은 한국 최고의 블로그 마케팅 전문가이자 전문 작가입니다. 
단순한 AI가 아니라, 독자의 감정을 건드리고 체류 시간을 늘리는 '사람 냄새 나는 글'을 씁니다.

Tone & Manner:
1. 친근하되 전문성을 잃지 않는 '해요체'를 기본으로 사용합니다.
2. 문장은 너무 길지 않게 끊어서 가독성을 높입니다.
3. 기계적인 번역투나 딱딱한 문어체(~한다, ~이다)는 지양합니다.
4. 독자와 대화하듯 질문을 던지거나 공감을 유도하는 문구를 적절히 섞습니다.

Formatting Rules:
1. 가독성을 위해 적절한 소제목(##), 글머리 기호(-), 굵은 글씨(**)를 사용합니다.
2. 중요한 정보는 눈에 띄게 강조합니다.
3. 서론-본론-결론의 논리적 구조를 갖춥니다.

Goal:
사용자가 제공하는 키워드나 주제를 바탕으로 네이버/구글 검색 엔진 최적화(SEO)가 반영된 고품질의 콘텐츠를 생성하는 것입니다.

[추가 필수 지침]
1. 이모지는 절대 사용하지 마세요. (텍스트의 신뢰도와 전문성을 위해)
2. **본문 (headings)**:
   - 소제목은 5개 이상 생성하라.
   - 각 content는 4~5문장으로 풍성하게 작성하라.
   - 소제목(title)과 본문 첫 문장이 완전히 똑같지 않게 작성하라.
3. **제목 경쟁력 강화**:
   - 독자의 호기심과 감정을 자극하는 트리거 단어를 적절히 섞으세요.
   - 제목 길이는 28~35자 사이로 유지하여 가독성을 높이세요.
4. "앞으로의 행보가 기대됩니다" 같은 뻔한 마무리 문구는 절대 금지입니다.
5. 소제목마다 다양한 문체(의문문, 감탄문 등)를 사용하여 읽는 재미를 주세요.
6. 구체적인 수치, 실제 경험담을 섞어 전문성과 신뢰도를 높이세요.
  `.trim();

  // 1. API 키 로드 (Gemini Only)
  let apiKey = config?.geminiApiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');
  const trimmedKey = apiKey.trim();

  // 2. 모델 목록 설정 (✅ 사용자 확언: Gemini 3 제품군이 가장 잘 작동함)
  // ✅ [2026-01-26 FIX] perplexity 계열 모델은 Gemini에서 필터링 (별도 provider 사용)
  let primaryModel = config?.primaryGeminiTextModel || config?.geminiModel || 'gemini-3-flash-preview';
  if (primaryModel.toLowerCase().includes('perplexity')) {
    primaryModel = 'gemini-3-flash-preview'; // perplexity 선택 시 Gemini 기본값 사용
  }
  const baseModels = [
    'gemini-3-flash-preview', // 최우선: 고속/고성능
    'gemini-3-pro-preview',   // 상위: 고품질
    'gemini-2.5-flash',       // 중위: 안정적
    'gemini-2.0-flash-exp',   // 최근 모델
    'gemini-1.5-flash',       // 폴백
    'gemini-1.5-pro'          // 폴백
  ];

  // 선택된 모델을 가장 앞에 두고 나머지를 배치 (중복 제거)
  const uniqueModels = Array.from(new Set([primaryModel, ...baseModels]));

  let lastError: Error | null = null;
  const perModelMaxRetries = 1; // ✅ 동일 모델 재시도 1회로 제한 (빠른 전환)

  for (let i = 0; i < uniqueModels.length; i++) {
    const modelName = uniqueModels[i];
    let modelRetryCount = 0;

    while (modelRetryCount < perModelMaxRetries) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const client = new GoogleGenerativeAI(trimmedKey);
        const model = client.getGenerativeModel({ model: modelName });

        console.log(`[Gemini] 시도 중: ${modelName} (시도 ${modelRetryCount + 1}/${perModelMaxRetries})`);
        const streamPromise = model.generateContentStream({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: { role: 'system', parts: [{ text: systemInstructionText }] },
          generationConfig: {
            temperature: temperature,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 16000,
            // @ts-ignore
            responseMimeType: 'application/json',
          },
        });

        // 첫 응답 타임아웃 (120초)
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('⏱️ 연결 타임아웃')), 20000);
        });

        const streamResult = await Promise.race([streamPromise, timeoutPromise]);
        let text = '';

        // ✅ 스트림 전체 수신 타임아웃 (3분) - 무한 대기 방지
        const recvPromise = (async () => {
          for await (const chunk of streamResult.stream) {
            text += chunk.text();
          }
        })();

        await Promise.race([
          recvPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('⏱️ 생성 시간 초과(3분)')), 180000))
        ]);

        if (text && text.trim()) {
          console.log(`✅ [Gemini] 응답 수신 완료 (모델: ${modelName}, 길이: ${text.length})`);

          // 1. 인코딩 보정
          text = fixUtf8Encoding(text);

          // 2. JSON 정리 및 추출
          let cleaned = text.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');
          }
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start !== -1 && end !== -1 && end > start) {
            cleaned = cleaned.substring(start, end + 1);
          }

          return cleaned;
        }
        throw new Error('응답이 비어있습니다.');

      } catch (error) {
        const errMsg = (error as Error).message || String(error);
        lastError = error as Error;

        // 할당량 초과(429) 처리
        const isQuota = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('limit: 0') || errMsg.includes('Too Many Requests');

        if (isQuota) {
          modelRetryCount++;
          let waitMs = 15000; // ✅ 대기 시간을 60초 -> 15초로 대폭 단축 (사용자 경험 우선)
          const retryMatch = errMsg.match(/retry in ([\d.]+)(s|ms)/i);
          if (retryMatch) {
            const val = parseFloat(retryMatch[1]);
            const unit = retryMatch[2].toLowerCase();
            waitMs = (unit === 's' ? val * 1000 : val) + 1000;
          }

          const waitSec = Math.round(waitMs / 1000);

          if (modelRetryCount < perModelMaxRetries) {
            // ✅ "다른 곳에서 하는게 빠르겠다"는 소리가 안 나오도록 문구 개선
            const logMsg = `구글 서버가 바쁘네요. ${waitSec}초만 더 기다려보고 안 되면 즉시 다른 모델로 전환할게요.`;
            console.warn(`⚠️ [Gemini Quota] ${logMsg}`);
            if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
              (window as any).appendLog(`⏳ ${logMsg}`);
            }
            await new Promise(resolve => setTimeout(resolve, waitMs));
            continue;
          } else {
            // 동일 모델 재시도 실패 -> 다음 모델로 신속 전환
            const nextModelName = uniqueModels[i + 1];
            const logMsg = nextModelName
              ? `${modelName} 할당량 초과. 기다리지 않고 더 빠른 ${nextModelName}(으)로 즉시 전환합니다!`
              : `${modelName} 할당량 소진. 모든 Gemini 모델 시도 완료...`;

            console.warn(`🚀 [Gemini Switch] ${logMsg}`);
            if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
              (window as any).appendLog(`🚀 ${logMsg}`);
            }
            break; // while 종료 -> 다음 모델 for 루프로
          }
        }

        // 404 모델 없음
        if (errMsg.includes('404') || errMsg.includes('not found')) {
          console.warn(`[Gemini 폴백] ${modelName} 모델 없음, 다음 모델로...`);
          break;
        }

        // 타임아웃 또는 기타 오류
        console.warn(`[Gemini 오류] ${modelName}: ${errMsg}`);
        break;
      }
    }
  }

  const finalError = lastError || new Error('모든 모델 시도 실패');
  throw new Error(`Gemini 호출 실패: ${finalError.message}`);
}

// ✅ UTF-8 인코딩 정리 함수 (깨진 한글 복구)
function fixUtf8Encoding(text: string): string {
  if (!text) return text;

  try {
    // 방법 1: Buffer 사용 (Node.js 환경)
    // 잘못된 인코딩으로 해석된 경우 복구 시도
    const buffer = Buffer.from(text, 'latin1');
    const utf8Text = buffer.toString('utf8');

    // UTF-8로 디코딩한 결과가 유효한 한글을 포함하는지 확인
    if (/[가-힣]/.test(utf8Text) && !utf8Text.includes('\ufffd')) {
      console.log('[인코딩 수정] latin1 → utf8 변환 성공');
      return utf8Text;
    }
  } catch (e) {
    // 무시
  }

  try {
    // 방법 2: 이중 인코딩된 경우 (UTF-8이 다시 UTF-8로 인코딩됨)
    const decoded = decodeURIComponent(escape(text));
    if (/[가-힣]/.test(decoded) && !decoded.includes('\ufffd')) {
      console.log('[인코딩 수정] 이중 인코딩 복구 성공');
      return decoded;
    }
  } catch (e) {
    // 무시
  }

  // 원본 반환 (이미 UTF-8이면 변환 필요 없음)
  return text;
}

// ✅ [2026-01-25] callOpenAI 함수 제거됨 - Perplexity로 대체
// 이전: ~185줄의 OpenAI API 호출 코드
// 현재: callPerplexity 함수가 perplexity.ts 모듈을 사용






// ✅ [2026-01-25] Perplexity API 호출 래퍼 추가
async function callPerplexity(prompt: string, temperature: number = 0.7, minChars: number = 2000): Promise<string> {
  console.log('[Perplexity] 콘텐츠 생성 시작');
  try {
    const result = await generatePerplexityContent(prompt, {
      wordCount: minChars,
      contentMode: 'seo',
    });
    console.log(`[Perplexity] 생성 완료: ${result.content.length}자`);
    return result.content;
  } catch (error) {
    console.error('[Perplexity] 생성 실패:', error);
    throw new Error(translatePerplexityError(error as Error));
  }
}

// ✅ [2026-01-25] callOpenAI 함수 - 기존 OpenAI API 호출 로직
async function callOpenAI(prompt: string, temperature: number = 0.9, minChars: number = 2000): Promise<string> {
  console.log('[OpenAI] JSON 형식 준수 요청 - 유니코드 이스케이프 4자리, 쉼표 필수');

  const openAIClients = new Map<string, OpenAI>();
  function getOpenAIClient(apiKey?: string): OpenAI {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY가 설정되어 있지 않습니다.');
    }
    if (!openAIClients.has(key)) {
      openAIClients.set(key, new OpenAI({ apiKey: key }));
    }
    return openAIClients.get(key)!;
  }

  const client = getOpenAIClient();

  // OpenAI 사용 가능한 모델 목록 (우선순위 순서)
  const openAIModels = [
    'gpt-4o',
    'gpt-4o-2024-08-06',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ];

  const customModel = process.env.OPENAI_STRUCTURED_MODEL;
  const modelsToTry = customModel
    ? [customModel, ...openAIModels.filter(m => m !== customModel)]
    : openAIModels;

  let lastError: Error | null = null;
  const timeoutMs = getTimeoutMs(minChars);

  for (const modelName of modelsToTry) {
    try {
      console.log(`[OpenAI] 시도: ${modelName}, 타임아웃: ${timeoutMs / 1000}초`);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`OpenAI API 호출 시간 초과`)), timeoutMs);
      });

      const createPromise = client.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature,
        top_p: 0.9,
        max_tokens: 16000,
      });

      const response = await Promise.race([createPromise, timeoutPromise]);
      const text = response.choices[0]?.message?.content?.trim() || '';

      if (!text) throw new Error('빈 응답');

      console.log(`[OpenAI] 성공: ${modelName}, ${text.length}자`);
      return text;

    } catch (error) {
      lastError = error as Error;
      const errorMessage = (error as Error).message.toLowerCase();

      if (errorMessage.includes('model') && (errorMessage.includes('not found') || errorMessage.includes('does not exist'))) {
        console.log(`[OpenAI] 모델 ${modelName} 없음, 다음 시도`);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`OpenAI 모델 사용 불가. 마지막 오류: ${lastError?.message}`);
}


// ✅ [2026-01-25] getAnthropicClient 헬퍼 함수 복원
const anthropicClients = new Map<string, Anthropic>();
function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.CLAUDE_API_KEY;
  if (!key) {
    throw new Error('CLAUDE_API_KEY가 설정되어 있지 않습니다.');
  }
  if (!anthropicClients.has(key)) {
    anthropicClients.set(key, new Anthropic({ apiKey: key }));
  }
  return anthropicClients.get(key)!;
}


async function callClaude(prompt: string, temperature: number = 0.9, minChars: number = 2000): Promise<string> {
  console.log('[Claude] JSON 형식 준수 요청 - 유니코드 이스케이프 4자리, 쉼표 필수');
  const timeoutMs = getTimeoutMs(minChars);
  console.log(`[Claude] 시작: 목표 ${minChars}자, 타임아웃 ${timeoutMs / 1000}초`);

  const client = getAnthropicClient();

  // Claude 사용 가능한 모델 목록 (우선순위 순서)
  const claudeModels = [
    'claude-3-5-sonnet-20241022',  // 최신 버전
    'claude-3-5-sonnet-20240620',  // 이전 버전
    'claude-3-5-sonnet',           // 버전 없이
    'claude-3-opus-20240229',      // Opus 모델
    'claude-3-sonnet-20240229',    // Sonnet 모델
    'claude-3-haiku-20240307',     // Haiku 모델 (가장 빠름)
  ];

  // 환경 변수로 지정된 모델이 있으면 맨 앞에 추가
  const customModel = process.env.CLAUDE_STRUCTURED_MODEL;
  const modelsToTry = customModel
    ? [customModel, ...claudeModels.filter(m => m !== customModel)]
    : claudeModels;

  let lastError: Error | null = null;

  // 각 모델을 순차적으로 시도
  for (const modelName of modelsToTry) {
    try {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`[Claude] 콘텐츠 생성 시작`);
      console.log(`  • 모델: ${modelName}`);
      console.log(`  • 목표 분량: ${minChars}자`);
      console.log(`  • 타임아웃: ${timeoutMs / 1000}초`);
      console.log(`  • Temperature: ${temperature}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      const startTime = Date.now();

      // ✅ 요청 직전 상세 로깅
      const apiUrl = `https://api.anthropic.com/v1/messages`;
      const requestBody = {
        model: modelName,
        max_tokens: 16000,
        temperature: temperature,
        messages: [{ role: 'user', content: prompt.substring(0, 500) + '...' }],
      };

      console.log('[API] 실제 요청 URL:', apiUrl);
      console.log('[API] 요청 헤더:', JSON.stringify({
        'Content-Type': 'application/json',
        'x-api-key': (process.env.CLAUDE_API_KEY?.substring(0, 10) || '') + '...',
        'anthropic-version': '2023-06-01'
      }));
      console.log('[API] 요청 바디 (첫 500자):', JSON.stringify(requestBody).substring(0, 500));
      console.log('[API] 전체 프롬프트 길이:', prompt.length, '자');
      console.log('[API] API 키 길이:', process.env.CLAUDE_API_KEY?.length || 0, '자');
      console.log('[API] API 키 앞 10자:', (process.env.CLAUDE_API_KEY?.substring(0, 10) || '없음') + '...');

      // 타임아웃 설정 (동적 조정)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Claude API 호출 시간 초과 (${timeoutMs / 1000}초)`));
        }, timeoutMs);
      });

      let response;
      try {
        const createPromise = client.messages.create({
          model: modelName,
          max_tokens: 16000, // 긴 글 생성을 위해 증가 (4096 → 16000)
          temperature: temperature, // 제목 다양성을 위해 높은 temperature 사용
          messages: [{ role: 'user', content: prompt }],
        });

        response = await Promise.race([createPromise, timeoutPromise]);

        // ✅ fetch 완료 후 상세 로깅
        const responseTime = Date.now() - startTime;
        console.log('[API] fetch 완료, response 객체:', {
          ok: true,
          status: '200 (추정)',
          statusText: 'OK',
          responseTime: `${responseTime}ms`,
          hasResponse: !!response,
          hasContent: !!response?.content,
          contentLength: response?.content?.length || 0
        });
      } catch (fetchError) {
        // ✅ fetch 실패 시 상세 로깅
        const responseTime = Date.now() - startTime;
        console.error('[API] fetch 실패:', {
          name: (fetchError as Error).name,
          message: (fetchError as Error).message,
          stack: (fetchError as Error).stack,
          cause: (fetchError as any).cause,
          responseTime: `${responseTime}ms`,
          timeout: timeoutMs,
          isTimeout: (fetchError as Error).message.includes('시간 초과') || (fetchError as Error).message.includes('timeout')
        });
        throw fetchError;
      }

      // ✅ response.json() 호출 전 (SDK의 content 추출 전)
      let text: string;
      try {
        text = response.content
          .map((block) => ('text' in block ? block.text : ''))
          .join('');

        // ✅ UTF-8 인코딩 문제 해결 (한글 깨짐 방지)
        const hasKorean = /[가-힣]/.test(text);
        const hasReplacementChar = text.includes('\ufffd') || text.includes('�');

        if (!hasKorean || hasReplacementChar) {
          console.log('[Claude] 한글 인코딩 문제 감지, 복구 시도...');
          text = fixUtf8Encoding(text);
        }

        console.log('[API] 응답 원문 (첫 1000자):', text.substring(0, 1000));
        console.log('[API] 응답 전체 길이:', text.length, '자');
      } catch (textError) {
        console.error('[API] response.content 추출 실패:', {
          name: (textError as Error).name,
          message: (textError as Error).message,
          stack: (textError as Error).stack,
          hasResponse: !!response,
          hasContent: !!response?.content,
          contentType: Array.isArray(response?.content) ? 'array' : typeof response?.content
        });
        throw textError;
      }
      const endTime = Date.now();
      const elapsed = (endTime - startTime) / 1000;

      console.log(`✅ [Claude] 생성 완료`);
      console.log(`  • 생성된 분량: ${text.length}자`);
      console.log(`  • 소요 시간: ${elapsed.toFixed(1)}초`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      if (!text.trim()) {
        throw new Error('Claude 응답이 비어 있습니다.');
      }

      return text;
    } catch (error) {
      const errorMessage = (error as Error).message || '';
      const errorStr = JSON.stringify(error);

      // 모델을 찾을 수 없는 오류
      const isModelNotFound = errorMessage.includes('not_found') ||
        errorMessage.includes('404') ||
        errorMessage.includes('model') ||
        errorStr.includes('not_found');

      // 크레딧 부족 오류
      const isCreditError = errorMessage.includes('credit') ||
        errorMessage.includes('balance') ||
        errorMessage.includes('too low') ||
        errorStr.includes('credit');

      if (isModelNotFound) {
        console.log(`[Claude] 모델 ${modelName}을 찾을 수 없습니다. 다음 모델로 시도합니다.`);
        lastError = error as Error;
        continue; // 다음 모델 시도
      }

      if (isCreditError) {
        throw new Error(
          `Claude API 크레딧이 부족합니다. Anthropic Console에서 크레딧을 충전해주세요.\n` +
          `원본 오류: ${errorMessage}`
        );
      }

      // 모델을 찾을 수 없는 오류가 아니면 즉시 throw
      throw error;
    }
  }

  // 모든 모델 시도 실패
  throw new Error(
    `Claude 모델을 사용할 수 없습니다. 시도한 모델: ${modelsToTry.join(', ')}\n` +
    `마지막 오류: ${lastError?.message || '알 수 없는 오류'}`
  );
}

export async function generateStructuredContent(
  source: ContentSource,
  options: GenerateOptions = {},
): Promise<StructuredContent> {
  if (!source?.rawText || !source.rawText.trim()) {
    throw new Error('rawText가 필요합니다.');
  }

  // ✅ [핵심 수정] 에러 페이지 크롤링 감지 - 쇼핑커넥트 모드에서만 캡차/에러 페이지 방지
  // ✅ [2026-01-21 FIX] SEO/홈피드 모드에서는 이 로직을 건너뜀 (키워드에 '오류' 포함 시 오작동 방지)
  const isShoppingConnectMode = source.isReviewType === true ||
    (source.url && (source.url.includes('smartstore.naver.com') ||
      source.url.includes('brand.naver.com') ||
      source.url.includes('naver.me')));

  // rawText뿐만 아니라 title에서도 에러 키워드 감지 (쇼핑커넥트 모드에서만)
  const errorKeywords = [
    '에러페이지', '에러 페이지', '에러 - ', '시스템오류', '시스템 오류',
    '접속이 불안정', '서비스 접속이', 'error page', 'system error', 'error -',
    '접근이 차단', '캡차', 'captcha', '로그인이 필요', 'access denied',
    '페이지를 찾을 수 없', '존재하지 않는 페이지', 'not found', '404',
    '점검 중', '서버 오류', '일시적 오류', '접속 불가', '차단되었습니다',
    'blocked', 'denied', 'forbidden', 'unauthorized', '권한이 없습니다'
  ];

  // ✅ rawText + title 모두 검사 (제목에만 에러 키워드가 있는 경우도 감지)
  const textToCheck = `${source.rawText || ''} ${source.title || ''}`.toLowerCase();

  // ✅ [2026-01-21 FIX] 에러 페이지 감지는 쇼핑커넥트 모드에서만!
  // SEO/홈피드 모드에서 "오류 해결 방법" 같은 키워드가 있어도 정상 동작하도록
  const isErrorPage = isShoppingConnectMode && errorKeywords.some(kw => textToCheck.includes(kw.toLowerCase()));

  // ✅ 디버그 로그
  if (textToCheck.includes('에러') || textToCheck.includes('오류')) {
    console.log(`[ContentGenerator] 🔍 에러 키워드 감지 분석:`);
    console.log(`   - isShoppingConnectMode: ${isShoppingConnectMode}`);
    console.log(`   - rawText 길이: ${source.rawText?.length || 0}자`);
    console.log(`   - title: "${source.title || '없음'}"`);
    console.log(`   - '에러' 포함 여부: ${textToCheck.includes('에러')}`);
    console.log(`   - isErrorPage (최종): ${isErrorPage}`);
  }

  if (isErrorPage) {
    console.warn('[ContentGenerator] ⚠️ 에러 페이지 감지 - 공식 API로 폴백 시도...');
    console.log('[ContentGenerator] 📋 source 정보:', {
      url: source.url,
      title: source.title,
      rawTextLength: source.rawText?.length,
    });

    // ✅ [완벽 해결] 에러 페이지 대신 공식 API로 정보 수집
    // 1차: URL에서 스토어명/상품번호 추출
    const affiliateUrl = source.url || '';
    let storeName = '';
    let productNo = '';

    // URL 패턴에서 정보 추출
    const storeMatch = affiliateUrl.match(/(?:smartstore|brand)\.naver\.com\/([^\/\?]+)/);
    if (storeMatch) storeName = storeMatch[1];

    const productMatch = affiliateUrl.match(/products\/(\d+)/);
    if (productMatch) productNo = productMatch[1];

    console.log(`[ContentGenerator] 📎 URL 분석: 스토어="${storeName}", 상품번호="${productNo}", URL="${affiliateUrl.substring(0, 80)}..."`);

    // 2차: 제목에서 상품명 추출 (폴백)
    let searchKeyword = '';
    if (storeName) {
      searchKeyword = storeName;
    } else if (source.title && !source.title.includes('에러') && !source.title.includes('오류')) {
      // 제목이 있고 에러 관련 키워드가 없으면 제목 사용
      searchKeyword = source.title.replace(/\[.*?\]/g, '').trim().slice(0, 30);
      console.log(`[ContentGenerator] 📎 제목에서 검색어 추출: "${searchKeyword}"`);
    }

    // 검색어가 있으면 공식 API로 검색
    if (searchKeyword) {
      try {
        const { searchShopping, stripHtmlTags } = await import('./naverSearchApi.js');

        console.log(`[ContentGenerator] 🔍 공식 API 검색: "${searchKeyword}"`);
        const searchResult = await searchShopping({ query: searchKeyword, display: 5 });

        if (searchResult.items.length > 0) {
          const item = searchResult.items[0];
          const productName = stripHtmlTags(item.title);
          const price = parseInt(item.lprice) || 0;
          const brand = item.brand || item.maker || storeName || searchKeyword;
          const category = [item.category1, item.category2].filter(Boolean).join(' > ');

          // rawText를 공식 API 결과로 대체
          source.rawText = `
상품명: ${productName}
가격: ${price.toLocaleString()}원
브랜드: ${brand}
카테고리: ${category}
판매처: ${item.mallName || storeName || '네이버 쇼핑'}

이 제품은 ${brand}에서 만든 ${category} 카테고리의 상품입니다.
현재 가격은 ${price.toLocaleString()}원이며, ${item.mallName || '네이버 스마트스토어'}에서 판매 중입니다.
${productName}은(는) 많은 고객들에게 사랑받는 인기 상품입니다.

제품의 주요 특징과 장점을 살펴보면, 품질과 가격 대비 만족도가 높은 것으로 알려져 있습니다.
실제 사용자들의 리뷰를 참고하면 더욱 현명한 구매 결정을 내릴 수 있습니다.
`;
          console.log(`[ContentGenerator] ✅ 공식 API로 rawText 대체 완료: "${productName}" (${price.toLocaleString()}원)`);
          // 에러 페이지 우회 성공 - 다음 단계 진행
        } else {
          console.warn(`[ContentGenerator] ⚠️ 공식 API 검색 결과 없음: "${searchKeyword}"`);
          throw new Error('공식 API 검색 결과 없음');
        }
      } catch (apiError) {
        console.error(`[ContentGenerator] ❌ 공식 API 폴백 실패: ${(apiError as Error).message}`);
        throw new Error(
          '❌ 제휴 링크 크롤링 실패: 에러 페이지가 감지되었고, 공식 API 검색도 실패했습니다.\n\n' +
          '🔧 해결 방법:\n' +
          '1. 제휴 링크가 유효한지 확인해주세요\n' +
          '2. 잠시 후 다시 시도해주세요 (네이버 측 일시적 문제일 수 있음)\n' +
          '3. 직접 브라우저에서 제휴 링크를 열어 상품 페이지가 정상적으로 표시되는지 확인해주세요\n\n' +
          '💡 팁: smartstore.naver.com 또는 brand.naver.com 직접 URL을 사용하면 더 안정적입니다.'
        );
      }
    } else {
      // URL과 제목 모두에서 정보 추출 실패
      console.error(`[ContentGenerator] ❌ URL과 제목 모두에서 검색어 추출 실패`);
      throw new Error(
        '❌ 제휴 링크 크롤링 실패: 에러 페이지가 감지되었습니다.\n\n' +
        '🔧 해결 방법:\n' +
        '1. 제휴 링크가 유효한지 확인해주세요\n' +
        '2. 잠시 후 다시 시도해주세요 (네이버 측 일시적 문제일 수 있음)\n' +
        '3. 직접 브라우저에서 제휴 링크를 열어 상품 페이지가 정상적으로 표시되는지 확인해주세요\n\n' +
        '💡 팁: smartstore.naver.com 또는 brand.naver.com 직접 URL을 사용하면 더 안정적입니다.'
      );
    }
  }

  // ✅ 하이브리드 모드 비활성화 (2024-01-02)
  // 기존: SEO + 홈판 동시 생성 후 결과 합침 → API 비용 2배, 모드 구분 무의미
  // 변경: 사용자가 선택한 모드만 사용 → API 비용 절감, 모드별 명확한 구분
  // const requestedMode = (options as any).contentMode || source.contentMode || 'seo';
  // const skipHybrid = (source as any).__skipHybrid === true;
  // if (!skipHybrid && (requestedMode === 'seo' || requestedMode === 'homefeed')) {
  //   const baseSource: ContentSource = { ...source, contentMode: 'seo' };
  //   const overlaySource: ContentSource = { ...source, contentMode: 'homefeed' };
  //   (baseSource as any).__skipHybrid = true;
  //   (overlaySource as any).__skipHybrid = true;
  //
  //   try {
  //     const seoPromise = generateStructuredContent(baseSource, options);
  //     const homePromise = (async () => {
  //       await new Promise((r) => setTimeout(r, 800));
  //       return generateStructuredContent(overlaySource, options);
  //     })();
  //     const [seo, home] = await Promise.all([seoPromise, homePromise]);
  //     return mergeSeoWithHomefeedOverlay(seo, home, source);
  //   } catch (err) {
  //     try {
  //       const seo = await generateStructuredContent(baseSource, options);
  //       const home = await generateStructuredContent(overlaySource, options);
  //       return mergeSeoWithHomefeedOverlay(seo, home, source);
  //     } catch {
  //       throw err;
  //     }
  //   }
  // }

  // 글자수에 따라 최적 provider 자동 선택
  let provider = options.provider ?? source.generator;
  // ✅ 기본 글자수: 3000자 (풍부한 내용 + 최적 분량, 양보다 질 최극상)
  const minChars = options.minChars ?? 3000;

  // ✅ [2026-01-26 FIX] primaryGeminiTextModel에서 perplexity-sonar 선택 시 provider 강제 설정
  // 사용자가 환경설정에서 Perplexity를 선택하면 항상 Perplexity 사용
  try {
    const config = await loadConfig();
    const selectedModel = config?.primaryGeminiTextModel || config?.geminiModel || '';

    if (selectedModel === 'perplexity-sonar' || selectedModel.startsWith('perplexity')) {
      provider = 'perplexity';
      console.log(`[ContentGenerator] ✅ Perplexity AI 선택됨 (모델: ${selectedModel})`);
    } else if (!provider) {
      provider = 'gemini';
      console.log(`[ContentGenerator] 자동 provider 선택: ${provider} (목표: ${minChars}자)`);
    }
  } catch {
    if (!provider) {
      provider = 'gemini';
      console.log(`[ContentGenerator] 자동 provider 선택: ${provider} (목표: ${minChars}자)`);
    }
  }

  const MAX_ATTEMPTS = Math.max(1, Number(process.env.CONTENT_MAX_ATTEMPTS ?? 3));
  const RETRY_DELAYS = [0, 1200, 2000, 3000, 4500, 6000, 8000];

  // ✅ Gemini 전용 강화 재시도 시스템
  // 대부분의 사용자가 Gemini만 사용 (무료) → 폴백 없이 Gemini로 더 많이 재시도
  let networkErrorCount = 0;
  const GEMINI_MAX_RETRIES = Math.max(0, Number(process.env.GEMINI_NETWORK_MAX_RETRIES ?? 3));
  const GEMINI_RETRY_DELAYS = [1200, 2000, 3000, 4500, 6000, 8000, 10000];

  console.log(`[ContentGenerator] Gemini 전용 강화 재시도 모드: 최대 ${GEMINI_MAX_RETRIES}회 재시도`)

  // ✅ 성공률 통계 추적
  const statsFile = path.join(app.getPath('userData'), 'content-generation-stats.json');
  let stats = { total: 0, success: 0, failed: 0, attempts: { first: 0, second: 0, third: 0, fourth: 0 } };

  try {
    if (fsSync.existsSync(statsFile)) {
      const statsData = fsSync.readFileSync(statsFile, 'utf-8');
      stats = JSON.parse(statsData);
    }
  } catch (error) {
    console.warn('[ContentGenerator] 통계 파일 읽기 실패, 새로 시작:', (error as Error).message);
  }

  stats.total++;

  // LLM이 목표치보다 짧게 생성되는 경향을 보완하기 위해
  // 연령대/사용자 설정 최소 글자수(minChars)에 적절한 여유를 두고 요청합니다.
  // 제목만 생성하는 경우(minChars < 1000)는 요청 글자수를 줄여서 빠르게 처리
  const isTitleOnly = minChars < 1000;
  // AI에게 요청할 글자수: 1.5배 요청
  // - 2000자 목표 → 3000자 요청 → 실제 2000~2500자 생성
  // 단, 네이버 제한의 80%를 넘지 않음 (80,000자)
  const SAFE_MAX_CHARS = Math.floor(100000 * 0.8); // 80,000자
  const requestMultiplier = isTitleOnly ? 1.5 : 1.2;
  const requestedMinChars = isTitleOnly
    ? Math.round(minChars * requestMultiplier)
    : Math.min(Math.round(minChars * requestMultiplier), SAFE_MAX_CHARS);
  // 검증 기준: 완화 적용 (75% 달성 시 통과)
  // - 75% 이상이면 통과 (2000자 목표 → 1500자 이상이면 OK)
  // - 50% 이상이면 경고만 하고 통과
  // - 50% 미만일 때만 재시도
  const validationMinChars = Math.round(minChars * 0.75); // 75% 달성 시 통과
  const warningMinChars = Math.round(minChars * 0.50); // 경고 기준 50%

  let extraInstruction = '';
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // 재시도 전 대기 (Rate Limit 회피)
      if (attempt > 0) {
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        console.log(`[ContentGenerator] 재시도 ${attempt}/${MAX_ATTEMPTS}: ${delay / 1000}초 대기 후 재개`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // 재시도 시에도 동일한 분량 요청 (일관성 유지)
      const adjustedMinChars = requestedMinChars;

      console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: 요청 글자수 ${adjustedMinChars}자`);

      console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: 요청 글자수 ${adjustedMinChars}자`);

      // ✅ 수집된 이미지가 있으면 프롬프트에 이미지 정보 포함 (참고용)
      if (source.images && source.images.length > 0) {
        extraInstruction += `\n\n[참고 이미지 정보]\n사용 가능한 제품/현장 이미지 ${source.images.length}장이 있습니다. 본문 작성 시 이를 염두에 두고 생동감 있게 묘사해주세요.`;
      }

      // ✅ [2026-01-21 FIX] 쇼핑커넥트 모드: 제품 리뷰 블로그 스타일 지시문 추가
      // 쇼핑몰 후기글이 아닌 "개인 블로그 제품 리뷰글" 스타일로 작성
      if (isShoppingConnectMode) {
        // ✅ [2026-01-21] 상품 카테고리 자동 감지 및 프롬프트 주입
        const productName = (source as any)?.productInfo?.name || source.title || '';
        const categoryResult = detectProductCategory(productName, source.rawText?.slice(0, 500));

        // 카테고리별 적절한 표현 및 금지 표현 지침
        let categoryGuidance = '';
        if (categoryResult.confidence !== 'low') {
          categoryGuidance = `

════════════════════════════════════════
📦 [상품 카테고리: ${categoryResult.categoryKorean}] - 필수 준수
════════════════════════════════════════

⚠️ 이 상품은 "${categoryResult.categoryKorean}" 카테고리입니다.
반드시 이 카테고리에 맞는 표현만 사용하세요!

`;
          // 카테고리별 금지 표현 및 권장 표현
          if (categoryResult.category === 'food') {
            categoryGuidance += `
⛔ [식품/농산물 - 절대 금지 표현]:
- "조립이 필요 없는", "설치가 간편한" → 가전제품용! 식품에 사용 금지!
- "배터리 수명", "충전 속도" → 전자제품용! 식품에 사용 금지!
- "사이즈", "핏", "착용감" → 의류용! 식품에 사용 금지!

✅ [식품/농산물 - 권장 표현]:
- 신선도, 당도, 과즙, 풍미, 식감, 맛, 향
- "개봉 후 빠른 소비 권장", "냉장/냉동 보관"
- "유기농", "GAP 인증", "친환경", "국내산", "제철"
- "한 입 베어물면", "입 안 가득 퍼지는"
`;
          } else if (categoryResult.category === 'electronics') {
            categoryGuidance += `
✅ [가전/전자제품 - 사용 가능 표현]:
- 조립, 설치, 배터리, 충전, 소음, 전력, 성능
- "설치가 간편한", "조립이 필요 없는"
- "배터리 수명", "충전 속도", "소음 레벨"

⛔ [가전제품 - 금지 표현]:
- "당도", "신선도", "과즙" → 식품용!
- "착용감", "핏", "사이즈" → 의류용!
`;
          } else if (categoryResult.category === 'cosmetics') {
            categoryGuidance += `
✅ [화장품/스킨케어 - 사용 가능 표현]:
- 발림성, 흡수력, 촉촉함, 보습, 피부결
- "피부에 바르는 순간", "하루 종일 촉촉"

⛔ [화장품 - 금지 표현]:
- "조립", "설치", "충전" → 가전용!
- "당도", "신선도" → 식품용!
`;
          } else if (categoryResult.category === 'fashion') {
            categoryGuidance += `
✅ [의류/패션 - 사용 가능 표현]:
- 사이즈, 핏, 착용감, 신축성, 통기성, 소재
- "몸에 딱 맞는", "입자마자 편한"

⛔ [의류 - 금지 표현]:
- "조립", "설치", "충전" → 가전용!
- "당도", "신선도", "과즙" → 식품용!
`;
          } else if (categoryResult.category === 'furniture') {
            categoryGuidance += `
✅ [가구/인테리어 - 사용 가능 표현]:
- 조립, 설치, 배치, 공간, 원목, 내구성
- "조립이 간편한", "설치가 쉬운"

⛔ [가구 - 금지 표현]:
- "당도", "신선도", "과즙" → 식품용!
- "착용감", "핏" → 의류용!
`;
          }
        }

        extraInstruction += categoryGuidance;
        extraInstruction += `

════════════════════════════════════════
🛒 [제품 리뷰 블로그 스타일 - 필수 적용]
════════════════════════════════════════

⚠️ 중요: 이 글은 "쇼핑몰 구매 후기"가 아닙니다!
당신은 개인 블로거로서 직접 제품을 사용해본 경험을 바탕으로 한 "제품 리뷰 블로그 포스트"를 작성하는 것입니다.

✅ 필수 스타일:
1. **1인칭 경험 기반**: "저는 OO 제품을 2주 정도 사용해봤어요", "직접 써보니까..."
2. **솔직한 장단점 서술**: 장점만 나열하지 말고, 단점도 솔직하게 언급 (신뢰도 ↑)
3. **구체적 사용 경험**: "배송 받자마자", "처음 열어봤을 때", "일주일 써보니"
4. **비교 분석**: 비슷한 제품과 비교하거나, 이전에 쓰던 것과 비교
5. **추천 대상 명시**: "이런 분들한테 추천해요", "이런 분은 피하세요"
6. **실제 사용 팁**: 본인만의 활용법, 꿀팁 공유

❌ 절대 금지 (쇼핑몰 후기 스타일):
- "상품이 도착했습니다", "포장이 꼼꼼했어요" (택배 후기 X)
- "가격 대비 만족", "배송 빨랐습니다" (단순 구매평 X)
- "5점 만점에 5점입니다" (점수 평가 X)
- "재구매 의사 있습니다" (쇼핑몰 후기 상투어 X)
- "판매자님 친절하셨어요" (판매자 평가 X)

✅ 제목/소제목 예시:
- "OO 제품 2주 실사용 후기, 진짜 효과 있었을까?"
- "OO vs XX 비교, 직접 써보고 내린 결론"
- "OO 제품 솔직 리뷰, 장점 3가지 & 아쉬운 점 2가지"
- "OO 이거 살까 말까? 고민하는 분들 보세요"

✅ 서론 예시:
"요즘 OO 제품이 핫하길래 저도 한번 써봤어요.
솔직히 처음엔 반신반의했는데, 막상 2주 정도 써보니까 느낀 점이 꽤 많더라고요.
오늘은 제가 직접 느낀 장단점 솔직하게 풀어볼게요."

✅ 본문 구조:
1번 소제목: 제품 첫인상 (개봉기 아님, 사용 시작 느낌)
2~4번 소제목: 실제 사용 경험, 효과, 비교
5~6번 소제목: 장단점 정리, 추천 대상
마무리: 총평 + "이런 분께 추천/비추천"

기억하세요: 당신은 쇼핑몰 판매자가 아닌 "제품을 직접 써본 블로거"입니다!
`;
        console.log('[ContentGenerator] 🛒 쇼핑커넥트 모드: 제품 리뷰 블로그 스타일 지시문 적용됨');
      }

      let metrics: { searchVolume?: number; documentCount?: number } | undefined;
      try {
        const primaryKeyword = getPrimaryKeywordFromSource(source);
        if (primaryKeyword) {
          console.log(`[ContentGenerator] 키워드 "${primaryKeyword}" 지표 수집 시작...`);
          const config = await loadConfig();
          const searchVol = await trendAnalyzer.getSearchVolume(
            primaryKeyword,
            config.naverAdApiKey || '',
            config.naverAdSecretKey || '',
            config.naverAdCustomerId || ''
          );
          const docCount = await trendAnalyzer.getDocumentCount(
            primaryKeyword,
            config.naverDatalabClientId || '',
            config.naverDatalabClientSecret || ''
          );

          if (searchVol >= 0 || docCount > 0) {
            metrics = {
              searchVolume: searchVol >= 0 ? searchVol : undefined,
              documentCount: docCount > 0 ? docCount : undefined
            };
            console.log(`[ContentGenerator] ✅ "${primaryKeyword}" 지표 주입 완료: 검색량 ${searchVol}, 문서량 ${docCount}`);
          }
        }
      } catch (err) {
        console.warn('[ContentGenerator] ⚠️ 네이버 지표 수집 실패 (무시하고 진행):', (err as Error).message);
      }

      const basePrompt = buildPrompt(source, adjustedMinChars, metrics);
      const prompt = `${basePrompt}${extraInstruction}`;
      let raw: string;

      // ✅ 다양성 극대화를 위해 temperature 높임 (매번 다른 글 생성)
      // ✅ 모드별 프롬프트 및 온도 설정 가져오기
      const mode = (source.contentMode || 'seo') as PromptMode;
      const systemPrompt = buildModeBasedPrompt(source, mode, metrics, adjustedMinChars);

      // ✅ [Traffic Hunter 통합] buildModeBasedPrompt 내에서 계산된 temperature 값을 가져와야 함.
      // 하지만 buildModeBasedPrompt는 string만 반환하므로, 여기서 다시 온도 계산 (중복을 피하려면 리팩토링이 필요하지만 현재 흐름 유지)
      let temperature = 0.5;
      if (mode === 'seo') temperature = 0.2;
      else if (mode === 'homefeed') temperature = 0.7;

      console.log(`[ContentGenerator] AI 호출 모드: ${mode}, 온도: ${temperature}`);

      // ✅ 3. AI 엔진 호출 (프롬프트/온도 반영)
      let rawResponse = '';
      console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: ${provider} API 호출 중...`);
      try {
        const apiStart = Date.now();
        if (provider === 'openai') {
          rawResponse = await callOpenAI(systemPrompt, temperature, adjustedMinChars);
        } else if (provider === 'claude') {
          rawResponse = await callClaude(systemPrompt, temperature, adjustedMinChars);
        } else if (provider === 'perplexity') {
          // ✅ [2026-01-25] Perplexity AI (Sonar) 실시간 검색 기반 콘텐츠 생성
          rawResponse = await callPerplexity(systemPrompt, temperature, adjustedMinChars);
        } else {
          rawResponse = await callGemini(systemPrompt, temperature, adjustedMinChars);
        }
        raw = rawResponse; // Assign rawResponse to raw for subsequent processing
        console.log(`[ContentGenerator] API 완료: ${provider} (${Date.now() - apiStart}ms)`);

        // 성공 시 네트워크 에러 카운트 초기화
        networkErrorCount = 0;
        console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: ${provider} API 응답 받음 (길이: ${raw.length})`);

      } catch (apiError) {
        const errorMsg = (apiError as Error).message || '';
        const isNetworkError =
          errorMsg.includes('타임아웃') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('네트워크') ||
          errorMsg.includes('network') ||
          errorMsg.includes('ECONNRESET') ||
          errorMsg.includes('ENOTFOUND') ||
          errorMsg.includes('fetch failed') ||
          errorMsg.includes('응답 대기 시간 초과') ||
          errorMsg.includes('연결 실패') || // ✅ 한글화된 네트워크 오류 처리
          // ✅ 503 서버 과부하 오류 추가 (Gemini API 과부하 시)
          errorMsg.includes('503') ||
          errorMsg.includes('overloaded') ||
          errorMsg.includes('Service Unavailable') ||
          errorMsg.includes('서버 오류') ||
          errorMsg.includes('500') ||
          errorMsg.includes('502') ||
          errorMsg.includes('504');

        if (isNetworkError) {
          networkErrorCount++;

          // ✅ Gemini 전용: 네트워크 에러 시 더 많이 재시도 (폴백 없음)
          if (networkErrorCount <= GEMINI_MAX_RETRIES) {
            const retryDelay = GEMINI_RETRY_DELAYS[Math.min(networkErrorCount - 1, GEMINI_RETRY_DELAYS.length - 1)];

            console.log(`\n${'='.repeat(60)}`);
            console.log(`[Gemini 재시도] ⏳ 네트워크 에러 ${networkErrorCount}/${GEMINI_MAX_RETRIES}`);
            console.log(`[Gemini 재시도] 💡 ${retryDelay / 1000}초 후 자동 재시도합니다...`);
            console.log(`[Gemini 재시도] 📡 인터넷 연결을 확인해주세요.`);
            console.log(`${'='.repeat(60)}\n`);

            // 점진적 대기 후 재시도
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
        }

        // ✅ [신규] 할당량 초과(429) 시 타 엔진 폴백 전략
        // "사용량 초과"는 gemini.ts에서 한글화된 메시지
        if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit: 0') || errorMsg.includes('사용량 초과')) {
          console.warn(`[ContentGenerator] ${provider} 할당량 초과 감지. 타 엔진 전환 확인 중...`);

          if (provider === 'gemini') {
            const config = await loadConfig(); // 실시간 설정 로드
            const hasClaude = !!(config.claudeApiKey || process.env.CLAUDE_API_KEY);
            const hasOpenAI = !!(config.openaiApiKey || process.env.OPENAI_API_KEY);

            if (hasClaude) {
              provider = 'claude';
              console.log('🚀 [Fallback] Gemini 대신 Claude로 엔진을 전환하여 즉시 재시도합니다.');
              if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
                (window as any).appendLog('🚀 Gemini 할당량 부족으로 Claude 엔진으로 전환하여 재시도합니다.');
              }
              continue;
            } else if (hasOpenAI) {
              provider = 'openai';
              console.log('🚀 [Fallback] Gemini 대신 OpenAI로 엔진을 전환하여 즉시 재시도합니다.');
              if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
                (window as any).appendLog('🚀 Gemini 할당량 부족으로 OpenAI 엔진으로 전환하여 재시도합니다.');
              }
              continue;
            } else {
              // ✨ [신규] 타 엔진이 없는 경우: 제미니 내부 모델(Pro -> Flash -> Exp) 전환에 의존
              if (attempt < MAX_ATTEMPTS) {
                const retryWait = 30000; // 30초 대기 (할당량 초기화 시간 확보)
                const logMsg = `타 엔진(Claude/OpenAI)이 설정되지 않아 Gemini 내부 모델들을 순환하며 재시도합니다. ${retryWait / 1000}초 후 다시 시작합니다.`;
                console.warn(`⚠️ [Gemini ONLY] ${logMsg}`);
                if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
                  (window as any).appendLog(`⌛ ${logMsg}`);
                }
                await new Promise(r => setTimeout(r, retryWait));
                continue;
              }
            }
          }
        }

        // 네트워크 에러가 아닌 경우 (API 키 문제 등) 그대로 throw
        throw apiError;
      }

      // ⚠️ JSON 파싱 시도 (safeParseJson이 이미 JSON5와 여러 재시도 로직 포함)
      let parsed: StructuredContent;
      try {
        parsed = safeParseJson<StructuredContent>(raw);
        console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: JSON 파싱 성공`);
      } catch (parseError) {
        console.error(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: JSON 파싱 실패 - 재시도 필요:`, (parseError as Error).message);

        // 마지막 시도가 아니면 재시도
        if (attempt < MAX_ATTEMPTS) {
          console.log(`[시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}] 재시도 중... AI에게 더 엄격한 JSON 형식 요청`);
          extraInstruction = `
⚠️⚠️⚠️ CRITICAL JSON FORMAT ERROR - ATTEMPT ${attempt + 1} FAILED ⚠️⚠️⚠️

ERROR: ${(parseError as Error).message}

You MUST fix these issues immediately:

1. ✅ MANDATORY COMMAS - This is the #1 error:
   ✓ CORRECT: {"a": "value1", "b": "value2"}
   ✗ WRONG: {"a": "value1" "b": "value2"}
   ✗ WRONG: {"a": "value1""b": "value2"}
   → Put comma (,) after EVERY property value, including the last one before the next property name

2. ✅ PROPER STRING FORMATTING:
   - NO literal line breaks inside strings
   - Use spaces instead of newlines
   - NO control characters (\\x00-\\x1F)
   - Escape quotes: \\" not "

3. ✅ CHECK YOUR OUTPUT:
   - Start with {
   - End with }
   - Every property: "key": "value",
   - Last property before } has NO trailing comma
   - NO markdown blocks (no \`\`\`json)

4. ✅ VALIDATION CHECKLIST:
   [ ] Does every property have a comma after it (except the last)?
   [ ] Are all strings properly quoted?
   [ ] No extra or missing brackets?
   [ ] Output starts with { and ends with }?

TRY AGAIN NOW. Output ONLY valid JSON.

${extraInstruction}`;
          continue; // 다음 시도로
        } else {
          // 마지막 시도도 실패
          throw parseError;
        }
      }

      // ✅ CRITICAL: bodyPlain 복구 로직 (Gemini가 'body' 필드로 반환하는 경우 처리)
      // AI가 bodyPlain 대신 body로 반환하거나, headings에만 content가 있는 경우 복구
      if (!parsed.bodyPlain || parsed.bodyPlain.trim().length === 0) {
        // 1차: 'body' 필드에서 복구 시도
        if ((parsed as any).body && typeof (parsed as any).body === 'string' && (parsed as any).body.trim().length > 0) {
          parsed.bodyPlain = (parsed as any).body;
          console.warn('[ContentGenerator] bodyPlain 누락 → body 필드에서 복구');
        }
        // 2차: headings의 content/summary에서 복구 시도
        else if (parsed.headings && parsed.headings.length > 0) {
          const headingContents: string[] = [];
          for (const h of parsed.headings) {
            const headingTitle = h.title || '';
            const headingBody = h.content || h.summary || '';
            if (headingTitle && headingBody) {
              headingContents.push(`${headingTitle}\n\n${headingBody}`);
            } else if (headingBody) {
              headingContents.push(headingBody);
            }
          }
          if (headingContents.length > 0) {
            parsed.bodyPlain = headingContents.join('\n\n\n');
            console.warn(`[ContentGenerator] bodyPlain 누락 → headings에서 복구 (${headingContents.length}개 섹션)`);
          }
        }
        // 3차: bodyHtml에서 텍스트 추출
        else if (parsed.bodyHtml && parsed.bodyHtml.trim().length > 0) {
          parsed.bodyPlain = parsed.bodyHtml
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
          console.warn('[ContentGenerator] bodyPlain 누락 → bodyHtml에서 복구');
        }
      }

      // 이스케이프 문자 정리 (JSON 파싱 후)
      if (parsed.bodyPlain) {
        parsed.bodyPlain = cleanEscapeSequences(parsed.bodyPlain);
      }
      if (parsed.bodyHtml) {
        parsed.bodyHtml = cleanEscapeSequences(parsed.bodyHtml);
      }

      // ⚠️ CRITICAL: 중복 소제목 제거 (AI가 같은 소제목을 반복하는 경우)
      if (parsed.bodyPlain && parsed.headings && parsed.headings.length > 0) {
        parsed.bodyPlain = removeDuplicateHeadings(parsed.bodyPlain, parsed.headings);

        // ⚠️ CRITICAL: 전체 글 구조 반복 감지 및 제거
        parsed.bodyPlain = removeRepeatedFullContent(parsed.bodyPlain, parsed.headings);
      }

      // ⚠️ 소제목 순서 및 중복 검증 (첫 시도 실패 → 1회 재시도 → 통과)
      // ✅ 성능과 품질 균형: 한 번만 재시도, 두 번째도 실패하면 통과
      const headingOrderValidation = validateHeadingOrder(parsed.headings, source.articleType);
      const duplicateContentValidation = detectDuplicateContent(parsed.bodyPlain || '', parsed.headings);

      if (!duplicateContentValidation.valid && attempt < MAX_ATTEMPTS) {
        const errs = duplicateContentValidation.errors.slice(0, 3).join(', ');
        console.warn(`[ContentGenerator] 중복/패턴 하드게이트 실패: ${errs}`);
        extraInstruction = `
[CRITICAL DUPLICATE/PATTERN DETECTED]
- Duplicate/pattern issues were detected: ${errs}
- You MUST remove repeated structure, repeated phrases, and duplicated heading sections.
- Rewrite the entire bodyPlain with fresh wording and different sentence patterns.

${extraInstruction}`;
        continue;
      }

      if (!headingOrderValidation.valid || !duplicateContentValidation.valid) {
        const validationErrors = [
          ...headingOrderValidation.errors,
          ...duplicateContentValidation.errors
        ];

        // ✅ 첫 번째 시도에서만 한 번 재시도 (속도와 품질 균형)
        if (attempt === 0) {
          console.warn(`[ContentGenerator] 검증 실패 (1회 재시도): ${validationErrors.slice(0, 2).join(', ')}`);
          extraInstruction = `\n⚠️ 검증 오류 발생. 소제목 순서와 중복을 확인하고 다시 작성하세요.\n${extraInstruction}`;
          continue; // 한 번만 재시도
        }

        // ✅ 두 번째 시도(attempt >= 1)에서는 경고 후 바로 통과
        console.warn(`[ContentGenerator] 검증 경고 (통과 처리): ${validationErrors.length}개 이슈`);

        if (!parsed.quality) {
          parsed.quality = {
            aiDetectionRisk: 'low',
            legalRisk: 'safe',
            seoScore: 70,
            originalityScore: 70,
            readabilityScore: 70,
            warnings: [],
          };
        }
        if (!parsed.quality.warnings) {
          parsed.quality.warnings = [];
        }
        parsed.quality.warnings.push(`검증 경고: ${validationErrors.slice(0, 2).join(', ')}`);
      }

      validateStructuredContent(parsed, source);

      // ✅ 제목 전체가 그대로 붙어버린 소제목들에서 제목 부분을 한 번 더 제거 (모드/카테고리 무관 공통 처리)
      stripSelectedTitlePrefixFromHeadings(parsed);

      // ✅ [소제목 최적화 마스터 모듈] - 구조 검증 후, 모드별 헤딩 타이틀만 보정
      optimizeHeadingsForMode(parsed, source);

      // ✅ [소제목 본문 동기화] - Stage 1 짧은 소제목을 Stage 2 본문의 전체 소제목으로 업데이트
      syncHeadingsWithBodyPlain(parsed);

      // ✅ 모드별 전용 검증 (제목/도입부/톤 등 추가 체크)
      validateSeoContent(parsed, source);      // SEO 모드: 키워드/숫자/트리거 검증
      validateHomefeedContent(parsed, source); // 홈판 모드: 소제목/도입부/기자체 검증

      if (mode === 'seo') {
        const issues = computeSeoTitleCriticalIssues(parsed.selectedTitle);
        if (issues.length > 0 && attempt < MAX_ATTEMPTS) {
          try {
            const patch = await generateTitleOnlyPatch(source, 'seo');
            if (patch.selectedTitle) parsed.selectedTitle = patch.selectedTitle;
            if (patch.titleCandidates && patch.titleCandidates.length > 0) {
              parsed.titleCandidates = patch.titleCandidates;
              parsed.titleAlternatives = patch.titleAlternatives || patch.titleCandidates.map(c => c.text);
            }
            if (!parsed.quality) {
              parsed.quality = {
                aiDetectionRisk: 'low',
                legalRisk: 'safe',
                seoScore: 70,
                originalityScore: 70,
                readabilityScore: 70,
                warnings: [],
              };
            }
            parsed.quality.warnings = [
              ...(parsed.quality.warnings || []),
              `TitlePatch(seo): ${issues.join(', ')}`,
            ];
          } catch {
          }
        }
      }

      if (mode === 'homefeed') {
        const titleIssues = computeHomefeedTitleCriticalIssues(parsed.selectedTitle);
        if (titleIssues.length > 0 && attempt < MAX_ATTEMPTS) {
          try {
            const patch = await generateTitleOnlyPatch(source, 'homefeed');
            if (patch.selectedTitle) parsed.selectedTitle = patch.selectedTitle;
            if (patch.titleCandidates && patch.titleCandidates.length > 0) {
              parsed.titleCandidates = patch.titleCandidates;
              parsed.titleAlternatives = patch.titleAlternatives || patch.titleCandidates.map(c => c.text);
            }
            if (!parsed.quality) {
              parsed.quality = {
                aiDetectionRisk: 'low',
                legalRisk: 'safe',
                seoScore: 70,
                originalityScore: 70,
                readabilityScore: 70,
                warnings: [],
              };
            }
            parsed.quality.warnings = [
              ...(parsed.quality.warnings || []),
              `TitlePatch(homefeed): ${titleIssues.join(', ')}`,
            ];
          } catch {
          }
        }

        const introIssues = computeHomefeedIntroCriticalIssues(parsed.introduction);
        if (introIssues.length > 0 && attempt < MAX_ATTEMPTS) {
          const patch = await generateHomefeedIntroOnlyPatch(source, parsed);
          if (patch?.introduction) {
            parsed.introduction = patch.introduction;
            if (!parsed.quality) {
              parsed.quality = {
                aiDetectionRisk: 'low',
                legalRisk: 'safe',
                seoScore: 70,
                originalityScore: 70,
                readabilityScore: 70,
                warnings: [],
              };
            }
            parsed.quality.warnings = [
              ...(parsed.quality.warnings || []),
              `IntroPatch(homefeed): ${introIssues.join(', ')}`,
            ];
          }
        }
      }

      const optimized = optimizeForViral(parsed, source);

      // ⚡ 과대광고 필터링 (AI 대신 후처리로 이동 - 타임아웃 방지)
      if (optimized.bodyPlain) {
        console.log('[ContentGenerator] 과대광고 필터링 적용 중...');
        optimized.bodyPlain = filterExaggeratedContent(optimized.bodyPlain);
      }

      // 최적화 후에도 이스케이프 문자 정리
      if (optimized.bodyPlain) {
        optimized.bodyPlain = cleanEscapeSequences(optimized.bodyPlain);
      }
      if (optimized.bodyHtml) {
        optimized.bodyHtml = cleanEscapeSequences(optimized.bodyHtml);
      }

      const plainLength = characterCount(optimized.bodyPlain, minChars);

      // 검증: 질과 길이의 균형
      // 80% 이상이면 완전 통과
      if (plainLength >= validationMinChars) {
        // ✅ 성공 통계 업데이트
        stats.success++;
        if (attempt === 0) stats.attempts.first++;
        else if (attempt === 1) stats.attempts.second++;
        else if (attempt === 2) stats.attempts.third++;
        else if (attempt === 3) stats.attempts.fourth++;

        const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
        console.log(`[ContentGenerator] ✅ 성공! (시도 ${attempt + 1}번째) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);

        // ✅ AI 탐지 회피 처리 (Humanizer) - 고속 최적화
        console.log('[ContentGenerator] 🔄 AI 탐지 회피 + 네이버 최적화 처리 시작...');
        resetHumanizerLog(); // 로그 플래그 리셋

        // AI 탐지 위험도 분석
        const riskAnalysis = analyzeAiDetectionRisk(optimized.bodyPlain || '');
        console.log(`[ContentGenerator] AI 탐지 위험도: ${riskAnalysis.score}/100`);

        // 위험도에 따른 humanize 강도 결정
        const humanizeIntensity: 'light' | 'medium' | 'strong' =
          riskAnalysis.score >= 50 ? 'strong' :
            riskAnalysis.score >= 25 ? 'medium' : 'light';

        // Humanize 적용
        if (optimized.bodyPlain) {
          optimized.bodyPlain = humanizeContent(optimized.bodyPlain, humanizeIntensity);
        }
        if (optimized.bodyHtml) {
          optimized.bodyHtml = humanizeHtmlContent(optimized.bodyHtml, humanizeIntensity);
        }

        // quality에 AI 탐지 정보 추가
        if (!optimized.quality) {
          optimized.quality = {
            aiDetectionRisk: 'low',
            legalRisk: 'safe',
            seoScore: 0,
            originalityScore: 0,
            readabilityScore: 0,
            warnings: [],
          };
        }
        optimized.quality.aiDetectionRisk = riskAnalysis.score >= 50 ? 'high' : riskAnalysis.score >= 25 ? 'medium' : 'low';
        if (riskAnalysis.issues.length > 0) {
          optimized.quality.warnings = [
            ...(optimized.quality.warnings || []),
            `AI 탐지 위험 요소: ${riskAnalysis.issues.join(', ')}`,
          ];
        }

        console.log(`[ContentGenerator] ✅ AI 탐지 회피 처리 완료 (강도: ${humanizeIntensity})`);

        // ✅ 네이버 최적화 처리 (2025.12 로직 대응)
        console.log('[ContentGenerator] 🚀 2025년 12월 네이버 최적화 처리 시작...');
        resetOptimizerLog(); // 로그 플래그 리셋

        // 중복 제거 + 저품질 제거 + 전문성 강화 + 애드포스트 최적화
        if (optimized.bodyPlain) {
          optimized.bodyPlain = optimizeContentForNaver(optimized.bodyPlain, source.toneStyle);
        }
        if (optimized.bodyHtml) {
          optimized.bodyHtml = optimizeHtmlForNaver(optimized.bodyHtml);
        }

        // 네이버 점수 분석
        const naverScore = analyzeNaverScore(optimized.bodyPlain || '');
        console.log(`[ContentGenerator] 네이버 최적화 점수: ${naverScore.score}/100`);
        console.log(`[ContentGenerator] - 전문성: ${naverScore.details.expertise}, 독창성: ${naverScore.details.originality}`);
        console.log(`[ContentGenerator] - 가독성: ${naverScore.details.readability}, 참여도: ${naverScore.details.engagement}`);

        // quality에 네이버 점수 추가
        if (optimized.quality) {
          optimized.quality.seoScore = naverScore.score;
          optimized.quality.originalityScore = naverScore.details.originality;
          optimized.quality.readabilityScore = naverScore.details.readability;
          if (naverScore.suggestions.length > 0) {
            optimized.quality.warnings = [
              ...(optimized.quality.warnings || []),
              ...naverScore.suggestions.map(s => `💡 ${s}`),
            ];
          }
        }

        console.log('[ContentGenerator] ✅ 네이버 최적화 완료');

        // ✅ [2026 100점] 쇼핑커넥트 모드: 금지 패턴 자동 검증
        const contentMode = source.contentMode || 'seo';
        if (contentMode === 'affiliate') {
          const validation = validateShoppingConnectContent(optimized);
          if (validation.score < 100) {
            console.warn(`[Shopping Connect] ⚠️ 품질 점수: ${validation.score}/100`);
            validation.feedback.forEach(f => console.log(`[Shopping Connect] ${f}`));

            // quality에 검증 결과 추가
            if (!optimized.quality) {
              optimized.quality = {
                aiDetectionRisk: 'low',
                legalRisk: 'safe',
                seoScore: 70,
                originalityScore: 70,
                readabilityScore: 70,
                warnings: [],
              };
            }
            optimized.quality.warnings = [
              ...(optimized.quality.warnings || []),
              `[쇼핑커넥트 검증] 품질 ${validation.score}/100`,
              ...validation.feedback.filter(f => f.startsWith('❌') || f.startsWith('⚠️')),
            ];
          } else {
            console.log(`[Shopping Connect] ✅ 품질 점수: ${validation.score}/100 (완벽!)`);
          }
        }

        // 통계 파일 저장
        try {
          await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
        } catch (error) {
          console.warn('[ContentGenerator] 통계 파일 저장 실패:', (error as Error).message);
        }

        // ✅ 최종 구조화 및 클리닝 (이모지, [공지], ?: 등 제거)
        return finalizeStructuredContent(optimized, source);
      }

      // 60% 이상이면 경고만 하고 통과 (질 우선) - 70%에서 60%로 완화
      const minAcceptableChars = Math.round(minChars * 0.60); // 60% 기준
      if (plainLength >= minAcceptableChars) {
        console.warn(`[ContentGenerator] 글자수 경고: ${plainLength}자 (목표: ${minChars}자, ${Math.round((plainLength / minChars) * 100)}%)`);

        // ✅ 경고 후 통과도 성공으로 카운트
        stats.success++;
        if (attempt === 0) stats.attempts.first++;
        else if (attempt === 1) stats.attempts.second++;
        else if (attempt === 2) stats.attempts.third++;
        else if (attempt === 3) stats.attempts.fourth++;

        const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
        console.log(`[ContentGenerator] ✅ 경고 후 통과 (시도 ${attempt + 1}번째) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);

        // 통계 파일 저장
        try {
          await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
        } catch (error) {
          console.warn('[ContentGenerator] 통계 파일 저장 실패:', (error as Error).message);
        }
        // 경고를 quality에 추가
        if (!optimized.quality) {
          optimized.quality = {
            aiDetectionRisk: 'low',
            legalRisk: 'safe',
            seoScore: 0,
            originalityScore: 0,
            readabilityScore: 0,
            warnings: [],
          };
        }
        if (!optimized.quality.warnings) {
          optimized.quality.warnings = [];
        }
        optimized.quality.warnings.push(
          `본문 길이가 목표보다 짧습니다 (${plainLength}자 / 목표: ${minChars}자). 내용의 질을 우선시하여 통과합니다.`
        );

        // ✅ 이모지 자동 제거 (AI가 생성한 이모지 제거)
        return finalizeStructuredContent(optimized, source);
      }

      // 60% 미만일 때만 재시도
      if (attempt === MAX_ATTEMPTS) {
        // 최종 시도에서도 50% 이상이면 경고만 하고 통과
        const finalMinChars = Math.round(minChars * 0.50); // 50%
        if (plainLength >= finalMinChars) {
          console.warn(`[ContentGenerator] 글자수 경고 (최종): ${plainLength}자 (목표: ${minChars}자, ${Math.round((plainLength / minChars) * 100)}%)`);
          if (!optimized.quality) {
            optimized.quality = {
              aiDetectionRisk: 'low',
              legalRisk: 'safe',
              seoScore: 0,
              originalityScore: 0,
              readabilityScore: 0,
              warnings: [],
            };
          }

          // ✅ [2026-01-23] 본문이 짧아도 에러 없이 진행 (연속발행 안정성)
          // 60% 미만이어도 경고만 남기고 콘텐츠 반환
          if (!optimized.quality.warnings) {
            optimized.quality.warnings = [];
          }

          if (plainLength >= minChars * 0.6) {
            optimized.quality.warnings.push(
              `본문 길이가 목표보다 약간 짧습니다 (${plainLength}자 / 목표: ${minChars}자). 최대한 내용을 보존하여 출력합니다.`
            );
          } else {
            // 60% 미만이어도 경고만 남기고 진행 (에러 throw 제거)
            console.warn(`[ContentGenerator] ⚠️ 본문 길이 미달 (${plainLength}자 / 목표: ${minChars}자, ${Math.round((plainLength / minChars) * 100)}%) - 진행 계속`);
            optimized.quality.warnings.push(
              `⚠️ 본문이 목표보다 많이 짧습니다 (${plainLength}자 / 목표: ${minChars}자). 내용 보강을 권장합니다.`
            );
          }
          return finalizeStructuredContent(optimized, source);
        }
      }

      // 재시도 시 목표치 증가
      // - 1차 재시도: 1.20배 (20% 증가)
      // - 2차 재시도: 1.40배 (40% 증가)
      const targetChars = Math.min(
        Math.round(requestedMinChars * (1 + attempt * 0.20)), // 재시도마다 20% 증가
        SAFE_MAX_CHARS // 최대 80,000자
      );
      extraInstruction = `

[REVISE REQUEST - URGENT - MANDATORY EXPANSION]
- ⚠️ CRITICAL: 현재 본문 분량이 ${plainLength}자로 목표(${minChars}자)의 ${Math.round((plainLength / minChars) * 100)}%에 불과합니다. 이것은 불충분합니다.
- ⚠️ REQUIREMENT: ${targetChars}자 목표로 확장해주세요.
- ⚠️ EXPANSION STRATEGY:
  * 각 소제목(heading) 섹션을 300-400자로 확장하세요
  * 각 소제목당 2-3개의 문단을 작성하세요
  * 각 문단은 80-120자 정도면 충분합니다
  * 구체적인 예시, 사례, 통계, 데이터를 각 섹션에 추가하세요
  * "왜"에 대한 설명을 추가하세요 (배경, 이유, 원인 등)
  * 실용적인 팁과 적용 방법을 구체적으로 설명하세요
  * 비교 분석이나 대안을 제시하세요
  * 전문가 인용이나 연구 결과를 포함하세요
  * 실제 경험담이나 시나리오를 추가하세요
- ⚠️ QUALITY REQUIREMENT: 가치 있는 정보로만 확장하세요:
  * 같은 내용 반복 금지
  * 의미 없는 문장 추가 금지
  * 억지로 글자수만 늘리는 것 금지
  * 구체적이고 실용적인 정보만 추가
- ⚠️ STRUCTURE REQUIREMENT: 본문을 확장할 때는 중간 섹션(본문 내용)을 확장하세요. 결론(headings 배열의 마지막 소제목)에 해당하는 본문을 작성한 후에는 즉시 멈추세요. 결론 후에는 어떤 내용도 추가하지 마세요.
- ⚠️ CHARACTER COUNT VERIFICATION: 확장 후 반드시 본문의 한글 글자수를 세어보세요. ${targetChars}자 이상이 되어야 합니다.
`;

    } catch (error) {
      // 오류 처리
      if (attempt === MAX_ATTEMPTS) {
        // ✅ 실패 통계 업데이트
        stats.failed++;
        const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
        console.error(`[ContentGenerator] ❌ 실패! (최대 시도 횟수 초과) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);

        // 통계 파일 저장
        try {
          await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
        } catch (saveError) {
          console.warn('[ContentGenerator] 통계 파일 저장 실패:', (saveError as Error).message);
        }

        throw error;
      }
      // 재시도 가능한 오류면 계속
      console.warn(`[시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}] 오류 발생, 재시도 중:`, (error as Error).message);
      extraInstruction = `\n\n⚠️ 이전 시도에서 오류가 발생했습니다. JSON 형식을 정확히 지켜주세요.`;
    }
  }

  // ✅ 모든 시도 실패
  stats.failed++;
  const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
  console.error(`[ContentGenerator] ❌ 실패! (모든 시도 실패) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);

  // 통계 파일 저장
  try {
    await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
  } catch (saveError) {
    console.warn('[ContentGenerator] 통계 파일 저장 실패:', (saveError as Error).message);
  }

  throw new Error('콘텐츠 생성에 실패했습니다.');
}

function optimizeForViral(content: StructuredContent, source: ContentSource): StructuredContent {
  const clone: StructuredContent = JSON.parse(JSON.stringify(content));

  // quality 객체 초기화 보장
  if (!clone.quality) {
    clone.quality = {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 0,
      originalityScore: 0,
      readabilityScore: 0,
      warnings: [],
    };
  }

  const paragraphs = clone.bodyPlain?.split(/\n{2,}/).filter((paragraph) => paragraph.trim()) ?? [];
  if (paragraphs.length === 0) {
    return clone;
  }

  const commentTriggers: CommentTrigger[] = [];
  const insertAt = (ratio: number): number => {
    if (paragraphs.length === 0) return 0;
    return Math.min(paragraphs.length, Math.max(0, Math.floor(paragraphs.length * ratio)));
  };

  // ✅ 문맥 확인: 본문 내용을 분석하여 카테고리와 일치하는지 확인
  const bodyText = clone.bodyPlain?.toLowerCase() || '';
  const isProductReview = /제품|상품|구매|리뷰|사용 환경|선택하는 게/i.test(bodyText);
  const isMarketing = /마케팅|비즈니스|브랜드|광고|마케터|사업자/i.test(bodyText);
  const isNews = /사건|뉴스|이슈|진실|전개/i.test(bodyText);
  const isEntertainment = /드라마|영화|배우|연예|시리즈/i.test(bodyText);

  // ✅ 문맥에 맞는 종결 문구만 삽입 (카테고리와 본문 내용이 일치하는 경우만)
  const articleType = source.articleType ?? 'general';
  let shouldInsertTriggers = true;

  // 카테고리와 본문 내용이 일치하지 않으면 종결 문구 삽입 안 함
  // ✅ [User Request] 문맥 검사 제거 (항상 종결 문구 삽입)
  /*
  if (articleType === 'it_review' && !isProductReview) {
    shouldInsertTriggers = false;
    console.log('[ContentGenerator] 카테고리(it_review)와 본문 내용이 일치하지 않아 종결 문구 삽입을 건너뜁니다.');
  } else if (articleType === 'news' && !isNews) {
    shouldInsertTriggers = false;
    console.log('[ContentGenerator] 카테고리(news)와 본문 내용이 일치하지 않아 종결 문구 삽입을 건너뜁니다.');
  } else if (articleType === 'entertainment' && !isEntertainment) {
    shouldInsertTriggers = false;
    console.log('[ContentGenerator] 카테고리(entertainment)와 본문 내용이 일치하지 않아 종결 문구 삽입을 건너뜁니다.');
  }
  */

  if (shouldInsertTriggers) {
    const opinionTrigger = generateOpinionTrigger(articleType);
    const opinionIndex = insertAt(0.4);
    paragraphs.splice(opinionIndex, 0, opinionTrigger);
    commentTriggers.push({ position: 0.4, type: 'opinion', text: opinionTrigger });

    const experienceTrigger = generateExperienceTrigger(articleType);
    const experienceIndex = insertAt(0.7);
    paragraphs.splice(experienceIndex, 0, experienceTrigger);
    commentTriggers.push({ position: 0.7, type: 'experience', text: experienceTrigger });

    const voteTrigger = generateVoteTrigger(articleType);
    const voteIndex = insertAt(0.95);
    paragraphs.splice(voteIndex, 0, voteTrigger);
    commentTriggers.push({ position: 0.95, type: 'vote', text: voteTrigger });
  } else {
    console.log('[ContentGenerator] 문맥에 맞지 않아 종결 문구를 삽입하지 않습니다.');
  }

  const shareQuote = extractShareableQuote(clone.bodyPlain);
  // ⚠️ CTA 문구 제거 - 자연스러운 종결로 대체
  // 더 이상 "공유하면 도움이", "놓치면 후회" 같은 문구를 추가하지 않음

  // ⚠️ CTA 문구 제거 - 자연스러운 종결로 대체
  // 더 이상 retention paragraph를 추가하지 않음

  clone.bodyPlain = paragraphs.join('\n\n');

  clone.viralHooks = {
    commentTriggers,
    shareTrigger: {
      position: 0.6,
      quote: shareQuote,
      prompt: '', // ⚠️ CTA 제거
    },
    bookmarkValue: {
      reason: '실전에서 반복 참고가 필요한 핵심 정보',
      seriesPromise: '', // ⚠️ CTA 제거
    },
  };

  const trafficStrategy = buildTrafficStrategy(source);
  clone.trafficStrategy = trafficStrategy;

  clone.postPublishActions = {
    selfComments: generateSelfComments(source, clone),
    shareMessage: `"${clone.selectedTitle}" — ${shareQuote}`,
    notificationMessage: `새 글 업로드! ${clone.selectedTitle}`,
  };

  clone.metadata = {
    ...clone.metadata,
    originalTitle: source.title,
    tone: inferTone(source),
    estimatedEngagement: clone.metadata.estimatedEngagement ?? estimateEngagement(source),
  };

  // SEO 점수 실제 계산
  try {
    const actualSEOScore = calculateSEOScore({
      content: clone.bodyPlain || '',
      title: clone.selectedTitle,
      headings: clone.headings,
      keywords: extractKeywordsFromContent(clone.bodyPlain || ''),
      targetKeyword: source.title || '',
      wordCount: clone.metadata?.wordCount || 0,
    });

    clone.quality.seoScore = actualSEOScore.totalScore;

    if (clone.metadata) {
      clone.metadata.keywordStrategy = actualSEOScore.strategy;
    }
  } catch (error) {
    console.warn('[SEO] 점수 계산 실패, 기본값 사용:', (error as Error).message);
    // 오류 시 기본값 유지
  }

  clone.quality = {
    ...clone.quality,
    viralPotential: clone.quality.viralPotential ?? estimateViralPotential(source),
    engagementScore: clone.quality.engagementScore ?? calculateEngagementScore(clone),
  };

  // ✅ CTA 생성 (항상 생성)
  const cta = generateCTA(source, source.articleType || 'general');
  if (cta) {
    clone.cta = cta;
    console.log(`[ContentGenerator] CTA 생성: ${cta.text}${cta.link ? ` → ${cta.link}` : ''}`);

    // ✅ CTA를 본문 끝에 자동 삽입 (Plain과 HTML 모두)
    if (clone.bodyPlain && cta.text) {
      const ctaPlainText = `\n\n🔗 ${cta.text}`;
      if (!clone.bodyPlain.includes(cta.text)) {
        clone.bodyPlain = clone.bodyPlain.trim() + ctaPlainText;
        console.log(`[ContentGenerator] ✅ CTA를 bodyPlain에 추가했습니다.`);
      }
    }

    if (clone.bodyHtml && cta.text && cta.link) {
      // HTML 버튼 형식으로 CTA 추가
      const ctaHtml = `\n\n<div style="text-align: center; margin: 2rem 0;">
  <a href="${cta.link}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 1rem 2rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 1.1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: all 0.3s;">
    ${cta.text} →
  </a>
</div>`;

      if (!clone.bodyHtml.includes(cta.text)) {
        clone.bodyHtml = clone.bodyHtml.trim() + ctaHtml;
        console.log(`[ContentGenerator] ✅ CTA를 bodyHtml에 추가했습니다.`);
      }
    }
  }

  return {
    ...clone,
    collectedImages: source.images || [], // ✅ 원본 소스의 이미지를 결과에 포함 전달
  };
}

function resolveCategoryLabel(articleType: ArticleType): string {
  switch (articleType) {
    case 'it_review':
      return 'IT 기기';
    case 'shopping_review':
      return '쇼핑템';
    case 'finance':
      return '재테크';
    case 'health':
      return '건강 관리';
    case 'sports':
      return '스포츠';
    case 'news':
      return '이슈';
    default:
      return '관심자';
  }
}

function generateOpinionTrigger(type: ArticleType): string {
  // ⚠️ 모든 형식적 종결 문구 제거 - AI 느낌나는 뻔한 마무리 금지
  // "앞으로의 전개를 지켜봐야겠습니다", "진실이 밝혀지길 바랍니다" 등 사용 금지
  const triggers: Partial<Record<ArticleType, string[]>> = {
    news: [], // ✅ 뻔한 문구 완전 제거
    entertainment: [], // ✅ 뻔한 문구 완전 제거
    sports: [], // ✅ 뻔한 문구 완전 제거
    health: [], // ✅ 뻔한 문구 완전 제거
    finance: [],
    it_review: [],
    shopping_review: [],
    product_review: [],
    place_review: [],
    restaurant_review: [],
    travel: [],
    food: [],
    recipe: [],
    fashion: [],
    beauty: [],
    interior: [],
    parenting: [],
    education: [],
    learning: [],
    hobby: [],
    culture: [],
    tips: [],
    howto: [],
    guide: [],
    general: [],
  };
  const options = triggers[type] ?? triggers.general ?? [];
  return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : '';
}

function generateExperienceTrigger(type: ArticleType): string {
  // ⚠️ 모든 맺음말 문구 제거 - 불필요한 반복 문구 없이 깔끔하게 마무리
  return '';
}

function generateVoteTrigger(type: ArticleType): string {
  // ⚠️ 모든 맺음말 문구 제거 - 불필요한 반복 문구 없이 깔끔하게 마무리
  return '';
}

function extractShareableQuote(content: string): string {
  const sentences = content
    .split(/[\n.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 70);
  const keywords = ['비법', '팁', '핵심', '주의', '꿀팁', '기억'];
  const keywordSentence = sentences.find((sentence) =>
    keywords.some((keyword) => sentence.includes(keyword)),
  );
  return keywordSentence ?? sentences[0] ?? '놓치기 아까운 정보가 가득해요!';
}

function getNextTopicHint(articleType: ArticleType): string {
  switch (articleType) {
    case 'it_review':
      return '가성비 대비 프리미엄 모델 비교 리뷰';
    case 'shopping_review':
      return '비슷한 가격대의 대체 제품 자세 비교';
    case 'finance':
      return '응용 전략과 실전 포트폴리오 사례';
    case 'health':
      return '실천 노하우와 생활 속 적용 팁';
    case 'sports':
      return '다음 경기 관전 포인트와 라인업 분석';
    case 'news':
      return '연속 이슈 흐름과 전망 정리';
    default:
      return '관련 주제 심화편';
  }
}

function inferTone(source: ContentSource): 'friendly' | 'expert' | 'relatable' {
  if (source.articleType === 'finance' || source.articleType === 'news') {
    return 'expert';
  }
  if (source.articleType === 'shopping_review' || source.articleType === 'it_review') {
    return 'relatable';
  }
  return 'friendly';
}

function estimateEngagement(source: ContentSource): GeneratedContentMetadata['estimatedEngagement'] {
  const baseViews = source.targetTraffic === 'viral' ? 6000 : 2200;
  return {
    views: baseViews + Math.floor(Math.random() * 1200),
    comments: source.targetTraffic === 'viral' ? 18 + Math.floor(Math.random() * 12) : 6,
    shares: source.targetTraffic === 'viral' ? 15 + Math.floor(Math.random() * 8) : 3,
  };
}

function estimateViralPotential(source: ContentSource): number {
  const base = source.targetTraffic === 'viral' ? 75 : 55;
  if (source.articleType && source.articleType.includes('review')) {
    return base + 10 + Math.floor(Math.random() * 10);
  }
  if (source.articleType === 'news' || source.articleType === 'finance') {
    return base + 5 + Math.floor(Math.random() * 8);
  }
  return base + Math.floor(Math.random() * 12);
}

function calculateEngagementScore(content: StructuredContent): number {
  const base =
    (content.quality.seoScore ?? 70) * 0.3 +
    (content.quality.originalityScore ?? 70) * 0.3 +
    (content.quality.readabilityScore ?? 70) * 0.2 +
    10;
  return Math.min(100, Math.round(base));
}

function buildTrafficStrategy(source: ContentSource): TrafficStrategy {
  const target = source.targetTraffic ?? 'steady';
  const category = source.categoryHint || '기타';
  const targetAge = source.targetAge || 'all';

  const recommendTime = getOptimalPublishTime(category, targetAge, target);

  const peakTime = new Date(recommendTime);
  peakTime.setHours(peakTime.getHours() + 1);
  const peakTimeStr = peakTime.toISOString().replace('T', ' ').slice(0, 19);

  return {
    peakTrafficTime: peakTimeStr,
    publishRecommendTime: recommendTime,
    shareableQuote: extractShareableQuote(source.rawText),
    controversyLevel:
      source.articleType && source.articleType.includes('review')
        ? 'medium'
        : source.articleType === 'news'
          ? 'low'
          : 'none',
    retentionHook: `관련 주제나 궁금한 점이 있으시면 댓글로 남겨주세요`,
  };
}

function generateCTA(source: ContentSource, articleType: ArticleType): { text: string; link?: string } | undefined {
  // ✅ 콘텐츠 내용에서 키워드 추출
  const contentText = (source.title || '') + ' ' + (source.rawText?.substring(0, 500) || '');
  const lowerContent = contentText.toLowerCase();

  // ✅ 키워드별 공식 사이트 매핑 (콘텐츠에 맞는 CTA)
  const keywordLinks: Array<{ keywords: string[]; text: string; link: string }> = [
    // 정부/공공 서비스
    { keywords: ['국민연금', '연금', 'NPS'], text: '국민연금공단 바로가기', link: 'https://www.nps.or.kr' },
    { keywords: ['건강보험', '의료보험'], text: '국민건강보험공단 바로가기', link: 'https://www.nhis.or.kr' },
    { keywords: ['고용보험', '실업급여'], text: '고용보험 바로가기', link: 'https://www.ei.go.kr' },
    { keywords: ['산재보험', '산업재해'], text: '근로복지공단 바로가기', link: 'https://www.comwel.or.kr' },
    { keywords: ['정부24', '민원', '주민등록'], text: '정부24 바로가기', link: 'https://www.gov.kr' },
    { keywords: ['홈택스', '세금', '연말정산', '소득세'], text: '국세청 홈택스 바로가기', link: 'https://www.hometax.go.kr' },
    { keywords: ['위택스', '지방세', '자동차세'], text: '위택스 바로가기', link: 'https://www.wetax.go.kr' },
    { keywords: ['주택청약', '청약', '아파트 분양'], text: '청약홈 바로가기', link: 'https://www.applyhome.co.kr' },
    { keywords: ['여권', '비자'], text: '외교부 여권안내 바로가기', link: 'https://www.passport.go.kr' },
    { keywords: ['병역', '군대', '입영'], text: '병무청 바로가기', link: 'https://www.mma.go.kr' },

    // 복지/지원금
    { keywords: ['복지로', '지원금', '보조금', '복지서비스'], text: '복지로 바로가기', link: 'https://www.bokjiro.go.kr' },
    { keywords: ['기초연금', '노인연금'], text: '기초연금 안내 바로가기', link: 'https://basicpension.mohw.go.kr' },
    { keywords: ['육아휴직', '출산휴가', '아이돌봄'], text: '아이사랑 바로가기', link: 'https://www.childcare.go.kr' },
    { keywords: ['장애인', '장애등급'], text: '장애인복지 바로가기', link: 'https://www.welfare.go.kr' },

    // 취업/교육
    { keywords: ['취업', '구직', '채용', '일자리'], text: '워크넷 바로가기', link: 'https://www.work.go.kr' },
    { keywords: ['창업', '소상공인'], text: '소상공인시장진흥공단 바로가기', link: 'https://www.semas.or.kr' },
    { keywords: ['국가장학금', '대학등록금'], text: '한국장학재단 바로가기', link: 'https://www.kosaf.go.kr' },
    { keywords: ['평생교육', '학점은행'], text: '국가평생교육진흥원 바로가기', link: 'https://www.nile.or.kr' },

    // 금융/경제
    { keywords: ['주식', '투자', '증권'], text: '금융감독원 바로가기', link: 'https://www.fss.or.kr' },
    { keywords: ['부동산', '토지', '공시지가'], text: '부동산공시가격 바로가기', link: 'https://www.realtyprice.kr' },
    { keywords: ['대출', '금리', '서민금융'], text: '서민금융진흥원 바로가기', link: 'https://www.kinfa.or.kr' },

    // 건강/의료
    { keywords: ['코로나', '예방접종', '백신'], text: '질병관리청 바로가기', link: 'https://www.kdca.go.kr' },
    { keywords: ['병원', '의료기관', '진료'], text: '건강보험심사평가원 바로가기', link: 'https://www.hira.or.kr' },
    { keywords: ['심리상담', '정신건강'], text: '정신건강위기상담 바로가기', link: 'https://www.mentalhealth.go.kr' },

    // 교통/운전
    { keywords: ['운전면허', '면허'], text: '도로교통공단 바로가기', link: 'https://www.koroad.or.kr' },
    { keywords: ['자동차등록', '차량등록'], text: '자동차민원 대국민포털 바로가기', link: 'https://www.ecar.go.kr' },
    { keywords: ['교통사고', '보험'], text: '손해보험협회 바로가기', link: 'https://www.knia.or.kr' },
  ];

  // ✅ [User Request] 자동 생성된 외부 기사 링크(관련 기사 보기 등) 제거
  // "CTA는 수동 링크나 내부 백링크만 가능하게 해주시고 관련기사는 넣지마세요"

  // 키워드 매칭 로직 비활성화
  /*
  for (const item of keywordLinks) {
    for (const keyword of item.keywords) {
      if (lowerContent.includes(keyword.toLowerCase()) || contentText.includes(keyword)) {
        console.log(`[CTA] 키워드 "${keyword}" 매칭 → ${item.link}`);
        return { text: item.text, link: item.link };
      }
    }
  }
  */

  // 기본 CTA 로직 비활성화
  /*
  const ctaOptions: Partial<Record<ArticleType, string[]>> = {
    it_review: ['더 알아보기', '자세히 보기', '제품 보러 가기'],
    // ...
  };
  const options = ctaOptions[articleType] ?? ctaOptions.general;
  const text = options?.[Math.floor(Math.random() * (options.length || 1))] ?? '더 알아보기';
  */

  // URL이 있으면 link 포함 (크롤링 원본 URL) - 이것도 사용자가 원치 않을 수 있으나, 일단 유지하거나 제거
  // "관련 기사" 링크를 싫어하시므로, source.url이 뉴스 기사 URL이라면 제거하는 게 맞음.
  // 하지만 수동으로 입력한 URL이 여기 들어오진 않음 (source.url은 크롤링 타겟).
  // 따라서 자동 생성은 아예 안 하는 게 안전함.

  return undefined;
}

function generateSelfComments(source: ContentSource, content: StructuredContent): string[] {
  const baseTitle = content.selectedTitle.replace(/["""]/g, '');
  const first =
    source.personalExperience ??
    '안녕하세요, 작성자예요! 직접 써보고 느낀 부분 위주로 정리해봤습니다. 궁금한 점 있으면 편하게 질문 주세요.';
  const second = `이 정보가 도움이 되셨기를 바랍니다.`;
  const third = `추가로 궁금한 점이 있으시면 댓글로 남겨주세요.`;
  return [first, second, third];
}

/**
 * 병렬 콘텐츠 생성 함수
 * 여러 소스를 동시에 처리하여 속도 향상
 * @param sources 생성할 콘텐츠 소스 배열
 * @param options 생성 옵션
 * @param maxConcurrency 최대 동시 실행 개수 (기본값: 3)
 * @returns 생성된 콘텐츠 배열
 */
export async function generateContentsInParallel(
  sources: ContentSource[],
  options: GenerateOptions = {},
  maxConcurrency: number = 3
): Promise<Array<{ source: ContentSource; content: StructuredContent | null; error?: string }>> {
  console.log(`[병렬 처리] ${sources.length}개 콘텐츠를 최대 ${maxConcurrency}개씩 동시 생성합니다...`);

  const results: Array<{ source: ContentSource; content: StructuredContent | null; error?: string }> = [];
  const queue = [...sources];
  const inProgress: Promise<void>[] = [];

  const processOne = async (source: ContentSource, index: number) => {
    try {
      console.log(`[병렬 처리] [${index + 1}/${sources.length}] 생성 시작...`);
      const content = await generateStructuredContent(source, options);
      results.push({ source, content });
      console.log(`[병렬 처리] [${index + 1}/${sources.length}] ✅ 생성 완료`);
    } catch (error) {
      console.error(`[병렬 처리] [${index + 1}/${sources.length}] ❌ 생성 실패:`, (error as Error).message);
      results.push({ source, content: null, error: (error as Error).message });
    }
  };

  let completedCount = 0;

  while (queue.length > 0 || inProgress.length > 0) {
    // 동시 실행 개수만큼 작업 시작
    while (inProgress.length < maxConcurrency && queue.length > 0) {
      const source = queue.shift()!;
      const index = sources.indexOf(source);
      const promise = processOne(source, index).then(() => {
        completedCount++;
        console.log(`[병렬 처리] 진행률: ${completedCount}/${sources.length} (${Math.round((completedCount / sources.length) * 100)}%)`);
      });
      inProgress.push(promise);
    }

    // 하나라도 완료될 때까지 대기
    if (inProgress.length > 0) {
      await Promise.race(inProgress);
      // 완료된 작업 제거
      for (let i = inProgress.length - 1; i >= 0; i--) {
        const settled = await Promise.race([
          inProgress[i].then(() => true),
          Promise.resolve(false)
        ]);
        if (settled) {
          inProgress.splice(i, 1);
        }
      }
    }
  }

  console.log(`[병렬 처리] 전체 완료: 성공 ${results.filter(r => r.content).length}개, 실패 ${results.filter(r => !r.content).length}개`);

  return results;
}

