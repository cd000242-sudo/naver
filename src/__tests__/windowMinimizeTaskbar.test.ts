import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const mainSource = ts.createSourceFile('main.ts', readFileSync('src/main.ts', 'utf8'), ts.ScriptTarget.Latest, true);

function mainCallbacks(method: 'on' | 'handle', event: string): string[] {
  const callbacks: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === method && node.arguments[0]?.getText(mainSource) === `'${event}'`
      && node.expression.expression.getText(mainSource).includes(method === 'on' ? 'mainWindow' : 'ipcMain')) {
      callbacks.push(node.arguments[1].getText(mainSource));
    }
    ts.forEachChild(node, visit);
  };
  visit(mainSource);
  expect(callbacks.length).toBeGreaterThan(0);
  return callbacks;
}

function runCallback(source: string, bindings: Record<string, unknown>): () => unknown {
  const js = ts.transpileModule(`(${source})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(js, { console: { log: vi.fn() }, ...bindings });
}

function windowFixture(destroyed = false) {
  return {
    isDestroyed: vi.fn(() => destroyed), hide: vi.fn(), minimize: vi.fn(),
    setSkipTaskbar: vi.fn(), show: vi.fn(), restore: vi.fn(), focus: vi.fn(),
  };
}

describe('main window minimizes into the taskbar', () => {
  it('keeps the native minimized window on the taskbar while pausing background checks', () => {
    const mainWindow = windowFixture();
    const setWatchdogActive = vi.fn();
    const setSessionValidationActive = vi.fn();
    for (const callback of mainCallbacks('on', 'minimize')) {
      runCallback(callback, { mainWindow, require: () => ({ setWatchdogActive, setSessionValidationActive }) })();
    }
    expect(mainWindow.hide).not.toHaveBeenCalled();
    expect(mainWindow.setSkipTaskbar).not.toHaveBeenCalledWith(true);
    expect(mainWindow.setSkipTaskbar).toHaveBeenCalledWith(false);
    expect(setWatchdogActive).toHaveBeenCalledWith(false);
    expect(setSessionValidationActive).toHaveBeenCalledWith(false);
  });

  it('restores taskbar presence and background checks when restored', () => {
    const mainWindow = windowFixture();
    const setWatchdogActive = vi.fn();
    const setSessionValidationActive = vi.fn();
    for (const callback of mainCallbacks('on', 'restore')) {
      runCallback(callback, { mainWindow, require: () => ({ setWatchdogActive, setSessionValidationActive }) })();
    }
    expect(mainWindow.setSkipTaskbar).toHaveBeenCalledWith(false);
    expect(setWatchdogActive).toHaveBeenCalledWith(true);
    expect(setSessionValidationActive).toHaveBeenCalledWith(true);
  });

  it('makes legacy minimize IPC use normal minimize without tray notifications', async () => {
    const mainWindow = windowFixture();
    const tray = { displayBalloon: vi.fn() };
    await runCallback(mainCallbacks('handle', 'app:minimize-to-tray')[0], { mainWindow, tray })();
    expect(mainWindow.minimize).toHaveBeenCalledOnce();
    expect(mainWindow.setSkipTaskbar).toHaveBeenCalledWith(false);
    expect(mainWindow.hide).not.toHaveBeenCalled();
    expect(tray.displayBalloon).not.toHaveBeenCalled();
  });

  it.each([null, windowFixture(true)])('ignores legacy IPC for an unavailable window', async mainWindow => {
    await expect(runCallback(mainCallbacks('handle', 'app:minimize-to-tray')[0], { mainWindow })()).resolves.toBeUndefined();
    if (mainWindow) expect(mainWindow.minimize).not.toHaveBeenCalled();
  });
});

function managerFixture() {
  class Window extends EventEmitter {
    static getAllWindows = () => [];
    hide = vi.fn();
    minimize = vi.fn(() => this.emit('minimize'));
    setSkipTaskbar = vi.fn();
    isDestroyed = () => false;
    webContents = { setWindowOpenHandler: vi.fn() };
  }
  class Tray extends EventEmitter {
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
  }
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync('src/main/core/WindowManager.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    exports, __dirname: '.', console: { log: vi.fn(), error: vi.fn() },
    require: (name: string) => name === 'path' ? { join: (...parts: string[]) => parts.join('/') } : {
      BrowserWindow: Window, Tray, Menu: { buildFromTemplate: vi.fn() },
      nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
    },
  });
  const manager = exports.WindowManager;
  return { manager, window: manager.createMainWindow() as Window };
}

describe('WindowManager minimize parity', () => {
  it('does not hide a window when its native minimize event fires', () => {
    const { window } = managerFixture();
    window.emit('minimize');
    expect(window.hide).not.toHaveBeenCalled();
    expect(window.setSkipTaskbar).not.toHaveBeenCalledWith(true);
  });

  it('minimizes instead of hiding through the manager API', () => {
    const { manager, window } = managerFixture();
    manager.minimize();
    expect(window.minimize).toHaveBeenCalledOnce();
    expect(window.setSkipTaskbar).toHaveBeenCalledWith(false);
    expect(window.hide).not.toHaveBeenCalled();
  });
});
