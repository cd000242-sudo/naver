/**
 * SPEC-NAVER-IMAGE-2026 — REAL ASSET RESOLVER (NAVER IMAGE PIPELINE V1 §4–§5).
 *
 * Before any image is generated: which real images does this post have, and which of them may be
 * composed into a cover? A URL or a search hit is not a licence (V1 §5), so only images the user put
 * into the post themselves — their own files, or results of a collection they explicitly ran — are
 * composable. Article images seen only as URLs and automatic web results stay REFERENCE_ONLY.
 * Pure: the file-existence check is injected.
 */
import { isAiGeneratedImage } from '../../automation/imageProvenance.js';
import { inferArticleVisualKind } from './sectionRolePlanner.js';

export type AssetClass = 'USER_ASSET' | 'SOURCE_ASSET' | 'REFERENCE_ONLY' | 'AI_ASSET' | 'INFOGRAPHIC';

export interface AssetEntry {
  readonly filePath?: string;
  readonly url?: string;
  readonly provider?: string;
  readonly source?: string;
  readonly isCollected?: boolean;
  readonly aiGenerated?: boolean;
  readonly heading?: string;
}

export interface ClassifiedAsset {
  readonly entry: AssetEntry;
  readonly assetClass: AssetClass;
  /** May be cropped / composed into the published cover. */
  readonly composable: boolean;
  readonly reason: string;
}

export interface AssetInventory {
  readonly assets: readonly ClassifiedAsset[];
  /** Local file paths of composable real photos, in slot order (max 2). */
  readonly composable: readonly string[];
  readonly counts: Readonly<Record<AssetClass, number>>;
}

const USER_PROVIDERS = /^(?:local|local-folder|narrative|user|manual)$/u;
const USER_RUN_SOURCES = /^(?:issue-endgame|url-only-collect|url-only|doc-capture|official-doc|local|user|manual)$/u;
const AUTO_WEB = /^(?:auto-search|crawled|naver|google|search)$/u;
const INFOGRAPHIC = /table|comparison|infographic|cta-banner|chart/u;
const REMOTE = /^(?:https?:|data:|blob:)/iu;

export function classifyImageAsset(entry: AssetEntry, isLocalFile: (filePath: string) => boolean): ClassifiedAsset {
  const provider = String(entry.provider || '').trim().toLowerCase();
  const source = String(entry.source || '').trim().toLowerCase();
  const filePath = String(entry.filePath || '').trim();
  const local = Boolean(filePath) && !REMOTE.test(filePath) && isLocalFile(filePath);
  const done = (assetClass: AssetClass, composable: boolean, reason: string): ClassifiedAsset =>
    ({ entry, assetClass, composable, reason });

  if (INFOGRAPHIC.test(provider) || INFOGRAPHIC.test(source)) return done('INFOGRAPHIC', false, '표·비교·배너 이미지');
  if (isAiGeneratedImage({ provider, source, isCollected: entry.isCollected, aiGenerated: entry.aiGenerated })) {
    return done('AI_ASSET', false, 'AI 생성 이미지');
  }
  if (!local) return done('REFERENCE_ONLY', false, filePath ? '원격 URL — 사용 권한 미확인' : '파일 없음');
  if (AUTO_WEB.test(source) || AUTO_WEB.test(provider)) return done('REFERENCE_ONLY', false, '자동 웹 검색 결과 — 사용 권한 미확인');
  if (USER_PROVIDERS.test(provider)) return done('USER_ASSET', true, '사용자가 직접 넣은 사진');
  if (USER_RUN_SOURCES.test(source) || USER_RUN_SOURCES.test(provider)) {
    return done('SOURCE_ASSET', true, '사용자가 직접 실행한 수집(동의) 후 본문에 배치한 사진');
  }
  return done('REFERENCE_ONLY', false, '출처 불명 — 합성하지 않음');
}

/**
 * Inventory for one post: images already placed in its slots, plus article/source images known only
 * as URLs (always REFERENCE_ONLY — V1 §5).
 */
export function resolveRealAssets(
  input: { readonly placed?: readonly AssetEntry[]; readonly sourceUrls?: readonly string[] },
  isLocalFile: (filePath: string) => boolean,
): AssetInventory {
  const placed = (input.placed || []).map((entry) => classifyImageAsset(entry, isLocalFile));
  const remote = (input.sourceUrls || [])
    .map((url) => String(url || '').trim())
    .filter(Boolean)
    .map((url): ClassifiedAsset => ({ entry: { url }, assetClass: 'REFERENCE_ONLY', composable: false, reason: '기사·출처 URL 이미지 — 참고용' }));
  const assets = [...placed, ...remote];
  const counts = { USER_ASSET: 0, SOURCE_ASSET: 0, REFERENCE_ONLY: 0, AI_ASSET: 0, INFOGRAPHIC: 0 };
  for (const asset of assets) counts[asset.assetClass] += 1;
  const composable: string[] = [];
  for (const asset of placed) {
    const filePath = String(asset.entry.filePath || '').trim();
    if (asset.composable && filePath && !composable.includes(filePath)) composable.push(filePath);
    if (composable.length >= 2) break;
  }
  return { assets, composable, counts };
}

const REAL_PRIORITY = /연예|배우|가수|아이돌|방송|예능|드라마|팬심|고백|열애|결혼|웨딩|컴백|출연|스포츠|선수|경기|자동차|차량|전기차|SUV|트림|출고가|주행거리|신차|제품|출시|리뷰|여행|축제|명소|관광|사건|현장|사고|고소|항소|구형|선고|징역|건물|시설|개관|개장|매장/iu;

/** V1 §4: topics where a real photo should come before any AI picture. */
export function isRealAssetPriorityTopic(title: string, category?: string): boolean {
  const text = `${category || ''} ${title || ''}`;
  return REAL_PRIORITY.test(text) || inferArticleVisualKind(category, title) !== 'info';
}

export function summarizeInventory(inventory: AssetInventory): string {
  const c = inventory.counts;
  return `사용자 ${c.USER_ASSET} · 수집(배치) ${c.SOURCE_ASSET} · 참고용 ${c.REFERENCE_ONLY} · AI ${c.AI_ASSET} · 표/배너 ${c.INFOGRAPHIC}`;
}
