import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import IndexPage from './pages/IndexPage';
import ProductsPage from './pages/ProductsPage';
import DetailPage from './pages/DetailPage';
import LewordPage from './pages/LewordPage';
import PricingPage from './pages/PricingPage';
import DownloadPage from './pages/DownloadPage';
import ReviewsPage from './pages/ReviewsPage';
import CommunityPage from './pages/CommunityPage';
import LookupPage from './pages/LookupPage';
import RefundPage from './pages/RefundPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import BankOrderPage from './pages/BankOrderPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
    return (
        <Routes>
            <Route element={<Layout />}>
                <Route path="/" element={<IndexPage />} />
                <Route path="/index.html" element={<IndexPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/products.html" element={<ProductsPage />} />
                <Route path="/detail" element={<DetailPage />} />
                <Route path="/detail.html" element={<DetailPage />} />
                <Route path="/leword" element={<LewordPage />} />
                <Route path="/leword.html" element={<LewordPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/pricing.html" element={<PricingPage />} />
                <Route path="/download" element={<DownloadPage />} />
                <Route path="/download.html" element={<DownloadPage />} />
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
    );
}

export default App;
