/**
 * Compares our title with the titles of the posts that already rank for the keyword.
 *
 * [2026-09-02 사장님] "제휴마케팅 할 때 사람들이 제목으로 정하는 걸 참고해서 그 데이터를 대량으로 학습하고
 * 내 거랑 대조해 보면 되잖아." 프로브는 상위 글 제목을 이미 가져오는데(serpReport.posts[].item.title)
 * 본문 점수만 비교하고 제목은 대조하지 않았다.
 *
 * 대조는 형태다 — 낱말 목록이 아니다.
 *   · 검색어 구절이 그대로 붙어 있는가(온전성) · 구절이 앞쪽(첫 40%)에 있는가 · 제목 길이(중앙값)
 * 상위 글 다수가 하는 것을 내 제목이 안 하고 있으면 그것이 첫 번째 고칠 점이다.
 */
export interface SerpTitleBenchmark {
  readonly sampleSize: number;
  readonly intactShare: number;
  readonly frontShare: number;
  readonly medianLength: number;
  readonly ourIntact: boolean;
  readonly ourFront: boolean;
  readonly ourLength: number;
  readonly verdict: 'aligned' | 'lagging' | 'insufficient' | 'off-keyword';
  readonly lines: readonly string[];
}

const MIN_SAMPLE = 3;
const FRONT_RATIO = 0.4;

function norm(value: string): string {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function phrasePosition(title: string, keyword: string): { intact: boolean; front: boolean } {
  const t = norm(title);
  const k = norm(keyword);
  if (!t || !k) return { intact: false, front: false };
  const at = t.indexOf(k);
  if (at < 0) return { intact: false, front: false };
  return { intact: true, front: at <= Math.floor(t.length * FRONT_RATIO) };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

export function compareTitleWithSerp(ourTitle: string, keyword: string, serpTitles: readonly string[]): SerpTitleBenchmark {
  const titles = (serpTitles || []).map((t) => String(t || '').trim()).filter((t) => t.length > 0);
  const ours = phrasePosition(ourTitle, keyword);
  const ourLength = String(ourTitle || '').trim().length;
  if (titles.length < MIN_SAMPLE) {
    return {
      sampleSize: titles.length, intactShare: 0, frontShare: 0, medianLength: 0,
      ourIntact: ours.intact, ourFront: ours.front, ourLength, verdict: 'insufficient', lines: [],
    };
  }
  const positions = titles.map((t) => phrasePosition(t, keyword));
  const intactCount = positions.filter((p) => p.intact).length;
  const frontCount = positions.filter((p) => p.front).length;
  const intactShare = intactCount / titles.length;
  const frontShare = frontCount / titles.length;
  const medianLength = median(titles.map((t) => t.length));

  const lines: string[] = [];
  /*
   * [2026-09-03 라이브 — 헬스헬퍼 맥스컷] 상위 10개 중 0개가 검색어를 그대로 썼는데 "aligned" 라고 읽었다.
   * 상위 글 대부분이 이 구절을 안 쓰면 맞출 대상이 없는 것이고, 검색어 자체가 사람들이 치는 말이 아니라는 신호다.
   * 제목을 탓하지 말고 키워드를 되돌아보라고 말한다. 게이트 감점도 없다 — 무엇에 맞출지 모르기 때문이다.
   */
  if (intactShare < 0.3) {
    lines.push(`상위 ${titles.length}개 중 ${intactCount}개만 "${keyword}" 를 그대로 썼습니다 — 사람들이 치는 검색어가 아닐 수 있습니다. 키워드를 다시 보세요`);
    return {
      sampleSize: titles.length, intactShare, frontShare, medianLength,
      ourIntact: ours.intact, ourFront: ours.front, ourLength, verdict: 'off-keyword', lines,
    };
  }
  // 상위 글 절반 이상이 하는 것을 내 제목이 안 하면 첫 번째 고칠 점이다.
  if (intactShare >= 0.5 && !ours.intact) {
    lines.push(`상위 ${titles.length}개 중 ${intactCount}개가 "${keyword}" 를 그대로 붙여 썼는데 내 제목은 토막 나 있습니다 — 검색어를 그대로 넣으세요`);
  } else if (frontShare >= 0.5 && ours.intact && !ours.front) {
    lines.push(`상위 ${titles.length}개 중 ${frontCount}개가 "${keyword}" 를 앞쪽에 뒀는데 내 제목은 뒤에 있습니다 — 검색어를 앞으로 옮기세요`);
  }
  if (medianLength > 0 && ourLength > medianLength * 1.5) {
    lines.push(`상위 글 제목 중앙값 ${medianLength}자 · 내 제목 ${ourLength}자 — 검색 결과에서 잘립니다. 줄이세요`);
  }
  const lagging = lines.length > 0;
  if (!lagging && ours.intact) {
    lines.push(`상위 ${titles.length}개 중 ${intactCount}개가 검색어를 그대로 썼고 내 제목도 그렇습니다 (앞쪽 배치 ${frontCount}개)`);
  }
  return {
    sampleSize: titles.length, intactShare, frontShare, medianLength,
    ourIntact: ours.intact, ourFront: ours.front, ourLength,
    verdict: lagging ? 'lagging' : 'aligned', lines,
  };
}
