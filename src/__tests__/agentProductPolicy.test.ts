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
  it('keeps Claude Code enabled in development and packaged-app policy contexts', () => {
    const decision = resolveAgentProviderPolicy('claude');

    expect(decision).toMatchObject({
      provider: 'claude',
      enabled: true,
    });
    expect(Object.isFrozen(decision)).toBe(true);
    expect(resolveAgentProviderPolicy('claude', { allowClaudeSubscription: false }).enabled).toBe(true);
    expect(resolveAgentProviderPolicy('claude', { allowClaudeSubscription: true }).enabled).toBe(true);
  });

  it('keeps Codex enabled and does not confuse the Claude API-key provider with agent-claude', () => {
    expect(resolveAgentProviderPolicy('codex').enabled).toBe(true);
    expect(() => assertContentGeneratorProviderAllowed('agent-codex')).not.toThrow();
    expect(() => assertContentGeneratorProviderAllowed('claude')).not.toThrow();
    expect(() => assertContentGeneratorProviderAllowed('gemini')).not.toThrow();
    expect(() => assertContentGeneratorProviderAllowed('agent-claude')).not.toThrow();
    expect(() => assertContentGeneratorProviderAllowed(
      'agent-claude',
      { allowClaudeSubscription: true },
    )).not.toThrow();
  });

  it('never replaces normal CLI readiness probing with a product-disabled status', () => {
    expect(getDisabledAgentStatus('claude')).toBeUndefined();
    expect(getDisabledAgentStatus('codex')).toBeUndefined();
    expect(getDisabledAgentStatus('claude', { allowClaudeSubscription: true })).toBeUndefined();
    expect(() => assertAgentProviderAllowed('claude')).not.toThrow();
  });

  it('preserves the opaque policy context without making it an availability gate', () => {
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
    )).not.toThrow();
    expect(() => assertResolvedContentGeneratorProviderAllowed('agent-codex')).not.toThrow();
    expect(() => assertResolvedContentGeneratorProviderAllowed('claude')).not.toThrow();
  });
});

describe('main-process policy wiring', () => {
  const mainSource = readFileSync(resolve(process.cwd(), 'src', 'main.ts'), 'utf8');

  it('allows Claude Code in packaged and unpackaged main-process handlers', () => {
    expect(mainSource).toMatch(
      /registerAgentHandlers\(\{[\s\S]*?allowClaudeSubscription:\s*true[\s\S]*?\}\);/,
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

  it('ships the Claude Code selector enabled', () => {
    const html = readFileSync(resolve(process.cwd(), 'public', 'index.html'), 'utf8');
    const cardStart = html.indexOf('id="agent-claude-card"');
    const cardEnd = html.indexOf('id="agent-claude-actions"', cardStart);
    const card = html.slice(cardStart, cardEnd);
    expect(card).not.toContain('aria-disabled="true"');
    expect(card).not.toMatch(/value="agent-claude"[^>]*\sdisabled(?:\s|>)/);
    expect(card).toContain('별도 API 키 불필요');
  });

  it('describes Codex subscription usage without zero-cost or unlimited claims', () => {
    const html = readFileSync(resolve(process.cwd(), 'public', 'index.html'), 'utf8');
    expect(html).toContain('별도 API 키 불필요');
    expect(html).toContain('ChatGPT 구독 한도·크레딧 사용');
    expect(html).not.toContain('API 과금 0');
    expect(html).not.toContain('토큰 과금 없음');
  });
});
