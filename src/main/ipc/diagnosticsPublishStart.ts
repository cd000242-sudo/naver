/**
 * [2026-11-10] Diagnostic report: "last publish start" summary.
 *
 * Why: the report only carries the last 500 log lines, so the lines logged when a publish
 * STARTS ([장소 추적], [구조 진단], [대표사진 추적] ...) are cut off on slow PCs where a publish
 * takes minutes. Those lines decide whether a place reached main and whether the first
 * heading photo was placed, so they are collected separately from the tail of the log.
 */
import * as fs from 'fs';

export const PUBLISH_START_MAX_LINES = 80;
export const PUBLISH_START_MAX_LINE_CHARS = 300;
/** Same ceiling as the report's other log readers (a rotated file once exceeded 70MB). */
const MAX_READ_BYTES = 8 * 1024 * 1024;
const READ_CHUNK_BYTES = 1024 * 1024;
/**
 * Lines scanned before the anchor. Parallel log writers scramble the order inside one publish: in a real log
 * [대표사진 추적], [n] heading= and [장소 추적] were written up to ~7 lines BEFORE [구조 진단]. The zone never
 * crosses the previous publish's anchor and never takes [중복제거] (those only appear after the anchor).
 */
const BACKTRACK_LINES = 12;
/** The anchor must sit this far from the start of what was read, so the backtrack lines are included. */
const ANCHOR_MARGIN_CHARS = 64 * 1024;

const ANCHOR = '[구조 진단]';
const ANCHOR_FALLBACK = '[장소 추적]';
const SIBLING_LINE = /\[구조 진단\]|\[대표사진 추적\]|\[장소 추적\]|\[장소\]|\[\d+\] heading=.* file=/;
const DEDUP_LINE = /\[중복제거\]/;
const BASE64_PAYLOAD = /(data:[^;,\s]{1,40};base64,)[A-Za-z0-9+/=]{24,}/g;

function shortenLine(line: string): string {
  const cleaned = line.replace(/\r$/, '').replace(BASE64_PAYLOAD, (_m, head: string) => `${head}…`);
  return cleaned.length > PUBLISH_START_MAX_LINE_CHARS
    ? cleaned.slice(0, PUBLISH_START_MAX_LINE_CHARS)
    : cleaned;
}

function lastIndexContaining(lines: readonly string[], needle: string): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes(needle)) return i;
  }
  return -1;
}

/** Keeps head and tail when over the cap; the middle is replaced by one omission line. */
function capLines(lines: string[], max: number): string[] {
  if (lines.length <= max) return lines;
  const head = Math.floor((max - 1) / 2);
  const tail = max - 1 - head;
  const omitted = lines.length - head - tail;
  return [...lines.slice(0, head), `... (중간 ${omitted}줄 생략)`, ...lines.slice(lines.length - tail)];
}

/** Pure: pick the summary lines of the LAST publish from already-read log lines. */
export function summarizePublishStart(lines: readonly string[]): string[] {
  let anchor = lastIndexContaining(lines, ANCHOR);
  if (anchor < 0) anchor = lastIndexContaining(lines, ANCHOR_FALLBACK);
  if (anchor < 0) return [];
  const previousAnchor = lastIndexContaining(lines.slice(0, anchor), ANCHOR);
  const from = Math.max(0, anchor - BACKTRACK_LINES, previousAnchor + 1);
  const picked = lines
    .slice(from)
    .filter((line, offset) => SIBLING_LINE.test(line) || (from + offset >= anchor && DEDUP_LINE.test(line)))
    .map(shortenLine);
  return capLines(picked, PUBLISH_START_MAX_LINES);
}

/** Reads a file from its end, chunk by chunk, until the last anchor is far enough from the read start. */
function readTailUntilAnchor(file: string): { lines: string[]; found: boolean } {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const chunks: Buffer[] = [];
    let readBytes = 0;
    let text = '';
    while (readBytes < Math.min(size, MAX_READ_BYTES)) {
      const length = Math.min(READ_CHUNK_BYTES, size - readBytes, MAX_READ_BYTES - readBytes);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, size - readBytes - length);
      chunks.unshift(buffer);
      readBytes += length;
      text = Buffer.concat(chunks).toString('utf8');
      const at = text.lastIndexOf(ANCHOR);
      if (at >= ANCHOR_MARGIN_CHARS) break;
      if (at >= 0 && readBytes >= size) break;
    }
    const lines = text.split('\n');
    // A chunk boundary can cut the first line in half; drop it unless the whole file was read.
    const trimmed = readBytes < size ? lines.slice(1) : lines;
    return { lines: trimmed, found: trimmed.some((line) => line.includes(ANCHOR)) };
  } finally {
    fs.closeSync(fd);
  }
}

/** Report section body. `files` are ordered oldest first (rotated copy, then the current file). */
export function readLastPublishStartSummary(files: readonly string[]): string {
  try {
    let collected: string[] = [];
    for (let i = files.length - 1; i >= 0; i--) {
      const { lines, found } = readTailUntilAnchor(files[i]);
      collected = [...lines, ...collected];
      if (found) break;
    }
    const summary = summarizePublishStart(collected);
    return summary.length > 0
      ? summary.join('\n')
      : '(오늘 기록에서 발행 시작 줄을 찾지 못했습니다 — 발행 전이거나 기록이 너무 길어 시작 부분이 밀려났습니다)';
  } catch (e) {
    return `(발행 시작 줄 읽기 실패: ${(e as Error).message})`;
  }
}
