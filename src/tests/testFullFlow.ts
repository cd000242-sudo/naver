import { NaverBlogAutomation } from '../naverBlogAutomation.js';
import { generateStructuredContent } from '../contentGenerator.js';
import { generateImages } from '../imageGenerator.js';

async function testFullFlow() {
  console.log('='.repeat(80));
  console.log('🧪 전체 플로우 테스트: 콘텐츠 생성 → 이미지 생성 → 네이버 발행');
  console.log('='.repeat(80));
  console.log('');
  
  // 환경변수에서 자격증명 읽기
  const naverId = process.env.TEST_NAVER_ID || '';
  const naverPassword = process.env.TEST_NAVER_PASSWORD || '';
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  const pexelsApiKey = process.env.PEXELS_API_KEY || '';
  
  if (!naverId || !naverPassword) {
    console.error('❌ 네이버 자격증명이 필요합니다.');
    process.exit(1);
  }
  
  if (!geminiApiKey) {
    console.error('❌ Gemini API Key가 필요합니다.');
    process.exit(1);
  }
  
  console.log('📝 테스트 설정:');
  console.log(`   네이버 계정: ${naverId ? '설정됨' : '없음'}`);
  console.log(`   Gemini API: ${geminiApiKey ? '설정됨' : '없음'}`);
  console.log(`   Pexels API: ${pexelsApiKey ? '설정됨' : '없음 (DALL-E 사용)'}`);
  console.log('');
  
  let structuredContent: any = null;
  let generatedImages: any[] = [];
  
  try {
    // ============================================
    // 1단계: 콘텐츠 생성
    // ============================================
    console.log('='.repeat(80));
    console.log('1️⃣ 콘텐츠 생성 테스트');
    console.log('='.repeat(80));
    console.log('');
    
    const testKeywords = '2024년 최신 AI 트렌드';
    console.log(`🔍 키워드: "${testKeywords}"`);
    console.log('⏳ Gemini로 구조화 콘텐츠 생성 중...');
    console.log('');
    
    structuredContent = await generateStructuredContent({
      sourceType: 'custom_text',
      rawText: testKeywords,
      targetAge: '30s',
      generator: 'gemini',
      categoryHint: 'tech',
    }, {
      minChars: 1500,
    });
    
    console.log('✅ 콘텐츠 생성 완료!');
    console.log('');
    console.log('📋 생성된 콘텐츠:');
    console.log(`   제목: ${structuredContent.selectedTitle}`);
    console.log(`   본문 길이: ${structuredContent.bodyPlain?.length || 0}자`);
    console.log(`   소제목 개수: ${structuredContent.headings?.length || 0}개`);
    console.log(`   해시태그: ${structuredContent.hashtags?.join(', ') || '없음'}`);
    console.log('');
    
    if (structuredContent.headings && structuredContent.headings.length > 0) {
      console.log('📌 소제목 목록:');
      structuredContent.headings.forEach((h: any, idx: number) => {
        console.log(`   ${idx + 1}. ${h.title}`);
      });
      console.log('');
    }
    
    // ============================================
    // 2단계: 이미지 생성
    // ============================================
    console.log('='.repeat(80));
    console.log('2️⃣ 이미지 생성 테스트');
    console.log('='.repeat(80));
    console.log('');
    
    if (!structuredContent.headings || structuredContent.headings.length === 0) {
      console.log('⚠️ 소제목이 없어 이미지 생성을 건너뜁니다.');
    } else {
      const imageProvider = 'naver'; // ✅ 네이버 이미지 검색 사용
      console.log(`🖼️ ${imageProvider.toUpperCase()}로 이미지 생성 중...`);
      console.log(`   생성할 이미지: ${structuredContent.headings.length}개`);
      console.log('');
      
      const imageItems = structuredContent.headings.map((h: any) => ({
        heading: h.title,
        prompt: h.imagePrompt || h.title,
      }));
      
      try {
        const apiKeys = {
          geminiApiKey: process.env.GEMINI_API_KEY,
        };
        
        const images = await generateImages({
          provider: imageProvider as 'naver',
          items: imageItems,
          postTitle: structuredContent.selectedTitle,
        }, apiKeys);
        
        generatedImages = images;
        
        console.log('✅ 이미지 생성 완료!');
        console.log('');
        console.log('🖼️ 생성된 이미지:');
        images.forEach((img: any, idx: number) => {
          console.log(`   ${idx + 1}. ${img.heading}`);
          console.log(`      파일: ${img.filePath}`);
        });
        console.log('');
      } catch (imageError) {
        console.error('⚠️ 이미지 생성 실패:', (imageError as Error).message);
        console.log('   이미지 없이 계속 진행합니다...');
        console.log('');
      }
    }
    
    // ============================================
    // 3단계: 네이버 블로그 발행
    // ============================================
    console.log('='.repeat(80));
    console.log('3️⃣ 네이버 블로그 발행 테스트');
    console.log('='.repeat(80));
    console.log('');
    
    console.log('🚀 네이버 블로그 자동화 시작...');
    console.log('');
    
    const automation = new NaverBlogAutomation({
      naverId,
      naverPassword,
      headless: false, // 브라우저 보이게
    });
    
    try {
      // run() 메서드가 모든 단계를 자동으로 처리
      console.log('🚀 네이버 블로그 자동 발행 시작...');
      console.log('   (브라우저 시작 → 로그인 → 콘텐츠 작성 → 임시저장)');
      console.log('');
      
      await automation.run({
        structuredContent,
        publishMode: 'draft', // 임시저장으로 테스트
        skipImages: generatedImages.length === 0,
        images: generatedImages.map((img: any) => ({
          heading: img.heading,
          filePath: img.filePath,
          provider: img.provider || 'pexels',
        })),
      });
      
      console.log('');
      console.log('   ✅ 임시저장 완료');
      console.log('');
      
      console.log('='.repeat(80));
      console.log('🎉 전체 플로우 테스트 성공!');
      console.log('='.repeat(80));
      console.log('');
      console.log('📊 테스트 결과 요약:');
      console.log(`   ✅ 콘텐츠 생성: ${structuredContent.selectedTitle}`);
      console.log(`   ✅ 이미지 생성: ${generatedImages.length}개`);
      console.log(`   ✅ 네이버 발행: 임시저장 완료`);
      console.log('');
      console.log('💡 브라우저를 15초간 열어둡니다. 결과를 확인해주세요...');
      
      await new Promise(resolve => setTimeout(resolve, 15000));
      
    } finally {
      console.log('');
      console.log('🔄 브라우저 종료 중...');
      await automation.closeBrowser();
      console.log('✅ 브라우저 종료 완료');
    }
    
  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('❌ 테스트 실패');
    console.error('='.repeat(80));
    console.error('');
    console.error('오류:', (error as Error).message);
    console.error('');
    if ((error as Error).stack) {
      console.error('스택 트레이스:');
      console.error((error as Error).stack);
    }
    
    process.exit(1);
  }
}

// 테스트 실행
testFullFlow().catch((error) => {
  console.error('치명적 오류:', error);
  process.exit(1);
});

