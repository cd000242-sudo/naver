import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
// ✅ [2026-01-25] Perplexity 추가
import { generatePerplexityContent, translatePerplexityError } from './perplexity.js';

import JSON5 from 'json5';
import { getGeminiModel } from './gemini.js';
import { trackApiUsage } from './apiUsageTracker.js';
import { calculateSEOScore } from './seoCalculator';
// ✅ [2026-02-11] getRelatedKeywords import 제거 — 인라인 템플릿 전용이었음
import { app } from 'electron';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { JSON_SCHEMA_DESCRIPTION } from './contentGenerator/schema';
import { humanizeContent, humanizeHtmlContent, analyzeAiDetectionRisk, resetHumanizerLog } from './aiHumanizer.js';
import { optimizeContentForNaver, optimizeHtmlForNaver, analyzeNaverScore, resetOptimizerLog } from './contentOptimizer.js';
import { buildSystemPromptFromHint, buildFullPrompt, loadShoppingPrompt, TONE_PERSONAS, buildStructureVariationDirective, buildBusinessAngleDirective, type PromptMode } from './promptLoader.js';
// ✅ [v1.4.48 Stage A.2] require() 혼용 제거 → 정적 import로 통일 (모듈 인스턴스 단일 보장)
import { processAutoPublishContent, getRecentPeriods, recordSelectedTitle, type TitleSelectionResult } from './titleSelector.js';
import { trendAnalyzer } from './agents/trendAnalyzer.js';
import { loadConfig } from './configManager.js';
import { splitPromptByMarker, adjustForPerplexity } from './promptSplitter.js';
import { checkHomefeedCriticalViolations } from './contentQualityChecker.js';
import { safeParseJson, cleanJsonOutput, tryFixJson, fixJsonAtPosition } from './jsonParser';

// ✅ [v1.4.50] 예산 초과 전용 에러 클래스 — Safety Lock에서 throw
// catch 블록에서 instanceof로 식별하여 다른 네트워크/API 에러와 명확히 구분
export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly currentUsageUSD: number,
    public readonly budgetUSD: number
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

// ✅ [v1.4.51] Gemini 빈 응답 전용 에러 클래스 — finishReason별 대응 위해
// SAFETY/RECITATION → 재시도 금지, MAX_TOKENS → 설정 조정 후 재시도, OTHER → 일반 재시도
export class GeminiEmptyResponseError extends Error {
  constructor(
    message: string,
    public readonly finishReason: string,
    public readonly promptTokens: number = 0,
    public readonly thinkingTokens: number = 0,
    public readonly outputTokens: number = 0
  ) {
    super(message);
    this.name = 'GeminiEmptyResponseError';
  }
  /** 재시도해도 의미없는 영구 실패인지 (SAFETY/RECITATION) */
  get isPermanent(): boolean {
    return this.finishReason === 'SAFETY' || this.finishReason === 'RECITATION';
  }
}

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

  // 7. ✅ [2026-03-09] AI 인용 번호 제거: [1], [2, 3] 등
  cleaned = cleaned.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]\s*/g, ' ');

  return cleaned.trim();
}

/**
 * ✅ [2026-01-20] 제목에서 연속으로 중복되는 구절 제거
 * ✅ [2026-02-04] 단어 단위 중복 제거 추가 (박나래, 광고 손절 등)
 * 예: "박나래, 광고 줄줄이 손절 박나래 광고 손절, 복귀 1주일"
 *  → "박나래, 광고 줄줄이 손절, 복귀 1주일"
 */
function removeDuplicatePhrases(title: string): string {
  let t = String(title || '').trim();
  if (!t || t.length < 10) return t;

  // ✅ [2026-02-04] 단어 단위 중복 제거 (2자 이상 한글/영문 단어)
  // ✅ [2026-02-24] 동음이의어 보호: 조사 문맥이 다르면 다른 의미로 간주
  // ✅ [2026-02-24] 3회 이상 등장 단어도 완전 제거 (while 루프)
  const words = t.match(/[가-힣]{2,}|[a-zA-Z]{2,}/g) || [];
  const wordCountMap = new Map<string, number>();

  for (const word of words) {
    const normalized = word.toLowerCase();
    wordCountMap.set(normalized, (wordCountMap.get(normalized) || 0) + 1);
  }

  // 2번 이상 등장하는 단어 찾기
  for (const [word, count] of wordCountMap.entries()) {
    if (count >= 2 && word.length >= 2) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // ✅ 동음이의어 보호: 각 등장 위치의 뒤따르는 조사를 비교
      const contextPattern = new RegExp(`${escaped}([가-힣]{0,2})`, 'gi');
      const contexts: string[] = [];
      let cm;
      while ((cm = contextPattern.exec(t)) !== null) {
        contexts.push(cm[1] || '');
      }
      // 조사가 모두 다르면 다른 문맥(동음이의어)으로 간주 → 건너뜀
      const uniqueContexts = new Set(contexts);
      if (uniqueContexts.size >= contexts.length && contexts.length > 1) {
        console.log(`[DuplicateRemoval] 동음이의어 보호: "${word}" (문맥: ${contexts.join(', ')})`);
        continue;
      }

      // ✅ while 루프로 3회 이상 등장도 완전 제거
      const pattern = new RegExp(`(${escaped}[^가-힣a-zA-Z]*)(.*?)\\s*${escaped}`, 'gi');
      let prev;
      do {
        prev = t;
        t = t.replace(pattern, (match, first, middle) => {
          const trimmedMiddle = (middle || '').trim();
          if (trimmedMiddle && !trimmedMiddle.match(/^[,\s:·•|]+$/)) {
            return first + trimmedMiddle;
          }
          return first.trim();
        });
      } while (t !== prev);
      if (t !== String(title || '').trim()) {
        console.log(`[DuplicateRemoval] 단어 "${word}" 중복 제거됨: "${title}" → "${t}"`);
      }
    }
  }

  // ✅ [2026-02-01 FIX] 비연속 중복 패턴 제거 (A X A Y → A X Y)
  // 예: "린백 LB221HA 사무용 컴퓨터 린백 LB221HA 가성비 후기" → "린백 LB221HA 사무용 컴퓨터 가성비 후기"
  // ✅ [2026-02-24] 최소 6자로 상향 (한글 3글자) — 3자는 정상 텍스트 파괴 위험
  for (let len = 20; len >= 6; len--) {
    const regex = new RegExp(`(.{${len},${len}})(.{1,30}?)\\1`, 'g');
    const before = t;
    // 첫 번째 매치에서 중간 부분을 유지하고 두 번째 중복만 제거
    t = t.replace(regex, (match, phrase, middle) => {
      // 중간 부분이 존재하면 phrase + middle 유지 (두 번째 phrase 제거)
      if (middle && middle.trim()) {
        console.log(`[DuplicateRemoval] 비연속 중복 제거: "${phrase.trim()}" (중간: "${middle.trim().substring(0, 15)}...")`);
        return phrase + middle;
      }
      return phrase; // 중간이 없으면 하나만 유지
    });
    if (t !== before) {
      console.log(`[DuplicateRemoval] 비연속 중복 제거됨 (${len}자): "${before}" → "${t}"`);
    }
  }

  // ✅ [2026-01-21] 콜론(:) 전후 동일/유사 텍스트 감지 및 제거
  // 예: "캐치웰 CX PRO 매직타워 N: 캐치웰 울 집 캐치웰 CX PRO 매직타워 N, 한 달"
  //  → "캐치웰 CX PRO 매직타워 N, 한 달 실사용 후기"
  const colonIdx = t.indexOf(':');
  if (colonIdx > 3 && colonIdx < t.length - 3) {
    const beforeColon = t.slice(0, colonIdx).trim();
    const afterColon = t.slice(colonIdx + 1).trim();

    // 콜론 앞 텍스트와 동일/유사한 패턴이 콜론 뒤에도 있으면 정리
    // 제품명이 반복되는 경우: "A: ... A, B" → "A B"
    const normBefore = beforeColon.replace(/[\s\-–—:|·•.,!?()[\]{}\"']/g, '').toLowerCase();
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
          console.log(`[DuplicateRemoval] 콜론 전후 중복 제거: "${title}" → "${t}"`);
        } else {
          // 남은게 없으면 콜론 앞 텍스트만 사용
          t = beforeColon;
          console.log(`[DuplicateRemoval] 콜론 뒤 제거 (중복): "${title}" → "${t}"`);
        }
      }
    }
  }

  // ✅ [2026-01-21] 4~25자 길이의 연속 중복 패턴 찾기
  // ✅ [2026-02-24] 최소 4자로 상향 (한글 2글자) — 3자는 정상 텍스트 파괴 위험
  for (let len = 25; len >= 4; len--) {
    const regex = new RegExp(`(.{${len},${len}})(?:[\\s,·•|]*\\1)+`, 'g');
    const before = t;
    t = t.replace(regex, '$1');
    if (t !== before) {
      console.log(`[DuplicateRemoval] 중복 제거됨 (${len}자): "${before}" → "${t}"`);
    }
  }

  // ✅ [2026-01-21] 의미없는 짧은 단편 제거 ("울 집" 같은 AI 환각)
  // ✅ [2026-02-24] 1글자 4연속만 제거 (2글자 3연속은 정상 한글 파괴 위험)
  t = t.replace(/\s[가-힣]\s+[가-힣]\s+[가-힣]\s+[가-힣]\s/g, ' ');

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

  // 4. 대괄호 플레이스홀더: [인물명], [키워드], [이미지] 등 AI가 삽입한 마커 제거
  cleaned = cleaned.replace(/\[(?:인물명|키워드|서브키워드|주제|이름|제품명|브랜드명|이미지|사진|IMAGE|image)\]/gi, '');

  // 5. ✅ [2026-03-09] AI 인용 번호 제거: [1], [2, 3], [1, 2, 3] 등 Perplexity/검색 기반 AI의 출처 표시
  //    패턴: 대괄호 안에 숫자와 쉼표/공백만 있는 경우 (최대 20자 — 매우 긴 인용은 드묾)
  cleaned = cleaned.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]\s*/g, ' ');

  // ✅ [섹션 레이블 포맷팅] 📌로 시작하는 섹션 레이블 앞뒤에 줄바꿈 추가
  // "...지경이에요.. 📌 당시 대중 반응 요약 와 드디어..." 
  // → "...지경이에요..\n\n📌 당시 대중 반응 요약\n\n와 드디어..."
  cleaned = cleaned.replace(/([^\n])(📌[^\n]+)/g, '$1\n\n$2');  // 앞에 줄바꿈 추가
  cleaned = cleaned.replace(/(📌[^\n]+)([^\n])/g, '$1\n\n$2');  // 뒤에 줄바꿈 추가

  // ✅ [대중 반응 섹션 가독성 개선] 
  // "📌" 뒤에 나오는 긴 문장을 종결어미 기준으로 줄바꿈
  // ✅ [2026-02-02] 강화: 공백 없이 바로 다음 문장이 와도 줄바꿈 처리
  cleaned = cleaned.replace(/(📌[^\n]*(?:반응|요약|정리)[^\n]*[\n]*)([^\n]{20,})/g, (match, label, content) => {
    // ✅ 핵심: 종결어미 + 공백 OR 종결어미 + 한글 시작 → 줄바꿈
    // 1단계: 종결어미 뒤에 공백이 있으면 줄바꿈
    let formatted = content
      .replace(/(다|네요?|요|죠|음|야|지|어요?|워요?|아요?|했다|겠다|있다|없다|된다|난다|간다|왔다|했네|됐네|왔네|갔네|봤네|이네|해요|해네|나요|네요|대요|라네|라요|데요|군요|래요|했어요|됐어요|왔어요|좋았어요|싫었어요|진짜|실화|대박) /g, '$1\n')
      .replace(/(가네|하네|보네|되네|오네|같네|싶네|하네요|되네요|오네요) /g, '$1\n')
      // ㅋㅋ, ㅠㅠ 뒤에는 무조건 줄바꿈
      .replace(/(ㅋㅋ+|ㅎㅎ+|ㅠㅠ+|ㅜㅜ+) /g, '$1\n');

    // ✅ 2단계: 공백 없이 바로 한글이 오는 경우도 처리 (예: "기절할뻔세탁소에" → "기절할뻔\n세탁소에")
    // 종결어미 패턴 뒤에 바로 한글이 오면 줄바꿈 삽입
    formatted = formatted
      .replace(/(뻔|됐네|했네|왔네|갔네|봤네|있네|없네|났네|졌네|됐다|했다|왔다|갔다|봤다|났다|졌다|란다|난다|됩니다|합니다|입니다|군요|네요|대요|래요)([가-힣])/g, '$1\n$2');

    // ✅ 3단계: 그래도 줄바꿈이 안 됐으면 문장 길이 기준으로 강제 분리
    // 한 줄이 50자 이상이면서 줄바꿈이 없으면, 25자 단위로 적절한 위치에서 자르기
    if (formatted.indexOf('\n') === -1 && formatted.length > 50) {
      // 공백 기준으로 분리 시도
      const words = formatted.split(' ');
      let currentLine = '';
      const lines: string[] = [];

      for (const word of words) {
        if (currentLine.length + word.length > 40 && currentLine.length > 0) {
          lines.push(currentLine.trim());
          currentLine = word;
        } else {
          currentLine += (currentLine ? ' ' : '') + word;
        }
      }
      if (currentLine) lines.push(currentLine.trim());
      formatted = lines.join('\n');
    }

    return label + '\n' + formatted;
  });



  // 과도한 줄바꿈 정리 (3개 이상의 연속 줄바꿈을 2개로)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');




  return cleaned.trim();
}

// ✅ [2026-02-24 FIX] 제목 내 특수문자 정제
// AI가 중간점(·), 세미콜론(;), 불필요한 따옴표(') 등을 제목에 삽입하는 문제 방지
function sanitizeTitleSpecialChars(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';

  // ✅ [2026-03-14] [출처] 태그 + 이후 중복 제목 전체 제거
  // 크롤링된 원문에서 "제목\n[출처] 제목" 패턴이 유입됨
  t = t.replace(/\[출처\].*$/s, '').trim();
  t = t.replace(/\(출처[^)]*\)/g, '').trim();

  // ✅ [2026-03-14] 크롤링 아티팩트/낚시성 접미사 제거 (쇼핑 블로그에서 자주 유입)
  const junkSuffixes = [
    '내돈내산', '협찬', '제공', '체험단', '서포터즈',
    '원고료', '광고', '소정의', '대가성',
    '킹 카', '킹카',
  ];
  for (const junk of junkSuffixes) {
    const rx = new RegExp(`[\\s,·•|:]*${junk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    t = t.replace(rx, '').trim();
  }

  // 1. 가운뎃점(·) 및 bullet(•) → 공백으로 대체 (한국어 제목에는 부적합)
  t = t.replace(/[·•]/g, ' ');

  // 2. 세미콜론(;) → 쉼표로 대체
  t = t.replace(/;/g, ',');

  // 3. 불필요한 따옴표/아포스트로피 제거 (한국어 앞뒤에 붙은 경우)
  // 예: "이전'을" → "이전을"  (한글+따옴표+한글 패턴)
  t = t.replace(/([가-힣])['`'´'']/g, '$1');
  t = t.replace(/['`'´'']([가-힣])/g, '$1');

  // 4. 연속된 구두점 정리: ",," → ",", ", ," → ","
  t = t.replace(/,\s*,/g, ',');
  // ✅ [2026-02-24] 숫자 사이 쉼표 보호 (1,000원 등 천 단위 구분자 유지)
  t = t.replace(/(?<!\d)\s*,\s*/g, ', ');
  t = t.replace(/,\s+(?=\d{3})/g, ',');  // 이미 깨진 "1, 000" 복구

  // 5. 이중 공백 정리
  t = t.replace(/\s{2,}/g, ' ').trim();

  // 6. 선행/후행 구두점 정리
  t = t.replace(/^[\s,;·•]+/, '').replace(/[\s,;·•]+$/, '').trim();

  return t;
}

function cleanupStartingTitleTokens(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';

  // 1. [공지], (공지), 【공지】 등 공지 관련 태그 제거
  t = t.replace(/^\s*[\[\(【]\s*공지\s*[\]\)】]\s*/i, '');

  // 2. 공외:, [NOTICE], (NOTICE) 등 유사 패턴 제거
  t = t.replace(/^\s*[\[\(【]?\s*(?:NOTICE|공지사항|안내|이슈)\s*[\]\)】]?\s*[:：]?\s*/i, '');

  // ✅ [2026-02-09 FIX] [지역명], [브랜드] 등 대괄호 시작 패턴 제거
  // AI가 "[김해] 월세 0원 사무실..." 처럼 생성하는 경향 → 네이버 SEO에 불리
  t = t.replace(/^\s*\[[^\]]{1,10}\]\s*/g, '');

  // 3. 맨 앞의 불필요한 기호 제거
  t = t.replace(/^[\s\-–—:|·•,]+/, '');

  return t.trim();
}


function cleanupTrailingTitleTokens(raw: string): string {
  let t = normalizeTitleWhitespace(removeEmojis(String(raw || '').trim()));
  if (!t) return '';

  // ✅ [2026-02-09 FIX] 빈 괄호/대괄호 제거 — AI가 프롬프트 예시 패턴을 잘못 학습해 생성
  // 예: "[김해] 월세 0원 사무실? ... [] 김해, 0원 놓치면 매달 손해 ()"
  t = t.replace(/\[\s*\]/g, '');   // 빈 대괄호 [] 제거
  t = t.replace(/\(\s*\)/g, '');   // 빈 소괄호 () 제거
  t = t.replace(/【\s*】/g, '');    // 빈 이중대괄호 【】 제거
  t = t.replace(/\s{2,}/g, ' ').trim(); // 정리

  // remove dangling single-word bait tokens often emitted at the end
  // (keep this conservative to avoid changing legitimate titles)
  const trailingTokens = ['직접', '진짜', '충격', '대박'];
  for (const tok of trailingTokens) {
    const rx = new RegExp(`(?:[\\s,·•|:]+)?${tok}\\s*$`, 'i');
    if (rx.test(t)) {
      t = t.replace(rx, '').trim();
    }
  }

  // cleanup leftover punctuation at the end
  t = t.replace(/[\s\-–—:|·•,]+$/g, '').trim();
  return t;
}

