/**
 * crawlerBrowser 싱글톤 통합 테스트
 * 실행: npx ts-node test-crawl.ts
 */
import { crawlProductSpec } from './src/crawler/productSpecCrawler.js';

const testUrl = 'https://smartstore.naver.com/samsungcnh/products/12863504626?NaPm=ct%3Dmmo1er5l%7Cci%3Daffiliate%7Ctr%3Daff%7Ctrx%3D928065224975680%7Chk%3Da732c04476c90a464393b80cc6163a55d051c8e9&originChannelInfo=ac%3DNBLOG%7Cctid%3Dnull%7Ccid%3Dnull';

async function main() {
    console.log('=== crawlerBrowser 싱글톤 테스트 시작 ===');
    console.log(`URL: ${testUrl.substring(0, 80)}...`);
    console.log('');
    
    try {
        const result = await crawlProductSpec(testUrl);
        
        console.log('\n=== 크롤링 결과 ===');
        console.log(`상품명: ${result?.name || '(없음)'}`);
        console.log(`가격: ${result?.price || 0}원`);
        console.log(`메인 이미지: ${result?.mainImage?.substring(0, 80) || '(없음)'}`);
        console.log(`갤러리 이미지: ${result?.galleryImages?.length || 0}장`);
        if (result?.galleryImages?.length) {
            result.galleryImages.slice(0, 5).forEach((img: string, i: number) => {
                console.log(`  [${i + 1}] ${img.substring(0, 80)}`);
            });
        }
        console.log(`상세설명: ${result?.description?.substring(0, 100) || '(없음)'}`);
        console.log('\n✅ 테스트 완료!');
    } catch (err) {
        console.error('\n❌ 테스트 실패:', (err as Error).message);
    }
    
    // 브라우저 종료
    try {
        const { cleanup } = await import('./src/crawler/crawlerBrowser.js');
        await cleanup();
        console.log('🧹 브라우저 정리 완료');
    } catch { }
    
    process.exit(0);
}

main();
