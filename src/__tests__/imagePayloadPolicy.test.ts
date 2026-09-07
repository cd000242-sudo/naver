// src/__tests__/imagePayloadPolicy.test.ts
// [2026-09-08 사용자 실측] 위키미디어가 UA 없는 요청에 126바이트 안내 텍스트를 200으로
// 돌려줬고, 그 본문이 .jpg 로 저장돼 발행이 IMAGE_INSERTION_FAILED 로 중단됐다.
// 다운로드 단계에서 잘라내는 계약을 잠근다.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { verifyImagePayload, MIN_IMAGE_BYTES } from '../main/ipc/imagePayloadPolicy.js';

const jpegBody = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
  Buffer.alloc(4096, 0x20),
]);

describe('verifyImagePayload', () => {
  it('실제 JPEG 는 통과시킨다', () => {
    expect(verifyImagePayload(jpegBody, true)).toEqual({ ok: true });
  });

  it('위키미디어 robot-policy 안내 텍스트를 원격/로컬 모두에서 거부한다', () => {
    const wikimedia = Buffer.from(
      'Please set a user-agent and respect our robot policy https://w.wiki/4wJS.',
      'utf8',
    );
    for (const remote of [true, false]) {
      const verdict = verifyImagePayload(wikimedia, remote);
      expect(verdict.ok).toBe(false);
      expect((verdict as { reason: string }).reason).toContain('user-agent');
    }
  });

  it('1KB 를 넘어도 이미지가 아닌 원격 응답은 거부한다', () => {
    const htmlErrorPage = Buffer.from('<html><body>403 Forbidden</body></html>'.padEnd(4096, ' '), 'utf8');
    expect(verifyImagePayload(htmlErrorPage, true).ok).toBe(false);
  });

  it('빈 버퍼를 거부한다', () => {
    expect(verifyImagePayload(Buffer.alloc(0), true).ok).toBe(false);
    expect(verifyImagePayload(null, true).ok).toBe(false);
  });

  it('최소 크기 기준은 1KB 다', () => {
    expect(MIN_IMAGE_BYTES).toBe(1024);
  });
});

describe('image:downloadAndSave 배선', () => {
  const src = readFileSync('src/main/ipc/imageDownloadHandlers.ts', 'utf8');

  it('원격 다운로드에 User-Agent 를 보낸다', () => {
    expect(src).toMatch(/client\.get\([\s\S]{0,400}'User-Agent'/);
  });

  it('저장 전에 verifyImagePayload 로 검증한다', () => {
    expect(src).toContain('verifyImagePayload(buffer, isRemoteDownload)');
    const verifyIdx = src.indexOf('verifyImagePayload(buffer, isRemoteDownload)');
    const writeIdx = src.indexOf('await fsp.writeFile(filePath, buffer)');
    expect(verifyIdx).toBeGreaterThan(0);
    expect(writeIdx).toBeGreaterThan(verifyIdx);
  });

  it('배치 다운로더도 같은 검증을 쓴다', () => {
    expect(src).toContain('verifyImagePayload(buffer, true)');
  });
});

describe('AVIF/HEIF 보존', () => {
  // [2026-09-08] 수집 폴더에 정상 AVIF 7개가 있었다. 네이버 확장자는 아니지만
  // 이미지이므로 다운로드 단계에서 버리면 종전에 쓰이던 자료가 사라진다.
  const avif = Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftypavif', 'latin1'),
    Buffer.alloc(4096, 0),
  ]);
  const heic = Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftypheic', 'latin1'),
    Buffer.alloc(4096, 0),
  ]);

  it('AVIF 를 통과시킨다', () => {
    expect(verifyImagePayload(avif, true)).toEqual({ ok: true });
  });

  it('HEIC 를 통과시킨다', () => {
    expect(verifyImagePayload(heic, true)).toEqual({ ok: true });
  });

  it('ftyp 이지만 이미지 브랜드가 아닌 MP4 는 거부한다', () => {
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x20]),
      Buffer.from('ftypisom', 'latin1'),
      Buffer.alloc(4096, 0),
    ]);
    expect(verifyImagePayload(mp4, true).ok).toBe(false);
  });
});
