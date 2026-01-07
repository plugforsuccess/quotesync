// App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';

// Pages
import InsuranceQuotesPage from './pages/InsuranceQuotesPage';
import ThankYouPage from './pages/ThankYouPage';
import DriversEdPage from './pages/DriversEdPage';
import StorePage from './pages/StorePage';
import ProductDetailPage from './pages/ProductDetailPage';
import PurchaseSuccessPage from './pages/PurchaseSuccessPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import NewsroomPage from './pages/NewsroomPage';
import StoryDetailPage from './pages/StoryDetailPage';
import NewsroomDashboardPage from './pages/NewsroomDashboardPage';
import NewsroomEditorPage from './pages/NewsroomEditorPage';
import LoginPage from './pages/LoginPage';

function App() {
  return (
    <BrowserRouter>
     <ScrollToTop />
      <Routes>
        {/* Use Layout to wrap all main pages with the nav/tabs */}
        <Route path="/" element={<Layout />}>
          {/* Default route – homepage = Insurance Quotes */}
          <Route index element={<InsuranceQuotesPage />} />
          <Route path="quotes" element={<InsuranceQuotesPage />} />

          {/* Drivers Ed tab */}
          <Route path="courses" element={<DriversEdPage />} />

          {/* Keep your old route working too if it's already linked */}
          <Route path="defensive-driving" element={<DriversEdPage />} />

          {/* Newsroom - Insurance News Feed */}
          <Route path="news" element={<NewsroomPage />} />
          <Route path="news/:slug" element={<StoryDetailPage />} />

          {/* Newsroom CMS - Editor & Admin */}
          <Route path="news/dashboard" element={<NewsroomDashboardPage />} />
          <Route path="news/editor" element={<NewsroomEditorPage />} />
          <Route path="news/editor/:id" element={<NewsroomEditorPage />} />

          {/* Online Store */}
          <Route path="store" element={<StorePage />} />
          <Route path="store/:slug" element={<ProductDetailPage />} />
          <Route path="store/purchase-success" element={<PurchaseSuccessPage />} />

          {/* Thank you page (after form / Canopy redirect) */}
          <Route path="success" element={<ThankYouPage />} />

          {/* Privacy Policy and Terms of Service */}
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          
          {/*Editor Dashboard Login Page */}
          <Route path="/login" element={<LoginPage />} />

          {/* Catch-all – redirect bad URLs to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;