// ✅ [2026-02-10 FIX] 콜론+따옴표 패턴 정제
// AI가 프롬프트의 {키워드} + {설명} 구조를 리터럴로 해석해
// "키워드 : "설명문" 나머지" 형태로 생성하는 문제 방지
function cleanupColonQuotePattern(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';

  // 1) 콜론+따옴표 구분자 제거: "키워드 : "설명"" → "키워드 설명"
  //    다양한 따옴표 유형 대응 (큰따옴표, 작은따옴표, 한글 따옴표)
  t = t.replace(/\s*[:：]\s*["'\u201C\u201D\u2018\u2019\u300C\u300D\u300E\u300F]+\s*/g, ' ');

  // 2) 남은 닫는 따옴표 제거
  t = t.replace(/["'\u201C\u201D\u2018\u2019\u300C\u300D\u300E\u300F]+/g, '');

  // 3) 이중 공백 정리
  t = t.replace(/\s{2,}/g, ' ').trim();

  return t;
}

function applyKeywordPrefixToTitle(title: string, keyword: string): string {
  const cleanKeyword = (keyword || '').trim();
  if (!cleanKeyword) return (title || '').trim();

  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return cleanKeyword;

  // ✅ [2026-02-08] 강화된 중복 방지: 키워드의 모든 토큰이 이미 제목에 포함되어 있으면 접두사 불필요
  const keywordTokens = cleanKeyword.split(/\s+/).filter(t => t.length >= 2);
  if (keywordTokens.length > 0) {
    const titleLower = cleanTitle.toLowerCase();
    const allTokensPresent = keywordTokens.every(t => titleLower.includes(t.toLowerCase()));
    if (allTokensPresent) {
      console.log(`[applyKeywordPrefix] 키워드 토큰 모두 제목에 포함됨 → 접두사 생략: "${cleanKeyword}" in "${cleanTitle}"`);
      return cleanTitle;
    }
  }

  const escapeRegex = (s: string): string => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const normalizeForCompare = (s: string) =>
    String(s || '')
      .trim()
      .replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '')
      .toLowerCase();

  const normalizeWhitespace = (s: string): string =>
    String(s || '')
      .replace(/\s+/g, ' ')
      // ✅ [2026-02-24] 숫자 사이 쉼표 보호 (1,000원 등)
      .replace(/(?<!\d)\s*,\s*/g, ', ')
      .replace(/,\s+(?=\d{3})/g, ',')
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
    // ✅ [2026-02-24] removeDuplicatePhrases 제거 (3중 실행 방지, 순수 길이 제한만)
    const t = normalizeWhitespace(String(s || '')).trim();
    if (!t) return '';
    if (t.length <= maxLen) return t;

    // ✅ [2026-02-02] 불완전한 문장 방지: 더 나은 끊김 위치 찾기
    let cut = t.slice(0, maxLen);

    // 1. 완전한 문장 경계 찾기 (구두점)
    const lastPunctuation = Math.max(
      cut.lastIndexOf('!'),
      cut.lastIndexOf('?'),
      cut.lastIndexOf('。'),
      cut.lastIndexOf(')')
    );

    // 2. 한국어 어절 경계 찾기 (조사, 공백)
    const lastSpace = cut.lastIndexOf(' ');

    // 3. 단어 완성 지점 찾기 (쉼표, 콜론)
    const lastDelimiter = Math.max(
      cut.lastIndexOf(','),
      cut.lastIndexOf(':')
      // ✅ [2026-02-24] · 제거 (sanitizeTitleSpecialChars가 이미 제거함 — 사문 코드)
    );

    // ✅ 우선순위: 구두점 > 구분자 > 공백
    const minCutPosition = Math.floor(maxLen * 0.5);  // 최소 50% 이상 유지

    if (lastPunctuation >= minCutPosition) {
      cut = t.slice(0, lastPunctuation + 1);
    } else if (lastDelimiter >= minCutPosition) {
      cut = t.slice(0, lastDelimiter);  // 구분자 자체는 제외
    } else if (lastSpace >= minCutPosition) {
      cut = t.slice(0, lastSpace);
    } else {
      // 적절한 끊김 위치가 없으면 maxLen 위치에서 자르고 끝 정리
      cut = t.slice(0, maxLen);
    }

    // ✅ [2026-02-02 FIX] 끝 정리: 불완전한 문자 제거 (+, &, |, 등)
    return cut.replace(/[\s\-–—:|·•,+&|/\\]+$/g, '').trim();
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
      return clampTitleLength(merged, 70);
    }
    return clampTitleLength(`${cleanKeyword}${rest ? ` ${rest}` : ''}`.trim(), 70);
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
  return clampTitleLength(merged, 70);
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

  // ✅ [2026-02-02] 조사로 시작하면 잘못된 제거로 간주 (주어가 잘린 것)
  const startsWithParticle = (s: string): boolean => {
    const particles = ['의', '이', '가', '를', '을', '은', '는', '에', '와', '과', '로', '으로', '에서', '까지', '부터', '도', '만'];
    const trimmed = s.trim();
    return particles.some(p => trimmed.startsWith(p + ' ') || trimmed === p);
  };

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
      let remainder = normalizedHeading.slice(normalizedPrefix.length).trim();
      remainder = remainder.replace(/^[\s\-–—:|·•,]+/, '').trim();

      // ✅ [2026-02-02] 잘린 결과가 조사로 시작하면 원본 유지 (주어 보호)
      if (remainder && startsWithParticle(remainder)) {
        console.warn(`[stripReviewTitlePrefix] 조사로 시작하는 결과 감지 → 원본 유지: "${h}"`);
        return h;  // 원본 유지
      }

      h = remainder;
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
  return articleType === 'shopping_review' || articleType === 'shopping_expert_review' || articleType === 'it_review' || articleType === 'product_review';
}

function normalizeTitleWhitespace(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    // ✅ [2026-02-24] 숫자 사이 쉼표 보호 (1,000원 등 천 단위 구분자 유지)
    .replace(/(?<!\d)\s*,\s*/g, ', ')
    .replace(/,\s+(?=\d{3})/g, ',')  // 이미 깨진 "1, 000" 복구
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

  if (!base) {
    return prod ? `${prod} 실사용 후기` : '실사용 후기';
  }

  let t = base;

  // ✅ [2026-02-08 완전 재작성] 제목 의미를 파괴하지 않는 최소한의 정제만 수행
  // 기존: 훅 키워드(써보고, 소름, 충격 등)를 무조건 제거 → 제목이 제품명만 남는 문제 발생
  // 수정: 정말 과도한 과장 표현만 제거하고, 창의적 훅 제목은 보존

  // 1. 과도한 감정 과장 단어만 제거 (제목 전체를 파괴하지 않는 수준)
  const excessivePatterns = [
    /[!?]{3,}/g,                    // 연속 느낌표/물음표 3개 이상
    /ㅋ{3,}/g,                       // ㅋㅋㅋ 이상
    /ㅎ{3,}/g,                       // ㅎㅎㅎ 이상
    /\.{4,}/g,                       // .... 4개 이상
  ];
  for (const p of excessivePatterns) {
    t = t.replace(p, '');
  }

  // 2. 기본 정규화
  t = normalizeTitleWhitespace(t);

  // 3. 제목이 너무 짧아졌으면 원본 유지
  if (t.length < 15 && base.length >= 15) {
    t = normalizeTitleWhitespace(base);
  }

  // 4. 제품명 prefix 보장 (1회만)
  if (prod) {
    t = applyKeywordPrefixToTitle(t, prod);
  }

  // 5. 완전히 비었을 때만 폴백
  if (!t || t.length < 5) {
    t = prod ? `${prod} 실사용 후기` : (base || '실사용 후기');
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

function computeSeoTitleCriticalIssues(title: string, primaryKeyword?: string): string[] {
  const issues: string[] = [];
  const t = String(title || '').trim();
  if (!t) {
    issues.push('제목이 비어있음');
    return issues;
  }
  const len = t.length;
  if (len < 22) issues.push('제목 너무 짧음');
  if (len > 40) issues.push('제목 너무 김');

  // ✅ [2026-02-08] 키워드 앞쪽 배치 검증 (프롬프트: "키워드를 제목 앞 3~5글자 내 배치 필수")
  if (primaryKeyword) {
    const kw = primaryKeyword.trim();
    const kwWords = kw.split(/[\s,/\-]+/).filter(w => w.length >= 2);
    const firstKwWord = kwWords[0] || kw;

    // 키워드의 첫 단어가 제목에 포함되어 있는지 확인
    const kwIndex = t.indexOf(firstKwWord);
    if (kwIndex < 0) {
      // 키워드가 제목에 아예 없음
      issues.push(`키워드 미포함 (${firstKwWord})`);
    } else if (kwIndex > 5) {
      // 키워드가 제목 앞쪽 5글자 내에 없음
      issues.push(`키워드 앞배치 실패 (${kwIndex}번째 위치)`);
    }
  }

  // ✅ [2026-02-08] 0점 패턴 차단 (프롬프트: "총정리/방법/후기/추천/가이드로 끝나면 0점")
  const zeroScoreEndings = ['총정리', '방법', '후기', '추천', '가이드', '리뷰', '정리'];
  const endsWithZeroPattern = zeroScoreEndings.some(p => t.endsWith(p));
  if (endsWithZeroPattern) {
    issues.push('뻔한 템플릿 종결 (0점 패턴)');
  }

  // ✅ 트리거 검증 — 0점 패턴 제외한 실질적 클릭 트리거만 인정
  const hasNumber = /\d/.test(t);
  const goodSeoTriggers = [
    '놓치면', '손해', '안 하면', '모르면', '해봤더니', '써보니', '써봤는데',
    '달라졌', '바뀌었', '놀랐', '할까', '일까', '어떨까',
    '비교', '차이', '해결', '꿀팁', '효과', '최신',
    '진짜', '실제', '직접', '비밀', '몰랐던', '이유',
    '아꼈', '할인', '절약', '만에', '확인'
  ];
  const hasGoodTrigger = goodSeoTriggers.some(x => t.includes(x));
  if (!hasNumber && !hasGoodTrigger) issues.push('숫자/클릭트리거 부재');

  // ✅ 설명체/딱딱한 어미 금지
  const forbiddenSeoPatterns = ['에 대해', '에 관한', '입니다', '합니다', '알아보겠', '하는 법'];
  if (forbiddenSeoPatterns.some(p => t.includes(p))) issues.push('설명체/딱딱한 어미');

  return issues;
}

function computeHomefeedTitleCriticalIssues(title: string, primaryKeyword?: string): string[] {
  const issues: string[] = [];
  const t = String(title || '').trim();
  if (!t) {
    issues.push('제목이 비어있음');
    return issues;
  }
  const len = t.length;
  // ✅ [2026-03-06] 토픽 매칭 글자수 기준 28~45자
  if (len < 28) issues.push('제목 너무 짧음 (28자 미만, 서브키워드 공간 부족)');
  if (len > 45) issues.push('제목 너무 김 (45자 초과)');

  // ✅ [2026-02-08] 키워드 앞쪽 배치 검증 (홈판도 키워드/세부키워드를 맨 앞 배치)
  if (primaryKeyword) {
    const kw = primaryKeyword.trim();
    const kwWords = kw.split(/[\s,/\-]+/).filter(w => w.length >= 2);
    const firstKwWord = kwWords[0] || kw;

    const kwIndex = t.indexOf(firstKwWord);
    if (kwIndex < 0) {
      issues.push(`키워드 미포함 (${firstKwWord})`);
    } else if (kwIndex > 5) {
      issues.push(`키워드 앞배치 실패 (${kwIndex}번째 위치)`);
    }
  }

  // ✅ [2026-03-07] 키워드 중복 감지 — 같은 2자 이상 단어가 2회 이상 등장하면 키워드 나열
  const koreanWordsCheck = t.match(/[가-힣]{2,}/g) || [];
  const wordFreqCheck = new Map<string, number>();
  for (const w of koreanWordsCheck) {
    wordFreqCheck.set(w, (wordFreqCheck.get(w) || 0) + 1);
  }
  const dupWordsCheck = Array.from(wordFreqCheck.entries()).filter(([, c]) => c >= 2).map(([w]) => w);
  if (dupWordsCheck.length > 0) {
    issues.push(`키워드 반복 (${dupWordsCheck.join(', ')} — 같은 단어 2회 이상 사용 금지)`);
  }

  // ✅ [2026-03-06] 0점 패턴 확장 — 정보성/설명형 종결어는 홈판에서 0점
  const zeroScoreEndings = ['총정리', '방법', '후기', '추천', '가이드', '리뷰', '정리', '하는 법', '꿀팁', '비법', '노하우'];
  const endsWithZeroPattern = zeroScoreEndings.some(p => t.endsWith(p));
  if (endsWithZeroPattern) {
    issues.push('뻔한 정보성 종결 (홈판 0점 패턴)');
  }

  // ✅ [2026-03-06] 감정/경험 트리거 + 체험/결과 트리거 확장 (토픽 매칭 100점 공식)
  const emotionTriggers = [
    // 체험 증명형 (프롬프트 100점 공식)
    '써보니', '써봤는데', '써본', '써보고', '써봤더니', '써봤어요',
    '사용 후', '개월', '주간', '일 차', '해봤더니', '해봤는데',
    '다녀온', '다녀왔', '가봤', '방문', '먹어봤',
    // 결과 공개형
    '효과', '달라진', '달라졌', '바뀌었', '후회', '포기',
    // 호기심 유발형
    '왜 그랬', '의외', '예상 외', '몰랐던', '놀라운',
    // 공감형
    '그랬어요', '저도', '다들', '느꼈', '공감',
    // 발견형
    '90%', '놓치', '손해', '숨겨', '비밀',
    // 반전/변화형
    '결국', '알고보니', '반전', '비교',
    // 시의성 공감형
    '요즘', '최근', '올해', '이번',
    // 감정 트리거
    '진짜', '직접', '현장', '실시간', '반응', '근황', '결과',
    '소식', '순간', '모습', '이유', '놀랐', '소름',
    '난리', '대박', '감동', '궁금', '고민', '당황',
    '침묵', '뒷이야기', '비결', '경험'
  ];
  const hasEmotionTrigger = emotionTriggers.some(x => t.includes(x));
  if (!hasEmotionTrigger) issues.push('감정/경험/체험 트리거 부재');

  // ✅ 금지 표현
  const forbiddenTitlePatterns = ['왜?', '왜일까?', '에 대해', '에 관한', '알아보겠습니다', '입니다', '합니다'];
  if (forbiddenTitlePatterns.some(p => t.includes(p))) issues.push('금지 표현 포함');

  // ✅ [2026-03-06] 가운뎃점/세미콜론/작은따옴표 차단
  if (/[·;']/.test(t)) issues.push('금지 특수문자 포함 (·;\' — 검색 매칭 실패)');

  return issues;
}

/**
 * ✅ [2026-02-01] 쇼핑커넥트(affiliate) 제목 이슈 감지
 * - 상품명 정합성 검증
 * - 가격대-키워드 매칭 검증
 * - 금지 패턴 검증
 */
function computeAffiliateTitleCriticalIssues(title: string, source: ContentSource): string[] {
  const issues: string[] = [];
  const t = String(title || '').trim();

  if (!t) {
    issues.push('제목이 비어있음');
    return issues;
  }

  const len = t.length;

  // 1. 길이 검증 (15~50자)
  if (len < 15) issues.push('제목 너무 짧음 (15자 미만)');
  if (len > 50) issues.push('제목 너무 김 (50자 초과)');

  // 2. 상품명 포함 여부 검증
  const productName = String(source.productInfo?.name || source.title || '').trim();
  if (productName && productName.length >= 3) {
    // ✅ [2026-02-08 FIX] 상품명과 제목이 '완전 동일'한 경우만 감지
    // 기존: 상품명 포함 + 추가 키워드 3개 미만이면 무조건 이슈 → 과잉 트리거
    // 수정: 제목이 상품명과 거의 동일한 경우만 이슈 (AI 훅 제목 보존)
    const normalizedTitle = t.replace(/[^\w가-힣]/g, '').toLowerCase();
    const normalizedProduct = productName.replace(/[^\w가-힣]/g, '').toLowerCase();

    // 제목이 상품명과 완전 동일하거나, 상품명 + 1단어 이하인 경우만 이슈
    if (normalizedTitle === normalizedProduct) {
      issues.push('상품명 그대로 (후킹 키워드 필요)');
    } else if (normalizedProduct.length >= 10 && normalizedTitle.length > 0) {
      // 상품명이 길고, 제목이 상품명을 99% 이상 포함하는 경우
      const overlap = normalizedTitle.includes(normalizedProduct) || normalizedProduct.includes(normalizedTitle);
      if (overlap) {
        const titleWords = t.split(/[\s,/\-]+/).filter(w => w.length >= 2).filter(w => !/^\[.+\]$/.test(w));
        const productWords = productName.split(/[\s,/\-]+/).filter(w => w.length >= 2);
        const additionalWords = titleWords.filter(tw =>
          !productWords.some(pw => tw.toLowerCase().includes(pw.toLowerCase()) || pw.toLowerCase().includes(tw.toLowerCase()))
        );
        // ✅ [2026-02-08 FIX] 기준 완화: 추가 키워드 1개 미만일 때만 이슈 (기존 3개→1개)
        if (additionalWords.length < 1) {
          issues.push('상품명 그대로 (후킹 키워드 추가 필요)');
        }
      }
    }

    // 상품명 핵심 단어 누락 검증
    const productWordsArr = productName.split(/[\s,/\-]+/).filter(w => w.length >= 2);
    const coreProductWords = productWordsArr.slice(0, 3);

    const hasProductKeyword = coreProductWords.some(word =>
      t.toLowerCase().includes(word.toLowerCase())
    );

    if (!hasProductKeyword && coreProductWords.length > 0) {
      issues.push(`상품명 누락 (${coreProductWords[0]}...)`);
    }
  }

  // 3. 금지 패턴 검증
  const forbiddenPatterns = [
    'vs ', ' vs.', '비교분석', '에 대해', '에 관한', '알아보겠',
    '입니다', '합니다', '왜일까', // 설명체 어미
    '에러', '오류', '캡차', // 에러 페이지 키워드
  ];
  if (forbiddenPatterns.some(p => t.toLowerCase().includes(p.toLowerCase()))) {
    issues.push('금지 패턴 포함');
  }

  // 4. 가격대-키워드 정합성 검증
  const priceStr = String(source.productPrice || source.productInfo?.price || '').replace(/[^0-9]/g, '');
  const price = parseInt(priceStr) || 0;

  if (price > 0) {
    const lowPriceKeywords = ['가성비', '입문용', '저렴', '싸게', '최저가', '자취', '원룸', '1인가구'];
    const highPriceKeywords = ['프리미엄', '최고급', '하이엔드', '명품', '고급형'];

    if (price >= 1000000) {
      if (lowPriceKeywords.some(kw => t.includes(kw))) {
        issues.push(`가격 불일치 (${Math.floor(price / 10000)}만원 고가 + 저가 키워드)`);
      }
    } else if (price < 300000) {
      if (highPriceKeywords.some(kw => t.includes(kw))) {
        issues.push(`가격 불일치 (${Math.floor(price / 10000)}만원 저가 + 고가 키워드)`);
      }
    }
  }

  // 5. 매력적 키워드 검증 — ✅ [2026-02-08 FIX] 경고로만 로그, 이슈에는 추가하지 않음
  // 기존: 트리거 미포함 시 강제 제목 재생성 → AI 창의적 제목 파괴의 핵심 원인
  // 수정: 후킹 키워드 자체가 매력적이므로 별도 체크 불필요 (프롬프트에서 이미 지시)
  const affiliateTriggers = [
    '추천', '후기', '리뷰', '구매', '사용', '만족', '솔직',
    '가성비', '비교', '장단점', '꿀팁', '선택', '최신', '인기',
    '2026', '2025', '신제품', '핫딜', '특가', '할인',
    // ✅ [2026-02-08] 훅 키워드도 매력적 키워드로 인정
    '진짜', '찐', '리얼', '현실', '솔직히', '깨달은', '써보고', '써본',
    '대박', '후회', '실패', '꿀템', '인생', '개월', '주간'
  ];
  const hasTrigger = affiliateTriggers.some(x => t.includes(x));
  if (!hasTrigger) {
    // ⚠️ 경고만 — 이슈에 추가하지 않음 (강제 재생성 방지)
    console.warn(`[AffiliateTitleCheck] ⚠️ 매력적 키워드 없음 (경고만): "${t}"`);
  }

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
 * ✅ [2026-01-30] 제목-키워드 유사도 검증
 * - 생성된 제목이 키워드와 너무 유사하면 중복 문서 위험
 * - 유사도 80% 이상이면 경고
 */
export function validateTitleNotTooSimilarToKeyword(title: string, keyword: string): {
  isTooSimilar: boolean;
  similarity: number;
  warning?: string;
} {
  const cleanTitle = (title || '').trim();
  const cleanKeyword = (keyword || '').trim();

  if (!cleanTitle || !cleanKeyword) {
    return { isTooSimilar: false, similarity: 0 };
  }

  // 정규화 (소문자, 공백 제거, 특수문자 제거)
  const normalizeForCompare = (s: string): string =>
    String(s || '')
      .toLowerCase()
      .replace(/[\s\-–—:|·•.,!?()[\]{}\"']/g, '')
      .trim();

  const normalizedTitle = normalizeForCompare(cleanTitle);
  const normalizedKeyword = normalizeForCompare(cleanKeyword);

  // 완전 동일
  if (normalizedTitle === normalizedKeyword) {
    console.warn(`[TitleValidation] ⚠️ 제목과 키워드 완전 동일: "${cleanTitle}"`);
    return {
      isTooSimilar: true,
      similarity: 1,
      warning: `⚠️ 제목이 키워드와 동일합니다. 중복 문서로 판정될 수 있습니다.`
    };
  }

  // 제목이 키워드로 시작하고, 뒤에 조금만 추가된 경우
  if (normalizedTitle.startsWith(normalizedKeyword)) {
    const extraLength = normalizedTitle.length - normalizedKeyword.length;
    const extraRatio = extraLength / normalizedTitle.length;

    // 추가된 부분이 20% 미만이면 너무 유사
    if (extraRatio < 0.2) {
      console.warn(`[TitleValidation] ⚠️ 제목이 키워드에 조금만 추가됨: "${cleanTitle}"`);
      return {
        isTooSimilar: true,
        similarity: 1 - extraRatio,
        warning: `⚠️ 제목이 키워드와 거의 동일합니다 (${Math.round((1 - extraRatio) * 100)}% 유사). 더 창의적으로 변형하세요.`
      };
    }
  }

  // 단어 기반 유사도 계산
  const titleWords = cleanTitle.split(/[\s\-–—:|·•.,!?]+/).filter(w => w.length >= 2);
  const keywordWords = cleanKeyword.split(/[\s\-–—:|·•.,!?]+/).filter(w => w.length >= 2);

  if (keywordWords.length === 0) {
    return { isTooSimilar: false, similarity: 0 };
  }

  // 키워드 단어 중 제목에 포함된 비율
  let matchCount = 0;
  for (const kw of keywordWords) {
    for (const tw of titleWords) {
      if (tw.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(tw.toLowerCase())) {
        matchCount++;
        break;
      }
    }
  }

  const similarity = matchCount / keywordWords.length;

  // 80% 이상 단어가 동일하면 경고
  if (similarity >= 0.8 && titleWords.length <= keywordWords.length + 2) {
    console.warn(`[TitleValidation] ⚠️ 제목과 키워드 유사도 높음 (${Math.round(similarity * 100)}%): "${cleanTitle}"`);
    return {
      isTooSimilar: true,
      similarity,
      warning: `⚠️ 제목과 키워드 유사도 ${Math.round(similarity * 100)}%. 숫자, 질문형, 손실회피 트리거를 추가하세요.`
    };
  }

  return { isTooSimilar: false, similarity };
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

/**
 * ✅ [2026-02-13] 긴 키워드 전처리
 * - 25자 이상의 키워드는 제목 생성에 그대로 사용하면 반복/의미없는 제목이 생성됨
 * - 콜론(:) 앞부분만 핵심 키워드로 추출하고, 나머지는 주제 문맥으로 분리
 * - 키워드가 짧으면 그대로 반환
 */
function preprocessLongKeyword(rawKeyword: string): { coreKeyword: string; contextHint: string; isLong: boolean } {
  const trimmed = rawKeyword.trim();
  if (trimmed.length <= 25) {
    return { coreKeyword: trimmed, contextHint: '', isLong: false };
  }

  // 콜론 앞부분 추출 (예: "2026 연말정산 환급: 10가지 놓치기 쉬운 공제 항목" → "2026 연말정산 환급")
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0 && colonIdx <= 30) {
    const core = trimmed.substring(0, colonIdx).trim();
    const context = trimmed.substring(colonIdx + 1).trim();
    return { coreKeyword: core, contextHint: context, isLong: true };
  }

  // 콜론 없으면 첫 번째 쉼표 또는 공백 기준으로 25자 내에서 자르기
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx > 0 && commaIdx <= 25) {
    const core = trimmed.substring(0, commaIdx).trim();
    const context = trimmed.substring(commaIdx + 1).trim();
    return { coreKeyword: core, contextHint: context, isLong: true };
  }

  // 공백 기준으로 최대 4단어까지만 핵심 키워드로 사용
  const words = trimmed.split(/\s+/);
  if (words.length > 4) {
    const core = words.slice(0, 4).join(' ');
    const context = words.slice(4).join(' ');
    return { coreKeyword: core, contextHint: context, isLong: true };
  }

  return { coreKeyword: trimmed, contextHint: '', isLong: false };
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

  // ✅ [2026-03-06] 홈판 도입부 3줄 최적화 — 체류시간 3초 뒤로가기 방지
  if (content.introduction) {
    const intro = String(content.introduction).trim();
    const lines = intro.split(/\n+/).filter(l => l.trim());

    // 도입부 첫 줄이 25자 초과 → 지나치게 기므로 경고 로깅
    if (lines.length > 0 && lines[0].length > 25) {
      console.log(`[HomefeedHook] ⚠️ 도입부 첫줄 ${lines[0].length}자 — 모바일 스크롤 없이 핵심 노출 위험`);
    }

    // 도입부가 5줄 초과 → 처음 3줄만 유지 (모바일 above-the-fold)
    if (lines.length > 5) {
      content.introduction = lines.slice(0, 3).join('\n');
      console.log(`[HomefeedHook] ✂️ 도입부 ${lines.length}줄 → 3줄로 컷 (체류시간 최적화)`);
    }
  }

  // ✅ [2026-03-06] 소제목 본문에 서브키워드 밀도 보강 — 네이버 AI 토픽 매칭 신호
  const subKwArr = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 3)
    : [];
  if (subKwArr.length > 0 && Array.isArray(content.headings) && content.headings.length > 0) {
    let subKwFoundCount = 0;
    for (const heading of content.headings) {
      const body = String((heading as any).body || (heading as any).content || '');
      const title = String(heading.title || '');
      for (const kw of subKwArr) {
        if (body.includes(String(kw)) || title.includes(String(kw))) {
          subKwFoundCount++;
          break;
        }
      }
    }
    const ratio = subKwFoundCount / content.headings.length;
    if (ratio < 0.5) {
      console.log(`[HomefeedHook] ⚠️ 서브키워드 본문 밀도 부족 (${Math.round(ratio * 100)}% — 소제목 ${subKwFoundCount}/${content.headings.length}개에만 포함)`);
    } else {
      console.log(`[HomefeedHook] ✅ 서브키워드 본문 밀도 양호 (${Math.round(ratio * 100)}% — ${subKwFoundCount}/${content.headings.length}개 소제목에 포함)`);
    }
  }

  // ✅ [2026-03-06] 스크롤 트리거 검증 — 3개 이상 의무
  if (Array.isArray(content.headings) && content.headings.length > 0) {
    const scrollTriggers = [
      '근데', '여기서', '반전', '사실은', '그런데', '놀라운',
      '중요한', '궁금하', '이쯤', '끝이 아니', '더 놀라운',
      '비밀이', '핵심은', '진짜는', '알고보니', '솔직히',
      '있잖아', '그게 아니', '잠깐', '여기서부터'
    ];
    let triggerCount = 0;
    const fullBodyText = content.headings.map(
      (h: any) => String(h.title || '') + ' ' + String((h as any).body || (h as any).content || '')
    ).join(' ');
    for (const trigger of scrollTriggers) {
      if (fullBodyText.includes(trigger)) triggerCount++;
    }
    if (triggerCount < 3) {
      console.log(`[HomefeedHook] ⚠️ 스크롤 트리거 부족 (${triggerCount}/3개 — 이탈률 상승 위험)`);
    } else {
      console.log(`[HomefeedHook] ✅ 스크롤 트리거 양호 (${triggerCount}개 발견)`);
    }

    // ✅ [2026-03-06] AI 특유 표현 차단 — 발견 시 경고
    const aiBanned = [
      '알아보겠습니다', '소개해드리', '살펴보았습니다', '종합적으로',
      '귀추가 주목', '많은 관심이 모이고', '주목할 만한 행보',
      '정리하자면', '요약하면', '핵심:', '요약:', '정리:'
    ];
    let aiCount = 0;
    for (const ban of aiBanned) {
      if (fullBodyText.includes(ban)) {
        aiCount++;
        console.log(`[HomefeedHook] 🚨 AI 특유 표현 발견: "${ban}" — 홈판 노출 패널티 위험`);
      }
    }
    if (aiCount === 0) {
      console.log(`[HomefeedHook] ✅ AI 표현 0개 — 사람 냄새 양호`);
    }

    // ✅ [2026-03-06] 소제목 수 검증 — 3~8개가 최적 (구조 변동 엔진 대응)
    const headingCount = content.headings.length;
    if (headingCount < 3) {
      console.log(`[HomefeedHook] ⚠️ 소제목 ${headingCount}개 — 최소 3개 필요`);
    } else if (headingCount > 8) {
      console.log(`[HomefeedHook] ⚠️ 소제목 ${headingCount}개 — 너무 많음 (8개 이하 권장)`);
    } else {
      console.log(`[HomefeedHook] ✅ 소제목 ${headingCount}개 — 구조 변동 엔진 허용 범위`);
    }

    // ✅ [2026-03-06] 본문 품질 종합 점수 로깅
    let bodyScore = 100;
    if (triggerCount < 3) bodyScore -= 15;
    if (aiCount > 0) bodyScore -= (aiCount * 10);
    if (headingCount < 3) bodyScore -= 20;
    if (headingCount > 8) bodyScore -= 10;
    // 서브키워드 밀도 반영
    if (subKwArr.length > 0) {
      let kwHitCount = 0;
      for (const heading of content.headings) {
        const hBody = String((heading as any).body || (heading as any).content || '');
        const hTitle = String(heading.title || '');
        for (const kw of subKwArr) {
          if (hBody.includes(String(kw)) || hTitle.includes(String(kw))) { kwHitCount++; break; }
        }
      }
      const kwRatio = kwHitCount / content.headings.length;
      if (kwRatio < 0.5) bodyScore -= 15;
      else bodyScore += 10;
    }
    bodyScore = Math.max(0, Math.min(100, bodyScore));
    console.log(`[HomefeedBodyQuality] 📊 홈판 본문 품질 점수: ${bodyScore}/100`);
  }

  return content;
}

// ✅ [2026-03-06] SEO 전용 품질 Hook 블록 — 홈피드 Hook과 동급 런타임 품질 게이트
function applySeoQualityHookBlock(content: StructuredContent, source: ContentSource): StructuredContent {
  const mode = (source.contentMode || 'seo') as PromptMode;
  if (mode !== 'seo') return content;

  // ✅ 서브키워드 본문 밀도 체크 (DIA 검색의도 매칭)
  const seoSubKwArr = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 3)
    : [];
  if (seoSubKwArr.length > 0 && Array.isArray(content.headings) && content.headings.length > 0) {
    let subKwFoundCount = 0;
    for (const heading of content.headings) {
      const body = String((heading as any).body || (heading as any).content || '');
      const htitle = String(heading.title || '');
      for (const kw of seoSubKwArr) {
        if (body.includes(String(kw)) || htitle.includes(String(kw))) {
          subKwFoundCount++;
          break;
        }
      }
    }
    const ratio = subKwFoundCount / content.headings.length;
    if (ratio < 0.5) {
      console.log(`[SeoHook] ⚠️ 서브키워드 본문 밀도 부족 (${Math.round(ratio * 100)}% — ${subKwFoundCount}/${content.headings.length}개 소제목)`);
    } else {
      console.log(`[SeoHook] ✅ 서브키워드 본문 밀도 양호 (${Math.round(ratio * 100)}%)`);
    }
  }

  // ✅ 스크롤 트리거 검증 (체류시간 ↑)
  if (Array.isArray(content.headings) && content.headings.length > 0) {
    const seoScrollTriggers = [
      '근데', '사실은', '여기서', '중요한', '핵심은', '솔직히',
      '의외로', '반전', '바로', '결론', '이게', '알고보니',
      '참고로', '한 가지 더', '잠깐', '조심할'
    ];
    let triggerCount = 0;
    const fullBodyText = content.headings.map(
      (h: any) => String(h.title || '') + ' ' + String((h as any).body || (h as any).content || '')
    ).join(' ');
    for (const trigger of seoScrollTriggers) {
      if (fullBodyText.includes(trigger)) triggerCount++;
    }
    if (triggerCount < 3) {
      console.log(`[SeoHook] ⚠️ 스크롤 트리거 부족 (${triggerCount}/3개)`);
    } else {
      console.log(`[SeoHook] ✅ 스크롤 트리거 양호 (${triggerCount}개)`);
    }

    // ✅ 소제목 수 검증 (3~8개 — 구조 변동 엔진 대응)
    const hCount = content.headings.length;
    if (hCount < 3) {
      console.log(`[SeoHook] ⚠️ 소제목 ${hCount}개 — 최소 3개 필요`);
    } else if (hCount > 8) {
      console.log(`[SeoHook] ⚠️ 소제목 ${hCount}개 — 8개 이하 권장`);
    } else {
      console.log(`[SeoHook] ✅ 소제목 ${hCount}개 — 구조 변동 엔진 허용 범위`);
    }

    // ✅ SEO 본문 품질 종합 점수
    let seoBodyScore = 100;
    if (triggerCount < 3) seoBodyScore -= 10;
    if (hCount < 3) seoBodyScore -= 15;
    if (hCount > 8) seoBodyScore -= 5;

    // AI 표현 체크
    const seoBanned = [
      '알아보겠습니다', '소개해드리', '살펴보았습니다', '종합적으로',
      '정리하자면', '요약하면', '물론', '확실히', '것입니다', '하겠습니다'
    ];
    let seoAiCount = 0;
    for (const ban of seoBanned) {
      if (fullBodyText.includes(ban)) {
        seoAiCount++;
        console.log(`[SeoHook] 🚨 AI 표현: "${ban}"`);
      }
    }
    if (seoAiCount === 0) {
      console.log(`[SeoHook] ✅ AI 표현 0개`);
    }
    seoBodyScore -= (seoAiCount * 8);

    // 서브키워드 밀도 반영
    if (seoSubKwArr.length > 0) {
      let kwHitCount = 0;
      for (const heading of content.headings) {
        const hBody = String((heading as any).body || (heading as any).content || '');
        const hTitle = String(heading.title || '');
        for (const kw of seoSubKwArr) {
          if (hBody.includes(String(kw)) || hTitle.includes(String(kw))) { kwHitCount++; break; }
        }
      }
      const kwRatio = kwHitCount / content.headings.length;
      if (kwRatio < 0.5) seoBodyScore -= 10;
      else seoBodyScore += 10;
    }

    seoBodyScore = Math.max(0, Math.min(100, seoBodyScore));
    console.log(`[SeoBodyQuality] 📊 SEO 본문 품질 점수: ${seoBodyScore}/100`);
  }

  return content;
}

// ✅ [2026-02-09 v3] 제목 공식 패턴 로테이션 시스템 — 카테고리 인식 + 확장
interface TitleFormula {
  id: string;
  name: string;
  instruction: string;
  example: string;
}

const SEO_TITLE_FORMULAS: TitleFormula[] = [
  {
    id: 'question', name: '질문형',
    instruction: '독자에게 직접 질문하며 궁금증을 유발. 답을 알고 싶게 만들 것.',
    example: '전세보증금 반환보증, 가입 안 하면 어떻게 되는지 알고 있나요?'
  },
  {
    id: 'first_person', name: '1인칭 경험형',
    instruction: '직접 경험한 것처럼 솔직하게 작성. "~해봤더니", "~써보니" 활용.',
    example: '청년도약계좌 6개월 넣어보니, 솔직히 이건 꼭 해야 합니다'
  },
  {
    id: 'concrete_result', name: '구체적 결과형',
    instruction: '숫자와 기간으로 구체적 결과를 먼저 제시. 신뢰감 있게.',
    example: '부업 시작 3개월, 월 50만원 추가 수입 만든 현실적 방법'
  },
  {
    id: 'comparison', name: '비교·발견형',
    instruction: '의외의 차이점 또는 몰랐던 사실을 부각. "몰랐다", "차이" 활용.',
    example: '적금 vs 예금, 같은 5%인데 이자가 이렇게 다를 줄 몰랐다'
  },
  {
    id: 'loss_aversion', name: '손실회피형',
    instruction: '독자가 놓치면 아쉽다고 느끼게 작성. 구체적 금액/기회를 명시. 단, "손해"라는 단어 직접 사용 자제.',
    example: '자동차세 연납, 1월 안에 안 하면 4.57% 할인 사라진다'
  },
  // ✅ [v3] 신규 3개 추가
  {
    id: 'warning', name: '경고·주의형',
    instruction: '하지 말아야 할 행동/실수를 경고. "절대 하지 마세요", "이것만은 피하세요" 활용.',
    example: '전세사기 피하려면, 계약 전 이 3가지 절대 하지 마세요'
  },
  {
    id: 'timeline', name: '타임라인형',
    instruction: '시간 순서/기한이 있는 정보를 강조. 긴급성 부여.',
    example: '2026년 3월까지 신청해야 받는 정부지원금 5가지'
  },
  {
    id: 'checklist', name: '체크리스트형',
    instruction: '독자가 바로 확인할 수 있는 목록 형태. 숫자와 조건 제시.',
    example: '이사 전 반드시 확인해야 할 7가지 체크리스트'
  },
];

const HOMEFEED_TITLE_FORMULAS: TitleFormula[] = [
  // ────── 체험 계열 (온도 1~2단계) ──────
  {
    id: 'hf_duration_exp', name: '①체험형',
    instruction: '장기 사용 체험을 기반으로 신뢰도 높이기. 기간 수치(N주/N개월)를 절대 명시하지 말고 "오래 써보니", "꾸준히 써본 결과" 같은 표현 사용. 서브키워드 필수. 28~42자.',
    example: '무선 청소기 다이슨 꾸준히 써보니 생각이 바뀌었어요'
  },
  {
    id: 'hf_direct_exp', name: '②직접해봄형',
    instruction: '"직접 해봤더니" 구조로 1인칭 체험 결과 전달. 서브키워드 포함 필수. 28~42자.',
    example: '전기세 절약 이 방법 해봤더니 월 3만원 줄었어요'
  },
  {
    id: 'hf_before_after', name: '③전후비교형',
    instruction: '"바꿨더니" 구조로 변화 전후를 극적 대비. 서브키워드로 토픽 분류 보장. 28~42자.',
    example: '거실 조명 바꿨더니 분위기가 완전 달라졌어요'
  },
  {
    id: 'hf_accumulated', name: '④누적후기형',
    instruction: '누적된 사용 후기 + 솔직 평가. 기간 수치(N주/N개월)를 절대 명시하지 말고 "써본 후기", "오래 써본 결과" 같은 표현 사용. 서브키워드 필수. 28~42자.',
    example: '공기청정기 위닉스 써본 후기, 비염에 진짜 효과 있음?'
  },
  // ────── 반응 계열 (온도 2~3단계) ──────
  {
    id: 'hf_others_reaction', name: '⑤타인반응형',
    instruction: '타인의 놀라운/의외 반응을 활용하여 CTR 극대화. 서브키워드 앞에 배치. 28~42자.',
    example: '원룸 인테리어 바꿨더니 친구가 이사했냐고 물어봄'
  },
  {
    id: 'hf_unexpected', name: '⑥의외발견형',
    instruction: '예상과 다른 결과/의외의 사실 강조. 서브키워드로 토픽 매칭 보장. 28~42자.',
    example: '다이어트 식단만 바꿨는데 운동보다 효과 있었어요'
  },
  {
    id: 'hf_comments', name: '⑦댓글반응형',
    instruction: '댓글/SNS/팬 반응을 활용한 사회적 증거 제목. 연예/스포츠에 최적. 28~42자.',
    example: '뉴진스 컴백 무대 직캠 올렸더니 해외 팬 반응 뜨거워'
  },
  {
    id: 'hf_spread', name: '⑧주변전파형',
    instruction: '정보를 알려줬을 때 주변의 반응을 강조. 서브키워드 필수 포함. 28~42자.',
    example: '연말정산 환급 방법 알려줬더니 직장 동료들 난리'
  },
  // ────── 정보 계열 (온도 1단계) ──────
  {
    id: 'hf_simple_summary', name: '⑨간단정리형',
    instruction: '"달라진 점, 간단히 정리" 구조. 사회/경제/정책 카테고리에 최적. 서브키워드 필수. 28~42자.',
    example: '2025 최저임금 달라진 점, 알바생 입장에서 정리했어요'
  },
  {
    id: 'hf_miss_loss', name: '⑩놓치면손해형',
    instruction: '"확인했는데 놓치기 쉬운 점" 구조로 손실회피 심리 자극. 서브키워드 필수. 28~42자.',
    example: '청년지원금 신청 자격 확인했는데 90%가 놓치는 조건 하나'
  },
  {
    id: 'hf_applicability', name: '⑪해당확인형',
    instruction: '"이런 분 해당, 확인해보세요" 구조. 타깃 독자 특정. 서브키워드 필수. 28~42자.',
    example: '국민연금 조기수령 이런 분 해당, 금액 차이 확인해보세요'
  },
  {
    id: 'hf_comparison', name: '⑫비교분석형',
    instruction: '두 대상을 직접 비교한 결과 제시. 서브키워드 2개 포함 권장. 28~42자.',
    example: '아이폰16 카메라 갤럭시25 비교, 직접 찍어보고 정리'
  },
  // ────── 공감 계열 (온도 2단계) ──────
  {
    id: 'hf_me_too', name: '⑬나도그랬어형',
    instruction: '"저도 그랬는데" 구조로 독자 동질감 형성. 해결책 암시. 서브키워드 필수. 28~42자.',
    example: '전세사기 불안했는데 저도 그랬어요, 이것만 확인하세요'
  },
  {
    id: 'hf_confession', name: '⑭솔직고백형',
    instruction: '"솔직히 후회한/아쉬운" 구조로 진솔한 감정 전달. 기간 수치 명시 금지. 서브키워드 필수. 28~42자.',
    example: '테슬라 모델3 타보니 솔직히 후회한 점 하나'
  },
  {
    id: 'hf_common_worry', name: '⑮모두의고민형',
    instruction: '"다들 고민하시죠, 해결법" 구조. 보편적 걱정 → 해결 흐름. 서브키워드 필수. 28~42자.',
    example: '적금 금리 떨어질 때 다들 고민하시죠, 대안 정리해봤어요'
  },
  // ────── 호기심 계열 (온도 2단계) ──────
  {
    id: 'hf_reason_tracking', name: '⑯이유추적형',
    instruction: '"왜 이런지 찾아봤더니" 구조. 호기심 자극 후 정보 약속. 서브키워드 필수. 28~42자.',
    example: '삼성전자 주가 왜 이렇게 빠졌는지 찾아봤더니'
  },
  {
    id: 'hf_hidden_truth', name: '⑰숨겨진진실형',
    instruction: '"알고 보니 반전" 구조. 기존 상식 뒤집기. 서브키워드 필수. 28~42자.',
    example: '에어컨 전기세 알고 보니 설정 온도보다 중요한 게 있었음'
  },
  {
    id: 'hf_after_story', name: '⑱그후이야기형',
    instruction: '"그 후 결과" 구조. 사건/행동 이후 변화 추적. 서브키워드 필수. 28~42자.',
    example: '손흥민 부상 복귀 그 후 경기력 변화, 동료 반응까지'
  },
  // ────── 결과 계열 (온도 1~2단계) ──────
  {
    id: 'hf_numeric_proof', name: '⑲수치증명형',
    instruction: '구체적 숫자(금액/비율/수량/횟수)로 결과 증명. 기간(N주/N개월) 대신 금액/비율/개수 우선 사용. 서브키워드 필수. 28~42자.',
    example: '블로그 수익 애드센스로 월 50만원 찍은 방법'
  },
  {
    id: 'hf_final_choice', name: '⑳최종선택형',
    instruction: '"고민 끝에 선택한 이유" 구조. 비교 후 결론 제시. 서브키워드 2개 권장. 28~42자.',
    example: '노트북 맥북 레노버 고민 끝에 선택한 이유'
  },
];

// ✅ [2026-03-13] 쇼핑커넥트 전용 제목 공식 8개 — 제품 후기 최적화
const AFFILIATE_TITLE_FORMULAS: TitleFormula[] = [
  {
    id: 'af_comma_link', name: '①쉼표연결형',
    instruction: '"상품명, 상황/체험 후기표현" 구조. 쉼표로 상품명과 후기를 자연스럽게 연결. 기간 수치 대신 "써본", "직접 써본" 같은 표현 사용. 25~45자.',
    example: '린백 LB221HA, 직접 써본 사무용의자 솔직 후기'
  },
  {
    id: 'af_question', name: '②질문형',
    instruction: '"가격대 상품명 의문표현" 구조. 독자 호기심 자극. 25~45자.',
    example: '9만원대 린백 LB221HA 허리 아픈 직장인 추천할까?'
  },
  {
    id: 'af_duration', name: '③체험형',
    instruction: '사용 체험 + 솔직후기. 기간 수치(N주/N개월)는 절대 사용하지 말고 "직접 써본", "꾸준히 쓴", "오래 써본" 같은 표현 사용. 25~45자.',
    example: '린백 LB221HA 가성비 의자 직접 써본 솔직 후기'
  },
  {
    id: 'af_switch', name: '④갈아탄형',
    instruction: '이전 제품에서 교체한 경험 강조. "바꿨더니", "갈아탄" 활용. 25~45자.',
    example: '사무용의자 린백 LB221HA 갈아탄 후 달라진 점'
  },
  {
    id: 'af_price', name: '⑤가격강조형',
    instruction: '가격대를 앞에 배치하여 가성비 의문 제기. 25~45자.',
    example: '9만원대 사무용의자 린백 LB221HA 진짜 가성비인가'
  },
  {
    id: 'af_gift', name: '⑥선물추천형',
    instruction: '선물/추천 상황 + 타인 반응. "선물", "사줬더니" 활용. 25~45자.',
    example: '린백 LB221HA 부모님 선물로 사드렸더니 반응'
  },
  {
    id: 'af_proscons', name: '⑦장단점형',
    instruction: '사용 기간 + 좋은 점/아쉬운 점 솔직 고백. 25~45자.',
    example: '린백 LB221HA 3개월, 좋은 점 아쉬운 점 솔직히'
  },
  {
    id: 'af_target', name: '⑧상황추천형',
    instruction: '특정 대상/상황에 추천하는 구조. "이런 분께", "용으로" 활용. 25~45자.',
    example: '재택근무용 의자 린백 LB221HA 이런 분께 추천'
  },
];

// ✅ [v3 → v4] 카테고리별 우선 공식 매핑 — 20개 아키타입 기반 감정 온도별 최적화
// ✅ [v1.4.47] 기간체험형 완전 제거 — 카테고리별 우선순위에서 아예 빠짐
// 기간체험형은 이제 일반 pool에서만 선택 가능하며, 최근 이력 2개 이상 시 스킵됨
const CATEGORY_FORMULA_PRIORITY: Record<string, string[]> = {
  // 🧊 쿨-정보형 카테고리
  '사회': ['hf_simple_summary', 'hf_miss_loss', 'hf_applicability', 'hf_numeric_proof', 'hf_common_worry'],
  // ✅ [v1.4.48 Stage A.1] 'loss_aversion' 제거 — 어떤 풀에도 존재하지 않는 유령 ID였음
  '재테크': ['hf_numeric_proof', 'hf_miss_loss', 'hf_comparison', 'hf_simple_summary', 'hf_applicability'],
  // 🔥 워밍-공감형 카테고리
  '건강': ['hf_direct_exp', 'hf_unexpected', 'hf_confession', 'hf_me_too', 'hf_before_after'],
  'IT': ['hf_comparison', 'hf_before_after', 'hf_final_choice', 'hf_numeric_proof', 'hf_unexpected'],
  '여행': ['hf_others_reaction', 'hf_before_after', 'hf_hidden_truth', 'hf_me_too', 'hf_unexpected'],
  '음식': ['hf_direct_exp', 'hf_others_reaction', 'hf_hidden_truth', 'hf_confession', 'hf_unexpected'],
  '맛집': ['hf_direct_exp', 'hf_others_reaction', 'hf_hidden_truth', 'hf_confession', 'hf_unexpected'],
  '리빙': ['hf_before_after', 'hf_others_reaction', 'hf_comparison', 'hf_direct_exp', 'hf_unexpected'],
  '육아': ['hf_me_too', 'hf_confession', 'hf_common_worry', 'hf_direct_exp', 'hf_unexpected'],
  '패션': ['hf_before_after', 'hf_others_reaction', 'hf_comparison', 'hf_final_choice', 'hf_unexpected'],
  '반려동물': ['hf_me_too', 'hf_confession', 'hf_before_after', 'hf_others_reaction', 'hf_unexpected'],
  '쇼핑': ['hf_numeric_proof', 'hf_comparison', 'hf_confession', 'hf_final_choice', 'hf_unexpected'],
  // 🔥🔥 핫-반응형 카테고리
  '연예': ['hf_comments', 'hf_others_reaction', 'hf_after_story', 'hf_reason_tracking', 'hf_spread'],
  '스포츠': ['hf_comments', 'hf_others_reaction', 'hf_after_story', 'hf_numeric_proof', 'hf_reason_tracking'],
  // 🔥+🔥🔥 혼합 카테고리
  '생활': ['hf_direct_exp', 'hf_unexpected', 'hf_spread', 'hf_numeric_proof', 'hf_hidden_truth'],
};

function selectTitleFormula(mode: PromptMode, attempt: number, usedIds: string[], categoryHint?: string): TitleFormula {
  // ✅ [2026-03-13] affiliate 전용 공식 풀 추가 — SEO 공식 대신 제품 후기 최적화 공식 사용
  const pool = mode === 'homefeed' ? HOMEFEED_TITLE_FORMULAS
    : mode === 'affiliate' ? AFFILIATE_TITLE_FORMULAS
    : SEO_TITLE_FORMULAS;
  // ✅ [v1.4.48 Stage A.1] 모드별 풀에서만 검색 — 홈피드 글에 SEO/affiliate 공식 섞임 방지
  // 기존: allFormulas = [...SEO, ...HOMEFEED, ...AFFILIATE] → 카테고리 우선 ID 오타 시 타 모드 공식 선택됨
  // 수정: 모드 pool 내에서만 카테고리 우선 ID 검색
  const allFormulas = pool;

  // ✅ [v1.4.46] 최근 기간 표현 2개 이상 사용 시 기간 계열 공식 스킵
  const DURATION_FORMULA_IDS = ['hf_duration_exp', 'af_duration', 'hf_accumulated'];
  let skipDurationFormulas = false;
  // ✅ [v1.4.48 Stage A.2] 정적 import 사용 (require 제거)
  const recent = getRecentPeriods() || [];
  if (recent.length >= 2) {
    skipDurationFormulas = true;
    console.log(`[TitleGen] 🚫 최근 ${recent.length}개 기간 반복 감지 → 기간 계열 공식 스킵`);
  }

  // ✅ [v3] 카테고리 우선 공식이 있으면 먼저 시도
  if (categoryHint && CATEGORY_FORMULA_PRIORITY[categoryHint]) {
    const priorityIds = CATEGORY_FORMULA_PRIORITY[categoryHint]
      .filter(id => !skipDurationFormulas || !DURATION_FORMULA_IDS.includes(id));
    const priorityUnused = priorityIds
      .filter(id => !usedIds.includes(id))
      .map(id => allFormulas.find(f => f.id === id))
      .filter((f): f is TitleFormula => !!f);
    if (priorityUnused.length > 0) {
      console.log(`[TitleGen] 🎯 카테고리 우선 공식 (${categoryHint}): ${priorityUnused[0].name}`);
      return priorityUnused[0];
    }
  }

  // 아직 사용하지 않은 공식 우선 (해당 모드 풀에서, 필요 시 기간 공식 제외)
  const filteredPool = skipDurationFormulas
    ? pool.filter(p => !DURATION_FORMULA_IDS.includes(p.id))
    : pool;
  const unused = filteredPool.filter(p => !usedIds.includes(p.id));
  if (unused.length > 0) {
    return unused[attempt % unused.length];
  }
  // 전부 사용했으면 랜덤
  return filteredPool[Math.floor(Math.random() * filteredPool.length)] || pool[0];
}

// ✅ [v3] 감점 이유별 구체적 수정 지침
const ISSUE_ACTION_MAP: Record<string, string> = {
  '뻔한 템플릿 종결어': '"~했더니", "~인 이유", "~의 비밀" 같은 신선한 종결어를 사용하세요.',
  '키워드와 너무 유사': '키워드를 자연스러운 문장 속에 녹여 쓰세요. 단순 나열 금지.',
  'SEO: 40자 초과': '핵심만 남기고 불필요한 수식어를 제거하세요. 25~35자가 이상적.',
  '50자 초과': '문장을 반으로 줄이세요. 가장 중요한 정보 하나만 남기세요.',
  'SEO: 키워드가 뒤쪽에 배치': '키워드를 제목 앞부분(10자 이내)에 배치하세요.',
  '홈판: 뻔한 AI티 표현': '"충격/경악/눈물바다" 대신 구체적 상황/디테일을 쓰세요.',
  'SEO: 숫자/구체성 없음': '구체적 숫자(기간, 금액, 횟수)를 반드시 포함하세요.',
  '중복 키워드': '같은 단어는 제목에 한 번만 쓰세요. 동의어로 변환하거나 생략.',
  '숫자+단위 반복': '같은 숫자+단위 조합은 한 번만 쓰세요.',
  '두 제목 합치기 패턴': '한 문장으로 된 자연스러운 제목을 만드세요. 두 제목을 합치지 마세요.',
  '어간 변형 중복': '같은 동사/명사의 활용형을 반복하지 마세요.',
  '쉼표 전후 키워드 반복': '쉼표 앞뒤로 같은 단어가 나오면 안 됩니다.',
};

function buildTitleRetryFeedback(attempt: number, prevTitle: string, prevScore: number, prevIssues: string[]): string {
  if (attempt === 0 || !prevTitle) return '';

  // ✅ [v3] 시도 횟수별 전략 에스컬레이션
  const escalationLevel = [
    '', // attempt 0: 사용 안 함
    '💡 다른 공식 패턴과 다른 문장 구조로 작성하세요.',
    '🔄 완전히 다른 관점에서 접근하세요. 대상/행동/결과 중 하나를 바꿔보세요.',
    '🚀 가장 대담하고 파격적인 표현을 사용하세요. 기존 틀을 완전히 벗어나세요.',
  ][Math.min(attempt, 3)];

  let feedback = `\n\n⛔ [이전 시도 피드백 - 반드시 다른 방식으로 작성!]\n`;
  feedback += `이전 제목: "${prevTitle}" → ${prevScore}점 (불합격)\n`;

  if (prevIssues.length > 0) {
    feedback += `감점 이유 및 수정 방향:\n`;
    prevIssues.forEach(issue => {
      // ✅ [v3] 이슈별 구체적 행동 지침 매핑
      const baseIssue = Object.keys(ISSUE_ACTION_MAP).find(k => issue.includes(k));
      const action = baseIssue ? ISSUE_ACTION_MAP[baseIssue] : '이 문제를 회피하세요.';
      feedback += `  ❌ ${issue}\n     → ${action}\n`;
    });
  }
  feedback += `\n${escalationLevel}\n`;
  return feedback;
}

async function generateTitleOnlyPatch(source: ContentSource, mode: PromptMode, categoryHint?: string, provider?: string): Promise<{
  selectedTitle?: string;
  titleCandidates?: TitleCandidate[];
  titleAlternatives?: string[];
}> {
  const primaryKeyword = getPrimaryKeywordFromSource(source);
  const articleSnippet = source.rawText ? source.rawText.substring(0, 1000) : '';
  // ✅ [2026-03-13] affiliate 모드: 상품명 축약 전처리 (키워드 나열 방지)
  let originalTitle = source.title || '';
  if (mode === 'affiliate' && originalTitle.length > 25) {
    const processed = preprocessLongKeyword(originalTitle);
    console.log(`[TitleGen] ✅ 상품명 축약: "${originalTitle.substring(0, 50)}" → "${processed.coreKeyword}"`);
    originalTitle = processed.coreKeyword;
  }

  // ✅ [2026-02-02] 카테고리별 제목 프롬프트 로드 (카테고리 → 기본 폴백)
  let titlePrompt = '';
  try {
    // 카테고리 매핑 (한글 → 영문 파일명)
    const categoryToFile: Record<string, string> = {
      '연예': 'entertainment', '스포츠': 'sports', '건강': 'health',
      'IT': 'it', '패션': 'fashion', '음식': 'food', '여행': 'travel',
      '라이프': 'life', '리빙': 'living', '육아': 'parenting',
      '반려동물': 'pet', '사회': 'society', '생활': 'tips',
      'entertainment': 'entertainment', 'sports': 'sports', 'health': 'health',
      'it_review': 'it', 'it': 'it', 'fashion': 'fashion', 'food': 'food',
      'travel': 'travel', 'lifestyle': 'life', 'life': 'life', 'living': 'living',
      'parenting': 'parenting', 'pet': 'pet', 'society': 'society', 'tips': 'tips',
      'shopping_review': 'living', 'finance': 'society'
    };

    // 1. 카테고리별 프롬프트 시도 (mode/category.prompt)
    const categoryFile = categoryToFile[categoryHint || ''] || '';
    let promptLoaded = false;

    if (categoryFile) {
      const categoryPromptPath = path.join(app.getAppPath(), 'dist', 'prompts', 'title', mode, `${categoryFile}.prompt`);
      if (fsSync.existsSync(categoryPromptPath)) {
        titlePrompt = fsSync.readFileSync(categoryPromptPath, 'utf-8');
        console.log(`[TitleGen] ✅ 카테고리별 제목 프롬프트 로드: ${mode}/${categoryFile}.prompt`);
        promptLoaded = true;
      }
    }

    // 2. 카테고리별 없으면 기본 프롬프트 (mode/base.prompt)
    if (!promptLoaded) {
      const basePromptPath = path.join(app.getAppPath(), 'dist', 'prompts', 'title', mode, 'base.prompt');
      if (fsSync.existsSync(basePromptPath)) {
        titlePrompt = fsSync.readFileSync(basePromptPath, 'utf-8');
        console.log(`[TitleGen] ✅ 기본 제목 프롬프트 로드: ${mode}/base.prompt`);
        promptLoaded = true;
      }
    }

    // 3. 모드 폴더 없으면 레거시 방식 (title/mode.prompt)
    if (!promptLoaded) {
      let legacyFile = 'seo.prompt';
      if (mode === 'homefeed') legacyFile = 'homefeed.prompt';
      else if (mode === 'affiliate') legacyFile = 'affiliate.prompt';

      const legacyPath = path.join(app.getAppPath(), 'dist', 'prompts', 'title', legacyFile);
      if (fsSync.existsSync(legacyPath)) {
        titlePrompt = fsSync.readFileSync(legacyPath, 'utf-8');
        console.log(`[TitleGen] ✅ 레거시 제목 프롬프트 로드: ${legacyFile}`);
      }
    }
  } catch (e) {
    console.log('[TitleGen] ⚠️ 제목 전용 프롬프트 로드 실패, 기본 규칙 사용');
  }

  // ✅ [v1.4.47] 프롬프트 내부 하드코딩된 기간 예시 일괄 마스킹
  // 원인: 프롬프트 파일 16개에 "3개월", "한 달", "2주" 등이 예시 제목에 박혀있어
  //       AI가 그대로 복사 → 매 글마다 기간 표현 반복
  // 해결: 프롬프트를 런타임에 마스킹 + 강제 금지 지시 주입
  if (titlePrompt) {
    const beforeLen = titlePrompt.length;
    titlePrompt = titlePrompt
      // 숫자+기간 단위를 일반화: "3개월" → "장기간", "2주" → "꾸준히", "한 달" → "한동안"
      .replace(/\d+\s*개월\s*(?:차|째|만에|이용|사용|동안|후|전)?/g, '장기간')
      .replace(/\d+\s*주\s*(?:차|째|만에|이용|사용|동안|후|전)?/g, '꾸준히')
      .replace(/\d+\s*년\s*(?:차|째|만에|이용|사용|동안|후|전)?/g, '오랜 기간')
      .replace(/한\s*달(?:\s*(?:써본|써보니|쓴|복용|사용|후|전))?/g, '한동안 써본')
      .replace(/반년(?:\s*(?:써본|써보니|쓴|복용|사용|후|전))?/g, '오래 써본');
    console.log(`[TitleGen] 🔧 프롬프트 기간 예시 마스킹: ${beforeLen}자 → ${titlePrompt.length}자`);

    // 강제 금지 지시 주입
    titlePrompt += '\n\n🚫🚫🚫 [v1.4.47 강제 규칙 — 위반 시 0점]\n' +
      '1. 제목에 숫자+기간 단위(N주/N개월/N년/한 달/반년) 절대 사용 금지\n' +
      '2. 체험 표현은 "직접 써본", "꾸준히 써본", "오래 써본", "써보니", "써본 후기" 사용\n' +
      '3. 구체성이 필요하면 금액/비율/개수/조건/방법/대상/비교 등을 사용\n' +
      '4. 위 규칙 위반 시 제목 후보는 0점 처리됩니다.\n';
  }

  // ✅ [v1.4.47] 기본 규칙 (프롬프트 로드 실패 시 폴백) — 하드코딩된 기간 예시 제거
  const defaultTitleRules = mode === 'homefeed'
    ? `[필수 공식] {인물/상품명} + {마이크로 디테일} + {감정/공감 트리거}`
    : mode === 'affiliate'
      ? `[필수 공식] {상품명(브랜드+모델명만)}, {체험/상황 표현} {자연어 후기}. 단어 나열 금지, 자연어 문장형 필수. 기간 수치(N주/N개월) 사용 금지 — "직접 써본", "꾸준히 쓴" 등 표현 사용.`
      : `[필수 공식] {메인 키워드} + {구체성(금액/비율/개수/조건/방법/대상 중 택1)} + {클릭 트리거}. 기간 수치는 매 글마다 다양화 필수.`;

  const schema = `Output ONLY valid JSON. NO markdown.\n\n{"selectedTitle": "string", "titleCandidates": [{"text": "string", "score": 95}, {"text": "string", "score": 90}, {"text": "string", "score": 85}]}`;

  const subKeywords = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 5).join(', ')
    : '';

  const prompt = `
${titlePrompt || defaultTitleRules}

${schema}

[TASK]
아래 조건으로 제목 3개만 생성. 본문/소제목/해시태그 절대 생성 금지.

- mode: ${mode}
- originalTitle: ${originalTitle || '(없음)'}
- primaryKeyword: ${primaryKeyword || '(없음)'}
- subKeywords: ${subKeywords || '(없음)'}
${mode === 'homefeed' ? `
⛔⛔⛔ [홈피드 절대 규칙 — 위반 시 0점]
1. 같은 단어를 제목에 2번 이상 쓰지 마세요. (예: "침대 배치 공식 침대 배치" → 0점)
2. 키워드를 나열하지 마세요. 자연스러운 한 문장으로 쓰세요.
3. 반드시 28~42자 이내. 42자를 넘기면 무조건 0점입니다.
4. 서브키워드는 1~2개만 자연스럽게 포함. 3개 이상 나열 금지.
` : ''}
${mode === 'affiliate' ? `
⛔⛔⛔ [쇼핑커넥트 절대 규칙 — 위반 시 0점]
1. 상품명의 모든 키워드를 넣지 마세요. "브랜드명 + 모델명"만 사용하세요.
   ❌ "린백 컴퓨터 학생 책상 의자 린백 후기" (키워드 나열 = 0점)
   ✅ "린백 LB221HA, 직접 써본 솔직 후기" (자연어 문장 = 100점)
2. 키워드를 나열하지 마세요. 자연스러운 한 문장으로 쓰세요.
3. 같은 단어를 제목에 2번 이상 쓰지 마세요. (예: "린백...린백" → 0점)
4. originalTitle을 그대로 쓰거나 단어를 재배열하면 0점입니다.
5. 반드시 25~45자 이내.
` : ''}
${mode === 'homefeed' && subKeywords ? `
⚠️ [필수] 서브키워드 중 1~2개를 제목에 반드시 포함하세요!
→ 서브키워드가 빠지면 네이버 AI가 토픽 분류를 못해서 홈피드 노출 자체가 불가능합니다.
→ "자연스럽게 녹이세요"가 아니라 "반드시 드러내세요"입니다.
→ 단, 같은 단어를 2번 쓰면 0점! 나열식 금지!
` : ''}
${source.customPrompt ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 [사용자 추가 지시사항 - 최우선 반영]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${source.customPrompt.trim()}

⚠️ 위 사용자 지시사항을 제목 생성에 반드시 반영하세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}
[ARTICLE SNIPPET]
${articleSnippet}

JSON:
`.trim();

  // ✅ [2026-02-09 v2] 이전 생성 제목 히스토리 (연속발행 시 중복 방지)
  let previousTitlesPrompt = '';
  if (source.previousTitles && source.previousTitles.length > 0) {
    previousTitlesPrompt = `\n\n⛔ [이전 생성 제목 — 절대 유사하게 만들지 마세요]\n`;
    source.previousTitles.slice(-10).forEach((t: string, i: number) => {
      previousTitlesPrompt += `${i + 1}. "${t}"\n`;
    });
    previousTitlesPrompt += `→ 위 제목들과 구조/표현이 겹치면 0점입니다.\n`;
  }

  // ✅ [v1.4.46] 최근 사용한 기간 표현 동적 금지 — 연속 발행 시 "2주 3주 6개월 3개월" 반복 차단
  try {
    const { getRecentPeriods } = await import('./titleSelector.js');
    const recentPeriods = getRecentPeriods();
    if (recentPeriods.length > 0) {
      previousTitlesPrompt += `\n\n🚫 [최근 사용한 기간 표현 — 이번 제목에서 절대 사용 금지]\n`;
      previousTitlesPrompt += recentPeriods.map(p => `- "${p}"`).join('\n') + '\n';
      previousTitlesPrompt += `→ 위 기간 표현을 반복하면 0점입니다.\n`;
      previousTitlesPrompt += `→ 이번 제목은 기간(N주/N개월/N년) 표현 대신 다른 구체성을 사용하세요:\n`;
      previousTitlesPrompt += `   금액(월 3만원), 비율(4.57%), 개수(딱 하나), 조건(자격 기준),\n`;
      previousTitlesPrompt += `   방법명(이 설정), 대상(알바생), 비교(vs), 장소, 인물, 상황 등\n`;
    }
  } catch (e) {
    console.warn('[TitleGen] getRecentPeriods 로드 실패:', e);
  }

  // ✅ [2026-02-09 v2] 최대 3회 재생성 + 공식 패턴 로테이션 + 피드백
  const MAX_RETRIES = 3;
  let bestResult: { selectedTitle?: string; titleCandidates?: TitleCandidate[]; titleAlternatives?: string[] } = {};
  let bestScore = 0;
  let prevTitle = '';
  let prevScore = 0;
  let prevIssues: string[] = [];
  const usedFormulaIds: string[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // ✅ [v2] 매 시도마다 다른 공식 패턴 선택
      const formula = selectTitleFormula(mode, attempt, usedFormulaIds, categoryHint);
      usedFormulaIds.push(formula.id);
      const formulaInstruction = `\n\n🎯 [이번에 사용할 제목 공식: ${formula.name}]\n${formula.instruction}\n예시: "${formula.example}"\n⚠️ 반드시 위 공식 패턴을 적용하세요.`;

      // ✅ [v2] 재시도 시 이전 실패 피드백
      const retryFeedback = buildTitleRetryFeedback(attempt, prevTitle, prevScore, prevIssues);

      // ✅ [2026-02-23 FIX] 사용자 선택 provider로 제목 생성 (Gemini 하드코딩 제거)
      const titleTemp = 0.7 + (attempt * 0.05);
      const titlePromptFull = prompt + formulaInstruction + previousTitlesPrompt + retryFeedback;
      let raw: string;
      if (provider === 'perplexity') {
        raw = await callPerplexity(titlePromptFull, titleTemp, 650);
      } else if (provider === 'openai') {
        raw = await callOpenAI(titlePromptFull, titleTemp, 650);
      } else if (provider === 'claude') {
        raw = await callClaude(titlePromptFull, titleTemp, 650);
      } else {
        raw = await callGemini(titlePromptFull, titleTemp, 650, { useGrounding: false }); // ✅ [v1.4.3] 제목 패치는 Grounding OFF (비용 절감)
      }
      console.log(`[TitleGen] 시도 ${attempt + 1}/${MAX_RETRIES + 1} — 공식: ${formula.name}`);

      const parsed = safeParseJson<any>(raw);

      // ✅ [2026-04-11 FIX] 개행 제거 — 제목에 \n이 포함되면 뒷부분 잘림 + 본문 혼입
      let selectedTitle = typeof parsed?.selectedTitle === 'string'
        ? String(parsed.selectedTitle).replace(/[\r\n]+/g, ' ').trim()
        : undefined;
      let titleCandidates = Array.isArray(parsed?.titleCandidates)
        ? parsed.titleCandidates.map((c: any) => ({
          text: String(c?.text || '').replace(/[\r\n]+/g, ' ').trim(),
          score: Number(c?.score) || 0,
          reasoning: String(c?.reasoning || '').trim(),
        })).filter((c: any) => c.text)
        : undefined;

      if (!selectedTitle) continue;

      // ✅ [2026-02-09 FIX] 품질 평가 전에 제목 정제 실행!
      // 기존: AI 원본 → 품질 평가 → (나중) 정제 → 중복/빈괄호가 검증을 우회
      // 수정: AI 원본 → 정제 → 품질 평가 → 정제된 제목으로 반환
      selectedTitle = removeDuplicatePhrases(
        cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars(selectedTitle))))
      ).trim();

      if (titleCandidates) {
        titleCandidates = titleCandidates.map((c: { text: string; score: number; reasoning: string }) => ({
          ...c,
          text: removeDuplicatePhrases(
            cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars(c.text))))
          ).trim(),
        })).filter((c: { text: string }) => c.text);
      }

      if (!selectedTitle) continue;

      // ✅ [v2] 품질 검증 (정제된 제목으로) — 이제 이슈 목록도 반환
      const quality = evaluateTitleQuality(selectedTitle, primaryKeyword || '', mode, categoryHint);
      let qualityScore = quality.score;
      const qualityIssues = [...quality.issues];

      // ✅ [2026-03-06] 홈피드 서브키워드 토픽 매칭 가점/감점
      if (mode === 'homefeed') {
        const subKwArr = Array.isArray((source.metadata as any)?.keywords)
          ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k)))
          : [];
        if (subKwArr.length > 0) {
          const subKwIncluded = subKwArr.filter((k: string) => selectedTitle.includes(String(k))).length;
          if (subKwIncluded >= 1) {
            qualityScore = Math.min(100, qualityScore + 10);
            console.log(`[TitleQuality] +10점: 홈피드 서브키워드 포함 (토픽 매칭 강화, ${subKwIncluded}개)`);
          } else {
            qualityScore = Math.max(0, qualityScore - 15);
            qualityIssues.push('홈피드: 서브키워드 미포함 (토픽 매칭 실패 위험)');
            console.log(`[TitleQuality] -15점: 홈피드 서브키워드 미포함 (토픽 매칭 실패 위험)`);
          }
        }
      }

      console.log(`[TitleGen] 시도 ${attempt + 1}: "${selectedTitle}" → ${qualityScore}점 (공식: ${formula.name})`);
      if (qualityIssues.length > 0) {
        console.log(`[TitleGen]   감점: ${qualityIssues.join(', ')}`);
      }

      // ✅ [v2] 합격 기준 75점
      if (qualityScore >= 75) {
        console.log(`[TitleGen] ✅ 품질 검증 통과 (${qualityScore}점, 공식: ${formula.name})`);
        // ✅ [v1.4.48 Stage A.2] 정적 import 사용
        recordSelectedTitle(selectedTitle);
        return {
          selectedTitle,
          titleCandidates,
          titleAlternatives: titleCandidates?.map((c: any) => c.text).filter(Boolean) || undefined
        };
      }

      // ✅ titleCandidates 중 더 높은 점수의 제목이 있으면 그걸 선택
      if (titleCandidates && titleCandidates.length > 0) {
        for (const candidate of titleCandidates) {
          const candQuality = evaluateTitleQuality(candidate.text, primaryKeyword || '', mode, categoryHint);
          if (candQuality.score > qualityScore && candQuality.score >= 75) {
            console.log(`[TitleGen] ✅ 후보 제목이 더 우수: "${candidate.text}" (${candQuality.score}점 > ${qualityScore}점)`);
            // ✅ [v1.4.48 Stage A.2] 정적 import 사용
            recordSelectedTitle(candidate.text);
            return {
              selectedTitle: candidate.text,
              titleCandidates,
              titleAlternatives: titleCandidates.map((c: { text: string }) => c.text).filter(Boolean)
            };
          }
          if (candQuality.score > bestScore) {
            bestScore = candQuality.score;
            bestResult = {
              selectedTitle: candidate.text,
              titleCandidates,
              titleAlternatives: titleCandidates.map((c: { text: string }) => c.text).filter(Boolean)
            };
          }
        }
      }

      // 최고 점수 갱신
      if (qualityScore > bestScore) {
        bestScore = qualityScore;
        bestResult = {
          selectedTitle,
          titleCandidates,
          titleAlternatives: titleCandidates?.map((c: any) => c.text).filter(Boolean) || undefined
        };
      }

      if (attempt < MAX_RETRIES) {
        // ✅ [v2] 다음 시도를 위해 현재 실패 정보 저장
        prevTitle = selectedTitle;
        prevScore = qualityScore;
        prevIssues = qualityIssues;
        console.log(`[TitleGen] ⚠️ 품질 미달 (${qualityScore}점 < 75점), 재생성 시도 ${attempt + 2}/${MAX_RETRIES + 1} — 다음 공식으로 교체`);
      }
    } catch (e) {
      console.error(`[TitleGen] 시도 ${attempt + 1} 실패:`, e);
    }
  }

  // 최선의 결과 반환
  console.log(`[TitleGen] 최종 결과: "${bestResult.selectedTitle}" (${bestScore}점)`);
  // ✅ [v1.4.48 Stage A.2] 정적 import 사용 — 모듈 인스턴스 단일 보장
  if (bestResult.selectedTitle) {
    recordSelectedTitle(bestResult.selectedTitle);
  }
  return bestResult;
}

