import { BrowserContext, Page } from 'playwright';
import { createCursor, GhostCursor } from 'ghost-cursor';

/**
 * High-Fidelity Interaction Engine (AdvancedAutomator)
 * Playwright Stealth 환경 위에 인간의 생체 역학적 움직임과 비선형적 딜레이를 추가하여
 * 100%에 가까운 봇 탐지 우회를 돕는 코어 클래스.
 */
export class AdvancedAutomator {
  private browserContent: BrowserContext | null = null;
  private page: Page | null = null;
  private cursor: GhostCursor | null = null;

  /**
   * 확률론적 가우시안 지연 시간 생성
   * 무조건 일정한 딜레이(예: random(100, 200))가 아닌,
   * 인간의 행동 패턴 곡선(종 모양의 정규 분포)을 모사한 값을 반환합니다.
   *
   * @param mean 평균 지연 시간 (ms)
   * @param stdDev 표준 편차
   * @returns 계산된 지연 시간 (ms)
   */
  public generateGaussianDelay(mean: number, stdDev: number): number {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const delay = Math.round(mean + z * stdDev);
    return Math.max(10, delay); // 최소 10ms 보장
  }

  /**
   * 인간과 유사한 지연 시간으로 대기합니다.
   * 기본은 평균 800ms, 표준편차 300ms 입니다.
   */
  public async randomWait(mean: number = 800, stdDev: number = 300): Promise<void> {
    const delay = this.generateGaussianDelay(mean, stdDev);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 해당 셀렉터가 화면에 실제로 보이는지(Visible) 계산하여 스크롤하는 유기적 접근 로직
   */
  public async organicScrollTo(selector: string): Promise<boolean> {
    if (!this.page) throw new Error('페이지가 초기화되지 않았습니다.');
    
    try {
      const element = await this.page.$(selector);
      if (!element) return false;

      // 엘리먼트가 화면에 보이도록 부드럽게 스크롤
      await element.scrollIntoViewIfNeeded();
      
      // 스크롤 후 사람이 화면을 인지하는 시간 부여
      await this.randomWait(1200, 400); 
      return true;
    } catch (e) {
      console.error(`[AdvancedAutomator] 스크롤 실패: ${selector}`, e);
      return false;
    }
  }

  /**
   * 마우스를 비선형적 궤적으로 이동시킨 후, 클릭 전후 미세한 딜레이를 동반한 유기적 클릭
   */
  public async organicClick(selector: string): Promise<boolean> {
    if (!this.page || !this.cursor) {
      throw new Error('페이지 또는 커서 객체가 초기화되지 않았습니다.');
    }

    try {
      const isVisible = await this.organicScrollTo(selector);
      if (!isVisible) {
         console.warn(`[AdvancedAutomator] 클릭 대상 노출 안됨: ${selector}`);
         return false;
      }

      // 커서를 베지에 곡선 기반으로 유기적 이동
      await this.cursor.click(selector);
      
      // 클릭 직후 잔여 동작(여운) 대기
      await this.randomWait(500, 200);
      return true;
    } catch (e) {
      console.error(`[AdvancedAutomator] 클릭 실패: ${selector}`, e);
      return false;
    }
  }

  /**
   * 키보드 타이핑 시 한 글자 단위마다 물리적 키보드의 가우시안 지연을 부여해 입력
   */
  public async organicType(selector: string, text: string): Promise<boolean> {
    if (!this.page || !this.cursor) {
      throw new Error('페이지 또는 커서 객체가 초기화되지 않았습니다.');
    }

    try {
      const isVisible = await this.organicScrollTo(selector);
      if (!isVisible) return false;

      // 입력란 클릭
      await this.cursor.click(selector);
      await this.randomWait(300, 100);

      // 텍스트 한 글자씩 타이핑
      for (const char of text) {
        await this.page.keyboard.type(char);
        // 타이핑 간 가우시안 딜레이 (평균 150ms, 표준편차 40ms)
        await this.randomWait(150, 40);
      }

      // 입력 완료 후 확인 시간
      await this.randomWait(700, 250);
      return true;
    } catch (e) {
      console.error(`[AdvancedAutomator] 입력 실패: ${selector}`, e);
      return false;
    }
  }

  /**
   * 페이지와 브라우저 객체를 자동화 엔진 커서와 연결합니다.
   * crawlerBrowser.ts에서 생성한 context와 page를 주입받아 사용합니다.
   */
  public async attach(context: BrowserContext, page: Page): Promise<void> {
    this.browserContent = context;
    this.page = page;
    this.cursor = createCursor(page as any);
    console.log('[AdvancedAutomator] Ghost-Cursor Attach 완료.');
  }

  /**
   * 해당 인스턴스의 페이지를 반환합니다.
   */
  public getPage(): Page | null {
    return this.page;
  }

  /**
   * 페이지 내에서 목적 없이 무작위로 마우스를 움직이고 화면을 약간 위아래로 스크롤합니다 (워밍업 등에 사용)
   */
  public async organicWander(): Promise<void> {
    if (!this.page || !this.cursor) {
      throw new Error('페이지 또는 커서 객체가 초기화되지 않았습니다.');
    }

    try {
      const { innerWidth, innerHeight } = await this.page.evaluate(() => {
        return { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
      });

      // 무작위 좌표로 이동
      const randomX = Math.floor(Math.random() * (innerWidth * 0.8)) + (innerWidth * 0.1);
      const randomY = Math.floor(Math.random() * (innerHeight * 0.8)) + (innerHeight * 0.1);
      
      await this.cursor.moveTo({ x: randomX, y: randomY });
      await this.randomWait(1000, 400);

      // 약간의 스크롤
      const scrollAmount = Math.floor(Math.random() * 400) - 200; // -200 ~ 200
      await this.page.mouse.wheel(0, scrollAmount);
      await this.randomWait(800, 300);

    } catch (e) {
      console.warn('[AdvancedAutomator] 유기적 배회(organicWander) 실패:', (e as Error).message);
    }
  }
}
