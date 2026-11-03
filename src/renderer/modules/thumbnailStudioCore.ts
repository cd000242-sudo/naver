export interface ThumbnailStudioTextOptions {
  mainText: string;
  subText: string;
  width: number;
  height: number;
  fontSize: number;
  measure: (text: string, size: number) => number;
}

export function thumbnailStudioWrap(text: string, width: number, size: number,
  measure: ThumbnailStudioTextOptions['measure']): string[] {
  return text.split('\n').flatMap(paragraph => {
    const lines: string[] = [];
    let current = '';
    for (const char of paragraph) {
      if (current && measure(current + char, size) > width) {
        lines.push(current);
        current = char;
      } else current += char;
    }
    return [...lines, current];
  });
}

export function thumbnailStudioLayoutText(options: ThumbnailStudioTextOptions) {
  const { mainText, subText, width, height, fontSize, measure } = options;
  const mainLines = thumbnailStudioWrap(mainText, width, fontSize, measure);
  const subSize = Math.max(12, Math.round(fontSize * 0.48));
  const subLines = subText ? thumbnailStudioWrap(subText, width, subSize, measure) : [];
  const lineHeight = fontSize * 1.25;
  const subLineHeight = subSize * 1.4;
  const subGap = subLines.length ? fontSize * 0.35 : 0;
  const totalHeight = mainLines.length * lineHeight + subGap + subLines.length * subLineHeight;
  const fits = totalHeight <= height
    && mainLines.every(line => measure(line, fontSize) <= width)
    && subLines.every(line => measure(line, subSize) <= width);
  return { mainLines, subLines, fontSize, subSize, lineHeight, subLineHeight, subGap, height: totalHeight, fits };
}

export function thumbnailStudioFitText(options: ThumbnailStudioTextOptions) {
  let fontSize = Math.max(16, Math.min(120, Math.floor(options.fontSize)));
  let layout = thumbnailStudioLayoutText({ ...options, fontSize });
  while (!layout.fits && fontSize > 16) {
    fontSize -= 1;
    layout = thumbnailStudioLayoutText({ ...options, fontSize });
  }
  return layout;
}

/** In-memory snapshots keep image references, never duplicate base64 data per keystroke. */
export class ThumbnailStudioHistory<T> {
  private entries: T[] = [];
  private cursor = -1;
  private group = '';
  private timestamp = 0;

  constructor(private readonly limit = 32, private readonly equal: (a: T, b: T) => boolean = Object.is) {}
  get canUndo(): boolean { return this.cursor > 0; }
  get canRedo(): boolean { return this.cursor >= 0 && this.cursor < this.entries.length - 1; }

  push(value: T, group = '', now = Date.now()): void {
    if (this.cursor >= 0 && this.equal(this.entries[this.cursor], value)) return;
    const coalesce = !!group && group === this.group && now - this.timestamp < 650
      && this.cursor > 0 && !this.canRedo;
    const retained = this.entries.slice(0, coalesce ? this.cursor : this.cursor + 1);
    this.entries = [...retained, value].slice(-Math.max(2, this.limit));
    this.cursor = this.entries.length - 1;
    this.group = group;
    this.timestamp = now;
  }

  undo(): T | undefined {
    if (!this.canUndo) return undefined;
    this.cursor -= 1;
    this.group = '';
    return this.entries[this.cursor];
  }

  redo(): T | undefined {
    if (!this.canRedo) return undefined;
    this.cursor += 1;
    this.group = '';
    return this.entries[this.cursor];
  }
}

export const thumbnailStudioPresetNames: Record<string, string> = {
  modern: '에디토리얼', minimal: '페이퍼', vibrant: '포인트', nature: '세이지', dark: '시네마틱',
};
