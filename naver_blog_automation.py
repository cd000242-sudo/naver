"""
네이버 블로그 자동 포스팅 프로그램
작성자: 리더남
기능: 네이버 로그인 후 블로그 글쓰기 페이지로 자동 이동
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.action_chains import ActionChains
import pyperclip
import time

class NaverBlogAutomation:
    def __init__(self):
        """네이버 블로그 자동화 클래스 초기화"""
        self.driver = None
        self.wait = None
        
        # 네이버 계정 정보
        self.naver_id = "tjdgus24280"
        self.naver_password = "@Qkrtjdgus123"
        
        # URL 정보
        self.login_url = "https://nid.naver.com/nidlogin.login"
        self.blog_write_url = "https://blog.naver.com/GoBlogWrite.naver"
    
    def setup_driver(self):
        """크롬 드라이버 설정"""
        try:
            chrome_options = Options()
            # 자동화 탐지 우회를 위한 옵션들
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            
            # 드라이버 초기화
            self.driver = webdriver.Chrome(options=chrome_options)
            self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            
            # 대기 시간 설정
            self.wait = WebDriverWait(self.driver, 10)
            
            print("✅ 크롬 드라이버가 성공적으로 설정되었습니다.")
            return True
            
        except Exception as e:
            print(f"❌ 드라이버 설정 중 오류 발생: {e}")
            return False
    
    def login_to_naver(self):
        """네이버 로그인 수행"""
        try:
            print("🔄 네이버 로그인 페이지로 이동 중...")
            self.driver.get(self.login_url)
            time.sleep(2)
            
            # 아이디 입력 필드 찾기 및 클릭
            print("🔄 아이디 입력 중...")
            id_input = self.wait.until(EC.element_to_be_clickable((By.ID, "id")))
            id_input.click()
            time.sleep(0.5)
            
            # 클립보드에 아이디 복사 후 붙여넣기
            pyperclip.copy(self.naver_id)
            id_input.send_keys(Keys.CONTROL + 'v')
            time.sleep(1)
            
            # 비밀번호 입력 필드 찾기 및 클릭
            print("🔄 비밀번호 입력 중...")
            pw_input = self.wait.until(EC.element_to_be_clickable((By.ID, "pw")))
            pw_input.click()
            time.sleep(0.5)
            
            # 클립보드에 비밀번호 복사 후 붙여넣기
            pyperclip.copy(self.naver_password)
            pw_input.send_keys(Keys.CONTROL + 'v')
            time.sleep(1)
            
            # 로그인 버튼 클릭
            print("🔄 로그인 버튼 클릭 중...")
            login_button = self.wait.until(EC.element_to_be_clickable((By.ID, "log.login")))
            login_button.click()
            
            # 로그인 완료 대기
            print("⏳ 로그인 처리 중...")
            time.sleep(3)
            
            # 로그인 성공 확인 (URL 변경 또는 특정 요소 확인)
            if "naver.com" in self.driver.current_url and "nidlogin" not in self.driver.current_url:
                print("✅ 네이버 로그인이 성공적으로 완료되었습니다.")
                return True
            else:
                print("❌ 로그인에 실패했습니다. 계정 정보를 확인해주세요.")
                return False
                
        except Exception as e:
            print(f"❌ 로그인 중 오류 발생: {e}")
            return False
    
    def navigate_to_blog_write(self):
        """블로그 글쓰기 페이지로 이동"""
        try:
            print("🔄 블로그 글쓰기 페이지로 이동 중...")
            time.sleep(2)  # 2초 대기
            
            self.driver.get(self.blog_write_url)
            time.sleep(3)
            
            print("✅ 블로그 글쓰기 페이지로 성공적으로 이동했습니다.")
            print(f"📝 현재 페이지: {self.driver.current_url}")
            return True
            
        except Exception as e:
            print(f"❌ 블로그 페이지 이동 중 오류 발생: {e}")
            return False
    
    def switch_to_main_frame(self):
        """메인 프레임으로 전환"""
        try:
            print("🔄 메인 프레임으로 전환 중...")
            # #mainFrame iframe 찾기 및 전환
            main_frame = self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#mainFrame")))
            self.driver.switch_to.frame(main_frame)
            time.sleep(2)
            
            print("✅ 메인 프레임으로 성공적으로 전환했습니다.")
            return True
            
        except Exception as e:
            print(f"❌ 메인 프레임 전환 중 오류 발생: {e}")
            return False
    
    def close_popups(self):
        """팝업 닫기"""
        try:
            print("🔄 팝업 닫기 중...")
            
            # 여러 가능한 팝업 셀렉터들을 시도
            popup_selectors = [
                ".se-popup-button-cancel",
                ".se-hlpr-panel-close-button", 
                ".se-hlpe-panel-close-button",  # 오타 수정된 버전
                "[class*='popup'][class*='close']",
                "[class*='panel'][class*='close']",
                ".close-button",
                ".popup-close",
                "button[aria-label*='닫기']",
                "button[title*='닫기']"
            ]
            
            popup_closed = False
            
            for i, selector in enumerate(popup_selectors):
                try:
                    # JavaScript로도 확인
                    js_check = f"return document.querySelector('{selector}') !== null;"
                    element_exists = self.driver.execute_script(js_check)
                    
                    if element_exists:
                        # Selenium으로 요소 찾기
                        popup_button = self.driver.find_element(By.CSS_SELECTOR, selector)
                        if popup_button.is_displayed() and popup_button.is_enabled():
                            popup_button.click()
                            print(f"✅ 팝업을 닫았습니다. (셀렉터: {selector})")
                            popup_closed = True
                            time.sleep(1)
                            break
                except Exception as e:
                    # JavaScript로 직접 클릭 시도
                    try:
                        js_click = f"""
                        var element = document.querySelector('{selector}');
                        if (element && element.offsetParent !== null) {{
                            element.click();
                            return true;
                        }}
                        return false;
                        """
                        clicked = self.driver.execute_script(js_click)
                        if clicked:
                            print(f"✅ JavaScript로 팝업을 닫았습니다. (셀렉터: {selector})")
                            popup_closed = True
                            time.sleep(1)
                            break
                    except:
                        continue
            
            if not popup_closed:
                print("ℹ️ 닫을 팝업이 없거나 이미 닫혀있습니다.")
            
            # ESC 키로도 팝업 닫기 시도
            try:
                from selenium.webdriver.common.keys import Keys
                self.driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
                print("ℹ️ ESC 키로 팝업 닫기를 시도했습니다.")
                time.sleep(1)
            except:
                pass
            
            return True
            
        except Exception as e:
            print(f"❌ 팝업 닫기 중 오류 발생: {e}")
            return False
    
    def input_title(self, title="제목 테스트"):
        """제목 입력"""
        try:
            print("🔄 제목 입력 중...")
            
            # 제목 입력 필드 클릭
            title_element = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".se-section-documentTitle")))
            title_element.click()
            time.sleep(1)
            
            # ActionChains를 사용하여 한 글자씩 입력
            actions = ActionChains(self.driver)
            for char in title:
                actions.send_keys(char)
                actions.perform()
                time.sleep(0.03)  # 0.03초 간격
            
            print(f"✅ 제목 '{title}'을 성공적으로 입력했습니다.")
            return True
            
        except Exception as e:
            print(f"❌ 제목 입력 중 오류 발생: {e}")
            return False
    
    def input_content(self, content="안녕하세요 내용을 입력하고 있습니다.", lines=5):
        """본문 입력"""
        try:
            print("🔄 본문 입력 중...")
            
            # 본문 입력 필드 클릭
            content_element = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".se-section-text")))
            content_element.click()
            time.sleep(1)
            
            # ActionChains를 사용하여 여러 줄 입력
            actions = ActionChains(self.driver)
            
            for line_num in range(lines):
                # 각 줄의 내용 입력
                for char in content:
                    actions.send_keys(char)
                    actions.perform()
                    time.sleep(0.03)  # 0.03초 간격
                
                # 마지막 줄이 아니면 엔터 입력
                if line_num < lines - 1:
                    actions.send_keys(Keys.ENTER)
                    actions.perform()
                    time.sleep(0.03)
            
            print(f"✅ 본문을 {lines}줄 성공적으로 입력했습니다.")
            return True
            
        except Exception as e:
            print(f"❌ 본문 입력 중 오류 발생: {e}")
            return False
    
    def save_blog_post(self):
        """블로그 글 저장"""
        try:
            print("🔄 블로그 글 저장 중...")
            
            # 저장 버튼 클릭
            save_button = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".save_btn__bzc5B")))
            save_button.click()
            time.sleep(2)
            
            print("✅ 블로그 글이 성공적으로 저장되었습니다.")
            return True
            
        except Exception as e:
            print(f"❌ 블로그 글 저장 중 오류 발생: {e}")
            return False
    
    def write_blog_post(self):
        """블로그 글 작성 전체 프로세스"""
        try:
            print("📝 블로그 글 작성을 시작합니다...")
            
            # 1. 메인 프레임으로 전환
            if not self.switch_to_main_frame():
                return False
            
            # 2. 팝업 닫기
            self.close_popups()
            
            # 3. 제목 입력
            if not self.input_title():
                return False
            
            # 4. 본문 입력
            if not self.input_content():
                return False
            
            # 5. 저장
            if not self.save_blog_post():
                return False
            
            print("🎉 블로그 글 작성이 모두 완료되었습니다!")
            return True
            
        except Exception as e:
            print(f"❌ 블로그 글 작성 중 오류 발생: {e}")
            return False
    
    def run_automation(self):
        """전체 자동화 프로세스 실행"""
        try:
            print("🚀 네이버 블로그 자동화를 시작합니다...")
            
            # 1. 드라이버 설정
            if not self.setup_driver():
                return False
            
            # 2. 네이버 로그인
            if not self.login_to_naver():
                return False
            
            # 3. 블로그 글쓰기 페이지로 이동
            if not self.navigate_to_blog_write():
                return False
            
            # 4. 블로그 글 작성
            if not self.write_blog_post():
                return False
            
            print("🎉 모든 자동화 과정이 성공적으로 완료되었습니다!")
            print("💡 블로그 글이 자동으로 작성되고 저장되었습니다.")
            
            # 사용자가 직접 조작할 수 있도록 브라우저를 열어둠
            input("⏸️  브라우저를 종료하려면 Enter 키를 눌러주세요...")
            
            return True
            
        except Exception as e:
            print(f"❌ 자동화 실행 중 오류 발생: {e}")
            return False
        
        finally:
            # 드라이버 종료
            if self.driver:
                self.driver.quit()
                print("🔚 브라우저가 종료되었습니다.")

def main():
    """메인 함수"""
    print("=" * 50)
    print("🤖 네이버 블로그 자동 포스팅 프로그램")
    print("=" * 50)
    
    # 자동화 인스턴스 생성 및 실행
    automation = NaverBlogAutomation()
    automation.run_automation()

if __name__ == "__main__":
    main()
