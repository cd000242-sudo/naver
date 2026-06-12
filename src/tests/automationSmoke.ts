import { NaverBlogAutomation } from '../naverBlogAutomation.js';

async function runSmokeTest(): Promise<void> {
  const automation = new NaverBlogAutomation(
    {
      naverId: 'remember-test-id',
      naverPassword: 'remember-test-password',
      headless: true,
      slowMo: 0,
    },
    (message) => console.log(`[MOCK LOG] ${message}`),
  );

  const mock = automation as any;

  mock.setupBrowser = async () => {
    console.log('🧪 [MOCK] 브라우저 초기화 생략');
  };
  mock.loginToNaver = async () => {
    console.log('🧪 [MOCK] 로그인 단계 생략');
  };
  mock.navigateToBlogWrite = async () => {
    console.log('🧪 [MOCK] 블로그 글쓰기 페이지 이동 생략');
  };
  mock.switchToMainFrame = async () => {
    console.log('🧪 [MOCK] 메인 프레임 전환 생략');
  };
  mock.closePopups = async () => {
    console.log('🧪 [MOCK] 팝업 닫기 생략');
  };
  // run() now calls closeDraftPopup separately from closePopups; without this
  // stub the smoke dies on getAttachedFrame (no real frame in mock mode).
  mock.closeDraftPopup = async () => {
    console.log('🧪 [MOCK] 임시저장 팝업 닫기 생략');
  };
  mock.applyStructuredContent = async () => {
    console.log('🧪 [MOCK] 구조화 콘텐츠 적용 생략');
  };
  mock.applyPlainContent = async () => {
    console.log('🧪 [MOCK] 일반 텍스트 적용 생략');
  };
  mock.saveBlogPost = async () => {
    console.log('🧪 [MOCK] 포스팅 저장 생략');
  };
  // run() publishes via publishBlogPost; the real one needs an editor frame.
  mock.publishBlogPost = async () => {
    console.log('🧪 [MOCK] 발행 단계 생략');
    return { success: true, url: 'https://blog.naver.com/mock/123' };
  };
  // Immediate-publish verification reads page URL/DOM — no page in mock mode.
  mock.verifyImmediatePublishOutcome = () => {
    console.log('🧪 [MOCK] 발행 결과 검증 생략');
  };
  // Post-publish editor reactivation also needs the real frame.
  mock.activateEditorForEditing = async () => {
    console.log('🧪 [MOCK] 에디터 재활성화 생략');
  };
  mock.browser = undefined;

  await automation.run({
    title: '모의 자동화 테스트',
    content: '이것은 자동화 파이프라인을 모의로 검증하는 테스트입니다.',
    lines: 5,
    selectedHeadings: ['모의 소제목'],
    hashtags: ['mock', 'automation', 'test'],
  });

  console.log('✅ 모의 자동화 테스트가 오류 없이 완료되었습니다.');
}

runSmokeTest().catch((error) => {
  console.error('❌ 모의 자동화 테스트가 실패했습니다.', error);
  process.exit(1);
});

