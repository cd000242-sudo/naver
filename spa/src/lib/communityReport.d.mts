export const REPORT_REASONS: readonly Readonly<{ key: string; label: string }>[];
export function reportReasons(serverConfig?: { reportReasons?: Array<Record<string, unknown>> } | null): Array<{ key: string; label: string }>;
export function reportAction(post: { mine?: boolean; notice?: boolean; delivery?: unknown } | null | undefined, profile: unknown): 'hidden' | 'login' | 'report';
