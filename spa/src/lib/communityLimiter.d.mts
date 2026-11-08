export function createLimiter(max?: number): {
    run<T>(task: () => Promise<T> | T): Promise<T>;
    active(): number;
    waiting(): number;
};
export function createLru<T>(max?: number): {
    has(key: string): boolean;
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    delete(key: string): boolean;
    keys(): string[];
    clear(): void;
    size(): number;
};
