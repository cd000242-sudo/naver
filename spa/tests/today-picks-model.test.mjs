import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/todayPicksModel.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const rows = Array.from({length: 30}, (_, index) => ({ keyword: `검색어 ${index}`, ratio: index < 12 ? 2 : 0.4, ...(index >= 12 && index < 17 ? {seasonPeakMonth: 10} : {}) }));

test('all thirty published rows are visible when unlocked, while free preview remains three', () => {
  assert.equal(model.visiblePickRows(rows, true).length, 30);
  assert.equal(model.visiblePickRows(rows, false).length, 3);
  assert.equal(model.visiblePickRows(rows.slice(0, 2), false).length, 2);
  assert.equal(rows.length, 30);
});

test('counts distinguish golden, seasonal and ordinary measured candidates', () => {
  const summary = model.summarizePickTopic({rows, golden: 99, targetCount: 30, shortfall: 0}, 1);
  assert.deepEqual(summary, {total: 30, target: 30, shortfall: 0, golden: 12, seasonal: 5, general: 13});
  assert.equal(model.pickCountText(summary), '전체 30개 / 목표 30개 · 황금 12 · 시즌 앞 5 · 일반 13');
});

test('legacy topics show actual counts and incomplete thirty target without invented rows', () => {
  const summary = model.summarizePickTopic({rows: rows.slice(0, 10)}, 1, 30);
  assert.equal(summary.total, 10);
  assert.equal(summary.target, 30);
  assert.equal(summary.shortfall, 20);
  assert.equal(model.summarizePickTopic({rows: []}, 1).target, 30);
});

test('new and old rows do not receive repeat claims; repeated rows get KST last appearance', () => {
  assert.equal(model.pickFreshnessLabel({}), null);
  assert.equal(model.pickFreshnessLabel({freshness: {status:'new'}}), null);
  assert.equal(model.pickFreshnessLabel({freshness: {status:'repeated', lastShownAt:'2026-09-27T23:00:00Z'}}), '재추천 · 9월 28일 노출');
  assert.equal(model.pickFreshnessLabel({freshness: {status:'repeated', lastShownAt:'bad'}}), '재추천');
});

test('invalid targets and seasonal markers cannot inflate display claims', () => {
  const summary = model.summarizePickTopic({rows: [{ratio:0.3,seasonPeakMonth:99},{ratio:2,seasonPeakMonth:10}], targetCount:-1, shortfall:999}, 1, NaN);
  assert.deepEqual(summary, {total:2,target:30,shortfall:28,golden:1,seasonal:0,general:1});
});
