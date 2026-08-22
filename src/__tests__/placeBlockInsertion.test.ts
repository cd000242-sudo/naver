/**
 * [v2.11.206] 장소(지도) 블록 — 앱에서 미리 확정하고 발행 때 그대로 꽂는다.
 *
 * 가장 큰 위험은 "엉뚱한 가게가 박히는 것"이라, 카드 선택 규칙을 여기서 못박는다.
 * 근거가 약하면 고르지 않고 null 을 돌려주는 것이 정상 동작이다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pickMatchingPlaceCard } from '../automation/placeHelpers';
import { shouldInsertPlaceAtHeading, shouldInsertPlaceAtTail } from '../automation/editorTailPlan';
import { toPlaceSearchItems } from '../main/ipc/placeSearchHandlers';

const ROOT = resolve(__dirname, '..', '..');
const read = (relativePath: string): string => readFileSync(resolve(ROOT, relativePath), 'utf8');

describe('장소 카드 선택 — 엉뚱한 가게 차단', () => {
  const cards = [
    { index: 0, title: '스타벅스 강남점', address: '서울특별시 강남구 강남대로 390' },
    { index: 1, title: '스타벅스 강남역점', address: '서울특별시 강남구 테헤란로 101' },
    { index: 2, title: '스타벅스 코엑스별마당점', address: '서울특별시 강남구 영동대로 513' },
  ];

  it('이름과 주소가 둘 다 맞는 카드를 고른다', () => {
    const picked = pickMatchingPlaceCard(cards, {
      name: '스타벅스 강남역점',
      address: '서울특별시 강남구 테헤란로 101',
    });
    expect(picked?.index).toBe(1);
  });

  it('지점명 표기가 달라도 주소가 맞으면 그 카드를 고른다', () => {
    const picked = pickMatchingPlaceCard(cards, {
      name: '스타벅스 코엑스점',
      address: '서울특별시 강남구 영동대로 513 (삼성동)',
    });
    expect(picked?.index).toBe(2);
  });

  it('주소가 없어도 이름이 정확히 하나만 맞으면 고른다', () => {
    const picked = pickMatchingPlaceCard(cards, { name: '스타벅스 강남점' });
    expect(picked?.index).toBe(0);
  });

  it('근거가 없으면 아무것도 고르지 않는다 (삽입 포기)', () => {
    expect(pickMatchingPlaceCard(cards, { name: '이디야 강남점', address: '서울 중구 을지로 1' })).toBeNull();
    expect(pickMatchingPlaceCard([], { name: '스타벅스 강남점' })).toBeNull();
  });

  it('이름만 비슷하고 주소가 다르면 고르지 않는다', () => {
    const picked = pickMatchingPlaceCard(cards, {
      name: '스타벅스',
      address: '부산광역시 해운대구 구남로 1',
    });
    expect(picked).toBeNull();
  });
});

describe('장소 삽입 위치', () => {
  it('확정된 이름이 없으면 어떤 위치든 삽입하지 않는다', () => {
    expect(shouldInsertPlaceAtHeading('', 'heading-2', 2)).toBe(false);
    expect(shouldInsertPlaceAtHeading(undefined, 'heading-2', 2)).toBe(false);
    expect(shouldInsertPlaceAtTail('', false)).toBe(false);
    expect(shouldInsertPlaceAtTail('   ', false)).toBe(false);
  });

  it('지정한 소제목 번호에서만 삽입한다', () => {
    expect(shouldInsertPlaceAtHeading('맛집', 'heading-2', 2)).toBe(true);
    expect(shouldInsertPlaceAtHeading('맛집', 'heading-2', 1)).toBe(false);
    expect(shouldInsertPlaceAtHeading('맛집', 'heading-2', 3)).toBe(false);
  });

  it('소제목에서 이미 처리했으면 꼬리에서 중복 삽입하지 않는다', () => {
    expect(shouldInsertPlaceAtTail('맛집', true)).toBe(false);
  });

  it('지정한 소제목이 없어 아무 데도 못 넣었으면 꼬리에 넣는다', () => {
    // heading-5 를 골랐는데 소제목이 3개뿐인 글 — 자리를 못 찾아 미처리로 남는다.
    expect(shouldInsertPlaceAtTail('맛집', false)).toBe(true);
  });

  it('확정된 이름이 없으면 꼬리에서도 넣지 않는다', () => {
    expect(shouldInsertPlaceAtTail('', false)).toBe(false);
    expect(shouldInsertPlaceAtTail(undefined, false)).toBe(false);
  });
});

describe('지역검색 결과 정규화', () => {
  it('강조 태그와 HTML 엔티티를 걷어낸다', () => {
    const items = toPlaceSearchItems([
      {
        title: '<b>스타벅스</b> 강남R점',
        category: '카페,디저트&gt;커피전문점',
        address: '서울특별시 강남구 역삼동 825-22',
        roadAddress: '서울특별시 강남구 강남대로 390',
        telephone: '',
        link: 'https://example.com',
      },
    ]);
    expect(items[0].name).toBe('스타벅스 강남R점');
    expect(items[0].category).toBe('카페,디저트>커피전문점');
    expect(items[0].roadAddress).toBe('서울특별시 강남구 강남대로 390');
  });

  it('이름 없는 항목은 버린다', () => {
    expect(toPlaceSearchItems([{ title: '' }, { title: '<b></b>' }])).toEqual([]);
  });
});

/**
 * 배선 회귀 — main.ts 가 registerAllHandlers() 를 호출하지 않는 구조라(4554행 주석),
 * index.ts 등록만으로는 죽은 핸들러가 된다. 그리고 렌더러 모듈은 copy-static 인라인
 * 목록에 없으면 번들에서 통째로 빠진다. 둘 다 과거 실제로 당한 함정이다.
 */
