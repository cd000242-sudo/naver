/**
 * 프로덕션 빌드 시 console.log 최적화 스크립트
 * ✅ 배포 버전에서도 디버깅을 위해 중요한 로그는 유지
 */
const fs = require('fs');
const path = require('path');

const rendererPath = path.join(__dirname, '../dist/public/renderer.js');

if (fs.existsSync(rendererPath)) {
  let content = fs.readFileSync(rendererPath, 'utf-8');

  const originalSize = content.length;

  // ✅ 중요한 디버그 로그는 유지 (배포 버전에서도 문제 파악 가능)
  // 유지할 로그 패턴:
  // - [API], [Gemini], [OpenAI], [Claude] - API 호출 관련
  // - [AutoLoad], [Settings], [Setup] - 초기화 관련
  // - [Error], [Warning], [Failed] - 에러 관련
  // - [타임아웃], [재시도], [실패] - 문제 진단 관련
  // - [크롤링], [이미지], [생성] - 주요 작업 관련

  // ✅ 일반적인 console.log만 제거 (중요한 로그는 유지)
  // 패턴: console.log(...) 중에서 중요한 키워드가 없는 것만 제거
  const importantPatterns = [
    /\[API\]/i,
    /\[Gemini\]/i,
    /\[OpenAI\]/i,
    /\[Claude\]/i,
    /\[AutoLoad\]/i,
    /\[Settings\]/i,
    /\[Setup\]/i,
    /\[Error\]/i,
    /\[Warning\]/i,
    /\[Failed\]/i,
    /타임아웃/i,
    /재시도/i,
    /실패/i,
    /크롤링/i,
    /이미지/i,
    /생성/i,
    /\[FullAuto\]/i,
    /\[ImagePrompt\]/i,
    /\[Puppeteer\]/i,
    /\[네이버/i,
    /\[Pexels\]/i,
    /\[DALL-E\]/i,
    /\[AIAssistant\]/i,
    /\[AI Assistant\]/i,
    /\[MasterAgent\]/i,
    /성공/i,
    /완료/i,
    /시작/i,
    /오류/i,
    /에러/i,
  ];

  // ⚠️ 정규식 기반 console.log 제거는 중첩 괄호 문제로 코드 손상 위험
  // 안정성을 위해 console.log 최적화를 비활성화하고 원본 유지
  // content = content.replace(/console\.log\(([^)]*)\);/g, (match, args) => {
  //   const hasImportantPattern = importantPatterns.some(pattern => pattern.test(args));
  //   if (hasImportantPattern) {
  //     return match;
  //   }
  //   return '/* removed */';
  // });

  // ✅ 안전하게 원본 유지
  console.log('ℹ️ console.log 최적화 스킵 (안정성 우선)');

  console.log(`✅ 파일 처리 완료 (최적화 비활성화)`)
  console.log(`   파일 크기: ${(originalSize / 1024).toFixed(2)} KB`)
  console.log(`   ✅ 모든 console.log 유지 (디버깅 가능)`);
} else {
  console.log('⚠️ renderer.js 파일을 찾을 수 없습니다.');
}

