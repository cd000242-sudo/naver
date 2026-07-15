import {
  removeOrdinalHeadingLabelsFromBody,
  stripAllFormatting,
  type StructuredContent,
} from '../contentGenerator.js';

export type PublishMode = 'draft' | 'publish' | 'schedule';

export interface ResolveNaverRunOptionsInput {
  runOptions: Record<string, any>;
  defaults: {
    defaultTitle?: string;
    defaultContent?: string;
    defaultLines?: number;
  };
  log?: (message: string) => void;
}

export function normalizeScheduleDateForRunOptions(runOptions: Record<string, any>): string | undefined {
  const rawScheduleDate = runOptions.scheduleDate;
  if (!rawScheduleDate) return undefined;

  if (runOptions.publishMode !== 'schedule' && runOptions.publishMode !== 'draft') {
    return undefined;
  }

  let scheduleDate = String(rawScheduleDate).replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate) && runOptions.scheduleTime) {
    scheduleDate = `${scheduleDate} ${runOptions.scheduleTime}`;
  }

  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(scheduleDate)) {
    throw new Error('예약발행 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD HH:mm 형식)');
  }

  return scheduleDate;
}

export function normalizeCtas(runOptions: Record<string, any>): Array<{ text: string; link: string }> {
  const ctasFromInput = Array.isArray(runOptions.ctas) ? runOptions.ctas : [];
  const list = ctasFromInput
    .map((c) => ({
      text: String(c?.text || '').trim(),
      link: String(c?.link || '').trim(),
    }))
    .filter((c) => c.text);

  if (list.length > 0) return list;

  const text = String(runOptions.ctaText || '').trim();
  const link = String(runOptions.ctaLink || '').trim();
  return text ? [{ text, link }] : [];
}

export function assertValidCtaLinks(ctas: Array<{ text: string; link: string }>): void {
  for (const cta of ctas) {
    if (cta.link && !/^https?:\/\//.test(cta.link)) {
      throw new Error('CTA 링크는 유효한 URL 형식이어야 합니다. (http:// 또는 https://로 시작)');
    }
  }
}

export function normalizePublishHashtags(...sources: any[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const visit = (value: any) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    String(value ?? '')
      .split(/[,\s#]+/)
      .map((tag) => tag.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_-]/gu, ''))
      .filter(Boolean)
      .forEach((tag) => {
        const key = tag.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(tag);
      });
  };

  sources.forEach(visit);
  return result;
}

function normalizeAutomationImages(images: any[] | undefined, log?: (message: string) => void): any[] {
  if (!Array.isArray(images)) return [];

  return images.map((image) => {
    const nextImage = { ...image };
    if (typeof image?.savedToLocal === 'string' && image.savedToLocal.trim() !== '') {
      nextImage.filePath = image.savedToLocal;
      log?.(`   📁 저장된 이미지 경로 사용: ${image.savedToLocal.replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~')}`);
    } else if (image?.savedToLocal === true) {
      log?.(`   📁 저장된 이미지 사용 (경로: ${image.filePath})`);
    }

    return nextImage;
  });
}

function materializeWriterOwnedStructuredContent(
  value: StructuredContent | undefined,
): StructuredContent | undefined {
  if (!value) return undefined;
  const requiresMutableCopy = Object.isFrozen(value)
    || (value as StructuredContent & { _contentQualityV3Required?: boolean })
      ._contentQualityV3Required === true;
  return requiresMutableCopy ? structuredClone(value) : value;
}

export function resolveNaverRunOptions(input: ResolveNaverRunOptionsInput): Record<string, any> {
  const { runOptions, defaults, log } = input;
  const structured = materializeWriterOwnedStructuredContent(
    runOptions.structuredContent as StructuredContent | undefined,
  );
  const scheduleDate = normalizeScheduleDateForRunOptions(runOptions);
  const ctas = normalizeCtas(runOptions);
  assertValidCtaLinks(ctas);

  const hashtags = normalizePublishHashtags(runOptions.hashtags, structured?.hashtags);
  const normalizedHashtags = hashtags.length > 5 ? hashtags.slice(0, 5) : hashtags;
  if (hashtags.length > 5) {
    log?.(`⚠️ 해시태그가 5개를 초과합니다. (${hashtags.length}개) 처음 5개만 사용됩니다.`);
  }

  const rawTitle =
    structured?.selectedTitle?.trim() ||
    runOptions.title?.trim() ||
    defaults.defaultTitle?.trim();

  if (!rawTitle) {
    throw new Error('❌ 발행 실패: 제목이 없습니다. 콘텐츠 생성이 필요합니다.');
  }

  const rawContent =
    structured?.bodyPlain?.trim() ||
    runOptions.content?.trim() ||
    defaults.defaultContent?.trim();

  if (!rawContent) {
    throw new Error('❌ 발행 실패: 본문 내용이 없습니다. 콘텐츠 생성이 필요합니다.');
  }

  const rawLines = runOptions.lines ?? defaults.defaultLines ?? 5;
  const lines = Number.isFinite(rawLines) && rawLines > 0 ? Math.floor(rawLines) : 5;

  return {
    title: stripAllFormatting(rawTitle),
    content: removeOrdinalHeadingLabelsFromBody(rawContent),
    lines,
    selectedHeadings: runOptions.selectedHeadings ?? [],
    structuredContent: structured,
    hashtags: normalizedHashtags,
    ctaLink: runOptions.ctaLink?.trim(),
    ctaText: runOptions.ctaText?.trim(),
    ctas,
    ctaPosition: runOptions.ctaPosition || 'bottom',
    skipCta: runOptions.skipCta || false,
    images: normalizeAutomationImages(runOptions.images, log),
    publishMode: (runOptions.publishMode ?? 'publish') as PublishMode,
    scheduleDate,
    scheduleType: runOptions.scheduleType || 'naver-server',
    scheduleMethod: runOptions.scheduleMethod || 'datetime-local',
    skipImages: runOptions.skipImages || runOptions.imageMode === 'skip' || false,
    imageMode: runOptions.imageMode,
    collectedImages: runOptions.collectedImages,
    toneStyle: runOptions.toneStyle ?? 'professional',
    categoryName: runOptions.categoryName,
    useIntelligentImagePlacement: runOptions.useIntelligentImagePlacement,
    onlyImagePlacement: runOptions.onlyImagePlacement,
    keepBrowserOpen: runOptions.keepBrowserOpen ?? true,
    affiliateLink: runOptions.affiliateLink?.trim(),
    useAffiliateVideo: runOptions.useAffiliateVideo ?? false,
    contentMode: runOptions.contentMode,
    useAiImage: runOptions.useAiImage,
    createProductThumbnail:
      runOptions.createProductThumbnail ||
      runOptions.contentMode === 'affiliate' ||
      !!runOptions.affiliateLink,
    includeThumbnailText: runOptions.includeThumbnailText || false,
    isFullAuto: runOptions.isFullAuto ?? false,
    previousPostTitle: runOptions.previousPostTitle,
    previousPostUrl: runOptions.previousPostUrl,
    thumbnailPath: runOptions.thumbnailPath,
  };
}
