/**
 * 소제목을 바꾸면 본문도 같이 바꾼다.
 *
 * contentHeadingOptimizer.syncHeadingsWithBodyPlain 은 빈 껍데기다 — 로그 한 줄만
 * 찍고 끝인데 호출부가 셋이다. 그 앞에서 소제목을 실제로 바꾸는 곳이 둘 있다
 * (optimizeHeadingsForMode · applyHeadingKeywordPatch).
 *
 * 발행은 headings[] 가 아니라 bodyPlain 을 타이핑한다. 그래서 두 보정이 독자에게
 * 한 번도 도달하지 않았다. SEO 메인키워드 앞배치도 같이 사문화돼 있었다.
 *
 * 더 위험한 것은 발행 코드가 소제목 문자열을 본문에서 글자 그대로 찾는다는 점이다
 * (editorHelpers:935 · :966). 어긋나면 이미지 넣을 자리를 못 찾는다.
 *
 * 옛 휴리스틱 동기화를 되살리지 않는다 — 그건 "AI 생성 고유 소제목 유지" 를 위해
 * 의도적으로 껐던 것이다. 바꾸기 전후 문자열을 우리가 알고 있으므로 리터럴 치환이면 된다.
 */

export interface HeadingRename {
  readonly from: string;
  readonly to: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * 소제목 줄만 바꾼다.
 *
 * 줄 전체가 그 소제목일 때만 교체한다 — 설명 문장 안에 같은 말이 나오는 경우까지
 * 바꾸면 문장이 망가진다. 마크다운 표기(## · ###)와 앞뒤 공백은 허용한다.
 */
export function applyHeadingRenames(
  body: string | undefined,
  renames: readonly HeadingRename[] | undefined,
): string {
  const text = String(body ?? '');
  if (!text || !Array.isArray(renames) || renames.length === 0) return text;

  let out = text;
  for (const rename of renames) {
    const from = String(rename?.from ?? '').trim();
    const to = String(rename?.to ?? '').trim();
    if (!from || !to || from === to) continue;
    const pattern = new RegExp(`^([ \\t]*(?:#{1,6}[ \\t]+)?)${escapeRegExp(from)}[ \\t]*$`, 'gmu');
    out = out.replace(pattern, `$1${to}`);
  }
  return out;
}

/** headings[] 의 title 과 원래 제목 목록을 대조해 바뀐 것만 뽑는다. */
export function collectHeadingRenames(
  before: readonly string[] | undefined,
  after: readonly string[] | undefined,
): HeadingRename[] {
  const olds = Array.isArray(before) ? before : [];
  const news = Array.isArray(after) ? after : [];
  const renames: HeadingRename[] = [];
  for (let i = 0; i < Math.min(olds.length, news.length); i += 1) {
    const from = String(olds[i] ?? '').trim();
    const to = String(news[i] ?? '').trim();
    if (from && to && from !== to) renames.push({ from, to });
  }
  return renames;
}
