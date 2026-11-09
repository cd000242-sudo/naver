/**
 * [2026-11-04] 사장님 결정: 해시태그는 본문 글자가 아니라 네이버 발행창 "태그 편집" 칸에 들어가야 한다.
 * 본문 맨 끝에 #태그를 그대로 입력한 뒤, 발행창을 열면 네이버가 본문 #태그를 태그 칸에 자동 등록한다 → 등록을
 * 확인하고 → 창을 닫고 → 본문의 해시태그 줄만 지우고 → 창을 다시 열어 태그가 남아 있는지 확인한다(없으면 직접 입력).
 * 브라우저 없이 가짜 세계(fake deps)로 순서 · 재시도 · 안전장치를 검증한다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  findBodyHashtagParagraphs,
  moveBodyHashtagsToTagField,
  readPublishDialogTags,
  selectHashtagParagraphs,
  type PublishTagFieldDeps,
} from '../automation/publishTagField';
import { createPublishTagFieldDeps } from '../automation/publishTagFieldDom';

const SRC = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(SRC, relative), 'utf8');

interface WorldOptions {
  body?: string[];
  /** Opening the dialog registers the body #tags into the tag field (what NAVER does). */
  autoRegister?: boolean;
  /** After body lines were deleted, tags survive a reopen. */
  keepTagsOnReopen?: boolean;
  /** One tag disappears on the reopen that follows the deletion. */
  dropTagOnReopen?: string;
  /** The dialog opens on the Nth toggle click (0 = never opens). */
  opensOnClick?: number;
  /** Only the first open works (the reopen never shows). */
  openOnlyOnce?: boolean;
  escapeCloses?: boolean;
  toggleCloses?: boolean;
  deleteWorks?: boolean;
}

function makeWorld(options: WorldOptions = {}) {
  const o = {
    body: ['첫 문단입니다.', '둘째 문단입니다.', '#태그하나 #태그둘'],
    autoRegister: true,
    keepTagsOnReopen: true,
    opensOnClick: 1,
    openOnlyOnce: false,
    escapeCloses: true,
    toggleCloses: true,
    deleteWorks: true,
    ...options,
  };
  const world = {
    body: [...o.body],
    dialogOpen: false,
    tags: [] as string[],
    clicks: 0,
    opens: 0,
    deleted: 0,
    calls: [] as string[],
    logs: [] as string[],
  };
  const paragraphs = () => selectHashtagParagraphs(world.body.map((text, index) => ({ index, text })));
  const deps: PublishTagFieldDeps = {
    findBodyHashtagParagraphs: async () => paragraphs(),
    readDialogTags: async () => (world.dialogOpen ? [...world.tags] : []),
    isDialogOpen: async () => world.dialogOpen,
    clickPublishToggle: async () => {
      world.calls.push('toggle');
      world.clicks += 1;
      if (world.dialogOpen) {
        if (o.toggleCloses) world.dialogOpen = false;
        return true;
      }
      const mayOpen = o.opensOnClick > 0 && world.clicks >= o.opensOnClick && !(o.openOnlyOnce && world.opens >= 1);
      if (!mayOpen) return true;
      world.dialogOpen = true;
      world.opens += 1;
      if (world.deleted > 0 && !o.keepTagsOnReopen) world.tags = [];
      if (world.deleted > 0 && o.dropTagOnReopen) world.tags = world.tags.filter((tag) => tag !== o.dropTagOnReopen);
      if (o.autoRegister) {
        for (const paragraph of paragraphs()) {
          for (const tag of paragraph.tags) if (!world.tags.includes(tag)) world.tags.push(tag);
        }
      }
      return true;
    },
    pressEscape: async () => {
      world.calls.push('escape');
      if (o.escapeCloses) world.dialogOpen = false;
    },
    deleteParagraph: async (paragraph) => {
      world.calls.push(`delete:${paragraph.index}`);
      if (!o.deleteWorks) return false;
      world.body.splice(paragraph.index, 1);
      world.deleted += 1;
      return true;
    },
    typeTag: async (tag) => {
      world.calls.push(`type:${tag}`);
      if (!world.dialogOpen) return false;
      world.tags.push(tag);
      return true;
    },
    delay: async () => undefined,
    log: (message) => { world.logs.push(message); },
  };
  return { world, deps };
}

