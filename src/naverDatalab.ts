import axios, { AxiosInstance } from 'axios';

export interface DatalabSearchTrend {
  period: string; // 'date' | 'week' | 'month'
  ratio: number; // 검색량 비율 (0-100)
}

export interface DatalabKeywordTrend {
  keyword: string[];
  period: string;
  groupName: string;
  data: Array<{
    period: string;
    ratio: number;
  }>;
}

export interface DatalabAgeGenderRatio {
  period: string;
  group: string; // 'age' | 'gender'
  ratio: number;
}

export interface DatalabRelatedKeyword {
  keyword: string;
  score: number; // 관련도 점수
}

export interface DatalabTrendResponse {
  startDate: string;
  endDate: string;
  timeUnit: 'date' | 'week' | 'month';
  results: Array<{
    title: string;
    keywords: string[];
    data: Array<{
      period: string;
      ratio: number;
    }>;
  }>;
}

export interface DatalabRelatedKeywordsResponse {
  keyword: string;
  data: Array<{
    title: string;
    keywords: string[];
    data: Array<{
      relKeyword: string;
      monthlyPcQcCnt: number;
      monthlyMobileQcCnt: number;
      monthlyAvePcClkCnt: number;
      monthlyAveMobileClkCnt: number;
      monthlyAvePcCtr: number;
      monthlyAveMobileCtr: number;
      plAvgDepth: number;
      compIdx: string;
    }>;
  }>;
}

export interface DatalabAgeGenderResponse {
  period: string;
  group: string;
  data: Array<{
    period: string;
    group: string;
    ratio: number;
  }>;
}

/**
 * 네이버 데이터랩 API 클라이언트
 * 검색 트렌드, 관련 키워드, 연령/성별 분석 등을 제공
 */
