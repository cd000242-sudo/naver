/** Board id → time in ms since 1970. Only boards that have a readable time appear. */
export type BoardTimes = Readonly<Record<string, number>>;
/** The boards that are new, `{ [boardId]: true }`; the others are not listed. */
export type BoardNewMap = Readonly<Record<string, boolean>>;

export const NEW_WINDOW_MS: number;

export function toMillis(value: unknown): number;
export function newestMillis(values: readonly unknown[] | null | undefined): number;
export function latestByBoard(rows: ReadonlyArray<{ board?: unknown; createdAt?: unknown } | null | undefined> | null | undefined): Record<string, number>;
export function pickTimes(raw: unknown): Record<string, number>;
export function mergeLatest(previous: BoardTimes | null | undefined, incoming: BoardTimes | null | undefined): BoardTimes;
export function isBoardNew(input?: { latest?: unknown; opened?: unknown; now?: number }): boolean;
export function newBoardMap(input?: { latest?: BoardTimes | null; opened?: BoardTimes | null; now?: number; exclude?: readonly string[] }): Record<string, boolean>;
export function markOpened(opened: BoardTimes | null | undefined, board: string, latest?: BoardTimes | null, now?: number): BoardTimes;
