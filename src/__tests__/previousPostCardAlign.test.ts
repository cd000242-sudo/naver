// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import {
  alignPreviousPostCardsInEditor,
  previousPostCardAlignInPage,
  previousPostCardAlignReadScreen,
} from '../automation/previousPostCardAlign';

const A = 'https://blog.naver.com/sample_blog/111';
const B = 'https://blog.naver.com/sample_blog/222';
const OTHER = 'https://blog.naver.com/sample_blog/999';

type Component = Record<string, unknown>;
function install(components: Component[], behaviour: { keepAlign?: boolean; throwOnSet?: boolean } = {}) {
  const state = { data: { document: { components } }, sets: 0 };
  const editor = {
    getDocumentData: () => JSON.parse(JSON.stringify(state.data)),
    setDocumentData: (data: { document: { components: Component[] } }) => {
      if (behaviour.throwOnSet) throw new Error('editor refused');
      state.sets += 1;
      const next = JSON.parse(JSON.stringify(data));
      if (behaviour.keepAlign === false) for (const c of next.document.components) if (c['@ctype'] === 'oglink') delete c.align;
      state.data = next;
    },
  };
  (window as any).SmartEditor = { _editors: { main: editor } };
  // The screen holds the same blocks as the data unless a test says otherwise.
  document.body.innerHTML = components.map((c) => `<div class="se-component se-${String(c['@ctype'])}"></div>`).join('');
  return state;
}
const oglink = (link: string, extra: Component = {}): Component => ({ id: `SE-${link.slice(-3)}`, layout: 'large_image', link, '@ctype': 'oglink', ...extra });
const paragraph: Component = { id: 'SE-t', value: [{ style: { align: 'left' } }], '@ctype': 'text' };

afterEach(() => { delete (window as any).SmartEditor; document.body.innerHTML = ''; });

describe('previous-post cards: write the alignment into the editor document', () => {
  it('centers only the cards of this post and leaves every other component alone', () => {
    const state = install([paragraph, oglink(A), oglink(OTHER), oglink(B)]);
    const result = previousPostCardAlignInPage([A, B]);
    expect(result).toMatchObject({ status: 'aligned', matched: 2, changed: 2, centeredInData: 2 });
    expect(result.keys).toEqual(['@ctype', 'id', 'layout', 'link']);
    const comps = state.data.document.components;
    expect(comps.map((c) => c.align)).toEqual([undefined, 'center', undefined, 'center']);
    expect(comps[0]).toEqual(paragraph);
    expect(state.sets).toBe(1);
  });

  it('matches the same post written as a mobile or PostView address', () => {
    install([oglink('https://m.blog.naver.com/Sample_Blog/111?trackingCode=x'), oglink('https://blog.naver.com/PostView.naver?blogId=sample_blog&logNo=222')]);
    expect(previousPostCardAlignInPage([A, B])).toMatchObject({ status: 'aligned', matched: 2 });
  });

  it('does not write anything when the cards are already centered', () => {
    const state = install([oglink(A, { align: 'center' })]);
    expect(previousPostCardAlignInPage([A])).toMatchObject({ status: 'unchanged', matched: 1, changed: 0 });
    expect(state.sets).toBe(0);
  });

  it('reports instead of pretending: no editor API, no matching card, alignment dropped, editor error', () => {
    expect(previousPostCardAlignInPage([A]).status).toBe('no-api');
    install([paragraph, oglink(OTHER)]);
    expect(previousPostCardAlignInPage([A]).status).toBe('no-cards');
    install([oglink(A)], { keepAlign: false });
    expect(previousPostCardAlignInPage([A])).toMatchObject({ status: 'error', matched: 1, centeredInData: 0 });
    install([oglink(A)], { throwOnSet: true });
    expect(previousPostCardAlignInPage([A])).toMatchObject({ status: 'error', message: 'editor refused' });
    expect(previousPostCardAlignInPage([]).status).toBe('no-cards');
  });
});

