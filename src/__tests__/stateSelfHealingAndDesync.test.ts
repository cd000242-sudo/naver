/**
 * [v2.11.136] 트랙 A-2(진실원천 이원화)·A-3(자기치유) 회귀 잠금.
 *
 * - A-2/A-1 팩트체크: 드롭다운(localStorage) ↔ 생성(config) desync — change 시
 *   config 즉시 반영 + 모달 로드 시 config 복원으로 SSOT=config 통일.
 * - A-2/A-8 다중계정 톤: main.ts가 렌더러 선택을 무시하던 비대칭 정렬.
 * - A-3/A-1 발행 원장: 손상 JSON을 격리+재생성해 영구 차단 방지(quota식).
 * - A-3/A-3 유사도 저장 실패: integrity pause 유발 → advisory 강등.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PublicationStateStore } from '../contentPolicy/publicationStateStore';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('A-2 desync 소스 잠금', () => {
  it('팩트체크: 드롭다운 change가 config에 즉시 반영된다', () => {
    const html = fs.readFileSync(path.join(ROOT, '..', 'public/index.html'), 'utf-8');
    expect(html).toMatch(/addEventListener\('change'[\s\S]{0,400}saveConfig\(\{[\s\S]{0,120}factCheckEngine: el\.value/);
  });

  it('팩트체크: 모달 로드 시 config에서 드롭다운을 복원한다', () => {
    const ui = read('renderer/modules/priceInfoModal.ts');
    expect(ui).toMatch(/getElementById\('fact-check-engine'\)[\s\S]{0,300}config[\s\S]{0,60}factCheckEngine/);
    expect(ui).toMatch(/usePerplexityFactCheck === true \? 'perplexity' : 'auto'/);
  });

  it('다중계정 톤: 렌더러 선택(options)을 계정설정보다 우선한다', () => {
    const main = read('main.ts');
    expect(main).toMatch(/toneStyle: options\?\.toneStyle \?\? account\.settings\?\.toneStyle \?\? 'friendly'/);
  });
});

describe('A-3 자기치유: 발행 원장 손상 → 격리 + 재생성', () => {
  let dir = '';
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pubstate-heal-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const STATE_FILE = 'content-policy-publication-state.json';

  it('손상 JSON을 읽으면 throw 대신 initialState를 돌려주고 파일을 재생성한다', async () => {
    writeFileSync(join(dir, STATE_FILE), '{ this is not : valid json ]]');
    const store = new PublicationStateStore(dir);

    const state = await store.load();
    expect(state.status).toBe('ACTIVE');
    expect(state.last_advisory_reason).toBe('STATE_REBUILT_FROM_CORRUPT');

    // 재생성된 파일은 유효 JSON — 다음 읽기가 다시 손상으로 실패하지 않는다.
    const persisted = JSON.parse(readFileSync(join(dir, STATE_FILE), 'utf8'));
    expect(persisted.status).toBe('ACTIVE');
    // 손상 원본은 .corrupt-* 로 격리된다.
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('재생성 후 다시 로드해도 정상 — 재-치유 없이 유효 파일로 안정(영구 고착 없음)', async () => {
    writeFileSync(join(dir, STATE_FILE), '깨진내용');
    const store = new PublicationStateStore(dir);
    await store.load();
    const corruptCountAfterFirst = readdirSync(dir).filter((f) => f.includes('.corrupt-')).length;
    const second = await store.load();
    expect(second.status).toBe('ACTIVE'); // 발행 진행 가능
    // 2차 로드는 유효 JSON을 읽었을 뿐 다시 격리/치유하지 않는다.
    expect(readdirSync(dir).filter((f) => f.includes('.corrupt-')).length).toBe(corruptCountAfterFirst);
  });

  it('정상 파일은 그대로 로드된다 (자기치유가 정상값을 건드리지 않음)', async () => {
    const store = new PublicationStateStore(dir);
    await store.recordAdvisory('TEST_MARKER');
    const loaded = await store.load();
    expect(loaded.status).toBe('ACTIVE');
    expect(loaded.last_advisory_reason).toBe('TEST_MARKER');
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(false);
  });
});

describe('A-3 유사도 저장 실패 advisory 강등 (소스 잠금)', () => {
  it('policyService가 repository.record 실패를 try/catch로 advisory 강등한다', () => {
    const code = read('contentPolicy/policyService.ts');
    expect(code).toMatch(/try \{\s*await repository\.record\(recentPost\);\s*\} catch/);
    expect(code).toMatch(/recordAdvisory\('POLICY_RECENT_POSTS_WRITE_FAILED'\)/);
  });
});