/**
 * ✅ [2026-01-30] 제목 품질 평가 (감점 방식)
 * 100점에서 시작해서 문제 발견 시 감점
 */
// ✅ [v3] 카테고리별 추가 보너스 테이블
const CATEGORY_BONUSES: Record<string, { pattern: RegExp; points: number; reason: string }[]> = {
  '건강': [
    // ✅ [v1.4.46] 기간 가점 축소 (+5→+2), kg/cm만 유지 → 기간 반복 방지
    { pattern: /\d+(kg|cm)/, points: 5, reason: '건강: 신체 수치' },
    { pattern: /\d+(개월|주|일)/, points: 2, reason: '건강: 기간(약한 가점)' },
    { pattern: /(효과|증상|원인|치료|예방)/, points: 3, reason: '건강: 의료 키워드' },
    { pattern: /(실제|직접|경험)/, points: 3, reason: '건강: 체험 신뢰' },
  ],
  '재테크': [
    { pattern: /\d+(만원|억|%|원)/, points: 5, reason: '재테크: 금액/수익률' },
    { pattern: /(수익|절약|환급|세금|이자)/, points: 3, reason: '재테크: 금융 키워드' },
    { pattern: /(비교|차이|vs)/, points: 3, reason: '재테크: 비교 분석' },
  ],
  '여행': [
    { pattern: /(후기|다녀와|가봤|방문)/, points: 5, reason: '여행: 체험 키워드' },
    { pattern: /\d+(박|일|시간|km)/, points: 3, reason: '여행: 구체적 일정' },
    { pattern: /(숨은|비밀|현지인)/, points: 3, reason: '여행: 발견 요소' },
  ],
  '연예': [
    { pattern: /(반응|댓글|팬|여론)/, points: 5, reason: '연예: 사회적 반응' },
    { pattern: /(확인|공개|최초)/, points: 3, reason: '연예: 독점성' },
  ],
  '스포츠': [
    { pattern: /\d+(골|점|승|패|위)/, points: 5, reason: '스포츠: 경기 수치' },
    { pattern: /(기록|역대|최초|데뷔)/, points: 3, reason: '스포츠: 기록 키워드' },
  ],
  '맛집': [
    { pattern: /(후기|먹어봤|다녀온|방문)/, points: 5, reason: '맛집: 체험 키워드' },
    { pattern: /(웨이팅|줄서|예약)/, points: 3, reason: '맛집: 인기 증거' },
  ],
  '음식': [
    { pattern: /(레시피|만들기|재료|방법)/, points: 5, reason: '음식: 실용 키워드' },
    { pattern: /\d+(분|인분|kcal)/, points: 3, reason: '음식: 구체적 수치' },
  ],
  '육아': [
    { pattern: /(아이|아기|엄마|아빠)/, points: 3, reason: '육아: 타깃 키워드' },
    // ✅ [v1.4.47] 연령 가점은 살/세만 유지 (개월은 기간 반복 원인이므로 제거)
    { pattern: /\d+(살|세)/, points: 5, reason: '육아: 연령 구체성' },
    { pattern: /(솔직|고민|공감)/, points: 3, reason: '육아: 감정 공감' },
  ],
  'IT': [
    { pattern: /(성능|스펙|벤치|출시)/, points: 3, reason: 'IT: 기술 키워드' },
    { pattern: /(vs|비교|차이)/, points: 5, reason: 'IT: 비교 분석' },
    { pattern: /\d+(GB|TB|원|만원)/, points: 3, reason: 'IT: 스펙/가격 수치' },
  ],
  '쇼핑': [
    { pattern: /(후기|써봤|사용|구매)/, points: 5, reason: '쇼핑: 구매 체험' },
    { pattern: /(가성비|할인|최저가)/, points: 3, reason: '쇼핑: 가격 매력' },
  ],
  '패션': [
    { pattern: /(코디|스타일|룩북|착용)/, points: 5, reason: '패션: 스타일 키워드' },
    { pattern: /(트렌드|유행|신상)/, points: 3, reason: '패션: 트렌드 키워드' },
  ],
  // ✅ [v1.4.48 Stage A.5] 누락 카테고리 5개 추가 — 카테고리 평가 공정성 확보
  '사회': [
    { pattern: /(달라진|바뀌|개정|시행)/, points: 5, reason: '사회: 변화 키워드' },
    { pattern: /(정책|법|제도|조건|기준)/, points: 3, reason: '사회: 제도 키워드' },
    { pattern: /(놓치|확인|챙기|혜택)/, points: 3, reason: '사회: 손실회피' },
  ],
  '리빙': [
    { pattern: /(인테리어|꾸미|배치|정리)/, points: 5, reason: '리빙: 공간 키워드' },
    { pattern: /\d+(평|원|만원)/, points: 3, reason: '리빙: 평수/가격' },
    { pattern: /(전후|바꾸|달라진|꾸민)/, points: 3, reason: '리빙: 변화 비교' },
  ],
  '생활': [
    { pattern: /(꿀팁|방법|노하우|쉽게)/, points: 3, reason: '생활: 실용 키워드' },
    { pattern: /\d+(가지|개|단계|분)/, points: 5, reason: '생활: 구체 수치' },
    { pattern: /(주의|놓치|확인|체크)/, points: 3, reason: '생활: 주의사항' },
  ],
  '반려동물': [
    { pattern: /(강아지|고양이|반려|품종)/, points: 3, reason: '반려동물: 타깃 키워드' },
    { pattern: /\d+(살|개월|kg)/, points: 3, reason: '반려동물: 나이/체중' },
    { pattern: /(행동|증상|건강|훈련)/, points: 5, reason: '반려동물: 핵심 토픽' },
  ],
  '라이프': [
    { pattern: /(일상|루틴|습관|하루)/, points: 3, reason: '라이프: 일상 키워드' },
    { pattern: /(공감|솔직|진심|마음)/, points: 3, reason: '라이프: 공감 키워드' },
  ],
};

