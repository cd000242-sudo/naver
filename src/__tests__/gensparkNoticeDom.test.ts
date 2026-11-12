// @vitest-environment happy-dom
// [2026-11-12 실측(Orbit)] 안내 창('AI 이미지은(는) 이제 Media Studio의 일부입니다')은 화면을 덮는 .mar-backdrop 안에 있고
//   '나중에' 단추가 있다. 화면 읽기 함수가 고정 HTML 에서 창·단추·좌표를 바르게 읽는지 본다(실제 사이트 접속 없음).
import { beforeEach, describe, expect, it } from 'vitest';
import { readGensparkNotice } from '../image/genspark/gensparkNotice';

const rect = (l: number, t: number, w: number, h: number) =>
  () => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON: () => ({}) }) as DOMRect;
const size = (id: string, l: number, t: number, w: number, h: number): void => {
  (document.getElementById(id) as HTMLElement).getBoundingClientRect = rect(l, t, w, h);
};

describe('readGensparkNotice', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('안내 창이 없으면 보이지 않음', () => {
    document.body.innerHTML = '<textarea class="search-input"></textarea>';
    expect(readGensparkNotice()).toEqual({ visible: false, later: null });
  });

  it("보이는 .mar-backdrop 안의 '나중에' 단추 중심 좌표를 돌려준다(체크박스·다른 단추는 고르지 않는다)", () => {
    document.body.innerHTML = `
      <div class="mar-backdrop" id="bd"><div class="dialog">
        <p>AI 이미지은(는) 이제 Media Studio의 일부입니다</p>
        <label><input type="checkbox" id="never"> 다시 표시하지 않음</label>
        <button id="try">Media Studio 사용해 보기</button>
        <button id="later">나중에</button>
      </div></div>`;
    size('bd', 0, 0, 1280, 800);
    size('try', 400, 500, 200, 40);
    size('later', 620, 500, 100, 40);
    expect(readGensparkNotice()).toEqual({ visible: true, later: { x: 670, y: 520 } });
  });

  it('영어 화면의 Later / Not now 도 같은 단추로 본다', () => {
    for (const label of ['Later', 'Not now']) {
      document.body.innerHTML = `<div class="mar-backdrop" id="bd"><button id="b">${label}</button></div>`;
      size('bd', 0, 0, 1280, 800);
      size('b', 100, 100, 80, 30);
      expect(readGensparkNotice().later).toEqual({ x: 140, y: 115 });
    }
  });

  it('닫는 단추가 없으면 창만 보인다고 알린다(호출자가 Escape)', () => {
    document.body.innerHTML = '<div class="mar-backdrop" id="bd"><button id="try">Media Studio 사용해 보기</button></div>';
    size('bd', 0, 0, 1280, 800);
    size('try', 400, 500, 200, 40);
    expect(readGensparkNotice()).toEqual({ visible: true, later: null });
  });

  it('크기가 0 이거나 숨겨진 .mar-backdrop 은 안내 창이 아니다', () => {
    document.body.innerHTML = '<div class="mar-backdrop" id="bd"><button id="b">나중에</button></div>';
    size('bd', 0, 0, 0, 0);
    expect(readGensparkNotice().visible).toBe(false);
    size('bd', 0, 0, 1280, 800);
    (document.getElementById('bd') as HTMLElement).style.display = 'none';
    expect(readGensparkNotice().visible).toBe(false);
  });

  it('크기가 0 인 단추는 누를 수 없으니 고르지 않는다', () => {
    document.body.innerHTML = '<div class="mar-backdrop" id="bd"><button id="b">나중에</button></div>';
    size('bd', 0, 0, 1280, 800);
    size('b', 0, 0, 0, 0);
    expect(readGensparkNotice()).toEqual({ visible: true, later: null });
  });
});
