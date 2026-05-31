# WebLLM — Handoff Document

## Project Overview

Personal LLM frontend web app — single-user browser-based chat interface supporting multiple model providers, RAG knowledge bases, MCP tool integration, and conversation export.

## Quick Start

```bash
cd /Users/baishuxu/Documents/WebLLM

# Install
npm install

# Start both servers
npm run dev:web      # localhost:3000 (Vite, proxies /api → 8787)
npm run dev:worker   # localhost:8787 (Cloudflare Worker via Wrangler)

# Build
npm run build:web
npm run build:worker

# Typecheck
npx tsc --noEmit -p web/tsconfig.json
npx tsc --noEmit -p worker/tsconfig.json
```

### Dev login

- Username: `admin`
- Password: `ZCS]f.Gv&a+CW7tT`
- Dev mode (no Supabase): login works, all API calls return empty arrays instantly

### Required env vars (`worker/.dev.vars`)

```
JWT_SECRET=<random-base64>
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
MASTER_ENCRYPTION_KEY=<aes-256-key>
BRAVE_API_KEY=<optional-for-web-search>
```

`worker/.dev.vars` is in `.gitignore`.

## Architecture

```
Browser (React SPA)
  └─► Cloudflare Worker (Hono)
        ├─► Supabase Postgres (users, providers, models, conversations, messages, KBs, chunks, MCP)
        ├─► External model providers (OpenAI-compatible API, proxied + encrypted)
        ├─► Brave Search API (web_search tool)
        └─► Remote MCP Servers (HTTP)
```

### Project structure

```
WebLLM/
├── web/src/
│   ├── components/        AuthGuard, AppLayout, Sidebar
│   ├── pages/
│   │   ├── LoginPage.tsx       JWT username/password login
│   │   ├── ChatView.tsx        Full chat: streaming, markdown, images, tools, RAG citations, screenshot
│   │   ├── ProvidersPage.tsx   Unified page: Providers tab + Models tab (inline forms, pull models)
│   │   ├── KnowledgeBasesPage.tsx  KB CRUD, document upload/parse, search test
│   │   ├── McpPage.tsx         MCP server CRUD, tool discovery, whitelist
│   │   ├── ExportPage.tsx      Batch export Markdown/PDF
│   │   └── SettingsPage.tsx    Theme, config import/export
│   ├── stores/             Zustand: authStore, providerStore, modelStore, conversationStore
│   ├── services/           API client, Supabase client
│   └── types/              Full TypeScript types (shared data models)
├── worker/src/
│   ├── index.ts            Hono router, auth middleware, dev mode guard
│   ├── routes/
│   │   ├── providers.ts    Provider CRUD + test connection + remote models fetch
│   │   ├── models.ts       Model CRUD + capability management
│   │   ├── chat.ts         Chat completions proxy, conversation context, tool calling loop, RAG injection
│   │   ├── conversations.ts Conversation + message CRUD, paginated message loading
│   │   ├── rag.ts          KB CRUD, document upload, chunking, embedding, vector search, reindex
│   │   ├── mcp.ts          MCP server CRUD, tool discovery
│   │   └── tools.ts        Web search tool + definitions
│   ├── middleware/
│   │   ├── auth.ts         JWT validation (jose)
│   │   └── cors.ts         CORS for allowed origins
│   └── services/
│       ├── auth.ts         PBKDF2 password verification, dev mode fallback
│       ├── jwt.ts          JWT sign/verify (HS256, 30-day expiry)
│       ├── encryption.ts   AES-256-GCM for API key at-rest encryption
│       └── chunking.ts     Recursive character text splitter
└── supabase/migrations/
    ├── 001_initial_core.sql       users, RLS, admin seed
    ├── 002_providers_models.sql   providers, models, model_type enum
    ├── 003_conversations_messages.sql  conversations (full-text search), messages
    ├── 004_rag.sql                knowledge_bases, documents, chunks (pgvector), match_chunks()
    └── 005_mcp.sql                mcp_servers
```

## What's Done

### Auth
- Username/password JWT login (no Supabase Auth dependency)
- Admin user seeded with PBKDF2-hashed password
- Auth middleware validates JWT on all protected routes
- Dev mode: hardcoded credentials, no DB needed

