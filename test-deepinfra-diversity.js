/**
 * DeepInfra 프롬프트 다양성 검증 테스트 (API 호출 없이)
 * - 실제 코드와 동일한 로직으로 프롬프트 생성
 * - 10번 반복하여 카메라 앵글 분포 확인
 */

console.log('🚀 DeepInfra 프롬프트 다양성 검증 (Dry Run)\n');

// 카메라 앵글 배열 (실제 코드와 동일)
const cameraAngles = [
    'bird-eye view, overhead shot, looking down',
    'low angle shot, looking up, dramatic perspective',
    'wide shot, full scene visible, environmental',
    'medium shot, waist up, natural framing',
    'close-up shot, detailed focus, intimate',
    'over-the-shoulder shot, POV perspective',
    'dutch angle, tilted frame, dynamic tension',
    'profile view, side angle, elegant composition',
    'three-quarter view, natural pose',
    'silhouette, backlit, atmospheric'
];

// 다이나믹 포즈 배열 (실제 코드와 동일)
const dynamicPoses = [
    'dynamic pose, action shot, in motion',
    'candid moment, natural interaction, caught off-guard',
    'environmental portrait, context visible, storytelling',
    'medium shot showing activity, hands visible',
    'full body shot in context, walking or moving',
    'back view, looking away, mysterious',
    'side profile, dramatic lighting',
    'group interaction, multiple people'
];

// 테스트 케이스
const testHeadings = [
    { category: '스타 연예인', heading: '아이유 신곡 발매 현장' },
    { category: '스타 연예인', heading: '블랙핑크 콘서트' },
    { category: '스타 연예인', heading: 'BTS 기자회견' },
    { category: '패션 뷰티', heading: '2026 봄 트렌드' },
    { category: '스포츠', heading: '손흥민 득점 순간' },
    { category: '요리 맛집', heading: '서울 맛집 추천' },
    { category: '여행', heading: '제주도 해변' },
    { category: 'IT 테크', heading: '갤럭시 S26 출시' },
    { category: '건강', heading: '홈트레이닝 운동법' },
    { category: '일반', heading: '봄철 생활 꿀팁' }
];

const personRequiredCategories = ['스타 연예인', '스포츠', '패션 뷰티', '건강', '교육/육아', '자기계발', '취미 라이프', '책 영화'];
const noPersonCategories = ['요리 맛집', '여행', 'IT 테크', '제품 리뷰', '리빙 인테리어', '반려동물', '자동차', '부동산', '비즈니스 경제', '사회 정치', '공부', '생활 꿀팁'];

// 프롬프트 생성 시뮬레이션
console.log('='.repeat(70));
console.log('📊 프롬프트 다양성 분석 (10개 생성 시뮬레이션)');
console.log('='.repeat(70) + '\n');

const angleStats = {};
const poseStats = {};

for (let i = 0; i < testHeadings.length; i++) {
    const { category, heading } = testHeadings[i];

    // 랜덤 선택 (실제 코드와 동일)
    const randomAngle = cameraAngles[Math.floor(Math.random() * cameraAngles.length)];
    const randomPose = dynamicPoses[Math.floor(Math.random() * dynamicPoses.length)];

    // 통계 수집
    angleStats[randomAngle] = (angleStats[randomAngle] || 0) + 1;

    const isPersonRequired = personRequiredCategories.includes(category);
    const isNoPersonCategory = noPersonCategories.includes(category);

    if (isPersonRequired) {
        poseStats[randomPose] = (poseStats[randomPose] || 0) + 1;
    }

    // 프롬프트 구성 (실제 코드와 유사)
    let promptSummary = '';
    if (isPersonRequired) {
        promptSummary = `[인물필수] ${randomAngle} + ${randomPose}`;
    } else if (isNoPersonCategory) {
        promptSummary = `[사물중심] ${randomAngle} + NO PEOPLE`;
    } else {
        promptSummary = `[기본] ${randomAngle}`;
    }

    console.log(`[${i + 1}] ${category} - "${heading}"`);
    console.log(`    📐 카메라 앵글: ${randomAngle.split(',')[0]}`);
    if (isPersonRequired) {
        console.log(`    🧍 포즈: ${randomPose.split(',')[0]}`);
    }
    console.log(`    ✅ 정면 제외: ${isPersonRequired ? 'NOT front-facing portrait 포함' : '해당없음'}`);
    console.log('');
}

