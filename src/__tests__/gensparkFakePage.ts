// [2026-10-10] 젠스파크 전송·수거 시험용 가짜 page. 실제 브라우저·네트워크 없음.
//   evaluate 는 화면 읽기 함수의 "참조"를 보고 고정 상태에서 답한다(직렬화 없음). 좌표는 대상 번호로 쓰고, 클릭 때 동작을 실행한다.
import {
  GENSPARK_SELECTORS,
  focusGensparkComposer,
  locateGensparkPoint,
  readGensparkComposer,
  readGensparkJobImages,
  readGensparkMenuState,
  readGensparkModelMenu,
  readGensparkPageSignals,
  readGensparkSelectedModel,
  readGensparkSettingsMenu,
} from '../image/genspark/gensparkSelectors';
import { fetchGensparkImageBytes, fetchGensparkProjectResult } from '../image/genspark/gensparkCollect';
import type { GensparkPageLike } from '../image/genspark/gensparkTypes';

export interface FakeMenuItem { label: string; creditFree: boolean; needsInput: boolean; isNew: boolean }
export interface FakeOpt { label: string; selected: boolean }

export interface FakeState {
  url: string;
  selected: string | null;
  menuOpen: boolean;
  menuItems: FakeMenuItem[];
  settingsOpen: boolean;
  ratios: FakeOpt[];
  counts: FakeOpt[];
  composerFound: boolean;
  composerValue: string;
  /** insertText 가 몇 번째 호출까지 글을 망가뜨릴지(0=정상) */
  corruptInserts: number;
  /** send 클릭 후 url() 을 몇 번 부른 뒤 작업 주소로 바뀔지(음수=안 바뀜) */
  jobUrlAfterPolls: number;
  jobUrl: string;
  sendClicked: boolean;
  signals: { hasComposer: boolean; loginRequired: boolean; challenge: boolean; rateLimited: boolean; failed: boolean };
  jobImages: string[];
  fetchResult: unknown;
  /** 마우스로 누를 수 없게 할 대상 종류(찾지 못함 흉내) */
  missingTargets: string[];
  /** true 면 Escape 를 눌러도 메뉴가 안 닫힌다(2026-10-10 실측 흉내) */
  escapeIgnored: boolean;
  /** true 면 입력창에 포커스를 줄 수 없다 */
  focusFails: boolean;
  /** 작업 화면 이미지가 몇 번째 읽기부터 보일지(0=바로, 2026-10-10 실측: 열고 1~4초 뒤) */
  jobImagesAfterReads: number;
  /** 앞으로 goto 를 몇 번 실패시킬지(바쁜 PC 에서 화면 열기 시간 초과 흉내) */
  gotoFails: number;
  /** /api/project 가벼운 확인 결과(기본 ok:false → 작업 화면을 여는 기존 경로) */
  projectResult: { ok: boolean; images: string[]; failed: boolean };
}

export function newFakeState(): FakeState {
  return {
    url: 'about:blank',
    selected: 'GPT Image 2.5',
    menuOpen: false,
    menuItems: [],
    settingsOpen: false,
    ratios: [{ label: '1:1', selected: true }, { label: '16:9', selected: false }],
    counts: [{ label: '1', selected: true }, { label: '2', selected: false }, { label: '4', selected: false }],
    composerFound: true,
    composerValue: '',
    corruptInserts: 0,
    jobUrlAfterPolls: 0,
    jobUrl: 'https://www.genspark.ai/agents?id=job-1',
    sendClicked: false,
    signals: { hasComposer: true, loginRequired: false, challenge: false, rateLimited: false, failed: false },
    jobImages: [],
    fetchResult: null,
    missingTargets: [],
    escapeIgnored: false,
    focusFails: false,
    jobImagesAfterReads: 0,
    gotoFails: 0,
    projectResult: { ok: false, images: [], failed: false },
  };
}

export interface FakePage extends GensparkPageLike {
  state: FakeState;
  calls: { gotos: string[]; clicks: string[]; inserts: string[]; keys: string[]; bringToFront: number };
}

