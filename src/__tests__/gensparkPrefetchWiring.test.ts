// [2026-10-10] 젠스파크 발행 이미지 "미리 한꺼번에" 배선 — 풀오토·연속·다중계정 공용 함수(generateImagesForAutomation).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const mam = read('renderer/modules/multiAccountManager.ts');
const fnStart = mam.indexOf('const shoppingBatchPlan = isShoppingConnect');
const loopStart = mam.indexOf('for (let itemIndex = 0; itemIndex < itemsForGeneration.length; itemIndex++) {', fnStart);
const prefetchBlock = mam.slice(mam.indexOf('const gsPrefetchIndexes', fnStart), loopStart);
const loopHead = mam.slice(loopStart, mam.indexOf('for (let attempt = 1; attempt <= MAX_RETRIES', loopStart));

describe('generateImagesForAutomation — 젠스파크 미리 한꺼번에', () => {
  it('쇼핑 배치 뒤·소제목 루프 앞에서, 젠스파크 본문만 한 번에 요청한다(일부 결과 허용)', () => {
    expect(fnStart).toBeGreaterThan(0);
    expect(mam.indexOf('const gsPrefetchIndexes', fnStart)).toBeGreaterThan(mam.indexOf('return safeBatch.images;', fnStart));
    expect(prefetchBlock).toMatch(/gsPrefetchBodyIndexes\(provider, itemsForGeneration\)/);
    expect(prefetchBlock).toMatch(/items: gsPrefetchItems/);
    expect(prefetchBlock).toMatch(/allowPartialResults: true/);
    expect(prefetchBlock).toMatch(/imageGenerationTimeoutMs: gsPrefetchTimeoutMs\(gsPrefetchItems\.length, BATCH_TIMEOUT_MS\)/);
    expect(prefetchBlock).toMatch(/gsPrefetched = gsPrefetchMatchImages\(itemsForGeneration, gsPrefetchIndexes,/);
    // 썸네일 연출(director)은 한꺼번에 요청에 싣지 않는다.
    expect(prefetchBlock).not.toMatch(/thumbnailDirector/);
  });

  it('한꺼번에 요청이 실패해도 멈추지 않고 1장씩으로 넘어간다', () => {
    expect(prefetchBlock).toMatch(/catch \(gsPrefetchError\) \{[\s\S]*1장씩 만듭니다/);
    expect(prefetchBlock).not.toMatch(/throw /);
  });

  it('받은 칸은 루프 맨 앞에서 그대로 쓰고(재생성·재시도 없음) 칸 결과를 SUCCESS 로 알린다', () => {
    expect(loopHead).toMatch(/const gsReady = gsPrefetched\.get\(itemIndex\);\s*if \(gsReady\) \{[\s\S]*sequentialImages\.push\(gsReady\);[\s\S]*reportSlot\(itemIndex, \{ state: 'SUCCESS', image: gsReady \}\);[\s\S]*continue;/);
    expect(loopHead.indexOf('gsPrefetched.get(itemIndex)')).toBeLessThan(loopHead.indexOf('checkBatchTimeout()'));
  });

  it('판단 파일을 렌더러 묶음(copy-static)에 등록한다 — 빠지면 빌드는 통과하고 화면에서만 터진다', () => {
    expect(read('../scripts/copy-static.mjs')).toMatch(/label: 'image\/fullAuto\/gensparkBodyPrefetch\.js'/);
    expect(mam).toMatch(/from '\.\.\/\.\.\/image\/fullAuto\/gensparkBodyPrefetch\.js'/);
    expect(read('image/fullAuto/gensparkBodyPrefetch.ts')).not.toMatch(/^import /m);
  });
});