describe('moveBodyHashtagsToTagField', () => {
  it('tags present -> body hashtag line deleted -> tags still present -> nothing typed', async () => {
    const { world, deps } = makeWorld();
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('moved');
    expect(result.tagsBefore).toEqual(['태그하나', '태그둘']);
    expect(result.tagsAfter).toEqual(['태그하나', '태그둘']);
    expect(result.deletedParagraphs).toBe(1);
    expect(result.typedFallback).toBe(0);
    expect(result.missingAfter).toEqual([]);
    expect(world.body).toEqual(['첫 문단입니다.', '둘째 문단입니다.']);
    // open -> close -> delete -> reopen -> close, and the dialog ends closed
    expect(world.calls).toEqual(['toggle', 'escape', 'delete:2', 'toggle', 'escape']);
    expect(world.dialogOpen).toBe(false);
  });

  it('tags dropped after the delete -> the missing ones are typed into the tag input', async () => {
    const { world, deps } = makeWorld({ keepTagsOnReopen: false });
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('moved');
    expect(result.typedFallback).toBe(2);
    expect(result.tagsAfter).toEqual(['태그하나', '태그둘']);
    expect(world.calls.filter((call) => call.startsWith('type:'))).toEqual(['type:태그하나', 'type:태그둘']);
    expect(world.body).toEqual(['첫 문단입니다.', '둘째 문단입니다.']);
    expect(world.dialogOpen).toBe(false);
  });

  it('only the tag that went missing is typed', async () => {
    const { world, deps } = makeWorld({ dropTagOnReopen: '태그둘' });
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('moved');
    expect(result.typedFallback).toBe(1);
    expect(world.calls.filter((call) => call.startsWith('type:'))).toEqual(['type:태그둘']);
  });

  it('a tag that cannot be typed back is reported, not hidden', async () => {
    const { world, deps } = makeWorld({ keepTagsOnReopen: false });
    deps.typeTag = async (tag) => { world.calls.push(`type:${tag}`); return false; };
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('incomplete');
    expect(result.missingAfter).toEqual(['태그하나', '태그둘']);
    expect(world.logs.join('\n')).toContain('태그');
  });

  it('no tags in the dialog -> the body is left untouched', async () => {
    const { world, deps } = makeWorld({ autoRegister: false });
    const before = [...world.body];
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('no-tags-in-dialog');
    expect(result.deletedParagraphs).toBe(0);
    expect(world.body).toEqual(before);
    expect(world.calls.some((call) => call.startsWith('delete:'))).toBe(false);
    expect(world.dialogOpen).toBe(false);
  });

  it('dialog never opens -> failure, three clicks, nothing deleted', async () => {
    const { world, deps } = makeWorld({ opensOnClick: 0 });
    const before = [...world.body];
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('dialog-not-opened');
    expect(world.calls.filter((call) => call === 'toggle')).toHaveLength(3);
    expect(world.body).toEqual(before);
    expect(result.deletedParagraphs).toBe(0);
  });

  it('a slow PC: the first click shows nothing, the second click opens the dialog', async () => {
    const { world, deps } = makeWorld({ opensOnClick: 2 });
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('moved');
    expect(world.calls.slice(0, 2)).toEqual(['toggle', 'toggle']);
  });

  it('never clicks again while the dialog is already open (the toolbar button toggles)', async () => {
    const { world, deps } = makeWorld();
    world.dialogOpen = true;
    await moveBodyHashtagsToTagField(deps);

    expect(world.calls[0]).not.toBe('toggle');
  });

  it('Escape does not close it -> the toolbar toggle closes it before anything is deleted', async () => {
    const { world, deps } = makeWorld({ escapeCloses: false });
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('moved');
    const firstDelete = world.calls.indexOf('delete:2');
    expect(world.calls.slice(0, firstDelete)).toEqual(['toggle', 'escape', 'toggle']);
    expect(world.dialogOpen).toBe(false);
  });

  it('dialog cannot be closed -> nothing is deleted', async () => {
    const { world, deps } = makeWorld({ escapeCloses: false, toggleCloses: false });
    const before = [...world.body];
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('dialog-not-closed');
    expect(world.body).toEqual(before);
    expect(world.calls.some((call) => call.startsWith('delete:'))).toBe(false);
  });

  it('no hashtag line in the body -> the dialog is not even opened', async () => {
    const { world, deps } = makeWorld({ body: ['첫 문단입니다.', '둘째 문단입니다.'] });
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('no-body-hashtags');
    expect(world.calls).toEqual([]);
  });

  it('deletes hashtag-only paragraphs from the last to the first and leaves prose that merely contains #', async () => {
    const { world, deps } = makeWorld({ body: ['본문 #문장속태그 입니다', '#가 #나', '중간 문단', '태그: #다 #라'] });
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('moved');
    expect(world.calls.filter((call) => call.startsWith('delete:'))).toEqual(['delete:3', 'delete:1']);
    expect(world.body).toEqual(['본문 #문장속태그 입니다', '중간 문단']);
    expect(result.deletedParagraphs).toBe(2);
  });

  it('a paragraph that cannot be deleted does not loop forever and the body stays as it was', async () => {
    const { world, deps } = makeWorld({ deleteWorks: false });
    const before = [...world.body];
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('delete-failed');
    expect(world.body).toEqual(before);
    expect(world.calls.filter((call) => call.startsWith('delete:')).length).toBeLessThanOrEqual(6);
    expect(world.dialogOpen).toBe(false);
  });

  it('the reopen never shows -> reported as reopen-failed with what was already deleted', async () => {
    const { world, deps } = makeWorld({ openOnlyOnce: true });
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('reopen-failed');
    expect(result.deletedParagraphs).toBe(1);
    expect(world.dialogOpen).toBe(false);
  });

  it('an error while the dialog is open still leaves the dialog closed and the body untouched', async () => {
    const { world, deps } = makeWorld();
    const before = [...world.body];
    deps.readDialogTags = async () => { throw new Error('boom'); };
    await expect(moveBodyHashtagsToTagField(deps)).rejects.toThrow('boom');
    expect(world.dialogOpen).toBe(false);
    expect(world.body).toEqual(before);
  });

  it('only ever uses the toolbar toggle and Escape: no call can press the final confirm button', async () => {
    const { world, deps } = makeWorld({ keepTagsOnReopen: false, escapeCloses: false });
    await moveBodyHashtagsToTagField(deps);

    const kinds = new Set(world.calls.map((call) => call.split(':')[0]));
    expect([...kinds].every((kind) => ['toggle', 'escape', 'delete', 'type'].includes(kind))).toBe(true);
  });
});

