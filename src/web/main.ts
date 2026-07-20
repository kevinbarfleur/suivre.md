import { createApp } from 'vue'
import 'virtual:uno.css'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.vue'
import registerStatsModule from './modules/stats'
import registerBoardModule from './modules/board'

// Enregistre les blocs du dashboard avant le montage. Ajouter un bloc = créer
// un module + l'enregistrer ici. L'ordre d'affichage vient de `order`.
registerStatsModule()
registerBoardModule()

createApp(App).mount('#app')
