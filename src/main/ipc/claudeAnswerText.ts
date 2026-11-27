// src/main/ipc/claudeAnswerText.ts
// The answer text of a Claude Messages API reply.
// The side-call helper used to return content[0].text only. A reply whose first block is not text (a thinking block,
// for instance) then came back as an empty string and the caller skipped its whole stage: owner log 2026-11-26,
// "[Blueprint] ⚠️ 응답을 설계도로 읽을 수 없어 생략 (… 0자)" five times, all on the Claude API route.
// Every text block is joined in order; blocks of any other type are ignored.

interface ClaudeReplyBlock {
  readonly type?: unknown;
  readonly text?: unknown;
}

export function pickClaudeAnswerText(reply: unknown): string {
  const content = (reply as { content?: unknown } | null | undefined)?.content;
  if (!Array.isArray(content)) return '';
  return (content as ClaudeReplyBlock[])
    .filter((block) => block && (block.type === undefined || block.type === 'text') && typeof block.text === 'string')
    .map((block) => String(block.text))
    .join('');
}

/** Names of the block types of a reply (never their contents): what to log when the answer text is empty. */
export function describeClaudeReplyShape(reply: unknown): string {
  const body = reply as { content?: unknown; stop_reason?: unknown } | null | undefined;
  const types = Array.isArray(body?.content)
    ? (body!.content as ClaudeReplyBlock[]).map((block) => String(block?.type ?? 'untyped')).join(',')
    : 'no-content';
  return `blocks=[${types}] stop=${String(body?.stop_reason ?? 'unknown')}`;
}
