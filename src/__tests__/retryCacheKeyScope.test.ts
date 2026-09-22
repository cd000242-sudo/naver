import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Source-assertion test: both retry-cache key builders write to the SAME
// window cache key (__leaderFullAutoContentRetryCache) and are read with an
// OR fallback across the two modules. If only one of them scopes the key by
// account/date, the other silently replays stale content after an account
// switch or overnight retry.

function extractFunctionBody(src: string, fnName: string): string {
  const start = src.indexOf(`function ${fnName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const braceStart = src.indexOf('{', start);
  expect(braceStart).toBeGreaterThan(start);

  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(start, i + 1);
}

describe('retry-cache key scope (accountId + dateBucket)', () => {
  const fullAutoFlowPath = resolve(__dirname, '../renderer/modules/fullAutoFlow.ts');
  const publishingHandlersPath = resolve(__dirname, '../renderer/modules/publishingHandlers.ts');

  const fullAutoFlowSrc = readFileSync(fullAutoFlowPath, 'utf8');
  const publishingHandlersSrc = readFileSync(publishingHandlersPath, 'utf8');

  it('fullAutoFlow.buildFullAutoContentReuseKey includes accountId and dateBucket', () => {
    const body = extractFunctionBody(fullAutoFlowSrc, 'buildFullAutoContentReuseKey');
    expect(body).toMatch(/accountId\s*:/);
    expect(body).toMatch(/dateBucket\s*:/);
    // [2026-09-22 P1] local date bucket (UTC put 00:00~09:00 KST in yesterday's bucket)
    expect(body).toMatch(/new Date\(\)\.getFullYear\(\)/);
    expect(body).toMatch(/getDate\(\)\)\.padStart\(2, '0'\)/);
    expect(body).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
  });

  it('publishingHandlers.buildPublishContentReuseKey includes accountId and dateBucket', () => {
    const body = extractFunctionBody(publishingHandlersSrc, 'buildPublishContentReuseKey');
    expect(body).toMatch(/accountId\s*:/);
    expect(body).toMatch(/dateBucket\s*:/);
    // [2026-09-22 P1] local date bucket (UTC put 00:00~09:00 KST in yesterday's bucket)
    expect(body).toMatch(/new Date\(\)\.getFullYear\(\)/);
    expect(body).toMatch(/getDate\(\)\)\.padStart\(2, '0'\)/);
    expect(body).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
  });
});
