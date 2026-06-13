import { calculateSEOScore } from './seoCalculator.js';
import {
  buildTrafficStrategy,
  calculateEngagementScore,
  estimateEngagement,
  estimateViralPotential,
  extractKeywordsFromContent,
  extractShareableQuote,
  generateCTA,
  generateExperienceTrigger,
  generateOpinionTrigger,
  generateSelfComments,
  generateVoteTrigger,
  getOptimalPublishTime,
  inferTone,
} from './contentEngagementStrategy.js';
import type {
  CommentTrigger,
  ContentSource,
  StructuredContent,
} from './contentGenerator.js';

export function optimizeForViral(content: StructuredContent, source: ContentSource): StructuredContent {
  let clone: StructuredContent;
  try {
    clone = structuredClone(content);
  } catch {
    clone = JSON.parse(JSON.stringify(content));
  }

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

  const articleType = source.articleType ?? 'general';
  const shouldInsertTriggers = true;

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
  clone.bodyPlain = paragraphs.join('\n\n');

  clone.viralHooks = {
    commentTriggers,
    shareTrigger: {
      position: 0.6,
      quote: shareQuote,
      prompt: '',
    },
    bookmarkValue: {
      reason: '실전에서 반복 참고가 필요한 핵심 정보',
      seriesPromise: '',
    },
  };

  clone.trafficStrategy = buildTrafficStrategy(source, getOptimalPublishTime);

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
  }

  clone.quality = {
    ...clone.quality,
    viralPotential: clone.quality.viralPotential ?? estimateViralPotential(source),
    engagementScore: clone.quality.engagementScore ?? calculateEngagementScore(clone),
  };

  const cta = generateCTA(source, source.articleType || 'general');
  if (cta) {
    clone.cta = cta;
    console.log(`[ContentGenerator] CTA 생성: ${cta.text}${cta.link ? ` → ${cta.link}` : ''}`);

    if (clone.bodyPlain && cta.text) {
      const ctaPlainText = `\n\n🔗 ${cta.text}`;
      if (!clone.bodyPlain.includes(cta.text)) {
        clone.bodyPlain = clone.bodyPlain.trim() + ctaPlainText;
        console.log(`[ContentGenerator] ✅ CTA를 bodyPlain에 추가했습니다.`);
      }
    }

    if (clone.bodyHtml && cta.text && cta.link) {
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
    collectedImages: source.images || [],
  };
}
