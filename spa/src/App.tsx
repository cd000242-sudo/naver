import { Routes, Route } from 'react-router-dom';
import IndexPage from './pages/IndexPage';
import NotFoundPage from './pages/NotFoundPage';

// Phase 1a — 최소 라우트만. Phase 2부터 페이지별 마이그레이션
function App() {
    return (
        <Routes>
            <Route path="/" element={<IndexPage />} />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}

export default App;
