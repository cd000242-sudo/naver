export type RichRun = { x: string; b?: 1; i?: 1; href?: string };
export type RichBlock =
    | { t: 'p'; c: RichRun[] }
    | { t: 'h'; l: 2 | 3; c: RichRun[] }
    | { t: 'quote'; c: RichRun[] }
    | { t: 'ul' | 'ol'; items: RichRun[][] }
    | { t: 'img'; id: string; alt: string }
    | { t: 'hr' };

export const RICH_LIMITS: Readonly<{ text: number; json: number; blocks: number; images: number; listItems: number; href: number }>;
export function safeHref(value: unknown): string;
export function normalizeLinkInput(input: unknown): string;
export function richTextLength(blocks: readonly RichBlock[] | null | undefined): number;
export function validateRichDoc(doc: unknown): { ok: true } | { ok: false; message: string };
export function serializeRichDoc(blocks: readonly RichBlock[]): string;
export function parseRichBody(text: unknown): { ok: boolean; blocks: RichBlock[] };
export function richPlainText(blocks: readonly RichBlock[] | null | undefined): string;
export function richImageIds(blocks: readonly RichBlock[] | null | undefined): string[];
export function richExcerpt(body: unknown, max?: number): string;
export function checkRichDraft(blocks: readonly RichBlock[] | null | undefined): string;
