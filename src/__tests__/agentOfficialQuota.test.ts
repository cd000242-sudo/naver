import { describe, expect, it } from 'vitest';
import { parseCodexQuota, parseClaudeQuota, cleanAccountLabel } from '../agentCli/officialQuotaFormat';

describe('official quota response normalization', () => {
  it('reads official multi-bucket windows, not local call estimates', () => {
    const result = parseCodexQuota({ rateLimitsByLimitId: { codex: { primary: {usedPercent:25,windowDurationMins:300,resetsAt:1900000000}, secondary:{usedPercent:80,windowDurationMins:10080,resetsAt:1900010000} } } });
    expect(result).toHaveLength(2); expect(result[0].remainingPercent).toBe(75);
    expect(result[1].remainingPercent).toBe(20); expect(result[0].resetsAt).toBe(1900000000000);
  });
  it('does not treat unknown, invalid or expired fields as full quota', () => {
    expect(parseCodexQuota({rateLimits:{primary:{usedPercent:null},secondary:{usedPercent:'20'}}})).toEqual([]);
    expect(parseClaudeQuota({five_hour:null,seven_day:{utilization:-1}})).toEqual([]);
    expect(parseClaudeQuota({five_hour:{utilization:150}})).toEqual([]);
  });
  it('supports legacy Codex and Claude explicit zero remaining and UTC reset', () => {
    expect(parseCodexQuota({rateLimits:{primary:{usedPercent:100,windowDurationMins:300}}})[0].remainingPercent).toBe(0);
    const result = parseClaudeQuota({five_hour:{utilization:20,resets_at:'2030-01-01T00:00:00Z'},seven_day:{utilization:0},seven_day_sonnet:{utilization:45}});
    expect(result.map(x=>x.remainingPercent)).toEqual([80,100,55]);
    expect(result[0].resetsAt).toBe(Date.parse('2030-01-01T00:00:00Z'));
  });
  it('only accepts bounded account labels and never serializes arbitrary response fields', () => {
    expect(cleanAccountLabel('a@example.com')).toBe('a@example.com');
    expect(cleanAccountLabel('Bearer secret-token')).toBeUndefined();
    expect(cleanAccountLabel('line\nsecret')).toBeUndefined();
    expect(cleanAccountLabel('x'.repeat(400))).toBeUndefined();
    expect(JSON.stringify(parseClaudeQuota({five_hour:{utilization:10,accessToken:'secret'}}))).not.toContain('secret');
  });
});
