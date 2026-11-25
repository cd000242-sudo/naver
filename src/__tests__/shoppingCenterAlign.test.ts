// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import {
  alignShoppingPostCenterInEditor,
  shoppingCenterAlignInPage,
  SHOPPING_CENTER_LINE_STARTS,
} from '../automation/shoppingCenterAlign';

type Component = Record<string, unknown>;
const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const HOOKS = ['✨ 이런 글도 많이 봤어요!'];

function install(components: Component[], behaviour: { dropAlign?: boolean; throwOnSet?: boolean } = {}) {
  const state = { data: { document: { components } }, sets: 0 };
  const editor = {
    getDocumentData: () => JSON.parse(JSON.stringify(state.data)),
    setDocumentData: (data: { document: { components: Component[] } }) => {
      if (behaviour.throwOnSet) throw new Error('editor refused');
      state.sets += 1;
      const next = JSON.parse(JSON.stringify(data));
      if (behaviour.dropAlign) for (const c of next.document.components) delete c.align;
      state.data = next;
    },
  };
  (window as any).SmartEditor = { _editors: { main: editor } };
  // The screen holds the same blocks as the data unless a test says otherwise.
  document.body.innerHTML = components.map((c) => `<div class="se-component se-${String(c['@ctype'])}"></div>`).join('');
  return state;
}
const image = (extra: Component = {}): Component => ({ id: 'SE-img', layout: 'default', align: 'left', '@ctype': 'image', ...extra });
const card = (extra: Component = {}): Component => ({ id: 'SE-og', layout: 'large_image', link: 'https://naver.me/abc', '@ctype': 'oglink', ...extra });
const para = (text: string, align?: string): Component => ({
  id: 'SE-p', nodes: [{ value: text, '@ctype': 'textNode' }], style: { ...(align ? { align } : {}), '@ctype': 'paragraphStyle' }, '@ctype': 'paragraph',
});
const text = (...paragraphs: Component[]): Component => ({ id: 'SE-t', value: paragraphs, '@ctype': 'text' });
const aligns = (state: { data: { document: { components: Component[] } } }) => state.data.document.components.map((c) => c.align);
const lineAligns = (component: Component) => (component.value as Array<{ style?: { align?: string } }>).map((p) => p.style?.align);

afterEach(() => { delete (window as any).SmartEditor; document.body.innerHTML = ''; });

