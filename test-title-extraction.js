// test-title-extraction-v3.js
const productName = '[BRAUN] 브라운 전기면도기 시리즈9 PRO Plus 울트라 씬 9665cc 그라파이트';

function extractCoreProductName(fullName) {
    let core = fullName;

    // 0. 스트리밍/라이브 접두사 제거
    core = core.replace(/^(LIVE|라이브|생방송)\s*/gi, '').trim();

    // 대괄호 브랜드 접두사 제거
    core = core.replace(/^\[[^\]]+\]\s*/g, '').trim();

    // 1. 모델번호 패턴 제거
    core = core.replace(/[A-Z]{1,4}[\d]{2,}[A-Z\d\-]*/gi, '').trim();
    core = core.replace(/[\d]{3,}[A-Z]{1,4}[\d\-]*/gi, '').trim();
    core = core.replace(/[A-Z]{2,}-[A-Z\d]+/gi, '').trim();
    core = core.replace(/\d{3,}[a-zA-Z]{1,3}\b/g, '').trim();

    // 2. 영문 색상만 \b로 처리
    const colorKeywords = [
        '화이트', '블랙', '그레이', '실버', '골드', '네이비', '베이지', '브라운',
        '핑크', '블루', '레드', '그린', '퍼플', '오렌지', '민트', '아이보리',
        'white', 'black', 'gray', 'silver', 'gold', 'navy', 'beige', 'brown',
        '코랄', '라벤더', '차콜', '크림', '버건디', '그라파이트', '미스틱'
    ];
    for (const color of colorKeywords.filter(c => /^[a-zA-Z]+$/.test(c))) {
        core = core.replace(new RegExp(`\\b${color}\\b`, 'gi'), '').trim();
    }

    // 3. 등급/용량/사이즈 키워드 제거
    const removePatterns = [
        /\d+등급/g, /\d+[LlKk][Gg]?/g, /\d+[Ww]/g, /\d+인치/g,
        /\d+[Mm][Mm]/g, /\(\d+[^\)]*\)/g, /\[\d+[^\]]*\]/g,
        /\d+[Gg][Bb]/gi, /\d+[Tt][Bb]/gi,
    ];
    for (const pattern of removePatterns) {
        core = core.replace(pattern, '').trim();
    }

    // 4. 수식어 + 한글 색상 통합 (공백 기반 필터링)
    // 브라운 제외 (BRAUN 브랜드 보호)
    const genericWords = new Set([
        '일체형', '분리형', '올인원', '프리미엄', '에디션', '스페셜', '리미티드',
        '신형', '신제품', '최신형', '2024', '2025', '2026',
        '대학생', '사무용', '게이밍', '업무용', '학생용', '가정용', '기업용',
        '2IN1', '2in1', 'AI', 'PRO', 'PLUS', 'ULTRA', 'MAX', 'LITE',
        '울트라', '플러스', '프로', '씬', 'Plus',
        '노트북', '데스크탑', '태블릿', '세탁기', '건조기', '세탁기건조기',
        // 한글 색상 (브라운 제외!)
        '화이트', '블랙', '그레이', '실버', '골드', '네이비', '베이지',
        '핑크', '블루', '레드', '그린', '퍼플', '오렌지', '민트', '아이보리',
        '코랄', '라벤더', '차콜', '크림', '버건디', '그라파이트', '미스틱'
    ]);

    // 첫 번째 단어는 브랜드명일 가능성이 높으므로 필터링 제외
    const wordsToFilter = core.split(/\s+/);
    const firstWord = wordsToFilter[0] || '';
    const remainingWords = wordsToFilter.slice(1);
    const filteredRemaining = remainingWords.filter(word =>
        !genericWords.has(word) && !genericWords.has(word.toUpperCase()) && !genericWords.has(word.toLowerCase())
    );
    core = [firstWord, ...filteredRemaining].join(' ').trim();

    // 5. 연속 공백 정리
    core = core.replace(/\s+/g, ' ').trim();

    // 6. 너무 짧으면 원본 사용
    if (core.length < 5 || core.split(/\s+/).length < 2) {
        const originalWords = fullName
            .replace(/^(LIVE|라이브|생방송)\s*/gi, '')
            .replace(/^\[[^\]]+\]\s*/g, '')
            .split(/\s+/)
            .filter(w => !w.match(/[A-Z]{2,}[\d]{2,}/i))
            .slice(0, 4);
        core = originalWords.join(' ');
    }

    // 7. 최대 5단어
    const finalWords = core.split(/\s+/).slice(0, 5);
    core = finalWords.join(' ');

    return core;
}

console.log('=== Input ===');
console.log(productName);
console.log('');
console.log('=== Result ===');
const result = extractCoreProductName(productName);
console.log(result);
console.log('');
console.log('=== Expected ===');
console.log('브라운 전기면도기 시리즈9');