function evaluateTitleQuality(title: string, keyword: string, mode: PromptMode, categoryHint?: string): { score: number; issues: string[] } {
  let score = 100;
  const issues: string[] = [];
  const t = String(title || '').trim();
  const kw = String(keyword || '').trim().toLowerCase();

  if (!t) return { score: 0, issues: ['빈 제목'] };

  // 0점 패턴 (즉시 탈락)
  const normalizedTitle = t.toLowerCase().replace(/[\s\-–—:|·•.,!?]/g, '');
  const normalizedKeyword = kw.replace(/[\s\-–—:|·•.,!?]/g, '');
  if (normalizedKeyword && normalizedTitle === normalizedKeyword) {
    console.log('[TitleQuality] ❌ 키워드 그대로 사용 → 0점');
    return { score: 0, issues: ['키워드 그대로 사용'] };
  }

  // ✅ [2026-02-09 강화] 중복 단어 감지 — 같은 2자 이상 한글 단어가 2회 이상 등장
  const koreanWords = t.match(/[가-힣]{2,}/g) || [];
  const wordFreq = new Map<string, number>();
  for (const w of koreanWords) {
    wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
  }
  const duplicateWords = Array.from(wordFreq.entries()).filter(([, count]) => count >= 2).map(([word]) => word);
  const hasDuplicateKeywords = duplicateWords.length > 0;

  // ✅ [2026-02-09 강화] 숫자+단위 반복 감지 (0원, 3분 등)
  const numberUnits = t.match(/\d+[가-힣]{1,2}/g) || [];
  const unitFreq = new Map<string, number>();
  for (const u of numberUnits) {
    unitFreq.set(u, (unitFreq.get(u) || 0) + 1);
  }
  const hasDuplicateNumberUnits = Array.from(unitFreq.values()).some(count => count >= 2);

  // ✅ [2026-02-09 강화] 어간(stem) 중복 감지 — "챙기기/챙기면" 같은 활용형 변이
  const koreanWords3Plus = koreanWords.filter(w => w.length >= 3);
  const stems = koreanWords3Plus.map(w => w.substring(0, 2)); // 앞 2글자를 어간으로
  const stemFreq = new Map<string, number>();
  for (const s of stems) {
    stemFreq.set(s, (stemFreq.get(s) || 0) + 1);
  }
  // 같은 어간이 3회 이상 등장하면 형태소 중복 (2회는 자연스러운 경우도 있으므로)
  const hasStemDuplicates = Array.from(stemFreq.entries())
    .some(([stem, count]) => count >= 3 && stem.length >= 2);

  // ✅ [2026-02-09 강화] 두 제목 합치기 패턴 감지
  // "질문? ... 키워드 반복" 또는 "꿀팁 키워드, 트리거" 패턴
  const questionMarkIdx = t.indexOf('?');
  const hasConcatenatedTitles = questionMarkIdx > 5 && questionMarkIdx < t.length - 10 &&
    (hasDuplicateKeywords || hasDuplicateNumberUnits);

  // ✅ [2026-02-09 강화] 쉼표 뒤 핵심 어절 반복 감지
  // "서류 챙기기 전 서류 안 챙기면 손해" — 문장 내부에서 반복
  const commaIdx = t.indexOf(',');
  const hasPostCommaRepetition = commaIdx > 3 && commaIdx < t.length - 5 && hasDuplicateKeywords;

  // 감점 요소들
  const penalties: { condition: boolean; points: number; reason: string }[] = [
    // ✅ [2026-02-09 강화] 뻔한 템플릿 종결어 확장 (꿀팁, 노하우, 비법, 가이드 추가)
    { condition: mode !== 'affiliate' && /(?:총정리|방법|꿀팁|노하우|비법|가이드|핵심정리)$/.test(t), points: 35, reason: '뻔한 템플릿 종결어' },
    { condition: mode === 'affiliate' && /(?:총정리|꿀팁)$/.test(t), points: 20, reason: '쇼핑: 총정리/꿀팁 종결어' },
    // 키워드 유사도 80% 이상
    { condition: Boolean(normalizedKeyword && normalizedTitle.startsWith(normalizedKeyword) && (normalizedTitle.length - normalizedKeyword.length) / normalizedTitle.length < 0.2), points: 40, reason: '키워드와 너무 유사' },
    // ✅ [2026-02-09 강화] 길이 기준 엄격화 (SEO 기준: 25~40자)
    { condition: mode === 'seo' && t.length > 40, points: 30, reason: 'SEO: 40자 초과 (검색 잘림)' },
    // ✅ [2026-03-07] 홈피드 45자 초과 강력 감점 — 42자 골든존 필수
    { condition: mode === 'homefeed' && t.length > 45, points: 60, reason: '홈피드: 45자 초과 (골든존 28~42자 위반)' },
    { condition: t.length > 50, points: 40, reason: '50자 초과 (심각한 잘림)' },
    // 길이 부족
    { condition: t.length < 15, points: 20, reason: '15자 미만 (정보 부족)' },
    // SEO 모드: 키워드 뒤쪽 배치
    { condition: Boolean(mode === 'seo' && kw && t.toLowerCase().indexOf(kw.split(' ')[0]?.toLowerCase() || '') > 10), points: 25, reason: 'SEO: 키워드가 뒤쪽에 배치' },
    // 홈판 모드: AI티 나는 표현
    // ✅ [v1.4.48 Stage A.4] 홈피드 AI티 패턴 대폭 확장 (5개 → 14개)
    //   추가: 반전, 소름, 난리, 대박, 공개, 충격적, 경악적, 진실, 폭로
    //   원인: 기존 5개만으로는 AI 생성 제목의 90%를 못 잡음
    { condition: mode === 'homefeed' && /(충격|경악|눈물바다|진짜 이유|알고보니|반전|소름|난리|대박 공개|충격적|경악적|폭로|진실 공개|이게 가능|실화)/.test(t), points: 40, reason: '홈판: 뻔한 AI티 표현' },
    // 숫자/구체성 없음 (SEO)
    { condition: mode === 'seo' && !/\d/.test(t) && !/(언제|어떻게|얼마|몇|할까|일까)/.test(t), points: 15, reason: 'SEO: 숫자/구체성 없음' },
    // 대괄호 브랜드 표기
    { condition: /^\[.+\]/.test(t), points: 30, reason: '대괄호 브랜드 표기' },
    // 플레이스홀더 누출
    { condition: /\{.+\}|\[인물\]|\[상품명\]|XXX|OOO/.test(t), points: 50, reason: '플레이스홀더 누출' },
    // ✅ [2026-02-09 FIX] 빈 괄호/대괄호 — AI가 템플릿 패턴 잘못 학습
    { condition: /\[\s*\]|\(\s*\)|【\s*】/.test(t), points: 40, reason: '빈 괄호/대괄호 (템플릿 잔여)' },
    // ✅ [2026-02-09 강화] 중복 키워드 — 같은 단어가 2번 이상 반복
    // ✅ [2026-03-07] 홈피드에서 중복이면 더 강하게 감점 (키워드 나열 = 0점 패턴)
    { condition: hasDuplicateKeywords && mode === 'homefeed', points: 60, reason: `홈피드 키워드 나열: ${duplicateWords.join(', ')}` },
    { condition: hasDuplicateKeywords && mode !== 'homefeed', points: 40, reason: `중복 키워드: ${duplicateWords.join(', ')}` },
    // ✅ [2026-02-09 강화] 숫자+단위 반복 — "0원" 같은 패턴이 2번 이상
    { condition: hasDuplicateNumberUnits, points: 30, reason: '숫자+단위 반복 (0원, 3분 등)' },
    // ✅ [2026-02-09 강화] 두 제목 합치기 패턴 — "질문?...키워드반복" 형태
    { condition: hasConcatenatedTitles, points: 50, reason: '두 제목 합치기 패턴 (물음표 뒤 키워드 반복)' },
    // ✅ [2026-02-09 강화] 제목 안에 "꿀팁"이 포함된 경우 (종결어가 아니어도)
    { condition: mode === 'seo' && /꿀팁/.test(t), points: 20, reason: 'SEO: 꿀팁은 뻔한 표현' },
    // ✅ [2026-02-09 강화] 어간 변형 중복 — "챙기기/챙기면" 같은 3회+ 등장
    { condition: hasStemDuplicates, points: 30, reason: '어간 변형 중복 (같은 어간 3회+)' },
    // ✅ [2026-02-09 강화] 쉼표 뒤 키워드 반복 — "서류... 서류" 패턴
    { condition: hasPostCommaRepetition, points: 30, reason: '쉼표 전후 키워드 반복' },
    // ✅ [2026-02-01] affiliate 모드 전용 감점
    // 쇼핑커넥트: 상품 비교 금지 (상품 1개뿐)
    { condition: mode === 'affiliate' && /(vs\s|vs\.|비교분석)/.test(t.toLowerCase()), points: 40, reason: '쇼핑: 비교 표현 (상품 1개뿐)' },
    // 쇼핑커넥트: 에러 페이지 키워드
    { condition: mode === 'affiliate' && /(에러|오류|캡차|접속|차단)/.test(t), points: 50, reason: '쇼핑: 에러 페이지 키워드' },
    // ✅ [2026-02-10 FIX] 콜론+따옴표 패턴 — AI가 구조를 리터럴로 해석한 부자연스러운 제목
    { condition: /[:：]\s*["'\u201C\u201D\u2018\u2019\u300C\u300D]/.test(t), points: 50, reason: '콜론+따옴표 패턴' },
    // ✅ [2026-02-10 FIX] 제목에 따옴표 포함 — 블로그 제목에 부적절
    { condition: /["\u201C\u201D\u300C\u300D\u300E\u300F]/.test(t), points: 20, reason: '제목에 따옴표 포함' },
  ];

  // ✅ [v1.4.48 Stage A.2] 정적 import 사용 — require 제거
  const recentPeriods: string[] = getRecentPeriods() || [];
  const hasPeriodInTitle = /\d+\s*[년월주일]\s*(?:차|째|만에|이용|사용|동안|후|전)?/.test(t);

  if (hasPeriodInTitle && recentPeriods.length >= 2) {
    penalties.push({
      condition: true,
      points: 40,
      reason: `최근 ${recentPeriods.length}개 기간 반복: ${recentPeriods.slice(-3).join(', ')}`
    });
  } else if (hasPeriodInTitle && recentPeriods.length >= 1) {
    penalties.push({
      condition: true,
      points: 20,
      reason: `직전 글 기간 사용: ${recentPeriods[recentPeriods.length - 1]}`
    });
  }

  for (const p of penalties) {
    if (p.condition) {
      score -= p.points;
      issues.push(p.reason);
      console.log(`[TitleQuality] -${p.points}점: ${p.reason}`);
    }
  }

  // ✅ [2026-02-09 v3] 보너스 가점 (매력도 향상)
  // ✅ [v1.4.48 Stage A.3] 홈피드에서 "솔직히/사실/실제로/진짜" 가점 제거
  //   원인: 이 가점이 hf_confession/hf_hidden_truth와 결합 → 모든 글 제목에 "솔직히" 등장 → 반복 패턴
  //   해결: 홈피드에서는 미적용, SEO/affiliate 모드에서만 약하게 가점
  // ✅ [v1.4.48 Stage A.3] 홈피드에서 "변화/비포애프터" 가점 제거
  //   원인: hf_before_after 공식과 결합 → 이중 가점으로 해당 공식 과선택
  const bonuses: { condition: boolean; points: number; reason: string }[] = [
    { condition: /\d/.test(t), points: 5, reason: '숫자 포함 (구체성)' },
    { condition: /(\?|일까|할까|인가요)/.test(t), points: 5, reason: '질문형 종결 (호기심)' },
    // 홈피드 외 모드에서만 솔직 표현 가점
    { condition: mode !== 'homefeed' && /(솔직히|사실|실제로|진짜)/.test(t), points: 3, reason: '솔직한 표현 (신뢰)' },
    { condition: /(몰랐던|숨겨진|비밀|반전)/.test(t), points: 5, reason: '발견 요소 (클릭 유도)' },
    { condition: mode === 'seo' && t.length >= 20 && t.length <= 35, points: 5, reason: 'SEO 이상적 길이 (20~35자)' },
    // ✅ [v3] 홈피드 전용 보너스
    { condition: mode === 'homefeed' && t.length >= 28 && t.length <= 42, points: 5, reason: '홈피드 이상적 길이 (28~42자)' },
    { condition: /(절대|반드시|꼭|무조건)/.test(t) && /(마세요|하세요|해야|안 됩니다)/.test(t), points: 5, reason: '행동 유도 (강한 지시)' },
    // 홈피드 외 모드에서만 변화/비포애프터 가점
    { condition: mode !== 'homefeed' && /(전|후|변화|달라)/.test(t), points: 3, reason: '변화/비포애프터 요소' },
  ];
  for (const b of bonuses) {
    if (b.condition) {
      score += b.points;
      console.log(`[TitleQuality] +${b.points}점: ${b.reason}`);
    }
  }

  // ✅ [v3] 카테고리별 추가 보너스 적용
  if (categoryHint && CATEGORY_BONUSES[categoryHint]) {
    for (const cb of CATEGORY_BONUSES[categoryHint]) {
      if (cb.pattern.test(t)) {
        score += cb.points;
        console.log(`[TitleQuality] +${cb.points}점: ${cb.reason}`);
      }
    }
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

async function generateHomefeedIntroOnlyPatch(source: ContentSource, current: StructuredContent, provider?: string): Promise<{ introduction?: string } | null> {
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
- 첫 문장 15~25자 이내
- 배경 설명/요약/정리 금지
- 문체: 사용자 설정 글톤 어미 적용 (기본: 자연스러운 구어체)
- ⚠️ 서브키워드 1개 이상 도입부에 자연스럽게 포함

제목: ${selectedTitle || '(없음)'}
${(() => {
      const kwArr = Array.isArray((source?.metadata as any)?.keywords)
        ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 3)
        : [];
      return kwArr.length > 0 ? `서브키워드: ${kwArr.join(', ')}\n→ 위 서브키워드 중 1개 이상 도입부에 포함하세요.` : '';
    })()}

현재 도입부(문제 있음):
${String(current?.introduction || '').trim()}

JSON:
`.trim();

  try {
    // ✅ [2026-02-23 FIX] 사용자 선택 provider로 도입부 재작성
    let raw: string;
    if (provider === 'perplexity') {
      raw = await callPerplexity(prompt, 0.9, 450);
    } else if (provider === 'openai') {
      raw = await callOpenAI(prompt, 0.9, 450);
    } else if (provider === 'claude') {
      raw = await callClaude(prompt, 0.9, 450);
    } else {
      raw = await callGemini(prompt, 0.9, 450, { useGrounding: false }); // ✅ [v1.4.3] 도입부 패치는 Grounding OFF (비용 절감)
    }
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

    const seoIssues = computeSeoTitleCriticalIssues(realText, primaryKeyword);
    const homeIssues = computeHomefeedTitleCriticalIssues(realText, primaryKeyword);

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

  // ✅ [2026-03-14] 연속 줄바꿈 정리 (AI가 생성한 \n\n\n → \n\n, 본문 내 이중 빈 줄 방지)
  finalContent = normalizeContentLineBreaks(finalContent);

  // ✅ [2026-03-16] AI가 \n\n 문단 구분을 안 넣은 경우 자동 삽입 (타이핑 자연스러움 보장)
  finalContent = ensureContentParagraphBreaks(finalContent);

  // ✅ 소제목 길이 제한 (60자 이내로 완화 - 너무 짧으면 정보 전달력 하락)
  finalContent = truncateHeadingTitles(finalContent, 60);

  // ✅ [2026-02-24] 키워드를 제목으로 그대로 사용하는 모드
  // 사용자가 명시적으로 선택한 경우, 모든 제목 조작/평가를 건너뛰고 키워드 원문 그대로 사용
  if (source.useKeywordAsTitle && source.keywordForTitle) {
    const kwTitle = source.keywordForTitle.trim();
    console.log(`[finalizeStructuredContent] 📌 키워드를 제목으로 그대로 사용: "${kwTitle}"`);
    finalContent.selectedTitle = kwTitle;
    // 대안 제목도 키워드로 통일 (제목 선택 UI에서 혼선 방지)
    if (Array.isArray(finalContent.titleAlternatives)) {
      finalContent.titleAlternatives = [kwTitle];
    }
    if (Array.isArray(finalContent.titleCandidates)) {
      finalContent.titleCandidates = [{ text: kwTitle, score: 100, reasoning: '사용자 지정 키워드 제목' }];
    }

    // 본문 클리닝은 유지 (제목만 건너뜀)
    try {
      if (finalContent.bodyPlain) {
        finalContent.bodyPlain = removeOrdinalHeadingLabelsFromBody(finalContent.bodyPlain);
      }
      if (finalContent.bodyHtml) {
        finalContent.bodyHtml = removeOrdinalHeadingLabelsFromBody(finalContent.bodyHtml);
      }
      if (Array.isArray(finalContent.headings)) {
        finalContent.headings = finalContent.headings.map((h: any) => ({
          ...h,
          body: h.body ? removeOrdinalHeadingLabelsFromBody(String(h.body)) : h.body
        }));
      }
    } catch { /* ignore */ }

    applyHomefeedNarrativeHookBlock(finalContent, source);
    try { applyOrdinalHeadingMarkerFix(finalContent); } catch { /* ignore */ }

    return finalContent;
  }

  try {
    if (finalContent.selectedTitle) {
      finalContent.selectedTitle = cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars(finalContent.selectedTitle))));
    }
    if (Array.isArray(finalContent.titleAlternatives)) {
      finalContent.titleAlternatives = finalContent.titleAlternatives
        .map((t) => cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars(t)))))
        .filter(Boolean);
    }
    if (Array.isArray(finalContent.titleCandidates)) {
      finalContent.titleCandidates = finalContent.titleCandidates.map((c: any) => ({
        ...c,
        text: cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars(c?.text)))),
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
  } catch (e) {
    console.warn('[contentGenerator] catch ignored:', e);
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
    } catch (e) {
      console.warn('[contentGenerator] catch ignored:', e);
    }
    applyKeywordPrefixToStructuredContent(finalContent, primaryKeyword);
  }
  applyHomefeedNarrativeHookBlock(finalContent, source);
  applySeoQualityHookBlock(finalContent, source);  // ✅ [2026-03-06] SEO 런타임 품질 게이트
  try {
    applyOrdinalHeadingMarkerFix(finalContent);
  } catch (e) {
    console.warn('[contentGenerator] catch ignored:', e);
  }

  // ✅ [2026-01-19 수정] affiliate 모드 수익 배분 고지는 최상단에 삽입됨
  // 마무리글에 중복 삽입하지 않음 (사용자 요청)
  // if (source.contentMode === 'affiliate') { ... } 제거됨

  // ✅ [2026-02-24] 최종 품질 게이트: 키워드 접두사 + 클램핑 후 제목 재검증
  // 이전 아키텍처에서는 접두사 적용 전에만 검증 → 최종 제목 무검증 통과
  if (finalContent.selectedTitle) {
    try {
      const finalMode = source.contentMode === 'affiliate' ? 'affiliate' : source.contentMode === 'homefeed' ? 'homefeed' : 'seo';
      const finalCategoryHint = (source as any).categoryHint as string | undefined;
      const finalPK = primaryKeyword || (source.metadata as any)?.keywords?.[0] || '';
      const finalCheck = evaluateTitleQuality(finalContent.selectedTitle, String(finalPK), finalMode, finalCategoryHint);
      if (finalCheck.score < 50) {
        console.warn(`[FinalQualityGate] ⚠️ 최종 제목 품질 미달 (${finalCheck.score}점): "${finalContent.selectedTitle}"`);
        console.warn(`[FinalQualityGate]   issues: ${finalCheck.issues.join(', ')}`);
        // 접두사로 인한 훼손 → cleanup만 재적용하여 복구 시도
        finalContent.selectedTitle = removeDuplicatePhrases(
          cleanupColonQuotePattern(cleanupTrailingTitleTokens(
            cleanupStartingTitleTokens(sanitizeTitleSpecialChars(finalContent.selectedTitle))
          ))
        ).trim();
        const rescueCheck = evaluateTitleQuality(finalContent.selectedTitle, String(finalPK), finalMode, finalCategoryHint);
        console.log(`[FinalQualityGate] 복구 후: "${finalContent.selectedTitle}" (${rescueCheck.score}점)`);
      }
    } catch (e) {
      console.error('[FinalQualityGate] 검증 실패:', e);
    }
  }

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

  // ✅ [2026-03-14] 본문에서 이모지 제거 (기존 누락 — 본문 이모지 잔존의 근본 원인)
  if (content.bodyPlain) {
    content.bodyPlain = removeEmojis(content.bodyPlain);
  }
  if (content.bodyHtml) {
    // HTML 본문에서도 이모지 제거 (태그 밖의 텍스트에서)
    content.bodyHtml = removeEmojis(content.bodyHtml);
  }
  if ((content as any).introduction) {
    (content as any).introduction = removeEmojis((content as any).introduction);
  }
  if ((content as any).conclusion) {
    (content as any).conclusion = removeEmojis((content as any).conclusion);
  }

  // 소제목에서 이모지 제거
  if (content.headings) {
    content.headings = content.headings.map(h => ({
      ...h,
      title: removeEmojis(h.title),
      content: h.content ? removeEmojis(h.content) : h.content
    }));
  }

  // 해시태그에서 이모지 제거
  if (content.hashtags) {
    content.hashtags = content.hashtags.map(tag => removeEmojis(tag));
  }

  console.log('[ContentGenerator] ✅ 이모지 자동 제거 완료 (본문 포함)');
  return content;
}

// ✅ [2026-03-14] 본문 연속 줄바꿈 정리 — 부자연스러운 이중/삼중 빈 줄 제거
function normalizeLineBreaks(text: string): string {
  if (!text) return text;
  // 1. 3개 이상 연속 줄바꿈 → 2개로 (문단 구분 유지)
  let result = text.replace(/\n{3,}/g, '\n\n');
  // 2. \r\n\r\n\r\n 패턴도 정리
  result = result.replace(/(\r?\n){3,}/g, '\n\n');
  // 3. 문단 시작/끝의 불필요한 공백 정리
  result = result.replace(/\n[ \t]+\n/g, '\n\n');
  // 4. 시작/끝 빈 줄 제거
  result = result.trim();
  return result;
}

function normalizeContentLineBreaks(content: StructuredContent): StructuredContent {
  if (!content) return content;

  if (content.bodyPlain) {
    content.bodyPlain = normalizeLineBreaks(content.bodyPlain);
  }
  if (content.bodyHtml) {
    content.bodyHtml = normalizeLineBreaks(content.bodyHtml);
  }
  if ((content as any).introduction) {
    (content as any).introduction = normalizeLineBreaks((content as any).introduction);
  }
  if ((content as any).conclusion) {
    (content as any).conclusion = normalizeLineBreaks((content as any).conclusion);
  }
  if (content.headings) {
    content.headings = content.headings.map(h => ({
      ...h,
      content: h.content ? normalizeLineBreaks(h.content) : h.content
    }));
  }

  console.log('[ContentGenerator] ✅ 연속 줄바꿈 정리 완료');
  return content;
}

// ✅ [2026-03-16] AI가 \n\n 문단 구분을 빠뜨린 경우 자동 삽입
// 300자 이상인데 \n\n이 없으면, 문장 종결(.!?) 뒤를 기준으로 2~4문장마다 문단 분리
function ensureParagraphBreaks(text: string): string {
  if (!text || text.length < 300) return text;

  // 이미 \n\n이 있으면 각 문단만 개별 검사
  if (text.includes('\n\n')) {
    const paragraphs = text.split('\n\n');
    const fixed = paragraphs.map(p => ensureParagraphBreaks(p.trim()));
    return fixed.join('\n\n');
  }

  // \n\n 없이 300자 이상 → 문장 기준으로 문단 분리
  // 숫자+점 패턴(1. 2. 등) 보호를 위해 임시 치환
  const safe = text.replace(/(\d+)\.\s/g, '$1__NUMDOT__ ');

  // 문장 종결 기준으로 분리 (.!? 뒤 공백)
  const sentences = safe
    .split(/(?<=[.!?。！？])\s+/)
    .map(s => s.replace(/__NUMDOT__/g, '.').trim())
    .filter(s => s.length > 0);

  if (sentences.length <= 2) {
    // 문장이 2개 이하면 그대로 반환 (분리할 필요 없음)
    return text;
  }

  // 2~4문장마다 \n\n 삽입 (랜덤화하여 자연스럽게)
  const result: string[] = [];
  let current: string[] = [];
  const breakAfter = () => Math.floor(Math.random() * 3) + 2; // 2~4문장
  let nextBreak = breakAfter();

  for (let i = 0; i < sentences.length; i++) {
    current.push(sentences[i]);

    if (current.length >= nextBreak && i < sentences.length - 1) {
      result.push(current.join(' '));
      current = [];
      nextBreak = breakAfter();
    }
  }
  if (current.length > 0) {
    result.push(current.join(' '));
  }

  const fixed = result.join('\n\n');
  if (fixed !== text) {
    console.log(`[ensureParagraphBreaks] ✅ 문단 구분 자동 삽입: ${sentences.length}문장 → ${result.length}문단`);
  }
  return fixed;
}

function ensureContentParagraphBreaks(content: StructuredContent): StructuredContent {
  if (!content) return content;

  if (content.bodyPlain) {
    content.bodyPlain = ensureParagraphBreaks(content.bodyPlain);
  }
  if ((content as any).introduction) {
    (content as any).introduction = ensureParagraphBreaks((content as any).introduction);
  }
  if ((content as any).conclusion) {
    (content as any).conclusion = ensureParagraphBreaks((content as any).conclusion);
  }
  if (content.headings) {
    content.headings = content.headings.map(h => ({
      ...h,
      content: h.content ? ensureParagraphBreaks(h.content) : h.content
    }));
  }

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

// ✅ [2026-02-11] templateCache 제거 — 인라인 템플릿 전용 캐시였음

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
    name: '쇼핑 사용후기',
    categoryHint: '쇼핑',
    articleType: 'shopping_review',
    targetAge: 'all',
    minChars: 2500,
    provider: 'gemini',
    description: '제품 사용후기 및 쇼핑 후기 (모든 연령대)',
  },
  shopping_expert_review: {
    name: '전문 리뷰',
    categoryHint: '쇼핑',
    articleType: 'shopping_expert_review',
    targetAge: 'all',
    minChars: 2800,
    provider: 'gemini',
    description: '전문가 관점의 제품 분석 리뷰 (모든 연령대)',
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
  | 'shopping_expert_review'
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
  toneStyle?: 'friendly' | 'professional' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe' | 'storyteller' | 'expert_review' | 'calm_info'; // ✅ 글 톤/스타일 (10개 전체)
  contentMode?: 'seo' | 'homefeed' | 'traffic-hunter' | 'affiliate' | 'custom' | 'business'; // ✅ [v1.4.20] business 추가
  isFullAuto?: boolean; // ✅ 완전자동 발행 모드 (자동화 보조 프롬프트 적용)
  isReviewType?: boolean; // ✅ 리뷰형 글 (구매전환 유도)
  customPrompt?: string; // ✅ 사용자 정의 프롬프트 (추가 지시사항)
  // ✅ [v1.4.20] 업체 홍보 모드 전용 - 업체 정보 (가짜 번호 생성 방지)
  businessInfo?: {
    name?: string;       // 업체명
    phone?: string;      // 전화번호
    kakao?: string;      // 카카오톡 ID/링크
    address?: string;    // 주소 (사무소/매장 위치)
    hours?: string;      // 영업시간
    region?: string;     // 서비스 지역 (지역구 시): "부산, 울산, 경남" / 전국구 시: 빈 값
    serviceArea?: 'nationwide' | 'regional';  // ✅ [v1.4.22] 서비스 범위
    extra?: string;      // 추가 정보 (자격증/경력/특징 등)
  };
  images?: string[]; // ✅ 크롤링된 이미지 URL 목록 (Shopping Connect)
  collectedImages?: string[]; // ✅ [2026-02-01 FIX] 수집된 이미지 (중복 크롤링 방지용)
  // ✅ [2026-01-30] 쇼핑커넥트 풀스펙 크롤링 정보
  productSpec?: string;       // 제품 스펙 (크기, 무게, 소재 등)
  productPrice?: string;      // 제품 가격
  productReviews?: string[];  // 리뷰 텍스트 배열 (최대 5개)
  productReviewImages?: string[]; // 포토리뷰 이미지 URL
  previousTitles?: string[]; // ✅ [2026-02-09 v2] 이전 생성 제목 (연속발행 중복 방지)
  useKeywordAsTitle?: boolean; // ✅ [2026-02-24] 키워드를 제목으로 그대로 사용 (제목 생성/평가 건너뛰기)
  keywordForTitle?: string; // ✅ [2026-02-24] useKeywordAsTitle=true 일 때 사용할 키워드 원문
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
  signal?: AbortSignal; // ✅ [2026-04-03] 중지 시 즉시 AI API 호출 abort
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

  // 1. 소제목 수 체크 (3~8개 — 구조 변동 엔진 대응)
  const headingCount = content.headings?.length || 0;
  if (headingCount < 3) {
    score -= 20;
    feedback.push(`❌ 소제목 ${headingCount}개 (최소 3개 필요)`);
  } else if (headingCount > 8) {
    score -= 10;
    feedback.push(`⚠️ 소제목 ${headingCount}개 (8개 이하 권장)`);
  } else {
    feedback.push(`✅ 소제목 ${headingCount}개 (구조 변동 엔진 허용 범위)`);
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

// ✅ [2026-02-11] getCurrentSeason() 제거 — 인라인 템플릿 전용이었음

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
function getAutoToneByCategory(category: string | undefined): 'friendly' | 'professional' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe' | 'storyteller' | 'expert_review' | 'calm_info' {
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

  // 자동차 → 전문 리뷰 (스펙 비교, 체계적 평가)
  if (/자동차|차|카|SUV|세단|전기차|튜닝/.test(cat)) {
    return 'expert_review';
  }

  // 취미 → 캐주얼 (다양한 취미 활동)
  if (/취미|DIY|핸드메이드|공예/.test(cat)) {
    return 'casual';
  }

  // 국내여행 → 이야기꾼 (여행 서사, 경험 풀어가기)
  if (/국내|여행|제주|부산|강원|경주|속초/.test(cat)) {
    return 'storyteller';
  }

  // 세계여행 → 이야기꾼 (해외 여행기, 감각적 묘사)
  if (/세계|해외|유럽|미국|일본|동남아|여행/.test(cat)) {
    return 'storyteller';
  }

  // 맛집 → 캐주얼 (맛집 탐방)
  if (/맛집|카페|음식점|레스토랑|디저트|브런치/.test(cat)) {
    return 'casual';
  }

  // ═══════════════════════════════════════════════════════════════
  // 📊 지식·동향 → 전문적 (정보, 분석)
  // ═══════════════════════════════════════════════════════════════

  // IT·컴퓨터 → 전문 리뷰 (체계적 스펙 평가, 비교 분석)
  if (/IT|컴퓨터|노트북|스마트폰|테크|기술|프로그래밍|개발|코딩/.test(cat)) {
    return 'expert_review';
  }

  // 사회·정치 → 전문적 (시사, 뉴스 분석)
  if (/사회|정치|시사|뉴스|이슈|정책/.test(cat)) {
    return 'professional';
  }

  // 건강·의학 → 차분한 정보 안내 (정확하고 편안한 정보 전달)
  if (/건강|의학|의료|병원|다이어트|영양|약|치료|증상/.test(cat)) {
    return 'calm_info';
  }

  // 비즈니스·경제 → 전문적 (투자, 재테크)
  if (/비즈니스|경제|금융|재테크|투자|주식|부동산|창업|마케팅/.test(cat)) {
    return 'professional';
  }

  // 어학·외국어 → 친근한 (학습 팁 공유)
  if (/어학|외국어|영어|일본어|중국어|토익|토플|회화/.test(cat)) {
    return 'friendly';
  }

  // 교육·학문 → 차분한 정보 안내 (차근차근 안내하는 톤)
  if (/교육|학문|학습|공부|시험|자격증|대학|수능/.test(cat)) {
    return 'calm_info';
  }

  // 기본값 → 친근한
  return 'friendly';
}

// ✅ 2축 분리 구조 프롬프트 생성 함수 (노출 목적 × 카테고리)
// ✅ [v1.4.23] export for testing (vitest)
export function buildModeBasedPrompt(
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
  // ⚠️ 홈판 모드: 자동 톤에서 professional/formal이 선택된 경우만 friendly 폴백
  // → 사용자가 명시적으로 선택한 톤은 STYLE OVERRIDE 원칙에 따라 항상 존중!
  if (mode === 'homefeed' && !userSelectedTone && (toneStyle === 'professional' || toneStyle === 'formal' || toneStyle === 'expert_review' || toneStyle === 'calm_info')) {
    console.log(`[PromptBuilder] ⚠️ 홈판 자동 톤 ${toneStyle} → friendly 폴백 (사용자 미선택)`);
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

  // ✅ [2026-03-16 v2] custom 모드: 사용자 프롬프트 최우선 + 품질 가드레일 동시 적용
  let systemPromptResult: string;
  if (contentMode === 'custom' && source.customPrompt && source.customPrompt.trim()) {
    // 사용자정의 모드: 사용자 프롬프트를 최우선 지시사항으로, SEO/홈판급 품질 규칙을 가드레일로 적용
    const customTone = toneStyle || 'friendly';
    systemPromptResult = `당신은 네이버 블로그 일방문자 10,000명 이상의 전문 블로거입니다.
아래 [사용자 요청 프롬프트]의 지시사항이 이 글의 **최우선 방향**입니다.
그 외의 규칙은 품질 가드레일이며, 사용자 요청과 충돌 시 사용자 요청이 우선합니다.

═══════════════════════════════════════════════════════════
🎯 [최우선] 사용자 요청 프롬프트
═══════════════════════════════════════════════════════════

${source.customPrompt.trim()}

═══════════════════════════════════════════════════════════
🛡️ [품질 가드레일] 핵심 규칙 (사용자 요청과 충돌하지 않는 한 준수)
═══════════════════════════════════════════════════════════

【글톤: ${customTone}】
- ${TONE_PERSONAS[customTone]?.label || '사용자 설정 글톤'}: ${TONE_PERSONAS[customTone]?.persona || '자연스러운 문체로 작성'}

【이모지 절대 금지】
- 본문, 소제목 어디에서도 이모지/이모티콘 사용 금지
- 감정은 문장으로 표현 (예: "진짜 좋았어요", "깜짝 놀랐어요")

【모바일 가독성 (필수)】
- 한 문단은 최대 3~4줄 이내 (모바일 기준 2줄)
- 문단 사이에 반드시 빈 줄(엔터) 삽입
- "~해서, ~했는데, ~하니까" 같은 긴 연결문 금지 → 마침표로 끊기
- AI가 쓴 것처럼 보이지 않는 자연스러운 문장체

【키워드 배치】
- 메인 키워드를 글 전체에 자연스럽게 8~12회 분산 삽입
- 첫 문단에 1회, 마지막 문단에 1회 필수 포함
- 키워드가 억지스럽게 반복되지 않도록 유의어/동의어 활용

【글 구조 (소제목 3~8개)】
- 도입부(2~3줄) → 소제목 3~8개(각 4~6문장) → 마무리(2~3줄)
- 소제목은 독자의 궁금증을 유발하는 구체적 표현 사용
- "포인트 1", "포인트 2" 같은 번호형 소제목 금지
- "삶의 질이 달라졌어요", "이것 하나로 끝" 같은 뻔한 표현 금지

═══════════════════════════════════════════════════════════
📋 [필수] JSON 출력 형식 — 반드시 이 스키마로 응답하세요
═══════════════════════════════════════════════════════════

⚠️ 출력은 반드시 아래 JSON 형식이어야 합니다. 설명이나 마크다운 없이 순수 JSON만 반환하세요.

{
  "selectedTitle": "최종 선택된 제목 (25~45자)",
  "titleCandidates": [
    {"text": "제목 후보 1", "score": 95},
    {"text": "제목 후보 2", "score": 90},
    {"text": "제목 후보 3", "score": 85}
  ],
  "introduction": "도입부 텍스트 (2~3줄, 자연스러운 시작)",
  "headings": [
    {"title": "소제목 1", "content": "본문 내용 (4~6문장, 상세 서술)", "summary": "한 줄 요약", "imagePrompt": "이 소제목에 맞는 구체적 이미지 묘사 (한국어)"},
    {"title": "소제목 2", "content": "본문 내용...", "summary": "요약", "imagePrompt": "이미지 묘사"},
    {"title": "소제목 3", "content": "본문 내용...", "summary": "요약", "imagePrompt": "이미지 묘사"}
  ],
  "conclusion": "마무리 텍스트 (2~3줄, 여운형)",
  "hashtags": ["해시태그1", "해시태그2", "해시태그3"],
  "category": "카테고리"
}

═══════════════════════════════════════════════════════════
🎨 [이미지 프롬프트 작성 규칙]
═══════════════════════════════════════════════════════════
- 각 소제목의 imagePrompt는 해당 소제목+본문의 문맥에 정확히 맞는 구체적 장면 묘사
- "아름다운 풍경", "행복한 모습" 같은 추상적 표현 금지
- 한국어로 구체적인 상황/장면을 묘사 (예: "포근한 아기 침대에서 편안하게 잠든 신생아, 부드러운 조명")
- 각 소제목별로 서로 다른 고유한 이미지 프롬프트 생성

═══════════════════════════════════════════════════════════
🚨 최종 자가검수 체크리스트
═══════════════════════════════════════════════════════════
□ 사용자 요청 프롬프트를 충실히 반영했는가? (가장 중요!)
□ 이모지/이모티콘이 없는가?
□ AI가 쓴 것처럼 보이지 않는가?
□ 거짓/지어낸 수치가 없는가?
□ 모바일에서 읽기 편한 문단 구조인가?
□ 순수 JSON만 출력했는가?`;
    console.log(`[PromptBuilder] ✅ 사용자정의 모드 v2: 커스텀 프롬프트 + 품질 가드레일 적용 (${source.customPrompt.length}자)`);
  } else if (contentMode === 'affiliate') {
    // 🛒 [쇼핑커넥트 2026] .prompt 파일 모듈화 + articleType 분기
    // shopping_review → affiliate/shopping_review.prompt (사용후기)
    // shopping_expert_review → affiliate/shopping_expert_review.prompt (전문 리뷰)
    const productInfoForPrompt = {
      name: source.productInfo?.name || source.title,
      spec: source.productSpec,
      price: source.productPrice,
      reviews: source.productReviews,
    };

    systemPromptResult = buildFullPrompt('seo', source.categoryHint, source.isFullAuto, toneStyle, productInfoForPrompt);

    // ✅ .prompt 파일에서 쇼핑 프롬프트 로드 (articleType 기반 분기)
    const shoppingArticleType = source.articleType || 'shopping_review';
    const shoppingPrompt = loadShoppingPrompt(shoppingArticleType, toneStyle);

    if (shoppingPrompt) {
      // .prompt 파일 로드 성공 → 모듈화된 프롬프트 사용
      systemPromptResult += `\n\n${shoppingPrompt}`;
      console.log(`[PromptBuilder] ✅ 쇼핑커넥트 모듈 프롬프트 적용: ${shoppingArticleType}`);
    } else {
      // ✅ [v1.4.12] 인라인 폴백 dead code 제거 — .prompt 파일 정상 로드 시 절대 진입 불가
      // dist/prompts/affiliate/{shopping_review,shopping_expert_review}.prompt 보장됨
      console.error(`[PromptBuilder] ❌ 쇼핑 .prompt 파일 로드 실패 — affiliate prompt 누락. shoppingArticleType=${shoppingArticleType}`);
    } // end of shoppingPrompt if/else
  } else {
    systemPromptResult = buildFullPrompt(
      contentMode,
      source.categoryHint,
      source.isFullAuto,
      toneStyle
    );
  }

  // ✅ [Traffic Hunter 통합] 모드별 온도(Temperature) 설정
  // ✅ [v1.4.35] SEO 0.2 → 0.5 (로봇 회귀 방지, "사람보다 사람처럼" 우선)
  //              0.2는 거의 deterministic이라 학습 데이터의 평균 어조로 회귀.
  //              0.5는 키워드 정확도를 유지하면서 어휘/표현 다양성 확보.
  let temperature = 0.5; // 기본값
  if (contentMode === 'seo') temperature = 0.5;  // 0.2 → 0.5
  else if (contentMode === 'homefeed') temperature = 0.7;
  else if (contentMode === 'traffic-hunter') temperature = 0.9;
  else if (contentMode === 'affiliate') temperature = 0.5;
  else if (contentMode === 'custom') temperature = 0.7;
  else if (contentMode === 'business') temperature = 0.6; // ✅ [v1.4.21] 0.4→0.6 (같은 업체 반복 발행 시 다양성 확보)

  let systemPrompt = systemPromptResult;

  // ✅ [v1.4.14] 글자수 지침은 user 파트로 이동 (캐시 적중률 향상)
  // 이전: system에 ${minChars} 직접 삽입 → 매 글 캐시 미스
  // 이후: [원본 텍스트] 마커 이후로 이동 → system 정적 유지

  const primaryKeyword = getPrimaryKeywordFromSource(source);
  const subKeywords = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords
      .slice(1)
      .filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k)))
      .slice(0, 5)
      .join(', ')
    : '';

  console.log(`[PromptBuilder] 글톤 및 프롬프트 생성 완료: ${toneStyle}, 메인키워드=${primaryKeyword}`);

  // ✅ 리뷰형일 때 구매 전 제품 분석 프롬프트 추가
  if (isReviewType) {
    const reviewAnalysisPrompt = `

🔍 [리뷰형 — 구매 전 제품 분석 가이드, 사용후기 아님!]
관점: 제품/서비스 전문 에디터. "이 제품은 ~스펙", "이런 분에게 적합" 식 분석적 표현. 객관 정보 + 전문가 판단.

필수 구조 3~8개 소제목: 핵심요약 → 스펙·기능 분석 → 추천 타겟 → 장점 심층 → 아쉬운 점/주의 → 가성비 판단 → 최종 구매 가이드.

❌ 금지 표현: "써보니/사용해보니/도착해서/2주 써봤는데/재구매 의향 있어요/다시 살 거예요"
✅ 권장 표현: "스펙을 살펴보면/주목할 점은/비교해보면/이 가격대에서는/구매 전 체크포인트/~라는 평가가 많아요"

🏆 제목: "실사용/솔직후기/내돈내산/찐후기/리얼후기" 금지. "[제품명] 구매 전 OO가지/스펙 비교 총정리/이 가격 합리적일까" 권장. 25~40자, 제품명 필수.
`;
    systemPrompt = systemPrompt + reviewAnalysisPrompt;
    console.log(`[PromptBuilder] 리뷰형 구매 전 분석 프롬프트 추가됨`);
  }

  console.log(`[PromptBuilder] 2축 분리 프롬프트 생성: mode=${mode}, category=${categoryHint || 'general'}, isFullAuto=${isFullAuto}, isReviewType=${isReviewType}`);

  // JSON 출력 형식 지시 (홈판 모드: 소제목 3~8개, SEO 모드: 3~8개)
  const isHomefeed = mode === 'homefeed';
  const headingsExample = `"headings": [
    {"title": "소제목 1", "content": "본문 내용...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 2", "content": "본문 내용...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"},
    {"title": "소제목 3", "content": "본문 내용...", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 프롬프트"}
  ]`;

  // 홈판 모드 전용 도입부/반응요약 규칙
  const homefeedStructureRule = isHomefeed ? `
⚠️⚠️⚠️ [홈판 모드 필수 구조 규칙] ⚠️⚠️⚠️
- introduction: 정확히 3줄, 첫 문장 25자 이내, 상황/발언/반응으로 시작
- headings: STRUCTURE OVERRIDE에서 지정한 소제목 개수를 따를 것 (3~8개)
- [강제] 1번 소제목은 반드시 인물명(주어)으로 시작 (예: "매니저의 폭로" - O / "의 폭로" - X)
- 본문 중간에 "📌 당시 대중 반응 요약" 블록 필수 (반드시 앞에 빈 줄 삽입!, 실제 댓글처럼 3~4줄)
- conclusion: 결론/정리 금지, 여운형 문장 2줄만
- 전체 톤: 사용자 설정 글톤 어미 적용, 기자체/설명체 절대 금지
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
    {"text": "제목 1", "score": 95},
    {"text": "제목 2", "score": 90},
    {"text": "제목 3", "score": 85}
  ],
  ${headingsExample},
  "introduction": "${isHomefeed ? '도입부 (정확히 3줄, 첫 문장 25자 이내)' : '도입부'}",
  "conclusion": "${isHomefeed ? '마무리 (여운형 2줄, 결론/정리 금지)' : '마무리'}",
  "hashtags": ["해시태그1", "해시태그2", "해시태그3"],
  "category": "카테고리"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 [이미지 프롬프트 작성 규칙 - 매우 중요!]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

imagePrompt 규칙: 각 소제목 본문 문맥과 일치하는 구체적 한국어 장면 묘사. 추상적/막연한 표현 금지, 소제목별 고유 이미지.
예시: 소제목 "겨울철 피부 관리 팁" → imagePrompt "보습 크림 바르는 손, 촉촉한 겨울 피부, 따뜻한 실내"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[원본 텍스트]
${contentMode === 'homefeed' ? buildStructureVariationDirective() : ''}${contentMode === 'business' ? buildBusinessAngleDirective() : ''}${source.previousTitles && source.previousTitles.length > 0 && (contentMode === 'business' || contentMode === 'seo' || contentMode === 'homefeed') ? `
══════════════════════════════════════════
🚫 [이전 작성 제목 — 비슷한 패턴 반복 금지]
══════════════════════════════════════════
${source.previousTitles.slice(-5).map((t, i) => `${i + 1}. ${t}`).join('\n')}

⛔ 위 제목들과 같은 시작 단어, 같은 패턴, 같은 후킹 방식 절대 금지.
⛔ 완전히 다른 각도로 새 제목 창작하라.
` : ''}${contentMode === 'business' && source.businessInfo ? `
══════════════════════════════════════════
🏢 [업체 정보 — 절대 변경/조작 금지, 그대로 사용]
══════════════════════════════════════════
${source.businessInfo.name ? `📛 업체명: ${source.businessInfo.name}` : ''}
${source.businessInfo.phone ? `📞 전화번호: ${source.businessInfo.phone}` : ''}
${source.businessInfo.kakao ? `💬 카카오톡: ${source.businessInfo.kakao}` : ''}
${source.businessInfo.address ? `📍 주소: ${source.businessInfo.address}` : ''}
${source.businessInfo.hours ? `🕐 영업시간: ${source.businessInfo.hours}` : ''}
${source.businessInfo.serviceArea === 'nationwide' ? `🌏 서비스 범위: 전국 (지역 제한 없음)
   → 제목/본문에 특정 지역명 강제 삽입 금지
   → "전국 어디든", "전국 ○○ 시공", "지역 무관" 표현 활용
   → 신뢰 요소로 "전국 ○○개 시공 사례", "전국 거점 ○○개" 등 강조
   → 지역 키워드 대신 업종+차별점으로 검색 노출 (예: "원목 인테리어", "친환경 도배")` : source.businessInfo.region ? `🗺️ 서비스 지역: ${source.businessInfo.region}
   → 제목 맨 앞에 위 지역명 중 1개 필수 배치 (예: "${source.businessInfo.region.split(/[,/\s]+/)[0]} 인테리어")
   → 본문에 위 지역명들을 골고루 분산 등장 (각 지역 최소 1회)
   → 신뢰 요소로 "${source.businessInfo.region} 시공 ○○건", "${source.businessInfo.region.split(/[,/\s]+/)[0]} 당일 방문 가능" 강조
   → 다른 지역명(서울/강남 등) 임의 추가 절대 금지` : ''}
${source.businessInfo.extra ? `✨ 특징/경력: ${source.businessInfo.extra}` : ''}

⛔ 위 연락처 정보는 한 글자도 변경하지 말고 그대로 사용하라.
⛔ 절대 가짜 전화번호, 가짜 카카오톡 ID, 가짜 주소, 가짜 지역을 만들지 마라.
⛔ 위 업체명을 본문에 8~12회 자연 반복하라.
` : ''}${source.customPrompt ? `
══════════════════════════════════════════
💡 [사용자 추가 지시사항 — 최우선 반영, 다른 모든 규칙보다 상위]
══════════════════════════════════════════
${source.customPrompt.trim()}
` : ''}
══════════════════════════════════════════
🎯 [필수 키워드 정보 — 제목/소제목 작성에 반드시 반영]
══════════════════════════════════════════
${title ? `📌 원본 제목 참고: "${title}"
   → 이 제목을 참고하여 더 강력한 후킹 제목으로 변환. 핵심 키워드 유지 + 감정/호기심 트리거 추가.
` : ''}${(() => {
      if (!primaryKeyword) return '';
      const processed = preprocessLongKeyword(primaryKeyword);
      if (processed.isLong) {
        return `🔑 메인 키워드: "${processed.coreKeyword}"
   → 제목 맨 앞 3글자 이내 필수 배치
   → 본문 전체에 5~8회 자연스럽게 분산 (밀도 1.5~3%)
   → 주제 문맥(${processed.contextHint})은 참고만, 제목에 그대로 사용 금지`;
      }
      return `🔑 메인 키워드: "${processed.coreKeyword}"
   → 제목 맨 앞 3글자 이내 필수 배치
   → 본문 전체에 5~8회 자연스럽게 분산 (밀도 1.5~3%)
   → ⚠️ 모든 소제목에 메인 키워드 또는 그 변형(동의어/관련어) 포함 필수`;
    })()}
${subKeywords ? `🔖 서브 키워드: ${subKeywords}
   → 소제목 5~7개 중 최소 3개의 소제목에 분산 포함
   → 도입부·결론부 각 1회 이상 자연스럽게 등장` : ''}
${contentMode === 'homefeed' && subKeywords ? `
⚠️ [홈판 추가] 메인키워드 5~8회(1.5~3%), 서브키워드 최소 3개 소제목 첫 문장에 포함, 도입부·결론부 각 1회. 스크롤 트리거 3개 이상 의무.` : ''}
${contentMode === 'seo' ? `
⚠️ [SEO 모드 제목 필수 조건]
1. 메인 키워드를 제목 맨 앞 3글자 이내 배치 (검색 매칭률 ↑)
2. 28~45자 길이
3. 1인칭 경험 + 구체성(결과/변화/수치) 포함 (예: "써본 후기", "바꿨더니", "월 얼마 절감"). 기간 수치(N주/N개월)는 연속 발행 시 반복되므로 다른 구체성 우선.
4. AI 표현 절대 금지 ("결론적으로", "정리하면", "알아보겠습니다")` : ''}
${contentMode === 'homefeed' ? `
⚠️ [홈판 모드 제목 필수 조건]
1. 28~35자 길이 (모바일 1.5초 법칙)
2. 감정 트리거 1개 이상 (충격/공감/궁금증)
3. 결핍 설계 5대 공식 중 하나 적용 (정보 결핍/사회적 결핍/경험 결핍/시간 결핍/금전 결핍)
4. 메인 키워드 자연스럽게 포함 (단, SEO처럼 맨 앞 강제 아님)` : ''}
${metrics ? `
📊 [참고 지표] 월간검색량 ${metrics.searchVolume !== undefined && metrics.searchVolume >= 0 ? metrics.searchVolume.toLocaleString() + '건' : '집계중'} / 문서량 ${metrics.documentCount !== undefined ? metrics.documentCount.toLocaleString() + '건' : '집계중'} → ${metrics.searchVolume && metrics.searchVolume > 10000 ? '대형키워드: 전문성·최신성 강조' : '블루오션: 세부 경험·독점 정보'}` : ''}

══════════════════════════════════════════
📄 [원본 본문 — 아래 내용을 바탕으로 작성하라]
══════════════════════════════════════════
${rawText}

══════════════════════════════════════════
⚠️ [최종 강제 조건 — 위반 시 0점]
══════════════════════════════════════════${minChars && minChars > 0 ? `
1. 글자수: 최소 ${minChars}자 이상. 각 소제목 5문장 이상. 요약/축약 금지.` : ''}
2. 메인 키워드를 제목 맨 앞 + 모든 소제목에 필수 포함
3. 위 [필수 키워드 정보]의 모든 규칙을 한 줄도 어기지 말 것
4. 출력은 오직 JSON 객체 하나만. 마크다운/설명 절대 금지.
5. JSON은 반드시 { 로 시작하고 } 로 끝나야 함.

이제 위 모든 정보를 종합하여 즉시 JSON으로 출력하라.
`;

  return `${systemPrompt}\n\n${jsonOutputFormat}`.trim();
}

// ✅ [2026-02-11] 데드코드 제거 완료
// buildPrompt()의 인라인 템플릿(~2,900줄)은 AI API에 전달되지 않는 데드코드였음.
// 모든 모드에서 buildModeBasedPrompt()가 실제 시스템 프롬프트를 생성함.
// 이 함수는 하위 호환성을 위해 buildModeBasedPrompt()로 위임만 함.
function buildPrompt(
  source: ContentSource,
  minChars: number,
  metrics?: { searchVolume?: number; documentCount?: number }
): string {
  const contentMode = (source.contentMode || 'seo') as PromptMode;
  return buildModeBasedPrompt(source, contentMode, metrics, minChars);
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
function detectDuplicateContent(bodyPlain: string, headings: HeadingPlan[], isLastAttempt: boolean = false): { valid: boolean; errors: string[] } {
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

  // ✅ 마지막 시도(재시도 소진): 800자 미만이라도 재시도 중단, 현재 결과로 진행
  if (isLastAttempt) {
    console.warn(`[detectDuplicateContent] ⚠️ 마지막 시도(${bodyPlain.length}자) - 재시도 모두 소진, 현재 결과로 진행`);
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
        case 'n': return '\n'; // ✅ [2026-03-16 FIX] 줄바꿈은 실제 줄바꿈으로 보존 (AI 문단 구분 유지)
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

  // ✅ [2026-04-11 FIX] 제목 개행 제거 — 최종 방어선
  if (content.selectedTitle && typeof content.selectedTitle === 'string') {
    content.selectedTitle = content.selectedTitle.replace(/[\r\n]+/g, ' ').trim();
  }
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
      // ✅ [2026-02-23 FIX] throw 대신 최소한의 빈 구조로 복구 (풀오토 안정성)
      // 이전: throw new Error('필수 필드 누락') → 마지막 시도에서 최종 실패
      // 변경: 키워드/제목으로 최소 구조 생성하여 발행 가능 상태 유지
      const fallbackTitle = content.selectedTitle || '콘텐츠';
      console.error(`[validateStructuredContent] ⚠️ 필수 필드 모두 누락 → 최소 구조로 복구 (제목: "${fallbackTitle}")`);
      content.headings = [{ title: fallbackTitle, content: fallbackTitle }] as any;
      content.bodyPlain = fallbackTitle;
      content.bodyHtml = `<p>${fallbackTitle}</p>`;
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
      // ✅ [2026-01-28] 하드코딩된 폴백 소제목 제거 - AI 생성 소제목 그대로 사용
      // 중복문서 방지를 위해 AI가 생성한 고유 소제목을 유지
      const seen = new Set<string>();
      content.headings = content.headings.map((h, idx) => {
        const stripTitleBase = rawSelectedTitleForHeadingStrip || String(content.selectedTitle || '').trim();
        const originalTitle = h.title || '';
        const stripped = stripReviewTitlePrefixFromHeading(originalTitle, stripTitleBase, productName);
        // ✅ [2026-01-28] AI 생성 소제목을 폴백으로 전달하여 유지
        const sanitized = sanitizeReviewHeadingTitle(stripped || '', originalTitle, productName);

        // 빈 소제목인 경우에만 간단한 번호 폴백 사용
        const finalTitle = sanitized.trim() || `포인트 ${idx + 1}`;

        const key = finalTitle.replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '').toLowerCase();
        let result = finalTitle;
        if (seen.has(key)) {
          result = `${finalTitle} (${idx + 1})`;
        }
        seen.add(key);
        return {
          ...h,
          title: result,
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

    // ✅ [2026-03-06] 홈판 모드: 서브키워드를 해시태그 최우선 포함 (토픽 매칭 시그널)
    const hashtagSubKws = Array.isArray((source?.metadata as any)?.keywords)
      ? (source!.metadata as any).keywords.filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 5)
      : [];
    if (hashtagSubKws.length > 0) {
      hashtagSubKws.forEach((kw: string) => {
        const tag = `#${String(kw).trim()}`;
        if (!generatedHashtags.includes(tag)) generatedHashtags.push(tag);
      });
      console.log(`[validateStructuredContent] ✅ 서브키워드 해시태그 우선 포함: ${generatedHashtags.join(', ')}`);
    }

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
  // ✅ [2026-02-02] 완전 비활성화: AI가 생성한 소제목 그대로 사용
  // 문제: 완성된 소제목에 "무슨 일", "왜 화제", "논란 포인트" 등이 고정적으로 붙는 버그 발생
  // 해결: 소제목 보강 로직 자체를 비활성화하여 AI 생성 원본 유지
  // - AI가 이미 충분히 의미있는 소제목을 생성함
  // - 불필요한 접미사 추가는 글의 품질을 저하시킴
  const t = normalizeTitleWhitespace(String(title || '').trim());
  return t;
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
    const title = String(h.title || '').trim();

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

  // ✅ [2026-03-06] 제목 서브키워드 포함 체크 (검색 매칭 강화)
  const seoSubKws = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 3)
    : [];
  if (seoSubKws.length > 0) {
    const hasSubKwInTitle = seoSubKws.some((kw: string) => title.includes(String(kw)));
    if (!hasSubKwInTitle) {
      warnings.push('⚠️ 제목에 서브키워드 없음 (검색 매칭 약화)');
      titleScore -= 10;
      console.warn(`[SeoValidator] ⚠️ 제목에 서브키워드 미포함: [${seoSubKws.join(', ')}] — 검색 매칭 약화`);
    } else {
      console.log('[SeoValidator] ✅ 제목 서브키워드 포함 확인');
    }
  }

  console.log(`[SeoValidator] 📊 제목 점수: ${titleScore}/100 ("${title.substring(0, 30)}...")`);

  // 2. 소제목 개수 검증 (5~7개 권장)
  const headingsCount = content.headings?.length || 0;
  if (headingsCount < 5) {
    warnings.push(`⚠️ 소제목 ${headingsCount}개 (SEO 권장: 5~7개, 체류시간 ↑)`);
    console.warn(`[SeoValidator] ⚠️ 소제목 부족: ${headingsCount}개`);
  }

  // 3. 본문 톤 검증 (AI티 감지 - 확장)
  const bodyText = content.bodyPlain || '';
  const aiPatterns = [
    '물론', '확실히', '것입니다', '하겠습니다', '살펴보겠습니다',
    '알아보겠습니다', '소개해드리', '살펴보았습니다', '종합적으로',
    '정리하자면', '요약하면', '핵심:', '요약:', '정리:'
  ];
  let aiPatternCount = 0;
  for (const p of aiPatterns) {
    if (bodyText.includes(p)) {
      aiPatternCount++;
      console.warn(`[SeoValidator] 🚨 AI티 표현 발견: "${p}"`);
    }
  }
  if (aiPatternCount > 0) {
    warnings.push(`⚠️ AI티 표현 ${aiPatternCount}개 감지 (자연스러운 문체 권장)`);
  } else {
    console.log('[SeoValidator] ✅ AI 표현 0개 — 자연스러움');
  }

  // ✅ [2026-03-06] 4. 메인키워드 본문 밀도 검증 (SEO 핵심: 1.5~3%)
  const seoPK = (source.metadata as any)?.keywords?.[0] ? String((source.metadata as any).keywords[0]).trim() : '';
  if (seoPK && bodyText.length > 100) {
    const pkCount = (bodyText.match(new RegExp(seoPK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
    const density = (pkCount * seoPK.length) / bodyText.length * 100;
    if (density < 1.0) {
      warnings.push(`⚠️ 메인키워드 밀도 ${density.toFixed(1)}% (SEO 권장 1.5~3%)`);
      console.warn(`[SeoValidator] ⚠️ 메인키워드 "${seoPK}" 밀도 ${density.toFixed(1)}% — 검색 노출 부족`);
    } else if (density > 4.0) {
      warnings.push(`⚠️ 메인키워드 밀도 ${density.toFixed(1)}% (키워드 스터핑 위험, 3% 이하 권장)`);
      console.warn(`[SeoValidator] ⚠️ 메인키워드 밀도 ${density.toFixed(1)}% — 스터핑 위험`);
    } else {
      console.log(`[SeoValidator] ✅ 메인키워드 밀도 ${density.toFixed(1)}% — 적정`);
    }
  }

  // ✅ [2026-03-06] 5. 서브키워드 결론부 포함 검증 (DIA 매칭 강화)
  if (seoSubKws.length > 0) {
    const conclusionArea = (content.conclusion || '') + ' ' + (content.headings && content.headings.length > 0
      ? String((content.headings[content.headings.length - 1] as any).body || (content.headings[content.headings.length - 1] as any).content || '')
      : '');
    const hasSubKwInConclusion = seoSubKws.some((kw: string) => conclusionArea.includes(String(kw)));
    if (!hasSubKwInConclusion) {
      warnings.push('⚠️ 결론부에 서브키워드 없음 (DIA 매칭 약화)');
      console.warn('[SeoValidator] ⚠️ 결론부 서브키워드 미포함 — DIA 검색 매칭 약화');
    } else {
      console.log('[SeoValidator] ✅ 결론부 서브키워드 포함 확인');
    }
  }

  // ✅ [2026-03-06] 6. 종결어미 다양성 검증 (AI 탐지 회피)
  if (content.headings && content.headings.length > 0) {
    const allBodies = content.headings.map((h: any) => String(h.body || h.content || '')).join(' ');
    const sentences = allBodies.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length >= 5) {
      const endings = sentences.map(s => {
        const t = s.trim();
        return t.length >= 3 ? t.slice(-3) : t;
      });
      const uniqueEndings = new Set(endings);
      const diversityRatio = uniqueEndings.size / endings.length;
      if (diversityRatio < 0.4) {
        warnings.push(`⚠️ 종결어미 다양성 ${Math.round(diversityRatio * 100)}% (AI 탐지 위험, 60%+ 권장)`);
        console.warn(`[SeoValidator] ⚠️ 종결어미 반복 비율 높음 (${Math.round(diversityRatio * 100)}%) — AI 탐지 위험`);
      } else {
        console.log(`[SeoValidator] ✅ 종결어미 다양성 ${Math.round(diversityRatio * 100)}% — 자연스러움`);
      }
    }
  }

  // ✅ [2026-03-06] 7. 본문 길이 2500자+ 검증 (C-Rank 문서 완성도)
  if (bodyText.length > 0 && bodyText.length < 2500) {
    warnings.push(`⚠️ 본문 ${bodyText.length}자 (C-Rank 권장 2500자+)`);
    console.warn(`[SeoValidator] ⚠️ 본문 ${bodyText.length}자 — C-Rank 문서 완성도 부족`);
  } else if (bodyText.length >= 2500) {
    console.log(`[SeoValidator] ✅ 본문 ${bodyText.length}자 — C-Rank 충족`);
  }

  // ✅ [2026-03-06] 8. 질문형 소제목 비율 검증 (의미론적 SEO, 2개+ 권장)
  if (content.headings && content.headings.length > 0) {
    const questionPatterns = ['?', '할까', '일까', '인가', '나요', '은가', '를까', '었을까', '던가', '는지'];
    let questionCount = 0;
    for (const h of content.headings) {
      const ht = String(h.title || '');
      if (questionPatterns.some(p => ht.includes(p))) questionCount++;
    }
    if (questionCount < 1) {
      warnings.push('⚠️ 질문형 소제목 0개 (의미론적 SEO 약화, 1개+ 권장)');
      console.warn('[SeoValidator] ⚠️ 질문형 소제목 없음 — 의미론적 SEO 약화');
    } else {
      console.log(`[SeoValidator] ✅ 질문형 소제목 ${questionCount}개 — 의미론적 SEO 강화`);
    }
  }

  // ✅ [2026-03-06] 9. 도입부 첫 2문장에 키워드 포함 검증 (AI 스니펫 대응)
  if (seoPK && content.introduction) {
    const introText = String(content.introduction).trim();
    const firstTwoSentences = introText.split(/[.!?]/).slice(0, 2).join(' ');
    if (!firstTwoSentences.includes(seoPK)) {
      warnings.push('⚠️ 도입부 첫 2문장에 키워드 없음 (AI 스니펫 대응 약화)');
      console.warn(`[SeoValidator] ⚠️ 도입부에 키워드 "${seoPK}" 미포함 — AI 스니펫 대응 실패`);
    } else {
      console.log('[SeoValidator] ✅ 도입부 키워드 포함 — AI 스니펫 대응 완료');
    }
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
// ✅ [v1.4.24] business 모드 전용 검증 — 가짜 번호 생성 방지 + 소제목 개수 강제
export function validateBusinessContent(content: StructuredContent, source: ContentSource): { hasCritical: boolean; violations: string[]; warnings: string[] } {
  if (source.contentMode !== 'business') return { hasCritical: false, violations: [], warnings: [] };

  const violations: string[] = [];
  const warnings: string[] = [];
  const bodyText = content.bodyPlain || '';
  const allText = `${content.selectedTitle || ''} ${bodyText} ${(content.headings || []).map((h: any) => `${h?.title || ''} ${h?.content || ''}`).join(' ')}`;

  console.log('[BusinessValidator] 🔍 업체 홍보 모드 검증 시작...');

  // 1. businessInfo 필드가 본문에 그대로 있는지 검증
  const info = source.businessInfo;
  if (info) {
    if (info.name) {
      const nameCount = (allText.match(new RegExp(info.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (nameCount === 0) {
        violations.push(`업체명 "${info.name}"이 본문에 한 번도 없음 (필수 8~12회 반복)`);
      } else if (nameCount < 3) {
        warnings.push(`업체명 "${info.name}" 등장 ${nameCount}회 (권장 8~12회)`);
      }
    }

    if (info.phone) {
      // 입력한 전화번호가 본문에 있는지
      if (!allText.includes(info.phone)) {
        violations.push(`전화번호 "${info.phone}"이 본문에 없음 — AI가 가짜 번호 생성 또는 누락`);
      }
      // 가짜 번호 패턴 감지 (입력값 외 다른 번호)
      const phonePatterns = allText.match(/(?:0\d{1,2}-?\d{3,4}-?\d{4}|01[0-9]-?\d{3,4}-?\d{4}|1[5-9]\d{2}-?\d{4})/g) || [];
      for (const found of phonePatterns) {
        const normalized = found.replace(/-/g, '');
        const inputNormalized = info.phone.replace(/-/g, '');
        if (normalized !== inputNormalized) {
          violations.push(`⛔ 가짜 전화번호 감지: "${found}" (입력값 "${info.phone}"과 다름)`);
        }
      }
    }

    if (info.kakao && !allText.includes(info.kakao)) {
      warnings.push(`카카오톡 "${info.kakao}"가 본문에 없음`);
    }

    if (info.address && !allText.includes(info.address.split(' ')[0])) {
      warnings.push(`주소 일부가 본문에 없음`);
    }

    // 전국구 vs 지역구 일치 검증
    if (info.serviceArea === 'regional' && info.region) {
      const firstRegion = info.region.split(/[,/\s]+/)[0];
      if (firstRegion && !allText.includes(firstRegion)) {
        violations.push(`지역명 "${firstRegion}"이 본문/제목에 없음 (지역구 모드 필수)`);
      }
    }
    if (info.serviceArea === 'nationwide') {
      // 다른 지역명 임의 추가 감지 (강남/송파 등 특정 지역)
      const suspiciousRegions = ['강남', '송파', '서초', '잠실', '명동', '홍대', '이태원'];
      const found = suspiciousRegions.filter(r => allText.includes(r));
      if (found.length > 0) {
        warnings.push(`전국구인데 특정 지역명 발견: ${found.join(', ')}`);
      }
    }
  }

  // 2. 소제목 5~7개 검증
  const headingCount = Array.isArray(content.headings) ? content.headings.length : 0;
  if (headingCount < 5) {
    violations.push(`소제목 ${headingCount}개 (필수 5~7개)`);
  } else if (headingCount > 7) {
    warnings.push(`소제목 ${headingCount}개 (권장 5~7개)`);
  }

  // 3. 마지막 소제목이 "문의/연락처" 안내인지 검증
  if (Array.isArray(content.headings) && content.headings.length > 0) {
    const lastHeading = content.headings[content.headings.length - 1];
    const lastTitle = String(lastHeading?.title || '');
    const ctaKeywords = ['문의', '견적', '상담', '연락', '예약', '안내', '신청'];
    if (!ctaKeywords.some(kw => lastTitle.includes(kw))) {
      warnings.push(`마지막 소제목이 CTA 안내 아님: "${lastTitle}" (필수: 문의/견적/상담/연락처 키워드)`);
    }
  }

  // 4. 광고법 단정 표현 감지
  const bannedTerms = [
    { term: '100% 보장', regex: /100\s*%\s*보장/g },
    { term: '100% 만족', regex: /100\s*%\s*만족/g },
    { term: '최저가', regex: /최저가/g },
    { term: '업계 1위', regex: /업계\s*1위/g },
    { term: '국내 1위', regex: /국내\s*1위/g },
    { term: '최고의', regex: /최고의/g },
  ];
  for (const { term, regex } of bannedTerms) {
    if (regex.test(allText)) {
      violations.push(`⛔ 광고법 위반 표현 감지: "${term}"`);
    }
  }

  // 결과 로깅
  if (violations.length > 0) {
    console.error(`[BusinessValidator] ❌ Critical 위반 ${violations.length}개:`, violations);
  }
  if (warnings.length > 0) {
    console.warn(`[BusinessValidator] ⚠️ 경고 ${warnings.length}개:`, warnings);
  }
  if (violations.length === 0 && warnings.length === 0) {
    console.log('[BusinessValidator] ✅ 모든 검증 통과');
  }

  // quality 객체에 저장
  if (!content.quality) {
    content.quality = {
      aiDetectionRisk: 'low',
      legalRisk: (violations.length > 0 ? 'danger' : (warnings.length > 0 ? 'caution' : 'safe')) as LegalRiskLevel,
      seoScore: 70,
      originalityScore: 70,
      readabilityScore: 70,
      warnings: [],
    };
  }
  content.quality.warnings = [
    ...(content.quality.warnings || []),
    ...violations.map(v => `BusinessValidator: ${v}`),
    ...warnings.map(w => `BusinessValidator: ${w}`),
  ];

  return { hasCritical: violations.length > 0, violations, warnings };
}

/**
 * ✅ [v1.4.52] 출처 날조 표현 강제 제거 sanitizer (3-Layer 박멸)
 * 프롬프트로 금지해도 AI가 종종 출력하는 외부 출처 표현을 정규식으로 100% 제거
 *
 * Layer 1: 강한 출처 명사 (원문/기사/보도/영상 등) — 모든 조사 변형 + 한정사 prefix
 * Layer 2: 약한 출처 명사 (본문/자료/뉴스 등) — 출처 조사에만 반응 (오탐 방지)
 * Layer 3: 일반 출처 표현 (전해진 바/관계자/매체 등)
 */
function stripFakeSourcePhrases(text: string): string {
  if (!text) return text;
  let out = text;

  // 한정사 prefix: "본 기사", "위 영상", "해당 자료", "공식 자료", "이 기사" 등
  // ⚠️ leading \s* 를 두면 단어 사이 공백을 흡수해 인접 단어가 붙어버림
  //    → 한정사 + 공백을 한 그룹으로 묶고, prefix 자체는 leading 공백 흡수 금지
  const PREFIX = '(?:(?:본|위|해당|공식|이|그|저|한|일부)\\s+)?';

  // ━━━ Layer 1: 강한 출처 명사 (오탐 위험 낮음 — 모든 조사 처리) ━━━
  const STRONG = '원문|원본|기사|보도|외신|영상|유튜브|동영상|클립|쇼츠|숏츠|논문|취재';

  // 1-A. 캡처 그룹 없는 패턴 → 빈 문자열로 치환
  // ⚠️ 콜백 형태 사용 금지 — 캡처 그룹 0개일 때 두 번째 인자가 offset(number)이라
  //    `(_, p1) => p1 ? p1 : ''` 콜백이 두 번째 매칭부터 offset 숫자를 결과에 삽입함
  const strongPatternsEmpty: RegExp[] = [
    // ~에서(는|도|선) + 선택적 동사
    new RegExp(
      `${PREFIX}(?:${STRONG})\\s*에(?:서[는도]?|선)(?:\\s*(?:확인|보면|나오|소개|다루|언급|등장|말하|전하)\\S*)?\\s*[,，]?\\s*`,
      'g'
    ),
    // ~에 따르면 / ~에 의하면
    new RegExp(`${PREFIX}(?:${STRONG})\\s*에\\s*(?:따르면|의하면)\\s*[,，]?\\s*`, 'g'),
    // ~을/를 보(니|면|자|았더니)
    new RegExp(
      `${PREFIX}(?:${STRONG})\\s*(?:을|를)\\s*보(?:니|면|자|았\\S*)?\\s*[,，]?\\s*`,
      'g'
    ),
  ];
  for (const re of strongPatternsEmpty) {
    out = out.replace(re, '');
  }

  // 1-B. 문장 시작 ~은/는 — 캡처 그룹 1개($1)로 문장 구분자 보존
  const strongStartPattern = new RegExp(
    `(^|[\\.\\?\\!]\\s+)(?:${STRONG})(?:은|는)\\s+`,
    'g'
  );
  out = out.replace(strongStartPattern, '$1');

  // ━━━ Layer 2: 약한 출처 명사 (오탐 위험 있음 — 명확한 출처 조사만) ━━━
  // "글", "내용" 등은 자기 글 지칭일 수 있어 제외
  const WEAK = '본문|문서|포스팅|포스트|리뷰|자료|뉴스|방송|매체|발표|보고서';

  const weakPatterns: RegExp[] = [
    new RegExp(`${PREFIX}(?:${WEAK})\\s*에(?:서[는도]?|선)\\s*[,，]?\\s*`, 'g'),
    new RegExp(`${PREFIX}(?:${WEAK})\\s*에\\s*(?:따르면|의하면)\\s*[,，]?\\s*`, 'g'),
    new RegExp(`${PREFIX}(?:${WEAK})\\s*(?:을|를)\\s*보(?:니|면|자|았\\S*)?\\s*[,，]?\\s*`, 'g'),
  ];
  for (const re of weakPatterns) {
    out = out.replace(re, '');
  }

  // ━━━ Layer 3: 일반 출처 표현 ━━━
  out = out
    .replace(/(?:전해진|알려진)\s*바에?\s*(?:따르면|의하면)\s*[,，]?\s*/g, '')
    .replace(/관계자에?\s*(?:따르면|의하면)\s*[,，]?\s*/g, '')
    .replace(/(?:한|일부|여러)\s*매체(?:에서|에)?\s*(?:따르면|의하면|보도)?\s*[,，]?\s*/g, '')
    .replace(/외신\s*(?:보도)?에?\s*(?:따르면|의하면)?\s*[,，]?\s*/g, '')
    .replace(/공식\s*(?:발표|입장)에?\s*(?:따르면|의하면)\s*[,，]?\s*/g, '');

  // ━━━ 잔여 정리 ━━━
  out = out
    .replace(/^\s*[,，\.]\s*/gm, '')      // 줄 시작 쉼표/마침표
    .replace(/\s{2,}/g, ' ')              // 이중 공백 → 단일
    .replace(/\.\s*\./g, '.')             // 이중 마침표
    .replace(/\s+([,，\.\?\!])/g, '$1')   // 부호 앞 공백
    .trim();

  return out;
}

/** content 객체 전체에 출처 날조 sanitizer 적용 (mutate) */
function sanitizeContentFakeSources(content: StructuredContent): number {
  let count = 0;
  const tryFix = (s: string | undefined): string | undefined => {
    if (!s) return s;
    const fixed = stripFakeSourcePhrases(s);
    if (fixed !== s) count++;
    return fixed;
  };

  // ✅ [v1.4.52] 제목 + 도입부 + 결론 + 모든 소제목/본문 전수 sanitization
  if (content.selectedTitle) content.selectedTitle = tryFix(content.selectedTitle)!;
  if ((content as any).title) (content as any).title = tryFix((content as any).title);
  if (content.introduction) content.introduction = tryFix(content.introduction)!;
  if (content.conclusion) content.conclusion = tryFix(content.conclusion)!;
  if (Array.isArray(content.headings)) {
    for (const h of content.headings as any[]) {
      if (h.title) h.title = tryFix(h.title);
      if (h.body) h.body = tryFix(h.body);
      if (h.content) h.content = tryFix(h.content);
    }
  }
  if (count > 0) {
    console.warn(`[Sanitizer] 🧹 출처 날조 표현 ${count}개 자동 제거`);
  }
  return count;
}

function validateHomefeedContent(content: StructuredContent, source: ContentSource): { hasCritical: boolean; violations: string[] } {
  // ✅ [v1.4.52] 모든 모드에서 출처 날조 표현 강제 제거 (early return보다 먼저 실행)
  // 프롬프트로 금지해도 AI가 종종 출력하므로 정규식 박멸
  sanitizeContentFakeSources(content);

  if (source.contentMode !== 'homefeed') return { hasCritical: false, violations: [] };

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

  // 1. 소제목 개수 검증 (4~7개 — 구조 변동 엔진 대응)
  const headingsCount = content.headings?.length || 0;
  if (headingsCount < 3) {
    warnings.push(`⚠️ 소제목 ${headingsCount}개 (최소 3개 필요)`);
    console.warn(`[HomefeedValidator] ⚠️ 소제목 심각 부족: ${headingsCount}개`);

    // 소제목이 3개 이하면 추가 소제목 생성 시도
    // ✅ [2026-02-02] 폴백 소제목을 범용적으로 변경 (연예 전용 '당시 대중 반응 요약' 제거)
    if (headingsCount < 3 && content.headings) {
      // ✅ [2026-03-06] 폴백 소제목을 토픽 연관 소제목으로 교체 (홈피드 체류시간 최적화)
      const primaryKW = (source.metadata as any)?.keywords?.[0] ? String((source.metadata as any).keywords[0]).trim() : '';
      const additionalHeadings = [
        { title: primaryKW ? `${primaryKW}, 놓치면 후회할 포인트` : '놓치면 후회할 핵심 포인트', content: '여기서부터가 진짜 중요해요.', summary: '', keywords: [], imagePrompt: '' },
        { title: '직접 경험해보니 달랐어요', content: '솔직히 기대 안 했는데, 생각보다 달랐어요.', summary: '', keywords: [], imagePrompt: '' },
      ];
      content.headings.push(...additionalHeadings.slice(0, 4 - headingsCount));
      console.log(`[HomefeedValidator] 소제목 ${4 - headingsCount}개 자동 추가 (토픽 연관 폴백)`);
    }

  } else if (headingsCount > 8) {
    warnings.push(`⚠️ 소제목 ${headingsCount}개 — 너무 많음 (8개 이하 권장)`);
    console.warn(`[HomefeedValidator] ⚠️ 소제목 과다: ${headingsCount}개`);
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

  // ✅ [2026-03-06] 5. 결론부 서브키워드 포함 검증
  const validatorSubKws = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 3)
    : [];
  if (validatorSubKws.length > 0) {
    const conclusionText = (content.conclusion || '') + ' ' + (content.headings && content.headings.length > 0
      ? String((content.headings[content.headings.length - 1] as any).body || (content.headings[content.headings.length - 1] as any).content || '')
      : '');
    const hasSubKwInConclusion = validatorSubKws.some((kw: string) => conclusionText.includes(String(kw)));
    if (!hasSubKwInConclusion) {
      warnings.push('⚠️ 결론부에 서브키워드 없음 (네이버 AI 토픽 매칭 약화)');
      console.warn('[HomefeedValidator] ⚠️ 결론부에 서브키워드 미포함 — 토픽 매칭 약화');
    } else {
      console.log('[HomefeedValidator] ✅ 결론부 서브키워드 포함 확인');
    }
  }

  // ✅ [2026-03-06] 6. 메인키워드 본문 밀도 검증
  const validatorPK = (source.metadata as any)?.keywords?.[0] ? String((source.metadata as any).keywords[0]).trim() : '';
  if (validatorPK && bodyText.length > 100) {
    const pkCount = (bodyText.match(new RegExp(validatorPK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
    const density = (pkCount * validatorPK.length) / bodyText.length * 100;
    if (density < 1.0) {
      warnings.push(`⚠️ 메인키워드 밀도 ${density.toFixed(1)}% (권장 1.5~3%)`);
      console.warn(`[HomefeedValidator] ⚠️ 메인키워드 "${validatorPK}" 밀도 ${density.toFixed(1)}% — 홈피드 토픽 매칭 부족`);
    } else if (density > 4.0) {
      warnings.push(`⚠️ 메인키워드 밀도 ${density.toFixed(1)}% (과도, 3% 이하 권장)`);
      console.warn(`[HomefeedValidator] ⚠️ 메인키워드 밀도 ${density.toFixed(1)}% — 키워드 스터핑 위험`);
    } else {
      console.log(`[HomefeedValidator] ✅ 메인키워드 밀도 ${density.toFixed(1)}% — 적정`);
    }
  }

  // ✅ [2026-03-06] 7. 문장 종결어미 다양성 검증 (AI 탐지 회피)
  if (content.headings && content.headings.length > 0) {
    const allBodies = content.headings.map((h: any) => String(h.body || h.content || '')).join(' ');
    const sentences = allBodies.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length >= 5) {
      const endings = sentences.map(s => {
        const t = s.trim();
        return t.length >= 3 ? t.slice(-3) : t;
      });
      const uniqueEndings = new Set(endings);
      const diversityRatio = uniqueEndings.size / endings.length;
      if (diversityRatio < 0.4) {
        warnings.push(`⚠️ 종결어미 다양성 ${Math.round(diversityRatio * 100)}% (AI 탐지 위험, 60%+ 권장)`);
        console.warn(`[HomefeedValidator] ⚠️ 종결어미 반복 비율 높음 (${Math.round(diversityRatio * 100)}%) — AI 탐지 위험`);
      } else {
        console.log(`[HomefeedValidator] ✅ 종결어미 다양성 ${Math.round(diversityRatio * 100)}% — 자연스러움`);
      }
    }
  }

  // ✅ [2026-03-16] contentQualityChecker 모듈로 critical 위반 감지 (인라인 40줄 코드 제거)
  const criticalResult = checkHomefeedCriticalViolations(content as any);
  const criticalViolations = criticalResult.violations;

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

  return { hasCritical: criticalViolations.length > 0, violations: criticalViolations };
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
  else if (minChars < 10000) baseTimeout = 240000; // 긴 글: 4분
  else baseTimeout = 300000;                       // 매우 긴 글: 5분

  // ✅ 재시도 시 타임아웃 약간 증가 (빠른 폴백 우선)
  // 1회 재시도: +20%, 2회: +40%, 3회 이상: +60%
  const multiplier = 1 + (Math.min(retryAttempt, 3) * 0.2);
  return Math.floor(baseTimeout * multiplier);
}

// ✅ [v1.4.6] Gemini Context Caching — 정적 시스템 프롬프트를 캐시하여 입력 토큰 비용 75% 절감
// 캐시 키: SHA-256(systemText + modelName) → 동일 system 프롬프트 + 동일 모델이면 재사용
// 캐시 TTL: 1시간 (Google 권장값)
// 최소 토큰: Flash 4096, Pro 2048 (그 이상이어야 캐시 가능)
interface GeminiCacheEntry {
  cacheName: string;        // 캐시 리소스 이름 (Google 서버에 저장)
  modelName: string;
  createdAt: number;        // 생성 시각 (만료 체크용)
  ttlSeconds: number;       // TTL
}

const geminiPromptCache = new Map<string, GeminiCacheEntry>();
const GEMINI_CACHE_TTL = 3600; // 1시간
const GEMINI_CACHE_MIN_TOKENS = { flash: 4096, pro: 2048 };

/**
 * 시스템 프롬프트의 캐시 키 생성 (SHA-256)
 */
function getCacheKey(systemText: string, modelName: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(`${modelName}::${systemText}`);
  return hash.digest('hex').substring(0, 32);
}

/**
 * 캐시 만료 체크
 */
function isCacheExpired(entry: GeminiCacheEntry): boolean {
  const elapsed = (Date.now() - entry.createdAt) / 1000;
  return elapsed >= entry.ttlSeconds - 60; // 60초 안전 마진
}

/**
 * 캐시 정리 (만료된 항목 제거)
 */
function cleanExpiredCaches(): void {
  for (const [key, entry] of geminiPromptCache.entries()) {
    if (isCacheExpired(entry)) {
      geminiPromptCache.delete(key);
      console.log(`[GeminiCache] 만료 캐시 제거: ${entry.cacheName}`);
    }
  }
}

// ✅ [v1.4.49] Gemini 모델 체인 — 플랜 타입별 스마트 기본값
//   무료 플랜: Flash (RPD 250/일, 연속 발행 안정)
//   유료 플랜: Flash-Lite (Tier1 RPD 30,000, Flash보다 3배 싸고 3배 많음)
//   사용자가 명시적으로 선택한 모델은 플랜 관계없이 그 선택 존중
export function buildGeminiModelChain(config?: { primaryGeminiTextModel?: string; geminiModel?: string; geminiPlanType?: 'free' | 'paid' }): {
  primaryModel: string;
  uniqueModels: string[];
  isPro: boolean;
} {
  // 플랜에 따라 기본값 결정
  const isPaidPlan = config?.geminiPlanType === 'paid';
  const defaultModel = isPaidPlan ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';

  let primaryModel = config?.primaryGeminiTextModel || config?.geminiModel || defaultModel;
  if (!primaryModel.startsWith('gemini-')) {
    primaryModel = defaultModel;
  }
  const isPro = primaryModel.includes('-pro');
  const uniqueModels = [primaryModel];
  return { primaryModel, uniqueModels, isPro };
}

async function callGemini(prompt: string, temperature: number = 0.9, minChars: number = 2000, options: { useGrounding?: boolean } = {}): Promise<string> {
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

  // ✅ [v1.4.50] Safety Lock — 유료 플랜 사용자의 예산 초과 방지
  // 무료 플랜은 Google이 자동 차단하므로 Safety Lock 불필요 (무료는 한도만 체크)
  // 유료 플랜은 카드 자동 청구되므로 앱에서 직접 차단해야 함
  if (config?.geminiPlanType === 'paid') {
    try {
      const { flushGeminiUsage, getGeminiUsageSnapshot } = await import('./gemini.js');
      await flushGeminiUsage();
      const usage = await getGeminiUsageSnapshot();
      const budget = Number(config.geminiCreditBudget) || 300;
      const spent = Number(usage.estimatedCostUSD) || 0;
      const ratio = spent / budget;

      if (spent >= budget) {
        // 100% 도달 — 차단 (사용자가 직접 초기화/예산 상향해야 재개)
        const msg = `🛡️ Safety Lock 발동: 예산 한도 도달 ($${spent.toFixed(2)} / $${budget}). 설정 → Gemini → 예산을 상향하거나 사용량을 초기화하세요.`;
        console.error(`[Gemini] ${msg}`);
        throw new BudgetExceededError(msg, spent, budget);
      }
      if (ratio >= 0.9) {
        // 90% 경고 (차단은 아님)
        console.warn(`[Gemini] ⚠️ 예산 90% 경고: $${spent.toFixed(2)} / $${budget} (${(ratio * 100).toFixed(1)}%)`);
      }
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      console.warn('[Gemini] Safety Lock 체크 실패(무시하고 진행):', (e as Error).message);
    }
  }

  // ✅ [2026-03-16] promptSplitter 모듈로 system/user 분리
  // 기존 37줄 하드코딩 systemInstructionText 제거 → .prompt 파일의 규칙이 그대로 system으로 전달
  // ✅ [v1.4.51] geminiUserText/temperature를 mutable로 — 빈 응답 회복 시 프롬프트 증강
  const { system: geminiSystemText, user: geminiUserTextOriginal } = splitPromptByMarker(prompt);
  let geminiUserText = geminiUserTextOriginal;
  let activeTemperature = temperature;
  let promptAugmentationCount = 0;
  const MAX_PROMPT_AUGMENTATIONS = 2;

  // 1. API 키 로드 — 다중 키 로테이션 지원
  const primaryApiKey = (config?.geminiApiKey?.trim() || process.env.GEMINI_API_KEY || '').trim();
  if (!primaryApiKey) throw new Error('Gemini API 키가 설정되지 않았습니다.');
  const extraKeys: string[] = (config?.geminiApiKeys || []).map((k: string) => k.trim()).filter((k: string) => k && k !== primaryApiKey);
  const allApiKeys = [primaryApiKey, ...extraKeys];
  let currentKeyIdx = 0;
  const getNextKey = (): string | null => {
    currentKeyIdx++;
    return currentKeyIdx < allApiKeys.length ? allApiKeys[currentKeyIdx] : null;
  };
  let trimmedKey = allApiKeys[0];

  if (allApiKeys.length > 1) {
    console.log(`[Gemini] 🔑 API 키 ${allApiKeys.length}개 로테이션 준비 완료`);
  }

  // 2. 모델 목록 설정 — limit:0 시 폴백 체인 동적 확장
  const { primaryModel, isPro } = buildGeminiModelChain(config as any);
  const modelsToTry = [primaryModel];
  // limit:0 감지 시 폴백할 모델 후보 (사용자 선택 모델 제외)
  const fallbackCandidates = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'].filter(m => m !== primaryModel);
  console.log(`[Gemini] 모델: ${primaryModel} (티어: ${isPro ? 'PRO' : 'FLASH'})`);

  let lastError: Error | null = null;
  const perModelMaxRetries = 4;

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    let modelRetryCount = 0;
    // 폴백 모델은 키 인덱스 + 프롬프트 증강 상태 리셋
    if (i > 0) {
      currentKeyIdx = 0;
      trimmedKey = allApiKeys[0];
      promptAugmentationCount = 0;
      geminiUserText = geminiUserTextOriginal;
      activeTemperature = temperature;
    }

    while (modelRetryCount < perModelMaxRetries) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const client = new GoogleGenerativeAI(trimmedKey);

        // ✅ [v1.4.6] Gemini Context Caching — 시스템 프롬프트 재사용으로 75% 절감
        // 캐시 가능 조건: system 프롬프트가 충분히 큼 (Flash 4096 토큰, Pro 2048 토큰)
        // 1토큰 ≈ 4자 한국어 기준 → Flash 16,384자, Pro 8,192자
        const minCacheChars = modelName.includes('-pro') ? 8192 : 16384;
        const cacheEnabled = geminiSystemText.length >= minCacheChars;
        let cachedContentName: string | undefined;

        if (cacheEnabled) {
          cleanExpiredCaches();
          const cacheKey = getCacheKey(geminiSystemText, modelName);
          const existingCache = geminiPromptCache.get(cacheKey);

          if (existingCache && !isCacheExpired(existingCache)) {
            // 캐시 히트 — 75% 절감
            cachedContentName = existingCache.cacheName;
            console.log(`[GeminiCache] ✅ 히트: ${cachedContentName.substring(0, 30)}... (system ${geminiSystemText.length}자, 75% 절감)`);
          } else {
            // 캐시 미스 — 새로 생성
            try {
              const { GoogleAICacheManager } = await import('@google/generative-ai/server' as any);
              const cacheManager = new GoogleAICacheManager(trimmedKey);
              const newCache = await cacheManager.create({
                model: `models/${modelName}`,
                systemInstruction: { role: 'system', parts: [{ text: geminiSystemText }] },
                contents: [{ role: 'user', parts: [{ text: '준비 완료' }] }],
                ttlSeconds: GEMINI_CACHE_TTL,
              });
              cachedContentName = newCache.name;
              if (cachedContentName) {
                geminiPromptCache.set(cacheKey, {
                  cacheName: cachedContentName,
                  modelName,
                  createdAt: Date.now(),
                  ttlSeconds: GEMINI_CACHE_TTL,
                });
                console.log(`[GeminiCache] 🆕 생성: ${cachedContentName.substring(0, 30)}... (다음 호출부터 75% 절감)`);
              }
            } catch (cacheErr: any) {
              console.warn(`[GeminiCache] ⚠️ 캐시 생성 실패 (정상 호출로 폴백): ${cacheErr?.message?.substring(0, 100)}`);
              cachedContentName = undefined;
            }
          }
        }

        // 모델 인스턴스 생성 (캐시 사용 여부에 따라 분기)
        const model = cachedContentName
          ? client.getGenerativeModelFromCachedContent({
              model: modelName,
              name: cachedContentName,
            } as any)
          : client.getGenerativeModel({ model: modelName });

        console.log(`[Gemini] 시도 중: ${modelName} (시도 ${modelRetryCount + 1}/${perModelMaxRetries})${cachedContentName ? ' [캐시 사용 ✅]' : ''}`);
        // ✅ [v1.4.3] Search Grounding 스마트 적용 — 본문 생성만 ON, 패치는 OFF
        const configGrounding = (config as any)?.enableSearchGrounding !== false;
        const useGrounding = (options.useGrounding !== false) && configGrounding;

        // 캐시 사용 시 systemInstruction 중복 금지 (캐시에 이미 포함)
        const requestConfig: any = {
          contents: [{ role: 'user', parts: [{ text: geminiUserText }] }],
          ...(!cachedContentName && geminiSystemText
            ? { systemInstruction: { role: 'system', parts: [{ text: geminiSystemText }] } }
            : {}),
          generationConfig: {
            temperature: activeTemperature,
            topP: 0.95,
            topK: 40,
            // ✅ [v1.4.51] 빈 응답 박멸 3종 세트
            // 1) maxOutputTokens 60000 — Flash 2.5 한도(65536) 근접. 블로그 본문이 이를 초과 불가
            // 2) thinkingBudget 0 — thinking 토큰이 출력 한도 잠식 차단 (Gemini 2.5만)
            //    콘텐츠 생성엔 thinking 불필요. humanizer/optimizer 후처리로 품질 보강
            maxOutputTokens: 60000,
            ...(modelName.includes('2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          } as any,
          // ✅ [v1.4.51] 3) safetySettings BLOCK_NONE — SAFETY false positive 박멸
          // 한국어 블로그(의료/금융/법률/관계) 키워드가 기본 BLOCK_MEDIUM_AND_ABOVE에 자주 걸림
          // BLOCK_NONE으로 설정해도 Google이 강제 차단하는 최상위 콘텐츠는 여전히 막힘 → 안전
          // 4개 카테고리 모두 명시적으로 비활성화
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        };
        // ✅ [v1.4.34 FIX] URL 모드 손님 PC 호출 실패 우회
        // 기존: URL 모드(grounding OFF)는 responseMimeType: 'application/json' 활성화
        //       → 일부 손님 PC에서 SDK fetch 단계 실패 (body 형태/크기/JSON 모드 조합)
        //       → 키워드 모드(grounding ON)는 동일 손님 PC에서 정상 작동
        // 변경: URL 모드도 grounding ON으로 통일 — 키워드 모드와 동일 request 형태
        //       응답 cleaner(6571~6580)가 이미 markdown 코드블록 + { } 추출 처리하므로
        //       JSON 모드 없어도 응답 파싱 안전
        // 비용: +$0.035/글 (grounding) — 손님 사고 해결 가치가 더 큼
        if (useGrounding) {
          requestConfig.tools = [{ googleSearch: {} }];
        } else {
          // ✅ [v1.4.34] JSON 모드 제거 — 손님 PC fetch 거부 우회
          // (이전: requestConfig.generationConfig.responseMimeType = 'application/json';)
          requestConfig.tools = [{ googleSearch: {} }];
        }
        const streamPromise = model.generateContentStream(requestConfig);

        // ✅ [2026-01-28 FIX] 첫 응답 타임아웃 60초로 증가 (유료 API 안정성)
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('⏱️ 연결 타임아웃')), 60000);
        });

        console.log(`[Gemini] 🚀 ${modelName} 호출 (Search Grounding: ${useGrounding ? 'ON +$0.035' : 'OFF (비용 절감)'})`);
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

          // ✅ [2026-03-19] 사용량 추적 (스트리밍 완료 후 aggregated response에서 추출)
          // ✅ [v1.4.50] thinking 토큰 반영 — Gemini 2.5는 thoughtsTokenCount가 별도 집계됨
          //    이전: promptTokenCount + candidatesTokenCount (실측 대비 ~60% 과소 집계)
          //    수정: totalTokenCount - promptTokenCount (output + thinking 모두 포함)
          //    실측: thinking 토큰이 output의 20배까지 나와서 앱 추정이 실제의 40%밖에 안 됐음
          try {
            const aggResponse = await streamResult.response;
            const usageMeta = (aggResponse as any).usageMetadata;
            if (usageMeta) {
              const promptTokens = usageMeta.promptTokenCount || 0;
              const totalTokens = usageMeta.totalTokenCount || 0;
              // output = total - prompt (thinking/reasoning 토큰 포함)
              const effectiveOutput = totalTokens > promptTokens
                ? totalTokens - promptTokens
                : (usageMeta.candidatesTokenCount || 0);
              trackApiUsage('gemini', {
                inputTokens: promptTokens,
                outputTokens: effectiveOutput,
                model: modelName,
              });
            }
          } catch { /* usage 추출 실패는 무시 — 생성 성공이 우선 */ }

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
        // ✅ [v1.4.51] 빈 응답을 GeminiEmptyResponseError로 throw — finishReason별 대응
        let finishReason = 'UNKNOWN';
        let promptT = 0, thinkingT = 0, candT = 0;
        try {
          const aggResp = await streamResult.response;
          finishReason = aggResp?.candidates?.[0]?.finishReason || 'UNKNOWN';
          const usage = (aggResp as any).usageMetadata || {};
          promptT = usage.promptTokenCount || 0;
          const totalT = usage.totalTokenCount || 0;
          candT = usage.candidatesTokenCount || 0;
          thinkingT = Math.max(0, totalT - promptT - candT);
        } catch { /* 진단 실패는 무시 — finishReason=UNKNOWN으로 진행 */ }

        const emptyMsg = `응답 비어있음 (finishReason=${finishReason}, in=${promptT}, think=${thinkingT}, out=${candT})`;
        console.error(`[Gemini] ❌ ${emptyMsg}`);
        throw new GeminiEmptyResponseError(emptyMsg, finishReason, promptT, thinkingT, candT);

      } catch (error) {
        // ✅ [v1.4.50] Safety Lock 에러는 재시도/폴백 금지 — 즉시 상위로 전파
        if (error instanceof BudgetExceededError) throw error;

        // ✅ [v1.4.51] 빈 응답 에러 — 프롬프트 증강으로 무조건 회복
        // BLOCK_NONE + thinkingBudget 0 + 60K maxOutput으로 거의 안 뜨지만,
        // RECITATION(safetySettings 무시)이나 잔여 SAFETY는 프롬프트 증강으로 회복
        if (error instanceof GeminiEmptyResponseError) {
          lastError = error;

          // 프롬프트 증강 시도 (최대 2회 — 1회: 가드 추가, 2회: 더 강한 가드 + temp 상승)
          if (promptAugmentationCount < MAX_PROMPT_AUGMENTATIONS) {
            promptAugmentationCount++;
            // finishReason별 맞춤 가드
            let guard = '';
            if (error.finishReason === 'RECITATION') {
              guard = '\n\n[필수] 외부 문서/저작물을 그대로 옮기지 말고, 100% 새로운 표현과 문장으로 작성하세요. 인용·복사·발췌 금지.';
            } else if (error.finishReason === 'SAFETY') {
              guard = '\n\n[필수] 안전하고 일반적인 표현으로 작성하세요. 자극적·민감·논쟁적 단어를 피하고 중립적 어조를 유지하세요.';
            } else {
              // MAX_TOKENS / UNKNOWN — 분량 압축 + 가드
              guard = '\n\n[필수] 핵심만 간결하게 작성하세요. 불필요한 반복을 피하고, 요청된 분량 범위 내에서 마무리하세요.';
            }
            // 누적 증강(2회차는 더 강하게)
            if (promptAugmentationCount === 2) {
              guard += ' (재요청) 이전 응답이 비어있었습니다. 반드시 응답을 생성해주세요.';
            }
            geminiUserText = geminiUserTextOriginal + guard;
            // temperature 살짝 상승 — 동일 입력 반복 방지 (cap 1.0)
            activeTemperature = Math.min(1.0, activeTemperature + 0.1);
            console.warn(`[Gemini] 🔄 빈 응답 회복 #${promptAugmentationCount} (${error.finishReason}) → 프롬프트 증강 + temp ${activeTemperature.toFixed(2)}`);
            continue; // 같은 modelRetryCount, 다음 attempt
          }

          // 증강 2회 모두 실패 → 키 로테이션
          const nextKey = getNextKey();
          if (nextKey) {
            console.warn(`[Gemini] 🔑 빈 응답 회복 실패 → 다음 키로 재시도`);
            trimmedKey = nextKey;
            promptAugmentationCount = 0; // 새 키엔 처음부터
            geminiUserText = geminiUserTextOriginal;
            activeTemperature = temperature;
            continue;
          }
          // 모든 회복 수단 소진 → 폴백 모델로
          for (const fb of fallbackCandidates) {
            if (!modelsToTry.includes(fb)) { modelsToTry.push(fb); }
          }
          console.error(`[Gemini] ❌ ${modelName} 빈 응답 회복 불가 → 폴백 모델 전환`);
          break;
        }

        const errMsg = (error as Error).message || String(error);
        lastError = error as Error;
        const isQuota = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('Too Many Requests') || errMsg.includes('resource exhausted');
        const isLimitZero = errMsg.includes('limit: 0') || errMsg.includes('free_tier');
        const isServerError = errMsg.includes('503') || errMsg.includes('500') || errMsg.includes('internal') || errMsg.includes('unavailable') || errMsg.includes('overloaded');

        // ✅ [v1.4.44] limit:0 = 이 모델은 무료 완전 차단 → 폴백 모델 추가
        if (isQuota && isLimitZero) {
          console.error(`❌ [Gemini] ${modelName} 무료 할당량 0 → 폴백 모델로 전환`);
          if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
            (window as any).appendLog(`🚫 ${modelName} 무료 사용 불가 → 무료 모델(Flash/Flash-Lite)로 자동 전환합니다.`);
          }
          // 아직 추가하지 않은 폴백 모델이 있으면 체인에 추가
          for (const fb of fallbackCandidates) {
            if (!modelsToTry.includes(fb)) { modelsToTry.push(fb); }
          }
          break; // 이 모델 종료 → 다음 폴백 모델로
        }

        // ✅ [v1.4.49] 429 RPD 감지 — 일일 한도 소진 시 재시도 무의미
        //   GenerateRequestsPerDayPerProjectPerModel 또는 retry in N(N > 5분)이면 RPD
        const isDailyQuotaExhausted = isQuota && (
          errMsg.includes('GenerateRequestsPerDayPerProjectPerModel') ||
          errMsg.includes('PerDay') ||
          // retry in 힌트가 5분(300초) 이상이면 RPD 소진으로 판단
          (() => {
            const m = errMsg.match(/retry in ([\d.]+)s/i);
            return m ? parseFloat(m[1]) >= 300 : false;
          })()
        );
        if (isDailyQuotaExhausted) {
          console.error(`❌ [Gemini] ${modelName} 일일 무료 할당량 소진 → 재시도 무의미`);
          // 다른 키가 있으면 키 로테이션 시도
          const nextKey = getNextKey();
          if (nextKey) {
            console.log(`🔑 [Gemini] 일일 한도 소진 → 다음 키로 전환`);
            trimmedKey = nextKey;
            continue;
          }
          // 키가 없으면 즉시 명확한 에러 throw
          throw new Error(
            `[Gemini] ${modelName} 오늘 무료 할당량을 모두 사용했습니다. ` +
            `해결 방법: 1) 내일 다시 시도 ` +
            `2) Google AI Studio에서 추가 API 키 발급 후 설정에 등록 ` +
            `3) 유료 요금제(Pay-as-you-go)로 전환 (설정에서 "유료" 선택)`
          );
        }

        // ✅ [v1.4.44] 429 RPM 제한 → 키 로테이션 시도 → 지수 백오프 재시도
        if (isQuota) {
          // 다른 키가 있으면 먼저 키 교체 시도 (대기 없이 즉시)
          const nextKey = getNextKey();
          if (nextKey) {
            console.log(`🔑 [Gemini] 키 로테이션: ${trimmedKey.substring(0, 10)}... → ${nextKey.substring(0, 10)}...`);
            trimmedKey = nextKey;
            continue; // 대기 없이 즉시 재시도
          }

          modelRetryCount++;
          // Google이 알려주는 대기 시간 사용, 없으면 지수 백오프
          let waitMs = Math.min(15000 * Math.pow(1.5, modelRetryCount - 1), 60000);
          const retryMatch = errMsg.match(/retry in ([\d.]+)(s|ms)/i);
          if (retryMatch) {
            const val = parseFloat(retryMatch[1]);
            const unit = retryMatch[2].toLowerCase();
            waitMs = (unit === 's' ? val * 1000 : val) + 1000;
          }
          const waitSec = Math.round(waitMs / 1000);

          if (modelRetryCount < perModelMaxRetries) {
            const logMsg = `구글 서버가 바쁘네요. ${waitSec}초 후 재시도합니다. (${modelRetryCount}/${perModelMaxRetries})`;
            console.warn(`⏳ [Gemini] ${logMsg}`);
            if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
              (window as any).appendLog(`⏳ ${logMsg}`);
            }
            await new Promise(resolve => setTimeout(resolve, waitMs));
            // 키 인덱스 리셋 (로테이션 재시작)
            currentKeyIdx = 0; trimmedKey = allApiKeys[0];
            continue;
          }
          break; // 모든 재시도 소진
        }

        // ✅ [v1.4.49] 503/500 서버 에러 → 지수 백오프 + 더 오래 재시도 (최대 6회 = 약 2분)
        //   503은 일반적으로 수십 초 내 회복. 중간에 포기하면 사용자 경험 악화
        //   perModelMaxRetries(4회) 대신 serverErrorMaxRetries(6회) 별도 운용
        if (isServerError) {
          modelRetryCount++;
          const serverErrorMaxRetries = 6;
          if (modelRetryCount < serverErrorMaxRetries) {
            // 지수 백오프: 3초 → 6초 → 12초 → 24초 → 45초 → 60초 (cap)
            const baseMs = 3000;
            const expMs = Math.min(baseMs * Math.pow(2, modelRetryCount - 1), 60000);
            const jitterMs = Math.floor(Math.random() * 1000); // 0~1초 지터
            const waitMs = expMs + jitterMs;
            console.warn(`🔧 [Gemini] ${modelName} 503 서버 에러 → ${Math.round(waitMs/1000)}초 후 재시도 (${modelRetryCount}/${serverErrorMaxRetries})`);
            if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
              (window as any).appendLog(`🔧 구글 서버 일시 장애. ${Math.round(waitMs/1000)}초 후 재시도합니다. (${modelRetryCount}/${serverErrorMaxRetries})`);
            }
            await new Promise(resolve => setTimeout(resolve, waitMs));
            continue;
          }
          break;
        }

        // 404 모델 없음 → 폴백 모델 추가
        if (errMsg.includes('404') || errMsg.includes('not found')) {
          console.warn(`[Gemini] ${modelName} 모델 없음 → 폴백 모델 전환`);
          for (const fb of fallbackCandidates) {
            if (!modelsToTry.includes(fb)) { modelsToTry.push(fb); }
          }
          break;
        }

        // 기타 오류 → 재시도 1회 후 실패
        modelRetryCount++;
        if (modelRetryCount < 2) {
          console.warn(`[Gemini] ${modelName} 오류: ${errMsg.substring(0, 100)} → 5초 후 재시도`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        console.warn(`[Gemini] ${modelName} 오류: ${errMsg.substring(0, 100)}`);
        break;
      }
    }
  }

  const finalError = lastError || new Error('모든 모델 시도 실패');
  throw new Error(translateGeminiError(finalError.message));
}

// ✅ [2026-02-20] Gemini API 에러 → 사용자 친화적 한국어 변환
// ✅ [v1.4.33] 모든 분기에 풀 에러 첨부 + 잘림 제거 — 진단을 위해
//    손님이 화면 캡처 1장만 보내면 사장님이 즉시 원인 파악 가능
function translateGeminiError(rawMessage: string): string {
  const msg = rawMessage.toLowerCase();
  const detail = `\n📋 상세: ${rawMessage}`;
  const captureGuide = `\n📸 이 화면을 캡처해서 사장님께 보내주시면 즉시 해결됩니다.`;

  // API 키 만료/무효
  if (msg.includes('api key expired') || msg.includes('api_key_invalid') || msg.includes('api key not valid')) {
    return '🔑 Gemini API키가 만료됨! Google AI Studio에서 새 키를 발급받으세요.' + detail;
  }

  // 할당량 초과 (429) — limit:0 (무료 완전 차단) vs 일반 RPM 제한 구분
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('resource exhausted')) {
    if (msg.includes('limit: 0') || msg.includes('free_tier')) {
      return '🚫 이 모델은 Google이 무료 사용을 차단했습니다!\n' +
        '👉 해결: 모델을 Flash 또는 Flash-Lite로 변경하세요 (무료, 성능 충분).\n' +
        '💡 참고: 유료 전환(Pay-as-you-go) 시 Flash/Flash-Lite 무료 할당량도 사라지므로 주의!' + detail;
    }
    return '⚡ Gemini 요청 제한(RPM) 초과! 1~2분 후 자동 해제됩니다. 계속 발생하면 Google AI Studio → 요금제에서 분당 요청 한도를 확인하세요.' + detail;
  }

  // 인증 실패 (401/403)
  if (msg.includes('401') || msg.includes('403') || msg.includes('permission') || msg.includes('forbidden')) {
    return '🔒 Gemini API 인증 실패! API키가 올바른지 확인하세요.' + detail;
  }

  // 서버 오류 (500/503)
  if (msg.includes('500') || msg.includes('503') || msg.includes('internal') || msg.includes('unavailable') || msg.includes('overloaded')) {
    return '🔧 Gemini 서버 일시 장애! 잠시 후 다시 시도하세요.' + detail;
  }

  // 타임아웃
  if (msg.includes('timeout') || msg.includes('시간 초과') || msg.includes('타임아웃')) {
    return '⏱️ Gemini 응답 시간 초과! 네트워크 상태를 확인하고 다시 시도하세요.' + detail;
  }

  // 모델 없음 (404)
  if (msg.includes('404') || msg.includes('not found') || msg.includes('모델')) {
    return '❌ Gemini 모델을 찾을 수 없음! 지원되는 모델인지 확인하세요.' + detail;
  }

  // 콘텐츠 차단
  if (msg.includes('blocked') || msg.includes('safety') || msg.includes('content policy')) {
    return '🚫 Gemini 콘텐츠 정책 위반으로 차단됨! 프롬프트를 수정하세요.' + detail;
  }

  // 네트워크 연결 실패 (fetch 자체 실패)
  if (msg.includes('fetch failed') || msg.includes('error fetching') ||
      msg.includes('econnreset') || msg.includes('econnrefused') ||
      msg.includes('enotfound') || msg.includes('eai_') ||
      msg.includes('getaddrinfo') || msg.includes('network') ||
      msg.includes('ssl') || msg.includes('certificate') || msg.includes('handshake')) {
    return '🌐 네트워크 연결 실패! 인터넷 연결, 백신/방화벽, 회사 프록시 설정을 확인하세요.' + detail + captureGuide;
  }

  // API키 미설정
  if (msg.includes('api 키가 설정되지') || msg.includes('api key')) {
    return '⚙️ Gemini API키가 설정되지 않았습니다! 환경설정에서 API키를 입력하세요.' + detail;
  }

  // 그 외 — 원본 메시지를 잘리지 않고 풀 출력 + 캡처 안내
  return `Gemini 오류 (분류 안 됨): ${rawMessage}` + captureGuide;
}

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






// ✅ [2026-02-22 FIX] Perplexity API 직접 호출 (이중 프롬프트 래핑 버그 수정)
// 기존 문제: generatePerplexityContent() → buildEnhancedPrompt()가 이미 완성된 시스템 프롬프트를
// "주제"로 다시 감싸는 이중 래핑 → Perplexity가 자유형식 텍스트 반환 → JSON 파싱 실패
// 수정: callGemini/callOpenAI와 동일하게 프롬프트를 직접 API에 전달
async function callPerplexity(prompt: string, temperature: number = 0.7, minChars: number = 2000): Promise<string> {
  console.log('[Perplexity] 콘텐츠 생성 시작 (직접 API 호출)');

  // 1. API 키 로드 (config 우선, env 폴백)
  let apiKey: string | undefined;
  try {
    const { loadConfig } = await import('./configManager.js');
    const config = await loadConfig();
    // ✅ [2026-03-30 DEBUG] API 키 로드 상태 진단 로그
    console.log('[Perplexity] Config 로드 결과:', {
      hasConfig: !!config,
      configKeys: config ? Object.keys(config).filter(k => k.toLowerCase().includes('perplexity')) : [],
      perplexityApiKey: config?.perplexityApiKey ? `${config.perplexityApiKey.substring(0, 8)}...` : '(없음)',
      envKey: process.env.PERPLEXITY_API_KEY ? `${process.env.PERPLEXITY_API_KEY.substring(0, 8)}...` : '(없음)',
    });
    apiKey = config?.perplexityApiKey?.trim() || process.env.PERPLEXITY_API_KEY;
  } catch (e) {
    console.warn('[Perplexity] Config 로드 실패 (env 폴백 사용):', e);
    apiKey = process.env.PERPLEXITY_API_KEY;
  }

  if (!apiKey) {
    console.error('[Perplexity] ❌ API 키를 찾을 수 없습니다. config와 env 모두 비어있음.');
    throw new Error('Perplexity API 키가 설정되지 않았습니다. 환경설정(⚙️)에서 Perplexity API 키를 입력해주세요. (Perplexity 웹 구독과 API 키는 별도입니다. https://www.perplexity.ai/settings/api 에서 API 키를 발급받으세요)');
  }
  console.log(`[Perplexity] ✅ API 키 확인됨: ${apiKey.substring(0, 8)}... (길이: ${apiKey.length})`);


  // 2. 모델 및 타임아웃 설정
  // ✅ [2026-03-20 FIX] config에서 직접 읽기 (env보다 config 우선 — 이중 안전장치)
  let modelName = 'sonar';
  try {
    const { loadConfig } = await import('./configManager.js');
    const cfg = await loadConfig();
    modelName = cfg.perplexityModel || process.env.PERPLEXITY_MODEL || 'sonar';
  } catch {
    modelName = process.env.PERPLEXITY_MODEL || 'sonar';
  }
  const timeoutMs = getTimeoutMs(minChars);
  const maxRetries = 2;
  let lastError: Error | null = null;

  // ✅ [2026-03-16] promptSplitter 모듈로 system/user 분리 (인라인 50줄 코드 제거)
  // 키워드/원문 모드 자동 판별은 adjustForPerplexity()에서 처리
  const baseSplit = splitPromptByMarker(prompt);
  const { system: systemMessage, user: userMessage } = adjustForPerplexity(baseSplit);

  console.log(`[Perplexity] 메시지 분리: system=${systemMessage.length}자, user=${userMessage.length}자`);

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      console.log(`[Perplexity] 시도 ${retry + 1}/${maxRetries}: 모델 ${modelName}, 타임아웃 ${timeoutMs / 1000}초`);

      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({
        apiKey: apiKey.trim(),
        baseURL: 'https://api.perplexity.ai',
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Perplexity API 호출 시간 초과 (${timeoutMs / 1000}초)`)), timeoutMs);
      });

      // ✅ [2026-02-23 FIX] system + user 메시지 분리로 Perplexity 거부 방지
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ];

      const createPromise = client.chat.completions.create({
        model: modelName,
        messages: messages,
        temperature: temperature,
        max_tokens: 16000,
        // ✅ Perplexity 전용 옵션: 최신 정보 검색
        ...(modelName.includes('sonar') ? {
          search_recency_filter: 'month',  // 최근 1개월 정보 우선
        } : {}),
      } as any);

      const response = await Promise.race([createPromise, timeoutPromise]);
      const text = response.choices[0]?.message?.content?.trim() || '';

      if (!text) {
        throw new Error('Perplexity API 빈 응답');
      }

      // ✅ [2026-03-19] 사용량 추적
      const pplxUsage = (response as any).usage;
      trackApiUsage('perplexity', {
        inputTokens: pplxUsage?.prompt_tokens || 0,
        outputTokens: pplxUsage?.completion_tokens || 0,
        model: modelName,
      });

      console.log(`[Perplexity] ✅ 생성 완료: ${modelName} (시도 ${retry + 1}), ${text.length}자`);
      return text;

    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message?.toLowerCase() || '';

      console.error(`[Perplexity] ⚠️ 시도 ${retry + 1} 실패: ${lastError.message}`);

      // API 키 오류는 즉시 중단
      if (errorMessage.includes('api key') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
        throw new Error(translatePerplexityError(lastError));
      }

      // 재시도 대기
      if (retry < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, retry), 5000);
        console.log(`[Perplexity] 🔄 ${delay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Perplexity 생성 실패: ${lastError ? translatePerplexityError(lastError) : '원인 불명'}`);
}

// ✅ [2026-01-25] callOpenAI 함수 - 기존 OpenAI API 호출 로직
async function callOpenAI(prompt: string, temperature: number = 0.9, minChars: number = 2000): Promise<string> {
  console.log('[OpenAI] JSON 형식 준수 요청 - 유니코드 이스케이프 4자리, 쉼표 필수');

  // ✅ [2026-02-24 FIX] 방어적 설정 로드 (callGemini/callPerplexity 패턴 통일)
  let config: any = null;
  try {
    const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
    config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.warn('[OpenAI] Config 로드 실패 (env 폴백 사용):', e);
  }

  const openAIClients = new Map<string, OpenAI>();
  function getOpenAIClient(apiKey?: string): OpenAI {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY가 설정되어 있지 않습니다. 환경설정에서 OpenAI API 키를 입력해주세요.');
    }
    if (!openAIClients.has(key)) {
      openAIClients.set(key, new OpenAI({ apiKey: key }));
    }
    return openAIClients.get(key)!;
  }

  // ✅ [2026-03-23 FIX] config에서 직접 API 키를 가져와 전달 (process.env 폴백)
  // applyConfigToEnv가 빈 문자열일 때 delete process.env.OPENAI_API_KEY 하므로
  // config.openaiApiKey가 있으면 직접 전달해야 확실히 로드됨
  const configApiKey = config?.openaiApiKey?.trim() || undefined;
  if (configApiKey) {
    console.log(`[OpenAI] ✅ config에서 직접 API 키 로드됨 (길이: ${configApiKey.length})`);
  } else {
    console.log(`[OpenAI] config.openaiApiKey 없음, process.env.OPENAI_API_KEY 폴백 (${process.env.OPENAI_API_KEY ? '있음' : '없음'})`);
  }
  const client = getOpenAIClient(configApiKey);

  // ✅ [v1.4.44] 사용자 선택 모델 강제 — 다른 모델로 자동 폴백 제거
  const uiSelectedModel = config?.primaryGeminiTextModel || '';
  let openAIModels: string[];
  if (uiSelectedModel === 'openai-gpt4o-mini') {
    openAIModels = ['gpt-5.4-mini'];
    console.log('[OpenAI] 🧠 가성비 모드: gpt-5.4-mini — 폴백 없음');
  } else if (uiSelectedModel === 'openai-gpt41') {
    openAIModels = ['gpt-5.4'];
    console.log('[OpenAI] ⚖️ 균형 모드: gpt-5.4 — 폴백 없음');
  } else {
    openAIModels = ['gpt-5.4'];
    console.log('[OpenAI] 🚀 기본 모드: gpt-5.4');
  }

  const customModel = process.env.OPENAI_STRUCTURED_MODEL;
  const modelsToTry = customModel ? [customModel] : openAIModels;

  let lastError: Error | null = null;
  const timeoutMs = getTimeoutMs(minChars);
  const maxRetriesPerModel = 3; // ✅ [v1.4.44] 1 → 3 (단일 모델 재시도 강화, 폴백 제거)

  for (const modelName of modelsToTry) {
    for (let retry = 0; retry < maxRetriesPerModel; retry++) {
      try {
        console.log(`[OpenAI] 시도: ${modelName} (${retry + 1}/${maxRetriesPerModel}), 타임아웃: ${timeoutMs / 1000}초`);

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`OpenAI API 호출 시간 초과 (${timeoutMs / 1000}초)`)), timeoutMs);
        });

        // ✅ [2026-03-16] system/user 분리: AI 규칙 인식률 향상
        const { system: oaiSystem, user: oaiUser } = splitPromptByMarker(prompt);

        const createPromise = client.chat.completions.create({
          model: modelName,
          messages: [
            ...(oaiSystem ? [{ role: 'system' as const, content: oaiSystem }] : []),
            { role: 'user' as const, content: oaiUser },
          ],
          temperature: temperature,
          top_p: 0.9,
          max_completion_tokens: 16000,
          response_format: { type: 'json_object' },  // ✅ [2026-03-23] JSON 출력 보장
        } as any);

        const response = await Promise.race([createPromise, timeoutPromise]);
        const text = response.choices[0]?.message?.content?.trim() || '';

        if (!text) throw new Error('빈 응답');

        // ✅ [2026-03-19] 사용량 추적
        const oaiUsage = (response as any).usage;
        trackApiUsage('openai', {
          inputTokens: oaiUsage?.prompt_tokens || 0,
          outputTokens: oaiUsage?.completion_tokens || 0,
          model: modelName,
        });

        console.log(`[OpenAI] ✅ 성공: ${modelName}, ${text.length}자`);
        console.log(`[OpenAI] 📋 응답 미리보기: ${text.substring(0, 200)}...`);
        return text;

      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error).message?.toLowerCase() || '';
        const errorStr = JSON.stringify(error).toLowerCase();

        // ✅ [2026-02-24 FIX] 에러 분류: 즉시 실패 vs 재시도 가능 vs 다음 모델

        // 1) 인증 오류 → 즉시 throw (재시도 무의미)
        const isAuthError = errorMessage.includes('401') || errorMessage.includes('403') ||
          errorMessage.includes('unauthorized') || errorMessage.includes('forbidden') ||
          errorMessage.includes('invalid api key') || errorMessage.includes('invalid_api_key');
        if (isAuthError) {
          throw new Error(`OpenAI API 키가 유효하지 않습니다. 환경설정에서 API 키를 확인해주세요.\n원본 오류: ${(error as Error).message}`);
        }

        // 2) 결제/크레딧 오류 → 진짜 billing hard limit만 즉시 throw
        // ✅ [2026-04-09 FIX] 429 rate limit의 'quota' 키워드를 billing으로 오판하던 버그 수정
        // OpenAI 429 에러: "You exceeded your current quota" → 일시적 rate limit일 수 있음
        // 진짜 billing 에러: billing_hard_limit_reached, insufficient_quota (영구적)
        const isHardBillingError = errorStr.includes('billing_hard_limit_reached') ||
          errorMessage.includes('insufficient_quota') ||
          (errorMessage.includes('billing') && !errorMessage.includes('429')) ||
          (errorMessage.includes('payment') && errorMessage.includes('required'));
        if (isHardBillingError) {
          throw new Error(`OpenAI API 결제 한도에 도달했습니다. OpenAI 대시보드에서 결제 정보를 확인해주세요.\n원본 오류: ${(error as Error).message}`);
        }

        // 3) 모델 없음 → 다음 모델로 즉시 이동 (재시도 불필요)
        const isModelNotFound = errorMessage.includes('model') &&
          (errorMessage.includes('not found') || errorMessage.includes('does not exist'));
        if (isModelNotFound) {
          console.log(`[OpenAI] ⚠️ 모델 ${modelName} 없음, 다음 모델 시도`);
          break; // 이 모델의 재시도 루프 탈출 → 다음 모델
        }

        // 4) 429/quota/rate-limit → 다음 모델 폴백 (재시도보다 빠른 모델 전환 우선)
        // ✅ [2026-04-09 FIX] 429 quota를 다른 모델로 즉시 폴백하여 빠른 복구
        const isQuotaOrRateLimit = errorMessage.includes('429') || errorMessage.includes('rate limit') ||
          errorMessage.includes('too many requests') || errorMessage.includes('quota');
        if (isQuotaOrRateLimit) {
          console.log(`[OpenAI] ⚠️ ${modelName} 할당량/속도 제한, 다음 모델로 즉시 전환: ${(error as Error).message}`);
          break; // 같은 모델 재시도 대신 다음 모델로 빠른 폴백
        }

        // 5) 서버/네트워크 에러 → 대기 후 재시도
        const isRetryable =
          errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503') ||
          errorMessage.includes('server error') || errorMessage.includes('internal error') ||
          errorMessage.includes('시간 초과') || errorMessage.includes('timeout') ||
          errorMessage.includes('빈 응답') || errorMessage.includes('empty') ||
          errorMessage.includes('network') || errorMessage.includes('fetch') ||
          errorMessage.includes('econnreset') || errorMessage.includes('econnrefused');

        if (isRetryable) {
          console.log(`[OpenAI] ⚠️ ${modelName} 재시도 가능 에러 (${retry + 1}/${maxRetriesPerModel}): ${(error as Error).message}`);
          if (retry < maxRetriesPerModel - 1) {
            const delay = Math.min(1000 * Math.pow(2, retry), 5000);
            console.log(`[OpenAI] 🔄 ${delay}ms 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // 같은 모델 재시도
          }
          // 재시도 소진 → 다음 모델로
          console.log(`[OpenAI] ⚠️ ${modelName} 재시도 소진, 다음 모델 시도`);
          break;
        }

        // 5) 알 수 없는 에러 → 다음 모델로 이동 (이전: 즉시 throw)
        console.log(`[OpenAI] ⚠️ ${modelName} 알 수 없는 오류, 다음 모델 시도: ${(error as Error).message}`);
        break;
      }
    }
  }

  throw new Error(`OpenAI 모델 사용 불가. 시도한 모델: ${modelsToTry.join(', ')}\n마지막 오류: ${lastError?.message}`);
}


// ✅ [2026-01-25] getAnthropicClient 헬퍼 함수 복원
const anthropicClients = new Map<string, Anthropic>();
function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.CLAUDE_API_KEY;
  if (!key) {
    throw new Error('CLAUDE_API_KEY가 설정되어 있지 않습니다. 환경설정에서 Claude API 키를 입력해주세요.');
  }
  if (!anthropicClients.has(key)) {
    anthropicClients.set(key, new Anthropic({ apiKey: key }));
  }
  return anthropicClients.get(key)!;
}


async function callClaude(prompt: string, temperature: number = 0.9, minChars: number = 2000): Promise<string> {
  console.log('[Claude] JSON 형식 준수 요청 - 유니코드 이스케이프 4자리, 쉼표 필수');

  // ✅ [2026-02-24 FIX] 방어적 설정 로드 (callGemini/callPerplexity 패턴 통일)
  let config: any = null;
  try {
    const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
    config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.warn('[Claude] Config 로드 실패 (env 폴백 사용):', e);
  }

  const timeoutMs = getTimeoutMs(minChars);
  console.log(`[Claude] 시작: 목표 ${minChars}자, 타임아웃 ${timeoutMs / 1000}초`);

  // ✅ [2026-03-23 FIX] config에서 직접 API 키를 가져와 전달 (process.env 폴백)
  // callOpenAI와 동일한 패턴: applyConfigToEnv가 빈 문자열일 때 delete하므로 직접 전달 필요
  const configClaudeKey = config?.claudeApiKey?.trim() || undefined;
  if (configClaudeKey) {
    console.log(`[Claude] ✅ config에서 직접 API 키 로드됨 (길이: ${configClaudeKey.length})`);
  } else {
    console.log(`[Claude] config.claudeApiKey 없음, process.env.CLAUDE_API_KEY 폴백 (${process.env.CLAUDE_API_KEY ? '있음' : '없음'})`);
  }
  const client = getAnthropicClient(configClaudeKey);

  // ✅ [v1.4.44] 사용자 선택 모델 강제 — 다른 모델로 자동 폴백 제거
  // Haiku 선택 시 Sonnet으로 폴백되면 비용이 3~5배 증가하는 문제 해결
  const uiSelectedModel = config?.primaryGeminiTextModel || '';
  let claudeModels: string[];
  if (uiSelectedModel === 'claude-haiku') {
    claudeModels = ['claude-haiku-4-5-20251001'];
    console.log('[Claude] 💜 UI 선택: Claude Haiku 4.5 (가성비 모드) — 폴백 없음');
  } else if (uiSelectedModel === 'claude-sonnet') {
    claudeModels = ['claude-sonnet-4-6'];
    console.log('[Claude] 📜 UI 선택: Claude Sonnet 4.6 (균형 모드) — 폴백 없음');
  } else if (uiSelectedModel === 'claude-opus') {
    claudeModels = ['claude-opus-4-6'];
    console.log('[Claude] 👑 UI 선택: Claude Opus 4.6 (최고 성능 모드) — 폴백 없음');
  } else {
    // 기본 (claude provider로 왔지만 specific 모델 미지정)
    claudeModels = ['claude-sonnet-4-6'];
    console.log('[Claude] ✨ 기본 모드: Claude Sonnet 4.6');
  }

  // 환경 변수로 지정된 모델이 있으면 대체
  const customModel = process.env.CLAUDE_STRUCTURED_MODEL;
  const modelsToTry = customModel ? [customModel] : claudeModels;

  let lastError: Error | null = null;
  const maxRetriesPerModel = 4; // ✅ [v1.4.44] 2 → 4 (단일 모델 재시도 강화, 폴백 제거)

  // 각 모델을 순차적으로 시도
  for (const modelName of modelsToTry) {
    for (let retry = 0; retry < maxRetriesPerModel; retry++) {
      try {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[Claude] 콘텐츠 생성 시작`);
        console.log(`  • 모델: ${modelName} (${retry + 1}/${maxRetriesPerModel})`);
        console.log(`  • 목표 분량: ${minChars}자`);
        console.log(`  • 타임아웃: ${timeoutMs / 1000}초`);
        console.log(`  • Temperature: ${temperature}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        const startTime = Date.now();

        // 타임아웃 설정 (동적 조정)
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Claude API 호출 시간 초과 (${timeoutMs / 1000}초)`));
          }, timeoutMs);
        });

        // ✅ [2026-03-16] promptSplitter 모듈로 system/user 분리 (인라인 코드 제거)
        // Anthropic API는 system을 top-level 파라미터로 받음
        const { system: claudeSystem, user: claudeUser } = splitPromptByMarker(prompt);
        
        const createPromise = client.messages.create({
          model: modelName,
          max_tokens: 16000,
          temperature: temperature,
          ...(claudeSystem ? { system: claudeSystem } : {}),
          messages: [{ role: 'user', content: claudeUser }],
        });

        const response = await Promise.race([createPromise, timeoutPromise]);

        const responseTime = Date.now() - startTime;
        console.log(`[Claude] API 응답 수신: ${responseTime}ms`);

        // 텍스트 추출
        let text = response.content
          .map((block) => ('text' in block ? block.text : ''))
          .join('');

        // ✅ UTF-8 인코딩 문제 해결 (한글 깨짐 방지)
        const hasKorean = /[가-힣]/.test(text);
        const hasReplacementChar = text.includes('\ufffd') || text.includes('�');

        if (!hasKorean || hasReplacementChar) {
          console.log('[Claude] 한글 인코딩 문제 감지, 복구 시도...');
          text = fixUtf8Encoding(text);
        }

        console.log('[Claude] 응답 길이:', text.length, '자');

        if (!text.trim()) {
          throw new Error('Claude 응답이 비어 있습니다.');
        }

        // ✅ [2026-03-19] 사용량 추적
        const claudeUsage = (response as any).usage;
        trackApiUsage('claude', {
          inputTokens: claudeUsage?.input_tokens || 0,
          outputTokens: claudeUsage?.output_tokens || 0,
          model: modelName,
        });

        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`✅ [Claude] 생성 완료: ${text.length}자, ${elapsed.toFixed(1)}초`);
        return text;

      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error).message?.toLowerCase() || '';
        const errorStr = JSON.stringify(error).toLowerCase();

        // ✅ [2026-02-24 FIX] 에러 분류: 즉시 실패 vs 재시도 가능 vs 다음 모델

        // 1) 인증 오류 → 즉시 throw (재시도 무의미)
        const isAuthError = errorMessage.includes('401') || errorMessage.includes('403') ||
          errorMessage.includes('unauthorized') || errorMessage.includes('forbidden') ||
          errorMessage.includes('invalid api key') || errorMessage.includes('invalid_api_key') ||
          errorMessage.includes('authentication');
        if (isAuthError) {
          throw new Error(`Claude API 키가 유효하지 않습니다. 환경설정에서 API 키를 확인해주세요.\n원본 오류: ${(error as Error).message}`);
        }

        // 2) 크레딧 부족 오류 → 즉시 throw
        const isCreditError = errorMessage.includes('credit') ||
          errorMessage.includes('balance') || errorMessage.includes('too low') ||
          errorStr.includes('credit');
        if (isCreditError) {
          throw new Error(
            `Claude API 크레딧이 부족합니다. Anthropic Console에서 크레딧을 충전해주세요.\n` +
            `원본 오류: ${(error as Error).message}`
          );
        }

        // 3) 모델 없음 → 다음 모델로 즉시 이동 (재시도 불필요)
        // ✅ FIX: 이전에는 errorMessage.includes('model')만으로 매칭 → 너무 광범위
        const isModelNotFound = (errorMessage.includes('not_found') && errorMessage.includes('model')) ||
          (errorMessage.includes('404') && (errorMessage.includes('model') || errorStr.includes('not_found'))) ||
          errorMessage.includes('does not exist');
        if (isModelNotFound) {
          console.log(`[Claude] ⚠️ 모델 ${modelName} 없음, 다음 모델 시도`);
          break; // 이 모델의 재시도 루프 탈출 → 다음 모델
        }

        // 4) 재시도 가능한 에러 → 대기 후 재시도 (같은 모델 또는 다음 모델)
        const isRetryable = errorMessage.includes('429') || errorMessage.includes('rate limit') ||
          errorMessage.includes('too many requests') || errorMessage.includes('overloaded') ||
          errorMessage.includes('529') || // Anthropic overloaded
          errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503') ||
          errorMessage.includes('server error') || errorMessage.includes('internal error') ||
          errorMessage.includes('시간 초과') || errorMessage.includes('timeout') ||
          errorMessage.includes('비어 있습니다') || errorMessage.includes('empty') ||
          errorMessage.includes('network') || errorMessage.includes('fetch') ||
          errorMessage.includes('econnreset') || errorMessage.includes('econnrefused');

        if (isRetryable) {
          console.log(`[Claude] ⚠️ ${modelName} 재시도 가능 에러 (${retry + 1}/${maxRetriesPerModel}): ${(error as Error).message}`);
          if (retry < maxRetriesPerModel - 1) {
            const delay = Math.min(1000 * Math.pow(2, retry), 5000);
            console.log(`[Claude] 🔄 ${delay}ms 후 재시도...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // 같은 모델 재시도
          }
          // 재시도 소진 → 다음 모델로
          console.log(`[Claude] ⚠️ ${modelName} 재시도 소진, 다음 모델 시도`);
          break;
        }

        // 5) 알 수 없는 에러 → 다음 모델로 이동 (이전: 즉시 throw)
        console.log(`[Claude] ⚠️ ${modelName} 알 수 없는 오류, 다음 모델 시도: ${(error as Error).message}`);
        break;
      }
    }
  }

  // 모든 모델 시도 실패
  throw new Error(
    `Claude 모델을 사용할 수 없습니다. 시도한 모델: ${modelsToTry.join(', ')}\n` +
    `마지막 오류: ${lastError?.message || '알 수 없는 오류'}`
  );
}

