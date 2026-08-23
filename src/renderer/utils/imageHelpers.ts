/**
 * ✅ [2026-01-25 모듈화] Image Helpers
 * - renderer.ts에서 분리됨
 * - 이미지 관련 유틸리티 헬퍼 함수
 */

import { toFileUrlMaybe } from './headingKeyUtils.js';

// ImageManager 참조 (글로벌에서 가져옴)
const getImageManager = () => (window as any).ImageManager;

/**
 * ✅ [2026-03-16 FIX] prompt-item 요소에서 순수 소제목 제목을 안전하게 추출
 * .heading-title-text의 textContent에는 배지 텍스트(📌 썸네일)가 포함되므로
 * data-heading-title 속성 → .heading-title-pure span → _headingTitles 순으로 우선 사용
 */
export function getSafeHeadingTitle(promptItem: Element | null | undefined): string {
    if (!promptItem) return '';
    try {
        // 1순위: data-heading-title 속성 (정확한 순수 제목)
        const dataTitle = String((promptItem as HTMLElement).getAttribute('data-heading-title') || '').trim();
        if (dataTitle) return dataTitle;
        // 2순위: .heading-title-pure span (배지 제외)
        const pureEl = promptItem.querySelector('.heading-title-pure') as HTMLElement | null;
        if (pureEl?.textContent?.trim()) return pureEl.textContent.trim();
        // 3순위: _headingTitles 전역 배열
        const indexStr = String((promptItem as HTMLElement).getAttribute('data-index') || '').trim();
        const idx = indexStr ? Math.max(0, Number(indexStr) - 1) : -1;
        if (idx >= 0) {
            const globalTitle = String((window as any)._headingTitles?.[idx] || '').trim();
            if (globalTitle) return globalTitle;
        }
        // 4순위 (최후 폴백): textContent 전체 — 배지 포함 가능
        const fullEl = promptItem.querySelector('.heading-title-text') as HTMLElement | null;
        return String(fullEl?.textContent || '').trim();
    } catch {
        return '';
    }
}

/**
 * ✅ [2026-08-23] 이미지 슬롯 공간(slot space) — 인덱스 어긋남의 근본 차단
 *
 * 이미지 관리 탭의 카드 목록은 "🖼️ 썸네일"을 0번 슬롯으로 포함한다
 * (displayImageHeadingsWithPrompts가 서론 섹션을 첫 카드로 그린다).
 * 반면 ImageManager.headings는 호출 경로에 따라 둘 중 하나였다.
 *   - AI 이미지 생성 경로   : filteredHeadings   → 썸네일 포함 (슬롯 공간)
 *   - 글 불러오기/동기화 경로: structuredContent.headings → 썸네일 없음 (본문 공간)
 * 그래서 같은 숫자 0이 어떤 때는 썸네일, 어떤 때는 소제목 1을 가리켰고
 * "썸네일을 바꾸면 소제목 1이 바뀌고, 1번을 바꾸면 2번이 바뀌는" 밀림이 났다.
 *
 * 해법: 교체/배치 경로는 숫자를 버리고 **제목**을 그대로 들고 다닌다.
 * 숫자가 남아있는 곳은 아래 슬롯 목록(= 카드가 실제로 그려진 순서)으로만 해석한다.
 */
export const THUMBNAIL_SLOT_TITLE = '🖼️ 썸네일';

/** 카드 제목에 붙는 배지 텍스트(📌 썸네일)는 키가 아니다 — 비교 전에 떼어낸다. */
function stripSlotBadge(title: unknown): string {
    return String(title || '').replace(/📌\s*썸네일/g, '').replace(/\s+/g, ' ').trim();
}

export function isThumbnailSlotTitle(title: unknown): boolean {
    const t = stripSlotBadge(title);
    if (!t) return false;
    return t === THUMBNAIL_SLOT_TITLE || t === '썸네일' || t === '🖼️썸네일';
}

/** 교체/배치 대상 지정 방식. 제목이 있으면 제목이 항상 우선한다. */
export type ImageSlotRef = number | 'thumbnail' | { title?: string; isThumbnail?: boolean };

