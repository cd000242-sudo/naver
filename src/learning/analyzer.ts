import dotenv from 'dotenv';
import { PatternAnalyzer } from './patternAnalyzer.js';

// 환경변수 로드 및 검증
const env = dotenv.config();
if (env.error) {
  console.warn('⚠️ .env 파일을 찾을 수 없습니다. 기본 설정을 사용합니다.');
}

async function main() {
  console.log('🚀 [System] 패턴 분석 및 학습을 시작합니다...');
  
  const analyzer = new PatternAnalyzer();

  // ✅ 우아한 종료 (Ctrl+C 대응) - 학습 중 강제 종료 시 데이터 보호
  process.on('SIGINT', () => {
    console.log('\n🛑 [System] 강제 종료 감지! 정리 작업을 수행합니다...');
    // 필요하다면 analyzer.save() 같은 저장 로직을 여기에 추가
    process.exit(0);
  });

  // 분석 실행
  await analyzer.analyzeAndLearn();

  console.log('✅ [System] 모든 패턴 학습이 성공적으로 완료되었습니다.');
}

// 실행 및 에러 핸들링
main()
  .catch((error) => {
    console.error('❌ [Error] 패턴 학습 중 치명적 오류 발생:', error);
    process.exit(1); // 에러 상황에서는 명시적 종료 필요
  });
  // finally에서 process.exit(0)를 제거하여, 남은 I/O 작업이 마무리되도록 함