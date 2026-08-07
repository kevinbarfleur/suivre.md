#!/usr/bin/env node
import { runMcpServer } from './server'

// Entrée directe (`node dist/mcp/index.js`). Le CLI expose la même surface via
// `suivre mcp` — un seul serveur, deux chemins d'entrée.
await runMcpServer()
