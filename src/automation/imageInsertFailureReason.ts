/**
 * [2026-10-09 고객 신고] 화면 오류에 "이미지 1: 3회 삽입 실패" 만 남아 원인을 알 수 없었다.
 * 마지막 시도의 이유를 붙이되, 고객 PC 사용자 이름이 드러나지 않게 파일 경로는 파일 이름만 남긴다.
 */
import * as fsPromises from 'node:fs/promises';
import { extname } from 'node:path';
import { sniffImageMagic } from '../image/imageUrlDownload.js';

// [2026-10-09] `\`, `/`, JSON 이스케이프 `\` 모두 파일 이름만 남긴다.
const WINDOWS_PATH = /[A-Za-z]:[\\/]+(?:[^\\/\n:*?"<>|]+[\\/]+)*([^\\/\n:*?"<>|]+)/g;
const POSIX_PATH = /(?:^|\s)\/(?:[^/\n]+\/)+([^/\n]+)/g;

export function summarizeImageInsertFailure(message: string | undefined | null): string {
  const firstLine = String(message ?? '').split('\n')[0].trim();
  return firstLine
    .replace(WINDOWS_PATH, '$1')
    .replace(POSIX_PATH, (match, name: string) => `${match.startsWith(' ') ? ' ' : ''}${name}`)
    .slice(0, 120);
}

/** [2026-10-09] 같은 이유가 이어지면 묶어 "1회: A | 2~3회: B" 로 보여준다(묶음마다 80자). */
export function describeImageInsertAttempts(reasons: readonly string[]): string {
  const groups: Array<{ from: number; to: number; reason: string }> = [];
  reasons.forEach((reason, i) => {
    const last = groups[groups.length - 1];
    if (last && last.reason === reason) last.to = i + 1;
    else groups.push({ from: i + 1, to: i + 1, reason });
  });
  return groups
    .map((g) => `${g.from === g.to ? `${g.from}회` : `${g.from}~${g.to}회`}: ${g.reason.slice(0, 80) || '이유 없음'}`)
    .join(' | ');
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

/** [2026-10-09] 실패 줄에 붙일 파일 사실(확장자·실제 형식·크기). 경로는 절대 넣지 않고, 실패해도 throw 하지 않는다. */
export async function describeImageFileForFailure(source: string | undefined | null): Promise<string> {
  try {
    const value = String(source ?? '');
    if (/^https?:\/\//i.test(value)) return 'URL';
    const dataMatch = /^data:([^;,]+)/i.exec(value);
    if (dataMatch) return `${dataMatch[1]} ${formatSize(Math.floor(value.length * 0.75))}`;
    const stat = await fsPromises.stat(value);
    const handle = await fsPromises.open(value, 'r');
    let head = Buffer.alloc(0);
    try {
      const buf = Buffer.alloc(16);
      const { bytesRead } = await handle.read(buf, 0, 16, 0);
      head = buf.subarray(0, bytesRead);
    } finally { await handle.close().catch(() => undefined); }
    const ext = extname(value).toLowerCase() || '(확장자 없음)';
    const real = sniffImageMagic(head);
    const size = formatSize(stat.size);
    if (!real) return `${ext}(형식 확인 안 됨) ${size}`;
    const normalizedExt = ext.replace('.', '').replace('jpeg', 'jpg');
    return real === normalizedExt ? `${ext} ${size}` : `${ext}(실제 ${real}) ${size}`;
  } catch {
    return '파일 읽기 실패';
  }
}
