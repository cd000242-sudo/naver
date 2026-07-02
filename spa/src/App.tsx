import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { recordPageView } from './lib/siteOps';
import IndexPage from './pages/IndexPage';

const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const DetailPage = lazy(() => import('./pages/DetailPage'));
const LewordDetailPage = lazy(() => import('./pages/LewordDetailPage'));
const LewordPage = lazy(() => import('./pages/LewordPage'));
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

function App() {
    const location = useLocation();

    useEffect(() => {
        recordPageView(location.pathname + location.search);
    }, [location.pathname, location.search]);

    return (
        <Suspense fallback={<PageFallback />}>
            <Routes>
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
