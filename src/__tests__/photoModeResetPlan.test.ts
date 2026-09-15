/**
 * [2026-09-15 사장님 실측] "사진으로 글생성이 발행 다 하고 나서 자동으로 다음 글 작성할 수
 * 있게 초기화가 되어야 하는데 안 되네요. 전체 초기화해도 남아 있습니다."
 *
 * 확인해 보니 발행 후 resetAllFields → resetPhotoModeForNextPost 는 정상 호출되고 있었다.
 * 빠진 건 **지난 글의 추론 결과(NarrativePlan)** 였다. 사진과 상황 메모만 비우고
 * imageNarrativeMode / QuickMode 모듈 안의 plan 은 그대로 살아 있어서, 화면은 비어 보여도
 * 다음 글이 지난 글의 플랜 위에서 시작됐다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const reset = read('../renderer/modules/photoModeReset.ts');
const mode = read('../renderer/modules/imageNarrativeMode.ts');
const quick = read('../renderer/modules/imageNarrativeQuickMode.ts');

describe('사진 모드 초기화가 추론 결과까지 지운다', () => {
  it('두 모듈이 초기화 함수를 내보낸다', () => {
    expect(mode).toMatch(/export function resetNarrativeState\(\)/);
    expect(quick).toMatch(/export function resetQuickModeState\(\)/);
  });

  it('plan 을 null 로 되돌리고 추론 중 표시를 내린다', () => {
    const body = mode.slice(mode.indexOf('export function resetNarrativeState'));
    expect(body).toMatch(/plan:\s*null/);
    expect(body).toMatch(/isInferring:\s*false/);
  });

  it('빠른 모드는 1단계로 되돌아간다 — 지난 글이 멈춘 단계에서 시작되면 안 된다', () => {
    const body = quick.slice(quick.indexOf('export function resetQuickModeState'));
    expect(body).toMatch(/currentPanel:\s*1/);
    expect(body).toMatch(/plan:\s*null/);
  });

  it('발행 후 초기화가 그 둘을 실제로 부른다', () => {
    expect(reset).toMatch(/import \{ resetNarrativeState \}/);
    expect(reset).toMatch(/import \{ resetQuickModeState \}/);
    const body = reset.slice(reset.indexOf('export function resetPhotoModeForNextPost'));
    expect(body).toMatch(/resetNarrativeState\(\)/);
    expect(body).toMatch(/resetQuickModeState\(\)/);
  });

  it('상태만 비우지 않고 화면에 남은 결과 패널도 지운다', () => {
    const body = reset.slice(reset.indexOf('export function resetPhotoModeForNextPost'));
    expect(reset).toMatch(/PHOTO_RESULT_PANEL_IDS/);
    expect(reset).toMatch(/image-narrative-review-panel/);
    expect(body).toMatch(/innerHTML = ''/);
  });

  it('올린 사진과 상황 메모는 계속 지운다 — 기존 동작을 잃지 않았다', () => {
    const body = reset.slice(reset.indexOf('export function resetPhotoModeForNextPost'));
    expect(body).toMatch(/clearUploadedImages\(\)/);
    expect(reset).toMatch(/image-narrative-context-notes/);
  });

  it('장소 목록은 여전히 건드리지 않는다 — 9/10 에 일부러 뺀 것이다', () => {
    // 여러 글에 같은 가게를 쓰는데 예약 발행 스케줄러가 임의 시점에 이 초기화를 부른다.
    expect(reset).not.toMatch(/readPickedPlaces|clearPickedPlaces|placePicker/);
  });
});