describe('selectHashtagParagraphs reuses the body hashtag-only rule', () => {
  it('keeps hashtag-only lines (also with zero-width spaces) and drops prose', () => {
    const picked = selectHashtagParagraphs([
      { index: 0, text: '안녕하세요 오늘은 #정책 이야기입니다' },
      { index: 1, text: '#태그하나 #태그둘' },
      { index: 2, text: '' },
      { index: 3, text: '​#하나 #둘' },
      { index: 4, text: '해시태그: #셋' },
    ]);
    expect(picked.map((p) => p.index)).toEqual([1, 3, 4]);
    expect(picked[0].tags).toEqual(['태그하나', '태그둘']);
    expect(picked[1].tags).toEqual(['하나', '둘']);
    expect(picked[2].tags).toEqual(['셋']);
  });
});

describe('page readers', () => {
  const frameReturning = (value: unknown) => {
    const evaluate = vi.fn(async (_fn: unknown, ..._args: unknown[]) => value);
    return { frame: { evaluate } as any, evaluate };
  };

  it('readPublishDialogTags matches by class prefix and returns #-less, de-duplicated texts', async () => {
    const { frame, evaluate } = frameReturning(['#태그확인하나', ' #태그확인둘 ', '', '#태그확인하나']);
    await expect(readPublishDialogTags(frame)).resolves.toEqual(['태그확인하나', '태그확인둘']);
    const selector = String(evaluate.mock.calls[0][1]);
    expect(selector).toContain('[class*="tag_area__"]');
    expect(selector).toContain('[class^="tag__"]');
    expect(selector).toContain('[class*=" tag__"]');
  });

  it('readPublishDialogTags returns an empty list when the page cannot be read', async () => {
    const frame = { evaluate: vi.fn(async () => { throw new Error('detached'); }) } as any;
    await expect(readPublishDialogTags(frame)).resolves.toEqual([]);
  });

  it('findBodyHashtagParagraphs applies the hashtag-only rule to the paragraphs read from the editor', async () => {
    const { frame } = frameReturning([
      { index: 0, text: '본문 첫 줄' },
      { index: 1, text: '#태그확인하나 #태그확인둘' },
      { index: 2, text: '' },
    ]);
    const found = await findBodyHashtagParagraphs(frame);
    expect(found).toEqual([{ index: 1, text: '#태그확인하나 #태그확인둘', tags: ['태그확인하나', '태그확인둘'] }]);
  });
});

