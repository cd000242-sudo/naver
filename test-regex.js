// 정규식 로직만 테스트 (API 호출 없이)

const sampleHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta property="og:title" content="캐치웰이 그리는 '함께 더 편리한 일상'">
    <meta property="og:description" content="캐치웰 CX PRO 매직타워 N 자동먼지비움 무선청소기 - 무선 청소기의 새로운 기준">
    <title>캐치웰 CX PRO 매직타워 N 자동먼지비움 무선청소기 : 캐치웰 브랜드스토어</title>
</head>
<body>
    <h1>e9XzvZlXk2_03.jpg</h1>
    <span class="_3oDjSvLfl6">캐치웰 CX PRO 매직타워 N 자동먼지비움 무선청소기</span>
    <script type="application/ld+json">
        {"@type":"Product","name":"캐치웰 CX PRO 매직타워 N 자동먼지비움 무선청소기","price":"299000"}
    </script>
</body>
</html>
`;

console.log('='.repeat(60));
console.log('정규식 테스트 (샘플 HTML)');
console.log('='.repeat(60));

// 테스트할 후보들
const candidates = [
    "e9XzvZlXk2_03.jpg",
    "캐치웰이 그리는 '함께 더 편리한 일상'",
    "캐치웰 CX PRO 매직타워 N 자동먼지비움 무선청소기",
    "캐치웰 : 브랜드스토어"
];

console.log('\n후보별 필터링 결과:\n');

candidates.forEach(candidate => {
    const isStoreName = /브랜드스토어|스마트스토어|smartstore|brand\.naver/i.test(candidate);
    const isTooShort = candidate.length < 10;
    const isImageFilename = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(candidate);
    const isSloganOrCatchphrase =
        /함께|더\s*나은|더\s*편리한|특별한|새로운|최고의|완벽한|일상|가치|행복|라이프|그리는/i.test(candidate) &&
        !/청소기|무선|로봇|에어컨|냉장고|세탁기|드라이기|건조기|PRO|MAX|PLUS|Ultra/i.test(candidate);
    const hasProductFeatures = /[A-Z]{2,}|[0-9]+[가-힣]|PRO|MAX|PLUS|Ultra|무선|자동|매직|청소기|냉장고|세탁기/i.test(candidate);

    console.log(`"${candidate}"`);
    console.log(`  - 스토어명: ${isStoreName ? '❌ 건너뜀' : '✅ 통과'}`);
    console.log(`  - 너무 짧음: ${isTooShort ? '❌ 건너뜀' : '✅ 통과'}`);
    console.log(`  - 이미지파일: ${isImageFilename ? '❌ 건너뜀' : '✅ 통과'}`);
    console.log(`  - 슬로건: ${isSloganOrCatchphrase ? '❌ 건너뜀' : '✅ 통과'}`);
    console.log(`  - 제품특징: ${hasProductFeatures ? '✅ 있음' : '❌ 없음'}`);

    const shouldUse = !isStoreName && !isTooShort && !isImageFilename && !isSloganOrCatchphrase && hasProductFeatures;
    console.log(`  → 최종: ${shouldUse ? '✅ 사용됨' : '❌ 제외됨'}\n`);
});

// JSON-LD에서 제품명 추출 테스트
const jsonLdMatch = sampleHtml.match(/"name"\s*:\s*"([^"]{10,100})"/);
if (jsonLdMatch) {
    console.log('JSON-LD에서 추출된 제품명:', jsonLdMatch[1]);
}
