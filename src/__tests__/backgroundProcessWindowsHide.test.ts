import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findChromeExecutable } from '../automation/chromeExecutablePolicy';
import { convertMp4ToGif } from '../image/gifConverter';

const childProcess = vi.hoisted(() => ({ execSync: vi.fn(), spawn: vi.fn() }));
vi.mock('child_process', () => childProcess);
vi.mock('ffmpeg-static', () => ({ default: 'C:\\tools\\ffmpeg.exe' }));
vi.mock('../runtime/childProcessRegistry.js', () => ({ trackChild: vi.fn(), untrackChild: vi.fn() }));

describe('background processes do not open Windows consoles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides the registry lookup while retaining its resolved Chrome path', () => {
    childProcess.execSync.mockReturnValue('    (Default)    REG_SZ    D:\\Chrome\\chrome.exe');
    expect(findChromeExecutable({
      platform: 'win32', exists: (value) => value === 'D:\\Chrome\\chrome.exe',
    })).toBe('D:\\Chrome\\chrome.exe');
    expect(childProcess.execSync).toHaveBeenCalledWith(
      expect.stringContaining('reg query'), expect.objectContaining({ windowsHide: true }),
    );
  });

  it('runs GIF conversion without a console and still observes process completion', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 1234, kill: vi.fn() });
    childProcess.spawn.mockReturnValue(child);
    const converted = convertMp4ToGif('C:\\media\\clip.mp4');
    child.emit('close', 0);
    await expect(converted).resolves.toBe('C:\\media\\clip.gif');
    expect(childProcess.spawn).toHaveBeenCalledWith(
      'C:\\tools\\ffmpeg.exe', expect.arrayContaining(['-i', 'C:\\media\\clip.mp4']),
      expect.objectContaining({ windowsHide: true }),
    );
  });

  // Large Electron entry points cannot be imported without launching the app.
  // Check the actual call expressions, excluding member calls such as RegExp.exec.
  it.each([
    ['src/naverBlogAutomation.ts', 6],
    ['src/browserSessionManager.ts', 1],
    ['src/image/imageFxGenerator.ts', 6],
    ['src/main/ipc/imageHandlers.ts', 2],
    ['src/main.ts', 1],
  ])('%s hides every background helper console', (filename, expectedCalls) => {
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && ['exec', 'execSync', 'execFile', 'spawn'].includes(node.expression.text)) {
        const command = node.arguments[0]?.getText(source) || '';
        if (filename !== 'src/main.ts' || command.includes('ipconfig')) calls.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(calls).toHaveLength(expectedCalls);
    const visible = calls.filter((call) => {
      const options = call.arguments[call.expression.getText(source) === 'spawn'
        || call.expression.getText(source) === 'execFile' ? 2 : 1];
      return !options || !ts.isObjectLiteralExpression(options) || !options.properties.some((property) =>
        ts.isPropertyAssignment(property) && property.name.getText(source) === 'windowsHide'
        && property.initializer.kind === ts.SyntaxKind.TrueKeyword);
    });
    expect(visible.map((call) => source.getLineAndCharacterOfPosition(call.getStart(source)).line + 1)).toEqual([]);
  });
});
