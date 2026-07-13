import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const requestedPath = String(process.env.E2E_USER_DATA_DIR || '').trim();
if (process.env.E2E_TEST === '1' && requestedPath) {
  const resolved = path.resolve(requestedPath);
  fs.mkdirSync(resolved, { recursive: true });
  fs.mkdirSync(path.join(resolved, 'logs'), { recursive: true });
  app.setPath('userData', resolved);
  app.setPath('logs', path.join(resolved, 'logs'));
}
