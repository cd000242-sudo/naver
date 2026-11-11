// @vitest-environment happy-dom
// [2026-11-11] 묶음 3b — 이미지 탭 "참고 사진" 목록의 순수 규칙: 추가·빼기·역할·최대 3장·수집 대표 사진 자동 반영·전달 여부.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CODEX_REFERENCE_MAX,
  EMPTY_CODEX_REFERENCE_STATE,
  addCodexReferenceEntries,
  buildCodexUserReferenceOptions,
  clearCodexReferenceImages,
  codexReferenceFileUrl,
  codexUserReferenceOptions,
  effectiveCodexReferenceEntries,
  extractCodexReferenceFailure,
  findCodexRepresentativeReference,
  getCodexReferenceState,
  removeCodexReferenceEntry,
  setCodexReferenceRole,
  setCodexReferenceState,
  subscribeCodexReferenceState,
  type CodexReferenceEntry,
} from '../renderer/utils/codexReferenceImageList';

const entry = (n: number, role: 'person' | 'product' = 'product'): CodexReferenceEntry => ({
  id: `ref-${n}`, path: `C:/managed/ref-${n}.png`, role, name: `사진${n}.png`, previewSrc: `data:image/png;base64,AA${n}`,
});
const withEntries = (...list: CodexReferenceEntry[]) => addCodexReferenceEntries(EMPTY_CODEX_REFERENCE_STATE, list).state;
const rep = { isRepresentative: true, localPath: 'C:/managed/rep.jpg', filePath: 'C:/managed/rep.jpg', url: 'C:/managed/rep.jpg', heading: '상품 이미지 1' };
const other = { localPath: 'C:/managed/other.jpg', filePath: 'C:/managed/other.jpg' };

afterEach(() => { clearCodexReferenceImages(); delete (window as any).currentStructuredContent; });

describe('추가 · 최대 3장', () => {
  it('3장까지 순서대로 받고, 넘치는 사진은 버리며 개수를 알려 준다', () => {
    const result = addCodexReferenceEntries(EMPTY_CODEX_REFERENCE_STATE, [entry(1), entry(2), entry(3), entry(4)]);
    expect(CODEX_REFERENCE_MAX).toBe(3);
    expect(result.state.entries.map((e) => e.id)).toEqual(['ref-1', 'ref-2', 'ref-3']);
    expect(result.accepted).toBe(3);
    expect(result.dropped).toBe(1);
  });
  it('이미 2장이면 1장만 더 받는다', () => {
    const base = withEntries(entry(1), entry(2));
    const result = addCodexReferenceEntries(base, [entry(3), entry(4)]);
    expect(result.state.entries).toHaveLength(3);
    expect(result.dropped).toBe(1);
  });
  it('같은 경로는 두 번 넣지 않는다', () => {
    const base = withEntries(entry(1));
    const result = addCodexReferenceEntries(base, [{ ...entry(9), path: entry(1).path }]);
    expect(result.state.entries).toHaveLength(1);
    expect(result.accepted).toBe(0);
  });
  it('입력 상태·목록을 바꾸지 않고 새 객체를 돌려준다', () => {
    const base = withEntries(entry(1));
    const frozen = Object.freeze({ ...base, entries: Object.freeze([...base.entries]) });
    const incoming = Object.freeze([entry(2)]);
    const result = addCodexReferenceEntries(frozen, incoming as CodexReferenceEntry[]);
    expect(result.state).not.toBe(frozen);
    expect(frozen.entries).toHaveLength(1);
  });
});

describe('빼기 · 역할 바꾸기', () => {
  it('역할을 바꾸면 그 사진만 바뀌고 원본은 그대로다', () => {
    const base = withEntries(entry(1), entry(2));
    const next = setCodexReferenceRole(base, 'ref-2', 'person', []);
    expect(next.entries.map((e) => e.role)).toEqual(['product', 'person']);
    expect(base.entries[1].role).toBe('product');
  });
  it('빼면 그 사진만 사라진다', () => {
    const next = removeCodexReferenceEntry(withEntries(entry(1), entry(2)), 'ref-1', []);
    expect(next.entries.map((e) => e.id)).toEqual(['ref-2']);
  });
  it('모르는 id 는 아무것도 바꾸지 않는다', () => {
    const base = withEntries(entry(1));
    expect(removeCodexReferenceEntry(base, 'nope', []).entries).toHaveLength(1);
    expect(setCodexReferenceRole(base, 'nope', 'person', []).entries[0].role).toBe('product');
  });
});

