import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { recordPageView } from './lib/siteOps';
import IndexPage from './pages/IndexPage';

const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const DetailPage = lazy(() => import('./pages/DetailPage'));
const LewordDetailPage = lazy(() => import('./pages/LewordDetailPage'));
const LewordPage = lazy(() => import('./pages/LewordPage'));
const BriefingPage = lazy(() => import('./pages/BriefingPage'));
const OrbitPage = lazy(() => import('./pages/OrbitPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const DownloadPage = lazy(() => import('./pages/DownloadPage'));
const ChatbotsPage = lazy(() => import('./pages/ChatbotsPage'));
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const LookupPage = lazy(() => import('./pages/LookupPage'));
const RefundPage = lazy(() => import('./pages/RefundPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const BankOrderPage = lazy(() => import('./pages/BankOrderPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageFallback() {
    return (
        <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.62)', fontSize: 14 }}>
            불러오는 중...
        </div>
    );
}

function AdminRedirectPage() {
    useEffect(() => {
        window.location.replace('/admin/');
    }, []);

    return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0a0f', color: '#f8fafc', padding: 24 }}>
            <div style={{ width: 'min(420px, 100%)', border: '1px solid rgba(201,168,76,0.36)', borderRadius: 18, padding: 28, background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>
                <h1 style={{ margin: '0 0 10px', color: '#f5d76e', fontSize: 24 }}>관리자 페이지로 이동 중</h1>
                <p style={{ margin: '0 0 20px', color: 'rgba(255,255,255,0.68)', lineHeight: 1.6 }}>잠시 후 관리자 전용 패널이 열립니다.</p>
                <a href="/admin/" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 18px', borderRadius: 12, background: '#d8b441', color: '#111827', fontWeight: 900, textDecoration: 'none' }}>바로 열기</a>
            </div>
        </div>
    );
}

function App() {
    const location = useLocation();

    useEffect(() => {
        recordPageView(location.pathname + location.search);
    }, [location.pathname, location.search]);

    return (
        <Suspense fallback={<PageFallback />}>
            <Routes>
                <Route path="/admin" element={<AdminRedirectPage />} />
                <Route path="/admin.html" element={<AdminRedirectPage />} />
                <Route element={<Layout />}>
                    <Route path="/" element={<IndexPage />} />
                    <Route path="/index.html" element={<IndexPage />} />
                    <Route path="/products" element={<ProductsPage />} />
                    <Route path="/products.html" element={<ProductsPage />} />
                    <Route path="/detail" element={<DetailPage />} />
                    <Route path="/detail.html" element={<DetailPage />} />
                    <Route path="/leword-detail" element={<LewordDetailPage />} />
                    <Route path="/leword-detail.html" element={<LewordDetailPage />} />
                    <Route path="/leword" element={<LewordPage />} />
                    <Route path="/leword.html" element={<LewordPage />} />
                    {/* 부방장 선정 황금키워드 전용 페이지 — 홈 탭에서 분리해 별도 주소로 뺐다. */}
                    <Route path="/briefing" element={<BriefingPage />} />
                    <Route path="/briefing.html" element={<BriefingPage />} />
                    <Route path="/orbit" element={<OrbitPage />} />
                    <Route path="/orbit.html" element={<OrbitPage />} />
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/pricing.html" element={<PricingPage />} />
                    <Route path="/download" element={<DownloadPage />} />
                    <Route path="/download.html" element={<DownloadPage />} />
                    <Route path="/chatbots" element={<ChatbotsPage />} />
                    <Route path="/chatbots.html" element={<ChatbotsPage />} />
                    <Route path="/reviews" element={<ReviewsPage />} />
                    <Route path="/reviews.html" element={<ReviewsPage />} />
                    <Route path="/community" element={<CommunityPage />} />
                    <Route path="/community.html" element={<CommunityPage />} />
                    <Route path="/lookup" element={<LookupPage />} />
                    <Route path="/lookup.html" element={<LookupPage />} />
                    <Route path="/refund" element={<RefundPage />} />
                    <Route path="/refund.html" element={<RefundPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/terms.html" element={<TermsPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/privacy.html" element={<PrivacyPage />} />
                    <Route path="/bank-order" element={<BankOrderPage />} />
                    <Route path="/bank-order.html" element={<BankOrderPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
        </Suspense>
    );
}

export default App;
