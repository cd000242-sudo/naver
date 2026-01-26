/**
 * ✅ [2026-01-25 모듈화] 텍스트 포맷팅 유틸리티
 * 
 * 본문 텍스트 정규화 및 미리보기용 포맷팅 함수들
 */

/**
 * 본문을 문단으로 포맷팅 (미리보기용)
 */
export function formatContentForPreview(content: string): string {
    if (!content) return '<p style="color: var(--text-muted); font-style: italic;">본문 내용이 없습니다</p>';

    // ✅ 스마트 문단 분리
    let processedContent = content;

    // 1. 소제목 패턴 감지 및 줄바꿈 추가 (콜론으로 끝나는 짧은 문장)
    // 예: "정부, 쿠팡 사칭 피싱·스미싱 주의 경보 발령:" 
    processedContent = processedContent.replace(/([^.!?\n]{10,80}[:：])\s*(?=[가-힣A-Za-z])/g, '$1\n\n');

    // 2. 문장 끝(마침표, 느낌표, 물음표) + 다음 문장 사이에 줄바꿈이 없으면 추가
    // 최소 2문장이 붙어있을 때만 분리 (150자 이상일 때)
    processedContent = processedContent.replace(/([.!?])\s{0,2}(?=[가-힣A-Z][가-힣a-zA-Z0-9\s,]{50,}[.!?])/g, '$1\n\n');

    // 3. "~요.", "~죠.", "~니다.", "~네요." 등 종결어미 후에 긴 문장이 이어지면 분리
    processedContent = processedContent.replace(/(요\.|죠\.|니다\.|네요\.|습니다\.|어요\.)\s*(?=[가-힣A-Z][가-힣a-zA-Z0-9\s,]{80,})/g, '$1\n\n');

    // 줄바꿈 기준으로 문단 나누기
    const paragraphs = processedContent
        .split(/\n\n+/)  // 빈 줄(2개 이상의 줄바꿈)로 문단 구분
        .map(p => p.trim())
        .filter(p => p.length > 0);

    if (paragraphs.length === 0) {
        // 빈 줄이 없으면 단일 줄바꿈으로 구분
        const lines = processedContent
            .split(/\n/)
            .map(l => l.trim())
            .filter(l => l.length > 0);

        return lines.map(line => formatParagraph(line)).join('');
    }

    return paragraphs.map(para => formatParagraph(para)).join('');
}

/**
 * 읽기 쉬운 본문 텍스트 정규화
 */
export function normalizeReadableBodyText(raw: string): string {
    if (!raw) return '';
    let text = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    text = text.replace(/\u00A0/g, ' ');
    text = text.replace(/\s*실제\s*경험을\s*바탕으로,?\s*/g, ' ');
    text = text.replace(/\s*최신\s*연구\s*결과,?\s*/g, ' ');
    text = text.replace(/\s*전문\s*지식을\s*바탕으로,?\s*/g, ' ');

    // ✅ [2026-01-16] **bold** 마크다운 및 <u>underline</u> HTML 태그 완전 제거
    // 비탐욕적 매칭으로 확실하게 제거 - 3회 반복 실행
    for (let i = 0; i < 3; i++) {
        text = text.replace(/\*\*(.*?)\*\*/g, '$1'); // **bold** 제거
        text = text.replace(/<u\s*>(.*?)<\/u\s*>/gi, '$1'); // <u>underline</u> 제거
    }
    text = text.replace(/\*\*/g, ''); // 남은 ** 완전 제거
    text = text.replace(/<\/?u\s*>/gi, ''); // 남은 <u>, </u> 단독 태그 제거
    text = text.replace(/<\/?(?:b|i|strong|em|mark|span)[^>]*>/gi, ''); // 기타 HTML 태그 제거

    const blocks = text.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);

    // ✅ 소제목 감지 패턴 개선 (다양한 형식 지원)
    const isHeadingLine = (line: string): boolean => {
        const t = line.trim();
        if (!t) return false;

        // 1. 마크다운 헤딩 (#, ##, ### 등)
        if (/^#{1,6}\s/.test(t)) return true;

        // 2. 콜론으로 끝나는 짧은 줄 (60자 이하)
        if (t.length <= 60 && /[:：]$/.test(t)) return true;

        // 3. 📝, 📌, ✅, 🔍 등 이모지로 시작하는 짧은 줄 (70자 이하)
        if (t.length <= 70 && /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}📝📌✅🔍💡🎯⚡🔥💪🚀]/u.test(t)) return true;

        // 4. 번호 + 점/괄호로 시작하는 짧은 줄 (60자 이하)
        if (t.length <= 60 && /^(?:\d+[.)]\s+|[①-⑳]\s*|▶\s*|■\s*|●\s*)/.test(t)) return true;

        // 5. 대괄호로 감싸진 짧은 텍스트 (50자 이하)
        if (t.length <= 50 && /^\[.+\]$/.test(t)) return true;

        return false;
    };

    const normalizeBlock = (block: string): string => {
        const lines = block.split(/\n+/).map(l => l.trim()).filter(Boolean);
        if (lines.length <= 1) return block.trim();

        const out: string[] = [];
        let buf = '';
        const flush = () => {
            const v = buf.trim();
            if (v) out.push(v);
            buf = '';
        };

        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;

            // ✅ 소제목 판별 (개선된 로직)
            if (isHeadingLine(t)) {
                flush();
                out.push(t);
                continue;
            }

            if (!buf) {
                buf = t;
                continue;
            }

            const prev = buf.trim();
            const endsSentence = /[.!?…。]$/.test(prev);
            if (endsSentence) {
                flush();
                buf = t;
            } else {
                buf = `${buf} ${t}`;
            }
        }

        flush();
        return out.join('\n\n');
    };

    const normalized = (blocks.length > 0 ? blocks : [text])
        .map(normalizeBlock)
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return normalized;
}

/**
 * 문단 포맷팅 헬퍼 함수
 */
export function formatParagraph(para: string): string {
    // 소제목(#, ##, ###) 감지
    if (/^#{1,3}\s/.test(para)) {
        const level = (para.match(/^#+/) || [''])[0].length;
        const text = para.replace(/^#{1,3}\s*/, '');
        const fontSize = level === 1 ? '1.3rem' : level === 2 ? '1.1rem' : '1rem';
        return `<h${level + 2} style="font-size: ${fontSize}; font-weight: 700; color: var(--text-strong); margin: 1.5rem 0 0.75rem 0; padding-bottom: 0.5rem; border-bottom: 2px solid var(--border-light);">${text}</h${level + 2}>`;
    }

    // 소제목 패턴 감지 (콜론으로 끝나고 50자 이하인 경우)
    const headingMatch = para.match(/^([^.!?\n]{5,50}[:：])\s*(.*)$/s);
    if (headingMatch && headingMatch[2].length > 20) {
        const heading = headingMatch[1];
        const body = headingMatch[2];
        return `
      <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--primary); margin: 1.5rem 0 0.75rem 0; padding-bottom: 0.5rem; border-bottom: 2px solid var(--border-light);">${heading}</h4>
      <p style="margin-bottom: 1.2rem; line-height: 1.8; text-indent: 0.5rem;">${body}</p>
    `;
    }

    // 일반 문단
    return `<p style="margin-bottom: 1.2rem; line-height: 1.8; text-indent: 0.5rem;">${para}</p>`;
}