describe('수집 대표 사진 자동 반영', () => {
  it('내 사진이 없고 대표 사진이 있으면 그 한 장을 [제품] 으로 보여 준다', () => {
    const shown = effectiveCodexReferenceEntries(EMPTY_CODEX_REFERENCE_STATE, [other, rep]);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ path: 'C:/managed/rep.jpg', role: 'product', auto: true });
  });
  it('내 사진이 하나라도 있으면 자동 반영하지 않는다', () => {
    const shown = effectiveCodexReferenceEntries(withEntries(entry(1, 'person')), [rep]);
    expect(shown.map((e) => e.auto)).toEqual([false]);
    expect(shown[0].path).toBe(entry(1).path);
  });
  it('대표 표시가 없거나 주소(URL)뿐이면 반영하지 않는다 — 앱 폴더 파일만 넘길 수 있다', () => {
    expect(findCodexRepresentativeReference([other])).toBeNull();
    expect(findCodexRepresentativeReference([{ isRepresentative: true, url: 'https://shop.example/a.jpg', filePath: 'https://shop.example/a.jpg' }])).toBeNull();
    expect(findCodexRepresentativeReference([{ isRepresentative: true, filePath: 'data:image/png;base64,AA' }])).toBeNull();
    expect(findCodexRepresentativeReference(undefined)).toBeNull();
    expect(findCodexRepresentativeReference('x')).toBeNull();
  });
  it('자동 반영 사진을 빼면 같은 사진은 다시 나타나지 않고, 다른 대표 사진이 생기면 나타난다', () => {
    const dismissed = removeCodexReferenceEntry(EMPTY_CODEX_REFERENCE_STATE, 'auto:C:/managed/rep.jpg', [rep]);
    expect(effectiveCodexReferenceEntries(dismissed, [rep])).toEqual([]);
    const again = effectiveCodexReferenceEntries(dismissed, [{ ...rep, localPath: 'C:/managed/new.jpg', filePath: 'C:/managed/new.jpg' }]);
    expect(again[0].path).toBe('C:/managed/new.jpg');
  });
  it('자동 반영 사진의 역할을 바꾸면 내 사진으로 굳어 다시 계산되지 않는다', () => {
    const next = setCodexReferenceRole(EMPTY_CODEX_REFERENCE_STATE, 'auto:C:/managed/rep.jpg', 'person', [rep]);
    expect(next.entries).toHaveLength(1);
    expect(next.entries[0]).toMatchObject({ path: 'C:/managed/rep.jpg', role: 'person' });
    const shown = effectiveCodexReferenceEntries(next, [{ ...rep, localPath: 'C:/managed/zzz.jpg', filePath: 'C:/managed/zzz.jpg' }]);
    expect(shown.map((e) => [e.path, e.auto])).toEqual([['C:/managed/rep.jpg', false]]);
  });
});

