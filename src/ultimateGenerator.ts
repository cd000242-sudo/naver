// src/ultimateGenerator.ts

import { crawlShoppingSite } from './crawler/strategies/shoppingStrategy.js';
import { crawlGeneralPage } from './crawler/strategies/generalStrategy.js';
import { searchMultipleSources } from './naverSearchApi.js';
import { loadConfig } from './configManager.js';
import { TwoStageGenerator } from './generator/twoStageGenerator.js'; // 생성기 연결
import { qualityEnhancer } from './enhancer/qualityEnhancer.js'; // 품질 강화기 연결

// ==================== 타입 정의 ====================

export interface SourceData {
    url: string;
    title: string;
    content: string;
    images: string[];
    sourceType: 'shopping' | 'general' | 'api_fallback';
    category?: string;
    metadata?: {
        crawledAt: string;
        keyword?: string;
    };
}

export interface GeneratorCallbacks {
    onCrawl?: (data: SourceData) => void;
    onStage1?: (data: any) => void; // 초안 생성 완료 시
    onStage2?: (data: any) => void; // 본문 생성 완료 시
    onEnhance?: (data: any) => void; // 품질 강화 완료 시
    onProgress?: (step: string, data?: any) => void;
    onComplete?: (data: any) => void;
    onError?: (error: Error) => void;
}

// ==================== 클래스 구현 ====================

/**
 * UltimateGenerator - 전략적 수집 기반 완전 자동 콘텐츠 생성기
 * * [파이프라인]
 * 1. 수집: 쇼핑/일반/API 전략을 사용하여 최적의 데이터 확보
 * 2. 생성: Two-Stage (초안 -> 본문) 방식으로 글 작성
 * 3. 강화: SEO 및 가독성 품질 강화
 */
