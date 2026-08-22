// src/automation/placeHelpers.ts
// [v2.11.206] 네이버 블로그 에디터 "장소(지도)" 블록 삽입.
//
// 앱에서 사용자가 지역검색 결과 중 하나를 **미리 확정**해 둔 뒤(업체명 + 주소),
// 발행 시 그 값으로 에디터 장소 팝업을 몰아 같은 가게를 집는다. 발행 도중에
// 후보를 고르지 않으므로 "엉뚱한 가게가 박히는" 경로가 애초에 없다.
//
// 흐름 (2026-08-22 라이브 실측으로 1~4단계 재확인):
//   1) 툴바 장소 버튼        button[data-name="map"]
//   2) 검색창에 업체명 입력   input[placeholder*="장소"] (react-autosuggest__input)
//   3) 결과 카드 주소 대조    li.se-place-map-search-result-item
//   4) 카드 안 "추가"        button.se-place-add-button
//   5) 팝업 하단 "확인"      button.se-popup-button-confirm → .se-placesMap 삽입

import type { Frame, Page } from 'puppeteer';
import { SELECTORS } from './selectors/index.js';
import { getAllSelectors } from './selectors/selectorUtils.js';

/** 앱에서 미리 확정해 둔 장소 — 이 값 그대로 에디터에 넣는다. */
export interface ConfirmedPlace {
  /** 네이버 지역검색이 준 업체명 (태그 제거 후). */
  readonly name: string;
  /** 도로명 또는 지번 주소 — 동명 업체를 가르는 유일한 근거. */
  readonly address?: string;
}

interface PlaceCardInfo {
  readonly index: number;
  readonly title: string;
  readonly address: string;
}

/**
 * 주소를 "같다"고 보려면 이만큼은 겹쳐야 한다. 도로명/지번 표기 차이와 "(삼성동)"
 * 같은 꼬리를 흡수하려고 포함 관계를 쓰는데, 짧은 문자열끼리는 우연히 포함된다.
 */
const MIN_ADDRESS_MATCH_CHARS = 10;