/**
 * ✅ [2026-02-08] Gemini Google Search Grounding 기반 웹 리서치
 * - 네이버 API/RSS 소스 수집 실패 시 Google 검색을 통해 정보 수집
 * - 공식 사이트, 전문 블로그, 뉴스 등에서 신뢰성 높은 정보 직접 리서치
 * - 키워드에 대한 전문적/체계적 콘텐츠를 생성 소스로 반환
 */
/**
 * ✅ [2026-02-08] Perplexity Sonar 실시간 웹 검색 기반 리서치
 * - 네이버 API/RSS 소스 수집 실패 시 Perplexity의 실시간 웹 검색으로 정보 수집
 * - Sonar 모델은 검색 + 생성이 통합되어 있어 리서치에 최적
 * - Gemini Grounding보다 먼저 시도 (더 빠르고 가벼움)
 */
/**
 * ✅ [2026-02-08] Gemini Grounding 기반 공식 사이트 URL 검색
 * - 글 내용/키워드를 분석하여 관련 공식 사이트 URL을 동적으로 검색
 * - HTTP HEAD 요청으로 URL 유효성 검증 (404/에러 페이지 차단)
 * - 행동 유발 카테고리 (비즈니스, 티켓, 여행 등)에서 활용
 */
export async function findRelevantOfficialSite(
  keyword: string,
  category?: string,
  bodySnippet?: string
): Promise<{
  url: string;
  siteName: string;
  description: string;
  success: boolean;
}> {
  console.log(`\n🔗 [공식사이트 검색] 키워드: "${keyword}", 카테고리: "${category || '미지정'}"`);
  const emptyResult = { url: '', siteName: '', description: '', success: false };

  try {
    // API 키 로드
    let apiKey: string | undefined;
    try {
      const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
      const config = await loadConfig();
      applyConfigToEnv(config);
      apiKey = config?.geminiApiKey?.trim() || process.env.GEMINI_API_KEY;
    } catch (e) {
      apiKey = process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
      console.log('[공식사이트 검색] ⚠️ Gemini API 키 없음');
      return emptyResult;
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(apiKey.trim());

    // 키워드 컨텍스트 활용
    const contextInfo = bodySnippet
      ? `\n글 내용 요약: "${bodySnippet.substring(0, 300)}"`
      : '';

    const searchPrompt = `
아래 키워드/주제에 대해 Google 검색을 통해 일반 사용자들이 실제로 방문하는 가장 대표적인 공식 사이트 URL을 1개만 찾아주세요.

키워드: "${keyword}"
카테고리: "${category || '일반'}"${contextInfo}

[중요 조건]
1. 반드시 실제 존재하는, 접속 가능한 URL만 제공
2. 공공기관, 정부 사이트, 공식 브랜드 사이트, 대형 서비스 사이트 우선
3. 에러 페이지, 없는 페이지, 리다이렉트만 되는 페이지 절대 금지
4. 네이버 블로그, 개인 블로그, 광고성 페이지 절대 금지
5. 사용자가 해당 주제에 대해 실제로 "여기를 방문해야겠다"고 느낄 사이트

[예시]
- "청년 지원금" → https://www.youthcenter.go.kr (온라인청년센터)
- "인터파크 티켓" → https://tickets.interpark.com (인터파크 티켓)
- "여권 발급" → https://www.passport.go.kr (여권 안내)
- "건강검진 예약" → https://www.nhis.or.kr (국민건강보험공단)
- "KTX 예매" → https://www.letskorail.com (한국철도공사)

[출력 형식 - 반드시 아래 형식으로만 응답]
URL: (실제 URL)
사이트명: (사이트 이름)
설명: (한 줄 설명)
`.trim();

    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      // @ts-ignore
      tools: [{ googleSearch: {} }],
    });

    const result = await Promise.race([
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
        generationConfig: {
          temperature: 0.1, // 정확도 최우선
          maxOutputTokens: 500,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('공식사이트 검색 타임아웃 (30초)')), 30000)
      ),
    ]);

    const text = result.response.text().trim();
    if (!text) {
      console.log('[공식사이트 검색] ⚠️ 빈 응답');
      return emptyResult;
    }

    // URL 추출
    const urlMatch = text.match(/URL:\s*(https?:\/\/[^\s\n]+)/i);
    const siteNameMatch = text.match(/사이트명:\s*(.+)/);
    const descMatch = text.match(/설명:\s*(.+)/);

    if (!urlMatch || !urlMatch[1]) {
      // 텍스트에서 URL 직접 추출 시도
      const fallbackUrl = text.match(/(https?:\/\/[^\s\n\)]+)/);
      if (!fallbackUrl) {
        console.log('[공식사이트 검색] ⚠️ URL을 추출할 수 없음');
        return emptyResult;
      }
      // URL만 추출된 경우
      const rawUrl = fallbackUrl[1].replace(/[.,;:!?]$/, '');
      const validated = await validateUrl(rawUrl);
      if (!validated) return emptyResult;
      return { url: rawUrl, siteName: keyword, description: '', success: true };
    }

    const rawUrl = urlMatch[1].replace(/[.,;:!?]$/, '');
    const siteName = siteNameMatch?.[1]?.trim() || keyword;
    const description = descMatch?.[1]?.trim() || '';

    // ✅ URL 유효성 검증 (HTTP HEAD)
    const isValid = await validateUrl(rawUrl);
    if (!isValid) {
      console.log(`[공식사이트 검색] ❌ URL 검증 실패: ${rawUrl}`);
      return emptyResult;
    }

    console.log(`✅ [공식사이트 검색] 검증 완료: ${siteName} (${rawUrl})`);
    return { url: rawUrl, siteName, description, success: true };

  } catch (error) {
    console.warn(`[공식사이트 검색] ⚠️ 실패: ${(error as Error).message}`);
    return emptyResult;
  }
}

