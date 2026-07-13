export interface ScheduledAccountSummary {
  id: string;
  naverId?: string;
  blogId?: string;
}

export interface ScheduledAccountResolverInput {
  scheduledAccountId?: string;
  scheduledNaverId?: string;
  configuredNaverId?: string;
  configuredNaverPassword?: string;
  accounts: readonly ScheduledAccountSummary[];
  getCredentials: (accountId: string) => {
    naverId: string;
    naverPassword: string;
  } | null;
}

export interface ResolvedScheduledAccountCredentials {
  accountId?: string;
  naverId: string;
  naverPassword: string;
  source: 'account-manager' | 'current-config' | 'legacy-config';
}

function value(input: unknown): string {
  return String(input || '').trim();
}

function sameAccount(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function validCredentials(credentials: {
  naverId?: string;
  naverPassword?: string;
} | null | undefined): credentials is { naverId: string; naverPassword: string } {
  return Boolean(value(credentials?.naverId) && value(credentials?.naverPassword));
}

export function resolveScheduledAccountCredentials(
  input: ScheduledAccountResolverInput,
): ResolvedScheduledAccountCredentials {
  const scheduledAccountId = value(input.scheduledAccountId);
  const scheduledNaverId = value(input.scheduledNaverId);
  const configuredNaverId = value(input.configuredNaverId);
  const configuredNaverPassword = value(input.configuredNaverPassword);
  const hasBinding = Boolean(scheduledAccountId || scheduledNaverId);

  if (!hasBinding) {
    if (configuredNaverId && configuredNaverPassword) {
      return {
        naverId: configuredNaverId,
        naverPassword: configuredNaverPassword,
        source: 'legacy-config',
      };
    }
    throw new Error('SCHEDULED_ACCOUNT_UNAVAILABLE:legacy schedule has no usable account');
  }

  if (scheduledNaverId
    && configuredNaverId
    && configuredNaverPassword
    && sameAccount(scheduledNaverId, configuredNaverId)) {
    return {
      accountId: scheduledAccountId || undefined,
      naverId: configuredNaverId,
      naverPassword: configuredNaverPassword,
      source: 'current-config',
    };
  }

  const matchedAccount = input.accounts.find((account) => (
    (scheduledAccountId && account.id === scheduledAccountId)
    || (scheduledNaverId && [account.naverId, account.blogId]
      .map(value)
      .some((candidate) => candidate && sameAccount(candidate, scheduledNaverId)))
  ));
  if (matchedAccount) {
    const credentials = input.getCredentials(matchedAccount.id);
    if (validCredentials(credentials)
      && (!scheduledNaverId || sameAccount(credentials.naverId, scheduledNaverId))) {
      return {
        accountId: matchedAccount.id,
        naverId: value(credentials.naverId),
        naverPassword: value(credentials.naverPassword),
        source: 'account-manager',
      };
    }
  }

  throw new Error('SCHEDULED_ACCOUNT_UNAVAILABLE:the account selected at queue time is not available');
}
