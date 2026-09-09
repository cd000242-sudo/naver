// src/renderer/utils/headingMarkup.ts
// [2026-09-09] 반자동 편집에서 사용자가 소제목을 직접 정하기 위한 순수 조작기.
//
// 사장님 요청: "혹시 내가 소제목을 정할 수 있게 못하니?? 반자동 편집에 붙여넣기하면
// 소제목을 알아서 분석하지만 내 의도와 다른 내용을 소제목으로 지정해놨더라고."
// 사진 모드만이 아니라 모든 모드에 해당한다(반자동 편집은 모드 공용이다).
//
// 설계: **본문이 유일한 원천**이다.
//   목록 편집도, 본문에서 줄 지정도 결국 본문의 "## " 표기를 고치는 일이다.
//   두 화면이 같은 것을 조작하므로 서로 어긋날 수 없다.
//   표기는 이미 normalizeSemiAutoHeadingTitle 이 인식하는 문법이라 발행 경로도 그대로 산다.

/** 소제목 표기 접두. 이미 추출기가 인식하는 마크다운 문법을 그대로 쓴다. */
export const HEADING_PREFIX = '## ';

const HEADING_LINE = /^\s{0,3}#{1,4}\s+(.*)$/;

export interface HeadingLine {
  /** 본문에서 몇 번째 줄인가 (0-based). */
  readonly lineIndex: number;
  /** 표기를 뗀 소제목 글자. */
  readonly title: string;
}

function splitLines(body: string): string[] {
  return String(body || '').replace(/\r\n/g, '\n').split('\n');
}

/** 이 줄이 소제목 표기를 달고 있는가. */
export function isMarkedHeadingLine(line: string): boolean {
  return HEADING_LINE.test(String(line || ''));
}

/** 본문에 표기된 소제목들을 순서대로 돌려준다. */
export function listHeadingLines(body: string): HeadingLine[] {
  const out: HeadingLine[] = [];
  splitLines(body).forEach((line, lineIndex) => {
    const match = line.match(HEADING_LINE);
    if (!match) return;
    const title = match[1]!.trim();
    if (!title) return; // "##" 만 있고 글자가 없으면 소제목이 아니다
    out.push({ lineIndex, title });
  });
  return out;
}

/**
 * 한 줄을 소제목으로 지정하거나 해제한다.
 *
 * 본문 줄 자체는 지우지 않는다 — 해제하면 그냥 평범한 줄로 돌아간다.
 * 사용자가 실수로 해제해도 글이 사라지지 않아야 한다.
 */
export function toggleHeadingLine(body: string, lineIndex: number): string {
  const lines = splitLines(body);
  if (lineIndex < 0 || lineIndex >= lines.length) return body;

  const line = lines[lineIndex]!;
  const match = line.match(HEADING_LINE);
  if (match) {
    lines[lineIndex] = match[1]!.trim();
  } else {
    const trimmed = line.trim();
    if (!trimmed) return body; // 빈 줄은 소제목이 될 수 없다
    lines[lineIndex] = `${HEADING_PREFIX}${trimmed}`;
  }
  return lines.join('\n');
}

/** 소제목 글자만 바꾼다. 표기가 없는 줄이면 아무것도 하지 않는다. */
export function renameHeadingLine(body: string, lineIndex: number, nextTitle: string): string {
  const lines = splitLines(body);
  if (lineIndex < 0 || lineIndex >= lines.length) return body;
  if (!isMarkedHeadingLine(lines[lineIndex]!)) return body;

  const title = String(nextTitle || '').trim();
  if (!title) return body; // 빈 제목으로 만들지 않는다 — 지우려면 해제를 쓴다
  lines[lineIndex] = `${HEADING_PREFIX}${title}`;
  return lines.join('\n');
}

/**
 * 커서 위치(문자 오프셋)가 몇 번째 줄인지.
 * 본문 textarea 에서 "지금 커서가 있는 줄"을 소제목으로 지정할 때 쓴다.
 */
