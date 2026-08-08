import { createApp } from 'vue'
import 'virtual:uno.css'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.vue'
import registerBoardModule from './modules/board'
import registerListModule from './modules/list'
import registerSprintsModule from './modules/sprints'
import registerOverviewModule from './modules/overview'
import registerDepsModule from './modules/deps'
import registerDocsModule from './modules/docs'
import registerDecisionsModule from './modules/decisions'
import registerArchiveModule from './modules/archive'
import registerResourceModules from './modules/resources'
import registerSettingsModule from './modules/settings'

// Register views before mounting. Adding a view = create a module + a
// registerView here. Nav order comes from `order`, the group from `group`.
registerBoardModule()
registerListModule()
registerSprintsModule()
registerOverviewModule()
registerDepsModule()
registerDocsModule()
registerDecisionsModule()
registerArchiveModule()
registerResourceModules()
registerSettingsModule()

createApp(App).mount('#app')
