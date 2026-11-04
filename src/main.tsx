import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Developer page for the 3D dog (own chunk, not part of the app bundle).
const DogLab = lazy(() => import('./dev/DogLab.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname.startsWith('/dev/dog') ? (
      <Suspense fallback={null}>
        <DogLab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
