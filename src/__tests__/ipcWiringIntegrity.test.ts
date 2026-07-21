/**
 * [v2.11.134] IPC 배선 무결성 전수 스캔 (트랙 A-1: 죽은 배선 박멸).
 *
 * 배경: 사진 모드 HEIC가 "렌더러는 호출하는데 preload 노출도 main 핸들러도
 * 없는" 죽은 배선으로 출시부터 조용히 실패했다 (라이브 고객 리포트). 이런
 * 결함은 컴파일·런타임 어디서도 잡히지 않으므로, 세 층을 정적으로 대조하는
 * 영구 게이트를 둔다:
 *   렌더러 호출 메서드 ⊆ preload 노출 메서드
 *   preload invoke/send 채널 ⊆ main ipcMain.handle/on 채널
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'types') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Full-line // comments only. Block-comment stripping is deliberately NOT
 * done: a `/*` sequence inside a string/regex literal would swallow huge
 * code spans (observed on main.ts) — false-keeping a comment is harmless,
 * false-dropping registrations is not.
 */
function stripComments(code: string): string {
  return code.replace(/^\s*\/\/.*$/gm, '');
}

// ---------------------------------------------------------------------------
// Layer 1: main process channels
// ---------------------------------------------------------------------------

function collectMainChannels(): Set<string> {
  const channels = new Set<string>();
  const files = walk(ROOT);
  // safeHandle(...) is the project's try-catch registration wrapper.
  // `once` covers dynamically-registered one-shot channels (e.g. license:code).
  const pattern = /(?:ipcMain\.(?:handle|handleOnce|on|once)|safeHandle)\(\s*['"`]([^'"`]+)['"`]/g;
  for (const file of files) {
    const code = stripComments(fs.readFileSync(file, 'utf-8'));
    for (const match of code.matchAll(pattern)) {
      channels.add(match[1]);
    }
  }
  return channels;
}

// ---------------------------------------------------------------------------
// Layer 2: preload exposures
// ---------------------------------------------------------------------------

interface PreloadSurface {
  methodsByNamespace: Map<string, Set<string>>;
  channels: Set<string>;
}

function collectPreloadSurface(): PreloadSurface {
  const code = fs.readFileSync(path.join(ROOT, 'preload.ts'), 'utf-8');
  const methodsByNamespace = new Map<string, Set<string>>();
  const exposeMatches = [...code.matchAll(/contextBridge\.exposeInMainWorld\(\s*['"](\w+)['"]/g)];
  for (let i = 0; i < exposeMatches.length; i++) {
    const ns = exposeMatches[i][1];
    const start = exposeMatches[i].index ?? 0;
    const end = i + 1 < exposeMatches.length ? (exposeMatches[i + 1].index ?? code.length) : code.length;
    const section = code.slice(start, end);
    const methods = methodsByNamespace.get(ns) ?? new Set<string>();
    // Top-level object keys are written at 2-space indent in preload.ts.
    for (const match of section.matchAll(/^ {2}(\w+):/gm)) {
      methods.add(match[1]);
    }
    methodsByNamespace.set(ns, methods);
  }
  const channels = new Set<string>();
  for (const match of stripComments(code).matchAll(/ipcRenderer\.(?:invoke|send|sendSync)\(\s*['"`]([^'"`$]+)['"`]/g)) {
    channels.add(match[1]);
  }
  return { methodsByNamespace, channels };
}

// ---------------------------------------------------------------------------
// Layer 3: renderer call sites
// ---------------------------------------------------------------------------

interface RendererCall {
  namespace: string;
  method: string;
  file: string;
}

function collectRendererCalls(): RendererCall[] {
  const rendererRoot = path.join(ROOT, 'renderer');
  const calls: RendererCall[] = [];
  const seen = new Set<string>();
  const push = (namespace: string, method: string, file: string) => {
    const key = `${namespace}.${method}`;
    if (seen.has(key)) return;
    seen.add(key);
    calls.push({ namespace, method, file: path.relative(ROOT, file) });
  };

  for (const file of walk(rendererRoot)) {
    const code = stripComments(fs.readFileSync(file, 'utf-8'));

    // Direct: window.electronAPI.x / (window as any).electronAPI?.x?.(...)
    for (const match of code.matchAll(/\belectronAPI\b\??\.(\w+)\s*\??\.?\(/g)) {
      push('electronAPI', match[1], file);
    }
    // Direct window.api.x(...)
    for (const match of code.matchAll(/\bwindow(?: as any)?\)?\??\.api\b\??\.(\w+)\s*\??\.?\(/g)) {
      push('api', match[1], file);
    }
    // Aliases: const foo = (window as any).api / window.electronAPI
    const aliasToNs = new Map<string, string>();
    for (const match of code.matchAll(/(?:const|let|var)\s+(\w+)(?:\s*:[^=\n]+)?=\s*\(?\s*window(?: as any)?\)?\s*\.\s*(api|electronAPI)\b(?!\s*\.)/g)) {
      aliasToNs.set(match[1], match[2]);
    }
    for (const [alias, ns] of aliasToNs) {
      const aliasPattern = new RegExp(`\\b${alias}\\b\\??\\.(\\w+)\\s*\\??\\.?\\(`, 'g');
      for (const match of code.matchAll(aliasPattern)) {
        push(ns, match[1], file);
      }
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Known-good exceptions. Every entry needs a justification comment.
// ---------------------------------------------------------------------------

/** Channels invoked via template literals or registered dynamically. */
const CHANNEL_WHITELIST = new Set<string>([]);

/**
 * Renderer method names the scanner reports that are NOT preload IPC calls
 * (e.g. plain object methods that share an alias name). Keep tiny.
 */
const METHOD_WHITELIST = new Set<string>([]);

// ---------------------------------------------------------------------------

describe('IPC 배선 무결성 (죽은 배선 게이트)', () => {
  const mainChannels = collectMainChannels();
  const preload = collectPreloadSurface();

  it('preload가 invoke/send하는 모든 채널은 main에 핸들러가 있다', () => {
    const missing = [...preload.channels]
      .filter((channel) => !mainChannels.has(channel))
      .filter((channel) => !CHANNEL_WHITELIST.has(channel))
      .sort();
    expect(missing, `main 핸들러 없는 preload 채널:\n${missing.join('\n')}`).toEqual([]);
  });

  it('렌더러가 호출하는 모든 electronAPI/api 메서드는 preload에 노출돼 있다', () => {
    const calls = collectRendererCalls();
    const missing = calls
      .filter(({ namespace, method }) => {
        if (METHOD_WHITELIST.has(method)) return false;
        const exposed = preload.methodsByNamespace.get(namespace);
        return !exposed || !exposed.has(method);
      })
      .map(({ namespace, method, file }) => `${namespace}.${method}  (${file})`)
      .sort();
    expect(missing, `preload에 없는 렌더러 호출 (죽은 배선 후보):\n${missing.join('\n')}`).toEqual([]);
  });

  it('스캐너 자체 sanity — 세 층 모두 실측 규모로 수집된다', () => {
    expect(mainChannels.size).toBeGreaterThan(250);
    expect(preload.channels.size).toBeGreaterThan(250);
    expect(preload.methodsByNamespace.get('api')?.size ?? 0).toBeGreaterThan(100);
    expect(preload.methodsByNamespace.get('electronAPI')?.size ?? 0).toBeGreaterThan(20);
  });
});
