import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  downloadDropshotCandidate,
  isDropshotResultSourceAccepted,
  pickDropshotResultDataUrl,
  rankNewDropshotCandidates,
  resolveDropshotImageAddress,
  type DropshotRawCandidate,
} from '../image/dropshotResultImage.js';

const JOB_DIRECT = 'https://cdn.aistudio.dropshot.io/public/jobs/prod/-P6DASm61X1Hp_gpIR0a/output/output_0.png';
const NEW_JOB_DIRECT = 'https://cdn.aistudio.dropshot.io/public/jobs/prod/-P6DB0000NEWJOBxxxxx/output/output_0.png';
const proxy = (inner: string, w = 384): string =>
  `https://aistudio.dropshot.io/api/media/image?src=${encodeURIComponent(inner)}&w=${w}`;
const OLD_DIRECT = 'https://img.aistudio.dropshot.io/x/public/jobs/prod/abc/output/output_0.jpg?w=1920&q=75';

const cand = (src: string, width = 252, height = 252, kind = 'img'): DropshotRawCandidate => ({
  key: `${kind}:${src}`, src, kind, width, height,
});

describe('Dropshot result address (media proxy format)', () => {
  it('unwraps the proxy address to the real picture address', () => {
    expect(resolveDropshotImageAddress(proxy(JOB_DIRECT))).toBe(JOB_DIRECT);
    expect(resolveDropshotImageAddress(proxy(JOB_DIRECT, 3840))).toBe(JOB_DIRECT);
  });

  it('leaves direct, blob, data and unparsable addresses unchanged', () => {
    expect(resolveDropshotImageAddress(OLD_DIRECT)).toBe(OLD_DIRECT);
    expect(resolveDropshotImageAddress('blob:https://aistudio.dropshot.io/abc')).toBe('blob:https://aistudio.dropshot.io/abc');
    expect(resolveDropshotImageAddress('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(resolveDropshotImageAddress('not a url')).toBe('not a url');
    expect(resolveDropshotImageAddress('https://aistudio.dropshot.io/api/media/image?w=384')).toBe('https://aistudio.dropshot.io/api/media/image?w=384');
  });

  it('accepts job results in both formats and blob/data sources', () => {
    expect(isDropshotResultSourceAccepted(proxy(JOB_DIRECT))).toBe(true);
    expect(isDropshotResultSourceAccepted(OLD_DIRECT)).toBe(true);
    expect(isDropshotResultSourceAccepted('blob:https://aistudio.dropshot.io/abc')).toBe(true);
    expect(isDropshotResultSourceAccepted('data:image/png;base64,AAA')).toBe(true);
  });

  it('rejects proxied logos, samples and banners that are not job results', () => {
    expect(isDropshotResultSourceAccepted(proxy('https://cdn.aistudio.dropshot.io/public/icons/ic_studio_logo-v2.svg', 128))).toBe(false);
    expect(isDropshotResultSourceAccepted(proxy('https://cdn.aistudio.dropshot.io/public/sample/x.png'))).toBe(false);
    expect(isDropshotResultSourceAccepted(proxy('https://cdn.aistudio.dropshot.io/public/banners/idol.png'))).toBe(false);
    expect(isDropshotResultSourceAccepted('https://aistudio.dropshot.io/api/media/image?w=384')).toBe(false);
    expect(isDropshotResultSourceAccepted('https://aistudio.dropshot.io/api/media/image?src=%%%&w=384')).toBe(false);
  });
});

describe('Dropshot new-result ranking and already-seen protection', () => {
  it('drops the previous result even when it is shown at a different proxy width', () => {
    const before = [`img:${proxy(JOB_DIRECT, 384)}`, proxy(JOB_DIRECT, 384)];
    const ranked = rankNewDropshotCandidates(
      [cand(proxy(JOB_DIRECT, 1920), 800, 800), cand(proxy(NEW_JOB_DIRECT, 384))],
      before,
    );
    expect(ranked.map((c) => c.src)).toEqual([proxy(NEW_JOB_DIRECT, 384)]);
  });

  it('drops an exact key or address match from the baseline (old format too)', () => {
    const ranked = rankNewDropshotCandidates([cand(OLD_DIRECT, 600, 400), cand(NEW_JOB_DIRECT)], [`img:${OLD_DIRECT}`]);
    expect(ranked.map((c) => c.src)).toEqual([NEW_JOB_DIRECT]);
    const bySrc = rankNewDropshotCandidates([cand(OLD_DIRECT, 600, 400)], [OLD_DIRECT]);
    expect(bySrc).toEqual([]);
  });

  it('ignores the baseline kind prefix when matching a seen proxy address', () => {
    const before = [`source:${proxy(JOB_DIRECT, 256)}`, `background:${proxy(JOB_DIRECT, 256)}`];
    expect(rankNewDropshotCandidates([cand(proxy(JOB_DIRECT, 750))], before)).toEqual([]);
  });

  it('removes proxied non-job images and ranks data/blob above a plain cdn picture', () => {
    const logo = cand(proxy('https://cdn.aistudio.dropshot.io/public/icons/ic_studio_logo-v2.svg', 128), 300, 300);
    const cdn = cand(proxy(NEW_JOB_DIRECT), 400, 400);
    const blob = cand('blob:https://aistudio.dropshot.io/xyz', 300, 300, 'img');
    const ranked = rankNewDropshotCandidates([logo, cdn, blob], []);
    expect(ranked.map((c) => c.src)).toEqual([blob.src, cdn.src]);
  });
});

function fakePage(opts: {
  inPage?: Record<string, string | null>;
  context?: Record<string, { status: number; type: string; body: string }>;
}) {
  const inPageCalls: string[] = [];
  const requestCalls: string[] = [];
  const page = {
    evaluate: vi.fn(async (_fn: unknown, address: string) => {
      inPageCalls.push(address);
      return opts.inPage?.[address] ?? null;
    }),
    context: () => ({
      request: {
        get: vi.fn(async (address: string) => {
          requestCalls.push(address);
          const reply = opts.context?.[address];
          if (!reply) throw new Error('net::ERR_FAILED');
          return {
            ok: () => reply.status < 400,
            status: () => reply.status,
            headers: () => ({ 'content-type': reply.type }),
            body: async () => Buffer.from(reply.body),
          };
        }),
      },
    }),
  };
  return { page, inPageCalls, requestCalls };
}

describe('Dropshot candidate download', () => {
  it('downloads the real picture address first when the page sees a proxy address', async () => {
    const { page, inPageCalls } = fakePage({
      inPage: { [JOB_DIRECT]: 'data:image/png;base64,ORIGINAL' },
    });
    await expect(downloadDropshotCandidate(page, proxy(JOB_DIRECT))).resolves.toBe('data:image/png;base64,ORIGINAL');
    expect(inPageCalls).toEqual([JOB_DIRECT]);
  });

  it('falls back to the browser-context request when the in-page fetch fails (proxy: "Failed to fetch")', async () => {
    const { page, inPageCalls, requestCalls } = fakePage({
      context: { [JOB_DIRECT]: { status: 200, type: 'image/png; charset=binary', body: 'abc' } },
    });
    await expect(downloadDropshotCandidate(page, proxy(JOB_DIRECT))).resolves.toBe('data:image/png;base64,YWJj');
    expect(inPageCalls[0]).toBe(JOB_DIRECT);
    expect(requestCalls[0]).toBe(JOB_DIRECT);
  });

  it('tries the proxy address itself when the real address cannot be read', async () => {
    const shown = proxy(JOB_DIRECT);
    const { page, requestCalls } = fakePage({
      context: { [shown]: { status: 200, type: 'image/jpeg', body: 'abc' } },
    });
    await expect(downloadDropshotCandidate(page, shown)).resolves.toBe('data:image/jpeg;base64,YWJj');
    expect(requestCalls).toEqual([JOB_DIRECT, shown]);
  });

  it('returns null for error statuses and non-image replies', async () => {
    const missing = fakePage({ context: { [JOB_DIRECT]: { status: 404, type: 'image/png', body: 'x' } } });
    await expect(downloadDropshotCandidate(missing.page, JOB_DIRECT)).resolves.toBeNull();
    const html = fakePage({ context: { [JOB_DIRECT]: { status: 200, type: 'text/html', body: '<html>' } } });
    await expect(downloadDropshotCandidate(html.page, JOB_DIRECT)).resolves.toBeNull();
  });

  it('passes data addresses through without touching the page and reads blob addresses in the page', async () => {
    const data = fakePage({});
    await expect(downloadDropshotCandidate(data.page, 'data:image/png;base64,AAA')).resolves.toBe('data:image/png;base64,AAA');
    expect(data.page.evaluate).not.toHaveBeenCalled();
    const blobAddress = 'blob:https://aistudio.dropshot.io/xyz';
    const blob = fakePage({ inPage: { [blobAddress]: 'data:image/png;base64,BLOB' } });
    await expect(downloadDropshotCandidate(blob.page, blobAddress)).resolves.toBe('data:image/png;base64,BLOB');
    expect(blob.requestCalls).toEqual([]);
  });

  it('never fetches schemes other than data, blob and http(s)', async () => {
    const { page } = fakePage({});
    await expect(downloadDropshotCandidate(page, 'file:///C:/secret.png')).resolves.toBeNull();
    expect(page.evaluate).not.toHaveBeenCalled();
  });
});

describe('Dropshot result pick (rank + download)', () => {
  it('returns the new job result as a data address in the proxy format end to end', async () => {
    const before = [`img:${proxy(JOB_DIRECT, 384)}`];
    const { page } = fakePage({
      context: { [NEW_JOB_DIRECT]: { status: 200, type: 'image/png', body: 'abc' } },
    });
    const picked = await pickDropshotResultDataUrl(
      page,
      [cand(proxy(JOB_DIRECT, 1920), 800, 800), cand(proxy(NEW_JOB_DIRECT))],
      before,
    );
    expect(picked).toBe('data:image/png;base64,YWJj');
  });

  it('returns null when only the already-seen result is on the board', async () => {
    const { page } = fakePage({});
    const picked = await pickDropshotResultDataUrl(page, [cand(proxy(JOB_DIRECT, 1920), 800, 800)], [`img:${proxy(JOB_DIRECT)}`]);
    expect(picked).toBeNull();
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it('moves on to the next candidate when the best one cannot be downloaded', async () => {
    const blobAddress = 'blob:https://aistudio.dropshot.io/xyz';
    const { page } = fakePage({
      inPage: { [blobAddress]: null },
      context: { [NEW_JOB_DIRECT]: { status: 200, type: 'image/png', body: 'abc' } },
    });
    const picked = await pickDropshotResultDataUrl(page, [cand(blobAddress, 200, 200), cand(proxy(NEW_JOB_DIRECT))], []);
    expect(picked).toBe('data:image/png;base64,YWJj');
  });
});

describe('Dropshot capture wiring (the page lists sources, the Node side downloads)', () => {
  const capture = readFileSync(join(process.cwd(), 'src', 'image', 'dropshotCapture.ts'), 'utf8');

  it('hands the listed candidates to the Node-side picker', () => {
    expect(capture).toContain('pickDropshotResultDataUrl(page, listed, beforeKeys)');
  });

  it('no longer downloads inside the page with a bare fetch of the shown address (fails on proxy addresses)', () => {
    expect(capture).not.toMatch(/const toDataUrl/);
    expect(capture).not.toMatch(/await fetch\(src\)/);
    expect(capture).not.toMatch(/beforeSet/);
  });
});
