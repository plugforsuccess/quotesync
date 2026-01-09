// App.jsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';

// Configure React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

// Public pages - loaded immediately
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
import LoginPage from './pages/LoginPage';

// Admin pages - lazy loaded for code splitting
const NewsroomDashboardPage = lazy(() => import('./pages/NewsroomDashboardPage'));
const NewsroomEditorPage = lazy(() => import('./pages/NewsroomEditorPage'));
const ArchivedStoriesPage = lazy(() => import('./pages/ArchivedStoriesPage'));
const StoryPreviewPage = lazy(() => import('./pages/StoryPreviewPage'));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ScrollToTop />
          <Routes>
          {/* Admin login page (no layout) - obscured path for security */}
          <Route path="/admin-access-8by2X" element={<LoginPage />} />

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

            {/* Story Preview (Protected - Editor/Admin only) */}
            <Route
              path="news/preview/:id"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <StoryPreviewPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Newsroom CMS - Editor & Admin (Protected & Lazy Loaded) */}
            <Route
              path="news/dashboard"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <NewsroomDashboardPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="news/editor"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <NewsroomEditorPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="news/editor/:id"
              element={
                <ProtectedRoute requiredRole="editor">
                  <Suspense fallback={<PageLoader />}>
                    <NewsroomEditorPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="news/archived"
              element={
                <ProtectedRoute requiredRole="admin">
                  <Suspense fallback={<PageLoader />}>
                    <ArchivedStoriesPage />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            {/* Online Store */}
            <Route path="store" element={<StorePage />} />
            <Route path="store/:slug" element={<ProductDetailPage />} />
            <Route path="store/purchase-success" element={<PurchaseSuccessPage />} />

            {/* Thank you page (after form / Canopy redirect) */}
            <Route path="success" element={<ThankYouPage />} />

            {/* Privacy Policy and Terms of Service */}
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="terms" element={<TermsPage />} />

            {/* Catch-all – redirect bad URLs to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;