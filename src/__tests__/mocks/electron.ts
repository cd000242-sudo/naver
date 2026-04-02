// Electron mock for Vitest — contentGenerator.ts 등에서 import하는 electron 모듈 스텁
export const app = {
  getPath: (name: string) => `/tmp/mock-${name}`,
  getVersion: () => '0.0.0-test',
  isPackaged: false,
};

export default { app };
