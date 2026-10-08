import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import HomePage from '@/pages/HomePage'
import { useParallax } from '@/hooks/useParallax'
import { CartProvider } from '@/lib/cart'

const StandingsPage = lazy(() => import('@/pages/StandingsPage'))
const ResultsPage = lazy(() => import('@/pages/ResultsPage'))
const SchedulePage = lazy(() => import('@/pages/SchedulePage'))
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'))
const ClubsPage = lazy(() => import('@/pages/ClubsPage'))
const TransferPage = lazy(() => import('@/pages/TransferPage'))
const NewsPage = lazy(() => import('@/pages/NewsPage'))
const NewsDetailPage = lazy(() => import('@/pages/NewsDetailPage'))
const AboutPage = lazy(() => import('@/pages/AboutPage'))
const ContactPage = lazy(() => import('@/pages/ContactPage'))
const RegisterPage = lazy(() => import('@/pages/RegisterPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const ClubDetailPage = lazy(() => import('@/pages/ClubDetailPage'))
const CartPage = lazy(() => import('@/pages/CartPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-5 py-24 sm:px-6 lg:px-8">
      <div className="shimmer h-8 w-56 rounded-lg" />
      <div className="shimmer h-4 w-80 max-w-full rounded-lg" />
      <div className="shimmer mt-10 h-72 w-full rounded-card" />
    </div>
  )
}

/** Parallax needs to re-scan after every route change and lazy chunk load. */
function ParallaxDriver() {
  useParallax(true)
  return null
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CartProvider>
        <AppShell>
          <ParallaxDriver />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/standings" element={<StandingsPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/clubs" element={<ClubsPage />} />
            <Route path="/clubs/:slug" element={<ClubDetailPage />} />
            <Route path="/team/:slug" element={<ClubDetailPage />} />
            <Route path="/participants" element={<ClubsPage />} />
            <Route path="/transfer" element={<TransferPage />} />
            <Route path="/transfer-window" element={<TransferPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/news/:slug" element={<NewsDetailPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/about-us" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CartPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
        </AppShell>
      </CartProvider>
    </BrowserRouter>
  )
}