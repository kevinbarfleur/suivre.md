import { startServer } from './index'

const root = process.env.SUIVRE_ROOT ?? process.cwd()
const handle = await startServer(root)
console.log(`suivre.md — board sur ${handle.url}`)
