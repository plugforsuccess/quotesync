// App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';

// Pages
import InsuranceQuotesPage from './pages/InsuranceQuotesPage';
import ThankYouPage from './pages/ThankYouPage';
import DriversEdPage from './pages/DriversEdPage';
import StorePage from './pages/StorePage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';

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

          {/* Online Store tab */}
          <Route path="store" element={<StorePage />} />

          {/* Thank you page (after form / Canopy redirect) */}
          <Route path="success" element={<ThankYouPage />} />

          {/* Privacy Policy and Terms of Service */}
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />

          {/* Catch-all – redirect bad URLs to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;