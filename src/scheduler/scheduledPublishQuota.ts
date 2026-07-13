export interface ScheduledPublishQuotaDependencies {
  validate: () => Promise<{ allowed: true } | { allowed: false; message?: string }>;
  isFreeTierUser: () => Promise<boolean>;
  consume: () => Promise<unknown>;
  refund: () => Promise<unknown>;
}

export interface ScheduledPublishQuotaLease {
  readonly consumed: boolean;
  commit: () => void;
  rollback: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

export async function acquireScheduledPublishQuota(
  dependencies: ScheduledPublishQuotaDependencies,
): Promise<ScheduledPublishQuotaLease> {
  const validation = await dependencies.validate();
  if (!validation.allowed) {
    throw new Error(`SCHEDULED_PUBLISH_NOT_ALLOWED:${validation.message || 'license or quota check failed'}`);
  }

  if (!(await dependencies.isFreeTierUser())) {
    return {
      consumed: false,
      commit: () => undefined,
      rollback: async () => undefined,
    };
  }

  try {
    await dependencies.consume();
  } catch (error) {
    throw new Error(`SCHEDULED_PUBLISH_QUOTA_CONSUME_FAILED:${errorMessage(error)}`);
  }

  let settled = false;
  return {
    consumed: true,
    commit: () => {
      settled = true;
    },
    rollback: async () => {
      if (settled) return;
      settled = true;
      await dependencies.refund();
    },
  };
}
