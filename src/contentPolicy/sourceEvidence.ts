import { normalizeText } from './textMetrics.js';
import type { SourceMaterial } from './types.js';

const FACT_SIGNAL = /(?:\d[\d,.]*\s*(?:원|만원|천원|%|v|w|kg|g|cm|mm|인치|개|단계)|가격|판매가|할인가|옵션|모델|규격|크기|무게|소재|원산지|제조|호환|전원|배송|보증|구성품|기술|기능)/iu;

function cleanFactValue(value: string): string {
  return value.trim().replace(/[.!?。！？]+$/u, '');
}

function readerSafeFactLine(line: string): string {
  const labelled = line.match(/^([^:：]{1,30})\s*[:：]\s*(.+)$/u);
  if (!labelled) return line;
  const label = labelled[1].replace(/\s+/gu, ' ').trim();
  const value = cleanFactValue(labelled[2]);
  if (!value) return '';

  if (/^수집\s*시점\s*표시\s*가격$/u.test(label) || /^가격$/u.test(label)) {
    return `수집 당시 판매 페이지에 표시된 가격은 ${value}입니다.`;
  }
  if (label === '상품명') return `상품명은 ${value}입니다.`;
  if (label === '브랜드') return `브랜드는 ${value}입니다.`;
  if (label === '판매처') return `판매처는 ${value}입니다.`;
  return line;
}

function sourceLines(rawText: string): string[] {
  return rawText
    .replace(/<\/?source[^>]*>/giu, '\n')
    .replace(/\r\n?/gu, '\n')
    .split(/\n+|(?<=[.!?。！？])\s+/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .map(readerSafeFactLine)
    .filter((line) => line.length >= 8 && line.length <= 800);
}

export function extractPolicyFactLines(rawText: string, maxFacts = 50): string[] {
  if (!rawText.trim() || maxFacts <= 0) return [];
  const seen = new Set<string>();
  const candidates = sourceLines(rawText)
    .map((line, index) => ({
      line,
      index,
      score: (FACT_SIGNAL.test(line) ? 10 : 0) + (index < 20 ? 2 : 0),
    }))
    .filter(({ line }) => {
      const normalized = normalizeText(line);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, Math.floor(maxFacts)));

  return candidates.map(({ line }) => line);
}

export function resolvePolicySourceMaterialType(input: {
  url?: string;
  contentMode?: string;
  articleType?: string;
}): SourceMaterial['type'] {
  const url = String(input.url || '').trim();
  const contentMode = String(input.contentMode || '').toLowerCase();
  const articleType = String(input.articleType || '').toLowerCase();
  if (contentMode === 'business') return 'first_party';
  if (!url) return 'user_provided';
  const commerceSource = /(?:naver\.me|smartstore\.naver\.com|brand\.naver\.com|shopping\.naver\.com|brandconnect\.naver\.com|coupang\.com|coupa\.ng|11st\.co\.kr|gmarket\.co\.kr|amazon\.)/iu.test(url);
  if (commerceSource && (contentMode === 'affiliate' || articleType === 'shopping_review')) return 'official';
  if (/\.(?:go\.kr|gov)(?:\/|$)/iu.test(url)) return 'official';
  return 'reference';
}