describe('엔진에 넘길 옵션', () => {
  const state = withEntries(entry(1, 'person'), entry(2, 'product'));
  it('codex-image 일 때만 경로·역할을 담는다', () => {
    expect(buildCodexUserReferenceOptions({ provider: 'codex-image', state, collected: [] })).toEqual({
      userReferenceImages: [{ path: entry(1).path, role: 'person' }, { path: entry(2).path, role: 'product' }],
    });
    for (const provider of ['nano-banana-2', 'openai-image', 'genspark', 'flow', 'dropshot', 'collect-photos', '', undefined, null]) {
      expect(buildCodexUserReferenceOptions({ provider, state, collected: [rep] })).toEqual({});
    }
  });
  it('썸네일 칸에는 담지 않는다', () => {
    expect(buildCodexUserReferenceOptions({ provider: 'codex-image', isThumbnail: true, state, collected: [] })).toEqual({});
  });
  it('목록이 비어 있고 대표 사진도 없으면 키 자체를 담지 않는다', () => {
    expect(buildCodexUserReferenceOptions({ provider: 'codex-image', state: EMPTY_CODEX_REFERENCE_STATE, collected: [] })).toEqual({});
  });
  it('대표 사진만 있으면 [제품] 한 장을 담는다(가져온 원고에서도 대표 사진 기준)', () => {
    expect(buildCodexUserReferenceOptions({ provider: 'codex-image', state: EMPTY_CODEX_REFERENCE_STATE, collected: [rep, other] })).toEqual({
      userReferenceImages: [{ path: 'C:/managed/rep.jpg', role: 'product' }],
    });
  });
  it('돌려준 배열을 고쳐도 목록은 변하지 않는다', () => {
    const built = buildCodexUserReferenceOptions({ provider: 'codex-image', state, collected: [] });
    (built.userReferenceImages as any[]).push({ path: 'x', role: 'person' });
    expect(buildCodexUserReferenceOptions({ provider: 'codex-image', state, collected: [] }).userReferenceImages).toHaveLength(2);
  });
});

describe('지금 글 보관소(메모리)', () => {
  it('저장하고, 알리고, 비운다 — localStorage 에는 아무것도 쓰지 않는다', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const seen: number[] = [];
    const off = subscribeCodexReferenceState((s) => seen.push(s.entries.length));
    setCodexReferenceState(withEntries(entry(1), entry(2)));
    expect(getCodexReferenceState().entries).toHaveLength(2);
    clearCodexReferenceImages();
    expect(getCodexReferenceState().entries).toEqual([]);
    off();
    clearCodexReferenceImages();
    expect(seen).toEqual([2, 0]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('codexUserReferenceOptions 는 보관소와 현재 글의 수집 사진을 읽는다', () => {
    (window as any).currentStructuredContent = { collectedImages: [rep] };
    expect(codexUserReferenceOptions('codex-image')).toEqual({ userReferenceImages: [{ path: 'C:/managed/rep.jpg', role: 'product' }] });
    expect(codexUserReferenceOptions('nano-banana-2')).toEqual({});
    expect(codexUserReferenceOptions('codex-image', { isThumbnail: true })).toEqual({});
    setCodexReferenceState(withEntries(entry(1, 'person')));
    expect(codexUserReferenceOptions('codex-image')).toEqual({ userReferenceImages: [{ path: entry(1).path, role: 'person' }] });
  });
});

describe('실패 문구 · 미리보기 주소', () => {
  it('메인이 멈춘 한글 문구를 코드 뒤에서 그대로 꺼낸다', () => {
    const message = '[Codex 구독 이미지] 이미지 생성 실패: USER_REFERENCE_LOAD_FAILED: Codex 구독 이미지가 참고 사진 2번을 불러오지 못해 멈췄습니다. 참고 사진 없이 만들거나 다른 엔진으로 바꾸지 않았습니다.';
    expect(extractCodexReferenceFailure(message)).toBe('Codex 구독 이미지가 참고 사진 2번을 불러오지 못해 멈췄습니다. 참고 사진 없이 만들거나 다른 엔진으로 바꾸지 않았습니다.');
    expect(extractCodexReferenceFailure('USER_REFERENCE_INVALID: 참고 사진은 최대 3장까지입니다. (4장)')).toBe('참고 사진은 최대 3장까지입니다. (4장)');
  });
  it('다른 오류·빈 값은 null', () => {
    expect(extractCodexReferenceFailure('SHOPPING_REFERENCE_LOAD_FAILED: x')).toBeNull();
    expect(extractCodexReferenceFailure(undefined)).toBeNull();
    expect(extractCodexReferenceFailure('')).toBeNull();
  });
  it('윈도우 경로를 file 주소로 바꾼다(공백·# · ? 안전)', () => {
    expect(codexReferenceFileUrl('C:\\Users\\a b\\참고#1.png')).toBe('file:///C:/Users/a%20b/%EC%B0%B8%EA%B3%A0%231.png');
    expect(codexReferenceFileUrl('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
    expect(codexReferenceFileUrl('')).toBe('');
  });
});