export interface ImageSlotTarget {
    /** ImageManager 키로 그대로 쓰이는 제목. */
    title: string;
    isThumbnail: boolean;
    /** 카드 목록에서의 위치. 목록에 없으면 -1 (제목만으로 확정된 경우). */
    slotIndex: number;
}

/**
 * 순수 함수 — 슬롯 제목 목록에 대고 참조를 해석한다. (테스트 대상)
 * DOM/전역을 읽지 않으므로 노드 환경에서 그대로 검증할 수 있다.
 */
export function resolveImageSlotFromTitles(
    slotTitles: unknown,
    ref: ImageSlotRef,
): ImageSlotTarget | null {
    const titles = (Array.isArray(slotTitles) ? slotTitles : [])
        .map((t) => stripSlotBadge(t));

    const indexOfTitle = (title: string): number =>
        titles.findIndex((t) => t === title);

    if (ref === 'thumbnail') {
        return {
            title: THUMBNAIL_SLOT_TITLE,
            isThumbnail: true,
            slotIndex: titles.findIndex((t) => isThumbnailSlotTitle(t)),
        };
    }

    if (typeof ref === 'number') {
        if (!Number.isFinite(ref) || ref < 0) return null;
        const title = titles[ref];
        if (!title) return null;
        return { title, isThumbnail: isThumbnailSlotTitle(title), slotIndex: ref };
    }

    if (ref && typeof ref === 'object') {
        if (ref.isThumbnail === true && !stripSlotBadge(ref.title)) {
            return {
                title: THUMBNAIL_SLOT_TITLE,
                isThumbnail: true,
                slotIndex: titles.findIndex((t) => isThumbnailSlotTitle(t)),
            };
        }
        const title = stripSlotBadge(ref.title);
        if (!title) return null;
        // 제목이 썸네일이면 항상 정규 썸네일 키로 모은다 ('썸네일' 별칭 분산 방지).
        if (isThumbnailSlotTitle(title)) {
            return {
                title: THUMBNAIL_SLOT_TITLE,
                isThumbnail: true,
                slotIndex: titles.findIndex((t) => isThumbnailSlotTitle(t)),
            };
        }
        return { title, isThumbnail: false, slotIndex: indexOfTitle(title) };
    }

    return null;
}

/**
 * 버튼의 data-heading-index가 가리키는 슬롯 목록.
 * displayImageHeadingsWithPrompts가 카드와 _headingTitles를 같은 배열에서 만들므로
 * _headingTitles가 이 인덱스의 정본이다. 없으면 카드 data-index로 재구성한다.
 */
export function getImageSlotTitles(): string[] {
    try {
        const list = (window as any)?._headingTitles;
        if (Array.isArray(list) && list.length > 0) {
            return list.map((t: unknown) => stripSlotBadge(t));
        }
    } catch (e) {
        console.warn('[imageHelpers] catch ignored:', e);
    }

    try {
        const cards = Array.from(
            document.querySelectorAll('.prompt-item[data-index]'),
        ) as HTMLElement[];
        if (cards.length > 0) {
            const titles: string[] = [];
            cards.forEach((card) => {
                const slot = Number(card.getAttribute('data-index') || '0') - 1;
                if (!Number.isFinite(slot) || slot < 0) return; // 주입형 썸네일 카드(data-index="0")
                titles[slot] = stripSlotBadge(getSafeHeadingTitle(card));
            });
            if (titles.some((t) => !!t)) return titles;
        }
    } catch (e) {
        console.warn('[imageHelpers] catch ignored:', e);
    }

    // 최후 폴백: UI가 없는 문맥. 본문 공간일 수 있으므로 썸네일 슬롯을 앞에 채워 맞춘다.
    try {
        const headings = getImageManager()?.headings;
        const titles = (Array.isArray(headings) ? headings : []).map((h: any) =>
            stripSlotBadge(typeof h === 'string' ? h : h?.title),
        );
        if (titles.length === 0) return [];
        return isThumbnailSlotTitle(titles[0]) ? titles : [THUMBNAIL_SLOT_TITLE, ...titles];
    } catch (e) {
        console.warn('[imageHelpers] catch ignored:', e);
        return [];
    }
}

