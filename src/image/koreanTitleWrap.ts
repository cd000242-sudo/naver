export interface KoreanTitleWrapOptions {
  maxLines?: number;
  maxCharsPerLine?: number;
}

const GOOD_LINE_ENDINGS = [
  /[.!?？。]$/,
  /(하면|쓰면|먹으면|입으면|사면|보면|가면|오면|라면|다면|면)$/,
  /(때|후|전|기준|방법|이유|정리|비교|후기|추천|주의점|체크)$/,
];

const BAD_LINE_ENDINGS = [
  /(와|과|을|를|이|가|은|는|에|에서|으로|로|의|도|만|까지|부터)$/,
  /(같이|함께|더|왜|어떻게|얼마나)$/,
];

const BAD_LINE_STARTS = [
  /^(와|과|을|를|이|가|은|는|에|에서|으로|로|의|도|만|까지|부터)(?:\s|$)/,
  /^(더|왜|어떻게|얼마나)(?:\s|$)/,
];

function normalizeTitle(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function measureKoreanText(text: string): number {
  let score = 0;
  for (const char of text) {
    if (/[A-Za-z0-9]/.test(char)) score += 0.65;
    else if (/\s/.test(char)) score += 0.45;
    else score += 1;
  }
  return score;
}

function pickLineCount(text: string, maxLines: number, maxCharsPerLine: number): number {
  const measured = measureKoreanText(text);
  if (measured <= maxCharsPerLine) return 1;
  if (maxLines >= 2 && measured <= maxCharsPerLine * 1.7) return 2;
  return Math.min(maxLines, 3);
}

function createPartitions(words: string[], lineCount: number): string[][] {
  const results: string[][] = [];

  function walk(start: number, remainingLines: number, acc: string[]): void {
    if (remainingLines === 1) {
      const tail = words.slice(start).join(' ').trim();
      if (tail) results.push([...acc, tail]);
      return;
    }

    const minRemainingWords = remainingLines - 1;
    for (let end = start + 1; end <= words.length - minRemainingWords; end += 1) {
      const line = words.slice(start, end).join(' ').trim();
      if (!line) continue;
      walk(end, remainingLines - 1, [...acc, line]);
    }
  }

  walk(0, lineCount, []);
  return results;
}

function scorePartition(lines: string[], maxCharsPerLine: number): number {
  const lengths = lines.map(measureKoreanText);
  const longest = Math.max(...lengths);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const target = total / lines.length;

  let score = 0;
  for (const length of lengths) {
    score += Math.pow(length - target, 2);
    if (length > maxCharsPerLine) score += Math.pow(length - maxCharsPerLine, 2) * 8;
    if (length < Math.max(4, target * 0.45)) score += 40;
  }

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] || '';
    if (GOOD_LINE_ENDINGS.some((pattern) => pattern.test(line))) score -= 18;
    if (BAD_LINE_ENDINGS.some((pattern) => pattern.test(line))) score += 24;
    if (BAD_LINE_STARTS.some((pattern) => pattern.test(nextLine))) score += 18;
  }

  if (longest > maxCharsPerLine * 1.1) score += 50;
  return score;
}

export function wrapKoreanTitleForThumbnail(
  text: string,
  options: KoreanTitleWrapOptions = {},
): string[] {
  const cleanText = normalizeTitle(text);
  if (!cleanText) return [];

  const maxLines = Math.max(1, Math.min(options.maxLines ?? 3, 3));
  const maxCharsPerLine = Math.max(8, options.maxCharsPerLine ?? 18);
  if (measureKoreanText(cleanText) <= maxCharsPerLine || !cleanText.includes(' ')) {
    return [cleanText];
  }

  const words = cleanText.split(' ').filter(Boolean);
  if (words.length <= 1) return [cleanText];

  const lineCount = Math.min(pickLineCount(cleanText, maxLines, maxCharsPerLine), words.length);
  const candidates = createPartitions(words, lineCount);
  if (candidates.length === 0) return [cleanText];

  const best = candidates.reduce((winner, candidate) => {
    return scorePartition(candidate, maxCharsPerLine) < scorePartition(winner, maxCharsPerLine)
      ? candidate
      : winner;
  }, candidates[0]);

  return best.slice(0, maxLines);
}