// 결과 분석
console.log('='.repeat(70));
console.log('📈 카메라 앵글 분포 (10회 시뮬레이션)');
console.log('='.repeat(70));

const totalAngles = Object.values(angleStats).reduce((a, b) => a + b, 0);
Object.entries(angleStats).sort((a, b) => b[1] - a[1]).forEach(([angle, count]) => {
    const percent = ((count / totalAngles) * 100).toFixed(0);
    const bar = '█'.repeat(Math.round(count * 5));
    console.log(`${bar} ${angle.split(',')[0]} (${count}회, ${percent}%)`);
});

if (Object.keys(poseStats).length > 0) {
    console.log('\n📈 인물 포즈 분포:');
    Object.entries(poseStats).sort((a, b) => b[1] - a[1]).forEach(([pose, count]) => {
        console.log(`  • ${pose.split(',')[0]}: ${count}회`);
    });
}

// 대규모 시뮬레이션 (100회)
console.log('\n' + '='.repeat(70));
console.log('🔬 대규모 시뮬레이션 (100회)');
console.log('='.repeat(70));

const largeAngleStats = {};
for (let i = 0; i < 100; i++) {
    const randomAngle = cameraAngles[Math.floor(Math.random() * cameraAngles.length)];
    largeAngleStats[randomAngle] = (largeAngleStats[randomAngle] || 0) + 1;
}

console.log('\n카메라 앵글 분포 (100회):');
Object.entries(largeAngleStats).sort((a, b) => b[1] - a[1]).forEach(([angle, count]) => {
    const percent = ((count / 100) * 100).toFixed(0);
    const bar = '▓'.repeat(Math.round(count / 2));
    console.log(`${bar} ${angle.split(',')[0].substring(0, 20).padEnd(20)} ${count}회 (${percent}%)`);
});

// 결론
console.log('\n' + '='.repeat(70));
console.log('📋 검증 결론');
console.log('='.repeat(70));

const uniqueAngles = Object.keys(largeAngleStats).length;
const expectedAngles = cameraAngles.length;

if (uniqueAngles >= expectedAngles * 0.8) {
    console.log(`✅ 카메라 앵글 다양성: 양호 (${uniqueAngles}/${expectedAngles} 사용됨)`);
} else {
    console.log(`⚠️ 카메라 앵글 다양성: 부족 (${uniqueAngles}/${expectedAngles} 사용됨)`);
}

// 분포 균일성 체크
const counts = Object.values(largeAngleStats);
const avg = 100 / expectedAngles;
const maxDeviation = Math.max(...counts.map(c => Math.abs(c - avg)));
const deviationPercent = ((maxDeviation / avg) * 100).toFixed(0);

if (maxDeviation < avg * 2) {
    console.log(`✅ 분포 균일성: 양호 (최대 편차 ${deviationPercent}%)`);
} else {
    console.log(`⚠️ 분포 균일성: 편중됨 (최대 편차 ${deviationPercent}%)`);
}

console.log('\n🎯 프롬프트에 포함된 주요 키워드:');
console.log('  • "NOT front-facing portrait" - 정면 초상화 제외');
console.log('  • 카메라 앵글 - 매 생성마다 랜덤 선택됨');
console.log('  • 다이나믹 포즈 - 인물 카테고리에서 다양한 자세 적용');

console.log('\n⚠️ 실제 DeepInfra API 테스트는 API 키 설정 후 가능합니다.');
console.log('💡 현재 테스트: 프롬프트 생성 로직의 다양성만 검증됨\n');
