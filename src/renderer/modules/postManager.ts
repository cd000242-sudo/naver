// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-04-03 모듈화] Post CRUD 모듈
// renderer.ts에서 추출된 글 저장/로드/삭제/복사/미리보기/내보내기/가져오기 기능
// ═══════════════════════════════════════════════════════════════════

import type { GeneratedPost } from '../types/index.js';
import { GENERATED_POSTS_KEY, getCurrentNaverId } from '../utils/postStorageUtils.js';
import { safeLocalStorageSetItem } from '../utils/storageUtils.js';
import { normalizeCategory } from '../utils/categoryNormalizeUtils.js';
import { escapeHtml } from '../utils/htmlUtils.js';
import { toFileUrlMaybe } from '../utils/headingKeyUtils.js';
import { formatContentForPreview } from '../utils/textFormatUtils.js';
import { getRequiredImageBasePath } from '../utils/imageHelpers.js';
import { refreshGeneratedPostsList, loadGeneratedPostToFields } from './postListUI.js';

// ✅ renderer.ts의 전역 변수/함수 참조 (인라인 빌드에서 동일 스코프)
declare let currentPostId: string | null;
declare let generatedImages: any[];
declare const ImageManager: any;
declare const UnifiedDOMCache: any;
declare function appendLog(msg: string): void;
declare function readUnifiedCtasFromUi(): Array<{ text: string; link?: string }>;

// ═══════════════════════════════════════════════════════════════════
// 카테고리 정규화 유틸리티
// ═══════════════════════════════════════════════════════════════════

// ✅ [2026-03-14 FIX] 영어 카테고리 코드 → 한글 변환 맵
const ENGLISH_TO_KOREAN_CATEGORY: Record<string, string> = {
  'general': '일상·생각',
  'literature': '문학·책',
  'movie': '영화',
  'art_design': '미술·디자인',
  'performance': '공연·전시',
  'music': '음악',
  'drama': '드라마',
  'celebrity': '스타·연예인',
  'cartoon': '만화·애니',
  'broadcast': '방송',
  'tips': '생활 꿀팁',
  'parenting': '육아·결혼',
  'pet': '반려동물',
  'good_writing': '좋은글·이미지',
  'fashion': '패션·미용',
  'interior': '인테리어·DIY',
  'food_recipe': '요리·레시피',
  'shopping_review': '상품리뷰',
  'gardening': '원예·재배',
  'game': '게임',
  'sports': '스포츠',
  'photo': '사진',
  'car': '자동차',
  'hobby': '취미',
  'travel_domestic': '국내여행',
  'travel_world': '세계여행',
  'tasty_restaurant': '맛집',
  'it_computer': 'IT·컴퓨터',
  'society_politics': '사회·정치',
  'health': '건강·의학',
  'business_economy': '비즈니스·경제',
  'language': '어학·외국어',
  'education_scholarship': '교육·학문',
  'realestate': '부동산',
  'self_dev': '자기계발',
  'entertainment': '스타·연예인',
  'shopping': '상품리뷰',
  'tech': 'IT·컴퓨터',
  'affiliate': '상품리뷰',
  'seo': '일상·생각',
  'homefeed': '일상·생각',
};

export function normalizeGeneratedPostCategoryKey(raw: unknown): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 'uncategorized';
  // ✅ [2026-03-14 FIX] 영어 카테고리 코드 → 한글 변환
  const lower = trimmed.toLowerCase();
  if (ENGLISH_TO_KOREAN_CATEGORY[lower]) return ENGLISH_TO_KOREAN_CATEGORY[lower];
  // ✅ [2026-02-02 FIX] 사용자가 선택한 콘텐츠 카테고리 그대로 폴더명으로 사용
  return trimmed;
}

export function getGeneratedPostCategoryLabel(categoryKey: string): string {
  const key = normalizeGeneratedPostCategoryKey(categoryKey);
  if (!key || key === 'uncategorized') return '미분류';
  return key;
}

const GENERATED_POSTS_CATEGORY_COLLAPSE_PREFIX = 'generated_posts_category_collapsed:';

export function isGeneratedPostCategoryCollapsed(categoryKey: string): boolean {
  const key = normalizeGeneratedPostCategoryKey(categoryKey);
  return localStorage.getItem(`${GENERATED_POSTS_CATEGORY_COLLAPSE_PREFIX}${key}`) === '1';
}

export function setGeneratedPostCategoryCollapsed(categoryKey: string, collapsed: boolean): void {
  const key = normalizeGeneratedPostCategoryKey(categoryKey);
  localStorage.setItem(`${GENERATED_POSTS_CATEGORY_COLLAPSE_PREFIX}${key}`, collapsed ? '1' : '0');
}

// ═══════════════════════════════════════════════════════════════════
// 마이그레이션 함수
// ═══════════════════════════════════════════════════════════════════

/**
 * ✅ [100점 수정] 기존 저장된 글의 카테고리 마이그레이션
 * 영어 카테고리를 한글로 자동 통일
 */
export function migratePostCategories(): number {
  try {
    const data = localStorage.getItem(GENERATED_POSTS_KEY);
    if (!data) return 0;

    const posts: GeneratedPost[] = JSON.parse(data);
    let migrated = 0;

    posts.forEach(post => {
      const oldCategory = post.category || post.articleType || '';
      const normalized = normalizeCategory(oldCategory);

      if (normalized && normalized !== post.category) {
        post.category = normalized;
        migrated++;
        console.log(`[Migration] "${post.title}" 카테고리: "${oldCategory}" → "${normalized}"`);
      }
    });

    if (migrated > 0) {
      localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
      console.log(`[Migration] ✅ ${migrated}개 글 카테고리 정규화 완료`);
    }

    return migrated;
  } catch (error) {
    console.error('[Migration] 카테고리 마이그레이션 실패:', error);
    return 0;
  }
}

// ✅ 앱 시작 시 마이그레이션 자동 실행
let categoryMigrationDone = false;
export function ensureCategoryMigration(): void {
  if (categoryMigrationDone) return;
  categoryMigrationDone = true;
  const count = migratePostCategories();
  if (count > 0) {
    console.log(`[Migration] 🔄 ${count}개 글 카테고리가 한글로 통일되었습니다.`);
  }
}

// ✅ [2026-01-24] 기존 계정별 저장소 데이터를 전역 저장소로 병합 마이그레이션
const GLOBAL_MIGRATION_DONE_KEY = 'naver_blog_posts_migration_global_done';

