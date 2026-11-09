/**
 * [2026-11-10] 11/9 로그의 "본문 해시태그 5줄을 지웠습니다 (1줄 남음)" + "해시태그 일부를 태그 칸에서 확인하지 못했습니다".
 * 뿌리 3가지를 가짜 세계(fake deps)로 고정한다.
 *  1) 삭제 반복 횟수 상한이 '문단 수 x 3 + 2' 라서, 해시태그 한 문단(실제 로그 4건 모두 1문단)은 5번 만에 멈춘다.
 *     한 번의 삭제는 시각적 한 줄만 지우므로 6번 이상 필요한 글은 1줄이 남는다.
 *  2) 키 입력이 '본문 문장을 안 건드렸다'는 이유만으로 '지웠다'로 셌다 — 실제로 줄지 않아도 5줄 지움으로 기록.
 *  3) 태그 칸에 1개라도 있으면 본문 줄을 통째로 지웠다 — 칸에서 확인되지 않은 태그까지 같이 사라진다.
 * 그리고 경고 문구가 '태그 칸 누락 없음 + 본문 줄 남음' 상황에서도 "태그 칸에서 확인하지 못했습니다"로 나가는 오판.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeTagFieldWarning,
  moveBodyHashtagsToTagField,
  selectHashtagParagraphs,
  type PublishTagFieldDeps,
  type PublishTagFieldResult,
} from '../automation/publishTagField';

interface WorldOptions {
  body: string[];
  /** One deleteParagraph call removes only the last tag of the paragraph (a wrapped paragraph loses one visual line). */
  chunkDelete?: boolean;
  /** deleteParagraph reports success but changes nothing. */
  noopDelete?: boolean;
  /** Opening the dialog registers at most this many body tags (NAVER registered only part of them). */
  registerLimit?: number;
  typeWorks?: boolean;
}

function makeWorld(o: WorldOptions) {
  const world = { body: [...o.body], dialogOpen: false, tags: [] as string[], calls: [] as string[], logs: [] as string[] };
  const paragraphs = () => selectHashtagParagraphs(world.body.map((text, index) => ({ index, text })));
  const deps: PublishTagFieldDeps = {
    findBodyHashtagParagraphs: async () => paragraphs(),
    readDialogTags: async () => (world.dialogOpen ? [...world.tags] : []),
    isDialogOpen: async () => world.dialogOpen,
    clickPublishToggle: async () => {
      world.calls.push('toggle');
      world.dialogOpen = !world.dialogOpen;
      if (world.dialogOpen) {
        const bodyTags = paragraphs().flatMap((paragraph) => paragraph.tags);
        for (const tag of o.registerLimit === undefined ? bodyTags : bodyTags.slice(0, o.registerLimit)) {
          if (!world.tags.includes(tag)) world.tags.push(tag);
        }
      }
      return true;
    },
    pressEscape: async () => { world.calls.push('escape'); world.dialogOpen = false; },
    deleteParagraph: async (paragraph) => {
      world.calls.push(`delete:${paragraph.index}`);
      if (o.noopDelete) return true;
      const tokens = o.chunkDelete ? world.body[paragraph.index].split(/\s+/).filter(Boolean) : [];
      tokens.pop();
      if (tokens.length === 0) world.body.splice(paragraph.index, 1);
      else world.body[paragraph.index] = tokens.join(' ');
      return true;
    },
    typeTag: async (tag) => {
      world.calls.push(`type:${tag}`);
      if (!o.typeWorks || !world.dialogOpen) return false;
      world.tags.push(tag);
      return true;
    },
    delay: async () => undefined,
    log: (message) => { world.logs.push(message); },
  };
  return { world, deps };
}

