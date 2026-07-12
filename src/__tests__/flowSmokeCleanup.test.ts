import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const smoke = readFileSync(new URL('../../scripts/test-google-web-image-six.cjs', import.meta.url), 'utf8');

describe('Google web image smoke cleanup', () => {
  it('closes Flow browser state after both success and failure', () => {
    expect(smoke).toContain('async function cleanupProvider');
    expect(smoke).toContain("require('../dist/image/flowGenerator.js')");
    expect(smoke).toContain('await resetFlowState()');
    expect(smoke).toMatch(/for \(const provider of providers\)[\s\S]*?finally \{[\s\S]*?await cleanupProvider\(provider\)/);
  });
});
