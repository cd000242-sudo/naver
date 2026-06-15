export interface BrowserCloseStateReset {
  browser: null;
  page: null;
  mainFrame: null;
  closed: true;
}

export function resolveBrowserCloseStateReset(): BrowserCloseStateReset {
  return {
    browser: null,
    page: null,
    mainFrame: null,
    closed: true,
  };
}
