/**
 * [2026-09-10 사장님 실측] "장소가 이제는 하나도 삽입이 안 됐어."
 *
 * 조사 결과 뿌리는 두 개다.
 *  (1) 다중 장소(`places`)가 메인 프로세스 화이트리스트에서 통째로 버려진다.
 *      BlogExecutor 의 runOptions 조립과 resolveRunOptions 반환이 둘 다 필드를 하나씩
 *      나열하는데 `places` 가 없었다. 그래서 editorHelpers 의 `(resolved as any).places` 는
 *      **언제나 undefined** 였고, 2026-08-25 에 들어간 다중 장소는 한 번도 동작한 적이 없다.
 *      기존 회귀 가드(placeMultiInsertWiring.test.ts)는 렌더러 소스 텍스트만 봐서 못 잡았다.
 *  (2) 발행 후처리 초기화가 고른 장소를 지운다 — 예약 발행 스케줄러가 임의 시점에
 *      `automation:reset-fields` 를 쏘면 사용자가 모르는 사이 목록이 비워진다.
 *
 * 이 파일은 소스 텍스트가 아니라 **값이 관통하는지**를 단언한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolveNaverRunOptions } from '../automation/runOptionsPolicy';

const resolve = (runOptions: Record<string, any>): any =>
  resolveNaverRunOptions({ runOptions, defaults: { defaultTitle: '제목', defaultContent: '본문' } });

const baseOptions = {
  title: '제목',
  content: '본문입니다.',
  publishMode: 'publish',
} as any;

describe('resolveRunOptions — 다중 장소가 발행까지 관통한다', () => {
  it('places 를 준 만큼 그대로 돌려준다', () => {
    const places = [
      { name: '가게1', address: '서울시 강남구 1', position: 'auto' },
      { name: '가게2', address: '서울시 강남구 2', position: 'heading-2' },
      { name: '가게3', address: '서울시 강남구 3', position: 'bottom' },
    ];
    const resolved = resolve({ ...baseOptions, places });
    expect(resolved.places).toHaveLength(3);
    expect(resolved.places.map((p: any) => p.name)).toEqual(['가게1', '가게2', '가게3']);
    expect(resolved.places[1].position).toBe('heading-2');
  });

  it('places 가 없으면 빈 배열 — 구버전 placeName 폴백은 그대로 산다', () => {
    const resolved = resolve({ ...baseOptions, placeName: '단일가게', placeAddress: '주소' });
    expect(resolved.places).toEqual([]);
    expect(resolved.placeName).toBe('단일가게');
  });

  it('이름 없는 항목은 버린다 — 빈 장소로 에디터 팝업을 열면 엉뚱한 가게가 박힌다', () => {
    const resolved = resolve({
      ...baseOptions,
      places: [{ name: '  ', address: 'a' }, { name: '진짜가게', address: 'b' }],
    });
    expect(resolved.places.map((p: any) => p.name)).toEqual(['진짜가게']);
  });
});

describe('places 배선 핀 — 화이트리스트 통과 지점', () => {
  const live = (path: string, needle: string): number => readFileSync(new URL(path, import.meta.url), 'utf8')
    .split(String.fromCharCode(10))
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .filter((line) => line.includes(needle))
    .length;

  it('BlogExecutor 가 payload.places 를 runOptions 로 넘긴다', () => {
    expect(live('../main/services/BlogExecutor.ts', 'places:')).toBeGreaterThan(0);
  });

  it('타입 정의 4곳에 places 가 있다 — 하나라도 빠지면 컴파일이 조용히 버린다', () => {
    for (const path of [
      '../automation/types.ts',
      '../main/ipc/blogHandlers.ts',
      '../main/services/AutomationService.ts',
      '../preload.ts',
    ]) {
      expect(live(path, 'places?:')).toBeGreaterThan(0);
    }
  });
});

describe('발행 후 초기화가 장소를 지우지 않는다', () => {
  it('photoModeReset 는 사진·메모만 비운다 — 장소는 사용자가 다음 글에도 쓸 수 있다', () => {
    const code = readFileSync(new URL('../renderer/modules/photoModeReset.ts', import.meta.url), 'utf8');
    const liveLines = code.split(String.fromCharCode(10))
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
    expect(liveLines.filter((line) => line.includes('clearPickedPlaces()')).length).toBe(0);
  });
});