/**
 * 사용자가 화면에서 보는 슬롯 순서 (배치 모달용).
 * 주입형 썸네일 카드까지 포함해 문서 순서 그대로 읽는다.
 */
export function getPlacementSlotTitles(): string[] {
    try {
        const cards = Array.from(
            document.querySelectorAll('.prompt-item[data-heading-title]'),
        ) as HTMLElement[];
        const titles = cards
            .map((card) => stripSlotBadge(card.getAttribute('data-heading-title')))
            .filter((t) => !!t);
        if (titles.length > 0) return titles;
    } catch (e) {
        console.warn('[imageHelpers] catch ignored:', e);
    }
    return getImageSlotTitles().filter((t) => !!t);
}

/** 슬롯 참조 → 교체/배치가 바로 쓸 수 있는 대상. */
export function resolveImageSlotTarget(ref: ImageSlotRef): ImageSlotTarget | null {
    return resolveImageSlotFromTitles(getImageSlotTitles(), ref);
}

/**
 * 인덱스로 소제목 제목 가져오기 — 슬롯 공간 기준.
 * (예전엔 ImageManager.headings를 먼저 봐서 경로에 따라 한 칸씩 밀렸다.)
 */
export function getHeadingTitleByIndex(index: number): string {
    return resolveImageSlotTarget(index)?.title || '';
}

/**
 * 이미지의 안정적인 키 생성
 */
export function getStableImageKey(img: any): string {
    const raw = img?.url || img?.filePath || img?.previewDataUrl || '';
    return toFileUrlMaybe(String(raw || '').trim());
}

/**
 * 이미지 저장 기본 경로 가져오기
 * ✅ [v2.9.0 FIX] '추가' 버튼이 자동 수집된 폴더를 못 찾던 회귀 차단
 *   문제: customImageSavePath 비어있을 때 폴백이 getSavedImagesPath(=userData/images)였는데
 *         실제 저장은 main의 getImageSaveBasePath(=Downloads/naver-blog-images)로 가서 경로 분기.
 *         결과: AI 자동 수집은 Downloads/naver-blog-images/{글제목}/에 저장되지만
 *               '추가' 버튼은 userData/images에서 폴더 리스트를 찾아 자동 수집 폴더가 안 보임.
 *   조치: 폴백 IPC를 path:getDefaultImageSavePath(=Downloads/naver-blog-images)로 통일.
 *         main의 getImageSaveBasePath와 완전 동일 경로 반환 → 저장/조회 일치.
 */
export async function getRequiredImageBasePath(): Promise<string> {
    if (!window.api?.getConfig) {
        console.warn('[ImageHelpers] ⚠️ 설정 API 없음, 빈 경로 반환');
        return '';
    }
    const config = await window.api.getConfig();
    const raw = String((config as any)?.customImageSavePath || '').trim();

    if (raw) {
        return raw.replace(/\\/g, '/').replace(/\/+$/g, '');
    }

    // ✅ [v2.9.0] customImageSavePath 비어있으면 main과 동일 폴백 경로 사용
    //   이전: getSavedImagesPath → userData/images (저장 경로와 불일치)
    //   현재: getDefaultImageSavePath → Downloads/naver-blog-images (저장 경로와 일치)
    try {
        if ((window.api as any).getDefaultImageSavePath) {
            const defaultPath = await (window.api as any).getDefaultImageSavePath();
            if (defaultPath) {
                console.log('[ImageHelpers] ✅ Downloads/naver-blog-images 폴백 경로:', defaultPath);
                return String(defaultPath).replace(/\\/g, '/').replace(/\/+$/g, '');
            }
        }
    } catch (err) {
        console.warn('[ImageHelpers] IPC 폴백 실패:', err);
    }

    console.log('[ImageHelpers] ⚠️ 이미지 경로를 찾을 수 없습니다.');
    return '';
}

// 전역 노출 (하위 호환성)
(window as any).getSafeHeadingTitle = getSafeHeadingTitle;
(window as any).getHeadingTitleByIndex = getHeadingTitleByIndex;
(window as any).getStableImageKey = getStableImageKey;
(window as any).getRequiredImageBasePath = getRequiredImageBasePath;

console.log('[ImageHelpers] 📦 모듈 로드됨!');
