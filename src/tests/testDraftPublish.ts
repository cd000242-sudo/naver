import { NaverBlogAutomation } from '../naverBlogAutomation.js';
import dotenv from 'dotenv';

dotenv.config();

async function testDraftPublish(): Promise<void> {
  console.log('🧪 임시 발행 테스트를 시작합니다...\n');

  // 환경변수에서 네이버 계정 정보 가져오기
  const naverId = process.env.NAVER_ID;
  const naverPassword = process.env.NAVER_PASSWORD;

  if (!naverId || !naverPassword) {
    console.error('❌ 오류: 네이버 아이디와 비밀번호가 설정되지 않았습니다.');
    console.error('   .env 파일에 NAVER_ID와 NAVER_PASSWORD를 설정하거나');
    console.error('   환경변수로 설정해주세요.');
    process.exit(1);
  }

  console.log(`✅ 네이버 계정: ${naverId ? '설정됨' : '없음'}`);
  console.log('📝 테스트 제목: [임시발행 테스트] 자동화 테스트 포스트');
  console.log('📝 테스트 내용: 이것은 임시 발행 테스트입니다.\n');

  const automation = new NaverBlogAutomation(
    {
      naverId,
      naverPassword,
      headless: false, // 브라우저를 보면서 테스트
      slowMo: 10, // 천천히 실행 (디버깅용)
    },
    (message) => console.log(`[Automation] ${message}`),
  );

  try {
    await automation.run({
      title: '[임시발행 테스트] 자동화 테스트 포스트',
      content: '이것은 임시 발행 테스트입니다.\n\n자동화 시스템이 정상적으로 작동하는지 확인하기 위한 테스트 포스트입니다.',
      lines: 3,
      hashtags: ['테스트', '자동화', '임시발행'],
      publishMode: 'draft', // 임시 발행 모드
    });

    console.log('\n✅ 임시 발행 테스트가 성공적으로 완료되었습니다!');
    console.log('💡 네이버 블로그에서 임시저장된 글을 확인해주세요.');
  } catch (error) {
    console.error('\n❌ 임시 발행 테스트가 실패했습니다.');
    console.error('오류:', (error as Error).message);
    if ((error as Error).stack) {
      console.error('\n스택 트레이스:');
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

testDraftPublish().catch((error) => {
  console.error('❌ 예상치 못한 오류:', error);
  process.exit(1);
});