/**
 * URL 유효성 검증: HTTP HEAD 요청으로 200 응답인지 확인
 * 에러 페이지, 404, 리다이렉트 루프 등 차단
 */
async function validateUrl(url: string): Promise<boolean> {
  try {
    console.log(`   🔍 URL 검증 중: ${url}`);

    // 기본 형식 검증
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // 블랙리스트: 블로그, 광고, 검색 페이지 차단
    const blacklist = [
      'blog.naver.com', 'tistory.com', 'brunch.co.kr',
      'google.com/search', 'search.naver.com',
      'ad.', 'ads.', 'click.', 'redirect.',
      'bit.ly', 'goo.gl', 'tinyurl.com', // 단축 URL 차단
    ];
    if (blacklist.some(bl => url.includes(bl))) {
      console.log(`   ❌ 블랙리스트 URL: ${url}`);
      return false;
    }

    // ✅ [2026-02-08 강화] GET 요청으로 실제 페이지 내용까지 검증
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    // 1단계: HTTP 상태 코드 확인
    if (!response.ok) {
      console.log(`   ❌ HTTP 오류: ${response.status} ${url}`);
      return false;
    }

    // 2단계: 페이지 본문에서 에러 페이지 키워드 감지
    const body = await response.text();
    const bodyLower = body.toLowerCase().substring(0, 5000); // 앞부분만 확인

    // 에러 페이지 감지 키워드 (한국어 + 영어)
    const errorKeywords = [
      // 한국어 에러 페이지
      '페이지를 찾을 수 없습니다',
      '요청하신 페이지를 찾을 수 없',
      '존재하지 않는 페이지',
      '잘못된 주소',
      '페이지가 존재하지 않',
      '서비스 점검 중',
      '접근 권한이 없습니다',
      '서비스 종료',
      '준비 중입니다',
      // 영어 에러 페이지
      'page not found',
      '404 not found',
      'this page doesn\'t exist',
      'the page you requested',
      'cannot be found',
      'no longer available',
      'has been removed',
      'access denied',
      '403 forbidden',
      '500 internal server error',
      'service unavailable',
      'under maintenance',
      'coming soon',
    ];

    const isErrorPage = errorKeywords.some(kw => bodyLower.includes(kw));

    if (isErrorPage) {
      // title 태그로 교차 확인
      const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
      const pageTitle = titleMatch?.[1]?.trim() || '';
      console.log(`   ❌ 에러 페이지 감지! title: "${pageTitle.substring(0, 50)}" URL: ${url}`);
      return false;
    }

    // 3단계: 페이지에 실질적인 콘텐츠가 있는지 확인
    // body가 너무 짧으면 빈 페이지로 간주 (리다이렉트 루프 등)
    if (body.length < 200) {
      console.log(`   ❌ 빈 페이지/리다이렉트: 본문 ${body.length}자 ${url}`);
      return false;
    }

    console.log(`   ✅ URL 검증 통과: ${response.status} (${body.length}자) ${url}`);
    return true;
  } catch (error) {
    console.log(`   ❌ URL 접속 불가: ${(error as Error).message}`);
    return false;
  }
}

