// src/renderer/modules/issueCollectArticle.ts
// What the image tab hands the collector besides the title: the intro and the whole article body.
// Inline bundle = single scope → every top-level identifier is prefixed issueCollect*.

const ISSUE_COLLECT_INTRO_MAX = 2000;
const ISSUE_COLLECT_BODY_MAX = 20000;

/** Shown when no body could be read — the collector then analyses the title alone. */
export const ISSUE_COLLECT_TITLE_ONLY_HINT = '제목만으로 분석합니다 — 본문과 소제목까지 넣으면 더 정확합니다 (글 생성 후 수집하거나 통합 탭에 본문을 넣어 주세요).';

function issueCollectUnifiedText(): string {
    const bodyEl = document.getElementById('unified-generated-content') as HTMLTextAreaElement | null;
    return String(bodyEl?.value || '').trim();
}

/** 사건 맥락이 가장 진한 서론을 별도로 넘긴다. */
export function issueCollectReadIntro(): string | undefined {
    const sc = (window as any).currentStructuredContent;
    const intro = String(sc?.introduction || sc?.intro || '').trim();
    if (intro) return intro.slice(0, ISSUE_COLLECT_INTRO_MAX);
    // 서론이 비면 반자동 편집 본문 앞부분으로 대체 (사용자가 수정한 최신 텍스트)
    const text = issueCollectUnifiedText();
    return text ? text.slice(0, ISSUE_COLLECT_INTRO_MAX) : undefined;
}

/**
 * The article as one text: the user's latest edited body when present, else intro + every heading
 * paragraph + closing from the structured content. Undefined when nothing was written yet.
 */
export function issueCollectReadArticleBody(): string | undefined {
    const edited = issueCollectUnifiedText();
    if (edited) return edited.slice(0, ISSUE_COLLECT_BODY_MAX);
    const sc = (window as any).currentStructuredContent;
    if (!sc) return undefined;
    const parts: string[] = [String(sc.introduction || sc.intro || '')];
    for (const h of Array.isArray(sc.headings) ? sc.headings : []) {
        parts.push(String(h?.title || ''), String(h?.content || h?.body || h?.summary || ''));
    }
    parts.push(String(sc.conclusion || ''));
    const text = parts.map((p) => p.trim()).filter(Boolean).join('\n');
    return text ? text.slice(0, ISSUE_COLLECT_BODY_MAX) : undefined;
}