export class UltimateGenerator {
    private apiKey: string;
    private twoStage: TwoStageGenerator; // 글쓰기 엔진
    private naverConfig: { clientId: string; clientSecret: string } | null = null;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
        if (!this.apiKey) {
            console.warn('[UltimateGenerator] API Key가 제공되지 않았습니다. 생성 기능이 제한될 수 있습니다.');
        }
        // 글쓰기 엔진 초기화
        this.twoStage = new TwoStageGenerator(this.apiKey);
    }

    /**
     * 네이버 API 설정 로드 (싱글톤 패턴)
     */
    private async loadNaverConfig(): Promise<void> {
        if (this.naverConfig) return;

        try {
            const config = await loadConfig();
            this.naverConfig = {
                clientId: config.naverClientId || config.naverDatalabClientId || '',
                clientSecret: config.naverClientSecret || config.naverDatalabClientSecret || '',
            };
        } catch (e) {
            console.warn('[UltimateGenerator] 네이버 API 설정 로드 실패:', (e as Error).message);
            this.naverConfig = { clientId: '', clientSecret: '' };
        }
    }

    /**
     * URL 유형 감지
     */
    private isShoppingUrl(url: string): boolean {
        return /coupang|smartstore|brand\.naver|shopping\.naver|11st|gmarket|auction|aliexpress|amazon/i.test(url);
    }

    /**
     * URL에서 키워드 추출 (API 폴백용)
     */
    private extractKeywordFromUrl(url: string, title?: string): string {
        if (title && title.trim().length > 2) return title.replace(/\[.*?\]/g, '').trim().substring(0, 30);

        try {
            const decoded = decodeURIComponent(url);
            // URL 경로에서 한글 추출
            const match = decoded.match(/[가-힣]+/g);
            if (match && match.length > 0) {
                return match.sort((a, b) => b.length - a.length).slice(0, 2).join(' ');
            }
            // 쿼리 파라미터 확인
            const urlObj = new URL(url);
            const q = urlObj.searchParams.get('query') || urlObj.searchParams.get('q') || urlObj.searchParams.get('keyword');
            if (q) return q.trim();
        } catch {
            // 무시
        }
        return '관련 정보';
    }

    /**
     * [Step 1] 스마트 데이터 수집 (크롤링 + 폴백)
     */
    async fetchSourceData(url: string, category?: string): Promise<SourceData> {
        await this.loadNaverConfig();

        const isShopping = this.isShoppingUrl(url);
        let data: { title?: string; content?: string; images: string[] } = { images: [] };
        let sourceType: 'shopping' | 'general' = 'general';

        // 1. Puppeteer 크롤링 시도
        try {
            if (isShopping) {
                console.log('🛒 쇼핑몰 URL 감지 -> 쇼핑 전략 실행');
                const result = await crawlShoppingSite(url);
                data = result;
                sourceType = 'shopping';
            } else {
                console.log('🌐 일반 URL 감지 -> 일반 전략 실행');
                const result = await crawlGeneralPage(url);
                data = result;
                sourceType = 'general';
            }
        } catch (e) {
            console.error(`[UltimateGenerator] 크롤링 1차 실패: ${(e as Error).message}`);
        }

        // 2. 결과 검증 및 폴백 (네이버 검색 API)
        const isValid = data.content && data.content.length > 200;

        if (!isValid && this.naverConfig?.clientId) {
            console.warn(`⚠️ 콘텐츠 부족 (${data.content?.length || 0}자). 네이버 API 폴백 실행...`);
            const keyword = this.extractKeywordFromUrl(url, data.title);

            try {
                const apiResult = await searchMultipleSources(keyword, {
                    clientId: this.naverConfig.clientId,
                    clientSecret: this.naverConfig.clientSecret
                });

                if (apiResult.totalCount > 0) {
                    const fallbackContent = [
                        `[검색 키워드: ${keyword}]`,
                        '',
                        '--- 관련 블로그 정보 ---',
                        ...apiResult.blogs.slice(0, 3).map(b => `■ ${b.title}\n${b.description}`),
                        '',
                        '--- 관련 뉴스 정보 ---',
                        ...apiResult.news.slice(0, 3).map(n => `■ ${n.title}\n${n.description}`)
                    ].join('\n\n');

                    if (fallbackContent.length > 200) {
                        console.log(`✅ API 폴백 성공: ${fallbackContent.length}자 확보`);
                        return {
                            url,
                            title: data.title || keyword,
                            content: fallbackContent,
                            images: data.images,
                            sourceType: 'api_fallback',
                            category,
                            metadata: { crawledAt: new Date().toISOString(), keyword }
                        };
                    }
                }
            } catch (apiError) {
                console.warn('[UltimateGenerator] API 폴백 실패:', (apiError as Error).message);
            }
        }

        if (!data.content || data.content.length < 50) {
            throw new Error(`콘텐츠를 가져올 수 없습니다. URL을 확인해주세요.`);
        }

        return {
            url,
            title: data.title || '제목 없음',
            content: data.content || '',
            images: data.images || [],
            sourceType,
            category,
            metadata: { crawledAt: new Date().toISOString() }
        };
    }

    /**
     * [Main] URL 기반 완전 자동 생성 (수집 -> 생성 -> 강화)
     */
    async generateFromUrl(
        url: string,
        category?: string | GeneratorCallbacks,
        callbacks?: GeneratorCallbacks
    ): Promise<any> {
        // 오버로드 처리
        let actualCategory: string = 'default';
        let actualCallbacks: GeneratorCallbacks | undefined;

        if (typeof category === 'object') {
            actualCallbacks = category;
        } else if (typeof category === 'string') {
            actualCategory = category;
            actualCallbacks = callbacks;
        }

        console.log('🔥 UltimateGenerator 프로세스 시작:', url);
        const startTime = Date.now();

        try {
            // ==========================================
            // Step 1: 스마트 데이터 수집
            // ==========================================
            actualCallbacks?.onProgress?.('크롤링 시작', { url });
            const sourceData = await this.fetchSourceData(url, actualCategory);

            console.log(`✅ 수집 성공: ${sourceData.content.length}자 (타입: ${sourceData.sourceType})`);
            actualCallbacks?.onCrawl?.(sourceData);

            // ==========================================
            // Step 2 & 3: Two-Stage 글 생성
            // ==========================================
            console.log('📌 글 생성 시작 (Two-Stage)');
            const generated = await this.twoStage.generateFromUrl(
                sourceData.content, // 수집된 본문을 바탕으로 생성
                actualCategory,
                (draft) => {
                    actualCallbacks?.onStage1?.(draft); // 초안 완료 콜백
                    actualCallbacks?.onProgress?.('초안 생성 완료');
                },
                (final) => {
                    actualCallbacks?.onStage2?.(final); // 본문 완료 콜백
                    actualCallbacks?.onProgress?.('본문 생성 완료');
                }
            );

            // 수집 데이터와 생성 데이터 병합
            const mergedData = {
                ...sourceData, // 원본 URL, 이미지 등
                ...generated,  // 생성된 제목, 본문, 태그 등
            };

            // ==========================================
            // Step 4: 품질 강화 (Enhancer)
            // ==========================================
            console.log('📌 품질 강화 시작');
            actualCallbacks?.onProgress?.('품질 강화 중...');

            const enhanced = await qualityEnhancer.enhance(mergedData);
            actualCallbacks?.onEnhance?.(enhanced);

            // ==========================================
            // 완료 처리
            // ==========================================
            const elapsed = Date.now() - startTime;
            const finalResult = {
                ...enhanced,
                performance: {
                    totalTime: elapsed,
                    sourceType: sourceData.sourceType
                }
            };

            console.log(`✅ UltimateGenerator 완료! ${(elapsed / 1000).toFixed(1)}초`);
            actualCallbacks?.onComplete?.(finalResult);

            return finalResult;

        } catch (error) {
            const elapsed = Date.now() - startTime;
            console.error(`❌ 프로세스 실패 (${(elapsed / 1000).toFixed(1)}초):`, (error as Error).message);
            actualCallbacks?.onError?.(error as Error);
            throw error;
        }
    }
}

// 싱글톤 인스턴스 (API 키는 환경변수에서 로드)
export const ultimateGenerator = new UltimateGenerator();

/**
 * 편의 함수: URL에서 콘텐츠 수집 (생성 제외, 수집만 테스트할 때 사용)
 */
export async function collectFromUrl(
    url: string,
    onProgress?: (step: string, data: any) => void
): Promise<SourceData> {
    return ultimateGenerator.fetchSourceData(url);
}
