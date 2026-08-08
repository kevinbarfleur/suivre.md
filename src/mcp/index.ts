#!/usr/bin/env node
import { runMcpServer } from './server'

// Direct entry (`node dist/mcp/index.js`). The CLI exposes the same surface via
// `suivre mcp` — one server, two entry paths.
await runMcpServer()
