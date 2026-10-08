import { randomBytes } from 'crypto';
import { constants } from 'fs';
import { lstat, open, rename, unlink, writeFile } from 'fs/promises';
import path from 'path';

async function existingCopyMatches(filename: string, expected: Buffer): Promise<boolean> {
  try {
    const before = await lstat(filename);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size !== expected.length) return false;
    const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const opened = await handle.stat();
      if (opened.ino !== before.ino || opened.dev !== before.dev || !opened.isFile()
        || opened.nlink !== 1 || opened.size !== expected.length) return false;
      const bytes = Buffer.alloc(expected.length + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!read.bytesRead) break;
        offset += read.bytesRead;
      }
      const after = await lstat(filename);
      return after.isFile() && !after.isSymbolicLink() && after.nlink === 1 && after.ino === opened.ino
        && after.dev === opened.dev && after.size === expected.length && offset === expected.length
        && bytes.subarray(0, offset).equals(expected);
    } finally { await handle.close(); }
  } catch (error: any) {
    if (['ENOENT', 'ELOOP'].includes(error?.code)) return false;
    throw error;
  }
}

/** Replace invalid cached copies by renaming a sibling, never by writing through an existing link. */
export async function storeLdbImage(filename: string, bytes: Buffer): Promise<void> {
  if (await existingCopyMatches(filename, bytes)) return;
  const temporary = path.join(path.dirname(filename), `.ldb-image-${randomBytes(12).toString('hex')}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, filename);
  } finally {
    await unlink(temporary).catch((error: any) => { if (error?.code !== 'ENOENT') throw error; });
  }
}