/** 비교용 정규화 — 공백/괄호/구두점을 걷어내 표기 차이를 흡수한다. */
function normalizeForMatch(value: string): string {
  return String(value || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s,·.\-]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 카드 하나를 고른다. 잘못 고르면 남의 가게가 내 글에 박히므로, 근거가
 * 약하면 고르지 않고 null 을 돌려준다(호출자가 삽입을 포기한다).
 *
 *   1순위: 이름 + 주소 둘 다 맞음
 *   2순위: 주소가 맞음 (지점명 표기가 달라도 주소는 유일하다)
 *   3순위: 이름이 정확히 맞는 카드가 딱 하나
 *   그 외: 포기
 */
export function pickMatchingPlaceCard(
  cards: readonly PlaceCardInfo[],
  target: ConfirmedPlace,
): PlaceCardInfo | null {
  if (cards.length === 0) return null;

  const wantName = normalizeForMatch(target.name);
  const wantAddress = normalizeForMatch(target.address || '');

  const addressHit = (card: PlaceCardInfo): boolean => {
    const got = normalizeForMatch(card.address);
    // 짧은 쪽이 "서울강남" 수준이면 포함 관계가 우연히 성립한다 — 주소로 못 본다.
    if (wantAddress.length < MIN_ADDRESS_MATCH_CHARS || got.length < MIN_ADDRESS_MATCH_CHARS) return false;
    return got.includes(wantAddress) || wantAddress.includes(got);
  };
  const nameHit = (card: PlaceCardInfo): boolean => {
    const got = normalizeForMatch(card.title);
    return got.length > 0 && got === wantName;
  };

  const both = cards.filter((card) => nameHit(card) && addressHit(card));
  if (both.length > 0) return both[0];

  const byAddress = cards.filter(addressHit);
  if (byAddress.length === 1) return byAddress[0];

  const byName = cards.filter(nameHit);
  if (byName.length === 1) return byName[0];

  return null;
}

/** 본문에 이미 들어간 장소 블록 개수 — 삽입 성공은 이 증가분으로만 판정한다. */
async function countPlaceBlocks(frame: Frame): Promise<number> {
  const selectors = getAllSelectors(SELECTORS.place.insertedPlaceMapBlock);
  return frame
    .evaluate((sels: readonly string[]) => {
      const seen = new Set<Element>();
      for (const sel of sels) {
        document.querySelectorAll(sel).forEach((el) => seen.add(el));
      }
      return seen.size;
    }, selectors)
    .catch(() => 0);
}

async function readPlaceCards(frame: Frame): Promise<PlaceCardInfo[]> {
  const selectors = getAllSelectors(SELECTORS.place.placeResultItem);
  return frame
    .evaluate((sels: readonly string[]) => {
      for (const sel of sels) {
        const nodes = Array.from(document.querySelectorAll(sel));
        if (nodes.length === 0) continue;
        return nodes.map((node, index) => {
          const lines = ((node as HTMLElement).innerText || node.textContent || '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
          return { index, title: lines[0] || '', address: lines[1] || '' };
        });
      }
      return [] as Array<{ index: number; title: string; address: string }>;
    }, selectors)
    .catch(() => []);
}

/** 셀렉터 후보를 순서대로 시도해 n번째 요소를 클릭한다. */
async function clickNth(frame: Frame, entrySelectors: readonly string[], nth: number): Promise<boolean> {
  return frame
    .evaluate(
      (sels: readonly string[], index: number) => {
        for (const sel of sels) {
          const nodes = Array.from(document.querySelectorAll(sel));
          const target = nodes[index] as HTMLElement | undefined;
          if (target && target.offsetParent !== null) {
            target.click();
            return true;
          }
        }
        return false;
      },
      entrySelectors,
      nth,
    )
    .catch(() => false);
}

async function clickFirst(frame: Frame, entrySelectors: readonly string[]): Promise<boolean> {
  return clickNth(frame, entrySelectors, 0);
}

async function closePlacePopup(self: any, frame: Frame): Promise<void> {
  await clickFirst(frame, getAllSelectors(SELECTORS.place.placePopupCloseButton));
  await self.delay(self.DELAYS.SHORT);
}

/**
 * 장소 블록을 현재 캐럿 위치에 삽입한다.
 *
 * 실패해도 절대 throw 하지 않는다 — 장소는 덤이지 본문이 아니므로, 못 넣으면
 * 로그만 남기고 발행은 그대로 이어간다.
 */
export async function insertPlaceBlock(
  self: any,
  page: Page,
  frame: Frame,
  target: ConfirmedPlace,
): Promise<boolean> {
  const placeName = String(target?.name || '').trim();
  if (!placeName) {
    self.log('   ℹ️ [장소] 확정된 장소가 없어 건너뜁니다.');
    return false;
  }

  try {
    const before = await countPlaceBlocks(frame);

    const opened = await self.clickToolbarButton(
      frame,
      page,
      [...getAllSelectors(SELECTORS.place.toolbarPlaceButton)],
    );
    if (!opened) {
      self.log('   ⚠️ [장소] 툴바 장소 버튼을 찾지 못했습니다 — 건너뜁니다.');
      return false;
    }
    await self.delay(self.DELAYS.MEDIUM);

    const searchSelectors = getAllSelectors(SELECTORS.place.placeSearchInput);
    const focused = await frame
      .evaluate((sels: readonly string[]) => {
        for (const sel of sels) {
          const input = document.querySelector(sel) as HTMLInputElement | null;
          if (input && input.offsetParent !== null) {
            input.focus();
            input.value = '';
            return true;
          }
        }
        return false;
      }, searchSelectors)
      .catch(() => false);
    if (!focused) {
      self.log('   ⚠️ [장소] 검색 입력칸을 찾지 못했습니다 — 건너뜁니다.');
      await closePlacePopup(self, frame);
      return false;
    }

    await page.keyboard.type(placeName, { delay: 40 });
    await self.delay(self.DELAYS.SHORT);
    await page.keyboard.press('Enter');
    await self.delay(self.DELAYS.LONG);

    const cards = await readPlaceCards(frame);
    const picked = pickMatchingPlaceCard(cards, { name: placeName, address: target.address });
    if (!picked) {
      self.log(
        `   ⚠️ [장소] "${placeName}" 와 확실히 일치하는 카드를 찾지 못했습니다 ` +
        `(후보 ${cards.length}개) — 엉뚱한 장소 삽입을 막기 위해 건너뜁니다.`,
      );
      await closePlacePopup(self, frame);
      return false;
    }
    self.log(`   🔸 [장소] 카드 선택: "${picked.title}" / ${picked.address}`);

    await clickNth(frame, getAllSelectors(SELECTORS.place.placeResultItem), picked.index);
    await self.delay(self.DELAYS.SHORT);

    const added = await clickFirst(frame, getAllSelectors(SELECTORS.place.placeAddButton));
    if (!added) {
      self.log('   ⚠️ [장소] "추가" 버튼을 누르지 못했습니다 — 건너뜁니다.');
      await closePlacePopup(self, frame);
      return false;
    }
    await self.delay(self.DELAYS.SHORT);

    const confirmed = await clickFirst(frame, getAllSelectors(SELECTORS.place.placeConfirmButton));
    if (!confirmed) {
      self.log('   ⚠️ [장소] 팝업 "확인" 버튼을 누르지 못했습니다 — 건너뜁니다.');
      await closePlacePopup(self, frame);
      return false;
    }
    await self.delay(self.DELAYS.LONG);

    const after = await countPlaceBlocks(frame);
    if (after <= before) {
      self.log(`   ⚠️ [장소] 지도 블록이 늘지 않았습니다 (${before} → ${after}) — 삽입 실패로 봅니다.`);
      return false;
    }

    self.log(`   ✅ [장소] "${picked.title}" 삽입 완료 (지도 블록 ${before} → ${after})`);
    return true;
  } catch (error) {
    self.log(`   ⚠️ [장소] 삽입 중 오류 — 건너뜁니다: ${(error as Error).message}`);
    return false;
  }
}
