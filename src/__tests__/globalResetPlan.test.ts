/**
 * [2026-09-23 사장님] "전체 초기화 하면 완전히 껐다 킨 상태로 돌아와야 됩니다."
 *
 * 전체 초기화는 DOM 과 전역 변수 몇 개만 비웠고, 렌더러 모듈 31개가 각자 들고 있는 모듈 상태는
 * 그대로 남아 지난 글이 다음 글에 섞여 들었다(2026-09-15 같은 신고 — 그때는 사진 모드 한 곳만 막았다).
 * 이제 초기화는 **렌더러를 실제로 다시 띄운다**. 이 파일은 그 계약을 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  GLOBAL_RESET_STEPS,
  collectWorkStorageKeys,
  describeGlobalResetStep,
  isWorkStorageKey,
} from '../renderer/modules/globalResetPlan';

/** 실제 렌더러가 쓰는 키 목록에서 뽑은 표본 — 설정과 작업물이 섞여 있다. */
const REAL_KEYS = [
  'autosave_unified_url', 'autosave_unified_keywords', 'autosave_unified_title',
  'autosave_unified_content', 'autosave_unified_hashtags', 'lastError',
  'imageRatio', 'thumbnailImageRatio', 'subheadingImageRatio', 'ftcDisclosureEnabled',
  'ftcDisclosureText', 'ftcDisclosurePreset', 'proxy_enabled', 'adspower_api_key',
  'adspower_enabled', 'adspower_profiles', 'multiAccount.lastSettings', 'dailyPostLimit',
  'openaiImageModel', 'openaiImageQuality', 'openaiTierWarningSeen', 'copyright-warning-accepted',
  'mp4-list-collapsed', 'fact-check-engine', 'globalImageSource', 'headingImageMode',
  'nanoBananaModel', 'scAIImageEngine', 'textOnlyPublish', 'thumbnailOnly',
];

const licenseUi = (): string => readFileSync(new URL('../renderer/modules/licenseUI.ts', import.meta.url), 'utf8');

describe('전체 초기화 — 지울 것과 남길 것', () => {
  it('이번 글 작업물만 지운다 (autosave_* 와 lastError)', () => {
    expect(collectWorkStorageKeys(REAL_KEYS).sort()).toEqual([
      'autosave_unified_content', 'autosave_unified_hashtags', 'autosave_unified_keywords',
      'autosave_unified_title', 'autosave_unified_url', 'lastError',
    ]);
  });

  it('설정은 남긴다 — 껐다 켜도 남는 값이기 때문이다', () => {
    const kept = REAL_KEYS.filter((k) => !isWorkStorageKey(k));
    expect(kept).toContain('imageRatio');
    expect(kept).toContain('ftcDisclosureText');
    expect(kept).toContain('proxy_enabled');
    expect(kept).toContain('adspower_api_key');
    expect(kept).toContain('multiAccount.lastSettings');
    expect(kept).toContain('openaiTierWarningSeen');
    expect(kept).toHaveLength(REAL_KEYS.length - 6);
  });

  it('빈 값·모르는 키에 안전하다', () => {
    expect(isWorkStorageKey('')).toBe(false);
    expect(isWorkStorageKey('autosave_')).toBe(true);
    expect(isWorkStorageKey('someFutureSetting')).toBe(false);
    expect(collectWorkStorageKeys([])).toEqual([]);
  });
});

describe('전체 초기화 — 순서 계약', () => {
  it('멈추고 → 메인 상태 비우고 → 작업물 지우고 → 다시 띄운다', () => {
    expect(GLOBAL_RESET_STEPS).toEqual([
      'cancel-automation', 'reset-image-state', 'clear-work-storage', 'reload-renderer',
    ]);
    // 작업물 삭제는 반드시 리로드보다 앞이다 — 아니면 부팅 때 지난 원고가 되살아난다.
    expect(GLOBAL_RESET_STEPS.indexOf('clear-work-storage'))
      .toBeLessThan(GLOBAL_RESET_STEPS.indexOf('reload-renderer'));
    expect(describeGlobalResetStep('reload-renderer')).toContain('껐다 켠 상태');
  });
});

describe('전체 초기화 배선 (licenseUI) — 소스 계약', () => {
  const src = licenseUi();

  it('화면을 실제로 다시 띄운다 — 열거식 초기화로 끝내지 않는다', () => {
    expect(src).toContain('window.location.reload()');
  });

  it('리로드 전에 자동화와 메인 프로세스 상태(이미지·브라우저 컨텍스트)를 정리한다', () => {
    const reloadAt = src.indexOf('window.location.reload()');
    const before = src.slice(0, reloadAt);
    expect(before).toContain('cancelAutomation');
    expect(before).toContain('resetImageState');
    expect(before).toContain('resetTransientState');
  });

  it('메인 프로세스 정리 핸들러가 종료 전용 cleanup 을 소비하지 않는다', () => {
    const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const start = main.indexOf("ipcMain.handle('app:resetTransientState'");
    expect(start).toBeGreaterThan(-1);
    const handler = main.slice(start, start + 1200);
    expect(handler).toContain('resetFlowState()');
    expect(handler).toContain('cleanupImageFxBrowser()');
    expect(handler).toContain('closeDropshotBrowserContexts()');
    // _runFullCleanup 은 memoized 종료 경로다 — 여기서 부르면 진짜 종료 때 정리가 건너뛰어진다.
    expect(handler).not.toContain('_runFullCleanup');
  });

  it('작업물 삭제가 리로드보다 먼저 일어난다', () => {
    expect(src.indexOf('collectWorkStorageKeys')).toBeLessThan(src.indexOf('window.location.reload()'));
    expect(src).toContain('sessionStorage.clear()');
  });

  it('설정 키를 무차별 삭제하지 않는다 — localStorage.clear() 금지', () => {
    expect(src).not.toContain('localStorage.clear()');
  });

  it('사용자에게 재시작된다는 것과 실행 중 작업이 멈춘다는 것을 알린다', () => {
    expect(src).toContain('앱을 껐다 켠 상태와 같습니다');
    expect(src).toContain('실행 중인 생성·발행 작업이 있으면 중단됩니다');
  });

  it('새 렌더러 모듈이 인라인 목록에 등록돼 있다 (빠지면 런타임에서 죽는다)', () => {
    const copyStatic = readFileSync(new URL('../../scripts/copy-static.mjs', import.meta.url), 'utf8');
    const planAt = copyStatic.indexOf("'globalResetPlan.js'");
    const licenseAt = copyStatic.indexOf("'licenseUI.js'");
    expect(planAt).toBeGreaterThan(-1);
    expect(planAt).toBeLessThan(licenseAt); // 의존 모듈이 먼저 로드돼야 한다
  });
});
