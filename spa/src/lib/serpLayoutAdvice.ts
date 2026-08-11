/**
 * 화면 배치로 "어디에 쓸 것인가"를 가른다.
 *
 * 왜 필요한가:
 *   같은 검색어라도 네이버가 무엇을 맨 위에 놓느냐에 따라 싸울 판이 다르다.
 *     인기글(블로그·카페)이 위  → 네이버 블로그로 붙는 게 맞다
 *     웹사이트가 위             → 워드프레스·자체 사이트가 유리하다
 *     지식iN 이 위              → 답변을 달아 내 채널로 끌어오는 편이 빠르다
 *     쇼핑이 위                 → 글보다 상품·제휴가 먹는 자리다
 *   구획이 "있다/없다"만 봐서는 이걸 알 수 없다. 순서를 봐야 안다.
 *
 * 여기 있는 것은 전부 **측정한 순서에서 곧바로 따라오는 사실**이다.
 * 유입량·성공률을 만들지 않는다.
 */

/** 사람이 글을 실어 들어갈 수 있는 자리만 센다. AI 브리핑·이미지·동영상은 뺀다. */
const PUBLISHABLE: Record<string, { surface: PublishSurface; label: string }> = {
  인기글: { surface: 'naver-blog', label: '네이버 블로그·카페' },
  카페: { surface: 'naver-blog', label: '네이버 블로그·카페' },
  웹사이트: { surface: 'wordpress', label: '워드프레스·자체 사이트' },
  지식iN: { surface: 'kin', label: '지식iN 답변' },
  지식스니펫: { surface: 'kin', label: '지식iN 답변' },
  쇼핑: { surface: 'shopping', label: '상품·제휴' },
  인플루언서: { surface: 'naver-blog', label: '네이버 블로그·카페' },
};

export type PublishSurface = 'naver-blog' | 'wordpress' | 'kin' | 'shopping';

export interface LayoutAdvice {
  /** 제일 위에 있는 "글을 실을 수 있는" 자리. 없으면 null. */
  bestFor: PublishSurface | null;
  /** 화면에 그대로 쓸 한 줄. 근거가 없으면 빈 문자열. */
  headline: string;
  /** 위에서 아래로 본 순서. 실을 수 있는 자리만. */
  ranked: { surface: PublishSurface; label: string; position: number }[];
  /** 광고가 맨 위를 먹고 있는가. 유기적 자리가 그만큼 아래로 밀린다. */
  adsOnTop: boolean;
}

const HEADLINE: Record<PublishSurface, string> = {
  'naver-blog': '블로그 글이 맨 위에 뜨는 화면 — 네이버 블로그로 붙는 자리다',
  wordpress: '웹사이트가 블로그보다 위에 뜬다 — 워드프레스·자체 사이트가 유리하다',
  kin: '지식iN 이 블로그보다 위에 뜬다 — 답변을 달아 내 채널로 끌어오는 편이 빠르다',
  shopping: '쇼핑이 맨 위를 먹는다 — 글보다 상품·제휴가 붙는 자리다',
};

/**
 * 배치 순서를 읽고 어디에 쓸지 알려 준다.
 *
 * 순서를 못 읽었으면(빈 배열) 아무 말도 하지 않는다 — 못 본 것을 판정으로
 * 바꾸지 않는다.
 */
export function adviseFromLayout(order: readonly string[] | null | undefined): LayoutAdvice {
  const empty: LayoutAdvice = { bestFor: null, headline: '', ranked: [], adsOnTop: false };
  if (!order || order.length === 0) return empty;

  const ranked: LayoutAdvice['ranked'] = [];
  const seen = new Set<PublishSurface>();
  order.forEach((name, index) => {
    const entry = PUBLISHABLE[name];
    // 같은 판이 여러 구획으로 나뉘어 있으면(인기글·카페) 제일 위 것만 센다.
    if (!entry || seen.has(entry.surface)) return;
    seen.add(entry.surface);
    ranked.push({ surface: entry.surface, label: entry.label, position: index + 1 });
  });

  if (ranked.length === 0) return empty;

  // 광고가 맨 위면 유기적 결과는 그만큼 내려간다 — 사실이므로 함께 전한다.
  const adsOnTop = order[0] === '파워링크';

  return {
    bestFor: ranked[0].surface,
    headline: HEADLINE[ranked[0].surface],
    ranked,
    adsOnTop,
  };
}
