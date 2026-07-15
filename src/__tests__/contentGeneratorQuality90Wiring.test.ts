import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const contentGeneratorPath = path.join(process.cwd(), 'src', 'contentGenerator.ts');
const source = fs.readFileSync(contentGeneratorPath, 'utf8');

describe('contentGenerator post-generation quality policy', () => {
  it('keeps the first usable draft instead of reserving calls for quality targets', () => {
    expect(source).toContain('const promptRepairMinAttempts = 0;');
    expect(source).toContain('const qualityTargetMinAttempts = 0;');
    expect(source).toContain("readNonNegativeIntegerEnv('AGENT_CONTENT_MAX_ATTEMPTS', 0)");
    expect(source).toContain("provider === 'agent-codex' || provider === 'agent-claude'");
  });

  it('requires explicit opt-in before any paid post-generation repair', () => {
    expect(source).toContain('const allowPaidPostGenerationRepair =');
    expect(source).toContain("process.env.CONTENT_ALLOW_PAID_POST_GENERATION_REPAIR === '1'");
    expect(source).toContain('allowPaidPostGenerationRepair && !customPromptAdherence.passed');
    expect(source).toContain('allowPaidPostGenerationRepair && platitudeReportRef');
    expect(source).toContain('allowPaidPostGenerationRepair && !_fidelityRetryUsed');
  });

  it('records QualityGate90 misses as warnings without regeneration or safety-score throws', () => {
    expect(source).toContain('QualityGate90 경고 후 계속');
    expect(source).toContain('quality90AdvisoryAccepted: true');
    expect(source).not.toContain('QualityGate90 target still missed after bounded retries');
    expect(source).not.toMatch(/throw new Error\(\s*`\[CONTENT_SAFETY_BLOCKED\][\s\S]{0,220}?criticalSafetyReasons/);
  });

  it('keeps shopping quality and authenticity findings advisory', () => {
    expect(source).toContain('쇼핑커넥트 진정성 경고 후 계속');
    expect(source).toContain('쇼핑커넥트 품질 경고 후 계속');
    expect(source).not.toContain('throw new Error(`[CONTENT_SAFETY_BLOCKED] 쇼핑커넥트 근거 검수 미통과');
  });

  it('returns short but usable content without a quality-driven paid rewrite', () => {
    expect(source).toContain('allowPaidPostGenerationRepair && attempt < MAX_ATTEMPTS');
    expect(source).toContain('권장 분량 미달 결과를 경고와 함께 반환');
    expect(source).not.toContain('짧은 결과를 반환하지 않고 재작성');
  });
});
