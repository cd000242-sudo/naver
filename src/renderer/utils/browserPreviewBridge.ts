/**
 * Supplies only the safe read-time subset of the Electron bridge when the
 * renderer is opened through the local static preview server.
 */
const BROWSER_PREVIEW_PROTOCOLS = new Set(['http:', 'https:']);

export function isBrowserPreviewRuntime(): boolean {
  return (window as any).api?.__browserPreview === true;
}

export function installBrowserPreviewBridge(): void {
  const appWindow = window as any;

  // Electron's preload bridge always wins. This exists solely for static previews.
  if (appWindow.api || !BROWSER_PREVIEW_PROTOCOLS.has(window.location.protocol)) return;

  appWindow.api = {
    __browserPreview: true,
    getConfig: async () => ({}),
    isPackaged: async () => true,
    onStatus: () => undefined,
  };

  console.info('[BrowserPreview] Preview-safe Electron bridge enabled.');
}

installBrowserPreviewBridge();