describe('shopping post: photos, cards and the banner block go to the centre', () => {
  it('centres every photo and link card, and only the banner-block lines of the text', () => {
    const state = install([
      text(para('본문 문단입니다.', 'left')),
      image(),
      text(para('​'), para(DIVIDER), para('📎 사용 조건과 주의사항은 상세 페이지에서 한 번 더 살펴보세요'), para('👉 https://naver.me/abc')),
      card(),
      text(para(HOOKS[0]), para('#해시태그 #둘째')),
    ]);
    const result = shoppingCenterAlignInPage(HOOKS);
    expect(result).toMatchObject({ status: 'aligned', images: 1, cards: 1, lines: 3, removedAddressLines: 1 });
    expect(state.sets).toBe(1);
    expect(aligns(state)).toEqual([undefined, 'center', undefined, 'center', undefined]);
    const comps = state.data.document.components;
    expect(lineAligns(comps[0])).toEqual(['left']); // the body stays as the owner set it (2026-09-02: left)
    // the "👉 address" line is gone: its card (same link) is right below it
    expect(lineAligns(comps[2])).toEqual([undefined, 'center', 'center']);
    expect(lineAligns(comps[4])).toEqual(['center', undefined]); // hashtags are not touched
  });

  // 2026-11-25 live post: the screen-only cleanup had removed "👉 address" once its card was drawn, but the document
  // still held the line, so writing the document back showed it again above the card.
  it('an address line leaves the document only when its own card exists', () => {
    const state = install([
      text(para(DIVIDER), para('👉 https://naver.me/abc'), para('👉 https://naver.me/no-card-yet')),
      card(),
      text(para('https://naver.me/abc')),
      text(para('#태그')),
    ]);
    const result = shoppingCenterAlignInPage(HOOKS);
    expect(result).toMatchObject({ status: 'aligned', removedAddressLines: 2, cards: 1 });
    const comps = state.data.document.components;
    expect(comps.map((c) => c['@ctype'])).toEqual(['text', 'oglink', 'text']); // the block that held only the address is gone
    expect((comps[0].value as Array<{ nodes: Array<{ value: string }> }>).map((p) => p.nodes[0].value)).toEqual([DIVIDER, '👉 https://naver.me/no-card-yet']);
  });

  it('a paragraph without a style object gets one', () => {
    const bare: Component = { id: 'SE-p', nodes: [{ value: DIVIDER, '@ctype': 'textNode' }], '@ctype': 'paragraph' };
    const state = install([text(bare)]);
    expect(shoppingCenterAlignInPage(HOOKS)).toMatchObject({ status: 'aligned', lines: 1 });
    expect(lineAligns(state.data.document.components[0])).toEqual(['center']);
  });

  it('writes nothing when everything is already centred', () => {
    const state = install([image({ align: 'center' }), text(para(DIVIDER, 'center')), card({ align: 'center' })]);
    expect(shoppingCenterAlignInPage(HOOKS)).toMatchObject({ status: 'unchanged', changed: 0 });
    expect(state.sets).toBe(0);
  });

  it('does not rewrite the document when the screen holds blocks the data does not', () => {
    const state = install([image(), text(para(DIVIDER))]);
    document.body.innerHTML += '<div class="se-component se-image"></div>'; // a photo still uploading: screen only
    const result = shoppingCenterAlignInPage(HOOKS);
    expect(result.status).toBe('unsafe');
    expect(state.sets).toBe(0);
  });

  it('reports instead of pretending: no editor, nothing to centre, alignment dropped, editor error', () => {
    expect(shoppingCenterAlignInPage(HOOKS).status).toBe('no-api');
    install([text(para('본문만 있는 글'))]);
    expect(shoppingCenterAlignInPage(HOOKS).status).toBe('nothing');
    install([image()], { dropAlign: true });
    expect(shoppingCenterAlignInPage(HOOKS).status).toBe('error');
    install([image()], { throwOnSet: true });
    expect(shoppingCenterAlignInPage(HOOKS)).toMatchObject({ status: 'error', message: expect.stringContaining('editor refused') });
  });

  it('the line starts it centres are the ones the banner block types', () => {
    expect(SHOPPING_CENTER_LINE_STARTS).toEqual(['📎', '👉', '🔗']);
  });
});

describe('shopping post: the wrapper never throws and says what happened', () => {
  it('logs the counts on success and warns when a photo disappeared', async () => {
    const state = install([image(), text(para(DIVIDER)), card()]);
    const logs: string[] = [];
    const frame = { evaluate: async <T, A>(fn: (arg: A) => T, arg: A): Promise<T> => fn(arg) };
    const result = await alignShoppingPostCenterInEditor(frame, HOOKS, { log: (m) => logs.push(m), delay: async () => undefined, screenWaitMs: 0 });
    expect(result.status).toBe('aligned');
    expect(state.sets).toBe(1);
    expect(logs.join('\n')).toContain('가운데');
  });

  it('a frame that fails is reported, not thrown', async () => {
    const logs: string[] = [];
    const frame = { evaluate: async () => { throw new Error('detached'); } };
    const result = await alignShoppingPostCenterInEditor(frame as any, HOOKS, { log: (m) => logs.push(m), delay: async () => undefined, screenWaitMs: 0 });
    expect(result.status).toBe('error');
    expect(logs.join('\n')).toContain('확인하지 못했습니다');
  });
});
