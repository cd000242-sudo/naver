// src/crawler/issueHarness/pressHosts.ts
// Press-agency / broadcaster image hosts. Their photos usually carry burned-in credits or
// channel logos, so the funnel ranks them AFTER every other source. They are never blocked —
// a clean press photo still passes (urlPolicy.ts allows news CDNs on purpose).

/**
 * Host tokens. A dotted token matches a host suffix; a short token (<= 4 chars, e.g. "kbs")
 * must equal a whole host label so unrelated hosts are not caught; longer tokens match
 * anywhere in the host name.
 */
export const PRESS_HOST_TOKENS: readonly string[] = [
  'yna.co.kr', 'yonhapnews', 'newsis', 'news1', 'ytn', 'yonhapnewstv', 'newsen', 'osen',
  'xportsnews', 'sportschosun', 'sportsseoul', 'starnews', 'mydaily', 'tvreport', 'dispatch',
  'imbc', 'kbs', 'sbs', 'jtbc', 'mbn', 'tvchosun', 'channela',
];

function hostOf(url: string | undefined): string {
  try {
    return new URL(String(url || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function hostMatches(host: string): boolean {
  if (!host) return false;
  const labels = host.split('.');
  return PRESS_HOST_TOKENS.some((token) => {
    if (token.includes('.')) return host === token || host.endsWith(`.${token}`);
    if (token.length <= 4) return labels.includes(token);
    return host.includes(token);
  });
}

/** true when the image URL or its source page lives on a press-agency/broadcaster host. */
export function isPressAgencyHost(...urls: Array<string | undefined>): boolean {
  return urls.some((url) => hostMatches(hostOf(url)));
}
