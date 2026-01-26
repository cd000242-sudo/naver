import { assembleContentSource } from '../sourceAssembler.js';

const testUrl = 'https://tvreport.co.kr/breaking/article/959224/';

async function testCrawling() {
  console.log('🧪 크롤링 테스트 시작...\n');
  console.log(`📥 테스트 URL: ${testUrl}\n`);

  try {
    const result = await assembleContentSource({
      rssUrl: testUrl,
      generator: 'gemini',
    });

    console.log('✅ 크롤링 성공!\n');
    console.log('📌 추출된 제목:');
    console.log(result.source.title || '(제목 없음)');
    console.log('\n📄 추출된 본문 (처음 500자):');
    const contentPreview = result.source.rawText?.substring(0, 500) || '(본문 없음)';
    console.log(contentPreview);
    console.log('\n...\n');
    console.log(`📊 전체 본문 길이: ${result.source.rawText?.length || 0}자`);
    
    if (result.warnings.length > 0) {
      console.log('\n⚠️ 경고:');
      result.warnings.forEach((warning) => console.log(`  - ${warning}`));
    }

    console.log('\n📋 메타데이터:');
    console.log(`  - 소스 타입: ${result.source.sourceType}`);
    console.log(`  - 카테고리 힌트: ${result.source.categoryHint || '(없음)'}`);
    console.log(`  - 크롤링 시간: ${result.source.crawledTime || '(없음)'}`);
    console.log(`  - 기사 타입: ${result.source.articleType || '(없음)'}`);

    if (result.source.rawText && result.source.rawText.length > 100) {
      console.log('\n✅ 크롤링이 정상적으로 작동합니다!');
    } else {
      console.log('\n⚠️ 본문이 너무 짧거나 추출되지 않았습니다.');
    }
  } catch (error) {
    console.error('\n❌ 크롤링 실패:');
    console.error((error as Error).message);
    console.error('\n스택 트레이스:');
    console.error((error as Error).stack);
  }
}

testCrawling();









