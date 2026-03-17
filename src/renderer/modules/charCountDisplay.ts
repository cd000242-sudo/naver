// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 글자수 표시 모듈
// renderer.ts에서 추출 — 본문 글자수 카운트 + 연령대별 목표
// ═══════════════════════════════════════════════════════════════════

export function initCharCountDisplay(): void {
    const contentTextarea = document.getElementById('post-content') as HTMLTextAreaElement;
    const charCountSpan = document.getElementById('content-char-count') as HTMLSpanElement;
    const targetCharCountDisplay = document.getElementById('target-char-count-display') as HTMLSpanElement;
    const targetAgeSelect = document.getElementById('target-age') as HTMLSelectElement;

    // 연령대별 목표 글자수
    const getTargetCharsForAge = (targetAge: string): number => {
        switch (targetAge) {
            case '20s':
                return 3000;
            case '30s':
                return 4250;
            case '40s':
            case '50s':
                return 5500;
            case 'all':
            default:
                return 3000;
        }
    };

    // 글자수 업데이트 함수
    const updateCharCount = (): void => {
        if (!contentTextarea || !charCountSpan) return;

        const text = contentTextarea.value;
        const charCount = text.replace(/\s+/g, '').length;
        charCountSpan.textContent = `${charCount.toLocaleString()}자`;

        // 목표 글자수 표시
        if (targetCharCountDisplay && targetAgeSelect) {
            const targetAge = targetAgeSelect.value;
            const targetRange = targetAge === '20s' ? '2,500~3,500자'
                : targetAge === '30s' ? '3,500~5,000자'
                    : targetAge === '40s' || targetAge === '50s' ? '4,500~6,500자'
                        : '2,000자 이상';

            targetCharCountDisplay.textContent = `(목표: ${targetRange})`;

            // 목표 달성 여부에 따라 색상 변경
            const targetChars = getTargetCharsForAge(targetAge);
            if (charCount >= targetChars * 0.9) {
                charCountSpan.style.color = 'var(--text-strong)';
            } else if (charCount >= targetChars * 0.7) {
                charCountSpan.style.color = 'var(--text-gold)';
            } else {
                charCountSpan.style.color = 'var(--text-muted)';
            }
        }
    };

    // 본문 입력 시 글자수 업데이트
    if (contentTextarea) {
        contentTextarea.addEventListener('input', updateCharCount);
        contentTextarea.addEventListener('paste', () => {
            setTimeout(updateCharCount, 10);
        });
        updateCharCount();
    }

    // 연령대 변경 시 목표 글자수 업데이트
    if (targetAgeSelect && targetCharCountDisplay) {
        targetAgeSelect.addEventListener('change', updateCharCount);
        updateCharCount();
    }
}
