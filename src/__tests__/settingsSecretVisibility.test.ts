import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

function readProjectFile(relative: string): string {
  return fs.readFileSync(path.resolve(ROOT, '..', relative), 'utf-8');
}

describe('settings secret visibility invariants', () => {
  const settingsModal = read('renderer/utils/settingsModal.ts');
  const resetConfigForPack = readProjectFile('scripts/reset-config-for-pack.js');
  const restoreAfterPack = readProjectFile('scripts/restore-after-pack.js');

  it('settings modal loads real API key values instead of masked placeholders', () => {
    expect(settingsModal).toMatch(/function\s+setApiInputValue/);
    expect(settingsModal).not.toMatch(/setMaskedApiInput/);
    expect(settingsModal).not.toMatch(/function\s+maskApiKey/);
    expect(settingsModal).not.toMatch(/input\.value\s*=\s*maskApiKey/);
    expect(settingsModal).not.toMatch(/naverClientSecretInput\.value\s*=\s*maskApiKey/);
  });

  it('saving API keys prioritizes the current typed value over stale dataset values', () => {
    const readApiInputBlock = settingsModal.match(/function\s+readApiInput[\s\S]+?function\s+getElements/);
    expect(readApiInputBlock).toBeTruthy();
    expect(readApiInputBlock![0]).toMatch(/const\s+preserveSchemaText\s*=\s*shouldPreserveSecretSchemaTextForInput\(input\)/);
    expect(readApiInputBlock![0]).toMatch(/const\s+value\s*=\s*stripSecretSchemaArtifacts\(input\.value,\s*preserveSchemaText\)/);
    expect(readApiInputBlock![0]).not.toMatch(/const\s+realValue[\s\S]{0,120}if\s*\(realValue\)[\s\S]{0,120}return\s+realValue[\s\S]{0,120}const\s+value/);
  });

  it('settings modal strips schema artifacts before showing or saving API keys except Naver Client Secret', () => {
    expect(settingsModal).toMatch(/stripSecretSchemaArtifacts/);
    expect(settingsModal).toMatch(/function\s+shouldPreserveSecretSchemaTextForInput/);
    expect(settingsModal).toMatch(/'naver-client-secret'/);
    expect(settingsModal).toMatch(/'settings-naver-client-secret'/);
    expect(settingsModal).toMatch(/const\s+cleanValue\s*=\s*stripSecretSchemaArtifacts\(value,\s*shouldPreserveSecretSchemaTextForInput\(input\)\)/);
    expect(settingsModal).toMatch(/return\s+stripSecretSchemaArtifacts\(currentValue,\s*preserveSchemaText\)/);
  });

  it('packaging does not blank or recreate the local .env file', () => {
    expect(resetConfigForPack).toMatch(/\.env 초기화 스킵/);
    expect(resetConfigForPack).not.toMatch(/writeFileSync\(envPath,\s*''/);
    expect(resetConfigForPack).not.toMatch(/copyFileSync\(envPath,\s*envBackupPath/);
    expect(resetConfigForPack).not.toMatch(/writeFileSync\(envCreatedMarkerPath/);
  });

  it('post-pack restore does not overwrite the local .env file', () => {
    expect(restoreAfterPack).toMatch(/\.env 복원 스킵/);
    expect(restoreAfterPack).not.toMatch(/copyFileSync\(envBackupPath,\s*envPath/);
    expect(restoreAfterPack).not.toMatch(/unlinkSync\(envPath/);
  });
});
