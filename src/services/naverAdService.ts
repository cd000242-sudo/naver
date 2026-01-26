import axios from 'axios';
import * as crypto from 'crypto';

export interface RelKwdStat {
    relKeyword: string;
    monthlyPcQcCnt: number | string;
    monthlyMobileQcCnt: number | string;
    monthlyAvePcClkCnt: number;
    monthlyAveMobileClkCnt: number;
    monthlyAvePcCtr: number;
    monthlyAveMobileCtr: number;
    plAvgDepth: number;
    compIdx: '높음' | '중간' | '낮음';
}

export interface NaverAdApiConfig {
    apiKey: string;
    secretKey: string;
    customerId: string;
}

export class NaverAdService {
    constructor(private config: NaverAdApiConfig) { }

    private generateSignature(timestamp: string, method: string, uri: string): string {
        const message = `${timestamp}.${method}.${uri}`;
        const hmac = crypto.createHmac('sha256', this.config.secretKey);
        hmac.update(message);
        return hmac.digest('base64');
    }

    /**
     * 연관 키워드 및 검색량 조회 (RelKwdStat)
     */
    async getRelatedKeywords(keyword: string): Promise<RelKwdStat[]> {
        const timestamp = String(Date.now());
        const method = 'GET';
        const uri = '/keywordstool';
        const signature = this.generateSignature(timestamp, method, uri);

        try {
            const response = await axios.get(`https://api.searchad.naver.com${uri}`, {
                params: {
                    hintKeywords: keyword.replace(/\s+/g, ''),
                    showDetail: '1'
                },
                headers: {
                    'X-Timestamp': timestamp,
                    'X-API-KEY': this.config.apiKey,
                    'X-Customer': this.config.customerId,
                    'X-Signature': signature,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.keywordList) {
                return response.data.keywordList;
            }
            return [];
        } catch (error) {
            console.error('[NaverAdService] Failed to fetch related keywords:', error);
            throw error;
        }
    }

    /**
     * 키워드 세탁 (Refining): 검색량이 가장 높은 연관 키워드 추출
     */
    async refineKeyword(keyword: string): Promise<string> {
        try {
            const stats = await this.getRelatedKeywords(keyword);
            if (stats.length === 0) return keyword;

            const parseCnt = (val: any) => {
                if (typeof val === 'number') return val;
                if (typeof val === 'string') {
                    if (val.includes('<')) return 5;
                    return parseInt(val.replace(/[^0-9]/g, '')) || 0;
                }
                return 0;
            };

            // 월간 검색수(Mobile) 기준 내림차순 정렬
            const sorted = stats
                .map(s => ({
                    keyword: s.relKeyword,
                    mobileVol: parseCnt(s.monthlyMobileQcCnt),
                    similarity: this.calculateSimilarity(keyword, s.relKeyword)
                }))
                // 상위 5개 중 유사도가 높은 것 우선 (정규식 등으로 포함 여부 확인)
                .filter(s => s.keyword.includes(keyword) || keyword.includes(s.keyword) || s.similarity > 0.5)
                .sort((a, b) => b.mobileVol - a.mobileVol);

            if (sorted.length > 0) {
                console.log(`[NaverAdService] Keyword refined: ${keyword} -> ${sorted[0].keyword} (Vol: ${sorted[0].mobileVol})`);
                return sorted[0].keyword;
            }

            return keyword;
        } catch {
            return keyword;
        }
    }

    private calculateSimilarity(s1: string, s2: string): number {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        if (longer.length === 0) return 1.0;
        return (longer.length - this.editDistance(longer, shorter)) / longer.length;
    }

    private editDistance(s1: string, s2: string): number {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) costs[j] = j;
                else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        }
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }
}
