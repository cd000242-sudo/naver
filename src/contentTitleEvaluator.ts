import { scoreSearchMatch, scorePurchaseAxis, scoreOptionNoise, scoreSearchPhraseIntact, scoreDanglingEnding } from './content/titleModeObjective.js';
import { measureTitleWidth } from './content/titleLengthPolicy.js';
/**
 * [Phase 3-9/v2.10.147] contentGenerator god file decomposition — evaluateTitleQuality.
 *
 * Pure-ish function (console.log side-effect only). Dependencies:
 *   - PromptMode (promptLoader)
 *   - getRecentPeriods (titleSelector)
 *   - CATEGORY_BONUSES (contentTitleQuality)
 *   - dynamic require: content/ctrCombat.js, content/neoHookTitles.js (same src/ dir)
 */

import type { PromptMode } from './promptLoader.js';
import { resolveCategory, HOMEFEED_ISSUE_STORY_CATEGORIES } from './promptLoader.js';
import { getRecentPeriods } from './titleSelector.js';
import { CATEGORY_BONUSES } from './contentTitleQuality';

export function evaluateTitleQuality(title: string, keyword: string, mode: PromptMode, categoryHint?: string, articleType?: string): { score: number; issues: string[] } {
  let score = 100;
  const issues: string[] = [];
  const t = String(title || '').trim();
  // 잘림은 글자 수가 아니라 폭으로 정해진다 — 한글 1칸, 공백·숫자·영문 반 칸.
  const titleWidth = measureTitleWidth(t);
  const kw = String(keyword || '').trim().toLowerCase();

  if (!t) return { score: 0, issues: ['빈 제목'] };

  // [2026-08-05] 이슈픽(homefeed + 연예/시사) 조합 판정.
  //   issue-story 골격(실측 승자, 60021a64)의 제목 3공식이 이 채점기에서 죽고 있었다 —
  //   1공식 인용 훅형은 따옴표 감점에 자동 탈락, 2·3공식 어휘(진짜 이유·알고보니·반전)는
  //   자극어 감점. contentGenerator 가 후보 중 최고점으로 교체하므로 항상 밋밋한
  //   정보형이 이겼다. 이슈픽에서는 해당 감점을 해제한다. 인용 실재 여부는 이 채점기가
  //   검증할 수 없고 H7(인용 날조 금지)·골격의 인용 규칙·evidence 층이 담당한다.
  const usesIssueStorySkeleton = mode === 'homefeed'
    && HOMEFEED_ISSUE_STORY_CATEGORIES.has(resolveCategory(categoryHint));

  // 0점 패턴 (즉시 탈락)
  const normalizedTitle = t.toLowerCase().replace(/[\s\-–—:|·•.,!?]/g, '');
  const normalizedKeyword = kw.replace(/[\s\-–—:|·•.,!?]/g, '');
  if (normalizedKeyword && normalizedTitle === normalizedKeyword) {
    console.log('[TitleQuality] ❌ 키워드 그대로 사용 → 0점');
    return { score: 0, issues: ['키워드 그대로 사용'] };
  }

  // ✅ [v1.4.57] shopping_expert_review 전용 — 후기/체험 표현 강력 감점
  // 전문리뷰는 "솔직후기/내돈내산/직접 써본/찐후기/실사용" 같은 체험 표현 금지
  if (articleType === 'shopping_expert_review') {
    const reviewBanPatterns = [
      '솔직후기', '솔직 후기', '솔직리뷰', '솔직 리뷰',
      '내돈내산', '내 돈 내산',
      '찐후기', '찐 후기', '찐리뷰',
      '실사용', '실사용후기', '실사용 후기',
      '직접 써본', '직접 쓴', '직접 사용한',
      '써본 후기', '써봤더니', '써보니',
      '리얼후기', '리얼 후기', '리얼리뷰',
      '체험 후기', '체험기', '체험담',
    ];
    const foundBan = reviewBanPatterns.find(p => t.includes(p));
    if (foundBan) {
      score -= 50; // 강한 감점 — 전문리뷰 스타일과 완전히 반대
      issues.push(`전문리뷰: 후기형 표현 "${foundBan}" 사용 (스펙/가이드 관점 권장)`);
      console.log(`[TitleQuality] ⛔ 전문리뷰에 후기 표현 감지: "${foundBan}" → -50점`);
    }
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
  // [2026-09-03 실측] "9월 꽃구경 …, 9월 초·중순" 의 달·날짜 표기를 '0원 반복' 으로 오판해 -30 — 달력 단위(월·일·년)는 제외한다.
  const numberUnits = (t.match(/\d+[가-힣]{1,2}/g) || []).filter((token) => !/\d+(?:월|일|년|주|시|분|초)$/.test(token) || /\d+(?:분|초)$/.test(token));
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
    // [2026-08-27] 글자 수가 아니라 폭으로 잰다. 한글은 넓고 공백·숫자·영문은 절반이라,
    //   숫자가 섞인 제목이 실제보다 길게 계산돼 억울하게 걸렸다(사장님 지적).
    { condition: mode === 'seo' && titleWidth > 42, points: 30, reason: 'SEO: 42폭 초과 (검색 잘림)' },
    { condition: mode === 'homefeed' && titleWidth > 42, points: 60, reason: '홈피드: 42폭 초과 (모바일 첫 화면 가독성 저하)' },
    { condition: t.length > 65, points: 40, reason: '65자 초과 (심각한 잘림)' },
    // 길이 부족
    { condition: t.length < 15, points: 20, reason: '15자 미만 (정보 부족)' },
    // 홈판 모드: AI티 나는 표현
    // ✅ [v1.4.48 Stage A.4] 홈피드 AI티 패턴 대폭 확장 (5개 → 14개)
    //   추가: 반전, 소름, 난리, 대박, 공개, 충격적, 경악적, 진실, 폭로
    //   원인: 기존 5개만으로는 AI 생성 제목의 90%를 못 잡음
    //   [2026-08-05] '진짜 이유·알고보니·반전'은 이슈픽 정체숨김·추측형(골격 2·3공식) 어휘라 이슈픽에서만 허용.
    { condition: mode === 'homefeed' && (/(충격|경악|눈물바다|소름|난리|대박 공개|충격적|경악적|폭로|진실 공개|이게 가능|실화)/.test(t) || (!usesIssueStorySkeleton && /(진짜 이유|알고보니|반전)/.test(t))), points: 40, reason: '홈판: 뻔한 AI티 표현' },
    // [2026-08-20] 홈판: 요약 명사 종결 — 보도자료·AI 요약 문형이라 클릭 사유가 없다.
    //   위 -35(템플릿 종결어)는 서브키워드 +10과 길이 +5 가점에 상쇄돼 75점 게이트를
    //   통과해 왔다(발행 실측: "~재개일 정리", "~재고 현황", "~관전 포인트"). 상쇄 불가한 -50.
    { condition: mode === 'homefeed' && /(?:정리|현황|포인트|모음|리스트|대응|의미|근황|요약|체크리스트|안내|비교)$/.test(t), points: 50, reason: '홈판: 요약 명사 종결 (클릭 사유 없음)' },
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
    { condition: mode === 'affiliate' && /(오늘만|최저가|품절\s*임박|한정\s*수량|놓치면\s*후회|안\s*사면\s*손해|지금\s*바로\s*구매)/.test(t), points: 60, reason: '쇼핑: 근거 없는 긴급·판매 압박 문구' },
    { condition: mode === 'affiliate' && /(인생템|필수템|가성비\s*(?:갑|최고)|카테고리\s*1위|베스트셀러)/.test(t), points: 40, reason: '쇼핑: 광고성 만능 수식어' },
    // ✅ [2026-02-10 FIX] 콜론+따옴표 패턴 — AI가 구조를 리터럴로 해석한 부자연스러운 제목
    { condition: /[:：]\s*["'\u201C\u201D\u2018\u2019\u300C\u300D]/.test(t), points: 50, reason: '콜론+따옴표 패턴' },
    // ✅ [2026-02-10 FIX] 제목에 따옴표 포함 — 블로그 제목에 부적절
    // [2026-08-05] 이슈픽 인용 훅형(골격 1공식)은 따옴표가 공식 그 자체다 — 이슈픽에서만 감점 해제.
    { condition: !usesIssueStorySkeleton && /["\u201C\u201D\u300C\u300D\u300E\u300F]/.test(t), points: 20, reason: '제목에 따옴표 포함' },
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
    { condition: /(\?|일까|할까|인가요)/.test(t), points: 5, reason: '질문형 종결 (호기심)' },
    // 홈피드 외 모드에서만 솔직 표현 가점
    { condition: mode !== 'homefeed' && mode !== 'affiliate' && /(솔직히|사실|실제로|진짜)/.test(t), points: 3, reason: '솔직한 표현 (신뢰)' },
    { condition: mode === 'seo' && titleWidth >= 22 && titleWidth <= 40, points: 5, reason: 'SEO 이상적 길이 (22~40폭)' },
    // ✅ [v3] 홈피드 전용 보너스
    { condition: mode === 'homefeed' && titleWidth >= 28 && titleWidth <= 42, points: 5, reason: '홈피드 이상적 길이 (28~42폭)' },
    // 홈피드 외 모드에서만 변화/비포애프터 가점
    { condition: mode !== 'homefeed' && mode !== 'affiliate' && /(전|후|변화|달라)/.test(t), points: 3, reason: '변화/비포애프터 요소' },
  ];
  for (const b of bonuses) {
    if (b.condition) {
      score += b.points;
      console.log(`[TitleQuality] +${b.points}점: ${b.reason}`);
    }
  }

  // [2026-08-26] 검색으로 먹고사는 모드(SEO·메이트·쇼핑·업체)는 제목이 검색어와
  //   물려 있어야 한다. 예전엔 keyword 를 "그대로 복사인지" 판정에만 써서,
  //   검색어를 통째로 버린 후보가 길이만 맞으면 이길 수 있었다. 홈판은 검색이
  //   아니라 피드에서 싸우므로 여기서 건드리지 않는다(ctrCombat·neoHook 담당).
  // 쇼핑은 계약이 구매 축을 필수로 요구한다 — 없으면 결함으로 본다.
  const purchaseAxis = scorePurchaseAxis(t, mode);
  if (purchaseAxis.points !== 0) {
    score += purchaseAxis.points;
    issues.push(purchaseAxis.reason);
    console.log(`[TitleQuality] ${purchaseAxis.points}점: ${purchaseAxis.reason}`);
  }

  // [2026-09-02 사장님] 쇼핑 제목은 검색어 구절이 그대로 앞쪽에 — 노출이 먼저다.
  const phraseIntact = scoreSearchPhraseIntact(t, keyword, mode);
  if (phraseIntact.points !== 0) {
    score += phraseIntact.points;
    issues.push(phraseIntact.reason);
    console.log(`[TitleQuality] ${phraseIntact.points}점: ${phraseIntact.reason}`);
  }
  // [2026-09-02] 스토어 옵션 조합("그레이 본체+다리")은 제목의 결함이다 — 닥터웰 실측.
  // [2026-09-03 생성 실측] "…운동 뒤 유선 사용은" — 조사로 끝나는 쇼핑 제목은 결함이다.
  const dangling = scoreDanglingEnding(t, mode);
  if (dangling.points !== 0) {
    score += dangling.points;
    issues.push(dangling.reason);
    console.log(`[TitleQuality] ${dangling.points}점: ${dangling.reason}`);
  }
  const optionNoise = scoreOptionNoise(t, mode);
  if (optionNoise.points !== 0) {
    score += optionNoise.points;
    issues.push(optionNoise.reason);
    console.log(`[TitleQuality] ${optionNoise.points}점: ${optionNoise.reason}`);
  }
  const searchMatch = scoreSearchMatch(t, keyword, mode);
  if (searchMatch.points !== 0) {
    score += searchMatch.points;
    if (searchMatch.points < 0) issues.push(searchMatch.reason);
    console.log(
      `[TitleQuality] ${searchMatch.points > 0 ? '+' : ''}${searchMatch.points}점: ${searchMatch.reason}`,
    );
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

  // ✅ [v1.8.1 LDF Phase 2] 홈판 모드 전용 CTR 예측 점수 결합
  // ✅ [v2.6.0 Neo-Hook] scoreNeoHookTitle로 "신박함" 축 추가 채점
  if (mode === 'homefeed') {
    try {
      const { scoreTitleForHomefeed } = require('./content/ctrCombat.js');
      const ctrResult = scoreTitleForHomefeed(t, categoryHint);
      // [v2.6.0] Neo-Hook 채점 — 역설·감각·구어체 가산점 + 확장 블랙리스트 감점
      try {
        const { scoreNeoHookTitle } = require('./content/neoHookTitles.js');
        const neo = scoreNeoHookTitle(t, { category: categoryHint, baseCTRScore: ctrResult.score });
        // Neo-Hook 총점을 최종에 반영 (base CTR은 이미 포함된 상태)
        const neoBonus = Math.round((neo.totalScore - 50) * 0.4); // 기존 CTR보다 약간 높은 가중
        score += neoBonus;
        if (neoBonus !== 0) {
          console.log(`[TitleQuality] 🎯 Neo-Hook ${neo.totalScore}점 (${neo.verdict}) → ${neoBonus > 0 ? '+' : ''}${neoBonus}점`);
          if (neo.noveltyMatches.length > 0) console.log(`[TitleQuality] 🌟 신박 매칭: ${neo.noveltyMatches.join(', ')}`);
          if (neo.clicheHits.length > 0) console.log(`[TitleQuality] ⛔ B급 훅: ${neo.clicheHits.join(', ')}`);
        }
      } catch {
        // Neo-Hook 실패 시 기존 CTR만
        const ctrBonus = Math.round((ctrResult.score - 50) * 0.3);
        score += ctrBonus;
      }
    } catch (err) {
      // ctrCombat 로드 실패 시 기존 로직만 사용
    }
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}
