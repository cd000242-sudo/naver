export interface ExclusiveLease {
  readonly token: string;
  readonly owner: string;
  readonly acquiredAt: number;
}

export class ExclusiveLeaseCoordinator {
  private current: ExclusiveLease | null = null;
  private sequence = 0;

  tryAcquire(owner: string): ExclusiveLease | null {
    if (this.current) return null;

    const normalizedOwner = String(owner || '').trim() || 'unknown';
    const lease = Object.freeze({
      token: `${Date.now()}-${++this.sequence}`,
      owner: normalizedOwner,
      acquiredAt: Date.now(),
    });
    this.current = lease;
    return lease;
  }

  release(lease: ExclusiveLease): boolean {
    if (!this.current || !lease) return false;
    if (this.current.token !== lease.token || this.current.owner !== lease.owner) return false;
    this.current = null;
    return true;
  }

  snapshot(): ExclusiveLease | null {
    return this.current;
  }
}