export class NaverDatalabClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {
    this.client = axios.create({
      baseURL: 'https://openapi.naver.com/v1/datalab',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });
  }

  /**
   * 검색 트렌드 조회
   * @param keywords 검색 키워드 배열 (최대 5개)
   * @param startDate 시작 날짜 (YYYY-MM-DD)
   * @param endDate 종료 날짜 (YYYY-MM-DD)
   * @param timeUnit 시간 단위 ('date' | 'week' | 'month')
   */
  async getSearchTrend(
    keywords: string[],
    startDate: string,
    endDate: string,
    timeUnit: 'date' | 'week' | 'month' = 'date',
  ): Promise<DatalabTrendResponse> {
    if (keywords.length === 0 || keywords.length > 5) {
      throw new Error('키워드는 1개 이상 5개 이하여야 합니다.');
    }

    const requestBody = {
      startDate,
      endDate,
      timeUnit,
      keywordGroups: keywords.map((keyword, index) => ({
        groupName: keyword,
        keywords: [keyword],
      })),
    };

    try {
      const response = await this.client.post<DatalabTrendResponse>(
        '/search',
        requestBody,
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.errorMessage || error.message;
        const errorCode = error.response?.data?.errorCode || '';
        const statusCode = error.response?.status;
        
        // 인증 오류인 경우 더 자세한 안내 제공
        if (statusCode === 401 || errorMessage.includes('Authentication failed') || errorMessage.includes('Scope Status Invalid')) {
          throw new Error(
            `네이버 데이터랩 API 인증 실패: ${errorMessage}\n\n` +
            `해결 방법:\n` +
            `1. 네이버 개발자 센터(https://developers.naver.com)에 로그인\n` +
            `2. "내 애플리케이션" → 해당 애플리케이션 선택\n` +
            `3. "API 설정" 탭에서 "데이터랩" 서비스가 활성화되어 있는지 확인\n` +
            `4. "데이터랩" 서비스가 없으면 추가하고 활성화\n` +
            `5. Client ID와 Client Secret이 올바른지 확인\n` +
            `6. 환경 설정에서 API 키를 다시 입력하고 저장\n\n` +
            `참고: "검색" 서비스만 활성화되어 있으면 데이터랩 API를 사용할 수 없습니다. 반드시 "데이터랩" 서비스를 활성화해야 합니다.`
          );
        }
        
        throw new Error(`네이버 데이터랩 API 오류: ${errorMessage}${errorCode ? ` (코드: ${errorCode})` : ''}`);
      }
      throw error;
    }
  }

  /**
   * 관련 키워드 조회
   * @param keyword 검색 키워드
   */
  async getRelatedKeywords(keyword: string): Promise<DatalabRelatedKeywordsResponse> {
    const requestBody = {
      keyword,
    };

    try {
      const response = await this.client.post<DatalabRelatedKeywordsResponse>(
        '/keywordstool',
        requestBody,
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.errorMessage || error.message;
        const errorCode = error.response?.data?.errorCode || '';
        const statusCode = error.response?.status;
        
        // 인증 오류인 경우 더 자세한 안내 제공
        if (statusCode === 401 || errorMessage.includes('Authentication failed') || errorMessage.includes('Scope Status Invalid')) {
          throw new Error(
            `네이버 데이터랩 API 인증 실패: ${errorMessage}\n\n` +
            `해결 방법:\n` +
            `1. 네이버 개발자 센터(https://developers.naver.com)에 로그인\n` +
            `2. "내 애플리케이션" → 해당 애플리케이션 선택\n` +
            `3. "API 설정" 탭에서 "데이터랩" 서비스가 활성화되어 있는지 확인\n` +
            `4. "데이터랩" 서비스가 없으면 추가하고 활성화\n` +
            `5. Client ID와 Client Secret이 올바른지 확인\n` +
            `6. 환경 설정에서 API 키를 다시 입력하고 저장\n\n` +
            `참고: "검색" 서비스만 활성화되어 있으면 데이터랩 API를 사용할 수 없습니다. 반드시 "데이터랩" 서비스를 활성화해야 합니다.`
          );
        }
        
        throw new Error(`네이버 데이터랩 API 오류: ${errorMessage}${errorCode ? ` (코드: ${errorCode})` : ''}`);
      }
      throw error;
    }
  }

  /**
   * 연령별/성별 검색 비율 조회
   * @param keywords 검색 키워드 배열 (최대 5개)
   * @param startDate 시작 날짜 (YYYY-MM-DD)
   * @param endDate 종료 날짜 (YYYY-MM-DD)
   * @param group 'age' | 'gender'
   */
  async getAgeGenderRatio(
    keywords: string[],
    startDate: string,
    endDate: string,
    group: 'age' | 'gender' = 'age',
  ): Promise<DatalabAgeGenderResponse> {
    if (keywords.length === 0 || keywords.length > 5) {
      throw new Error('키워드는 1개 이상 5개 이하여야 합니다.');
    }

    const requestBody = {
      startDate,
      endDate,
      keywordGroups: keywords.map((keyword) => ({
        groupName: keyword,
        keywords: [keyword],
      })),
      ages: group === 'age' ? ['10', '20', '30', '40', '50', '60'] : undefined,
      gender: group === 'gender' ? 'm' : undefined,
    };

    try {
      const response = await this.client.post<DatalabAgeGenderResponse>(
        `/search/${group}`,
        requestBody,
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.errorMessage || error.message;
        const errorCode = error.response?.data?.errorCode || '';
        const statusCode = error.response?.status;
        
        // 인증 오류인 경우 더 자세한 안내 제공
        if (statusCode === 401 || errorMessage.includes('Authentication failed') || errorMessage.includes('Scope Status Invalid')) {
          throw new Error(
            `네이버 데이터랩 API 인증 실패: ${errorMessage}\n\n` +
            `해결 방법:\n` +
            `1. 네이버 개발자 센터(https://developers.naver.com)에 로그인\n` +
            `2. "내 애플리케이션" → 해당 애플리케이션 선택\n` +
            `3. "API 설정" 탭에서 "데이터랩" 서비스가 활성화되어 있는지 확인\n` +
            `4. "데이터랩" 서비스가 없으면 추가하고 활성화\n` +
            `5. Client ID와 Client Secret이 올바른지 확인\n` +
            `6. 환경 설정에서 API 키를 다시 입력하고 저장\n\n` +
            `참고: "검색" 서비스만 활성화되어 있으면 데이터랩 API를 사용할 수 없습니다. 반드시 "데이터랩" 서비스를 활성화해야 합니다.`
          );
        }
        
        throw new Error(`네이버 데이터랩 API 오류: ${errorMessage}${errorCode ? ` (코드: ${errorCode})` : ''}`);
      }
      throw error;
    }
  }

  /**
   * 키워드 트렌드 요약 정보 생성
   * 최근 7일간의 트렌드를 분석하여 상승/하락 여부를 판단
   */
  async getTrendSummary(keyword: string): Promise<{
    trend: 'up' | 'down' | 'stable';
    recentRatio: number;
    averageRatio: number;
    suggestion: string;
  }> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    const endDateStr = endDate.toISOString().split('T')[0];
    const startDateStr = startDate.toISOString().split('T')[0];

    const trendData = await this.getSearchTrend([keyword], startDateStr, endDateStr, 'date');

    if (!trendData.results || trendData.results.length === 0) {
      throw new Error('트렌드 데이터를 가져올 수 없습니다.');
    }

    const dataPoints = trendData.results[0].data;
    if (dataPoints.length < 2) {
      return {
        trend: 'stable',
        recentRatio: dataPoints[0]?.ratio || 0,
        averageRatio: dataPoints[0]?.ratio || 0,
        suggestion: '데이터가 부족하여 트렌드를 분석할 수 없습니다.',
      };
    }

    const recentRatio = dataPoints[dataPoints.length - 1].ratio;
    const previousRatio = dataPoints[dataPoints.length - 2].ratio;
    const averageRatio = dataPoints.reduce((sum, d) => sum + d.ratio, 0) / dataPoints.length;

    const trend: 'up' | 'down' | 'stable' = 
      recentRatio > previousRatio * 1.2 ? 'up' :
      recentRatio < previousRatio * 0.8 ? 'down' : 'stable';

    let suggestion = '';
    if (trend === 'up') {
      suggestion = `"${keyword}" 키워드가 최근 상승세입니다. 트렌드에 맞춘 콘텐츠를 작성하면 좋은 성과를 기대할 수 있습니다.`;
    } else if (trend === 'down') {
      suggestion = `"${keyword}" 키워드가 최근 하락세입니다. 현재 트렌드보다는 새로운 관점이나 깊이 있는 분석이 필요합니다.`;
    } else {
      suggestion = `"${keyword}" 키워드는 안정적인 검색량을 유지하고 있습니다. 꾸준한 콘텐츠로 독자층을 확보할 수 있습니다.`;
    }

    return {
      trend,
      recentRatio,
      averageRatio,
      suggestion,
    };
  }
}

