import { describe, expect, it, vi } from 'vitest';
import { acquireScheduledPublishQuota } from '../scheduler/scheduledPublishQuota';

describe('scheduled publish quota lease', () => {
  it('consumes once and refunds once when a free-tier publish fails', async () => {
    const consume = vi.fn().mockResolvedValue(undefined);
    const refund = vi.fn().mockResolvedValue(undefined);
    const lease = await acquireScheduledPublishQuota({
      validate: async () => ({ allowed: true }),
      isFreeTierUser: async () => true,
      consume,
      refund,
    });

    await lease.rollback();
    await lease.rollback();

    expect(consume).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('keeps the consumed quota after a confirmed publish', async () => {
    const refund = vi.fn().mockResolvedValue(undefined);
    const lease = await acquireScheduledPublishQuota({
      validate: async () => ({ allowed: true }),
      isFreeTierUser: async () => true,
      consume: async () => undefined,
      refund,
    });

    lease.commit();
    await lease.rollback();

    expect(refund).not.toHaveBeenCalled();
  });

  it('does not start or consume when license or quota validation fails', async () => {
    const consume = vi.fn().mockResolvedValue(undefined);

    await expect(acquireScheduledPublishQuota({
      validate: async () => ({ allowed: false, message: 'quota exhausted' }),
      isFreeTierUser: async () => true,
      consume,
      refund: async () => undefined,
    })).rejects.toThrow(/SCHEDULED_PUBLISH_NOT_ALLOWED:quota exhausted/);

    expect(consume).not.toHaveBeenCalled();
  });
});
