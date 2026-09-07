const GENERIC = /^(?:오늘의|오늘|최신|실시간|속보|관련)$/u;
const FOLLOWUP = /^(?:근황|이유|원인|일정|신청|신청방법|신청기간|설치|사용법|다운로드|조건|대상|발표|후기|업데이트|출시|수령|계산|띠별|별자리|정리|비교|뜻|방법|복귀|해설|아내|남편|재산|사망원인|장례식장)$/u;
const words = (value) => typeof value === 'string'
    ? (value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+(?:\.\d+)*/gu) || [])
        .map((word) => word.replace(/^(?:오늘의|실시간)(?=.{2})/u, '')).filter((word) => !GENERIC.test(word)) : [];
function containsPhrase(text, phrase) {
    if (phrase.length === 0)
        return false;
    const tokens = words(text);
    const core = phrase.join('');
    for (let start = 0; start < tokens.length; start += 1) {
        let joined = '';
        for (let end = start; end < tokens.length && joined.length <= core.length; end += 1) {
            joined += tokens[end];
            if (joined === core)
                return true;
            // Joined Korean spelling is allowed only with a recognizable search-purpose suffix.
            if (joined.startsWith(core) && FOLLOWUP.test(joined.slice(core.length)))
                return true;
        }
    }
    return false;
}
export function inspectIssueRelation(issue, keyword, headlines = []) {
    const anchors = words(issue);
    if (anchors.length === 0 || words(keyword).length === 0)
        return { related: false, evidence: null };
    // Keep the complete entity and version: 리리아 3.5 is neither 리리아나 nor 리리아 3.6.
    if (containsPhrase(keyword, anchors))
        return { related: true, evidence: 'issue-anchors' };
    const candidate = words(keyword);
    const supported = (Array.isArray(headlines) ? headlines : []).some((headline) => {
        if (!headline || typeof headline.link !== 'string')
            return false;
        try {
            const url = new URL(headline.link);
            const host = url.hostname.replace(/\.+$/, '');
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
                || !host.includes('.') || /(^localhost$|\.localhost$|\.local$|^[\d.]+$|:)/i.test(host))
                return false;
        }
        catch {
            return false;
        }
        return containsPhrase(headline.title, anchors) && containsPhrase(headline.title, candidate);
    });
    return { related: supported, evidence: supported ? 'same-headline' : null };
}
export function classifyIssuePublication(row, headlines = []) {
    if (!inspectIssueRelation(row.issue, row.keyword, headlines).related)
        return { status: 'reject', reason: 'issue-unrelated' };
    if (row.preemptionKind === 'no-demand' || row.hasLiveDemand !== true)
        return { status: 'observe', reason: 'demand-unverified' };
    if (row.demandStatus === 'dead')
        return { status: 'observe', reason: 'demand-inactive' };
    return { status: 'recommend', reason: null };
}
