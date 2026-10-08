/**
 * [2026-10-09 outcome audit] Bounded wait for a concrete post URL after the publish click (no re-click, no
 * re-open) and one log line per post-page check attempt. Drives the real NaverBlogAutomation methods on a bare
 * instance with a fake clock; the page is a two-method fake, so any goto/click/reload would throw.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let NaverBlogAutomation: any;

const editorUrl = 'https://blog.naver.com/acc1?Redirect=Write&';
const postUrl = 'https://blog.naver.com/acc1/223000001';
const redirectUrl = 'https://blog.naver.com/acc1?Redirect=Update&categoryNo=3&logNo=223000009';
const source = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');

// Importing the whole automation module graph is slow on a cold cache.
beforeAll(async () => {
  ({ NaverBlogAutomation } = await import('../naverBlogAutomation'));
}, 240_000);

afterEach(() => {
  vi.useRealTimers();
});

function makeAutomation() {
  const logs: string[] = [];
  const automation: any = Object.create(NaverBlogAutomation.prototype);
  Object.assign(automation, {
    options: { naverId: 'acc1' },
    logger: (message: string) => logs.push(message),
    publishedUrl: null,
    accountWorkId: '',
    immediatePublishCommitAttempted: false,
  });
  return { automation, logs };
}

describe('post-page check logging', () => {
  const failing = { currentUrl: postUrl, expectedUrl: postUrl, title: '', bodyText: '', selectorEvidence: [] as string[] };
  const readable = { currentUrl: postUrl, expectedUrl: postUrl, title: '제목', bodyText: '게시글 본문이 정상적으로 로드되었습니다.', selectorEvidence: ['.se-title-text'] };

  function fakeClock(automation: any) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    automation.delay = async (ms: number) => { vi.setSystemTime(Date.now() + ms); };
  }

  it('logs one line per check attempt and still confirms after two consecutive readable checks', async () => {
    const { automation, logs } = makeAutomation();
    fakeClock(automation);
    const snapshots = [failing, failing, readable, readable];
    automation.collectPublishedPostPageSnapshot = async () => snapshots.shift();

    await automation.waitForPublishedPostPageConfirmation(postUrl);

    const lines = logs.filter(entry => entry.includes('[PostPageCheck]'));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('PUBLISH_POST_SCREEN_NOT_READY');
    expect(lines[3]).toContain('POST_SCREEN_CONFIRMED');
  });

  it('logs every failed attempt and the reason when the screen never becomes readable', async () => {
    const { automation, logs } = makeAutomation();
    fakeClock(automation);
    automation.collectPublishedPostPageSnapshot = async () => ({ ...failing, bodyText: '서비스를 찾을 수 없습니다.' });

    await expect(automation.waitForPublishedPostPageConfirmation(postUrl, 5000)).rejects.toThrow('PUBLISH_UNCONFIRMED');

    const lines = logs.filter(entry => entry.includes('[PostPageCheck]'));
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.every(entry => entry.includes('PUBLISH_POST_SCREEN_BLOCKED'))).toBe(true);
  });
});

describe('bounded wait for a concrete post URL (no re-click, no re-open)', () => {
  /** Fake page that exposes only url()/evaluate(): any goto/click/reload would throw a TypeError. */
  function pageThatLandsAt(landAtMs: number, landing: string, before = editorUrl, interim = 'https://blog.naver.com/acc1') {
    return {
      url: () => (Date.now() >= landAtMs ? landing : (Date.now() > 1000 ? interim : before)),
      evaluate: async () => false,
    };
  }
  function fakeClock(automation: any) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    automation.delay = async (ms: number) => { vi.setSystemTime(Date.now() + ms); };
  }

  it('keeps polling after the URL changed to a non-post page and succeeds when the post URL appears', async () => {
    const { automation, logs } = makeAutomation();
    fakeClock(automation);
    automation.page = pageThatLandsAt(9000, postUrl);

    await automation.waitForPublishedPostUrl(editorUrl);

    expect(automation.publishedUrl).toBe(postUrl);
    expect(logs).toContain(`POST_URL: ${postUrl}`);
  });

  it('normalises the Redirect=Update landing it finds while polling', async () => {
    const { automation } = makeAutomation();
    fakeClock(automation);
    automation.page = pageThatLandsAt(4000, redirectUrl);

    await automation.waitForPublishedPostUrl(editorUrl);

    expect(automation.publishedUrl).toBe('https://blog.naver.com/acc1/223000009');
  });

  it('gives up after about 30 seconds as PUBLISH_UNCONFIRMED when no post URL ever appears', async () => {
    const { automation } = makeAutomation();
    fakeClock(automation);
    automation.page = pageThatLandsAt(Number.MAX_SAFE_INTEGER, postUrl);

    await expect(automation.waitForPublishedPostUrl(editorUrl)).rejects.toThrow('PUBLISH_UNCONFIRMED');

    expect(Date.now()).toBeGreaterThanOrEqual(30_000);
    expect(Date.now()).toBeLessThanOrEqual(33_000);
    expect(automation.publishedUrl).toBeNull();
  });

  it('every immediate-publish branch uses it instead of failing on the first look', () => {
    const calls = source.match(/await this\.waitForPublishedPostUrl\(beforeUrl\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(source).not.toContain('발행 버튼 클릭 후 URL은 바뀌었지만 실제 게시글 URL을 확인하지 못했습니다');
    expect(source).not.toContain("throw new Error('발행이 완료되지 않았습니다. 발행 버튼이 비활성화되어 있거나 네비게이션이 발생하지 않았습니다.')");
    expect(source).not.toContain('발행 버튼 클릭 후 실제 게시글 URL을 확인하지 못했습니다. 작성중/블로그홈/임시저장 상태를 발행 완료로 처리하지 않습니다.');
  });
});