export function createFakePage(state: FakeState): FakePage {
  const targets: Array<{ name: string; run: () => void }> = [];
  const calls = { gotos: [] as string[], clicks: [] as string[], inserts: [] as string[], keys: [] as string[], bringToFront: 0 };
  let polls = 0;
  let insertCount = 0;
  let selectAll = false;
  let jobImageReads = 0;

  const point = (name: string, run: () => void) => {
    targets.push({ name, run });
    return { x: targets.length - 1, y: 0 };
  };
  const locate = (req: { selector: string; label?: string; scope?: string }) => {
    const S = GENSPARK_SELECTORS;
    const missing = (n: string) => state.missingTargets.includes(n);
    if (req.selector === S.modelButton) return missing('modelButton') ? null : point('modelButton', () => { state.menuOpen = true; });
    if (req.selector === S.modelItem) {
      const item = state.menuItems.find((m) => m.label === req.label);
      return item && state.menuOpen ? point(`model:${req.label}`, () => { state.selected = item.label; state.menuOpen = false; }) : null;
    }
    if (req.selector === S.settingsButton) return missing('settingsButton') ? null : point('settingsButton', () => { state.settingsOpen = true; });
    if (req.selector === S.ratioOption || req.selector === S.sizeOption || req.selector === ':not(:has(*))') {
      const list = state.ratios.find((o) => o.label === req.label) ? state.ratios : state.counts;
      const opt = list.find((o) => o.label === req.label);
      if (!opt || !state.settingsOpen) return null;
      return point(`opt:${req.label}`, () => { list.forEach((o) => { o.selected = o === opt; }); });
    }
    if (req.selector === S.composer) return point('composer', () => {});
    if (req.selector === S.sendButton) return missing('sendButton') ? null : point('send', () => { state.sendClicked = true; });
    return null;
  };

  const page: FakePage = {
    state,
    calls,
    async goto(url) {
      calls.gotos.push(url);
      if (state.gotoFails > 0) { state.gotoFails -= 1; throw new Error('page.goto: Timeout 30000ms exceeded.'); }
      state.url = url;
      return undefined;
    },
    url() {
      if (state.sendClicked && state.jobUrlAfterPolls >= 0 && polls++ >= state.jobUrlAfterPolls) state.url = state.jobUrl;
      return state.url;
    },
    evaluate: (async (fn: (arg: any) => any, arg?: unknown) => {
      if (fn === readGensparkSelectedModel) return state.selected;
      if (fn === readGensparkModelMenu) return state.menuOpen ? state.menuItems : [];
      if (fn === readGensparkSettingsMenu) return state.settingsOpen ? { ratios: state.ratios, counts: state.counts } : { ratios: [], counts: [] };
      if (fn === readGensparkComposer) return { found: state.composerFound, value: state.composerValue };
      if (fn === focusGensparkComposer) {
        if (!state.composerFound || state.focusFails) return false;
        selectAll = true;
        return true;
      }
      if (fn === readGensparkMenuState) {
        const openMenus = Number(state.menuOpen) + Number(state.settingsOpen);
        return { openMenus, neutral: point('neutral', () => { state.menuOpen = false; state.settingsOpen = false; }) };
      }
      if (fn === readGensparkPageSignals) return { url: state.url, ...state.signals };
      if (fn === readGensparkJobImages) return ++jobImageReads > state.jobImagesAfterReads ? state.jobImages : [];
      if (fn === locateGensparkPoint) return locate(arg as never);
      if (fn === fetchGensparkImageBytes) return state.fetchResult;
      if (fn === fetchGensparkProjectResult) return state.projectResult;
      throw new Error('가짜 page: 모르는 evaluate 함수');
    }) as GensparkPageLike['evaluate'],
    mouse: {
      async click(x) {
        const t = targets[x];
        calls.clicks.push(t.name);
        t.run();
      },
    },
    keyboard: {
      async insertText(text) {
        calls.inserts.push(text);
        insertCount += 1;
        const mangled = insertCount <= state.corruptInserts ? text.slice(0, Math.max(1, text.length - 3)) : text;
        state.composerValue = (selectAll ? '' : state.composerValue) + mangled;
        selectAll = false;
      },
      async press(key) {
        calls.keys.push(key);
        if (key === 'Control+A') selectAll = true;
        if (key === 'Backspace' && selectAll) { state.composerValue = ''; selectAll = false; }
        if (key === 'Escape' && !state.escapeIgnored) { state.menuOpen = false; state.settingsOpen = false; }
      },
    },
    async bringToFront() { calls.bringToFront += 1; },
  };
  return page;
}

/** 가짜 시계: sleep 이 시간을 앞으로 보낸다. */
export function createFakeClock() {
  let t = 1_000;
  return { now: () => t, sleep: async (ms: number) => { t += ms; }, random: () => 0.5 };
}
