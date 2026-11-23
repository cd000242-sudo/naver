import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Source guards for the stop-window wiring. The flows are too large to run here, so what must stay true is pinned in the source:
// a stop goes to the window, an engine changes only through the owner's answer, finished work is kept.
const read = (file: string): string => readFileSync(resolve(__dirname, '..', file), 'utf-8').replace(/\r/g, '');
const fullAuto = read('renderer/modules/fullAutoFlow.ts');
const continuous = read('renderer/modules/continuousPublishing.ts');
const multi = read('renderer/modules/multiAccountManager.ts');

describe('단일 풀오토 배선', () => {
  it('글 단계는 멈춤 창 뒤에서 돈다', () => {
    expect(fullAuto).toContain("generationStopRunStage('text', textEngineNow,");
  });

  it('이미지 재시도 루프의 던지는 자리 3곳이 멈춤 창으로 넘어간다(엔진 단위 오류 포함)', () => {
    expect(fullAuto.match(/activeProvider = await handOffImageStop\(imgError\);/g)?.length).toBe(3);
  });

  it('엔진은 사장님 답으로만 바뀐다: activeProvider 는 처음 값과 handOffImageStop 결과로만 정해진다', () => {
    const assigns = [...fullAuto.matchAll(/activeProvider = ([^;]+);/g)].map((m) => m[1].trim());
    expect(assigns.length).toBeGreaterThan(0);
    for (const value of assigns) expect(['originalProvider', 'await handOffImageStop(imgError)']).toContain(value);
    expect(fullAuto).toMatch(/const getProviderForAttempt = \(attempt\) => \{\s*void attempt;\s*return activeProvider;/);
  });

  it('만든 썸네일은 다음 시도에 그대로 쓰고, 썸네일 실패 시 "없이 진행"은 그대로다', () => {
    expect(fullAuto).toContain('preservedThumbnail = dedicatedThumbnailImage;');
    expect(fullAuto).toContain('이미 만든 썸네일을 그대로 씁니다');
    expect(fullAuto).toContain('전용 썸네일 생성 실패 → 썸네일 없이 진행');
  });

  it('본문 이미지: 묶음 요청 뒤 빠진 칸만 한 장씩(같은 엔진), 만든 칸은 장부에', () => {
    expect(fullAuto).toContain('ledger: imageStopCtx.ledger,');
    expect(fullAuto).toMatch(/gstopFillShoppingSlots\(\{\s*items: fullAutoBodyItems,/);
  });

  it('쇼핑 묶음(반자동·이미지 탭 경로)도 빠진 칸만 같은 엔진으로 한 장씩, 그래도 비면 창', () => {
    expect(fullAuto).toMatch(/gstopFillShoppingSlots\(\{\s*items: shoppingBatchItems,/);
    expect(fullAuto).toContain("generationStopRunStage('image', imageSource, shoppingStopCtx,");
    expect(fullAuto).toContain('SHOPPING_AI_IMAGE_BATCH_INCOMPLETE');
  });

  it('로그가 사실대로: "다른 엔진으로 재시도 / 엔진 교체" 문구가 없다', () => {
    expect(fullAuto).not.toContain('다른 엔진으로 재시도');
    expect(fullAuto).not.toContain('엔진 교체 재시도');
    expect(fullAuto).toContain('같은 엔진으로 다시 시도합니다');
  });

  it('실행이 끝나면(연속 안에서는 제외) 이번만 고른 엔진을 되돌린다', () => {
    expect(fullAuto).toContain('if (!isContinuousInvocation) void generationStopEndRun();');
  });
});

describe('연속발행 배선', () => {
  it('"여기서 멈추기"는 취소 판정보다 먼저 처리하고, 글은 그 자리(pending)에 둔다', () => {
    const catchAt = continuous.indexOf('error instanceof GstopHaltedError');
    expect(catchAt).toBeGreaterThan(0);
    expect(catchAt).toBeLessThan(continuous.indexOf('const isUserCancelled', catchAt - 1500));
    expect(continuous.slice(catchAt, catchAt + 700)).toMatch(/item\.status = 'pending';[\s\S]*stopContinuousMode\('manual'\);[\s\S]*break;/);
  });

  it('멈추기 전에 만든 글은 다시 쓰지 않는다', () => {
    expect(continuous).toContain('(item as any)._resumeArticle = finalStructuredContent;');
    expect(continuous).toContain('멈추기 전에 만들어 둔 글을 그대로 씁니다');
  });

  it('멈춤 오류는 이미지 연속 실패 횟수에 세지 않는다', () => {
    expect(continuous).toContain('if (imgErr instanceof GstopHaltedError) throw imgErr;');
  });
});

describe('다중계정 배선', () => {
  it('글 단계도 멈춤 창 뒤에서 돈다. 유료 한도(paywall)는 창 밖에서 그대로 던진다', () => {
    expect(multi).toContain("generationStopRunStage('text', maTextEngine,");
    expect(multi).toContain('paywalledResult = result;');
    expect(multi).toMatch(/if \(paywalledResult\) \{\s*throw new Error/);
  });

  it('"여기서 멈추기"는 대기열을 멈추고 그 글을 pending 으로 둔다. 이미지 오류 경고로 삼키지 않는다', () => {
    expect(multi).toContain('if (imgErr instanceof GstopHaltedError) throw imgErr;');
    expect(multi).toMatch(/if \(error instanceof GstopHaltedError\) \{[\s\S]*?stopRequested = true;[\s\S]*?pipelineStatus = 'pending';/);
  });

  it('실행이 끝나면 이번만 고른 엔진을 되돌린다', () => {
    expect(multi).toMatch(/isPublishing = false;\s*void generationStopEndRun\(\);/);
  });

  it('이미지 단계는 멈춤 창 + 장부 뒤에서 돈다', () => {
    expect(multi).toContain('generationStopRunImages(provider, postTitle, options,');
    expect(multi).toContain('imageLedger: ledger, engineStopThrows: true');
  });
});
