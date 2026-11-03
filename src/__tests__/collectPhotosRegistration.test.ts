import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_COLLECT_CONSENT_VERSION } from '../runtime/collectPhotosPolicy.js';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('관련 사진 찾기 - 화면/저장 등록', () => {
  it('엔진 선택 칸과 풀오토 설정 카드, 값 검증 목록에 등록돼 있다', () => {
    expect(fs.readFileSync(path.join(ROOT, '..', 'public', 'index.html'), 'utf-8')).toMatch(/<option value="collect-photos"[^>]*>관련 사진 찾기/);
    const settings = read('renderer/components/HeadingImageSettings.ts');
    expect(settings).toContain("| 'collect-photos'");
    expect(settings).toContain('data-value="collect-photos"');
    expect(settings.match(/'genspark', 'collect-photos'/g)?.length).toBe(2);
    expect(read('renderer/modules/unifiedDOMCache.ts')).toContain("'genspark', 'collect-photos'");
  });

  it('쇼핑커넥트 상품 이미지 엔진 선택지에는 넣지 않았다', () => {
    expect(read('renderer/utils/shoppingConnectUtils.ts')).not.toContain('collect-photos');
  });

  it('동의 기록은 부분 저장과 계정 이전에서 사라지지 않는 목록에 올라 있다', () => {
    expect(read('configManager.ts').match(/'imageCollectConsent'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(read('main/userDataMigration.ts')).toContain("'imageCollectConsent'");
  });

  it('렌더러 모듈은 인라인 번들과 지문 목록에 등록되고 동의 문구 버전이 main 과 같다', () => {
    expect(fs.readFileSync(path.join(ROOT, '..', 'scripts', 'copy-static.mjs'), 'utf-8')).toContain("'imageCollectEngineConsent.js'");
    expect(read('contentQualityV3/candidateRuntimeFingerprint.ts')).toContain('src/renderer/modules/imageCollectEngineConsent.ts');
    const version = Number(read('renderer/modules/imageCollectEngineConsent.ts').match(/COLLECT_ENGINE_CONSENT_VERSION = (\d+)/)?.[1]);
    expect(version).toBe(IMAGE_COLLECT_CONSENT_VERSION);
    expect(Number(read('renderer/modules/issueCollectConsent.ts').match(/ISSUE_CONSENT_CONFIG_MIN_VERSION = (\d+)/)?.[1])).toBe(IMAGE_COLLECT_CONSENT_VERSION);
    expect(read('renderer/renderer.ts')).toContain("collectEngineWireSelect('image-source-select')");
  });

  it('풀오토 엔진 카드 모달의 확인 버튼은 저장 전에 동의를 거치고, 거절하면 저장 없이 돌아간다', () => {
    const settings = read('renderer/components/HeadingImageSettings.ts');
    expect(settings).toContain("from '../modules/imageCollectEngineConsent.js'");
    const handler = settings.slice(settings.indexOf("getElementById('image-source-confirm')?.addEventListener('click'"));
    const gate = handler.indexOf('collectEngineAllowPick(selectedSourceValue)');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(handler.indexOf('setGlobalImageSource(selectedSourceValue)'));
    expect(handler.slice(gate, gate + 400)).toMatch(/return;/);
  });

  it('진행 로그 연결: main 이 렌더러 로그 전송기를 등록한다', () => {
    expect(read('main.ts')).toContain('setCollectPhotosLogSink(sendLog)');
  });
});

describe('엔진 저장 경로 동의 확인 (카드 모달 / URL 수집)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('../renderer/modules/issueCollectConsent.js'); });

  async function loadAllowPick(agree: boolean) {
    vi.resetModules();
    const saveConfig = vi.fn(async () => ({ success: true }));
    const ensureIssue = vi.fn(async () => agree);
    vi.stubGlobal('window', { api: { getConfig: async () => ({}), saveConfig } });
    vi.doMock('../renderer/modules/issueCollectConsent.js', () => ({ hasIssueCopyrightConsent: () => false, ensureIssueCopyrightConsent: ensureIssue }));
    const gate = await import('../renderer/modules/imageCollectEngineConsent.js');
    return { allow: gate.collectEngineAllowPick, saveConfig, ensureIssue };
  }

  it('카드에서 관련 사진 찾기를 확정할 때 동의하면 기록하고 저장을 허용한다', async () => {
    const { allow, saveConfig } = await loadAllowPick(true);
    expect(await allow('collect-photos')).toBe(true);
    expect(saveConfig).toHaveBeenCalledTimes(1);
  });

  it('거절하면 저장을 허용하지 않고 아무것도 기록하지 않는다', async () => {
    const { allow, saveConfig } = await loadAllowPick(false);
    expect(await allow('collect-photos')).toBe(false);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('다른 엔진은 동의 창 없이 저장을 허용한다', async () => {
    const { allow, ensureIssue } = await loadAllowPick(false);
    expect(await allow('flow')).toBe(true);
    expect(ensureIssue).not.toHaveBeenCalled();
  });

  it('URL/이슈 수집 동의는 새 config 동의도 인정해 다시 묻지 않는다', async () => {
    vi.resetModules();
    const createElement = vi.fn(() => { throw new Error('동의 창이 뜨면 안 된다'); });
    vi.stubGlobal('document', { getElementById: () => null, createElement });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    vi.stubGlobal('window', { api: { getConfig: async () => ({ imageCollectConsent: { version: 1, agreedAt: '2026-11-03T00:00:00Z' } }) } });
    const { ensureIssueCopyrightConsent } = await import('../renderer/modules/issueCollectConsent.js');
    await expect(ensureIssueCopyrightConsent()).resolves.toBe(true);
    expect(createElement).not.toHaveBeenCalled();
  });

  it('진행 문구는 등록된 로그 전송기로도 나간다', async () => {
    const { emitCollectPhotosLog, setCollectPhotosLogSink } = await import('../main/services/collectPhotosEngine.js');
    const sink = vi.fn();
    setCollectPhotosLogSink(sink);
    emitCollectPhotosLog('2칸은 맞는 사진을 못 찾아 비워 둠');
    setCollectPhotosLogSink(null);
    emitCollectPhotosLog('전송기 없음');
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith('2칸은 맞는 사진을 못 찾아 비워 둠');
  });
});

class FakeSelect extends EventTarget {
  value = 'openai-image';
  dataset: Record<string, string> = {};
}

async function loadGate(opts: { stored?: unknown; agree: boolean }) {
  vi.resetModules();
  const saveConfig = vi.fn(async () => ({ success: true }));
  const select = new FakeSelect();
  vi.stubGlobal('document', { getElementById: () => select });
  vi.stubGlobal('window', { api: { getConfig: async () => ({ imageCollectConsent: opts.stored }), saveConfig } });
  vi.doMock('../renderer/modules/issueCollectConsent.js', () => ({
    hasIssueCopyrightConsent: () => false,
    ensureIssueCopyrightConsent: async () => opts.agree,
  }));
  const gate = await import('../renderer/modules/imageCollectEngineConsent.js');
  const downstream = vi.fn();
  gate.collectEngineWireSelect('image-source-select');
  select.addEventListener('change', () => downstream(select.value));
  const pick = async (value: string) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  return { select, saveConfig, downstream, pick };
}

describe('엔진 선택 시 동의 모달', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('../renderer/modules/issueCollectConsent.js'); });

  it('동의하면 설정에 기록하고 선택을 그대로 통과시킨다', async () => {
    const { select, saveConfig, downstream, pick } = await loadGate({ agree: true });
    await pick('collect-photos');
    expect(saveConfig).toHaveBeenCalledWith({ imageCollectConsent: expect.objectContaining({ version: IMAGE_COLLECT_CONSENT_VERSION }) });
    expect(select.value).toBe('collect-photos');
    expect(downstream).toHaveBeenCalledWith('collect-photos');
  });

  it('거절하면 이전 선택으로 되돌리고 다른 처리기는 이 선택을 보지 못한다', async () => {
    const { select, saveConfig, downstream, pick } = await loadGate({ agree: false });
    await pick('collect-photos');
    expect(select.value).toBe('openai-image');
    expect(saveConfig).not.toHaveBeenCalled();
    expect(downstream).not.toHaveBeenCalled();
  });

  it('이미 현재 버전으로 동의했으면 묻지 않고 통과시킨다', async () => {
    const stored = { version: IMAGE_COLLECT_CONSENT_VERSION, agreedAt: '2026-11-03T00:00:00Z' };
    const { select, saveConfig, downstream, pick } = await loadGate({ stored, agree: false });
    await pick('collect-photos');
    expect(select.value).toBe('collect-photos');
    expect(saveConfig).not.toHaveBeenCalled();
    expect(downstream).toHaveBeenCalledWith('collect-photos');
  });

  it('다른 엔진을 고르는 것은 건드리지 않는다', async () => {
    const { downstream, pick } = await loadGate({ agree: false });
    await pick('flow');
    expect(downstream).toHaveBeenCalledWith('flow');
  });
});
