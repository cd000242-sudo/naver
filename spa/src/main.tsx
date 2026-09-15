import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';
import { startVersionWatch } from './lib/versionWatch';
import { purgeLegacyClaudeState } from './lib/userKeys';

// 새 배포가 나가면 캐시에 물린 화면이 스스로 갈아탄다(탭 복귀 시 1회).
startVersionWatch();

/*
 * 사이트는 클로드 구독 토큰을 들고 있지 않는다(사장님 결정 2026-09-16 "브리지 전용으로 정리").
 * 옛 사이트가 저장해 둔 것을 열자마자 지우고, 계정 동기화가 켜져 있으면 뺀 묶음을 다시 올려
 * 서버 암호문에서도 없앤다(동기화가 꺼져 있으면 pushUserKeys 는 아무것도 하지 않는다).
 */
if (purgeLegacyClaudeState()) {
    void import('./lib/keySync')
        .then(({ pushUserKeys }) => pushUserKeys())
        .catch(() => { /* 다음 키 저장 때 다시 올라간다 */ });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>
);
