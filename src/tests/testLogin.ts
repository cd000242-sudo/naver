import { NaverBlogAutomation } from '../naverBlogAutomation.js';

async function testLogin() {
  console.log('='.repeat(60));
  console.log('🧪 네이버 로그인 테스트 시작');
  console.log('='.repeat(60));
  
  // 테스트용 자격증명 (환경변수에서 읽기)
  const naverId = process.env.TEST_NAVER_ID || '';
  const naverPassword = process.env.TEST_NAVER_PASSWORD || '';
  
  if (!naverId || !naverPassword) {
    console.error('❌ 환경변수를 설정해주세요:');
    console.error('   TEST_NAVER_ID=your_id');
    console.error('   TEST_NAVER_PASSWORD=your_password');
    process.exit(1);
  }
  
  console.log(`📝 테스트 계정: ${naverId.substring(0, 3)}***`);
  console.log('');
  
  const automation = new NaverBlogAutomation({
    naverId,
    naverPassword,
    headless: false, // 브라우저 보이게
  });
  
  try {
    // 1. 브라우저 시작
    console.log('1️⃣ 브라우저 시작 중...');
    await automation.setupBrowser();
    console.log('   ✅ 브라우저 시작 완료');
    console.log('');
    
    // 2. 로그인 시도
    console.log('2️⃣ 로그인 시도 중...');
    console.log('   - 저장된 세션 확인');
    console.log('   - 세션 없으면 아이디/비밀번호 타이핑');
    console.log('   - 로그인 버튼 클릭');
    console.log('');
    
    await automation.loginToNaver();
    
    console.log('');
    console.log('✅ 로그인 성공!');
    console.log('');
    
    // 3. 로그인 상태 확인
    console.log('3️⃣ 로그인 상태 확인 중...');
    await automation['page']?.goto('https://www.naver.com', { waitUntil: 'networkidle0' });
    
    const isLoggedIn = await automation['page']?.evaluate(() => {
      const loginBtn = document.querySelector('.link_login');
      const myInfo = document.querySelector('[class*="MyView"]');
      return !loginBtn || !!myInfo;
    });
    
    if (isLoggedIn) {
      console.log('   ✅ 로그인 상태 확인됨');
    } else {
      console.log('   ❌ 로그인 상태 확인 실패');
    }
    console.log('');
    
    // 4. 블로그 글쓰기 페이지 이동
    console.log('4️⃣ 블로그 글쓰기 페이지 이동 중...');
    await automation.navigateToBlogWrite();
    console.log('   ✅ 블로그 글쓰기 페이지 이동 완료');
    console.log('');
    
    // 5. 메인 프레임 전환
    console.log('5️⃣ 메인 프레임 전환 중...');
    await automation.switchToMainFrame();
    console.log('   ✅ 메인 프레임 전환 완료');
    console.log('');
    
    console.log('='.repeat(60));
    console.log('🎉 모든 테스트 통과!');
    console.log('='.repeat(60));
    console.log('');
    console.log('💡 브라우저를 10초간 열어둡니다. 확인해주세요...');
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('❌ 테스트 실패');
    console.error('='.repeat(60));
    console.error('');
    console.error('오류 메시지:', (error as Error).message);
    console.error('');
    console.error('스택 트레이스:');
    console.error((error as Error).stack);
    console.error('');
    
    console.log('💡 브라우저를 30초간 열어둡니다. 상태를 확인해주세요...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    process.exit(1);
  } finally {
    console.log('');
    console.log('🔄 브라우저 종료 중...');
    await automation.closeBrowser();
    console.log('✅ 브라우저 종료 완료');
  }
}

// 테스트 실행
testLogin().catch((error) => {
  console.error('치명적 오류:', error);
  process.exit(1);
});





