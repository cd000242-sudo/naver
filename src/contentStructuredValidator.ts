import type { ContentSource, StructuredContent } from './contentGenerator';
import { recoverLooseStructuredContentFields } from './contentStructuredRecovery';
import { detectPromptLeakageInTitle } from './contentTitleSafetyChecks';
import { buildMissingBodyUserMessage } from './contentGenerationUserGuidance';
import { limitRegexOccurrences } from './contentBodyTransforms';
import { sanitizeReviewTitle } from './contentKeywordPrefix';
import { stripReviewTitlePrefixFromHeading } from './contentTitlePrefixHelpers';
import {
  extractLikelyProductNameFromTitle,
  getReviewProductName,
  isReviewArticleType,
  sanitizeReviewHeadingTitle,
} from './contentReviewHelpers';
import {
  normalizeBodyWhitespacePreserveNewlines,
  normalizeTitleWhitespace,
} from './contentTextHelpers';

function escapePlainTextForHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function plainTextToHtml(value: string): string {
  return escapePlainTextForHtml(value)
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>');
}

export function validateStructuredContent(content: StructuredContent, source?: ContentSource): void {
  if (!content) throw new Error('AI 응답에 본문이 없습니다. 자동 재시도 중입니다... 계속 실패하면 다른 AI 엔진(Gemini/Claude/OpenAI)으로 전환해주세요.');

  const looseRecovery = recoverLooseStructuredContentFields(content);
  if (looseRecovery.bodyRecovered || looseRecovery.headingsRecovered) {
    console.warn(
      `[validateStructuredContent] 느슨한 AI 응답 구조 복구: ` +
      `body=${looseRecovery.bodySource || 'none'}, headings=${looseRecovery.headingsSource || 'none'}`
    );
  }

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
        .map(p => `<p>${plainTextToHtml(p)}</p>`)
        .join('\n');
      console.warn('[validateStructuredContent] bodyHtml 누락 → bodyPlain에서 복구');
    } else if (content.headings && content.headings.length > 0) {
      // headings에서 본문 생성 (content 또는 summary 사용)
      const bodyParts: string[] = [];
      content.headings.forEach(h => {
        if (h.title) bodyParts.push(`<h2>${plainTextToHtml(h.title)}</h2>`);
        // ✅ content 또는 summary 중 있는 것 사용
        const bodyText = h.content || h.summary || '';
        if (bodyText) bodyParts.push(`<p>${plainTextToHtml(bodyText)}</p>`);
      });
      content.bodyHtml = bodyParts.join('\n');
      // ✅ bodyPlain도 content 또는 summary 사용
      content.bodyPlain = content.headings.map(h => {
        const bodyText = h.content || h.summary || '';
        return `${h.title}\n${bodyText}`;
      }).join('\n\n');
      console.warn('[validateStructuredContent] bodyHtml 누락 → headings에서 복구');
    } else {
      // ✅ [v2.10.50] 본문 누락 fallback 폐기 — 사용자 보고 '제목과 본문이 똑같이 나옴'
      //   기존: throw 대신 최소 구조로 복구 (제목=본문 1줄짜리 글 발행) → 네이버 어뷰징 위험
      //   수정: 명확한 에러 throw → 호출자(generateStructuredContent)가 재시도/사용자 안내
      //   재시도 체인이 모두 실패하면 사용자가 다시 글생성 버튼 누르도록.
      const fallbackTitle = content.selectedTitle || '콘텐츠';
      console.error(`[validateStructuredContent] ❌ 필수 필드 모두 누락 (제목: "${fallbackTitle}") — 본문 생성 실패`);
      throw new Error(buildMissingBodyUserMessage());
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
            // Do not trim bodyPlain here. The duplicate heading was already
            // removed from the structured heading list, and trimming from the
            // next heading can delete the introduction or first valid section.
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

  const normalizeTag = (tag: string): string => {
    const cleaned = String(tag || '')
      .replace(/^#+/, '')
      .replace(/[^\p{L}\p{N}_가-힣\s-]/gu, ' ')
      .replace(/\s+/g, '')
      .trim();
    return cleaned ? `#${cleaned}` : '';
  };

  const addHashtag = (tags: string[], raw: string): void => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    if (tag.length < 3 || tag.length > 24) return;
    if (tags.some(existing => existing.toLowerCase() === tag.toLowerCase())) return;
    tags.push(tag);
  };

  const normalizedHashtags: string[] = [];
  for (const tag of content.hashtags || []) addHashtag(normalizedHashtags, tag);

  if (normalizedHashtags.length < 5) {
    const seedTexts = [
      ...(
        Array.isArray((source?.metadata as any)?.keywords)
          ? (source!.metadata as any).keywords.map((kw: any) => String(kw || ''))
          : []
      ),
      content.selectedTitle || '',
      content.metadata?.category || '',
      source?.categoryHint || '',
    ];

    for (const seed of seedTexts) {
      String(seed || '')
        .replace(/[?!.,\-_"'()[\]{}]/g, ' ')
        .split(/\s+/)
        .map(word => word.trim())
        .filter(word => word.length >= 2 && word.length <= 15)
        .filter(word => !['하는', '되는', '있는', '없는', '위한', '대한', '그리고', '하지만', '어떻게', '무엇', '어디', '언제', '누가', '왜'].includes(word))
        .forEach(word => {
          if (normalizedHashtags.length < 8) addHashtag(normalizedHashtags, word);
        });
      if (normalizedHashtags.length >= 5) break;
    }
  }

  if (normalizedHashtags.length < 5) {
    ['정보', '꿀팁', '생활팁', '체크리스트', '비교정리'].forEach(tag => {
      if (normalizedHashtags.length < 5) addHashtag(normalizedHashtags, tag);
    });
  }

  content.hashtags = normalizedHashtags.slice(0, 8);

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
