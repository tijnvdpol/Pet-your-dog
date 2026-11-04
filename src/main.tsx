import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Dev tooling page for the new dog model; kept out of the main bundle.
const DogPreview = lazy(() => import('./dev/DogPreview'))
const isPreview = location.pathname.replace(/\/$/, '') === '/dev/dog'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPreview ? (
      <Suspense fallback={null}>
        <DogPreview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
