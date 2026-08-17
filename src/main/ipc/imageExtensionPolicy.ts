// src/main/ipc/imageExtensionPolicy.ts
// 저장 확장자는 URL이 아니라 파일 내용(매직 바이트)으로 정한다.
//
// [2026-08-18 사용자 실측] 수집 이미지가 .jsp / .php 같은 동적 경로 확장자로 저장돼
// 네이버 에디터가 발행 중 "파일 전송 오류 — 알 수 없는 파일"로 거부했고, 3회 재시도
// 뒤 발행이 중단됐다. 내용은 멀쩡한 JPEG였고 확장자만 틀렸다.
// (수집 소스가 늘어난 뒤 URL이 이미지 파일명을 안 담는 경우가 흔해져 드러난 문제)

/** 네이버 에디터가 받는 확장자만 허용한다. */
const NAVER_SAFE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buffer[offset + i] === b);
}

/** 매직 바이트로 실제 이미지 포맷을 판별한다. 모르면 null. */
export function sniffImageExtension(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return '.jpg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return '.png';
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return '.gif';
  if (startsWith(buffer, [0x42, 0x4d])) return '.bmp';
  // RIFF....WEBP
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return '.webp';
  }
  return null;
}

/**
 * 저장에 쓸 최종 확장자.
 * 1순위 매직 바이트 → 2순위 기존(URL/헤더) 확장자가 네이버 허용 목록일 때 → 최후 .jpg.
 * 반환값은 항상 네이버가 받는 확장자다.
 */
export function resolveExtensionFromBytes(buffer: Buffer, fallbackExt?: string): string {
  const sniffed = sniffImageExtension(buffer);
  if (sniffed) return sniffed;
  const normalized = String(fallbackExt || '').toLowerCase().split('?')[0].trim();
  if (NAVER_SAFE_EXTENSIONS.has(normalized)) return normalized === '.jpeg' ? '.jpg' : normalized;
  return '.jpg';
}
