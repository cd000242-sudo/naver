/**
 * Naver mobile search (m.search.naver.com) result parser for the keyless collection path.
 *
 * [2026-11-07] Naver replaced the old `api_txt_lines` markup with design-system classes
 * (`sds-comps-text-ellipsis-2`). The old regex found 0 results, so the keyless path always
 * reported "파싱 결과 부족". Title spans carry `sds-comps-text-ellipsis-2` only; the snippet span
 * right after it also carries `sds-comps-text-type-body1`. The legacy markup is still tried first.
 */

export interface NaverMobileSnippet {
  title: string;
  description: string;
}

const MIN_DESCRIPTION_CHARS = 30;
const MAX_RESULTS = 15;

function cleanHtmlText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLegacyMarkup(html: string): NaverMobileSnippet[] {
  const titles = html.match(/class="api_txt_lines[^"]*"[^>]*>([^<]+)</g) || [];
  const descs = html.match(/class="api_txt_lines dsc_txt[^"]*"[^>]*>([^<]+)</g) || [];
  const strip = (raw: string): string => cleanHtmlText(raw.replace(/^class="[^"]*"[^>]*>/, '').replace(/<$/, ''));
  const out: NaverMobileSnippet[] = [];
  for (let i = 0; i < Math.max(titles.length, descs.length) && out.length < MAX_RESULTS; i++) {
    const description = descs[i] ? strip(descs[i]) : '';
    if (description.length > MIN_DESCRIPTION_CHARS) out.push({ title: titles[i] ? strip(titles[i]) : '', description });
  }
  return out;
}

function parseDesignSystemMarkup(html: string): NaverMobileSnippet[] {
  const spanRe = /<span[^>]*class="([^"]*\bsds-comps-text-ellipsis-2\b[^"]*)"[^>]*>([\s\S]*?)<\/span>/g;
  const out: NaverMobileSnippet[] = [];
  let pendingTitle = '';
  let match: RegExpExecArray | null;
  while ((match = spanRe.exec(html)) !== null && out.length < MAX_RESULTS) {
    const text = cleanHtmlText(match[2]);
    if (!text) continue;
    if (/\bsds-comps-text-type-body1\b/.test(match[1])) {
      if (text.length > MIN_DESCRIPTION_CHARS) out.push({ title: pendingTitle, description: text });
      pendingTitle = '';
    } else {
      pendingTitle = text;
    }
  }
  return out;
}

/** Title/snippet pairs from a Naver mobile search page; empty when nothing usable was found. */
export function parseNaverMobileSearchSnippets(html: string): NaverMobileSnippet[] {
  const legacy = parseLegacyMarkup(html);
  return legacy.length > 0 ? legacy : parseDesignSystemMarkup(html);
}
