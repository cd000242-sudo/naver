// src/urlGenerator.ts

import { UltimateGenerator } from './ultimateGenerator';

/**
 * URL 기반 블로그 생성 (UltimateGenerator 통합)
 */
export async function generateContentFromUrl(
  url: string,
  category: string = 'default',
  onProgress?: (status: string) => void
): Promise<any> {
  console.log('📌 URL 기반 글생성 시작');

  // 1. 안전장치: API 키 확인
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 환경변수에 설정되지 않았습니다.');
  }

  try {
    // 2. 생성자: API 키 전달
    const generator = new UltimateGenerator(apiKey);

    // 3. 실행: url, category, callbacks 순서로 전달
    const result = await generator.generateFromUrl(
      url,
      category, // 👈 (중요) 이걸 전달해야 카테고리에 맞는 글을 씁니다!
      {
        // 진행상황 알림
        onProgress: (step, data) => {
          console.log(`✅ ${step}`);
          onProgress?.(step);
        },
        // 크롤링 완료 시
        onCrawl: (data) => {
          console.log('✅ 크롤링 데이터 확보');
          onProgress?.('크롤링 완료');
        },
        // 1단계(초안) 완료 시
        onStage1: (data) => {
            console.log('✅ 초안 생성 완료');
            onProgress?.('초안 생성 완료');
        },
        // 2단계(본문) 완료 시
        onStage2: (data) => {
            console.log('✅ 본문 생성 완료');
            onProgress?.('본문 생성 완료');
        },
        // 품질 강화 완료 시
        onEnhance: (data) => {
            console.log('✅ 품질 최적화 완료');
            onProgress?.('품질 최적화 완료');
        },
        // 전체 완료 시
        onComplete: (data) => {
          console.log('✅ 전체 프로세스 완료');
          onProgress?.('생성 완료');
        },
        // 에러 발생 시
        onError: (error) => {
          console.error('❌ 프로세스 오류:', error.message);
        }
      }
    );

    return result;

  } catch (error) {
    console.error('❌ URL 글생성 실패:', (error as Error).message);
    throw new Error(`URL 글생성 실패: ${(error as Error).message}`);
  }
}