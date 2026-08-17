// src/__tests__/imageExtensionPolicy.test.ts
// [2026-08-18 사용자 실측] 발행 중 "파일 전송 오류 — 알 수 없는 파일"로 이미지 삽입이
// 3회 실패해 발행이 중단됐다. 수집 이미지가 .jsp 같은 동적 경로 확장자로 저장돼
// 네이버 에디터가 거부한 것 — 내용은 정상 JPEG였다.
// 저장(내용 기반 확장자)과 업로드(직전 정상화) 두 층을 잠근다.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  sniffImageExtension,
  resolveExtensionFromBytes,
} from '../main/ipc/imageExtensionPolicy.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0]);
const webp = Buffer.concat([
  Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0]),
  Buffer.from([0x57, 0x45, 0x42, 0x50]),
]);

describe('sniffImageExtension — 매직 바이트 판별', () => {
  it('주요 포맷을 식별한다', () => {
    expect(sniffImageExtension(jpeg)).toBe('.jpg');
    expect(sniffImageExtension(png)).toBe('.png');
    expect(sniffImageExtension(gif)).toBe('.gif');
    expect(sniffImageExtension(webp)).toBe('.webp');
  });

  it('이미지가 아니면 null', () => {
    expect(sniffImageExtension(Buffer.from('<html><body>not an image</body></html>'))).toBeNull();
    expect(sniffImageExtension(Buffer.alloc(3))).toBeNull();
  });
});

describe('resolveExtensionFromBytes — 저장 확장자 확정', () => {
  it('URL이 .jsp여도 실제 내용(JPEG)으로 확장자를 정한다 (발행 중단 사건)', () => {
    expect(resolveExtensionFromBytes(jpeg, '.jsp')).toBe('.jpg');
    expect(resolveExtensionFromBytes(png, '.php')).toBe('.png');
  });

  it('판별 불가 시 허용 목록의 폴백만 쓰고, 아니면 .jpg로 떨어진다', () => {
    const unknown = Buffer.from('....................');
    expect(resolveExtensionFromBytes(unknown, '.png')).toBe('.png');
    expect(resolveExtensionFromBytes(unknown, '.jsp')).toBe('.jpg');
    expect(resolveExtensionFromBytes(unknown, '.jpeg')).toBe('.jpg');
    expect(resolveExtensionFromBytes(unknown)).toBe('.jpg');
  });
});

describe('배선 계약 (source regression)', () => {
  const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('저장 핸들러가 내용 기반 확장자를 적용한다 (단일·배치 모두)', () => {
    const src = read('../main/ipc/imageDownloadHandlers.ts');
    expect(src).toMatch(/resolveExtensionFromBytes\(buffer/);
    expect(src).toMatch(/resolveExtensionFromBytes\(\s*result\.buffer/);
  });

  it('업로드 직전에도 네이버 허용 확장자로 정상화한다', () => {
    const src = read('../automation/imageHelpers.ts');
    expect(src).toMatch(/NAVER_OK/);
    expect(src).toMatch(/확장자 정상화/);
    expect(src).toMatch(/resolveExtensionFromBytes/);
  });
});
