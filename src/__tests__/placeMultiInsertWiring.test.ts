import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-25 사용자 요청] 글 중간중간 다녀온 곳을 지도로 넣고, 마지막에 맛집 지도.
 * 조건: "본문 도중이나 이상한 위치에 들어가면 절대 안 된다."
 *
 * 배선이 끊기면 배치 계획기가 아무리 정확해도 지도가 한 곳만 들어가거나 아예 안 들어간다.
 * 판정 로직 자체는 placePlacementPlan.test.ts 가 실제 함수를 돌려 검증한다.
 */
describe('장소 다중 삽입 — 에디터 배선', () => {
  const editor = read('automation/editorHelpers.ts');

  it('소제목이 확정된 뒤 배치 계획을 세운다', () => {
    expect(editor).toMatch(/import \{[\s\S]*?planPlacePlacements[\s\S]*?\} from '\.\/placePlacementPlan\.js'/);
    const headingsAt = editor.indexOf('const headings = structured.headings || [];');
    const planAt = editor.indexOf('planPlacePlacements(');
    expect(headingsAt).toBeGreaterThan(-1);
    expect(planAt).toBeGreaterThan(headingsAt);
  });

  it('계획에 소제목 제목과 본문을 함께 넘긴다 (언급 근거의 재료)', () => {
    expect(editor).toMatch(/title: h\?\.title \|\| '', body: h\?\.content \|\| ''/);
  });

  it('구버전 payload(단일 장소)도 계속 동작한다', () => {
    expect(editor).toMatch(/Array\.isArray\(\(resolved as any\)\.places\)/);
    expect(editor).toMatch(/name: resolved\.placeName, address: resolved\.placeAddress, position: resolved\.placePosition/);
  });

  it('소제목 아래에 여러 곳을 넣는다 (한 곳만 넣고 끝내지 않는다)', () => {
    expect(editor).toMatch(/const placesHere = placementsForHeading\(placePlan, i \+ 1\)/);
    expect(editor).toMatch(/for \(const placement of placesHere\)/);
  });

  it('맨 끝에도 여러 곳을 넣는다', () => {
    expect(editor).toMatch(/const tailPlaces = placementsForTail\(placePlan\)/);
    expect(editor).toMatch(/for \(const placement of tailPlaces\)/);
  });

  it('한 곳만 넣고 멈추던 옛 게이트를 쓰지 않는다 (회귀 잠금)', () => {
    expect(editor).not.toContain('shouldInsertPlaceAtHeading');
    expect(editor).not.toContain('shouldInsertPlaceAtTail');
    expect(editor).not.toContain('self.__placeHandled = true');
  });

  it('왜 그 자리인지 로그로 남긴다 (엉뚱한 위치 추적용)', () => {
    expect(editor).toMatch(/배치 계획/);
    expect(editor).toMatch(/언급하지 않아 본문 끝에 넣습니다/);
  });
});

describe('장소 다중 선택 — 화면과 payload', () => {
  const picker = read('renderer/modules/placePicker.ts');
  const publish = read('renderer/modules/publishingHandlers.ts');

  it('여러 곳을 목록으로 담는다', () => {
    expect(picker).toMatch(/const pickedList: PickedEntry\[\] = \[\]/);
    expect(picker).toMatch(/pickedList\.push\(\{ name: item\.name, address, position: 'auto' \}\)/);
  });

  it('새로 고른 곳의 기본 위치는 자동이다 (풀오토는 소제목을 모른다)', () => {
    expect(picker).toMatch(/position: 'auto'/);
    expect(picker).toMatch(/value: 'auto', label: '자동/);
  });

  it('같은 가게를 두 번 담지 않고 상한을 넘기지 않는다', () => {
    expect(picker).toMatch(/function alreadyPicked\(/);
    expect(picker).toMatch(/pickedList\.length >= MAX_PLACES/);
  });

  it('곳마다 위치를 따로 고르고 지울 수 있다', () => {
    expect(picker).toMatch(/data-place-position/);
    expect(picker).toMatch(/data-place-remove/);
  });

  it('발행 payload 가 목록 전체를 싣는다 (첫 곳만 보내지 않는다)', () => {
    expect(publish).toMatch(/readPickedPlaces\?\.\(\) \|\| \[\]/);
    const occurrences = publish.match(/places: pickedPlacesForPublish/g) ?? [];
    expect(occurrences).toHaveLength(2);
  });

  it('구버전 필드도 함께 채워 하위 호환을 지킨다', () => {
    expect(publish).toMatch(/placeName: pickedPlaceForPublish\?\.name \|\| ''/);
  });
});
