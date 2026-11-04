// [2026-11-04 사장님 "코덱스 이미지는 병렬로 한번에 생성가능한가요?"] Codex 구독 이미지(codex-image)도 젠스파크처럼
//   소제목 항목을 먼저 모두 만들어 한 번에 요청한다. main 이 한 세션 한 장씩 4개를 동시에 돌린다(codexImageGenerator.test.ts).
//   받은 칸은 그대로 쓰고, 못 받은 칸만 지금처럼 1장씩 만든다(엔진을 바꾸지 않는다).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('이미지 관리 탭 AI 이미지 생성 (headingImageGen) — codex-image 한 번에 요청', () => {
  const tab = read('renderer/modules/headingImageGen.ts');
  const start = tab.indexOf('let gsTabPrefetched');
  const callBlock = tab.slice(tab.indexOf('if (gsPrefetchBatchProvider(imageSource) && filteredHeadings.length >= 2'), tab.indexOf('const results: Array<any | null> = [];', start));

  it('엔진 판정은 한 번에 요청하는 엔진 목록(젠스파크·codex-image)을 쓰고, 쇼핑커넥트는 제외한다', () => {
    expect(tab).toMatch(/if \(gsPrefetchBatchProvider\(imageSource\) && filteredHeadings\.length >= 2 && !isShoppingConnectForCurrentPost\(\)\) \{/);
    expect(tab).toMatch(/import \{[^}]*gsPrefetchBatchProvider[^}]*\} from '\.\.\/\.\.\/image\/fullAuto\/gensparkBodyPrefetch\.js'/);
    expect(tab).not.toMatch(/imageSource === 'genspark' && filteredHeadings\.length/);
  });

  it('소제목 항목을 먼저 모두 만들어 generateImagesWithCostSafety 를 한 번만 부른다(일부 결과 허용)', () => {
    expect(callBlock.match(/generateImagesWithCostSafety\(/g)).toHaveLength(1);
    expect(callBlock).toMatch(/provider: imageSource,\s*items: gsTabItems,/);
    expect(callBlock).toMatch(/allowPartialResults: true,/);
    // Same item shape the single path builds: heading, prompt, englishPrompt, no thumbnail, no text, reference image.
    expect(callBlock).toMatch(/heading: heading\.title,\s*prompt: heading\.prompt,\s*englishPrompt: heading\.prompt,\s*isThumbnail: false,\s*allowText: false,/);
    expect(callBlock).toMatch(/\.\.\.resolveReferenceImageForHeading\(String\(heading\.title \|\| ''\)\.trim\(\)\)/);
  });

  it('받은 이미지는 위치가 아니라 소제목 이름으로 칸에 맞춘다', () => {
    expect(callBlock).toMatch(/gsTabPrefetched = gsPrefetchMatchImages\(gsTabItems, gsTabItems\.map\(\(_item: any, i: number\) => i\), /);
  });

  it('진행 로그는 엔진 이름을 gsPrefetchLabel 로 쓴다 (codex-image 를 "젠스파크"라고 부르지 않는다)', () => {
    expect(callBlock).toMatch(/\$\{gsPrefetchLabel\(imageSource\)\}: 소제목 이미지/);
    expect(callBlock).not.toMatch(/`[^`]*젠스파크/);
  });

  it('요청이 통째로 실패해도 멈추지 않고, 못 받은 칸은 1장씩 만든다', () => {
    expect(callBlock).toMatch(/catch \(gsTabError\) \{[\s\S]*1장씩 만듭니다/);
    expect(callBlock).not.toMatch(/throw /);
  });

  it('받은 칸은 엔진 분기보다 먼저 쓰고, codex-image 1장 경로는 그대로 남아 있다', () => {
    expect(tab).toMatch(/const gsTabReady = gsTabPrefetched\.get\(i\);\s*if \(gsTabReady\) \{[\s\S]*?\} else if \(isShoppingConnectForCurrentPost\(\)\) \{/);
    const one = tab.slice(
      tab.indexOf('const generateOne = async (heading: any, i: number)', start),
      tab.indexOf('if (gsPrefetchBatchProvider(imageSource) && filteredHeadings.length >= 2', start),
    );
    expect(one).toMatch(/imageSource === 'dropshot' \|\| imageSource === 'genspark' \|\| imageSource === 'codex-image'/);
    // The single path still sends exactly one item per call.
    const branch = one.slice(one.indexOf("imageSource === 'codex-image'"));
    expect(branch).toMatch(/items: \[\{\s*heading: headingForImage,[\s\S]*?\}\],\s*postTitle: blogTitle,/);
  });

  it('요청은 소제목 반복문보다 앞에서 한 번 끝난다', () => {
    expect(tab.indexOf('items: gsTabItems')).toBeLessThan(tab.indexOf('results.push(await generateOne(filteredHeadings[i], i));'));
  });
});

describe('반자동·풀오토 소제목 이미지 (fullAutoFlow.generateAIImagesForHeadings) — codex-image 한 번에 요청', () => {
  const flow = read('renderer/modules/fullAutoFlow.ts');
  const fn = flow.slice(flow.indexOf('async function generateAIImagesForHeadings'), flow.indexOf('const PUBLISH_AUTOMATION_TIMEOUT_MS'));
  const prefetch = fn.slice(fn.indexOf('let prebuiltItems = [];'), fn.indexOf('const results = [];'));

  it('엔진 판정은 한 번에 요청하는 엔진 목록을 쓰고, 항목은 모두 먼저 만든다', () => {
    expect(prefetch).toMatch(/if \(gsPrefetchBatchProvider\(imageSource\) && headings\.length >= 2 && !isFullAutoStopRequested\(\)\) \{/);
    expect(prefetch).toMatch(/prebuiltItems\.push\(await buildBodyImageItem\(headings\[i\], i\)\)/);
    expect(flow).toMatch(/import \{[^}]*gsPrefetchBatchProvider[^}]*\} from '\.\.\/\.\.\/image\/fullAuto\/gensparkBodyPrefetch\.js'/);
    expect(prefetch).not.toMatch(/imageSource === 'genspark'/);
  });

  it('한 번의 호출에 모든 항목을 싣고(일부 결과 허용), 소제목 이름으로 칸에 맞춘다', () => {
    expect(prefetch.match(/generateImagesWithCostSafety\(/g)).toHaveLength(1);
    expect(prefetch).toMatch(/provider: imageSource,[\s\S]*?items: prebuiltItems,[\s\S]*?allowPartialResults: true,/);
    expect(prefetch).toMatch(/gsSemiPrefetched = gsPrefetchMatchImages\(prebuiltItems, prebuiltItems\.map\(\(_item, i\) => i\), /);
  });

  it('항목 모양은 1장 경로와 같다 (buildBodyImageItem 하나를 두 경로가 함께 쓴다 — 비율·참조 이미지 포함)', () => {
    const build = fn.slice(fn.indexOf('const buildBodyImageItem = async (heading, i) => {'), fn.indexOf('let gsSemiPrefetched'));
    expect(build).toMatch(/isThumbnail: false,\s*allowText: false,/);
    expect(build).toMatch(/imageRatio: globalSettings\.subheadingRatio \|\| imageRatio,/);
    expect(build).toMatch(/\.\.\.ref,/);
    expect(fn).toMatch(/const imageItem = prebuiltItem \|\| await buildBodyImageItem\(heading, i\);/);
  });

  it('진행 로그는 엔진 이름을 gsPrefetchLabel 로 쓴다', () => {
    expect(prefetch).toMatch(/\$\{gsPrefetchLabel\(imageSource\)\}: 소제목 이미지/);
    expect(prefetch).not.toMatch(/`[^`]*젠스파크/);
  });

  it('요청이 실패하거나 못 받은 칸이 있으면 그 칸만 지금처럼 1장씩 만든다 (다른 엔진으로 바꾸지 않는다)', () => {
    expect(prefetch).toMatch(/catch \(gsSemiError\) \{[\s\S]*1장씩 만듭니다/);
    const one = fn.slice(fn.indexOf('const generateOne = async (heading, i, prebuiltItem = null) => {'));
    expect(one.indexOf('gsSemiPrefetched.get(i)')).toBeGreaterThan(0);
    expect(one.indexOf('gsSemiPrefetched.get(i)')).toBeLessThan(one.indexOf('items: [imageItem]'));
    expect(one).toMatch(/provider: imageSource,\s*imageModel,\s*items: \[imageItem\],/);
    expect(fn).toMatch(/generateOne\(headings\[i\], i, prebuiltItems\[i\] \|\| null\)/);
  });
});

describe('발행 자동화 (multiAccountManager.generateImagesForAutomation) — codex-image 도 같은 한 번에 요청', () => {
  const mam = read('renderer/modules/multiAccountManager.ts');
  const fnStart = mam.indexOf('const shoppingBatchPlan = isShoppingConnect');
  const loopStart = mam.indexOf('for (let itemIndex = 0; itemIndex < itemsForGeneration.length; itemIndex++) {', fnStart);
  const block = mam.slice(mam.indexOf('const gsPrefetchIndexes', fnStart), loopStart);

  it('본문 항목만 한 번에 요청한다 (썸네일은 연출 때문에 루프에서 따로)', () => {
    expect(block).toMatch(/gsPrefetchBodyIndexes\(provider, itemsForGeneration\)/);
    expect(block).toMatch(/items: gsPrefetchItems,/);
    expect(block).toMatch(/allowPartialResults: true,/);
    expect(block).not.toMatch(/thumbnailDirector/);
    expect(block).toMatch(/gsPrefetched = gsPrefetchMatchImages\(itemsForGeneration, gsPrefetchIndexes,/);
  });

  it('진행 로그는 엔진 이름을 gsPrefetchLabel 로 쓴다', () => {
    expect(block).toMatch(/\$\{gsPrefetchLabel\(provider\)\}: 소제목 이미지/);
    expect(block).not.toMatch(/`[^`]*젠스파크/);
    expect(mam).toMatch(/import \{[^}]*gsPrefetchLabel[^}]*\} from '\.\.\/\.\.\/image\/fullAuto\/gensparkBodyPrefetch\.js'/);
  });

  it('못 받은 칸은 루프에서 1장씩 만든다', () => {
    expect(block).toMatch(/catch \(gsPrefetchError\) \{[\s\S]*1장씩 만듭니다/);
    const loopHead = mam.slice(loopStart, mam.indexOf('for (let attempt = 1; attempt <= MAX_RETRIES', loopStart));
    expect(loopHead).toMatch(/const gsReady = gsPrefetched\.get\(itemIndex\);\s*if \(gsReady\) \{[\s\S]*continue;/);
  });
});

describe('전체 흐름 풀오토 (fullAutoFlow 본문 이미지) — 이미 한 번에 보낸다', () => {
  it('모든 본문 항목을 한 호출로 보내므로 main 의 동시 실행이 그대로 쓰인다', () => {
    const flow = read('renderer/modules/fullAutoFlow.ts');
    expect(flow).toMatch(/items: fullAutoBodyItems,/);
  });
});