describe('createPublishTagFieldDeps (browser side, fake page)', () => {
  const makeEnv = (evaluateResults: unknown[], frameElements: Record<string, unknown> = {}) => {
    const keys: string[] = [];
    const clicks: Array<[number, number]> = [];
    const queried: string[] = [];
    const queue = [...evaluateResults];
    const frame = {
      evaluate: vi.fn(async () => queue.shift()),
      $: vi.fn(async (selector: string) => { queried.push(selector); return frameElements[selector] ?? null; }),
    };
    const page = {
      evaluate: vi.fn(async () => ({ x: 10, y: 20 })),
      mouse: { click: vi.fn(async (x: number, y: number) => { clicks.push([x, y]); }) },
      keyboard: {
        press: vi.fn(async (key: string) => { keys.push(key); }),
        down: vi.fn(async (key: string) => { keys.push(`down:${key}`); }),
        up: vi.fn(async (key: string) => { keys.push(`up:${key}`); }),
        type: vi.fn(async (text: string) => { keys.push(`type:${text}`); }),
      },
    };
    const logs: string[] = [];
    const deps = createPublishTagFieldDeps({
      page: page as any,
      getFrame: async () => frame as any,
      delay: async () => undefined,
      log: (message) => { logs.push(message); },
    });
    return { deps, keys, clicks, queried, logs, frame };
  };
  const paragraph = { index: 4, text: '#태그하나 #태그둘', tags: ['태그하나', '태그둘'] };

  // [2026-11-04 live] SmartEditor's own selection is invisible to window.getSelection(), so the guard is the outcome:
  //   every non-hashtag paragraph (title included) must read the same after the keys, otherwise Ctrl+Z restores it.
  const RECT = { left: 100, top: 300, right: 700, bottom: 330 };
  it('deletes the line: click near its right end, End, Shift+Home, Backspace, then Backspace for the empty line', async () => {
    const { deps, keys, clicks } = makeEnv([
      RECT, ['제목', '본문 첫 문단', '#태그하나 #태그둘'], ['제목', '본문 첫 문단', ''], '', ['제목', '본문 첫 문단'],
    ]);
    await expect(deps.deleteParagraph(paragraph)).resolves.toBe(true);
    expect(clicks).toEqual([[10 + 700 - 6, 20 + 330 - 6]]);
    expect(keys).toEqual(['End', 'down:Shift', 'Home', 'up:Shift', 'Backspace', 'Backspace']);
  });

  it('prose changed after the keys (a missed click) → Ctrl+Z restores it and nothing counts as deleted', async () => {
    const { deps, keys, logs } = makeEnv([
      RECT, ['제목', '본문 첫 문단', '#태그하나 #태그둘'], ['제목', '본문 첫', '#태그하나 #태그둘'],
    ]);
    await expect(deps.deleteParagraph(paragraph)).resolves.toBe(false);
    expect(keys.slice(-3)).toEqual(['down:Control', 'KeyZ', 'up:Control']);
    expect(keys.filter((key) => key === 'Backspace')).toHaveLength(1);
    expect(logs.some((line) => line.includes('되돌렸습니다'))).toBe(true);
  });

  it('a wrapped paragraph keeps its remaining line: only one Backspace, the next round finishes it', async () => {
    const { deps, keys } = makeEnv([RECT, ['제목', '#태그하나 #둘'], ['제목', '#태그하나'], '#태그하나']);
    await expect(deps.deleteParagraph(paragraph)).resolves.toBe(true);
    expect(keys.filter((key) => key === 'Backspace')).toHaveLength(1);
  });

  it('the paragraph is gone from the page -> false, no key is pressed', async () => {
    const { deps, keys } = makeEnv([null]);
    await expect(deps.deleteParagraph(paragraph)).resolves.toBe(false);
    expect(keys).toEqual([]);
  });

  it('typeTag types the #-less text into the tag input and presses Enter', async () => {
    const input = { click: vi.fn(async () => undefined) };
    const { deps, keys, queried } = makeEnv([], { 'input[class*="tag_input__"]': input });
    await expect(deps.typeTag('태그둘')).resolves.toBe(true);
    expect(queried[0]).toBe('input[class*="tag_input__"]');
    expect(keys).toEqual(['type:태그둘', 'Enter']);
  });

  it('typeTag returns false when the tag input is not there', async () => {
    const { deps, keys } = makeEnv([]);
    await expect(deps.typeTag('태그둘')).resolves.toBe(false);
    expect(keys).toEqual([]);
  });

  it('clickPublishToggle clicks the toolbar publish button only', async () => {
    const toolbar = { click: vi.fn(async () => undefined) };
    const { deps, queried } = makeEnv([], { 'button[data-click-area="tpb.publish"]': toolbar });
    await expect(deps.clickPublishToggle()).resolves.toBe(true);
    expect(toolbar.click).toHaveBeenCalledTimes(1);
    expect(queried.every((selector) => !selector.includes('seOnePublishBtn') && !selector.includes('confirm'))).toBe(true);
  });

  it('clickPublishToggle returns false when the toolbar button is missing', async () => {
    const { deps } = makeEnv([]);
    await expect(deps.clickPublishToggle()).resolves.toBe(false);
  });
});