describe('previous-post cards: the typed address lines go, only the cards stay', () => {
  const para = (text: string): Component => ({ '@ctype': 'paragraph', nodes: [{ '@ctype': 'textNode', value: text }] });
  const text = (...lines: string[]): Component => ({ id: `SE-t${lines.length}`, value: lines.map(para), '@ctype': 'text' });
  const lines = (c: Component): string[] => ((c.value as Component[]) || []).map((p) => ((p.nodes as Component[]) || []).map((n) => String(n.value || '')).join(''));

  it('removes the address paragraph of each card, drops a block that held nothing else, keeps every other line', () => {
    // [2026-11-24 live run] the screen-only cleanup had removed these lines, and writing the document back brought them back.
    const state = install([text('본문 마지막 문단'), text('━━━', '✨ 이런 글도 많이 봤어요!', A), oglink(A), text(B), oglink(B), text('')]);
    const result = previousPostCardAlignInPage([A, B]);
    expect(result).toMatchObject({ status: 'aligned', matched: 2, removedAddressLines: 2 });
    const comps = state.data.document.components;
    expect(comps.map((c) => c['@ctype'])).toEqual(['text', 'text', 'oglink', 'oglink', 'text']);
    expect(lines(comps[1])).toEqual(['━━━', '✨ 이런 글도 많이 봤어요!']);
    expect(lines(comps[4])).toEqual(['']);
  });

  it('keeps an address that is part of a sentence, and an address of some other post', () => {
    const state = install([text(`자세한 내용은 ${A} 에 있습니다`, OTHER), oglink(A)]);
    const result = previousPostCardAlignInPage([A]);
    expect(result.removedAddressLines).toBe(0);
    expect(lines(state.data.document.components[0])).toEqual([`자세한 내용은 ${A} 에 있습니다`, OTHER]);
  });

  it('still cleans the address lines when the cards were centered already', () => {
    const state = install([text(A), oglink(A, { align: 'center' }), text('')]);
    expect(previousPostCardAlignInPage([A])).toMatchObject({ status: 'aligned', changed: 0, removedAddressLines: 1 });
    expect(state.sets).toBe(1);
  });
});

describe('previous-post cards: never redraw when the screen holds something the data does not', () => {
  it('leaves the document untouched when a photo exists on the screen only', () => {
    const state = install([paragraph, oglink(A)]);
    document.body.innerHTML += '<div class="se-component se-image"></div>';
    const result = previousPostCardAlignInPage([A]);
    expect(result).toMatchObject({ status: 'unsafe', matched: 1, changed: 0 });
    expect(result.message).toContain('사진 0/1');
    expect(state.sets).toBe(0);
    expect(state.data.document.components[1].align).toBeUndefined();
  });
});

describe('previous-post cards: read the alignment back from the screen', () => {
  const card = (href: string, sectionClass: string) =>
    `<div class="se-component se-oglink"><div class="se-component-content"><div class="se-section se-section-oglink ${sectionClass}"><a href="${href}">t</a></div></div></div>`;

  it('counts the cards on the screen and the address lines that are still there', () => {
    document.body.innerHTML = card(A, 'se-section-align-center') + card(B, 'se-l-large_image') + card(OTHER, 'se-section-align-center');
    document.body.innerHTML += `<div class="se-component se-text"><p class="se-text-paragraph">${B}</p><p class="se-text-paragraph">본문 ${A}</p></div>`;
    expect(previousPostCardAlignReadScreen([A, B])).toEqual({ shown: 3, centered: 2, leftover: 1, photos: 0 });
  });

  it('confirms only when the screen agrees, and never throws', async () => {
    const logs: string[] = [];
    const frame = (screen: { shown: number; leftover: number; photos?: number }, page: unknown) => ({
      evaluate: async (fn: (urls: readonly string[]) => unknown) => (fn === previousPostCardAlignInPage ? page : { photos: 0, centered: 0, ...screen }),
    });
    const ok = await alignPreviousPostCardsInEditor(frame({ shown: 2, leftover: 0 }, { status: 'aligned', matched: 2, changed: 2, centeredInData: 2, removedAddressLines: 2, keys: ['align'] }) as never,
      [A, B], { log: (m) => logs.push(m), delay: async () => undefined, screenWaitMs: 5 });
    expect(ok.leftoverOnScreen).toBe(0);
    expect(logs[0]).toContain('가운데로 맞췄습니다');
    expect(logs[0]).toContain('주소 줄 2개 정리');

    const notShown = await alignPreviousPostCardsInEditor(frame({ shown: 2, leftover: 1 }, { status: 'aligned', matched: 2, changed: 2, centeredInData: 2, removedAddressLines: 1, keys: ['align', 'link'] }) as never,
      [A, B], { log: (m) => logs.push(m), delay: async () => undefined, screenWaitMs: 5 });
    expect(notShown.leftoverOnScreen).toBe(1);
    expect(logs[1]).toContain('확인하지 못했습니다');
    expect(logs[1]).toContain('남은 주소 1');
    expect(logs[1]).toContain('칸 align,link');

    const broken = await alignPreviousPostCardsInEditor({ evaluate: async () => { throw new Error('frame detached'); } } as never,
      [A], { log: (m) => logs.push(m), delay: async () => undefined, screenWaitMs: 5 });
    expect(broken.status).toBe('error');
    expect((await alignPreviousPostCardsInEditor(frame({ shown: 0, leftover: 0 }, {}) as never, [])).status).toBe('no-cards');
  });
});
