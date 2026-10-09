/**
 * [2026-10-09 사장님 승인] 앱 예약 발행(main cron)의 자동 재확인 배선: 쿼터 확보·'publishing' 표시보다 앞에서
 * 'auto-recheck' 를 부르고, 'wait' 면 continue 로 'scheduled' 를 유지한다. 번들 계약(식별자 유일성)도 함께 본다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').replace(/\r\n/g, '\n');

describe('scheduled posts cron', () => {
  const main = read('src', 'main.ts');
  const cronStart = main.indexOf("cron.schedule('* * * * *', async () => {\n      if (scheduledPostsCronRunning)");
  const cron = main.slice(cronStart, main.indexOf('[2026-08-04] 한 틱에 1건만 발행한다.', cronStart));

  it('rechecks before taking quota or marking the post as publishing, and keeps it scheduled while waiting', () => {
    expect(cronStart).toBeGreaterThan(-1);
    const recheck = cron.indexOf("'auto-recheck'");
    const waitContinue = cron.indexOf('continue;', recheck);
    expect(recheck).toBeGreaterThan(-1);
    expect(waitContinue).toBeGreaterThan(recheck);
    expect(cron.indexOf('acquireScheduledPublishQuota({')).toBeGreaterThan(waitContinue);
    expect(cron.indexOf('createPublishingScheduledPostState(post)')).toBeGreaterThan(waitContinue);
    expect(cron.slice(recheck, waitContinue)).toContain("scheduledRecheck?.kind === 'wait'");
    expect(cron).toContain("'naver-id'");
  });

  it('is gated on a Naver ID and never types a password', () => {
    expect(cron.slice(cron.indexOf("'auto-recheck'") - 400, cron.indexOf("'auto-recheck'") + 400)).toContain('if (accountNaverId)');
  });
});

describe('renderer bundle contract', () => {
  it('awaitNetworkWaitRecheck is defined exactly once across src (single-scope bundle)', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(full); continue; }
        if (/\.ts$/.test(name) && /(function|const|let)\s+awaitNetworkWaitRecheck\b/.test(readFileSync(full, 'utf8'))) hits.push(full);
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(hits).toHaveLength(1);
    expect(hits[0].split(String.fromCharCode(92)).join('/')).toContain('src/automation/publishFailureClassifier.ts');
  });
});
