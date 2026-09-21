import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { downloadImageBuffer, sniffImageMagic } from '../image/imageUrlDownload';

/**
 * [2026-09-21 진단리포트 09-18] "이미지 다운로드 실패: 302 Found" — 리다이렉트를 실패로 취급해
 * 외부 URL 이미지가 3회 전부 건너뛰어졌다.
 */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

let server: http.Server;
let base = '';
const seenReferers: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seenReferers.push(String(req.headers.referer || ''));
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/hop2' });
      res.end();
      return;
    }
    if (req.url === '/hop2') {
      res.writeHead(301, { Location: `${base}/final.png` });
      res.end();
      return;
    }
    if (req.url === '/final.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(PNG);
      return;
    }
    if (req.url === '/loop') {
      res.writeHead(302, { Location: '/loop' });
      res.end();
      return;
    }
    if (req.url === '/blocked.jpg') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>hotlink blocked</body></html>');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('downloadImageBuffer', () => {
  it('follows 302 → 301 redirects (relative and absolute Location) to the image', async () => {
    const result = await downloadImageBuffer(`${base}/redirect`);
    expect(result.finalUrl).toBe(`${base}/final.png`);
    expect(result.contentType).toBe('image/png');
    expect(sniffImageMagic(result.buffer)).toBe('png');
    expect(result.buffer.equals(PNG)).toBe(true);
  });

  it('sends the origin as Referer so hotlink-protected hosts do not bounce', async () => {
    seenReferers.length = 0;
    await downloadImageBuffer(`${base}/final.png`);
    expect(seenReferers[0]).toBe(`${base}/`);
  });

  it('rejects an HTML block page instead of saving it as an image', async () => {
    await expect(downloadImageBuffer(`${base}/blocked.jpg`)).rejects.toThrow(/이미지가 아닌 응답\(text\/html/);
  });

  it('gives up on a redirect loop with a clear error', async () => {
    await expect(downloadImageBuffer(`${base}/loop`)).rejects.toThrow(/리다이렉트 5회 초과/);
  });

  it('still reports plain HTTP failures', async () => {
    await expect(downloadImageBuffer(`${base}/missing.png`)).rejects.toThrow(/404/);
  });
});
