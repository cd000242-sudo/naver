/**
 * ✅ [2026-01-25 모듈화] Veo 프롬프트 안전화 유틸리티
 * 
 * Veo 영상 생성을 위한 프롬프트 안전화 및 검증 함수들
 */

/**
 * Veo 안전 프롬프트 생성
 * 실존 인물/유명인 실명으로 인한 RAI 차단 및 오디오 관련 차단 방지
 */
export function buildVeoSafePrompt(originalPrompt: string): { prompt: string; changed: boolean; reason: string } {
    const original = String(originalPrompt || '').trim();
    if (!original) {
        return { prompt: '', changed: false, reason: '' };
    }

    // ✅ 실존 인물/유명인 실명으로 인한 RAI 차단을 피하기 위한 보정
    // - 너무 공격적으로 바꾸면 상품명까지 훼손될 수 있어서, "비교/vs/콤마" 등 인물 비교 문맥에서만 제한적으로 익명화
    const hasCompareContext = /\b(vs\.?|versus)\b/i.test(original) || /비교|대결|맞대결|~?와\s*비교|~?과\s*비교/i.test(original) || original.includes(',');
    let prompt = original;
    let changed = false;
    let reason = '';

    if (hasCompareContext) {
        // 한글 2~4자 토큰(이름일 가능성이 높은 길이)을 비교/나열 문맥에서만 익명화
        // 예) "이강인, 부스케츠와 비교" => "익명의 축구 선수, 익명의 레전드 미드필더와 비교"
        const tokens = prompt.split(/(\s+|,|\.|\\?|!|:|;|\(|\)|\[|\]|\{|\}|\"|\'|\n)/g);
        const replaced = tokens.map((t) => {
            const s = String(t || '');
            if (!/^[가-힣]{2,4}$/.test(s)) return s;
            // '제품' 문맥에서 흔한 단어를 무작정 바꾸지 않도록 아주 기본적인 예외만 둠
            if (/^(제품|상품|리뷰|후기|가격|성능|장점|단점|추천|비교|사용|구매)$/.test(s)) return s;
            changed = true;
            return '익명 인물';
        });
        if (changed) {
            prompt = replaced.join('');
            reason = '실존 인물 이름으로 인한 영상 생성 차단을 피하기 위해 익명화 처리했습니다.';
        }
    }

    const disclaimer = 'No real names. No resemblance to any real person. Fictional characters only.';
    if (!prompt.toLowerCase().includes('no resemblance to any real person')) {
        prompt = `${prompt}\n\n${disclaimer}`.trim();
        changed = true;
        if (!reason) reason = '안전 필터(초상권/실존 인물) 차단을 피하기 위해 안전 문구를 추가했습니다.';
    }

    const audioTerms = new RegExp(
        [
            'audio',
            'speech',
            'voice',
            'voiceover',
            'narration',
            'music',
            'singing',
            'lyrics',
            'dialogue',
            'soundtrack',
            'microphone',
            'podcast',
            'interview',
            'radio',
            'asmr',
            'whisper',
            '오디오',
            '음성',
            '목소리',
            '나레이션',
            '내레이션',
            '음악',
            '노래',
            '가사',
            '대화',
            '인터뷰',
            '라디오',
            '속삭',
            'ASMR',
        ].join('|'),
        'gi'
    );
    if (audioTerms.test(prompt)) {
        prompt = prompt.replace(audioTerms, '').replace(/[\s\u00A0]+/g, ' ').trim();
        changed = true;
        if (!reason) {
            reason = '오디오/대화 관련 문구로 인한 안전 필터 차단을 피하기 위해 프롬프트를 정리했습니다.';
        } else if (!reason.includes('오디오')) {
            reason = `${reason} (오디오 문구 정리 포함)`;
        }
    }

    const audioDisclaimer = 'Silent video. No audio, no speech, no voiceover, no narration, no music.';
    if (!/\bno audio\b|\bsilent video\b/i.test(prompt)) {
        prompt = `${prompt}\n\n${audioDisclaimer}`.trim();
        changed = true;
        if (!reason) {
            reason = '오디오 처리/안전 필터로 인한 차단을 피하기 위해 무음 지시를 추가했습니다.';
        } else if (!reason.includes('무음')) {
            reason = `${reason} (무음 지시 포함)`;
        }
    }

    return { prompt, changed, reason };
}

/**
 * Veo 오디오 차단 메시지인지 판별
 */
export function isVeoAudioBlockedMessage(message: string): boolean {
    const msg = String(message || '').toLowerCase();
    if (!msg) return false;
    if (!msg.includes('audio')) return false;
    return (
        msg.includes('safety') ||
        msg.includes('filter') ||
        msg.includes('could not create') ||
        msg.includes('encountered an issue')
    );
}
