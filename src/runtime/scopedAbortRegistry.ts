import { randomUUID } from 'crypto';

export interface ScopedAbortOperation {
  id: string;
  controller: AbortController;
  startedAt: string;
}

interface ActiveOperation extends ScopedAbortOperation {
  lastAbortReason?: string;
}

function normalizeRequestId(value: unknown, scope: string): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (/^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) return candidate;
  return `${scope}-${randomUUID()}`;
}

/** Keeps cancellation local to one logical job instead of a process-wide flag. */
export class ScopedAbortRegistry {
  private readonly operations = new Map<string, ActiveOperation>();

  constructor(private readonly scope: string) {}

  begin(requestId?: unknown): ScopedAbortOperation {
    const id = normalizeRequestId(requestId, this.scope);
    if (this.operations.has(id)) throw new Error(`OPERATION_ALREADY_ACTIVE:${this.scope}:${id}`);
    const operation: ActiveOperation = {
      id,
      controller: new AbortController(),
      startedAt: new Date().toISOString(),
    };
    this.operations.set(id, operation);
    return { ...operation };
  }

  abort(requestId: string, reason = 'operator request'): boolean {
    const operation = this.operations.get(requestId.trim());
    if (!operation) return false;
    operation.lastAbortReason = reason.slice(0, 300);
    if (!operation.controller.signal.aborted) operation.controller.abort(operation.lastAbortReason);
    return true;
  }

  abortAll(reason = 'operator request'): number {
    let aborted = 0;
    for (const operation of this.operations.values()) {
      if (operation.controller.signal.aborted) continue;
      operation.lastAbortReason = reason.slice(0, 300);
      operation.controller.abort(operation.lastAbortReason);
      aborted += 1;
    }
    return aborted;
  }

  release(requestId: string, controller: AbortController): boolean {
    const operation = this.operations.get(requestId);
    if (!operation || operation.controller !== controller) return false;
    this.operations.delete(requestId);
    return true;
  }

  has(requestId: string): boolean {
    return this.operations.has(requestId);
  }

  activeIds(): string[] {
    return [...this.operations.keys()];
  }
}
