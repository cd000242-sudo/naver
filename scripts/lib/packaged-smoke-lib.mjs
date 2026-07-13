import path from 'node:path';

export function findPackagedExecutable(fileNames) {
  return (fileNames || []).find((name) => {
    const value = String(name || '');
    return /\.exe$/i.test(value)
      && !/uninstall|elevate|installer|setup/i.test(value);
  }) || null;
}

export function buildIsolatedPackagedAppEnv(baseEnv, root) {
  const env = {
    ...baseEnv,
    APPDATA: path.join(root, 'appdata'),
    LOCALAPPDATA: path.join(root, 'localappdata'),
    USERPROFILE: path.join(root, 'profile'),
    HOME: path.join(root, 'profile'),
    E2E_USER_DATA_DIR: path.join(root, 'userdata'),
    SELF_TEST: '1',
    E2E_TEST: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
