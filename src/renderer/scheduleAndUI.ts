// 시계와 달력 UI 관리
let clockInterval: NodeJS.Timeout | null = null;

export function initClockAndCalendar(): void {
  // 시계 업데이트
  updateClock();
  if (clockInterval) {
    clearInterval(clockInterval);
  }
  clockInterval = setInterval(updateClock, 1000);

  // 달력 업데이트
  const calendarWidget = document.getElementById('calendar-widget');
  if (calendarWidget) {
    updateCalendarWidget(calendarWidget, new Date());
  }
}

function updateClock(): void {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekday = weekdays[now.getDay()];

  const timeElement = document.getElementById('current-time');
  const dateElement = document.getElementById('current-date');

  if (timeElement) {
    timeElement.textContent = `${hours}:${minutes}:${seconds}`;
  }

  if (dateElement) {
    dateElement.textContent = `${year}년 ${month}월 ${day}일 ${weekday}요일`;
  }
}

function getCalendarMemoKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `calendar-memo-${year}-${month}-${day}`;
}

export function loadCalendarMemo(date: Date): string {
  try {
    const key = getCalendarMemoKey(date);
    return localStorage.getItem(key) || '';
  } catch (error) {
    console.error('메모 로드 실패:', error);
    return '';
  }
}

export function saveCalendarMemo(date: Date, memo: string): void {
  try {
    const key = getCalendarMemoKey(date);
    if (memo.trim()) {
      localStorage.setItem(key, memo.trim());
    } else {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.error('메모 저장 실패:', error);
  }
}

export function updateCalendarWidget(container: HTMLElement, date: Date): void {
  const year = date.getFullYear();
  const month = date.getMonth();
  const today = date.getDate();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  
  let html = `
    <div class="calendar-header">
      <div class="calendar-month">${year}년 ${month + 1}월</div>
    </div>
    <div class="calendar-weekdays">
      ${weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join('')}
    </div>
    <div class="calendar-days">
  `;

  // 빈 칸 추가 (첫 날 전)
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  // 날짜 추가
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = day === today;
    const memoKey = getCalendarMemoKey(new Date(year, month, day));
    const hasMemo = typeof localStorage !== 'undefined' && localStorage.getItem(memoKey);
    html += `<div class="calendar-day ${isToday ? 'today' : ''} ${hasMemo ? 'has-memo' : ''}" data-day="${day}" data-date="${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}">${day}</div>`;
  }

  html += '</div>';
  container.innerHTML = html;
  
  // 날짜 클릭 이벤트 추가
  setTimeout(() => {
    const calendarDays = container.querySelectorAll('.calendar-day:not(.empty)');
    calendarDays.forEach((dayEl) => {
      dayEl.addEventListener('click', () => {
        const dateStr = dayEl.getAttribute('data-date');
        if (dateStr) {
          // renderer.ts에서 정의된 openCalendarDateModal 함수 호출
          if (typeof window !== 'undefined' && (window as any).openCalendarDateModal) {
            (window as any).openCalendarDateModal(dateStr);
          }
        }
      });
    });
  }, 0);
}

