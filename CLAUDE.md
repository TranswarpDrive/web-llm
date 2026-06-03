# WebLLM

Personal LLM frontend web app. Single-user tool for chatting with multiple model providers, RAG knowledge bases, MCP tool integration, and conversation export.

## Stack

- **Frontend**: React 19 + Vite + TypeScript + TailwindCSS (port 3000)
- **Backend**: Hono on Cloudflare Workers (port 8787)
- **Database**: Supabase Postgres + pgvector
- **Monorepo**: npm workspaces (`web/`, `worker/`, `supabase/`)

## Commands

```bash
npm run dev:web       # Frontend dev server (3000, proxies /api → 8787)
npm run dev:worker    # Worker dev server (8787)
npm run build:web     # Production build
npm run build:worker  # Worker dry-run build
npx tsc --noEmit -p web/tsconfig.json      # Typecheck frontend
npx tsc --noEmit -p worker/tsconfig.json   # Typecheck worker
```

## Conventions

- **No modals** — forms use inline editing within pages, not dialogs
- **Chinese labels** — UI uses Chinese (服务商, 模型, 知识库, 导出, 设置)
- **Dev mode** — when `SUPABASE_URL` is unset or placeholder, worker returns empty arrays without hitting Supabase. Production admin passwords are generated separately with `npm run hash-password`
- **API keys** — AES-256-GCM encrypted before storing in DB. Worker decrypts on-the-fly using `MASTER_ENCRYPTION_KEY`
- **Streaming** — SSE via `ReadableStream`, frontend parses `data: {...}` chunks
- **Pages** — one page per feature area. `/providers` has two tabs (服务商 + 模型). `/knowledge-bases` has sidebar + main layout

## Key Files

| File | Purpose |
|------|---------|
| `worker/src/index.ts` | Router entry, auth, dev mode guard |
| `worker/src/routes/chat.ts` | Chat proxy with tool calling loop |
| `worker/src/routes/rag.ts` | RAG CRUD, chunking, vector search |
| `web/src/pages/ChatView.tsx` | Main chat UI |
| `web/src/pages/ProvidersPage.tsx` | Provider + Model management |
| `web/src/stores/conversationStore.ts` | Chat state, streaming, tool calls |

## Security

- Never put API keys or secrets in frontend code
- `worker/.dev.vars` is in `.gitignore`
- All backend endpoints require JWT (except `/api/auth/login`, `/api/health`)
- CORS restricted to localhost in dev
