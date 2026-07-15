import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  assertAgentProviderAllowed,
  assertContentGeneratorProviderAllowed,
  assertResolvedContentGeneratorProviderAllowed,
  createAgentProductPolicyContext,
  getDisabledAgentStatus,
  resolveAgentProviderPolicy,
} from '../agentCli/productPolicy';

describe('agent product policy', () => {
  it('fails closed for the Claude subscription route unless development explicitly allows it', () => {
    const decision = resolveAgentProviderPolicy('claude');

    expect(decision).toMatchObject({
      provider: 'claude',
      enabled: false,
      code: 'provider_disabled',
    });
    expect(decision.message).toContain('Claude API 키');
    expect(Object.isFrozen(decision)).toBe(true);
    expect(resolveAgentProviderPolicy('claude', { allowClaudeSubscription: false }).enabled).toBe(false);
    expect(resolveAgentProviderPolicy('claude', { allowClaudeSubscription: true }).enabled).toBe(true);
  });

  it('keeps Codex enabled and does not confuse the Claude API-key provider with agent-claude', () => {
    expect(resolveAgentProviderPolicy('codex').enabled).toBe(true);
    expect(() => assertContentGeneratorProviderAllowed('agent-codex')).not.toThrow();
    expect(() => assertContentGeneratorProviderAllowed('claude')).not.toThrow();
    expect(() => assertContentGeneratorProviderAllowed('gemini')).not.toThrow();
    expect(() => assertContentGeneratorProviderAllowed('agent-claude')).toThrowError(
      expect.objectContaining({ code: 'provider_disabled', provider: 'claude' }),
    );
    expect(() => assertContentGeneratorProviderAllowed(
      'agent-claude',
      { allowClaudeSubscription: true },
    )).not.toThrow();
  });

  it('exposes one immutable disabled status without probing installation or credentials', () => {
    const status = getDisabledAgentStatus('claude');

    expect(status).toEqual({
      provider: 'claude',
      installed: false,
      loggedIn: false,
      available: false,
      errorCode: 'provider_disabled',
      detail: expect.stringContaining('Claude API 키'),
    });
    expect(Object.isFrozen(status)).toBe(true);
    expect(getDisabledAgentStatus('codex')).toBeUndefined();
    expect(getDisabledAgentStatus('claude', { allowClaudeSubscription: true })).toBeUndefined();
    expect(() => assertAgentProviderAllowed('claude')).toThrowError(
      expect.objectContaining({ code: 'provider_disabled' }),
    );
  });

  it('accepts development allowance only through an opaque policy context', () => {
    const developmentContext = createAgentProductPolicyContext({
      allowClaudeSubscription: true,
    });

    expect(Object.isFrozen(developmentContext)).toBe(true);
    expect(() => assertResolvedContentGeneratorProviderAllowed(
      'agent-claude',
      developmentContext,
    )).not.toThrow();
    expect(() => assertResolvedContentGeneratorProviderAllowed(
      'agent-claude',
      { allowClaudeSubscription: true } as any,
    )).toThrowError(expect.objectContaining({ code: 'provider_disabled' }));
    expect(() => assertResolvedContentGeneratorProviderAllowed('agent-codex')).not.toThrow();
    expect(() => assertResolvedContentGeneratorProviderAllowed('claude')).not.toThrow();
  });
});

describe('main-process policy wiring', () => {
  const mainSource = readFileSync(resolve(process.cwd(), 'src', 'main.ts'), 'utf8');

  it('allows Claude subscription only in unpackaged development', () => {
    expect(mainSource).toMatch(
      /registerAgentHandlers\(\{[\s\S]*?allowClaudeSubscription:\s*!app\.isPackaged[\s\S]*?\}\);/,
    );
  });

  it('routes every main.ts structured-content call through one policy wrapper', () => {
    expect(mainSource).toContain('function generateStructuredContentWithProductPolicy(');
    expect(mainSource).toContain('createAgentProductPolicyContext(');
    expect(mainSource).toContain('assertResolvedContentGeneratorProviderAllowed(');
    expect(mainSource).toContain('agentProductPolicyContext: productPolicyContext');

    const unguardedCalls = mainSource.match(/\bgenerateStructuredContent\(/g) ?? [];
    const guardedCalls = mainSource.match(/\bgenerateStructuredContentWithProductPolicy\(/g) ?? [];
    expect(unguardedCalls).toHaveLength(1);
    expect(guardedCalls.length).toBeGreaterThanOrEqual(5);
  });

  it('guards the standalone vision narrative IPC and propagates the trusted context', () => {
    const handlerStart = mainSource.indexOf("ipcMain.handle('vision:infer-and-write'");
    const handlerEnd = mainSource.indexOf("\nipcMain.handle(", handlerStart + 1);
    const handlerSource = mainSource.slice(
      handlerStart,
      handlerEnd === -1 ? undefined : handlerEnd,
    );

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerSource).toContain('createMainAgentProductPolicyContext()');
    expect(handlerSource).toMatch(
      /assertResolvedContentGeneratorProviderAllowed\(\s*textProvider,\s*productPolicyContext,?\s*\)/,
    );
    expect(handlerSource).toContain('agentProductPolicyContext: productPolicyContext');
  });

  it('ships the Claude subscription selector disabled until main confirms development allowance', () => {
    const html = readFileSync(resolve(process.cwd(), 'public', 'index.html'), 'utf8');
    expect(html).toMatch(/id="agent-claude-card"[^>]*aria-disabled="true"/);
    expect(html).toMatch(/value="agent-claude"[^>]*disabled[^>]*aria-disabled="true"/);
  });

  it('describes Codex subscription usage without zero-cost or unlimited claims', () => {
    const html = readFileSync(resolve(process.cwd(), 'public', 'index.html'), 'utf8');
    expect(html).toContain('별도 API 키 불필요');
    expect(html).toContain('ChatGPT 구독 한도·크레딧 사용');
    expect(html).not.toContain('API 과금 0');
    expect(html).not.toContain('토큰 과금 없음');
  });
});