describe('장소 기능 배선', () => {
  it('place:search 핸들러가 main.ts에서 직접 등록된다', () => {
    const mainSource = read('src/main.ts');
    expect(mainSource).toContain("import { registerPlaceSearchHandlers } from './main/ipc/placeSearchHandlers.js'");
    expect(mainSource).toMatch(/^registerPlaceSearchHandlers\(\);$/m);
  });

  it('placePicker 모듈이 copy-static 인라인 목록에 등록돼 있다', () => {
    expect(read('scripts/copy-static.mjs')).toContain("'placePicker.js'");
  });

  it('발행 payload가 확정된 장소를 실어 보낸다', () => {
    const source = read('src/renderer/modules/publishingHandlers.ts');
    expect(source.match(/placeName: pickedPlaceForPublish\?\.name/g)?.length).toBe(2);
    expect(source.match(/placePosition: pickedPlaceForPublish\?\.position/g)?.length).toBe(2);
  });

  it('IPC payload 빌더가 장소를 실어 보낸다 (필드 나열식이라 빠지면 죽는다)', () => {
    // v2.11.206 개발 중 실제로 여기서 끊겨 있었다. formData 에는 값이 있는데
    // executeBlogPublishing 이 payload 를 필드 하나씩 나열해 만들어 main 까지 못 갔다.
    const source = read('src/renderer/modules/fullAutoFlow.ts');
    expect(source).toContain('placeName: formData.placeName');
    expect(source).toContain('placeAddress: formData.placeAddress');
    expect(source).toContain('placePosition: formData.placePosition');
  });

  it('BlogExecutor 가 장소를 runOptions 로 넘긴다', () => {
    const source = read('src/main/services/BlogExecutor.ts');
    expect(source).toContain('placeName: payload.placeName');
    expect(source).toContain('placePosition: payload.placePosition');
  });

  it('글마다 장소 삽입 상태를 초기화한다 (연속발행 2번째 글 누락 차단)', () => {
    const source = read('src/automation/editorHelpers.ts');
    expect(source).toContain('self.__placeHandled = false;');
  });

  it('발행 옵션 해석기가 장소를 통과시킨다', () => {
    const source = read('src/automation/runOptionsPolicy.ts');
    expect(source).toContain('placeName: runOptions.placeName');
    expect(source).toContain('placePosition: runOptions.placePosition');
  });
});
