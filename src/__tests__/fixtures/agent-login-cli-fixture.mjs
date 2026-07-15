import { createInterface } from 'node:readline';

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let attempt = 0;

process.stdout.write(
  'Open this URL manually: https://claude.com/cai/oauth/authorize?state=fixture-secret\n',
);
process.stderr.write('Paste code here if prompted\n');

const deadline = setTimeout(() => process.exit(9), 5_000);
deadline.unref();

lines.on('line', (line) => {
  attempt += 1;
  if (attempt === 1 && line === 'wrong-code') {
    process.stderr.write('Invalid code. Please make sure the full code was copied.\n');
    return;
  }
  clearTimeout(deadline);
  lines.close();
  process.exit(line === 'right-code' ? 0 : 8);
});
