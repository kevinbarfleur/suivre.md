import { createApp } from 'vue'
import 'virtual:uno.css'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.vue'
import registerBoardModule from './modules/board'
import registerListModule from './modules/list'
import registerOverviewModule from './modules/overview'
import registerDepsModule from './modules/deps'
import registerDocsModule from './modules/docs'
import registerDecisionsModule from './modules/decisions'
import registerArchiveModule from './modules/archive'
import registerResourceModules from './modules/resources'
import registerSettingsModule from './modules/settings'

// Enregistre les vues avant le montage. Ajouter une vue = créer un module + un
// registerView ici. L'ordre de nav vient de `order`, le groupe de `group`.
registerBoardModule()
registerListModule()
registerOverviewModule()
registerDepsModule()
registerDocsModule()
registerDecisionsModule()
registerArchiveModule()
registerResourceModules()
registerSettingsModule()

createApp(App).mount('#app')
