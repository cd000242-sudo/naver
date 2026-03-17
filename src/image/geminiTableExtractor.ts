/**
 * Gemini 기반 표 이미지 데이터 추출기
 * - 크롤링 데이터 + 본문에서 스펙/장단점 JSON 추출
 * - 표 이미지 생성을 위한 구조화된 데이터 제공
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface SpecRow {
    label: string;
    value: string;
}

export interface ProsConsData {
    pros: string[];
    cons: string[];
}

/**
 * Gemini를 사용하여 제품 스펙 추출
 * @param productName 제품명
 * @param crawledData 크롤링된 제품 정보 (선택)
 * @param bodyContent 본문 내용
 * @returns 스펙 배열 (최소 3개 이상이어야 표 생성)
 */
export async function extractSpecsWithGemini(
    productName: string,
    crawledData: any,
    bodyContent: string,
    apiKey?: string
): Promise<SpecRow[]> {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
        console.log('[표 이미지] Gemini API 키 없음, 스펙 추출 건너뜀');
        return [];
    }

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // ✅ [2026-03-04 FIX] crawledData가 문자열이면 그대로, 객체면 JSON.stringify
        // 기존: 문자열도 JSON.stringify → 이스케이프된 "\\n" 형태로 Gemini에 전달되어 가격 인식 실패
        const crawledInfo = crawledData
            ? (typeof crawledData === 'string' ? crawledData : JSON.stringify(crawledData, null, 2))
            : '(없음)';

        const prompt = `
당신은 제품 스펙 분석 전문가입니다.

[제품명]
${productName}

[크롤링된 제품 정보]
${crawledInfo}

[본문 내용]
${bodyContent.substring(0, 3000)}

위 정보를 분석하여 블로그 독자가 한눈에 볼 수 있는 **핵심 스펙 5~7개**를 추출하세요.

📋 규칙:
1. label: 항목명 (예: 용량, 크기, 가격, 소재, 제조국 등)
2. value: 간결한 값 (20자 이내, 문장 금지)
3. 명확한 수치나 사실만 포함 (애매한 정보 제외)
4. 중요한 순서대로 정렬
5. ⚠️ 가격 항목은 [크롤링된 제품 정보]의 가격을 반드시 사용! 본문에서 "약 XX만원", "XX원대" 등 다른 가격이 언급되더라도 크롤링 가격이 정확한 실제 판매가이므로 이것만 사용하세요.

JSON 배열만 출력하세요:
[
  { "label": "제품명", "value": "..." },
  { "label": "가격", "value": "..." },
  ...
]
`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // JSON 추출
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.log('[표 이미지] 스펙 JSON 파싱 실패');
            return [];
        }

        const specs: SpecRow[] = JSON.parse(jsonMatch[0]);
        console.log(`[표 이미지] Gemini 스펙 추출 성공: ${specs.length}개`);
        return specs;
    } catch (error: any) {
        console.log(`[표 이미지] 스펙 추출 실패 (Silent Skip): ${error.message}`);
        return [];
    }
}

/**
 * Gemini를 사용하여 장단점 추출
 * @param productName 제품명
 * @param bodyContent 본문 내용
 * @returns 장단점 데이터 (각각 2개 이상이어야 표 생성)
 */
export async function extractProsConsWithGemini(
    productName: string,
    bodyContent: string,
    apiKey?: string
): Promise<ProsConsData> {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
        console.log('[표 이미지] Gemini API 키 없음, 장단점 추출 건너뜀');
        return { pros: [], cons: [] };
    }

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `
당신은 객관적인 제품 리뷰어입니다.

[제품명]
${productName}

[본문 내용]
${bodyContent.substring(0, 4000)}

위 본문을 분석하여 **객관적인 장단점**을 추출하세요.

📋 규칙:
1. 장점(pros): 3~4개 (실제 언급된 장점만)
2. 단점(cons): 2~3개 (실제 언급된 단점 또는 개선점)
3. 각 항목은 15~30자 정도의 명확한 문구
4. 과장 금지, 사실 기반만
5. 광고성 문구 제외

JSON만 출력하세요:
{
  "pros": ["장점1", "장점2", "장점3"],
  "cons": ["단점1", "단점2"]
}
`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // JSON 추출
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.log('[표 이미지] 장단점 JSON 파싱 실패');
            return { pros: [], cons: [] };
        }

        const data: ProsConsData = JSON.parse(jsonMatch[0]);
        console.log(`[표 이미지] Gemini 장단점 추출 성공: 장점 ${data.pros.length}개, 단점 ${data.cons.length}개`);
        return data;
    } catch (error: any) {
        console.log(`[표 이미지] 장단점 추출 실패 (Silent Skip): ${error.message}`);
        return { pros: [], cons: [] };
    }
}

/**
 * 표 이미지 생성 가능 여부 확인
 */
export function canGenerateSpecTable(specs: SpecRow[]): boolean {
    return specs.length >= 3;
}

export function canGenerateProsConsTable(data: ProsConsData): boolean {
    return data.pros.length >= 2 && data.cons.length >= 1;
}
