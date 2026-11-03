import { Navigate, Route, Routes, Link } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { SessionProvider, useSession, isStaffSession } from './lib/session'
import { lazy, Suspense } from 'react'
const Login = lazy(() => import('./pages/Login'))
const Trips = lazy(() => import('./pages/admin/Trips'))
const TripDetail = lazy(() => import('./pages/admin/TripDetail'))
const Join = lazy(() => import('./pages/participant/Join'))
const ParticipantApp = lazy(() => import('./pages/participant/ParticipantApp'))
import Logo from './components/Logo'

function NotConfigured() {
  return (
    <div className="center-page">
      <div className="card center-card">
        <Logo />
        <h2 style={{ marginTop: 16 }}>Falta configurar o Supabase</h2>
        <p>Crie o arquivo <code>.env</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja o <code>.env.example</code> e o README).</p>
      </div>
    </div>
  )
}

function Home() {
  const { session, loading } = useSession()
  if (loading) return null
  if (isStaffSession(session)) return <Navigate to="/admin" replace />
  return (
    <div className="center-page">
      <div className="center-card stack">
        <Logo />
        <h1 style={{ marginTop: 18 }}>Viaje junto, volte com tudo.</h1>
        <p className="muted">Agenda ao vivo, avisos, check-in e as suas fotos da viagem, num lugar só.</p>
        <Link className="btn block" to="/j">Tenho um código de viagem</Link>
        <Link className="btn secondary block" to="/login">Sou da agência</Link>
      </div>
    </div>
  )
}

function RequireStaff({ children }) {
  const { session, loading } = useSession()
  if (loading) return null
  if (!isStaffSession(session)) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  if (!isConfigured) return <NotConfigured />
  return (
    <SessionProvider>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<RequireStaff><Trips /></RequireStaff>} />
        <Route path="/admin/trip/:id" element={<RequireStaff><TripDetail /></RequireStaff>} />
        <Route path="/j" element={<Join />} />
        <Route path="/j/:code" element={<Join />} />
        <Route path="/t/:tripId" element={<ParticipantApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </SessionProvider>
  )
}
