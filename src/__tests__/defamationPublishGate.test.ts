/**
 * defamationPublishGate.test.ts
 *
 * SPEC-DEFAMATION-2026 P1(C)/P2(D) 배선 잠금 — 발행 경계 위험 게이트 + AI기본법 고지.
 * 인라인 번들/IPC 배선은 tsc/lint가 못 잡는 사각지대라(메모리: 런타임만 발현) 소스 문자열로 고정한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

describe('발행 경계 위험 게이트(C) 배선', () => {
  it('main.ts가 registerDefamationHandlers를 import + 호출한다', () => {
    const main = read('src/main.ts');
    expect(main).toContain("from './main/ipc/defamationHandlers.js'");
    expect(main).toContain('registerDefamationHandlers()');
  });

  it('IPC 핸들러가 defamation:checkPublishRisk 채널을 등록한다', () => {
    const h = read('src/main/ipc/defamationHandlers.ts');
    expect(h).toContain("ipcMain.handle('defamation:checkPublishRisk'");
    expect(h).toContain('evaluateCelebrityPublishRisk');
  });

  it('preload이 checkCelebrityRisk를 window.api로 노출한다', () => {
    const preload = read('src/preload.ts');
    expect(preload).toContain('checkCelebrityRisk');
    expect(preload).toContain('defamation:checkPublishRisk');
  });

  it('게이트가 실제 라이브 발행 진입점(executeUnifiedAutomation)에 배선돼 있다 — 죽은 코드 금지', () => {
    const r = read('src/renderer/renderer.ts');
    // 게이트 helper 존재 + checkCelebrityRisk 호출 + 취소 가능(window.confirm, 하드차단 아님)
    expect(r).toContain('async function celebrityPublishGate');
    expect(r).toContain('window.api.checkCelebrityRisk');
    expect(r).toContain('window.confirm');
    // 핵심: 게이트가 모든 라이브 버튼이 지나는 executeUnifiedAutomation 진입부에서 호출돼야 한다.
    //   (과거 회귀: 존재하지 않는 run-button에 바인딩된 죽은 runAutomation 안에만 있어 무효였음)
    const defIdx = r.indexOf('async function executeUnifiedAutomation');
    expect(defIdx).toBeGreaterThan(-1);
    const gateCallIdx = r.indexOf('celebrityPublishGate(formData)', defIdx);
    const runLeaseIdx = r.indexOf("tryAcquirePipelineRun('unified')", defIdx);
    expect(gateCallIdx).toBeGreaterThan(defIdx);
    expect(gateCallIdx).toBeLessThan(runLeaseIdx);
    // 무인(연속발행)에서는 confirm 억제 — isContinuousMode 분기 존재
    expect(r).toContain('isContinuousMode');
  });

  it('게이트가 보호하는 실제 발행 버튼이 index.html에 존재한다(배선 대상 실존)', () => {
    const html = read('public/index.html');
    expect(html).toContain('id="semi-auto-publish-btn"');
    expect(html).toContain('id="full-auto-publish-btn"');
  });

  it('취소를 발행 실패로 오인하지 않는다 — 게이트 취소 마커 + 풀오토 핸들러 분기', () => {
    const r = read('src/renderer/renderer.ts');
    const ph = read('src/renderer/modules/publishingHandlers.ts');
    // 게이트 취소 시 마커 설정 + 진행률 오버레이 정리
    expect(r).toContain('_publishGateCancelled = true');
    expect(r).toContain("document.getElementById(id)?.remove()");
    // 풀오토 핸들러가 assert(false 실패 throw) 전에 취소 마커를 분기 처리
    expect(ph).toContain('_publishGateCancelled');
    const assertIdx = ph.indexOf('assertFullAutoAutomationResult(automationResult');
    const cancelIdx = ph.indexOf('_publishGateCancelled');
    expect(cancelIdx).toBeGreaterThan(-1);
    expect(cancelIdx).toBeLessThan(assertIdx); // 취소 분기가 assert보다 먼저
  });
});

describe('AI기본법 고지(D) 배선', () => {
  it('index.html에 앱 내부 상시 AI 고지가 있다(블로그 본문 미주입)', () => {
    const html = read('public/index.html');
    expect(html).toContain('ai-basic-law-notice');
    expect(html).toContain('AI 생성물');
  });

  it('legalRisk 뱃지 tooltip에 허위조작정보법 안내가 배선돼 있다', () => {
    const r = read('src/renderer/renderer.ts');
    expect(r).toContain('허위조작정보법');
  });
});
