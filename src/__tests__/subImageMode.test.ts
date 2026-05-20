/**
 * subImageMode 헬퍼 단위 테스트
 *
 * 회귀 방지: scSubImageSource 키에 AI 엔진명이 저장돼도 'ai' 모드로 정규화되어야 하고,
 * 'collected' 라디오 선택 후엔 'collected' 모드가 안정적으로 유지되어야 한다.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getSubImageMode, setSubImageMode, isAIEngineName } from '../renderer/utils/subImageMode';

class MemoryStorage {
    private store = new Map<string, string>();
    getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
    setItem(k: string, v: string) { this.store.set(k, v); }
    removeItem(k: string) { this.store.delete(k); }
    clear() { this.store.clear(); }
    key(_i: number) { return null; }
    get length() { return this.store.size; }
}

beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
    (globalThis as any).window = globalThis;
});

describe('subImageMode helper', () => {
    it('returns "collected" when nothing is stored', () => {
        expect(getSubImageMode()).toBe('collected');
    });

    it('writes both new key and legacy key when setting mode', () => {
        setSubImageMode('ai');
        expect(localStorage.getItem('scSubImageMode')).toBe('ai');
        expect(localStorage.getItem('scSubImageSource')).toBe('ai');
    });

    it('normalises legacy engine names to "ai"', () => {
        localStorage.setItem('scSubImageSource', 'nano-banana-pro');
        expect(getSubImageMode()).toBe('ai');
    });

    it('honors explicit "collected" over legacy engine name', () => {
        localStorage.setItem('scSubImageSource', 'openai-image');
        setSubImageMode('collected');
        expect(getSubImageMode()).toBe('collected');
    });

    it('returns "collected" when legacy key holds an unknown string', () => {
        localStorage.setItem('scSubImageSource', 'totally-unknown');
        expect(getSubImageMode()).toBe('collected');
    });

    it('treats explicit "ai" / "collected" legacy values correctly', () => {
        localStorage.setItem('scSubImageSource', 'ai');
        expect(getSubImageMode()).toBe('ai');
        localStorage.setItem('scSubImageSource', 'collected');
        expect(getSubImageMode()).toBe('collected');
    });

    it('isAIEngineName whitelist recognises known engines', () => {
        expect(isAIEngineName('nano-banana-pro')).toBe(true);
        expect(isAIEngineName('openai-image')).toBe(true);
        expect(isAIEngineName('deepinfra')).toBe(true);
        expect(isAIEngineName('collected')).toBe(false);
        expect(isAIEngineName('ai')).toBe(false);
        expect(isAIEngineName(null)).toBe(false);
        expect(isAIEngineName(undefined)).toBe(false);
    });
});
