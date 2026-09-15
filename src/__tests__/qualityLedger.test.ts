import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  QUALITY_LEDGER_FILE, QUALITY_LEDGER_MAX_LINES, appendQualityLedger, buildQualityLedgerEntry, readQualityLedger,
  recordQualityLedger, summarizeQualityLedger, tallyWarningKinds, warningKindOf,
} from '../content/qualityLedger.js';

/**
 * [2026-09-15] Quality ledger — "어디서 첫 생성 점수를 잃는가"를 20~30편 뒤에 숫자로 답하기 위한 기록.
 * 기록만 한다: 발행 차단 없음, 모델 호출 없음, 실패는 삼킨다 (QUALITY_HARNESS 절대 규칙).
 */
const content = {
  title: '주택연금 배우자 승계, 채무인수 기한 놓치면 어떻게 되나',
  bodyPlain: '본문 '.repeat(400),
  quality: {
    warnings: ['[QualityGate90] 목표 근접 통과: mode=88', 'TitleAnswer: 약속 2개 중 1개 미상환', '[QualityGate90] mode 점수 미달', '기타 경고'],
    generationAttempt: 2,
    qualityGate: {
      finalScore: 84, modeScore: 82, humanlikeScore: 70, safetyScore: 95, decision: 'pass',
      quality90Miss: true, quality90Reasons: ['mode 82 < 90', 'humanlike 70 < 75'],
    },
  },
  __throughline: { held: false },
};
const source = { contentMode: 'seo', keyword: '주택연금 배우자 승계' };

describe('quality ledger — entry', () => {
  it('점수·판정·경고 종류·시도 횟수를 한 줄로 만든다 (순수 함수)', () => {
    const entry = buildQualityLedgerEntry(content, source, new Date('2026-09-15T03:00:00Z'));
    expect(entry.at).toBe('2026-09-15T03:00:00.000Z');
    expect(entry.mode).toBe('seo');
    expect(entry.keyword).toBe('주택연금 배우자 승계');
    expect(entry.attempt).toBe(2);
    expect(entry.finalScore).toBe(84);
    expect(entry.decision).toBe('pass');
    expect(entry.quality90Miss).toBe(true);
    expect(entry.quality90Reasons).toEqual(['mode 82 < 90', 'humanlike 70 < 75']);
    expect(entry.warningKinds).toEqual({ QualityGate90: 2, TitleAnswer: 1, '기타 경고': 1 });
    expect(entry.warningCount).toBe(4);
    expect(entry.throughlineHeld).toBe(false);
    expect(entry.bodyChars).toBeGreaterThan(1000);
  });

  it('점수가 없어도 깨지지 않는다 — null 과 unknown 으로 남긴다', () => {
    const entry = buildQualityLedgerEntry({ title: 't' }, {});
    expect(entry.finalScore).toBeNull();
    expect(entry.decision).toBe('unknown');
    expect(entry.attempt).toBe(0);
    expect(entry.warningKinds).toEqual({});
    expect(entry.throughlineHeld).toBeNull();
  });

  it('경고 종류는 앞 태그로 묶는다', () => {
    expect(warningKindOf('[Fidelity] 압축 0.4')).toBe('Fidelity');
    expect(warningKindOf('TitleAnswer: 미상환')).toBe('TitleAnswer');
    expect(warningKindOf('아주 긴 경고 문장이 태그 없이 들어오면 앞 열여섯 글자만')).toBe('아주 긴 경고 문장이 태그 없이 들어오면 앞 열여섯 글자만'.slice(0, 16));
    expect(tallyWarningKinds(['[A] x', '[A] y', 'B: z'])).toEqual({ A: 2, B: 1 });
  });
});

describe('quality ledger — file', () => {
  let dir = '';
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'quality-ledger-')); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('한 줄씩 붙이고, 상한을 20% 넘으면 뒤에서 상한만큼만 남긴다', async () => {
    const file = path.join(dir, QUALITY_LEDGER_FILE);
    const entry = buildQualityLedgerEntry(content, source);
    await appendQualityLedger(file, entry);
    await appendQualityLedger(file, { ...entry, keyword: 'second' });
    const read = await readQualityLedger(file);
    expect(read.map((e) => e.keyword)).toEqual(['주택연금 배우자 승계', 'second']);

    const many = Array.from({ length: Math.ceil(QUALITY_LEDGER_MAX_LINES * 1.2) }, (_, i) => JSON.stringify({ ...entry, keyword: `k${i}` })).join('\n');
    await fs.writeFile(file, `${many}\n`, 'utf8');
    await appendQualityLedger(file, { ...entry, keyword: 'last' });
    const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter((l) => l.trim());
    expect(lines.length).toBe(QUALITY_LEDGER_MAX_LINES);
    expect(JSON.parse(lines[lines.length - 1]).keyword).toBe('last');
  });

  it('없는 파일은 빈 배열, 깨진 줄은 건너뛴다', async () => {
    const file = path.join(dir, QUALITY_LEDGER_FILE);
    expect(await readQualityLedger(file)).toEqual([]);
    await fs.writeFile(file, `{"bad json\n${JSON.stringify(buildQualityLedgerEntry(content, source))}\n`, 'utf8');
    expect((await readQualityLedger(file)).length).toBe(1);
  });

  it('recordQualityLedger 는 경로 함수가 터져도 생성을 막지 않는다 (기록만 한다)', async () => {
    expect(() => recordQualityLedger(content, source, () => { throw new Error('no electron'); })).not.toThrow();
    recordQualityLedger(content, source, () => dir);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await readQualityLedger(path.join(dir, QUALITY_LEDGER_FILE))).length).toBe(1);
  });
});

describe('quality ledger — summary', () => {
  it('중앙값·80 미만·90 이상·판정·미달 사유·경고 종류를 센다', () => {
    const base = buildQualityLedgerEntry(content, source);
    const entries = [
      { ...base, finalScore: 70, decision: 'patch', attempt: 1 },
      { ...base, finalScore: 84, decision: 'pass', attempt: 2 },
      { ...base, finalScore: 92, decision: 'pass', attempt: 1, quality90Miss: false, quality90Reasons: [] },
    ];
    const s = summarizeQualityLedger(entries);
    expect(s.count).toBe(3);
    expect(s.medianFinal).toBe(84);
    expect(s.under80).toBe(1);
    expect(s.over90).toBe(1);
    expect(s.decisions).toEqual({ patch: 1, pass: 2 });
    expect(s.quality90MissRate).toBeCloseTo(2 / 3);
    expect(s.retryRate).toBeCloseTo(1 / 3);
    expect(s.topWarningKinds[0]).toEqual(['QualityGate90', 6]);
    expect(s.topQuality90Reasons[0]).toEqual(['mode 82 < 90', 2]);
    expect(summarizeQualityLedger([]).medianFinal).toBeNull();
  });
});

describe('quality ledger — wiring', () => {
  const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');

  it('모든 legacy 반환이 지나는 runPostGenValidator 에서 한 번 기록하고, 성공 시도 번호를 남긴다', () => {
    expect(generator).toContain("import { recordQualityLedger } from './content/qualityLedger.js';");
    const validator = generator.slice(generator.indexOf('function runPostGenValidator('), generator.indexOf("if (!isFeatureEnabled('validator')) return;"));
    expect(validator).toContain("recordQualityLedger(content, source, () => app.getPath('userData'))");
    expect(generator).toContain('(optimized.quality as any).generationAttempt = attempt + 1');
    // records only — no new gate, no regeneration trigger
    expect(generator.match(/recordQualityLedger\(/g)?.length).toBe(1);
  });
});