export function lineIndexAtOffset(body: string, offset: number): number {
  const normalized = String(body || '').replace(/\r\n/g, '\n');
  const safeOffset = Math.max(0, Math.min(offset, normalized.length));
  let index = 0;
  for (let i = 0; i < safeOffset; i += 1) {
    if (normalized[i] === '\n') index += 1;
  }
  return index;
}

/**
 * 표기가 하나도 없는 본문에, 지금 감지된 소제목들을 표기로 굳혀 넣는다.
 *
 * 자동 감지 결과를 사용자가 손보려면 먼저 눈에 보여야 한다. 감지된 제목이 본문에
 * 그대로 있는 줄을 찾아 "## " 를 붙인다. 못 찾은 제목은 건너뛴다 —
 * 본문에 없는 제목을 새로 끼워 넣으면 사용자가 쓰지 않은 문장이 생긴다.
 */
export function applyDetectedHeadings(body: string, titles: readonly string[]): string {
  const lines = splitLines(body);
  const used = new Set<number>();

  for (const rawTitle of titles) {
    const title = String(rawTitle || '').trim();
    if (!title) continue;
    const at = lines.findIndex((line, index) =>
      !used.has(index) && !isMarkedHeadingLine(line) && line.trim() === title);
    if (at < 0) continue;
    used.add(at);
    lines[at] = `${HEADING_PREFIX}${title}`;
  }

  return lines.join('\n');
}

/**
 * 드래그로 고른 글자만 소제목으로 떼어낸다.
 *
 * 사장님 요청: "커서로 원하는 만큼 드래그하면 그만큼만 소제목이 되어야 합니다."
 * 줄 전체를 먹던 toggleHeadingLine 과 달리, 고른 앞뒤 글자는 본문 줄로 남긴다 —
 * 소제목을 지정했다고 해서 쓰던 문장이 사라지면 안 된다.
 *
 * 여러 줄에 걸쳐 골랐으면 한 줄짜리 소제목으로 합친다. 소제목은 한 줄이라는 것이
 * 발행 경로(## 표기)의 전제라, 줄바꿈을 남기면 뒷 줄이 본문으로 새어 나간다.
 *
 * 선택이 없거나 공백뿐이면 null — 호출자가 기존 "줄 전체" 동작으로 넘어간다.
 */
export function markSelectionAsHeading(
  body: string,
  selectionStart: number,
  selectionEnd: number,
): string | null {
  const text = String(body || '').replace(/\r\n/g, '\n');
  const from = Math.max(0, Math.min(selectionStart, selectionEnd, text.length));
  const to = Math.max(0, Math.min(Math.max(selectionStart, selectionEnd), text.length));
  if (from >= to) return null;

  // 고른 양 끝의 공백은 소제목에 넣지 않는다 — 드래그는 보통 한 칸씩 넘친다.
  let start = from;
  let end = to;
  while (start < end && /\s/.test(text[start]!)) start += 1;
  while (end > start && /\s/.test(text[end - 1]!)) end -= 1;
  if (start >= end) return null;

  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEndRaw = text.indexOf('\n', end);
  const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;

  const segment = text.slice(lineStart, lineEnd);
  const head = segment.slice(0, start - lineStart);
  const selected = segment.slice(start - lineStart, end - lineStart);
  const tail = segment.slice(end - lineStart);

  // 이미 소제목인 줄에서 일부만 골랐으면 옛 표기는 버린다 — 고른 쪽이 새 소제목이다.
  const headText = head.replace(HEADING_LINE, '$1').trim();
  const title = selected.replace(/\s+/g, ' ').trim();
  if (!title) return null;

  const rebuilt: string[] = [];
  if (headText) rebuilt.push(headText);
  rebuilt.push(`${HEADING_PREFIX}${title}`);
  const tailText = tail.trim();
  if (tailText) rebuilt.push(tailText);

  return text.slice(0, lineStart) + rebuilt.join('\n') + text.slice(lineEnd);
}
