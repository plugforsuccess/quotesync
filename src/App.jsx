// App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

// Pages
import InsuranceQuotesPage from './pages/InsuranceQuotesPage';
import ThankYouPage from './pages/ThankYouPage';
import DriversEdPage from './pages/DriversEdPage';
import StorePage from './pages/StorePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Use Layout to wrap all main pages with the nav/tabs */}
        <Route path="/" element={<Layout />}>
          {/* Default route – homepage = Insurance Quotes */}
          <Route index element={<InsuranceQuotesPage />} />
          <Route path="quotes" element={<InsuranceQuotesPage />} />

          {/* Drivers Ed tab */}
          <Route path="drivers-ed" element={<DriversEdPage />} />

          {/* Keep your old route working too if it's already linked */}
          <Route path="defensive-driving" element={<DriversEdPage />} />

          {/* Online Store tab */}
          <Route path="store" element={<StorePage />} />

          {/* Thank you page (after form / Canopy redirect) */}
          <Route path="success" element={<ThankYouPage />} />

          {/* Catch-all – redirect bad URLs to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