describe('hashtag line deletion loop', () => {
  it('a hashtag paragraph that needs six rounds is removed completely (the 5-rounds-then-1-left log)', async () => {
    const { world, deps } = makeWorld({ body: ['본문 문장입니다.', '#가 #나 #다 #라 #마 #바'], chunkDelete: true });
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.remainingBodyParagraphs).toBe(0);
    expect(result.deletedParagraphs).toBe(6);
    expect(result.status).toBe('moved');
    expect(world.body).toEqual(['본문 문장입니다.']);
  });

  it('rounds that change nothing are not reported as deleted and stop after five in a row (the old cap)', async () => {
    const { world, deps } = makeWorld({ body: ['본문 문장입니다.', '#가 #나 #다'], noopDelete: true });
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('delete-failed');
    expect(result.deletedParagraphs).toBe(0);
    expect(world.calls.filter((call) => call.startsWith('delete:'))).toHaveLength(5);
    expect(world.logs.join('\n')).not.toMatch(/줄을 지웠습니다/);
    expect(world.dialogOpen).toBe(false);
  });

  it('a deletion that only starts working on the fifth round is still reached (no regression against the old cap)', async () => {
    const { world, deps } = makeWorld({ body: ['본문 문장입니다.', '#가 #나 #다'] });
    let calls = 0;
    const realDelete = deps.deleteParagraph;
    const lateDeps: PublishTagFieldDeps = { ...deps, deleteParagraph: async (p) => (++calls < 5 ? true : realDelete(p)) };
    const result = await moveBodyHashtagsToTagField(lateDeps);

    expect(result.status).toBe('moved');
    expect(result.deletedParagraphs).toBe(1);
    expect(world.body).toEqual(['본문 문장입니다.']);
  });

  it('two rounds in a row that touched the prose (undone) stop the loop at once', async () => {
    const { world, deps } = makeWorld({ body: ['본문 문장입니다.', '#가 #나 #다'] });
    const touchingDeps: PublishTagFieldDeps = { ...deps, deleteParagraph: async (p) => { world.calls.push(`delete:${p.index}`); return false; } };
    const result = await moveBodyHashtagsToTagField(touchingDeps);

    expect(result.status).toBe('delete-failed');
    expect(world.calls.filter((call) => call.startsWith('delete:'))).toHaveLength(2);
  });

  it('still reports what is left (text included) when the paragraph stalls midway', async () => {
    const { world, deps } = makeWorld({ body: ['#가 #나 #다'], chunkDelete: true });
    let allowed = 1;
    const realDelete = deps.deleteParagraph;
    const stallingDeps: PublishTagFieldDeps = { ...deps, deleteParagraph: async (p) => (allowed-- > 0 ? realDelete(p) : true) };
    const result = await moveBodyHashtagsToTagField(stallingDeps);

    expect(result.status).toBe('incomplete');
    expect(result.remainingBodyParagraphs).toBe(1);
    // the "left over" message itself must carry the remaining text (the registration log also contains these tags)
    expect(world.logs.join('\n')).toMatch(/1줄 남음: #가 #나\)/);
  });
});

describe('only confirmed tags may leave the body', () => {
  it('a body tag the dialog never shows keeps the whole hashtag line in the body', async () => {
    const { world, deps } = makeWorld({ body: ['본문 문장입니다.', '#가 #나 #다'], registerLimit: 2, typeWorks: false });
    const before = [...world.body];
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('partial-registration');
    expect(world.calls.some((call) => call.startsWith('delete:'))).toBe(false);
    expect(world.body).toEqual(before);
    expect(world.dialogOpen).toBe(false);
  });

  it('a missing tag is typed into the open dialog BEFORE any body line is deleted', async () => {
    const { world, deps } = makeWorld({ body: ['본문 문장입니다.', '#가 #나 #다'], registerLimit: 2, typeWorks: true });
    const result = await moveBodyHashtagsToTagField(deps);

    expect(result.status).toBe('moved');
    expect(result.typedFallback).toBe(1);
    expect(world.calls.indexOf('type:다')).toBeGreaterThan(-1);
    expect(world.calls.indexOf('type:다')).toBeLessThan(world.calls.findIndex((call) => call.startsWith('delete:')));
    expect(world.tags.sort()).toEqual(['가', '나', '다']);
    expect(world.body).toEqual(['본문 문장입니다.']);
  });
});

describe('describeTagFieldWarning', () => {
  const base: PublishTagFieldResult = {
    status: 'incomplete', tagsBefore: ['가', '나'], tagsAfter: ['가', '나'],
    deletedParagraphs: 5, typedFallback: 0, missingAfter: [], remainingBodyParagraphs: 1,
  };

  it('tag field complete but a body line is left: says the body, not the tag field', () => {
    const message = describeTagFieldWarning(base) ?? '';
    expect(message).toContain('본문');
    expect(message).toContain('1줄');
    expect(message).not.toContain('태그 칸에서 확인하지 못');
  });

  it('a tag really missing from the field: names the missing tags', () => {
    const message = describeTagFieldWarning({ ...base, missingAfter: ['나'], remainingBodyParagraphs: 0 }) ?? '';
    expect(message).toContain('#나');
    expect(message).toContain('태그 칸');
  });

  it('reopen-failed warns, moved / skipped statuses do not', () => {
    expect(describeTagFieldWarning({ ...base, status: 'reopen-failed', missingAfter: [], remainingBodyParagraphs: 0 })).toContain('다시 열지 못');
    expect(describeTagFieldWarning({ ...base, status: 'moved', remainingBodyParagraphs: 0 })).toBeNull();
    expect(describeTagFieldWarning({ ...base, status: 'partial-registration', remainingBodyParagraphs: 0 })).toBeNull();
  });
});

describe('publishBlogPost wiring', () => {
  it('the call site builds its warning with describeTagFieldWarning and logs the remaining body lines', () => {
    const code = readFileSync(resolve(__dirname, '..', 'naverBlogAutomation.ts'), 'utf8');
    const method = code.slice(
      code.indexOf('private async moveHashtagsToPublishTagField('),
      code.indexOf('private emitTailDebugSnapshot('),
    );
    expect(method).toContain('describeTagFieldWarning(');
    expect(method).toContain('remainingBodyParagraphs');
    expect(method).not.toContain('해시태그 일부를 태그 칸에서 확인하지 못했습니다');
  });
});
