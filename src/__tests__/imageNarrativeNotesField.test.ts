import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { normalizeImageNarrativeContext } from '../imageNarrative/context';

function readRoot(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-09 사장님] "상황 · 글에 꼭 나왔으면 하는 내용 필드가 좀 컸으면 좋겠네."
 *
 * 사진 묶음을 설명하는 칸인데(예: "1~4번은 호텔 도착, 5~8번은 저녁 식사") 세 줄뿐이었다.
 * 화면 maxlength 와 백엔드 CONTEXT_LIMITS.notes 가 어긋나면 입력은 되는데 조용히 잘리므로
 * 둘을 함께 잠근다.
 */
describe('사진 모드 — 상황 메모 입력칸', () => {
  const html = readRoot('public/index.html');
  const css = readRoot('public/styles.css');

  it('입력칸이 눈에 띄게 커졌다', () => {
    expect(html).toMatch(/id="image-narrative-context-notes"[^>]*rows="9"/);
    expect(css).toMatch(/\.image-narrative-context-field--full textarea \{[\s\S]*?min-height: 200px;/);
  });

  it('이 칸만 커지고 다른 컨텍스트 입력칸은 그대로다', () => {
    // 시간·인물·장소·상황 한 줄 입력까지 같이 커지면 화면이 무너진다.
    expect(css).toMatch(/\.image-narrative-context-field textarea \{\s*\n\s*resize: vertical;\s*\n\s*min-height: 72px;/);
  });

  it('화면 최대 글자수와 백엔드 한도가 같다 (조용한 잘림 방지)', () => {
    const htmlMax = Number(
      html.match(/id="image-narrative-context-notes"[^>]*maxlength="(\d+)"/)?.[1],
    );
    const backendMax = Number(
      readRoot('src/imageNarrative/context.ts').match(/notes: (\d+),/)?.[1],
    );
    expect(htmlMax).toBe(2000);
    expect(backendMax).toBe(htmlMax);
  });

  it('한도까지 적은 메모는 잘리지 않는다', () => {
    const notes = '가'.repeat(2000);
    const context = normalizeImageNarrativeContext({ notes });
    expect(context?.notes).toHaveLength(2000);
  });

  it('한도를 넘으면 잘라서 받는다 (터지지 않는다)', () => {
    const context = normalizeImageNarrativeContext({ notes: '나'.repeat(2600) });
    expect(context?.notes).toHaveLength(2000);
  });
});