describe('source guards', () => {
  it('neither module ever clicks the final confirm button (seOnePublishBtn is only looked at)', () => {
    for (const file of ['automation/publishTagField.ts', 'automation/publishTagFieldDom.ts']) {
      const lines = read(file).split(/\r?\n/);
      const offenders = lines.filter((line) => /seOnePublishBtn|tpb\*i\.publish|confirm_btn/.test(line) && /click|press\(/i.test(line));
      expect(offenders, file).toEqual([]);
    }
  });

  it('the new modules stay small and are listed in the runtime fingerprint source list', () => {
    for (const file of ['automation/publishTagField.ts', 'automation/publishTagFieldDom.ts']) {
      // 300 = the project's hard file-size limit (.claude/rules/autopus/file-size-limit.md); 200 was only the first-version size
      expect(read(file).split(/\r?\n/).length, file).toBeLessThanOrEqual(300);
    }
    const fingerprint = read('contentQualityV3/candidateRuntimeFingerprint.ts');
    expect(fingerprint).toContain("'src/automation/publishTagField.ts'");
    expect(fingerprint).toContain("'src/automation/publishTagFieldDom.ts'");
  });
});

describe('publishBlogPost wiring', () => {
  const code = read('naverBlogAutomation.ts');
  const start = code.indexOf('async publishBlogPost(');
  const end = code.indexOf('private async applyPlainContent(', start);
  const head = code.slice(start, end);
  const callIndex = head.indexOf('await this.moveHashtagsToPublishTagField(');

  it('calls the step once, for publish and schedule only, after the hashtag repair and the PrePublish decision', () => {
    expect(start).toBeGreaterThan(-1);
    expect(callIndex).toBeGreaterThan(-1);
    expect(head.indexOf('await this.moveHashtagsToPublishTagField(', callIndex + 1)).toBe(-1);
    expect(callIndex).toBeGreaterThan(head.indexOf('await this.repairMissingHashtagsBeforePublish('));
    expect(callIndex).toBeGreaterThan(head.indexOf('PRE_PUBLISH_BLOCKED'));
    expect(callIndex).toBeGreaterThan(head.indexOf('[PrePublish] 검사 자체 실패'));
    // guarded by the mode and placed before any mode-specific branch opens the dialog
    expect(head.slice(Math.max(0, callIndex - 220), callIndex)).toMatch(/mode === 'publish' \|\| mode === 'schedule'/);
    expect(callIndex).toBeLessThan(head.indexOf("if (mode === 'draft') {"));
  });

  it('nothing after the step types body hashtags again', () => {
    const afterStep = head.slice(callIndex);
    expect(afterStep).not.toMatch(/applyHashtagsInBody\(/);
    expect(afterStep).not.toMatch(/repairMissingHashtagsBeforePublish\(/);
  });

  it('a retry pass does not demand body hashtags that now live in the tag field', () => {
    expect(head).toMatch(/expectedHashtags:\s*\[\]/);
    expect(head).toMatch(/tagFieldMovedFor/);
  });

  it('the step never touches the final confirm button and is fail-soft (log and continue)', () => {
    const method = code.slice(
      code.indexOf('private async moveHashtagsToPublishTagField('),
      code.indexOf('private emitTailDebugSnapshot('),
    );
    expect(method).toContain('moveBodyHashtagsToTagField(');
    expect(method).not.toMatch(/seOnePublishBtn/);
    expect(method).toMatch(/cancelRequested/);
  });
});
