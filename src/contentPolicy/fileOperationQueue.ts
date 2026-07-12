import path from 'path';

const operationTails = new Map<string, Promise<void>>();

function queueKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}

/** Serializes read-modify-write operations across every store instance in this process. */
export async function withFileOperationLock<T>(
  filePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = queueKey(filePath);
  const previous = operationTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  operationTails.set(key, tail);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (operationTails.get(key) === tail) operationTails.delete(key);
  }
}