export function migrateAccountPostsToGlobal(): void {
  if (localStorage.getItem(GLOBAL_MIGRATION_DONE_KEY)) return; // 이미 완료됨

  try {
    console.log('[Migration] 🔄 계정별 저장소 → 전역 저장소 병합 시작...');

    const allPosts: GeneratedPost[] = [];
    const seenIds = new Set<string>();

    // 1. 기존 전역 저장소의 글 먼저 로드
    const globalData = localStorage.getItem(GENERATED_POSTS_KEY);
    if (globalData) {
      const globalPosts: GeneratedPost[] = JSON.parse(globalData);
      globalPosts.forEach(p => {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          allPosts.push(p);
        }
      });
    }

    // 2. 계정별 저장소에서도 글 병합
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('naver_blog_generated_posts_') && key !== GENERATED_POSTS_KEY) {
        try {
          const accountData = localStorage.getItem(key);
          if (accountData) {
            const accountPosts: GeneratedPost[] = JSON.parse(accountData);
            accountPosts.forEach(p => {
              if (!seenIds.has(p.id)) {
                seenIds.add(p.id);
                allPosts.push(p);
              }
            });
            console.log(`[Migration] ✅ ${key}: ${accountPosts.length}개 글 병합`);
          }
        } catch (e) {
          console.warn(`[Migration] ⚠️ ${key} 파싱 실패:`, e);
        }
      }
    }

    // 3. 전역 저장소에 통합 저장
    localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(allPosts));
    console.log(`[Migration] ✅ 전역 저장소에 총 ${allPosts.length}개 글 통합 완료`);

    // 마이그레이션 완료 표시
    localStorage.setItem(GLOBAL_MIGRATION_DONE_KEY, 'true');
    console.log(`[Migration] ✅ 전역 저장소 마이그레이션 완료!`);
  } catch (error) {
    console.error('[Migration] ❌ 전역 마이그레이션 실패:', error);
  }
}

// ✅ [2026-02-26] 레거시 글의 naverId 백필 마이그레이션
const NAVERID_BACKFILL_DONE_KEY = 'naver_blog_posts_naverid_backfill_done';
export function backfillNaverIdForLegacyPosts(): void {
  if (localStorage.getItem(NAVERID_BACKFILL_DONE_KEY)) return;
  try {
    const raw = localStorage.getItem(GENERATED_POSTS_KEY);
    if (!raw) { localStorage.setItem(NAVERID_BACKFILL_DONE_KEY, 'true'); return; }
    const posts: GeneratedPost[] = JSON.parse(raw);
    const missingNaverId = posts.filter(p => !p.naverId);
    if (missingNaverId.length === 0) { localStorage.setItem(NAVERID_BACKFILL_DONE_KEY, 'true'); return; }

    // 현재 활성 계정 확인
    const currentId = getCurrentNaverId();
    // naverId가 있는 글에서 고유 계정 목록 수집
    const existingIds = new Set(posts.filter(p => p.naverId).map(p => p.naverId));

    if (currentId && existingIds.size <= 1) {
      // 단일 계정: 자동 배정
      missingNaverId.forEach(p => { (p as any).naverId = currentId; });
      console.log(`[Migration] ✅ ${missingNaverId.length}개 레거시 글에 naverId '${currentId}' 자동 배정`);
    } else {
      console.log(`[Migration] ℹ️ 다중 계정 감지 (${existingIds.size}개) - 레거시 글 ${missingNaverId.length}개는 미지정 유지`);
    }

    safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
    localStorage.setItem(NAVERID_BACKFILL_DONE_KEY, 'true');
  } catch (err) {
    console.error('[Migration] 레거시 naverId 백필 실패:', err);
  }
}

// ✅ [레거시 호환] 기존 함수명 유지 (호출부 오류 방지)
export function migratePostsToPerAccount(): void {
  migrateAccountPostsToGlobal();
  backfillNaverIdForLegacyPosts(); // ✅ [2026-02-26] naverId 백필도 실행
}

// ═══════════════════════════════════════════════════════════════════
// CRUD 함수
// ═══════════════════════════════════════════════════════════════════

