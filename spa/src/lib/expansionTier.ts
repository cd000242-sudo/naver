/**
 * 확장 키워드의 **층** — 씨앗과 얼마나 같은 주제인가.
 *
 * [쌍둥이 주의] 같은 규칙이 워커(leword-app tmp/cf-worker/worker.js 의
 * keyword-expansions)에도 있다. 워커는 2차 씨앗 고르기와 검색량 실측 순서에,
 * 화면은 표의 구역 나누기에 쓴다. 규칙을 바꾸면 **양쪽을 같이** 고칠 것.
 *
 * 왜(사장님 2026-09-07): '티빙 유출 조회'를 넣었더니 "조회" 꼬리만 물고 온
 * 택배조회·다이소 재고조회가 비율이 좋다는 이유로 맨 위에 왔다. 사람이 머릿속에
 * 그리는 가지(티빙 유출 조회 → 보상 → 보상 안 되면 → 집단소송)는 아래에 흩어져
 * 하나하나 찾아야 했다. 순서는 ① 주제의 파생·조합 ② 그 안의 황금 ③ 조금이라도
 * 연관 ④ 새 가지 여야 한다.
 *
 * 씨앗의 첫 어절이 **머리**(티빙), 나머지가 **꼬리**(유출·조회)다. 한국어 검색어는
 * 주제 명사가 앞에, 의도어가 뒤에 온다 — '주민세 미납 조회', '청년내일저축계좌 신청 조건'.
 *   1  머리 + 꼬리 하나라도      티빙 유출 보상 · 티빙 개인정보 조회
 *   2  머리만                    티빙 요금제 · 티빙 탈퇴
 *   3  꼬리만                    택배조회 · 개인정보 유출 확인
 *   4  아무것도 안 겹침          검색광고 연관이 던진 새 가지
 */

export type ExpansionTier = 1 | 2 | 3 | 4;

export const compactText = (text: string): string => String(text || '').replace(/\s+/g, '').toLowerCase();

export function seedParts(seed: string): { head: string; others: string[] } {
    const words = String(seed || '').trim().split(/\s+/).filter(Boolean);
    const meaningful = words.filter((w) => w.length >= 2);
    const head = meaningful[0] || words[0] || '';
    const others = meaningful.filter((w) => w !== head);
    return { head, others };
}

export function expansionTier(item: string, seed: string): ExpansionTier {
    const { head, others } = seedParts(seed);
    const key = compactText(item);
    if (!key || !head) return 4;
    const hasHead = key.includes(compactText(head));
    const hasOther = others.some((w) => key.includes(compactText(w)));
    if (hasHead && (hasOther || others.length === 0)) return 1;
    if (hasHead) return 2;
    if (hasOther) return 3;
    return 4;
}

/** 표의 구역 제목. 씨앗 문구를 그대로 써서 "왜 여기 묶였는지"가 보이게 한다. */
export function tierHeading(tier: ExpansionTier, seed: string): string {
    const { head, others } = seedParts(seed);
    const core = others.length > 0 ? `${head} ${others[0]}` : head;
    switch (tier) {
        case 1: return `① ${core} 가지 — 주제 그대로`;
        case 2: return `② ${head} 가지 — 주제는 같고 방향이 다름`;
        case 3: return `③ 조금이라도 연관 — 꼬리말만 같음`;
        default: return '④ 새 가지 — 검색광고 연관';
    }
}

/**
 * 상위 제목 가운데 이 검색어를 **정면으로** 다룬 글 수 — 검색어의 어절(2자↑)이
 * 제목에 전부 들어 있으면 정면이다. 황금보드의 exactTitleHits 와 같은 뜻이고, 제목은
 * **실제 블로그 탭 화면**(keyword-frontal) 상위 10개라 노출 순서다. 오픈API 상위로
 * 세면 스팸이 먹어 0/10 이 나온다(실측 2026-09-07 — 실제 화면은 10/10).
 * 8/10 이상이면 초보가 비집을 자리가 없다(보드와 같은 기준).
 */
export const FRONTAL_SATURATION = 8;

export function frontalCount(titles: readonly string[] | undefined, keyword: string): number | null {
    if (!Array.isArray(titles) || titles.length === 0) return null;
    const words = String(keyword || '').split(/\s+/).map(compactText).filter((w) => w.length >= 2);
    if (words.length === 0) return null;
    return titles.filter((title) => {
        const t = compactText(title);
        return words.every((w) => t.includes(w));
    }).length;
}