export async function researchWithPerplexity(keyword: string): Promise<{
  content: string;
  title: string;
  success: boolean;
}> {
  console.log(`\n🔍 [Perplexity Research] 실시간 웹 검색 리서치 시작: "${keyword}"`);
  const startTime = Date.now();

  try {
    // API 키 확인
    let apiKey: string | undefined;
    let perplexityModel: string = 'sonar';
    try {
      const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
      const config = await loadConfig();
      applyConfigToEnv(config);
      apiKey = config?.perplexityApiKey?.trim() || process.env.PERPLEXITY_API_KEY;
      perplexityModel = config?.perplexityModel || process.env.PERPLEXITY_MODEL || 'sonar';
    } catch (e) {
      apiKey = process.env.PERPLEXITY_API_KEY;
      perplexityModel = process.env.PERPLEXITY_MODEL || 'sonar';
    }

    if (!apiKey) {
      console.log('[Perplexity Research] ⚠️ Perplexity API 키 없음 → 건너뜀');
      return { content: '', title: '', success: false };
    }

    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey: apiKey.trim(),
      baseURL: 'https://api.perplexity.ai',
    });

    const researchPrompt = `
아래 키워드에 대해 실시간 웹 검색을 통해 최신 정보를 수집하고,
블로그 글 작성에 활용할 수 있는 체계적인 리서치 자료를 한국어로 작성해주세요.

🔍 키워드: "${keyword}"

[필수 수집 항목]
1. 핵심 정보: 정의, 개념, 배경
2. 상세 내용: 특징, 장단점, 종류/분류
3. 실용 정보: 구체적 방법, 팁, 주의사항
4. 최신 동향: 트렌드, 통계, 최근 변화
5. 전문가 의견: 공식 기관/브랜드 정보

[출력 규칙]
- 각 항목을 소제목과 함께 구조화
- 구체적인 수치, 날짜, 출처 포함
- 최소 2000자 이상 상세히 작성
- 실제 검색 결과 기반으로 정확하게 작성
`.trim();

    const response = await Promise.race([
      client.chat.completions.create({
        model: perplexityModel, // ✅ [2026-03-19 FIX] 하드코딩 'sonar' 제거 → 사용자 설정 perplexityModel 존중
        messages: [
          {
            role: 'system',
            content: '당신은 전문 리서치 어시스턴트입니다. 실시간 웹 검색 결과를 바탕으로 정확하고 최신의 정보를 체계적으로 정리합니다.'
          },
          { role: 'user', content: researchPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Perplexity 리서치 타임아웃 (60초)')), 60000)
      ),
    ]);

    const content = response.choices[0]?.message?.content?.trim() || '';

    if (!content || content.length < 200) {
      console.warn(`[Perplexity Research] ⚠️ 결과 부족 (${content?.length || 0}자)`);
      return { content: '', title: '', success: false };
    }

    // HTML 태그 정리
    const cleanedContent = content
      .replace(/<\/?u>/gi, '')
      .replace(/<\/?b>/gi, '')
      .replace(/<\/?i>/gi, '')
      .replace(/<\/?em>/gi, '')
      .replace(/<\/?strong>/gi, '');

    const elapsed = Date.now() - startTime;
    console.log(`✅ [Perplexity Research] 리서치 완료! ${cleanedContent.length}자 (${elapsed}ms)`);

    // 제목 추출
    let title = keyword;
    const firstLine = cleanedContent.split('\n').find(l => l.trim().length > 0);
    if (firstLine) {
      const cleaned = firstLine.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').trim();
      if (cleaned.length > 5 && cleaned.length < 100) {
        title = cleaned;
      }
    }

    return { content: cleanedContent, title, success: true };
  } catch (error) {
    const errMsg = (error as Error).message;
    // API 키 오류는 로그만 남기고 조용히 실패
    if (errMsg.includes('401') || errMsg.includes('API key') || errMsg.includes('unauthorized')) {
      console.log(`[Perplexity Research] ⚠️ API 키 인증 실패 → 건너뜀`);
    } else {
      console.warn(`[Perplexity Research] ⚠️ 리서치 실패: ${errMsg}`);
    }
    return { content: '', title: '', success: false };
  }
}

export async function researchWithGeminiGrounding(keyword: string): Promise<{
  content: string;
  title: string;
  sources: string[];
  success: boolean;
}> {
  console.log(`\n🔍 [Gemini Grounding] Google 검색 기반 웹 리서치 시작: "${keyword}"`);
  const startTime = Date.now();

  try {
    // API 키 로드
    let apiKey: string | undefined;
    try {
      const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
      const config = await loadConfig();
      applyConfigToEnv(config);
      apiKey = config?.geminiApiKey?.trim() || process.env.GEMINI_API_KEY;
    } catch (e) {
      apiKey = process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
      console.warn('[Gemini Grounding] ⚠️ Gemini API 키 없음');
      return { content: '', title: '', sources: [], success: false };
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(apiKey.trim());

    // ✅ Google Search grounding이 지원되는 stable 모델만 사용
    const modelsToTry = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ];

    const researchPrompt = `
당신은 전문 리서치 어시스턴트입니다. 아래 키워드/주제에 대해 Google 검색을 통해 최신 정보를 수집하고, 
블로그 글 작성에 활용할 수 있는 체계적인 리서치 자료를 작성해주세요.

🔍 키워드: "${keyword}"

[필수 수집 항목]
1. 핵심 정보: 정의, 개념, 배경
2. 상세 내용: 특징, 장단점, 종류/분류
3. 실용 정보: 구체적 방법, 팁, 주의사항
4. 최신 동향: 트렌드, 통계, 최근 변화
5. 전문가 의견: 공식 기관/브랜드 정보

[출력 형식]
- 한국어로 작성
- 각 항목을 소제목과 함께 구조화
- 구체적인 수치, 날짜, 출처 포함
- 최소 2000자 이상 작성
- 실제 정보 기반으로 정확하게 작성 (추측 금지)
`.trim();

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Gemini Grounding] 모델 ${modelName}으로 리서치 시도...`);

        const model = client.getGenerativeModel({
          model: modelName,
          // @ts-ignore - googleSearch tool은 SDK 타입에 아직 미반영될 수 있음
          tools: [{ googleSearch: {} }],
        });

        const result = await Promise.race([
          model.generateContent({
            contents: [{ role: 'user', parts: [{ text: researchPrompt }] }],
            generationConfig: {
              temperature: 0.3, // 정보 정확도를 위해 낮은 temperature
              maxOutputTokens: 8000,
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Grounding 타임아웃 (90초)')), 90000)
          ),
        ]);

        const response = result.response;
        const text = response.text();

        if (!text || text.trim().length < 200) {
          console.warn(`[Gemini Grounding] ⚠️ ${modelName}: 결과 부족 (${text?.length || 0}자)`);
          continue;
        }

        // 출처(grounding sources) 추출
        const sources: string[] = [];
        try {
          const candidates = response.candidates;
          if (candidates && candidates[0]) {
            const groundingMetadata = (candidates[0] as any).groundingMetadata;
            if (groundingMetadata?.groundingChunks) {
              for (const chunk of groundingMetadata.groundingChunks) {
                if (chunk.web?.uri) {
                  sources.push(chunk.web.uri);
                }
              }
            }
            if (groundingMetadata?.webSearchQueries) {
              console.log(`[Gemini Grounding] 검색 쿼리: ${groundingMetadata.webSearchQueries.join(', ')}`);
            }
          }
        } catch (e) {
          // 출처 추출 실패는 무시
        }

        const elapsed = Date.now() - startTime;
        console.log(`✅ [Gemini Grounding] 리서치 완료! ${text.length}자, ${sources.length}개 출처 (${elapsed}ms)`);

        // 제목 추출 (첫 줄이 # 으로 시작하거나, 키워드 기반)
        let title = keyword;
        const firstLine = text.split('\n').find(l => l.trim().length > 0);
        if (firstLine) {
          const cleaned = firstLine.replace(/^#+\s*/, '').trim();
          if (cleaned.length > 5 && cleaned.length < 100) {
            title = cleaned;
          }
        }

        return {
          content: text,
          title,
          sources,
          success: true,
        };
      } catch (modelError) {
        const errMsg = (modelError as Error).message;
        console.warn(`[Gemini Grounding] ⚠️ ${modelName} 실패: ${errMsg}`);

        // 타임아웃이면 다음 모델 시도
        if (errMsg.includes('타임아웃')) continue;
        // 모델 미지원이면 다음 모델 시도
        if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('not supported')) continue;
        // 기타 오류도 다음 모델 시도
        continue;
      }
    }

    console.warn('[Gemini Grounding] ⚠️ 모든 모델에서 리서치 실패');
    return { content: '', title: '', sources: [], success: false };
  } catch (error) {
    console.error(`[Gemini Grounding] ❌ 리서치 실패: ${(error as Error).message}`);
    return { content: '', title: '', sources: [], success: false };
  }
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

  // ✅ [2026-02-16 FIX] 에러 페이지 감지 개선: rawText 앞부분(500자) + title에서만 검사
  // 실제 에러 페이지는 짧고(500자 미만) 맨 앞에 에러 메시지가 나옴
  // rawText가 1500자 이상이면 실제 상품 정보가 크롤링된 것으로 간주
  const rawTextLength = source.rawText?.length || 0;
  const isLikelyRealContent = rawTextLength > 1500;
  const textHead = `${(source.rawText || '').substring(0, 500)} ${source.title || ''}`.toLowerCase();
  const hasErrorKeyword = errorKeywords.some(kw => textHead.includes(kw.toLowerCase()));

  // ✅ [2026-01-21 FIX] 에러 페이지 감지는 쇼핑커넥트 모드에서만!
  // ✅ [2026-02-16 FIX] rawText가 충분히 길면 실제 콘텐츠로 간주 (에러 페이지 오판 방지)
  const isErrorPage = isShoppingConnectMode && hasErrorKeyword && !isLikelyRealContent;

  // ✅ 디버그 로그
  if (textHead.includes('에러') || textHead.includes('오류')) {
    console.log(`[ContentGenerator] 🔍 에러 키워드 감지 분석:`);
    console.log(`   - isShoppingConnectMode: ${isShoppingConnectMode}`);
    console.log(`   - rawText 길이: ${rawTextLength}자`);
    console.log(`   - isLikelyRealContent (>1500자): ${isLikelyRealContent}`);
    console.log(`   - title: "${source.title || '없음'}"`);
    console.log(`   - hasErrorKeyword: ${hasErrorKeyword}`);
    console.log(`   - isErrorPage (최종): ${isErrorPage}`);
  }

  if (isErrorPage) {
    // ✅ [2026-03-15 FIX] 에러 페이지 감지 시 검색 API 폴백 완전 제거 (다른 제품 콘텐츠 주입 방지)
    // 기존: searchShopping으로 스토어명/키워드 검색 → 다른 제품 rawText 대체 → 다른 제품 글 생성 버그
    // 변경: 에러 페이지 감지되면 즉시 에러 throw
    console.warn('[ContentGenerator] ⚠️ 에러 페이지 감지 - 검색 API 폴백 없이 에러 반환');
    console.log('[ContentGenerator] 📋 source 정보:', {
      url: source.url,
      title: source.title,
      rawTextLength: source.rawText?.length,
    });

    throw new Error(
      '❌ 제휴 링크 크롤링 실패: 에러 페이지가 감지되었습니다.\n\n' +
      '🔧 해결 방법:\n' +
      '1. 제휴 링크가 유효한지 확인해주세요\n' +
      '2. 잠시 후 다시 시도해주세요 (네이버 측 일시적 문제일 수 있음)\n' +
      '3. 직접 브라우저에서 제휴 링크를 열어 상품 페이지가 정상적으로 표시되는지 확인해주세요\n\n' +
      '💡 팁: smartstore.naver.com 또는 brand.naver.com 직접 URL을 사용하면 더 안정적입니다.'
    );
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
  let provider = options.provider ?? source.generator ?? 'gemini';
  const userSelectedProvider = provider; // ✅ [2026-04-11] 사용자가 선택한 원래 엔진 보존 (폴백 방지용)
  // ✅ 기본 글자수: 3000자 (풍부한 내용 + 최적 분량, 양보다 질 최극상)
  const minChars = options.minChars ?? 2500; // ✅ [v1.4.14] 3000→2500 (출력 토큰 -15%, SEO 안전 1500자 이상 유지)

  // ✅ [v1.4.5] config 로드 (Lite Mode 설정 확인용)
  let config: any = null;
  try {
    const { loadConfig } = await import('./configManager.js');
    config = await loadConfig();
  } catch (e) {
    // config 로드 실패 시 무시 (기본값 사용)
  }

  // ✅ [2026-01-26 FIX] provider가 명시적으로 전달되지 않으면 gemini 기본값 사용
  // Perplexity는 renderer에서 명시적으로 'perplexity'로 전달될 때만 사용
  if (!provider) {
    provider = 'gemini';
  }
  console.log(`[ContentGenerator] 사용 엔진: ${provider} (목표: ${minChars}자)`);

  const MAX_ATTEMPTS = Math.max(1, Number(process.env.CONTENT_MAX_ATTEMPTS ?? 2));  // ✅ [v1.4.3] 3 → 2 (비용 절감)
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
  let lastFailReason = ''; // ✅ [2026-03-23] 실패 원인 추적
  // ✅ [2026-04-03] signal 추출 — 중지 시 즉시 abort
  const signal = options.signal;

  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // ✅ [2026-04-03] 매 시도 전 abort 체크
      if (signal?.aborted) {
        throw new Error('사용자가 콘텐츠 생성을 취소했습니다.');
      }

      // 재시도 전 대기 (Rate Limit 회피)
      if (attempt > 0) {
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        console.log(`[ContentGenerator] 재시도 ${attempt}/${MAX_ATTEMPTS}: ${delay / 1000}초 대기 후 재개`);
        await new Promise(resolve => setTimeout(resolve, delay));
        // ✅ [2026-04-03] 대기 후에도 abort 체크
        if (signal?.aborted) {
          throw new Error('사용자가 콘텐츠 생성을 취소했습니다.');
        }
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

      // ✅ [2026-02-11] buildPrompt() 데드 호출 제거 - buildModeBasedPrompt()만 사용
      let raw: string = ''; // ✅ [2026-02-04] undefined 방지 - 빈 문자열로 초기화

      // ✅ 다양성 극대화를 위해 temperature 높임 (매번 다른 글 생성)
      // ✅ 모드별 프롬프트 및 온도 설정 가져오기
      const mode = (source.contentMode || 'seo') as PromptMode;
      const systemPrompt = buildModeBasedPrompt(source, mode, metrics, adjustedMinChars);

      // ✅ [v1.4.4] 70점 동적 Grounding 결정 (할루시네이션 방지 + 비용 절감)
      const rawTextLen = (source.rawText || '').length;
      const isUrlMode = !!source.url || source.sourceType === 'naver_news' || source.sourceType === 'daum_news';
      let smartGrounding: boolean;
      if (isUrlMode) {
        smartGrounding = rawTextLen < 1000;
      } else {
        const primaryKw = getPrimaryKeywordFromSource(source);
        const hasKeywordInRawText = primaryKw && rawTextLen > 0
          ? (source.rawText || '').toLowerCase().includes(primaryKw.toLowerCase())
          : false;
        smartGrounding = rawTextLen < 2000 || !hasKeywordInRawText;
      }
      console.log(`[ContentGenerator] 🧠 Grounding: ${smartGrounding ? 'ON' : 'OFF'} | mode=${isUrlMode ? 'URL' : 'KEYWORD'}, rawText=${rawTextLen}자`);

      // ✅ [Traffic Hunter 통합] buildModeBasedPrompt 내에서 계산된 temperature 값을 가져와야 함.
      // 하지만 buildModeBasedPrompt는 string만 반환하므로, 여기서 다시 온도 계산 (중복을 피하려면 리팩토링이 필요하지만 현재 흐름 유지)
      // ✅ [v1.4.35] SEO 0.2 → 0.5 (로봇 회귀 방지). 4205 라인과 동일 값 유지.
      let temperature = 0.5;
      if (mode === 'seo') temperature = 0.5;  // 0.2 → 0.5
      else if (mode === 'homefeed') temperature = 0.7;

      console.log(`[ContentGenerator] AI 호출 모드: ${mode}, 온도: ${temperature}`);

      // ✅ 3. AI 엔진 호출 (프롬프트/온도 반영)
      let rawResponse = '';
      console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: ${provider} API 호출 중...`);
      try {
        const apiStart = Date.now();

        // ✅ [2026-04-03 FIX] signal abort 시 즉시 reject하는 래퍼
        const withAbortRace = <T>(promise: Promise<T>): Promise<T> => {
          if (!signal) return promise;
          if (signal.aborted) return Promise.reject(new Error('사용자가 콘텐츠 생성을 취소했습니다.'));
          return new Promise<T>((resolve, reject) => {
            const onAbort = () => reject(new Error('사용자가 콘텐츠 생성을 취소했습니다.'));
            signal.addEventListener('abort', onAbort, { once: true });
            promise.then(
              (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
              (e) => { signal.removeEventListener('abort', onAbort); reject(e); }
            );
          });
        };

        if (provider === 'openai') {
          rawResponse = await withAbortRace(callOpenAI(systemPrompt, temperature, adjustedMinChars));
        } else if (provider === 'claude') {
          rawResponse = await withAbortRace(callClaude(systemPrompt, temperature, adjustedMinChars));
        } else if (provider === 'perplexity') {
          // ✅ [2026-01-25] Perplexity AI (Sonar) 실시간 검색 기반 콘텐츠 생성
          rawResponse = await withAbortRace(callPerplexity(systemPrompt, temperature, adjustedMinChars));
        } else {
          // ✅ [v1.4.4] 동적 Grounding 결정 적용
          rawResponse = await withAbortRace(callGemini(systemPrompt, temperature, adjustedMinChars, { useGrounding: smartGrounding }));
        }
        raw = rawResponse; // Assign rawResponse to raw for subsequent processing
        console.log(`[ContentGenerator] API 완료: ${provider} (${Date.now() - apiStart}ms)`);

        // 성공 시 네트워크 에러 카운트 초기화
        networkErrorCount = 0;
        // ✅ [2026-02-04] 방어 코드: raw?.length 사용 (undefined 방지)
        console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: ${provider} API 응답 받음 (길이: ${raw?.length || 0})`);

        // ✅ [2026-02-23 FIX] AI 거부/메타 응답 사전 감지 (Perplexity "I appreciate..." 패턴)
        // Perplexity Sonar 모델이 시스템 프롬프트를 거부하고 자기소개를 하는 경우를 사전 차단
        if (raw && !raw.trim().startsWith('{') && !raw.trim().startsWith('[')) {
          const refusalPatterns = [
            /^I appreciate/i,
            /^I cannot/i,
            /^I'm (Perplexity|an AI)/i,
            /^I need to clarify/i,
            /^Thank you for/i,
            /^I understand your/i,
            /^As an AI/i,
          ];
          const isRefusal = refusalPatterns.some(p => p.test(raw.trim()));
          if (isRefusal) {
            console.warn(`[ContentGenerator] ⚠️ AI 거부 응답 감지 (${provider}): "${raw.substring(0, 80)}..."`);
            if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
              (window as any).appendLog(`⚠️ ${provider} 엔진이 프롬프트를 거부했습니다. 재시도합니다...`);
            }
            // ✅ 마지막 시도든 아니든 동일 provider로 재시도 (Gemini 폴백 제거)
            extraInstruction = `\n⚠️ 이전 응답이 올바른 JSON이 아니었습니다. 반드시 { 로 시작하는 유효한 JSON만 출력하세요. 설명, 인사말, 마크다운 없이 오직 JSON 객체만 반환하세요.\n${extraInstruction}`;
            if (attempt < MAX_ATTEMPTS) {
              lastFailReason = `AI 거부 응답 (${raw.substring(0, 60)}...)`;
              continue;
            }
            // 마지막 시도: 거부 응답에서도 JSON 추출 시도 (후속 코드에서 safeParseJson이 처리)
            console.warn(`[ContentGenerator] ⚠️ ${provider} 최종 거부 → JSON 추출 시도로 진행`);
          }
        }

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

          // ✅ [2026-04-11 FIX] 네트워크 재시도 소진 → 타 엔진 자동 폴백 제거
          // callGemini 내부에서 이미 모델 순환(Flash→Lite→Pro)을 수행하므로,
          // 여기서 추가 재시도 없이 즉시 throw하여 사용자에게 실패 원인 표시
        }

        // ✅ [2026-04-11 FIX] 할당량 초과(429) — 타 엔진 자동 폴백 제거
        // callGemini 내부에서 이미 모델별 429 재시도 + 순환을 처리하므로,
        // 여기까지 올라온 429는 모든 모델이 소진된 상태. 즉시 throw.
        if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit: 0') || errorMsg.includes('사용량 초과')) {
          console.warn(`[ContentGenerator] ${provider} 할당량 초과 — 모든 내부 모델 소진. 즉시 실패 처리.`);
        }

        // 네트워크 에러가 아닌 경우 (API 키 문제 등) 그대로 throw
        throw apiError;
      }

      // ⚠️ JSON 파싱 시도 (safeParseJson이 이미 JSON5와 여러 재시도 로직 포함)
      let parsed: StructuredContent;
      try {
        parsed = safeParseJson<StructuredContent>(raw);
        console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: JSON 파싱 성공`);

        // ✅ [2026-04-11 FIX] 제목 개행 제거 — AI가 selectedTitle에 줄바꿈을 넣으면
        // 제목이 잘리거나 본문 첫 줄이 제목에 포함되는 버그 발생
        if (parsed.selectedTitle && typeof parsed.selectedTitle === 'string') {
          parsed.selectedTitle = parsed.selectedTitle.replace(/[\r\n]+/g, ' ').trim();
        }
        if (Array.isArray(parsed.titleCandidates)) {
          parsed.titleCandidates = parsed.titleCandidates.map((c: any) => ({
            ...c,
            text: typeof c?.text === 'string' ? c.text.replace(/[\r\n]+/g, ' ').trim() : c?.text,
          }));
        }
      } catch (parseError) {
        console.error(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: JSON 파싱 실패 - 재시도 필요:`, (parseError as Error).message);
        console.error(`[ContentGenerator] 📋 파싱 실패한 raw 응답 앞 300자: ${raw?.substring(0, 300)}`);
        lastFailReason = `JSON 파싱 실패: ${(parseError as Error).message?.substring(0, 100)}`;

        // 마지막 시도가 아니면 재시도
        if (attempt < MAX_ATTEMPTS) {
          console.log(`[시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}] 재시도 중... AI에게 더 엄격한 JSON 형식 요청`);
          // ✅ [v1.4.14] 30줄 → 3줄로 축약. 재시도 시 토큰 -90%
          extraInstruction = `\n⚠️ JSON 파싱 실패 (시도 ${attempt + 1}). 반드시 { 로 시작 } 로 끝나는 유효 JSON만 출력. 마크다운/설명 금지. 모든 키-값 사이 콤마 필수.\n${extraInstruction}`;
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
      const isLastAttempt = attempt >= MAX_ATTEMPTS;
      const duplicateContentValidation = detectDuplicateContent(parsed.bodyPlain || '', parsed.headings, isLastAttempt);

      if (!duplicateContentValidation.valid && attempt < MAX_ATTEMPTS) {
        const errs = duplicateContentValidation.errors.slice(0, 3).join(', ');
        console.warn(`[ContentGenerator] 중복/패턴 하드게이트 실패: ${errs}`);
        lastFailReason = `중복/패턴 감지: ${errs}`;
        // ✅ [v1.4.14] 5줄 → 1줄 축약
        extraInstruction = `\n⚠️ 중복/패턴 감지: ${errs}. 반복 구조/문구 제거하고 다른 표현으로 재작성.\n${extraInstruction}`;
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

      // ✅ [v1.4.52] 출처 날조 sanitizer — 모든 모드에 무조건 적용 (SEO/홈판/비즈니스/리뷰 등)
      // 모드별 검증 함수 우회 시에도 sanitization 보장
      sanitizeContentFakeSources(parsed);

      // ✅ 모드별 전용 검증 (제목/도입부/톤 등 추가 체크)
      validateSeoContent(parsed, source);      // SEO 모드: 키워드/숫자/트리거 검증
      validateHomefeedContent(parsed, source); // 홈판 모드: 소제목/도입부/기자체 검증
      validateBusinessContent(parsed, source); // ✅ [v1.4.24] business 모드: 가짜 번호/광고법/CTA 검증

      if (mode === 'seo') {
        const seoKeyword = getPrimaryKeywordFromSource(source);
        const issues = computeSeoTitleCriticalIssues(parsed.selectedTitle, seoKeyword);
        if (issues.length > 0 && attempt < MAX_ATTEMPTS) {
          try {
            const patch = await generateTitleOnlyPatch(source, 'seo', source.categoryHint, provider);
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

          // ✅ [2026-02-09 v2] 패치 후 재검증: 키워드가 앞쪽에 없으면 강제 앞배치 (최후 펴대백)
          if (seoKeyword && parsed.selectedTitle) {
            const kwWords = seoKeyword.trim().split(/[\s,/\-]+/).filter((w: string) => w.length >= 2);
            const firstKwWord = kwWords[0] || seoKeyword.trim();
            const patchedTitle = parsed.selectedTitle.trim();
            const kwIdx = patchedTitle.indexOf(firstKwWord);
            if (kwIdx < 0 || kwIdx > 10) {
              // ✅ [v2] 키워드가 앞 10자 이내에 없으면 강제 배치 (최후 펴대백)
              const titleWithoutKw = patchedTitle.replace(new RegExp(firstKwWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').replace(/^[,\s]+/, '').trim();
              parsed.selectedTitle = `${firstKwWord} ${titleWithoutKw}`.trim();
              console.log(`[TitlePatch] ⚠️ SEO 키워드 강제 앞배치 (최후 펴대백): "${parsed.selectedTitle}"`);
            }
          }
        }
      }

      if (mode === 'homefeed') {
        const hfKeyword = getPrimaryKeywordFromSource(source);
        const titleIssues = computeHomefeedTitleCriticalIssues(parsed.selectedTitle, hfKeyword);
        if (titleIssues.length > 0 && attempt < MAX_ATTEMPTS) {
          try {
            const patch = await generateTitleOnlyPatch(source, 'homefeed', source.categoryHint, provider);
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

          // ✅ [2026-02-09 v2] 패치 후 재검증: 키워드가 앞쪽에 없으면 강제 앞배치 (최후 펴대백)
          if (hfKeyword && parsed.selectedTitle) {
            const kwWords = hfKeyword.trim().split(/[\s,/\-]+/).filter((w: string) => w.length >= 2);
            const firstKwWord = kwWords[0] || hfKeyword.trim();
            const patchedTitle = parsed.selectedTitle.trim();
            const kwIdx = patchedTitle.indexOf(firstKwWord);
            if (kwIdx < 0 || kwIdx > 10) {
              const titleWithoutKw = patchedTitle.replace(new RegExp(firstKwWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').replace(/^[,\s]+/, '').trim();
              parsed.selectedTitle = `${firstKwWord} ${titleWithoutKw}`.trim();
              console.log(`[TitlePatch] ⚠️ 홈판 키워드 강제 앞배치 (최후 펴대백): "${parsed.selectedTitle}"`);
            }
          }
        }

        const introIssues = computeHomefeedIntroCriticalIssues(parsed.introduction);
        if (introIssues.length > 0 && attempt < MAX_ATTEMPTS) {
          const patch = await generateHomefeedIntroOnlyPatch(source, parsed, provider);
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

      // ✅ [v1.4.18] 소제목 키워드 누락 사후 패치 — 재시도 없이 즉시 보정
      // SEO/홈판 모드에서 메인 키워드가 빠진 소제목을 자동으로 키워드 포함 형태로 변환
      if ((mode === 'seo' || mode === 'homefeed') && Array.isArray(parsed.headings)) {
        const primaryKw = getPrimaryKeywordFromSource(source);
        if (primaryKw) {
          const kwCore = primaryKw.trim().split(/[\s,/\-]+/).filter((w: string) => w.length >= 2)[0] || primaryKw.trim();
          let patchedCount = 0;
          for (const heading of parsed.headings) {
            if (!heading?.title) continue;
            const titleStr = String(heading.title);
            // 메인 키워드 또는 핵심 단어가 소제목에 포함되어 있는지 체크 (대소문자 무관, 부분 매칭)
            if (!titleStr.toLowerCase().includes(kwCore.toLowerCase())) {
              // 키워드 누락 → 자연스럽게 prefix 추가 (조사 무시)
              const original = titleStr;
              heading.title = `${kwCore} ${titleStr}`.trim();
              patchedCount++;
              console.log(`[HeadingPatch] ⚠️ 소제목 키워드 누락 패치: "${original}" → "${heading.title}"`);
            }
          }
          if (patchedCount > 0) {
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
              `HeadingPatch(${mode}): ${patchedCount}개 소제목에 메인 키워드 자동 추가`,
            ];
            // bodyPlain 재동기화
            try { syncHeadingsWithBodyPlain(parsed); } catch { /* ignore */ }
          }
        }
      }

      // ✅ [2026-02-01] 쇼핑커넥트(affiliate) 모드 제목 검증 및 패치
      // ✅ [FIX] 모든 시도에서 제목 패치 적용 (attempt < MAX_ATTEMPTS 조건 제거)
      // ✅ [2026-02-04 FIX] isShoppingConnectMode도 체크하여 URL 기반 쇼핑커넥트에서도 제목 패치 작동
      if (isShoppingConnectMode || mode === 'affiliate') {
        const titleIssues = computeAffiliateTitleCriticalIssues(parsed.selectedTitle, source);
        if (titleIssues.length > 0) {
          try {
            console.log(`[ContentGenerator] 🛒 쇼핑커넥트 제목 이슈 감지: ${titleIssues.join(', ')}`);
            const patch = await generateTitleOnlyPatch(source, 'affiliate', source.categoryHint, provider);
            if (patch.selectedTitle) {
              console.log(`[ContentGenerator] ✅ 제목 패치 적용: "${patch.selectedTitle}"`);
              parsed.selectedTitle = patch.selectedTitle;
            }
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
              `TitlePatch(affiliate): ${titleIssues.join(', ')}`,
            ];
          } catch {
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

        // ✅ [v1.4.35] humanize 항상 strong — "사람보다 사람처럼" 작성 우선
        // 기존 문제: AI가 깔끔하게 만들수록 위험도 점수 낮음 → light로 떨어짐
        //           → light는 4단계 스킵 (어미 다양화, 동의어, 개인 표현, 감탄사)
        //           → 결과적으로 humanize가 거의 안 되고 로봇 같은 글 생성
        // 변경: 항상 strong 적용. 위험도 점수는 quality 메타로만 사용.
        const humanizeIntensity: 'strong' = 'strong';

        // Humanize 적용
        if (optimized.bodyPlain) {
          optimized.bodyPlain = humanizeContent(optimized.bodyPlain, humanizeIntensity, false, source.toneStyle);
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

      // ✅ [v1.4.14] 50% 이상이면 경고만 하고 통과 (재시도 비용 절감) - 60→50%로 완화
      const minAcceptableChars = Math.round(minChars * 0.50); // 50% 기준
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
        // ✅ [2026-03-23 FIX] 최종 시도에서는 글자수에 관계없이 항상 경고 후 통과
        // 이전: 50% 미만이면 throw → 발행 전체 실패
        // 수정: 짧은 글이라도 발행하는 것이 에러보다 나음
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

        if (!optimized.quality.warnings) {
          optimized.quality.warnings = [];
        }

        if (plainLength >= minChars * 0.5) {
          optimized.quality.warnings.push(
            `본문 길이가 목표보다 약간 짧습니다 (${plainLength}자 / 목표: ${minChars}자). 최대한 내용을 보존하여 출력합니다.`
          );
        } else {
          // ✅ [2026-03-23] 50% 미만이어도 에러 없이 진행 — 연속발행 안정성 최우선
          console.warn(`[ContentGenerator] ⚠️ 본문 길이 미달 (${plainLength}자 / 목표: ${minChars}자, ${Math.round((plainLength / minChars) * 100)}%) - 그래도 진행`);
          optimized.quality.warnings.push(
            `⚠️ 본문이 목표보다 많이 짧습니다 (${plainLength}자 / 목표: ${minChars}자). 내용 보강을 권장합니다.`
          );
        }

        // ✅ 성공 통계 (경고 후 통과)
        stats.success++;
        if (attempt === 0) stats.attempts.first++;
        else if (attempt === 1) stats.attempts.second++;
        else if (attempt === 2) stats.attempts.third++;
        else if (attempt === 3) stats.attempts.fourth++;
        const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
        console.log(`[ContentGenerator] ✅ 최종 경고 후 통과 (시도 ${attempt + 1}번째) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);

        try {
          await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
        } catch (error) {
          console.warn('[ContentGenerator] 통계 파일 저장 실패:', (error as Error).message);
        }

        return finalizeStructuredContent(optimized, source);
      }

      // 재시도 시 목표치 증가
      // - 1차 재시도: 1.20배 (20% 증가)
      // - 2차 재시도: 1.40배 (40% 증가)
      lastFailReason = `글자수 미달: ${plainLength}자 / 목표 ${minChars}자 (${Math.round((plainLength / minChars) * 100)}%)`;
      console.warn(`[ContentGenerator] ⚠️ 시도 ${attempt + 1}: ${lastFailReason}`);
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
      const errMsg = (error as Error).message || '알 수 없는 오류';

      // ✅ [v1.4.41] 매번 lastFailReason 설정 (마지막 시도 포함) — "알 수 없음" 방지
      lastFailReason = errMsg.substring(0, 300);

      if (attempt === MAX_ATTEMPTS) {
        // ✅ 실패 통계 업데이트
        stats.failed++;
        const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
        console.error(`[ContentGenerator] ❌ 실패! (최대 시도 횟수 초과) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);
        console.error(`[ContentGenerator] 마지막 에러: ${errMsg}`);

        // 통계 파일 저장
        try {
          await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
        } catch (saveError) {
          console.warn('[ContentGenerator] 통계 파일 저장 실패:', (saveError as Error).message);
        }

        // ✅ [v1.4.41] 원본 에러 메시지를 보존하여 throw — 사용자가 진짜 원인을 알 수 있도록
        // ✅ [2026-04-11] userSelectedProvider 사용 — 폴백으로 provider가 바뀌어도 원래 엔진명 표시
        throw new Error(`콘텐츠 생성 실패 (엔진: ${userSelectedProvider}, ${attempt + 1}회 시도): ${errMsg}`);
      }
      // 재시도 가능한 오류면 계속
      console.warn(`[시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}] 오류 발생, 재시도 중:`, errMsg);
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

  // ✅ [v1.4.41] 의미 있는 에러 메시지 — "알 수 없음" 대신 구체적 가이드
  // ✅ [2026-04-11] userSelectedProvider 사용 — 사용자가 선택한 엔진명 정확히 표시
  const finalReason = lastFailReason || '루프가 비정상 종료됨 (개발자 콘솔 로그 확인 필요)';
  throw new Error(`콘텐츠 생성 실패 (엔진: ${userSelectedProvider}, ${MAX_ATTEMPTS + 1}회 시도 후 실패): ${finalReason}`);
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
  const shouldInsertTriggers = true;

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
    case 'shopping_expert_review':
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

