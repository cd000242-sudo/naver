// ✅ 다중 블로그 관리 기능
// 여러 네이버 계정을 동시에 관리

export type BlogAccount = {
  id: string;
  name: string; // 계정 별명
  blogId: string; // 네이버 블로그 ID
  naverId?: string; // 네이버 로그인 ID (암호화 저장)
  naverPassword?: string; // 네이버 로그인 비밀번호 (암호화 저장)
  isActive: boolean;
  lastUsed?: string;
  totalPosts: number;
  createdAt: string;
  settings: {
    dailyLimit: number;
    autoRotate: boolean; // 자동 순환 발행
    category?: string;
    isJabBlog?: boolean;
    // ✅ 계정별 개별 설정 (다중계정 동시발행용)
    imageSource?: 'gemini' | 'imagen' | 'pexels' | 'unsplash' | 'skip'; // 이미지 소스
    toneStyle?: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous'; // 글 톤
    publishMode?: 'publish' | 'draft'; // 발행 모드
    keywords?: string[]; // 키워드 목록 (순차 사용)
    urls?: string[]; // URL 목록 (순차 사용)
    keywordIndex?: number; // 현재 키워드 인덱스
    urlIndex?: number; // 현재 URL 인덱스
  };
};

export type AccountStats = {
  accountId: string;
  todayPosts: number;
  weekPosts: number;
  monthPosts: number;
  lastPostAt?: string;
};

export class BlogAccountManager {
  private accounts: Map<string, BlogAccount> = new Map();
  private activeAccountId: string | null = null;
  private rotationIndex: number = 0;

  constructor() {
    this.loadFromStorage();
  }