// 외부유입 링크 데이터 (카테고리별 분류)
export const externalLinks = {
  '게임/스포츠': [
    { name: '루리웹', url: 'https://bbs.ruliweb.com' },
    { name: '어미새', url: 'https://eomisae.co.kr/' },
    { name: '와이고수', url: 'https://ygosu.com/' },
    { name: '개그집합소', url: 'https://gezip.net/' },
    { name: '사커라인', url: 'https://soccerline.kr/' },
    { name: '이토랜드', url: 'https://www.etoland.co.kr/bbs/board.php?bo_table=etoboard02&sca=%C8%B8%BF%F8%B0%D4%BD%C3%C6%C7' },
    { name: '보드나라', url: 'https://www.bodnara.co.kr/community/index.html' },
    { name: '2cpu', url: 'http://www.2cpu.co.kr/' },
    { name: '82COOK', url: 'https://www.82cook.com/entiz/enti.php?bn=15' },
    { name: '아하', url: 'https://www.a-ha.io/' },
    { name: '월척 커뮤니티', url: 'https://www.wolchuck.co.kr/bbs/bbs/board.php?bo_table=freebd' },
    { name: '팝코', url: 'https://www.popco.net/zboard/zboard.php?id=com_freeboard' },
    { name: '실용오디오', url: 'https://www.enjoyaudio.com/zbxe/index.php?mid=freeboard' },
    { name: '헝그리보더', url: 'http://www.hungryboarder.com/index.php?mid=Free' },
    { name: '시애틀교차로', url: 'https://wowseattle.com/wow-category/free-talk/' },
    { name: '딴지 자유게시판', url: 'http://www.ddanzi.com/free' },
    { name: '서브쓰리닷컴', url: 'http://www.sub-3.com/g5/bbs/board.php?bo_table=tb_comm_free' },
    { name: '샌프란시스코 한인게시판', url: 'https://www.sfkorean.com/bbs/board.php?bo_table=logfree' },
    { name: '배틀페이지', url: 'https://v12.battlepage.com/??=Board.ETC.Table' },
  ],
  'IT/기술': [
    { name: '퀘이사존', url: 'https://quasarzone.com/' },
    { name: '보배드림', url: 'https://www.bobaedream.co.kr/' },
    { name: '고파스', url: 'https://www.koreapas.com/bbs/main.php' },
    { name: '네이버뿜', url: 'https://m.bboom.naver.com/best/list' },
    { name: '오르비', url: 'https://orbi.kr/' },
    { name: 'MLB PARK', url: 'http://mlbpark.donga.com/mp/b.php?p=1&m=list&b=mlbtown&query=&select=&user=' },
    { name: '알지롱', url: 'https://te31.com/rgr/main.php' },
    { name: '설', url: 'https://sir.kr/g5_tip' },
    { name: 'OKKY', url: 'https://okky.kr/' },
    { name: '해연갤', url: 'https://hygall.com/' },
    { name: '기글하드웨어', url: 'https://gigglehd.com/gg/bbs' },
    { name: '다나와', url: 'http://pc26.danawa.com/bbs/?controller=board&methods=getBoardList&boardSeq=298#1' },
    { name: '필름메이커스', url: 'https://www.filmmakers.co.kr/board' },
  ],
  '맘카페/육아': [
    { name: '마포에서 아이키우기', url: 'https://cafe.naver.com/mapomommy' },
    { name: '미사맘', url: 'https://cafe.naver.com/ira111' },
    { name: '(용인)수지맘', url: 'https://cafe.naver.com/sujilovemom' },
    { name: '클린 노원맘스토리', url: 'https://cafe.naver.com/nowonmams' },
    { name: '영동여우맘', url: 'https://cafe.naver.com/yeongdongmom' },
    { name: '진희맘홀릭', url: 'https://cafe.naver.com/jinheemom' },
    { name: '마이로프트', url: 'https://cafe.naver.com/2myloft' },
    { name: '짱구대디', url: 'https://cafe.naver.com/zzang9daddy' },
  ],
  '쇼핑/생활': [
    { name: '몰테일', url: 'https://cafe.naver.com/malltail' },
    { name: '쇼핑지름신', url: 'https://cafe.naver.com/shopjirmsin' },
    { name: '쇼핑매니아', url: 'https://cafe.naver.com/hotdealcommunity' },
    { name: '스마트바겐', url: 'https://cafe.naver.com/smartbargain' },
    { name: '어디든 체크인', url: 'https://cafe.naver.com/checkincafe' },
  ],
  '뷰티/패션': [
    { name: '브랜디드', url: 'https://cafe.naver.com/coredenim' },
    { name: '캠핑퍼스트', url: 'https://cafe.naver.com/campingfirst' },
    { name: '화장발카페', url: 'https://cafe.naver.com/mp3musicdownloadcafe' },
    { name: '은빛 요정 비숑프리제', url: 'https://cafe.naver.com/gdqueen' },
  ],
  '기타 커뮤니티': [
    { name: '노래하는코트', url: 'https://cafe.naver.com/tsoul7' },
    { name: '딜공', url: 'https://cafe.naver.com/nyblog' },
    { name: '패밀리세일', url: 'https://cafe.naver.com/famsale' },
    { name: '디젤매니아', url: 'https://cafe.naver.com/dieselmania' },
    { name: '고아캐드', url: 'https://cafe.naver.com/casuallydressed' },
    { name: '일그란데', url: 'https://cafe.naver.com/ilgrande' },
    { name: '태사랑', url: 'https://cafe.naver.com/taesarang' },
  ],
};
