/**
 * 썸네일 프롬프트 구성 & 텍스트 오버레이 흐름 검증 스크립트
 * 
 * 검증 항목:
 * 1. 프롬프트 내 제목 반복 횟수 (2회 이하인지)
 * 2. 중복 방지 지시 포함 여부
 * 3. 한글 텍스트 품질 지시 포함 여부
 * 4. nano-banana-pro에서 Sharp 오버레이 스킵 여부
 * 5. 연속 발행 흐름에서 이중 썸네일 생성 여부
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');

// ===== 유틸 =====
function readFile(relPath) {
  return fs.readFileSync(path.join(SRC, relPath), 'utf8');
}

function countOccurrences(text, search) {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}

let passed = 0;
let failed = 0;
const results = [];

function assert(testName, condition, detail) {
  if (condition) {
    results.push({ name: testName, status: '✅ PASS', detail });
    passed++;
  } else {
    results.push({ name: testName, status: '❌ FAIL', detail });
    failed++;
  }
}

// ===== 테스트 1: 프롬프트 내 fullTitle 반복 횟수 =====
console.log('\n🔍 테스트 1: promptBuilder.ts — 프롬프트 내 제목 반복 횟수');
const promptBuilder = readFile('image/promptBuilder.ts');

// buildThumbnailWithTextPrompt 함수 추출
const funcMatch = promptBuilder.match(/private static buildThumbnailWithTextPrompt[\s\S]*?return `([\s\S]*?)`;/);
if (funcMatch) {
  const promptTemplate = funcMatch[1];
  const titleCount = countOccurrences(promptTemplate, '${fullTitle}');
  assert(
    '프롬프트 내 제목 반복 ≤ 2회',
    titleCount <= 2,
    `fullTitle 반복: ${titleCount}회 (이전: 4회)`
  );
} else {
  assert('프롬프트 함수 추출', false, 'buildThumbnailWithTextPrompt 함수를 찾을 수 없음');
}

// ===== 테스트 2: 중복 방지 지시 포함 =====
console.log('🔍 테스트 2: 중복 방지 지시 포함 여부');
assert(
  '"EXACTLY" 또는 "ONCE" 지시 포함',
  promptBuilder.includes('EXACTLY') && promptBuilder.includes('ONCE'),
  '프롬프트에 EXACTLY + ONCE 지시 존재'
);

assert(
  '"DO NOT" 중복 방지 지시 포함',
  promptBuilder.includes('DO NOT render') || promptBuilder.includes('DO NOT place'),
  '중복 렌더링/배치 금지 지시 존재'
);

// ===== 테스트 3: 한글 텍스트 품질 지시 =====
console.log('🔍 테스트 3: 한글 텍스트 품질 지시');
assert(
  '글자 간격(spacing) 지시 포함',
  promptBuilder.includes('spacing') || promptBuilder.includes('separated'),
  '글자 간격 관련 지시 존재'
);

assert(
  '텍스트 겹침 방지 지시 포함',
  promptBuilder.includes('overlap'),
  '"overlap" 관련 지시 존재'
);

// ===== 테스트 4: nano-banana-pro Sharp 오버레이 스킵 =====
console.log('🔍 테스트 4: imageGenerator.ts — nano-banana-pro Sharp 오버레이 스킵');
const imageGen = readFile('imageGenerator.ts');

assert(
  'isKoreanTextSupportedEngine 체크 존재',
  imageGen.includes('isKoreanTextSupportedEngine'),
  'applyKoreanTextOverlayIfNeeded에서 엔진 체크 후 스킵'
);

// isKoreanTextSupportedEngine 함수 확인
const engineCheck = imageGen.match(/function isKoreanTextSupportedEngine[\s\S]*?}/);
if (engineCheck) {
  assert(
    'nano-banana-pro가 한글 지원 엔진으로 등록',
    engineCheck[0].includes('nano-banana-pro') || engineCheck[0].includes('nano-banana'),
    '나노바나나프로는 Sharp 오버레이 스킵 대상'
  );
} else {
  // 다른 파일에 있을 수 있음
  const allFiles = ['image/nanoBananaProGenerator.ts', 'image/imageUtils.ts'];
  let found = false;
  for (const f of allFiles) {
    try {
      const content = readFile(f);
      if (content.includes('isKoreanTextSupportedEngine')) {
        found = true;
        break;
      }
    } catch {}
  }
  assert(
    'isKoreanTextSupportedEngine 함수 존재',
    imageGen.includes('isKoreanTextSupportedEngine') || found,
    '엔진 체크 함수가 프로젝트 내 존재'
  );
}

// ===== 테스트 5: 연속 발행 흐름에서 이중 썸네일 생성 여부 =====
console.log('🔍 테스트 5: fullAutoFlow.ts — 이중 썸네일 생성 방지');
try {
  const fullAutoFlow = readFile('renderer/modules/fullAutoFlow.ts');
  
  // finalImages.length 체크 존재 확인
  assert(
    'finalImages.length === 0 체크 존재',
    fullAutoFlow.includes('finalImages.length === 0') || fullAutoFlow.includes('finalImages.length =='),
    'fullAutoFlow에 이미지 존재 여부 체크 후 스킵 로직 존재'
  );
} catch (err) {
  assert('fullAutoFlow.ts 읽기', false, err.message);
}

// ===== 테스트 6: main.ts — automation:generateImages에 추가 Sharp 오버레이 없음 =====
console.log('🔍 테스트 6: main.ts — automation:generateImages에 추가 Sharp 오버레이 없음');
const mainTs = readFile('../src/main.ts');

// automation:generateImages 핸들러 범위 추출 (대략)
const genImagesIdx = mainTs.indexOf("'automation:generateImages'");
if (genImagesIdx !== -1) {
  // 핸들러 범위를 대략 400줄 정도로 잡음
  const handlerBlock = mainTs.substring(genImagesIdx, genImagesIdx + 12000);
  const hasCreateProductThumbnail = handlerBlock.includes('createProductThumbnail');
  const hasThumbnailService = handlerBlock.includes('thumbnailService');
  
  assert(
    'automation:generateImages에 createProductThumbnail 호출 없음',
    !hasCreateProductThumbnail,
    '이미지 생성 IPC 핸들러에서 추가 텍스트 오버레이 없음'
  );
  
  assert(
    'automation:generateImages에 thumbnailService 호출 없음',
    !hasThumbnailService,
    '이미지 생성 IPC 핸들러에서 썸네일 서비스 미사용'
  );
}

// ===== 결과 출력 =====
console.log('\n' + '='.repeat(60));
console.log(`📊 검증 결과: ${passed}/${passed + failed} 통과`);
console.log('='.repeat(60));
results.forEach(r => {
  console.log(`${r.status} ${r.name}`);
  console.log(`   → ${r.detail}`);
});
console.log('='.repeat(60));

if (failed > 0) {
  console.log(`\n⚠️ ${failed}개 테스트 실패! 추가 확인 필요.`);
  process.exit(1);
} else {
  console.log('\n✅ 모든 코드 레벨 검증 통과!');
  console.log('⚠️ 단, AI 이미지 생성의 비결정적 특성으로 인해');
  console.log('   한글 텍스트 렌더링 품질은 실제 이미지 생성 테스트 필요.');
  process.exit(0);
}
