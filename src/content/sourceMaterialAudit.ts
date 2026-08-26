/**
 * Grades the material a keyword search actually produced, and says so when it is thin.
 *
 * [2026-08-27] The owner put the rule plainly: "실시간 검색어가 떴다는 건 기사가 떴다는
 * 소리이니까." If a keyword is trending, news exists. Crawling a trending keyword and
 * coming back with no article at all means either the story has not broken yet or the
 * keyword was never an issue — and in both cases the article gets written from blog
 * summaries, which is where invention starts.
 *
 * Measured: the 서은광 piece was built on four blog full-texts and zero articles, and it
 * stated 키 172cm · 발사이즈 250mm · 차트 1위 · 경연 1등 트로피 as settled fact. Not one of
 * those was confirmed by a news source.
 *
 * This reports; it never blocks. The owner decides whether to publish.
 */

export type SourceKind = 'news' | 'blog' | 'other';

/** Hosts that serve user-written posts rather than reporting. */
const NON_NEWS_HOSTS = [
  'blog.naver.com',
  'blog.daum.net',
  'post.naver.com',
  'cafe.naver.com',
  'cafe.daum.net',
  'kin.naver.com',
  'tistory.com',
  'brunch.co.kr',
  'in.naver.com',
];

/** Host fragments that mark a news outlet. Korean outlets almost all carry one. */
const NEWS_HINTS = ['news', 'entertain', 'press', 'ilbo', 'sports', 'herald', 'edaily', 'mk.co.kr'];

/** What kind of source a URL is. Never throws. */
export function classifySourceKind(url: string | undefined): SourceKind {
  try {
    const raw = String(url || '').trim();
    if (!raw) return 'other';
    const host = new URL(raw).hostname.toLowerCase();

    /*
     * 블로그·카페·지식iN 이 먼저다 — post.naver.com 처럼 naver 도메인이 겹친다.
     * endsWith 로만 본다: includes 를 쓰면 "entertain.naver.com" 이 "in.naver.com" 에
     * 걸려 연예 기사가 블로그로 분류된다(개발 중 실측).
     */
    if (NON_NEWS_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'blog';
    if (NEWS_HINTS.some((h) => host.includes(h))) return 'news';
    // 언론사 도메인은 대부분 위 힌트에 걸린다. 못 걸리면 단정하지 않는다.
    return 'other';
  } catch {
    return 'other';
  }
}

export type MaterialLevel = 'ok' | 'warn' | 'severe';

export interface SourceMaterialInput {
  readonly newsCount: number;
  readonly blogCount: number;
  /** Total characters of crawled full text (snippets excluded). */
  readonly totalChars: number;
}

export interface SourceMaterialAudit {
  readonly level: MaterialLevel;
  readonly message: string;
}

/** Below this, the crawled text is too little to write facts from. */
const MIN_USABLE_CHARS = 1500;

const QUIET: SourceMaterialAudit = { level: 'ok', message: '' };

/**
 * Grades the collected material.
 *
 * The strongest signal is whether any *article* was crawled. Blogs retell; they do not
 * confirm. A number that appears only in blogs has nothing standing behind it.
 */
export function auditSourceMaterial(input: SourceMaterialInput): SourceMaterialAudit {
  try {
    // 입력 자체가 없으면 판정할 재료가 없는 것이다 — 없는 근거로 경고하지 않는다.
    if (!input || typeof input !== 'object') return QUIET;
    const news = Number(input?.newsCount) || 0;
    const blogs = Number(input?.blogCount) || 0;
    const chars = Number(input?.totalChars) || 0;

    if (news + blogs === 0) {
      return {
        level: 'severe',
        message: '본문을 하나도 긁지 못했습니다 — 검색 스니펫(제목·요약 두 줄)만으로 글을 씁니다. '
          + '수치·날짜·인용은 확인된 것이 아니니 그대로 믿지 마세요.',
      };
    }

    if (news === 0) {
      return {
        level: 'warn',
        message: `기사를 하나도 찾지 못했습니다 — 블로그 ${blogs}건이 재료의 전부입니다. `
          + '블로그는 남의 글을 옮긴 2차 자료라, 여기서 나온 수치·이력은 원 기사로 확인되지 않았습니다.',
      };
    }

    if (chars < MIN_USABLE_CHARS) {
      return {
        level: 'warn',
        message: `긁어온 본문이 ${chars}자뿐입니다 — 사실을 쓰기에 얇습니다. `
          + '글에 나온 수치는 원 기사에서 한 번 확인하는 편이 안전합니다.',
      };
    }

    return QUIET;
  } catch {
    return QUIET;
  }
}
