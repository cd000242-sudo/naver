import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/main.ts', 'utf8');
const start = source.indexOf('const handleMultiAccountPublish = async');
const body = source.slice(start, source.indexOf("ipcMain.handle('multiAccount:publish'", start));
describe('private daily reservation main boundary', () => {
  it('holds unverified native adapters before browser downloads and paid work', () => {
    const gate = body.indexOf('assertDailyNativeReservationAdapterReady(dailyNativeReservationAdapter)');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(body.indexOf('ensureChromiumAvailable'));
    expect(gate).toBeLessThan(body.indexOf('generateStructuredContentWithProductPolicy'));
    expect(body.slice(0, gate)).toContain("dailyContext?.mode === 'schedule'");
  });
  it('checks the original deadline on each paid generation and final writer entry', () => {
    const generation = body.slice(body.indexOf('const generate = async'), body.indexOf('let generated;', body.indexOf('const generate = async')));
    expect(generation).toContain('assertDailyScheduleDeadline(dailyContext)');
    const final = body.slice(body.indexOf('execute: async (approvedPayload)'), body.indexOf('confirm: confirmContentPolicyManualReview'));
    expect(final).toContain('assertDailyScheduleDeadline(dailyContext)');
    expect(final).toContain('attachDailyNativeReservation(approvedPayload');
    expect(final).toContain('blogId: account.blogId');
    expect(final).toContain('scheduledFor: dailyContext.scheduledFor!');
    expect(final).toContain('adapter: dailyNativeReservationAdapter');
    expect(final).not.toContain('new Date(Date.now()');
  });
  it('only forwards successful native-list proof returned from automation', () => {
    expect(body).toContain('scheduledPublication: result.scheduledPublication');
    expect(body).not.toContain('scheduledPublication: options.scheduledPublication');
  });
  it('provides the same native adapter to the desktop runtime and publication guard', () => {
    expect(source).toContain('const dailyNativeReservationAdapter = createDailyNativeReservationAdapter()');
    expect(source).toContain('nativeReservationReady: () => Boolean(dailyNativeReservationAdapter)');
  });
});