/**
 * 네이버 데이터랩 클라이언트 인스턴스 생성 (환경 변수 사용)
 */
export function createDatalabClient(): NaverDatalabClient | null {
  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn('[NaverDatalab] 클라이언트 ID 또는 Secret이 설정되지 않았습니다.');
    console.warn('[NaverDatalab] 환경 설정에서 네이버 데이터랩 Client ID와 Secret을 입력해주세요.');
    return null;
  }

  // API 키 형식 검증
  const trimmedClientId = clientId.trim();
  const trimmedClientSecret = clientSecret.trim();
  
  if (trimmedClientId.length < 10 || trimmedClientSecret.length < 10) {
    console.warn('[NaverDatalab] ⚠️ API 키 길이가 짧습니다. 올바른 키인지 확인해주세요.');
    console.warn('[NaverDatalab] Client ID 길이:', trimmedClientId.length);
    console.warn('[NaverDatalab] Client Secret 길이:', trimmedClientSecret.length);
    console.warn('[NaverDatalab] ⚠️ 잘못된 API 키로 인해 인증 오류가 발생할 수 있습니다.');
  }

  // 빈 문자열 체크
  if (trimmedClientId === '' || trimmedClientSecret === '') {
    console.error('[NaverDatalab] ⚠️ API 키가 비어있습니다. 환경 설정에서 올바른 키를 입력해주세요.');
    return null;
  }

  console.log('[NaverDatalab] 클라이언트 생성됨');
  console.log('[NaverDatalab] Client ID:', trimmedClientId.substring(0, 10) + '... (길이: ' + trimmedClientId.length + ')');
  console.log('[NaverDatalab] Client Secret:', '***' + trimmedClientSecret.substring(trimmedClientSecret.length - 4) + ' (길이: ' + trimmedClientSecret.length + ')');
  console.log('[NaverDatalab] ⚠️ 중요: 네이버 개발자 센터에서 "데이터랩" 서비스가 활성화되어 있어야 합니다.');
  console.log('[NaverDatalab] ⚠️ 참고: "검색" 서비스만 활성화되어 있으면 데이터랩 API를 사용할 수 없습니다!');
  console.log('[NaverDatalab] ⚠️ 반드시 "데이터랩" 서비스를 별도로 활성화해야 합니다.');

  return new NaverDatalabClient(trimmedClientId, trimmedClientSecret);
}


