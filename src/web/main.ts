import { createApp } from 'vue'
import 'virtual:uno.css'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.vue'
import registerBoardModule from './modules/board'

// Enregistre les modules du dashboard avant le montage. Ajouter un bloc =
// créer un module + l'enregistrer ici (ou via auto-import plus tard).
registerBoardModule()

createApp(App).mount('#app')