  // ✅ 로컬 스토리지에서 데이터 로드
  private loadFromStorage(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');

      const dataPath = path.join(app.getPath('userData'), 'blog-accounts.json');
      if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        this.accounts = new Map(Object.entries(data.accounts || {}));
        this.activeAccountId = data.activeAccountId || null;
        this.rotationIndex = data.rotationIndex || 0;
      }
    } catch (error) {
      console.log('[BlogAccountManager] 저장된 데이터 없음');
    }
  }

  // ✅ 로컬 스토리지에 데이터 저장
  private saveToStorage(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');

      const dataPath = path.join(app.getPath('userData'), 'blog-accounts.json');
      const data = {
        accounts: Object.fromEntries(this.accounts),
        activeAccountId: this.activeAccountId,
        rotationIndex: this.rotationIndex,
        lastSaved: new Date().toISOString(),
      };
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[BlogAccountManager] 저장 실패:', error);
    }
  }

  // ✅ 간단한 암호화 (Base64 + 문자 시프트)
  private encryptPassword(password: string): string {
    const shifted = password.split('').map(c => String.fromCharCode(c.charCodeAt(0) + 3)).join('');
    return Buffer.from(shifted).toString('base64');
  }

  // ✅ 복호화
  public decryptPassword(encrypted: string): string {
    try {
      const decoded = Buffer.from(encrypted, 'base64').toString('utf-8');
      return decoded.split('').map(c => String.fromCharCode(c.charCodeAt(0) - 3)).join('');
    } catch {
      return '';
    }
  }

  // ✅ 계정 추가 (로그인 정보 포함)
  addAccount(
    name: string,
    blogId: string,
    naverId?: string,
    naverPassword?: string,
    settings?: Partial<BlogAccount['settings']>
  ): BlogAccount {
    const id = `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const account: BlogAccount = {
      id,
      name,
      blogId,
      naverId: naverId || undefined,
      naverPassword: naverPassword ? this.encryptPassword(naverPassword) : undefined,
      isActive: true,
      totalPosts: 0,
      createdAt: new Date().toISOString(),
      settings: {
        dailyLimit: 5,
        autoRotate: true,
        ...settings,
      },
    };

    this.accounts.set(id, account);

    // 첫 번째 계정이면 활성화
    if (this.accounts.size === 1) {
      this.activeAccountId = id;
    }

    this.saveToStorage();
    console.log(`[BlogAccountManager] 계정 추가: ${name} (${blogId})`);

    return account;
  }

  // ✅ 계정 로그인 정보 가져오기 (복호화된 비밀번호)
  getAccountCredentials(accountId: string): { naverId: string; naverPassword: string } | null {
    const account = this.accounts.get(accountId);
    if (!account || !account.naverId || !account.naverPassword) {
      return null;
    }
    return {
      naverId: account.naverId,
      naverPassword: this.decryptPassword(account.naverPassword),
    };
  }

  // ✅ 계정 로그인 정보 업데이트
  updateAccountCredentials(accountId: string, naverId: string, naverPassword: string): boolean {
    const account = this.accounts.get(accountId);
    if (!account) return false;

    account.naverId = naverId;
    account.naverPassword = this.encryptPassword(naverPassword);
    this.accounts.set(accountId, account);
    this.saveToStorage();

    return true;
  }

  // ✅ 계정 수정
  updateAccount(accountId: string, updates: Partial<BlogAccount>): boolean {
    const account = this.accounts.get(accountId);
    if (!account) return false;

    const updatedAccount = { ...account, ...updates };
    this.accounts.set(accountId, updatedAccount);
    this.saveToStorage();

    return true;
  }

  // ✅ 계정 삭제
  removeAccount(accountId: string): boolean {
    if (!this.accounts.has(accountId)) return false;

    this.accounts.delete(accountId);

    // 활성 계정이 삭제되면 다른 계정으로 전환
    if (this.activeAccountId === accountId) {
      const remaining = Array.from(this.accounts.keys());
      this.activeAccountId = remaining.length > 0 ? remaining[0] : null;
    }

    this.saveToStorage();
    return true;
  }

  // ✅ 활성 계정 설정
  setActiveAccount(accountId: string): boolean {
    if (!this.accounts.has(accountId)) return false;

    this.activeAccountId = accountId;
    this.saveToStorage();

    return true;
  }

  // ✅ 활성 계정 가져오기
  getActiveAccount(): BlogAccount | null {
    if (!this.activeAccountId) return null;
    return this.accounts.get(this.activeAccountId) || null;
  }

  // ✅ 모든 계정 가져오기
  getAllAccounts(): BlogAccount[] {
    return Array.from(this.accounts.values());
  }

  // ✅ 특정 계정 가져오기
  getAccount(accountId: string): BlogAccount | undefined {
    return this.accounts.get(accountId);
  }

  // ✅ 다음 발행 계정 가져오기 (자동 순환)
  getNextAccountForPublish(): BlogAccount | null {
    const activeAccounts = this.getAllAccounts().filter(a => a.isActive);

    if (activeAccounts.length === 0) return null;
    if (activeAccounts.length === 1) return activeAccounts[0];

    // 자동 순환이 활성화된 계정만 필터링
    const rotateAccounts = activeAccounts.filter(a => a.settings.autoRotate);

    if (rotateAccounts.length === 0) {
      // 자동 순환 계정이 없으면 활성 계정 반환
      return this.getActiveAccount();
    }

    // 일일 한도 체크
    const availableAccounts = rotateAccounts.filter(a => {
      const stats = this.getAccountStats(a.id);
      return stats.todayPosts < a.settings.dailyLimit;
    });

    if (availableAccounts.length === 0) {
      console.log('[BlogAccountManager] 모든 계정이 일일 한도에 도달했습니다.');
      return null;
    }

    // 순환 인덱스로 다음 계정 선택
    this.rotationIndex = (this.rotationIndex + 1) % availableAccounts.length;
    const nextAccount = availableAccounts[this.rotationIndex];

    this.saveToStorage();
    return nextAccount;
  }

  // ✅ 발행 기록 업데이트
  recordPublish(accountId: string): void {
    const account = this.accounts.get(accountId);
    if (!account) return;

    account.totalPosts++;
    account.lastUsed = new Date().toISOString();

    this.accounts.set(accountId, account);
    this.saveToStorage();

    // 발행 기록 저장 (일별)
    this.savePublishRecord(accountId);
  }

  // ✅ 발행 기록 저장
  private savePublishRecord(accountId: string): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');

      const recordPath = path.join(app.getPath('userData'), 'publish-records.json');
      let records: Record<string, string[]> = {};

      if (fs.existsSync(recordPath)) {
        records = JSON.parse(fs.readFileSync(recordPath, 'utf-8'));
      }

      const today = new Date().toISOString().split('T')[0];
      const key = `${accountId}_${today}`;

      if (!records[key]) {
        records[key] = [];
      }
      records[key].push(new Date().toISOString());

      fs.writeFileSync(recordPath, JSON.stringify(records, null, 2));
    } catch (error) {
      console.error('[BlogAccountManager] 발행 기록 저장 실패:', error);
    }
  }

  // ✅ 계정 통계 가져오기
  getAccountStats(accountId: string): AccountStats {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');

      const recordPath = path.join(app.getPath('userData'), 'publish-records.json');
      let records: Record<string, string[]> = {};

      if (fs.existsSync(recordPath)) {
        records = JSON.parse(fs.readFileSync(recordPath, 'utf-8'));
      }

      const now = new Date();
      const today = now.toISOString().split('T')[0];

      // 오늘 발행 수
      const todayKey = `${accountId}_${today}`;
      const todayPosts = records[todayKey]?.length || 0;

      // 이번 주 발행 수
      let weekPosts = 0;
      for (let i = 0; i < 7; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const key = `${accountId}_${date.toISOString().split('T')[0]}`;
        weekPosts += records[key]?.length || 0;
      }

      // 이번 달 발행 수
      let monthPosts = 0;
      for (let i = 0; i < 30; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const key = `${accountId}_${date.toISOString().split('T')[0]}`;
        monthPosts += records[key]?.length || 0;
      }

      // 마지막 발행 시간
      const account = this.accounts.get(accountId);

      return {
        accountId,
        todayPosts,
        weekPosts,
        monthPosts,
        lastPostAt: account?.lastUsed,
      };
    } catch (error) {
      return {
        accountId,
        todayPosts: 0,
        weekPosts: 0,
        monthPosts: 0,
      };
    }
  }

  // ✅ 전체 통계
  getTotalStats(): {
    totalAccounts: number;
    activeAccounts: number;
    todayTotalPosts: number;
    weekTotalPosts: number;
  } {
    const accounts = this.getAllAccounts();
    const activeAccounts = accounts.filter(a => a.isActive);

    let todayTotalPosts = 0;
    let weekTotalPosts = 0;

    for (const account of accounts) {
      const stats = this.getAccountStats(account.id);
      todayTotalPosts += stats.todayPosts;
      weekTotalPosts += stats.weekPosts;
    }

    return {
      totalAccounts: accounts.length,
      activeAccounts: activeAccounts.length,
      todayTotalPosts,
      weekTotalPosts,
    };
  }

  // ✅ 계정별 다음 키워드 가져오기 (순환)
  getNextKeyword(accountId: string): string | null {
    const account = this.accounts.get(accountId);
    if (!account || !account.settings.keywords || account.settings.keywords.length === 0) {
      return null;
    }

    const index = account.settings.keywordIndex || 0;
    const keyword = account.settings.keywords[index];

    // 다음 인덱스로 업데이트 (순환)
    account.settings.keywordIndex = (index + 1) % account.settings.keywords.length;
    this.accounts.set(accountId, account);
    this.saveToStorage();

    return keyword;
  }

  // ✅ 계정별 다음 URL 가져오기 (순환)
  getNextUrl(accountId: string): string | null {
    const account = this.accounts.get(accountId);
    if (!account || !account.settings.urls || account.settings.urls.length === 0) {
      return null;
    }

    const index = account.settings.urlIndex || 0;
    const url = account.settings.urls[index];

    // 다음 인덱스로 업데이트 (순환)
    account.settings.urlIndex = (index + 1) % account.settings.urls.length;
    this.accounts.set(accountId, account);
    this.saveToStorage();

    return url;
  }

  // ✅ 계정별 다음 콘텐츠 소스 가져오기 (키워드 또는 URL 번갈아가며)
  getNextContentSource(accountId: string): { type: 'keyword' | 'url'; value: string } | null {
    const account = this.accounts.get(accountId);
    if (!account) return null;

    const hasKeywords = account.settings.keywords && account.settings.keywords.length > 0;
    const hasUrls = account.settings.urls && account.settings.urls.length > 0;

    if (!hasKeywords && !hasUrls) return null;

    // 키워드만 있으면 키워드 반환
    if (hasKeywords && !hasUrls) {
      const keyword = this.getNextKeyword(accountId);
      return keyword ? { type: 'keyword', value: keyword } : null;
    }

    // URL만 있으면 URL 반환
    if (!hasKeywords && hasUrls) {
      const url = this.getNextUrl(accountId);
      return url ? { type: 'url', value: url } : null;
    }

    // 둘 다 있으면 번갈아가며 반환
    const keywordIndex = account.settings.keywordIndex || 0;
    const urlIndex = account.settings.urlIndex || 0;

    // 키워드와 URL 인덱스 합계가 짝수면 키워드, 홀수면 URL
    if ((keywordIndex + urlIndex) % 2 === 0) {
      const keyword = this.getNextKeyword(accountId);
      return keyword ? { type: 'keyword', value: keyword } : null;
    } else {
      const url = this.getNextUrl(accountId);
      return url ? { type: 'url', value: url } : null;
    }
  }

  // ✅ 계정 설정 업데이트 (개별 설정 포함)
  updateAccountSettings(accountId: string, settings: Partial<BlogAccount['settings']>): boolean {
    const account = this.accounts.get(accountId);
    if (!account) return false;

    account.settings = { ...account.settings, ...settings };
    this.accounts.set(accountId, account);
    this.saveToStorage();

    return true;
  }

  // ✅ 계정 활성화/비활성화 토글
  toggleAccountActive(accountId: string): boolean {
    const account = this.accounts.get(accountId);
    if (!account) return false;

    account.isActive = !account.isActive;
    this.accounts.set(accountId, account);
    this.saveToStorage();

    return account.isActive;
  }
}