// ✅ [2026-01-24 FIX] 계정별 분리 제거 - 전역 저장소에서 모든 글 로드
export function loadGeneratedPosts(naverId?: string): GeneratedPost[] {
  // 기존 계정별 데이터를 전역으로 병합 (한 번만)
  migrateAccountPostsToGlobal();

  try {
    const data = localStorage.getItem(GENERATED_POSTS_KEY);
    if (data) {
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('생성된 글 목록 로드 실패:', error);
    return [];
  }
}

// ✅ [2026-01-24 FIX] 모든 글 로드 - loadGeneratedPosts와 동일 (계정별 분리 제거됨)
export function loadAllGeneratedPosts(): GeneratedPost[] {
  return loadGeneratedPosts();
}

export function loadGeneratedPost(postId: string): GeneratedPost | null {
  // 현재 계정에서 먼저 찾기
  const currentPosts = loadGeneratedPosts();
  const found = currentPosts.find(p => p.id === postId);
  if (found) return found;

  // 전역에서도 찾기 (레거시 호환)
  try {
    const globalData = localStorage.getItem(GENERATED_POSTS_KEY);
    if (globalData) {
      const allPosts: GeneratedPost[] = JSON.parse(globalData);
      return allPosts.find(p => p.id === postId) || null;
    }
  } catch { /* ignore */ }

  return null;
}

export function saveGeneratedPostFromData(
  structuredContent: any,
  images: any[] = [],
  overrides?: { category?: string; toneStyle?: string; ctaText?: string; ctaLink?: string; naverId?: string }
): string | null {
  try {
    console.log('[SavePost] 생성된 글 저장 시작...');

    if (!structuredContent) {
      console.error('[SavePost] ❌ 저장 실패: structuredContent가 없습니다.');
      return null;
    }

    const posts = loadGeneratedPosts();
    const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const categoryFromContent = String((structuredContent as any)?.articleType || (structuredContent as any)?.category || '').trim();
    // ✅ [2026-03-14 FIX] UI에서 선택된 콘텐츠 카테고리를 폴백으로 사용
    const categoryFromUI = (document.getElementById('unified-article-type') as HTMLSelectElement)?.value || '';
    // ✅ [2026-03-14 FIX] 영어 코드가 저장될 때 normalizeGeneratedPostCategoryKey로 한글 변환
    const rawCategory = String(overrides?.category || categoryFromContent || categoryFromUI || '').trim();
    const resolvedCategory = normalizeGeneratedPostCategoryKey(rawCategory);

    const normalizedImages = (images || []).map((img: any) => ({
      heading: img.heading || '',
      provider: img.provider || img.source || img.engine || 'unknown',
      filePath: img.filePath || '',
      previewDataUrl: img.previewDataUrl || img.url || img.filePath || '',
      url: img.url || img.link || img.previewDataUrl || img.filePath || '',
      thumbnail: img.thumbnail || '',
      savedToLocal: img.savedToLocal || false,
      isThumbnail: img.isThumbnail || false, // ✅ [2026-03-09 FIX] 썸네일 플래그 보존
    }));

    // ✅ [2026-03-29 FIX] localStorage 할당량 초과 방지: structuredContent 경량화
    const lightHeadings = (structuredContent?.headings || []).map((h: any) => ({
      title: h.title || '',
    }));
    const lightStructuredContent = {
      selectedTitle: structuredContent?.selectedTitle || '',
      hashtags: structuredContent?.hashtags || [],
      articleType: structuredContent?.articleType || '',
      category: structuredContent?.category || '',
      toneStyle: structuredContent?.toneStyle || '',
    };

    // ✅ [2026-03-29 FIX] 이미지 base64 데이터 URL 제거 (1개당 수백KB)
    const lightImages = normalizedImages.map((img: any) => ({
      heading: img.heading || '',
      provider: img.provider || 'unknown',
      filePath: img.filePath || '',
      url: (img.url && !img.url.startsWith('data:')) ? img.url : '',
      isThumbnail: img.isThumbnail || false,
      savedToLocal: img.savedToLocal || false,
    }));

    const post: GeneratedPost = {
      id: postId,
      title: structuredContent?.selectedTitle || '',
      content: (structuredContent?.bodyPlain || structuredContent?.content || '').substring(0, 200), // 미리보기용 200자만
      hashtags: structuredContent?.hashtags || [],
      headings: lightHeadings,
      structuredContent: lightStructuredContent,
      createdAt: now,
      updatedAt: now,
      images: lightImages.length > 0 ? lightImages : undefined,
      imageCount: normalizedImages.length || undefined,
      isFavorite: false,
      category: resolvedCategory || undefined,
      publishedUrl: undefined,
      publishedAt: undefined,
      isPublished: false,
      toneStyle: String(overrides?.toneStyle || structuredContent?.toneStyle || 'professional'),
      ctaText: String(overrides?.ctaText || ''),
      ctaLink: String(overrides?.ctaLink || ''),
      naverId: overrides?.naverId || getCurrentNaverId() || undefined,
    };

    posts.unshift(post);
    if (posts.length > 100) posts.pop();

    // ✅ [2026-01-24 FIX] 전역 저장소에 저장
    const storageKey = GENERATED_POSTS_KEY;
    console.log(`[SavePost] 저장소: ${storageKey}, naverId: ${post.naverId || '(미지정)'}`);
    const saveSuccess = safeLocalStorageSetItem(storageKey, JSON.stringify(posts));

    if (!saveSuccess) {
      console.error('[SavePost] ❌ localStorage 저장 실패!');
      return null;
    }

    // ✅ [Bug Fix] 저장 검증
    try {
      const verifyPosts = loadGeneratedPosts();
      const saved = verifyPosts.find((p: any) => p.id === postId);
      if (!saved) {
        console.error('[SavePost] ❌ 저장 검증 실패: 저장된 글을 찾을 수 없습니다.');
        return null;
      }
      console.log(`[SavePost] ✅ 저장 검증 성공 (ID: ${postId}, 제목: ${post.title?.substring(0, 20)}...)`);
    } catch (verifyErr) {
      console.error('[SavePost] ⚠️ 저장 검증 중 오류:', verifyErr);
    }

    // ✅ UI 갱신
    try {
      refreshGeneratedPostsList();
      console.log('[SavePost] ✅ 생성된 글 목록 UI 갱신 완료');
    } catch (refreshErr) {
      console.error('[SavePost] ⚠️ UI 갱신 실패:', refreshErr);
    }

    console.log(`[SavePost] ✅ 저장 완료 (ID: ${postId})`);
    return postId;
  } catch (error) {
    console.error('[SavePost] ❌ 생성된 글 저장 실패(다계정):', error);
    return null;
  }
}

export function saveGeneratedPost(structuredContent: any, isUpdate: boolean = false, overrides?: { category?: string }): string | null {
  try {
    const posts = loadGeneratedPosts();
    const title = structuredContent.selectedTitle || '';

    // ✅ 중복 저장 방지: 같은 제목의 글이 60초 이내에 저장되었으면 해당 postId 재사용
    if (!isUpdate && title) {
      const now = Date.now();
      const recentPost = posts.find(p => {
        const createdAt = new Date(p.createdAt).getTime();
        const isRecent = (now - createdAt) < 60000; // 60초 이내
        const sameTitle = p.title === title;
        return isRecent && sameTitle;
      });

      if (recentPost) {
        console.log(`[saveGeneratedPost] 중복 방지: 같은 제목의 글이 최근에 저장됨 (ID: ${recentPost.id})`);
        currentPostId = recentPost.id;
        return recentPost.id; // 기존 postId 반환 (새로 저장하지 않음)
      }
    }

    // ✅ 새 글 저장은 항상 새 postId 생성 (이전 글 덮어쓰기 방지)
    // ✅ 업데이트 저장(isUpdate=true)만 currentPostId 재사용
    const postId = (isUpdate && currentPostId)
      ? currentPostId
      : `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    currentPostId = postId; // 전역 변수에 저장

    const now = new Date().toISOString();

    // 기존 글 찾기
    const existingIndex = posts.findIndex(p => p.id === postId);
    const existingPost = existingIndex >= 0 ? posts[existingIndex] : null;

    // ✅ CTA 필드 값 가져오기
    const ctas = readUnifiedCtasFromUi();
    const ctaText = ctas[0]?.text || (document.getElementById('unified-cta-text') as HTMLInputElement)?.value?.trim() || '';
    const ctaLink = ctas[0]?.link || (document.getElementById('unified-cta-link') as HTMLInputElement)?.value?.trim() || '';

    // ✅ [100점 수정] 카테고리: 블로그 폴더 카테고리 우선 사용 (기사 유형이 아님!)
    const blogFolderCategory = UnifiedDOMCache.getRealCategory() || '';
    const categoryFromContent = String((structuredContent as any)?.category || '').trim();
    // ✅ overrides.category 우선 적용, 그 다음 블로그 폴더, 콘텐츠 순
    const rawCategory = overrides?.category || blogFolderCategory || categoryFromContent || (existingPost?.category || '');
    // ✅ 카테고리 정규화 적용 (영어 → 한글 통일)
    const resolvedCategory = normalizeCategory(rawCategory);

    const imagesForSave = (() => {
      try {
        const fromWindow = (window as any).imageManagementGeneratedImages;
        if (Array.isArray(fromWindow) && fromWindow.length > 0) return fromWindow;
      } catch (e) {
        console.warn('[renderer] catch ignored:', e);
      }
      try {
        const fromManager = ImageManager.getAllImages();
        if (Array.isArray(fromManager) && fromManager.length > 0) return fromManager;
      } catch (e) {
        console.warn('[renderer] catch ignored:', e);
      }
      return Array.isArray(generatedImages) ? generatedImages : [];
    })();

    const normalizedImagesForSave = (imagesForSave || []).map((img: any) => ({
      heading: img.heading || '',
      provider: img.provider || img.source || img.engine || 'unknown',
      filePath: img.filePath || img.url || img.previewDataUrl || '',
      previewDataUrl: img.previewDataUrl || img.url || img.filePath || '',
      url: img.url || img.link || img.previewDataUrl || img.filePath || '',
      thumbnail: img.thumbnail || '',
      savedToLocal: img.savedToLocal || false,
    }));

    // ✅ [2026-01-22] 현재 계정 ID 가져오기
    const currentNaverId = getCurrentNaverId();

    // ✅ [2026-01-22] 쇼핑커넥트 모드 정보 가져오기
    const affiliateLinkInput = document.getElementById('unified-affiliate-link') as HTMLInputElement | null;
    const affiliateLinkValue = affiliateLinkInput?.value?.trim() || structuredContent.affiliateLink || '';
    const contentModeValue = structuredContent.contentMode ||
      (document.querySelector('input[name="article-type"]:checked') as HTMLInputElement)?.value ||
      'seo';

    // ✅ [2026-03-29 FIX] localStorage 할당량 초과 방지: 경량화 (saveGeneratedPostFromData와 동일)
    const lightHeadings2 = (structuredContent.headings || []).map((h: any) => ({
      title: h.title || '',
    }));
    const lightStructuredContent2 = {
      selectedTitle: structuredContent.selectedTitle || '',
      hashtags: structuredContent.hashtags || [],
      articleType: structuredContent.articleType || '',
      category: structuredContent.category || '',
      toneStyle: structuredContent.toneStyle || '',
    };
    const lightImages2 = (normalizedImagesForSave || []).map((img: any) => ({
      heading: img.heading || '',
      provider: img.provider || 'unknown',
      filePath: img.filePath || '',
      url: (img.url && !img.url.startsWith('data:')) ? img.url : '',
      isThumbnail: img.isThumbnail || false,
      savedToLocal: img.savedToLocal || false,
    }));

    const post: GeneratedPost = {
      id: postId,
      title: structuredContent.selectedTitle || '',
      content: (structuredContent.bodyPlain || structuredContent.content || '').substring(0, 200), // 미리보기용 200자만
      hashtags: structuredContent.hashtags || [],
      headings: lightHeadings2,
      structuredContent: lightStructuredContent2,
      createdAt: existingPost?.createdAt || now, // 기존 생성일 유지
      updatedAt: isUpdate ? now : (existingPost?.updatedAt || now), // 업데이트 시에만 수정일 갱신
      // ✅ 새 글에서는 이전 글 이미지 상속 금지 (미리보기 이미지 섞임 방지)
      images: lightImages2.length > 0
        ? lightImages2
        : (isUpdate ? (existingPost?.images || undefined) : undefined),
      isFavorite: existingPost?.isFavorite || false, // 기존 즐겨찾기 유지
      category: resolvedCategory || undefined,
      publishedUrl: existingPost?.publishedUrl || undefined, // 기존 발행 URL 유지
      publishedAt: existingPost?.publishedAt || undefined, // 기존 발행일 유지
      toneStyle: structuredContent.toneStyle || 'professional', // ✅ 글 톤 저장
      ctaText: ctaText || existingPost?.ctaText || '', // ✅ CTA 텍스트 저장
      ctaLink: ctaLink || existingPost?.ctaLink || '', // ✅ CTA 링크 저장
      ctas: ctas.length > 0 ? ctas : (existingPost as any)?.ctas || undefined,
      naverId: currentNaverId || existingPost?.naverId || undefined, // ✅ [2026-01-22] 계정 ID 저장
      // ✅ [2026-01-22] 쇼핑커넥트 구분용 필드 추가
      affiliateLink: affiliateLinkValue || existingPost?.affiliateLink || undefined,
      contentMode: contentModeValue || existingPost?.contentMode || undefined,
    };

    // 기존 글 업데이트 또는 새로 추가
    if (existingIndex >= 0) {
      posts[existingIndex] = post; // 기존 글 업데이트
    } else {
      posts.unshift(post); // 최신 글을 맨 위에
      if (posts.length > 100) posts.pop(); // 최대 100개만 저장
    }

    // ✅ [2026-01-24 FIX] 전역 저장소에 저장 (계정별 분리 제거)
    safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
    appendLog(`💾 생성된 글이 목록에 저장되었습니다. (ID: ${postId})`);

    // ✅ [2026-01-23 FIX] 저장 후 UI 갱신 (모든 발행 모드에서 글 목록 반영)
    try {
      refreshGeneratedPostsList();
    } catch (e) {
      console.warn('[saveGeneratedPost] UI 갱신 실패:', e);
    }

    return postId;
  } catch (error) {
    console.error('생성된 글 저장 실패:', error);
    return null;
  }
}

// ✅ 발행 완료 시 글 정보 업데이트
// ✅ [2026-03-05] publishMode 파라미터 추가 (임시/즉시/예약 구분)
export function updatePostAfterPublish(postId: string, publishedUrl: string, publishMode?: 'draft' | 'publish' | 'schedule'): void {
  try {
    const posts = loadGeneratedPosts();
    const post = posts.find(p => p.id === postId);
    if (post) {
      post.publishedUrl = publishedUrl;
      post.publishedAt = new Date().toISOString();
      post.updatedAt = new Date().toISOString();
      post.isPublished = true; // ✅ 발행 상태 추가
      post.naverId = post.naverId || getCurrentNaverId() || undefined; // ✅ [2026-03-11 FIX] 기존 naverId 우선 유지
      // ✅ [2026-03-05] 발행 모드 저장 (임시발행/즉시발행/예약발행 구분)
      if (publishMode) {
        (post as any).publishMode = publishMode;
      }

      const index = posts.findIndex(p => p.id === postId);
      if (index >= 0) {
        posts[index] = post;
        safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
        // ✅ [2026-03-05] 발행 모드에 따른 상태 메시지
        const modeLabel = publishMode === 'draft' ? '📝 임시발행됨' : publishMode === 'schedule' ? '📅 예약발행됨' : '✅ 발행됨';
        appendLog(`${modeLabel}: "${post.title}"`);
        // ✅ [2026-03-05] localStorage 이중 백업 (데이터 보존 강화)
        try {
          // ✅ [FIX] 백업도 100개 제한 — localStorage 용량 압박 방지
          const postsForBackup = posts.slice(0, 100);
          safeLocalStorageSetItem(`${GENERATED_POSTS_KEY}_backup`, JSON.stringify(postsForBackup));
        } catch { /* 백업 실패 무시 */ }
        refreshGeneratedPostsList();
      }
    }
  } catch (error) {
    console.error('발행 정보 업데이트 실패:', error);
  }
}

// ✅ 발행 완료 시 이미지 정보 업데이트
export function updatePostImages(postId: string, images: any[]): void {
  try {
    const posts = loadGeneratedPosts();
    const post = posts.find(p => p.id === postId);
    if (post) {
      // 이미지 정보 저장 (URL, provider, heading 등)
      post.images = images.map((img: any) => ({
        heading: img.heading || '',
        provider: img.provider || 'unknown',
        // ✅ 미리보기에서 필요한 필드 보존
        filePath: img.filePath || '',
        previewDataUrl: img.previewDataUrl || '',
        url: img.url || img.link || img.previewDataUrl || img.filePath || '',
        thumbnail: img.thumbnail || '',
        savedToLocal: img.savedToLocal || false,
      }));
      post.imageCount = images.length;
      post.updatedAt = new Date().toISOString();

      // ✅ [2026-01-24 FIX] 전역 저장소에 저장
      const index = posts.findIndex(p => p.id === postId);
      if (index >= 0) {
        posts[index] = post;
        safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
        appendLog(`✅ 이미지 정보가 업데이트되었습니다: ${images.length}개`);
        refreshGeneratedPostsList();
      }
    }
  } catch (error) {
    console.error('이미지 정보 업데이트 실패:', error);
  }
}

// ✅ [2026-01-26 FIX] 전역 저장소에서 글 삭제
export function deleteGeneratedPost(postId: string): void {
  try {
    const posts = loadGeneratedPosts();
    const filtered = posts.filter(p => p.id !== postId);
    safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(filtered));

    // ✅ 이미지 폴더도 삭제
    if (postId) {
      deletePostImageFolder(postId);
    }

    appendLog(`🗑️ 생성된 글이 삭제되었습니다. (ID: ${postId})`);
    console.log(`[DeletePost] ✅ 삭제 완료: ${postId}, 남은 글: ${filtered.length}개`);
  } catch (error) {
    console.error('생성된 글 삭제 실패:', error);
  }
}

// ✅ [2026-01-22] 계정별 글 복사
export function copyGeneratedPost(postId: string): void {
  const post = loadGeneratedPost(postId);
  if (!post) {
    alert('글을 찾을 수 없습니다.');
    return;
  }

  try {
    const naverId = getCurrentNaverId();
    const posts = loadGeneratedPosts();
    const newPostId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const copiedPost: GeneratedPost = {
      ...post,
      id: newPostId,
      createdAt: new Date().toISOString(),
      title: `${post.title} (복사본)`,
      naverId: naverId || post.naverId // 현재 계정으로 설정
    };

    posts.unshift(copiedPost);
    if (posts.length > 100) posts.pop();

    safeLocalStorageSetItem(GENERATED_POSTS_KEY, JSON.stringify(posts));
    appendLog(`📋 글이 복사되었습니다. (새 ID: ${newPostId})`);
    refreshGeneratedPostsList();
    alert('✅ 글이 복사되었습니다!');
  } catch (error) {
    console.error('글 복사 실패:', error);
    alert('글 복사에 실패했습니다.');
  }
}

// ✅ 글 미리보기 (모달) - 실제 블로그처럼 소제목 아래 이미지 배치
export function previewGeneratedPost(postId: string): void {
  const post = loadGeneratedPost(postId);
  if (!post) {
    alert('글을 찾을 수 없습니다.');
    return;
  }

  const date = new Date(post.createdAt);
  const dateStr = date.toLocaleString('ko-KR');

  // ✅ 실제 블로그처럼 본문 구성 (소제목 + 내용 + 이미지)
  const buildBlogStyleContent = (): string => {
    const headings = post.headings || [];
    const images = post.images || [];

    // 썸네일 (첫 번째 이미지)
    const thumbnailImage = images.length > 0 ? images[0] : null;
    const thumbnailHtml = thumbnailImage ? `
      <div style="margin-bottom: 1.5rem; text-align: center;">
        <img src="${toFileUrlMaybe(thumbnailImage.previewDataUrl || thumbnailImage.filePath || thumbnailImage.url || '')}"
             style="max-width: 100%; max-height: 400px; border-radius: 8px; object-fit: contain;"
             onerror="this.style.display='none';">
      </div>
    ` : '';

    // 도입부 (introduction)
    const introduction = (post as any).introduction;
    const introHtml = introduction ? `
      <div style="margin-bottom: 2rem; line-height: 1.8; color: var(--text-strong);">
        ${introduction.split('\n').map((p: string) => `<p style="margin-bottom: 0.75rem;">${p}</p>`).join('')}
      </div>
    ` : '';

    // 소제목별 콘텐츠 + 이미지
    let contentHtml = '';
    if (headings.length > 0) {
      headings.forEach((heading: any, index: number) => {
        const headingTitle = heading.title || heading;
        const headingContent = heading.content || '';
        // 소제목 이미지 (썸네일 제외하고 인덱스+1)
        const headingImage = images[index + 1] || null;

        contentHtml += `
          <div style="margin-bottom: 2rem;">
            <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--primary); margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--primary);">
              ${headingTitle}
            </h3>
            ${headingImage ? `
              <div style="margin-bottom: 1rem; text-align: center;">
                <img src="${toFileUrlMaybe(headingImage.previewDataUrl || headingImage.filePath || headingImage.url || '')}"
                     style="max-width: 100%; max-height: 350px; border-radius: 8px; object-fit: contain;"
                     onerror="this.style.display='none';">
              </div>
            ` : ''}
            ${headingContent ? `
              <div style="line-height: 1.8; color: var(--text-strong);">
                ${headingContent.split('\n').map((p: string) => `<p style="margin-bottom: 0.75rem;">${p}</p>`).join('')}
              </div>
            ` : ''}
          </div>
        `;
      });
    } else {
      // 소제목이 없으면 기존 방식으로 본문 표시
      contentHtml = `<div style="line-height: 1.8; color: var(--text-strong);">${formatContentForPreview(post.content)}</div>`;
    }

    // 마무리 (conclusion)
    const conclusion = (post as any).conclusion;
    const conclusionHtml = conclusion ? `
      <div style="margin-top: 2rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px; line-height: 1.8; color: var(--text-strong);">
        ${conclusion.split('\n').map((p: string) => `<p style="margin-bottom: 0.5rem;">${p}</p>`).join('')}
      </div>
    ` : '';

    return thumbnailHtml + introHtml + contentHtml + conclusionHtml;
  };

  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 10000; display: flex;
    align-items: center; justify-content: center; padding: 2rem;
  `;

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3); position: relative;">
      <button type="button" class="close-preview-btn" style="position: absolute; top: 1rem; right: 1rem; background: var(--bg-tertiary); border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.25rem; display: flex; align-items: center; justify-content: center;">×</button>

      <!-- 제목 -->
      <h2 style="margin: 0 0 0.5rem 0; color: var(--text-strong); font-size: 1.75rem; padding-right: 2rem; line-height: 1.4;">${post.title || '(제목 없음)'}</h2>
      <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-light);">
        📅 ${dateStr} | 📄 ${post.content.length.toLocaleString()}자 | 🖼️ ${post.images?.length || 0}개 이미지
      </div>

      <!-- 본문 (블로그 스타일) -->
      <div style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;">
        ${buildBlogStyleContent()}
      </div>

      <!-- 해시태그 -->
      ${post.hashtags.length > 0 ? `
        <div style="margin-bottom: 1.5rem;">
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            ${post.hashtags.map(tag => `<span style="background: var(--bg-tertiary); padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.875rem; color: var(--primary);">#${tag.replace(/^#/, '')}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- 버튼 -->
      <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button type="button" class="load-from-preview-btn" data-post-id="${postId}" style="flex: 1; padding: 0.75rem; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">📂 불러오기</button>
        ${post.publishedUrl ? `<button type="button" class="open-published-btn" data-url="${post.publishedUrl}" style="padding: 0.75rem 1.5rem; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">🔗 발행글 보기</button>` : ''}
        <button type="button" class="close-preview-btn" style="padding: 0.75rem 1.5rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer;">닫기</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll('.close-preview-btn').forEach(btn => {
    btn.addEventListener('click', () => modal.remove());
  });

  const loadBtn = modal.querySelector('.load-from-preview-btn');
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      modal.remove();
      loadGeneratedPostToFields(postId);
    });
  }

  // ✅ 발행글 보기 버튼 이벤트
  const openPublishedBtn = modal.querySelector('.open-published-btn');
  if (openPublishedBtn) {
    openPublishedBtn.addEventListener('click', () => {
      const url = openPublishedBtn.getAttribute('data-url');
      if (url) window.open(url, '_blank');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// ✅ 글 이미지 폴더 열기
export async function openPostImageFolder(postId: string): Promise<void> {
  try {
    if (!window.api.openPath) {
      appendLog('⚠️ 파일 시스템 API를 사용할 수 없습니다.');
      return;
    }

    const basePath = await getRequiredImageBasePath();

    const folderPath = `${basePath}/${postId}`.replace(/\\/g, '/');

    // 폴더 열기 (없으면 자동 생성됨)
    const result = await window.api.openPath(folderPath);

    if (result.success) {
      appendLog(`📂 이미지 폴더 열기: ${postId}`);
    } else {
      appendLog(`❌ 이미지 폴더 열기 실패: ${result.message || '알 수 없는 오류'}`);
    }
  } catch (error) {
    console.error('[Post] 이미지 폴더 열기 실패:', error);
    appendLog(`❌ 이미지 폴더 열기 실패: ${(error as Error).message}`);
  }
}

// ✅ 글 이미지 폴더 삭제
export async function deletePostImageFolder(postId: string): Promise<void> {
  try {
    if (!window.api.checkFileExists) {
      console.error('[Delete] 파일 시스템 API를 사용할 수 없습니다.');
      return;
    }

    const basePath = await getRequiredImageBasePath();

    const folderPath = `${basePath}/${postId}`.replace(/\\/g, '/');

    // 폴더 존재 확인
    const exists = await window.api.checkFileExists(folderPath);

    if (exists && window.api.deleteFolder) {
      const result = await window.api.deleteFolder(folderPath);
      if (result) {
        appendLog(`🗑️ 이미지 폴더가 삭제되었습니다: ${postId}`);
      }
    }
  } catch (error) {
    console.error('폴더 삭제 실패:', error);
  }
}

// ✅ 선택한 글만 내보내기 (JSON)
export function exportAllPosts(): void {
  try {
    // 체크박스로 선택한 글 가져오기
    const checkboxes = document.querySelectorAll('.post-checkbox:checked') as NodeListOf<HTMLInputElement>;
    const selectedPostIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-post-id')).filter(id => id !== null) as string[];

    let posts: GeneratedPost[];
    if (selectedPostIds.length > 0) {
      // 선택한 글만 내보내기
      const allPosts = loadGeneratedPosts();
      posts = allPosts.filter(post => selectedPostIds.includes(post.id));
      if (posts.length === 0) {
        alert('선택한 글이 없습니다.');
        return;
      }
    } else {
      // 선택한 글이 없으면 전체 내보내기
      posts = loadGeneratedPosts();
      if (posts.length === 0) {
        alert('내보낼 글이 없습니다.');
        return;
      }
    }

    const dataStr = JSON.stringify(posts, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `naver-blog-posts-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    appendLog(`📥 ${posts.length}개의 글이 내보내졌습니다.${selectedPostIds.length > 0 ? ` (선택한 ${selectedPostIds.length}개)` : ' (전체)'}`);
    alert(`✅ ${posts.length}개의 글이 내보내졌습니다!${selectedPostIds.length > 0 ? `\n\n선택한 ${selectedPostIds.length}개의 글만 내보냈습니다.` : '\n\n전체 글을 내보냈습니다.'}`);
  } catch (error) {
    console.error('글 내보내기 실패:', error);
    alert('글 내보내기에 실패했습니다.');
  }
}

// ✅ 글 가져오기 (JSON) - 선택 가능
export function importPosts(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedPosts = JSON.parse(text) as GeneratedPost[];

      if (!Array.isArray(importedPosts)) {
        throw new Error('올바른 형식의 파일이 아닙니다.');
      }

      if (importedPosts.length === 0) {
        alert('가져올 글이 없습니다.');
        return;
      }

      // 여러 글인 경우 선택 모달 표시
      if (importedPosts.length > 1) {
        showImportPostsSelectionModal(importedPosts);
      } else {
        // 글 1개면 바로 가져오기
        await importSelectedPosts([importedPosts[0]]);
      }
    } catch (error) {
      console.error('글 가져오기 실패:', error);
      alert(`글 가져오기에 실패했습니다: ${(error as Error).message}`);
    }
  };
  input.click();
}

// ✅ 가져올 글 선택 모달
function showImportPostsSelectionModal(importedPosts: GeneratedPost[]): void {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 10000; display: flex;
    align-items: center; justify-content: center; padding: 2rem;
  `;

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 800px; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3); position: relative;">
      <button type="button" class="close-import-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: var(--bg-tertiary); border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.25rem; display: flex; align-items: center; justify-content: center;">×</button>
      <h2 style="margin: 0 0 1rem 0; color: var(--text-strong); font-size: 1.5rem;">📤 가져올 글 선택</h2>
      <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem;">
        총 ${importedPosts.length}개의 글 중 가져올 글을 선택하세요.
      </div>
      <div style="margin-bottom: 1rem;">
        <button type="button" class="select-all-import-btn" style="padding: 0.5rem 1rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 4px; cursor: pointer; font-size: 0.875rem; margin-right: 0.5rem;">전체 선택</button>
        <button type="button" class="deselect-all-import-btn" style="padding: 0.5rem 1rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 4px; cursor: pointer; font-size: 0.875rem;">전체 해제</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.75rem; max-height: 50vh; overflow-y: auto; margin-bottom: 1.5rem;">
        ${importedPosts.map((post, index) => `
          <div style="padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-light);">
            <label style="display: flex; align-items: start; gap: 0.75rem; cursor: pointer;">
              <input type="checkbox" class="import-post-checkbox" data-index="${index}" checked style="margin-top: 0.25rem; width: 18px; height: 18px; cursor: pointer;">
              <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem;">${post.title || '(제목 없음)'}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">
                  📄 ${post.content.length.toLocaleString()}자 | 🖼️ ${post.images?.length || 0}개 | 📑 ${post.headings?.length || 0}개
                </div>
              </div>
            </label>
          </div>
        `).join('')}
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <button type="button" class="confirm-import-btn" style="flex: 1; padding: 0.75rem; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">가져오기</button>
        <button type="button" class="close-import-modal-btn" style="flex: 1; padding: 0.75rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">취소</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 전체 선택/해제
  modal.querySelector('.select-all-import-btn')?.addEventListener('click', () => {
    modal.querySelectorAll('.import-post-checkbox').forEach((cb: any) => {
      cb.checked = true;
    });
  });

  modal.querySelector('.deselect-all-import-btn')?.addEventListener('click', () => {
    modal.querySelectorAll('.import-post-checkbox').forEach((cb: any) => {
      cb.checked = false;
    });
  });

  // 가져오기 확인
  modal.querySelector('.confirm-import-btn')?.addEventListener('click', async () => {
    const checkboxes = modal.querySelectorAll('.import-post-checkbox:checked') as NodeListOf<HTMLInputElement>;
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.getAttribute('data-index') || '0'));
    const selectedPosts = selectedIndices.map(idx => importedPosts[idx]);

    if (selectedPosts.length === 0) {
      alert('가져올 글을 최소 1개 이상 선택해주세요.');
      return;
    }

    modal.remove();
    await importSelectedPosts(selectedPosts);
  });

  // 닫기
  modal.querySelectorAll('.close-import-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => modal.remove());
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// ✅ 선택한 글 가져오기
export async function importSelectedPosts(selectedPosts: GeneratedPost[]): Promise<void> {
  try {
    const existingPosts = loadGeneratedPosts();
    const newPosts = selectedPosts.map(post => ({
      ...post,
      id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // 새 ID 생성
      createdAt: new Date().toISOString() // 새 생성일
    }));

    const merged = [...newPosts, ...existingPosts];
    const unique = merged.filter((post, index, self) =>
      index === self.findIndex(p => p.id === post.id)
    );

    if (unique.length > 100) {
      unique.splice(100); // 최대 100개만 유지
    }

    localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(unique));
    appendLog(`📤 ${newPosts.length}개의 글이 가져와졌습니다.`);
    refreshGeneratedPostsList();
    alert(`✅ ${newPosts.length}개의 글이 가져와졌습니다!`);
  } catch (error) {
    console.error('글 가져오기 실패:', error);
    alert(`글 가져오기에 실패했습니다: ${(error as Error).message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 글 선택 모달 (CTA 이전글 엮기용)
// ═══════════════════════════════════════════════════════════════════

// ✅ 글 선택 모달 표시
export function showPostSelectionModal(
  posts: any[],
  onSelect: (post: any) => void,
  options?: { defaultCategory?: string }
): void {
  // 기존 모달 제거
  const existingModal = document.getElementById('post-selection-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'post-selection-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483646;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: var(--bg-primary);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  `;

  const normalizeKey = (v: unknown): string => {
    const s = String(v || '').trim();
    return s ? s : 'uncategorized';
  };

  let activeCategory = String(options?.defaultCategory || '').trim();
  const allCategoryKey = '__all__';
  if (!activeCategory) activeCategory = allCategoryKey;

  const categories = Array.from(
    new Set(
      (posts || []).map((p) => normalizeKey((p as any)?.category))
    )
  );
  categories.sort((a, b) => {
    if (a === 'uncategorized' && b !== 'uncategorized') return 1;
    if (b === 'uncategorized' && a !== 'uncategorized') return -1;
    return getGeneratedPostCategoryLabel(a).localeCompare(getGeneratedPostCategoryLabel(b), 'ko');
  });

  const computeList = (categoryKey: string) => {
    const filtered = (posts || []).filter((p) => {
      if (categoryKey === allCategoryKey) return true;
      return normalizeKey((p as any)?.category) === normalizeKey(categoryKey);
    });
    const published = filtered.filter((p) => p.publishedUrl);
    const unpublished = filtered.filter((p) => !p.publishedUrl);
    const sorted = [...published, ...unpublished].slice(0, 40);
    return { filtered, published, unpublished, sorted };
  };

  const initial = computeList(activeCategory);

  content.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h3 style="margin: 0; font-size: 1.25rem; color: var(--text-strong);">📝 이전 작성글 선택</h3>
      <button id="close-post-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
    </div>
    <p style="color: var(--text-muted); margin-bottom: 0.5rem; font-size: 0.9rem;">엮을 글을 선택하세요. 선택한 글의 링크가 CTA에 자동으로 입력됩니다.</p>
    <div style="display:flex; gap: 0.5rem; align-items:center; margin-bottom: 0.75rem; flex-wrap: wrap;">
      <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700;">카테고리</div>
      <select id="post-category-filter" style="flex: 1; min-width: 180px; padding: 0.45rem 0.6rem; border-radius: 8px; border: 1px solid var(--border-medium); background: var(--bg-secondary); color: var(--text-strong);">
        <option value="${allCategoryKey}">전체</option>
        ${categories
      .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(getGeneratedPostCategoryLabel(k))}</option>`)
      .join('')}
      </select>
    </div>
    <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
      <span id="post-selection-published-badge" style="padding: 0.25rem 0.5rem; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">✅ 발행됨 ${initial.published.length}개</span>
      <span id="post-selection-unpublished-badge" style="padding: 0.25rem 0.5rem; background: rgba(156, 163, 175, 0.15); color: var(--text-muted); border-radius: 4px; font-size: 0.8rem;">⏳ 미발행 ${initial.unpublished.length}개</span>
    </div>
    <div id="post-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
      ${initial.sorted.map((post, idx) => `
        <div class="post-item" data-post-index="${posts.indexOf(post)}" style="padding: 1rem; background: ${post.publishedUrl ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05))' : 'var(--bg-secondary)'}; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s; border: 2px solid ${post.publishedUrl ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-light)'};">
          <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
            <span style="font-size: 1.5rem; line-height: 1;">${post.publishedUrl ? '✅' : '⏳'}</span>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${post.title || '제목 없음'}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">
                ${post.createdAt ? new Date(post.createdAt).toLocaleDateString('ko-KR') : '날짜 없음'}
                ${post.publishedAt ? ' • 발행: ' + new Date(post.publishedAt).toLocaleDateString('ko-KR') : ''}
              </div>
              <div style="display:flex; gap: 0.4rem; align-items:center; margin-bottom: 0.35rem; flex-wrap: wrap;">
                <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(59,130,246,0.15); color: var(--text-strong); font-weight: 800;">${escapeHtml(getGeneratedPostCategoryLabel(normalizeKey((post as any)?.category)))}</span>
                <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(148,163,184,0.15); color: var(--text-muted); font-weight: 800;">🖼️ ${(post.images?.length || 0)}개</span>
              </div>
              ${post.publishedUrl ? `
                <div style="font-size: 0.75rem; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block;">
                  🔗 ${post.publishedUrl.length > 50 ? post.publishedUrl.substring(0, 50) + '...' : post.publishedUrl}
                </div>
              ` : `
                <div style="font-size: 0.75rem; color: #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block;">
                  ⚠️ 미발행 - URL 없음
                </div>
              `}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  // ✅ 다른 모달보다 항상 위로 오도록(마지막에 붙이기 + 포커스)
  try {
    document.body.appendChild(modal);
    (modal as any).tabIndex = -1;
    (modal as any).focus?.();
  } catch (e) {
    console.warn('[renderer] catch ignored:', e);
  }

  // 이벤트 리스너
  const closeBtn = content.querySelector('#close-post-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => modal.remove());
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  const bindItems = () => {
    const postItems = content.querySelectorAll('.post-item');
    postItems.forEach((item) => {
      item.addEventListener('click', () => {
        const postIndex = parseInt(item.getAttribute('data-post-index') || '0');
        const selectedPost = posts[postIndex];
        modal.remove();
        onSelect(selectedPost);
      });

      item.addEventListener('mouseenter', () => {
        (item as HTMLElement).style.borderColor = 'var(--primary)';
        (item as HTMLElement).style.background = 'var(--bg-tertiary)';
      });

      item.addEventListener('mouseleave', () => {
        const postIndex = parseInt(item.getAttribute('data-post-index') || '0');
        const hasUrl = posts[postIndex]?.publishedUrl;
        (item as HTMLElement).style.borderColor = hasUrl ? 'rgba(16, 185, 129, 0.3)' : 'transparent';
        (item as HTMLElement).style.background = 'var(--bg-secondary)';
      });
    });
  };

  bindItems();

  const categorySelect = content.querySelector('#post-category-filter') as HTMLSelectElement | null;
  if (categorySelect) {
    categorySelect.value = activeCategory;
    categorySelect.addEventListener('change', () => {
      activeCategory = String(categorySelect.value || '').trim() || allCategoryKey;
      const res = computeList(activeCategory);
      const publishedBadge = content.querySelector('#post-selection-published-badge') as HTMLElement | null;
      const unpublishedBadge = content.querySelector('#post-selection-unpublished-badge') as HTMLElement | null;
      if (publishedBadge) publishedBadge.textContent = `✅ 발행됨 ${res.published.length}개`;
      if (unpublishedBadge) unpublishedBadge.textContent = `⏳ 미발행 ${res.unpublished.length}개`;

      const list = content.querySelector('#post-list') as HTMLElement | null;
      if (list) {
        list.innerHTML = res.sorted.map((post) => {
          const cat = getGeneratedPostCategoryLabel(normalizeKey((post as any)?.category));
          const imgCount = (post.images?.length || 0);
          return `
            <div class="post-item" data-post-index="${posts.indexOf(post)}" style="padding: 1rem; background: ${post.publishedUrl ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05))' : 'var(--bg-secondary)'}; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s; border: 2px solid ${post.publishedUrl ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-light)'};">
              <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
                <span style="font-size: 1.5rem; line-height: 1;">${post.publishedUrl ? '✅' : '⏳'}</span>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(post.title || '제목 없음')}</div>
                  <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">${post.createdAt ? new Date(post.createdAt).toLocaleDateString('ko-KR') : '날짜 없음'}${post.publishedAt ? ' • 발행: ' + new Date(post.publishedAt).toLocaleDateString('ko-KR') : ''}</div>
                  <div style="display:flex; gap: 0.4rem; align-items:center; margin-bottom: 0.35rem; flex-wrap: wrap;">
                    <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(59,130,246,0.15); color: var(--text-strong); font-weight: 800;">${escapeHtml(cat)}</span>
                    <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(148,163,184,0.15); color: var(--text-muted); font-weight: 800;">🖼️ ${imgCount}개</span>
                  </div>
                  ${post.publishedUrl ? `<div style="font-size: 0.75rem; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block;">🔗 ${escapeHtml(post.publishedUrl.length > 50 ? post.publishedUrl.substring(0, 50) + '...' : post.publishedUrl)}</div>` : `<div style="font-size: 0.75rem; color: #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block;">⚠️ 미발행 - URL 없음</div>`}
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
      bindItems();
    });
  }
}
