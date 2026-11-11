import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { toUserMessage } from '../errors/userMessageMapper.js';
import {
  SHOPPING_COLLECT_NOT_SHOP_NOTICE,
  collectImageTabUrlImages,
} from '../renderer/utils/shoppingCollectToPool.js';

const COUPANG_BLOCKED = '쿠팡은 현재 공개 상품 페이지가 Access Denied로 차단되어 이미지 자동수집이 안정적으로 동작하지 않습니다.';

describe('friendly message — a Coupang block is not reported as a Naver block', () => {
  it('main mapper keeps Coupang as the blocker', () => {
    const shown = toUserMessage(COUPANG_BLOCKED);
    expect(shown).toContain('쿠팡');
    expect(shown).toContain('접속 거부');
    expect(shown).not.toContain('네이버가 봇 차단');
    expect(shown).not.toContain('Access Denied');
  });

  it('a bare Access Denied (Naver flows) is translated as before', () => {
    expect(toUserMessage('Access Denied')).toBe('네이버가 봇 차단했습니다 (5~10분 후 재시도 또는 IP 변경)');
  });

  it('the renderer copy of the mapper carries the same Coupang guard, before the keyword loop', () => {
    const ui = readFileSync(join(__dirname, '..', 'renderer', 'utils', 'uiManagers.ts'), 'utf8');
    const start = ui.indexOf('function toUserFriendlyMessage(');
    const body = ui.slice(start, ui.indexOf('\n}\n', start));
    const guard = body.indexOf("if (/쿠팡|coupang/i.test(msg)) msg = msg.replace(/Access Denied/gi, '접속 거부');");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('for (const [pattern, replacement] of FRIENDLY_KEYWORDS)'));
  });
});

describe('image tab URL collect — a short link that is not a shop says so even when nothing is found', () => {
  it('carries the notice on the failure result', async () => {
    const api = {
      collectImagesFromShopping: vi.fn(async () => ({ success: false, images: [], resolvedUrl: 'https://example.com/post/1' })),
      crawlImagesFromUrl: vi.fn(async () => ({ success: false, message: '이미지를 찾을 수 없습니다.' })),
    };
    const result = await collectImageTabUrlImages(api as any, 'https://bit.ly/abc', { title: '', content: null });
    expect(result).toEqual({ ok: false, kind: 'crawl', message: '이미지를 찾을 수 없습니다.', notice: SHOPPING_COLLECT_NOT_SHOP_NOTICE });
  });

  it('an ordinary address that fails has no notice', async () => {
    const api = { collectImagesFromShopping: vi.fn(), crawlImagesFromUrl: vi.fn(async () => ({ success: false })) };
    const result = await collectImageTabUrlImages(api as any, 'https://blog.naver.com/a/1', { title: '', content: null });
    expect(result).toEqual({ ok: false, kind: 'crawl', message: '페이지에서 이미지를 찾지 못했습니다' });
  });

  it('the image tab shows the notice before the failure reason', () => {
    const src = readFileSync(join(__dirname, '..', 'renderer', 'modules', 'headingImageGen.ts'), 'utf8');
    const start = src.indexOf('const collected = await collectImageTabUrlImages(');
    const failBlock = src.slice(start, src.indexOf('throw new Error(collected.message);', start));
    expect(failBlock).toMatch(/if \(!collected\.ok\) \{\s*\n\s*if \(collected\.notice\) appendLog\(`ℹ️ \$\{collected\.notice\}`, 'images-log-output'\);/);
  });
});