### Provider & Model Management
- Full CRUD for providers (name, base URL, API key, capabilities)
- Full CRUD for models (model ID, display name, type, capabilities, default params)
- AES-256-GCM encryption for API keys at rest
- Pull models from provider API and batch-import
- Capability flags per model: chat, vision, reasoning, image_gen, tool_calling, embedding, rerank
- Connection test button
- Single page with two tabs (providers/models), inline forms, no modals

### Chat
- Multi-turn streaming conversations with SSE
- Markdown rendering (remark-gfm + rehype-highlight)
- Stop generation (AbortController)
- Regenerate (re-send last user message)
- Edit/delete/copy individual messages
- Cancel saves partial content to DB
- Model/provider switching in header
- System prompt + parameter panel (temp, max_tokens, top_p)
- Paginated message loading ("Load earlier messages" for 50+ message conversations)

### File & Image Upload
- Image upload with thumbnail preview, multi-image support
- Vision capability check: warns if non-vision model selected with images
- File upload as temporary context (PDF parsing with pdfjs-dist, text files)
- File type badges with remove button

### Tools
- Web search toggle (Brave Search API)
- Tool calling execution loop:
  1. Send request with tool definitions
  2. If model returns tool_calls → execute tools → send results back → stream final answer
  3. If no tool calls → stream directly
- Tool call display in chat (name + arguments)

### MCP
- Remote HTTP MCP server CRUD
- Tool discovery (`/tools/list` endpoint)
- Clickable tool whitelist toggles
- API key encryption for MCP servers

### RAG Knowledge Base
- KB CRUD with configurable chunk strategy and retrieval params
- Document upload with frontend PDF/text parsing
- Recursive character text chunking (configurable size/overlap)
- Batch embedding via configured embedding model
- Vector search via pgvector `match_chunks()` function
- Search test panel in KB detail page
- RAG auto-injection in chat: selects KB → embeds query → searches → injects context → model answers
- Citation display in chat (source name, similarity %, snippet)
- Document reindex (single or all)

### Export
- Batch conversation export (Markdown + PDF via print)
- Configurable content options (system prompt, timestamps, tool calls, citations)
- Conversation screenshot (PNG via html-to-image)
- Config import/export (JSON)

### UI/UX
- Dark/light mode toggle + system follow
- Responsive layout (sidebar drawer on mobile)
- Chinese UI labels
- Conversation sidebar with search, rename, archive, delete
- Keyboard shortcuts: Enter to send, Shift+Enter for newline

### Security
- No API keys in frontend source code
- All model requests proxied through Worker
- CORS restricted to allowed origins
- JWT on all protected endpoints
- Rate limiting stubs (dev mode guard returns instantly without DB)
- `.dev.vars` in `.gitignore`

## Conventions

- **No modals** — forms are inline within pages
- **Chinese labels** for all UI text (服务商, 模型, 知识库, 导出, 设置)
- **Dev mode** — `SUPABASE_URL` unset or `https://your-project.supabase.co` triggers instant empty array responses
- **API keys** — encrypted with AES-256-GCM (Worker Master Key), decrypted on-the-fly
- **CSS** — TailwindCSS with CSS variables for theming (shadcn/ui color system)
- **State** — Zustand stores (auth, provider, model, conversation)
- **Types** — Shared TypeScript interfaces in `web/src/types/index.ts`

## What's Not Done (Optional)

| Item | Notes |
|------|-------|
| Supabase setup automation | User must create Supabase project and run migrations manually |
| Production deployment | wrangler.toml has placeholder routes; Cloudflare Pages config needed |
| Tests | No unit/integration tests yet |
| RAG reindex on upload | Documents are chunked+embedded on upload, reindex marks them pending but doesn't auto-reprocess |
| Batch conversation import | Config import works, but conversation import not implemented |
| OAuth/SSO login | Only username/password auth |
| Rate limiting | Stubs only, no actual enforcement |
| Advanced PDF layout | PDF export uses browser print dialog |
| Virtualized message list | Uses "Load earlier" pagination, not true virtualization |
| Mobile native app | Responsive browser only |
