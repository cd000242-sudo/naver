// src/automation/placePlacementPlan.ts
// [2026-08-25] 장소(지도) 블록을 "어느 소제목 아래" 넣을지 정하는 순수 계획기.
//
// 왜 필요한가: 풀오토 발행은 글을 만들기 전에 설정을 받는다. 그 시점에는 소제목이
// 무엇이 될지 아무도 모르므로 사용자가 'heading-3' 같은 번호를 고를 수가 없다.
// 그렇다고 아무 자리에나 꽂으면 관련 없는 문단 밑에 지도가 붙는다.
//
// 그래서 '자동'은 추측하지 않고 근거를 본다 — 본문이 그 가게를 실제로 언급한
// 소제목 아래에만 넣고, 언급이 없으면 글 맨 끝으로 보낸다. 근거가 없으면 자리를
// 만들어내지 않는다는 것이 이 모듈의 유일한 계약이다.
//
// 삽입 지점 자체는 이 모듈이 정하지 않는다. 호출자(editorHelpers)가 "소제목 본문이
// 끝난 직후" 또는 "해시태그 앞"에만 넣으므로, 문단 도중에 끼어드는 경로는 없다.

/** 사용자가 앱에서 확정해 둔 장소 하나. */
export interface PlaceRequest {
  readonly name: string;
  readonly address?: string;
  /** 'auto' | 'bottom' | 'heading-1' ~ 'heading-10'. 비면 'auto'. */
  readonly position?: string;
}

/** 계획 시점에 읽을 수 있는 소제목 하나(제목 + 그 아래 본문). */
export interface HeadingText {
  readonly title?: string;
  readonly body?: string;
}

export type PlacementReason =
  | 'explicit-heading'   // 사용자가 번호를 직접 골랐고 그 소제목이 있다
  | 'heading-missing'    // 번호를 골랐지만 그 소제목이 없다 -> 꼬리
  | 'explicit-bottom'    // 사용자가 맨 끝을 골랐다
  | 'name-mention'       // 자동: 본문/제목이 가게명을 언급했다
  | 'address-mention'    // 자동: 본문/제목이 주소를 언급했다
  | 'no-evidence';       // 자동: 언급이 없어 꼬리로 보냈다

export interface PlacePlacement {
  readonly place: PlaceRequest;
  /** 1-based 소제목 번호. 0 이면 본문 맨 끝(해시태그 앞). */
  readonly headingNumber: number;
  readonly reason: PlacementReason;
}

/** 한 글에 넣을 수 있는 장소 수 상한. 지도가 도배되면 글이 아니라 전단지가 된다. */
export const MAX_PLACES_PER_POST = 5;

/**
 * 우연한 일치를 막는 최소 길이. "김밥" 두 글자는 아무 글에나 들어 있다.
 * 이 아래로는 언급을 근거로 치지 않고 꼬리로 보낸다.
 */
const MIN_NAME_MATCH_CHARS = 3;

/** 주소는 도로명+번지 수준은 돼야 한 곳을 가리킨다. */
const MIN_ADDRESS_MATCH_CHARS = 8;

