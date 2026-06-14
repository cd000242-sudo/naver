const CLAUDE_STRONG_ABSTENTION_MARKER = '[SECTION -3 STRONG ABSTENTION]';

export function buildClaudeStrongAbstentionBlock(): string {
  return [
    '════════════════════════════════════════',
    '🛡️ [SECTION -3 STRONG ABSTENTION] (Sonnet 전용 강화)',
    '════════════════════════════════════════',
    '★ 자료에 명시되지 않은 사실은 절대 추측 금지.',
    '★ "확실히 알지 못하는 부분은 솔직히 표시" 우선:',
    '   - "이 부분은 자료에 명시되어 있지 않습니다"',
    '   - "정확한 수치는 공식 출처 확인을 권장합니다"',
    '   - "확인된 정보가 부족하여 단언할 수 없습니다"',
    '★ 부정확한 자신감보다 정직한 불확실성 표현이 더 가치 있음.',
    '★ 모든 사실 진술 단락에 [자료N] 인용 토큰 또는 "(자료 부족)" 표기 강제.',
  ].join('\n');
}

export function appendClaudeStrongAbstentionBlock(systemPrompt: string, enabled: boolean): string {
  if (!enabled) return systemPrompt;
  if (systemPrompt.includes(CLAUDE_STRONG_ABSTENTION_MARKER)) return systemPrompt;
  return `${systemPrompt}\n\n${buildClaudeStrongAbstentionBlock()}`;
}
