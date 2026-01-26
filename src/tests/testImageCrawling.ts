/**
 * 공식 보도자료 이미지 크롤링 테스트
 */

import { ExtendedImageLibrary } from '../extendedImageLibrary.js';
import * as path from 'path';
import * as os from 'os';

async function testImageCrawling() {
  console.log('='.repeat(80));
  console.log('🧪 공식 보도자료 이미지 크롤링 테스트 시작');
  console.log('='.repeat(80));
  console.log('');

  // 임시 저장 디렉토리
  const storageDir = path.join(os.tmpdir(), 'test-image-library');
  
  // 이미지 라이브러리 초기화
  const library = new ExtendedImageLibrary({
    storageDir,
    autoDownload: false, // 테스트에서는 다운로드 건너뜀
  });

  await library.initialize();
  console.log('✅ 이미지 라이브러리 초기화 완료');
  console.log('');

  // 테스트 케이스
  const testCases = [
    {
      name: '정부 정책 관련',
      query: '정부 정책 발표',
      sources: ['korea_gov' as const],
      expectedMin: 1,
    },
    {
      name: '연예 뉴스',
      query: 'BTS 방탄소년단',
      sources: ['news_agency' as const],
      expectedMin: 1,
    },
    {
      name: '스포츠 뉴스',
      query: '손흥민 축구',
      sources: ['news_agency' as const],
      expectedMin: 1,
    },
    {
      name: '경제 뉴스',
      query: '주식 시장 동향',
      sources: ['news_agency' as const],
      expectedMin: 1,
    },
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of testCases) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📝 테스트: ${testCase.name}`);
    console.log(`🔍 검색어: "${testCase.query}"`);
    console.log(`📦 소스: ${testCase.sources.join(', ')}`);
    console.log('');

    try {
      const startTime = Date.now();
      
      // 이미지 수집
      const images = await library.collectImages(testCase.query, {
        sources: testCase.sources,
        count: 5,
      });

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`⏱️  소요 시간: ${elapsedTime}초`);
      console.log(`📊 수집된 이미지: ${images.length}개`);
      console.log('');

      if (images.length >= testCase.expectedMin) {
        console.log(`✅ 테스트 통과 (최소 ${testCase.expectedMin}개 이상 수집)`);
        passedTests++;

        // 수집된 이미지 정보 출력
        images.slice(0, 3).forEach((img, idx) => {
          console.log(`\n   이미지 ${idx + 1}:`);
          console.log(`   - ID: ${img.id}`);
          console.log(`   - 제목: ${img.title}`);
          console.log(`   - 소스: ${img.source}`);
          console.log(`   - URL: ${img.url.substring(0, 80)}...`);
          console.log(`   - 라이선스: ${img.license}`);
          console.log(`   - 출처표기: ${img.attribution}`);
        });

        if (images.length > 3) {
          console.log(`\n   ... 외 ${images.length - 3}개 더`);
        }
      } else {
        console.log(`❌ 테스트 실패 (${images.length}개 수집, 최소 ${testCase.expectedMin}개 필요)`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ 테스트 실패 (오류 발생)`);
      console.error(`   오류: ${(error as Error).message}`);
      failedTests++;
    }
  }

  // 최종 결과
  console.log('');
  console.log('='.repeat(80));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(80));
  console.log(`✅ 통과: ${passedTests}/${testCases.length}`);
  console.log(`❌ 실패: ${failedTests}/${testCases.length}`);
  console.log('');

  if (failedTests === 0) {
    console.log('🎉 모든 테스트 통과!');
    console.log('');
    console.log('✅ 공식 보도자료 크롤링이 정상적으로 작동합니다.');
    console.log('✅ API 키 없이 크롤링 기반으로 이미지를 수집합니다.');
    console.log('✅ 출처 표기가 자동으로 포함됩니다.');
  } else {
    console.log('⚠️  일부 테스트가 실패했습니다.');
    console.log('');
    console.log('가능한 원인:');
    console.log('1. 네트워크 연결 문제');
    console.log('2. 웹사이트 구조 변경');
    console.log('3. 검색어와 관련된 이미지가 없음');
  }

  console.log('');
  console.log('='.repeat(80));
}

// 테스트 실행
testImageCrawling()
  .then(() => {
    console.log('테스트 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('테스트 중 오류 발생:', error);
    process.exit(1);
  });