/** 비교용 정규화 — 공백/괄호/구두점을 걷어내 표기 차이를 흡수한다. */
function normalize(value: unknown): string {
  return String(value ?? '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s,·.\-]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 상호를 부르는 여러 형태를 후보로 만든다.
 *
 * 지역검색은 "한꼬막두꼬막 송파점", "거제도 한꼬막두꼬막 지세포 소노캄 본점"처럼
 * 지역·지점을 덧붙여 주는데, 본문은 보통 "한꼬막두꼬막"이라고만 쓴다. 붙여 쓴
 * 문자열에서 "점"만 떼면 "한꼬막두꼬막송파"가 남아 영영 안 걸린다 — 토큰으로 끊어야 한다.
 *
 * 후보: 전체 / 지점 토큰을 뗀 것 / 첫 토큰 / 가장 긴 토큰(대개 상호 본체).
 */
const BRANCH_TOKEN = /(본점|지점|직영점|\d+호점|점)$/u;

function nameVariants(name: string): string[] {
  const raw = String(name ?? '').trim();
  if (!raw) return [];

  const tokens = raw.split(/\s+/).filter(Boolean);
  const candidates: string[] = [raw];

  // 뒤에서부터 지점 토큰을 걷어낸다.
  const kept = [...tokens];
  while (kept.length > 1 && BRANCH_TOKEN.test(kept[kept.length - 1])) kept.pop();
  if (kept.length !== tokens.length) candidates.push(kept.join(' '));

  if (tokens.length > 1) {
    candidates.push(tokens[0]);
    const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a), tokens[0]);
    candidates.push(longest);
  }

  const out: string[] = [];
  for (const candidate of candidates) {
    const value = normalize(candidate);
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * 주소에서 한 곳을 가리키는 조각만 남긴다.
 * "서울특별시 송파구 백제고분로33길 16" -> "백제고분로33길16"
 * 시/도·구까지만 겹치는 건 근거가 아니다(같은 구에 가게가 수천 개다).
 */
function addressCore(address: string): string {
  const raw = String(address ?? '').trim();
  if (!raw) return '';
  const tokens = raw.split(/\s+/);
  // 앞쪽 행정구역(시/도/시/군/구)을 떼고 남은 도로명 이하만 쓴다.
  const tail = tokens.filter((t) => !/(특별시|광역시|자치시|자치도|[시도군구])$/u.test(t));
  const core = normalize(tail.join(''));
  return core.length >= MIN_ADDRESS_MATCH_CHARS ? core : '';
}

function headingHaystack(heading: HeadingText): { title: string; all: string } {
  const title = normalize(heading.title);
  return { title, all: title + normalize(heading.body) };
}

/** 사용자가 고른 명시 위치를 해석한다. 'auto'/빈 값이면 null. */
function explicitHeadingNumber(position: string | undefined): number | null {
  const raw = String(position ?? '').trim();
  const m = /^heading-(\d{1,2})$/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * 자동 위치 하나를 고른다. 근거를 못 찾으면 0(꼬리)을 돌려준다.
 * 제목에 나온 소제목을 본문에만 나온 소제목보다 우선한다 — 제목에 가게명이 있으면
 * 그 절 전체가 그 가게 이야기다.
 */
function pickAutoHeading(
  place: PlaceRequest,
  headings: readonly HeadingText[],
): { headingNumber: number; reason: PlacementReason } {
  const variants = nameVariants(place.name).filter((v) => v.length >= MIN_NAME_MATCH_CHARS);
  const hay = headings.map(headingHaystack);

  if (variants.length > 0) {
    const inTitle = hay.findIndex((h) => variants.some((v) => h.title.includes(v)));
    if (inTitle >= 0) return { headingNumber: inTitle + 1, reason: 'name-mention' };
    const inBody = hay.findIndex((h) => variants.some((v) => h.all.includes(v)));
    if (inBody >= 0) return { headingNumber: inBody + 1, reason: 'name-mention' };
  }

  const core = addressCore(place.address || '');
  if (core) {
    const byAddress = hay.findIndex((h) => h.all.includes(core));
    if (byAddress >= 0) return { headingNumber: byAddress + 1, reason: 'address-mention' };
  }

  return { headingNumber: 0, reason: 'no-evidence' };
}

/**
 * 장소 목록 전체의 배치를 정한다.
 *
 * - 명시 번호는 그대로 존중하되, 그 소제목이 없으면 꼬리로 보낸다(사용자가 원한 건
 *   "이 글에 지도"이지 "그 번호가 아니면 말고"가 아니다).
 * - 자동은 언급이 있는 소제목에만 붙고, 없으면 꼬리로 간다.
 * - 이름이 같은 장소가 두 번 들어오면 한 번만 남긴다.
 * - 상한을 넘는 장소는 버리지 않고 잘라낸 사실이 드러나도록 앞에서부터 취한다.
 */
export function planPlacePlacements(
  places: readonly PlaceRequest[],
  headings: readonly HeadingText[],
): PlacePlacement[] {
  const seen = new Set<string>();
  const unique: PlaceRequest[] = [];
  for (const place of places || []) {
    const key = normalize(place?.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(place);
    if (unique.length >= MAX_PLACES_PER_POST) break;
  }

  const total = headings?.length ?? 0;
  return unique.map((place) => {
    const explicit = explicitHeadingNumber(place.position);
    if (explicit !== null) {
      return explicit <= total
        ? { place, headingNumber: explicit, reason: 'explicit-heading' as const }
        : { place, headingNumber: 0, reason: 'heading-missing' as const };
    }
    if (String(place.position ?? '').trim() === 'bottom') {
      return { place, headingNumber: 0, reason: 'explicit-bottom' as const };
    }
    const auto = pickAutoHeading(place, headings || []);
    return { place, headingNumber: auto.headingNumber, reason: auto.reason };
  });
}

/** 특정 소제목 아래에 넣을 장소들(입력 순서 유지). */
export function placementsForHeading(
  placements: readonly PlacePlacement[],
  headingNumber: number,
): PlacePlacement[] {
  return placements.filter((p) => p.headingNumber === headingNumber);
}

/** 본문 맨 끝(해시태그 앞)에 넣을 장소들. */
export function placementsForTail(placements: readonly PlacePlacement[]): PlacePlacement[] {
  return placements.filter((p) => p.headingNumber === 0);
}
