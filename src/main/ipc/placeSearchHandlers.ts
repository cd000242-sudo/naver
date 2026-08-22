// src/main/ipc/placeSearchHandlers.ts
// [v2.11.206] 장소 검색 IPC — 앱에서 장소를 **미리 확정**하기 위한 창구.
//
// 왜 앱에서 고르나: 발행 도중에 후보를 고르면 동명 업체가 끼어들 수 있다.
// 사용자가 화면에서 업체명 + 주소를 보고 하나 고르면, 발행은 그 값만 쓴다.

import { ipcMain } from 'electron';
import { callNaverSearch } from '../../naver/index.js';

export interface PlaceSearchItem {
  readonly name: string;
  readonly category: string;
  readonly address: string;
  readonly roadAddress: string;
  readonly telephone: string;
  readonly link: string;
}

export interface PlaceSearchResult {
  readonly success: boolean;
  readonly items?: PlaceSearchItem[];
  readonly message?: string;
}

interface NaverLocalItem {
  title?: string;
  category?: string;
  address?: string;
  roadAddress?: string;
  telephone?: string;
  link?: string;
}

/** 지역검색 title 은 <b> 강조 태그와 HTML 엔티티를 달고 온다. */
function stripSearchMarkup(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function toPlaceSearchItems(items: readonly NaverLocalItem[]): PlaceSearchItem[] {
  return items
    .map((item) => ({
      name: stripSearchMarkup(item.title || ''),
      category: stripSearchMarkup(item.category || ''),
      address: stripSearchMarkup(item.address || ''),
      roadAddress: stripSearchMarkup(item.roadAddress || ''),
      telephone: stripSearchMarkup(item.telephone || ''),
      link: String(item.link || ''),
    }))
    .filter((item) => item.name.length > 0);
}

export function registerPlaceSearchHandlers(): void {
  ipcMain.handle('place:search', async (_event, query: string): Promise<PlaceSearchResult> => {
    const keyword = String(query || '').trim();
    if (!keyword) {
      return { success: false, message: '검색어를 입력해주세요.' };
    }

    try {
      const result = await callNaverSearch<{ items?: NaverLocalItem[] }>('local', {
        query: keyword,
        display: 5,
      });

      if (!result.ok || !result.data) {
        return {
          success: false,
          message: result.error || `네이버 지역검색 실패 (status ${result.status})`,
        };
      }

      const items = toPlaceSearchItems(result.data.items || []);
      if (items.length === 0) {
        return { success: true, items: [], message: '검색 결과가 없습니다.' };
      }
      return { success: true, items };
    } catch (error) {
      console.error('[IPC] place:search 실패:', error);
      return { success: false, message: (error as Error).message };
    }
  });

  console.log('[IPC] Place search handlers registered (1 handler)');
}
