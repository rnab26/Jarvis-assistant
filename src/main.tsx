import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { demarrageMajWeb } from './lib/majWeb.ts'

// Le plus tôt possible, et avant tout rendu : c'est ce qui confirme une mise
// à jour rapide qui vient de démarrer (elle ne devient permanente qu'une fois
// prouvée par un vrai démarrage) et relève l'identité de l'APK installée.
void demarrageMajWeb()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
