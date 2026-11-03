import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Versão gerada a cada build/deploy. Vai embutida no bundle (__APP_VERSION__) e
// também é escrita em /version.json (servido sem cache). O app compara as duas e
// se avisa quando há deploy novo — resolve o "usuário preso na versão antiga".
const appVersion = String(Date.now())

function appVersionPlugin(): Plugin {
  return {
    name: 'app-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: appVersion }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), appVersionPlugin()],
})
