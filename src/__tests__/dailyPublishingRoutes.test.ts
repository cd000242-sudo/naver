import { describe, expect, it, vi } from 'vitest';
import { createDailyPublishingApi } from '../main/ldb-daily-publishing.js';
const plan = { accountId: 'sports', categoryId: '10', enabled: true, mode: 'publish', slots: [{ time: '07:00', count: 1 }], generator: 'app-settings', topic: '' };
function fixture() {
  let state = { version: 1, revision: 0, plans: [] as typeof plan[], runs: [] };
  const scheduler = {
    initialize: vi.fn(async () => {}), getState: () => structuredClone(state),
    replacePlans: vi.fn(async (plans, revision) => { if (revision !== state.revision) throw new Error('DAILY_REVISION_CONFLICT'); state = { ...state, plans, revision: revision + 1 }; }),
    stop: vi.fn(async () => { state = { ...state, plans: state.plans.map(p => ({ ...p, enabled: false })), revision: state.revision + 1 }; }),
  };
  const allowed = vi.fn(async () => ({ ready: true, paid: true, label: '사용 가능' }));
  const validate = vi.fn(async () => {});
  const api = createDailyPublishingApi({ scheduler: scheduler as never, availability: allowed, validatePlan: validate });
  return { api, scheduler, allowed, validate };
}
describe('daily publishing bridge routes', () => {
  it('saves only after account, paid entitlement and revision validation', async () => {
    const f = fixture();
    const result = await f.api.request('POST', '/v1/automations/plan', { revision: 0, plan });
    expect(result.status).toBe(200); expect(result.body.plans).toEqual([expect.objectContaining(plan)]);
    expect(f.validate).toHaveBeenCalledOnce(); expect(f.scheduler.replacePlans).toHaveBeenCalledOnce();
    expect((await f.api.request('POST', '/v1/automations/plan', { revision: 0, plan })).status).toBe(409);
  });
  it('does not start without paid entitlement and app readiness', async () => {
    const f = fixture(); f.allowed.mockResolvedValue({ ready: true, paid: false, label: '유료 기능' });
    const denied = await f.api.request('POST', '/v1/automations/plan', { revision: 0, plan });
    expect(denied.status).toBe(403); expect(denied.body.code).toBe('ANNUAL_PLAN_REQUIRED');
    expect(f.scheduler.replacePlans).not.toHaveBeenCalled();
  });
  it('allows stopping and status after app login expires', async () => {
    const f = fixture(); f.allowed.mockResolvedValue({ ready: false, paid: false, label: '로그인 필요' });
    expect((await f.api.request('POST', '/v1/automations/stop', { revision: 0, accountId: 'sports' })).status).toBe(200);
    expect(f.scheduler.stop).toHaveBeenCalledOnce();
    expect((await f.api.request('GET', '/v1/automations/status')).body.availability.ready).toBe(false);
  });
  it('rejects unknown fields, methods, paths and malformed revisions', async () => {
    const f = fixture();
    for (const body of [{ revision: -1, plan }, { revision: 0, plan, password: 'private' }, null]) {
      expect((await f.api.request('POST', '/v1/automations/plan', body)).status).toBe(400);
    }
    expect((await f.api.request('DELETE', '/v1/automations/status')).status).toBe(404);
    expect((await f.api.request('GET', '/v1/automations/secret')).status).toBe(404);
    expect(f.scheduler.replacePlans).not.toHaveBeenCalled();
  });
  it('does not return filesystem errors or secrets', async () => {
    const f = fixture(); f.validate.mockRejectedValue(new Error('token=private C:/Users/private/file'));
    const result = await f.api.request('POST', '/v1/automations/plan', { revision: 0, plan });
    expect(result.status).toBe(409); expect(JSON.stringify(result)).not.toMatch(/private|C:\//);
  });
});
