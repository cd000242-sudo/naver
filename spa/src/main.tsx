import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';
import { startVersionWatch } from './lib/versionWatch';

// 새 배포가 나가면 캐시에 물린 화면이 스스로 갈아탄다(탭 복귀 시 1회).
startVersionWatch();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>
);
