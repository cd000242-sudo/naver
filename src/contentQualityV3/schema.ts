function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

export const CONTENT_QUALITY_V3_REQUIRED_FIELDS = deepFreeze([
  'status',
  'generationTime',
  'selectedTitle',
  'titleAlternatives',
  'titleCandidates',
  'bodyHtml',
  'bodyPlain',
  'headings',
  'hashtags',
  'images',
  'metadata',
  'quality',
] as const);

const RISK_ENUM = ['low', 'medium', 'high'] as const;
const LEGAL_RISK_ENUM = ['safe', 'caution', 'danger'] as const;

// Provider-facing schema: keep only Google's documented generateContent subset.
// String length and semantic bounds remain the responsibility of app validation.
export const CONTENT_QUALITY_V3_OUTPUT_SCHEMA = deepFreeze({
  type: 'object',
  additionalProperties: false,
  required: CONTENT_QUALITY_V3_REQUIRED_FIELDS,
  properties: {
    status: {
      type: 'string',
      enum: ['success', 'warning'],
    },
    generationTime: {
      type: 'string',
    },
    selectedTitle: {
      type: 'string',
    },
    titleAlternatives: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: { type: 'string' },
    },
    titleCandidates: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'score', 'reasoning'],
        properties: {
          text: { type: 'string' },
          score: { type: 'number', minimum: 0, maximum: 100 },
          reasoning: { type: 'string' },
        },
      },
    },
    bodyHtml: {
      type: 'string',
    },
    bodyPlain: {
      type: 'string',
    },
    headings: {
      type: 'array',
      minItems: 3,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'content', 'summary', 'keywords', 'imagePrompt'],
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          summary: { type: 'string' },
          keywords: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string' },
          },
          imagePrompt: { type: 'string' },
        },
      },
    },
    hashtags: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: { type: 'string' },
    },
    images: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'prompt', 'placement', 'alt', 'caption'],
        properties: {
          heading: { type: 'string' },
          prompt: { type: 'string' },
          placement: { type: 'string' },
          alt: { type: 'string' },
          caption: { type: 'string' },
        },
      },
    },
    metadata: {
      type: 'object',
      additionalProperties: false,
      required: [
        'category',
        'targetAge',
        'urgency',
        'estimatedReadTime',
        'wordCount',
        'aiDetectionRisk',
        'legalRisk',
        'seoScore',
        'keywordStrategy',
        'publishTimeRecommend',
      ],
      properties: {
        category: { type: 'string' },
        targetAge: { type: 'string', enum: ['20s', '30s', '40s', '50s', 'all'] },
        urgency: { type: 'string', enum: ['breaking', 'depth', 'evergreen'] },
        estimatedReadTime: { type: 'string' },
        wordCount: { type: 'integer', minimum: 0, maximum: 100_000 },
        aiDetectionRisk: { type: 'string', enum: RISK_ENUM },
        legalRisk: { type: 'string', enum: LEGAL_RISK_ENUM },
        seoScore: { type: 'number', minimum: 0, maximum: 100 },
        keywordStrategy: { type: 'string' },
        publishTimeRecommend: { type: 'string' },
      },
    },
    quality: {
      type: 'object',
      additionalProperties: false,
      required: [
        'aiDetectionRisk',
        'legalRisk',
        'seoScore',
        'originalityScore',
        'readabilityScore',
        'warnings',
      ],
      properties: {
        aiDetectionRisk: { type: 'string', enum: RISK_ENUM },
        legalRisk: { type: 'string', enum: LEGAL_RISK_ENUM },
        seoScore: { type: 'number', minimum: 0, maximum: 100 },
        originalityScore: { type: 'number', minimum: 0, maximum: 100 },
        readabilityScore: { type: 'number', minimum: 0, maximum: 100 },
        warnings: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string' },
        },
      },
    },
  },
} as const);
