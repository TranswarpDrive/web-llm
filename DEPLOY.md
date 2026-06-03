# 部署指南 — GitHub Pages（前端）+ Cloudflare Worker + Supabase（后端）

前端是纯静态站点，部署在 GitHub Pages；后端 API 是 Cloudflare Worker；数据在 Supabase Postgres。
前端与 Worker 在不同域名下，因此走「前后端分域」：前端构建时注入 Worker 地址，Worker 用 CORS 白名单放行前端域名。

部署顺序（重要）：**先 Supabase → 再 Worker（拿到地址）→ 再前端（用该地址构建）→ 回填 Worker 的 CORS → 重新部署 Worker。**

---

## 0. 你需要准备的值

| 名称 | 说明 | 是否敏感 |
|------|------|----------|
| `SUPABASE_URL` | `https://xxx.supabase.co` | 否 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role | **是** |
| `MASTER_ENCRYPTION_KEY` | 加密服务商 API key 用，≥32 字符随机串，**定了不能改** | **是** |
| `JWT_SECRET` | 登录令牌签名用，随机串 | **是** |
| `BRAVE_API_KEY` | 可选，搜索兜底（已有「搜索服务」页后可不设） | **是** |
| Worker 地址 | 首次部署后得到，如 `https://webllm-api.<sub>.workers.dev` | 否 |
| 前端地址 | `https://<用户名>.github.io/<仓库名>` 或自定义域名 | 否 |

生成随机密钥：

```bash
openssl rand -base64 48   # 分别用于 MASTER_ENCRYPTION_KEY 和 JWT_SECRET
```

---

## 1. Supabase

1. 在 https://supabase.com 新建 project，记下 **Project URL** 和 **service_role key**（Project Settings → API）。
2. 建表：打开 **SQL Editor**，把仓库里的 `supabase/DEPLOY_ALL.sql` 全部粘贴执行（已按 001→008 顺序合并，含 `pgvector`/`pgcrypto` 扩展、`admin` 用户、RAG 的 `match_chunks()`）。
   - 或用 CLI：`supabase link --project-ref <ref>` 然后 `supabase db push`。
3. 为 `admin` 设置生产密码。schema 里只放了不可登录的占位 hash，必须在登录前生成自己的 PBKDF2 hash：

```bash
npm run hash-password
```

把输出的 SQL 粘贴到 Supabase SQL Editor 执行。不要把生成出来的 SQL 或密码提交到仓库。

---

## 2. Cloudflare Worker（API）

在 `worker/` 目录下：

```bash
npx wrangler login

# 敏感值用加密 secret，不要写进 wrangler.toml
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put MASTER_ENCRYPTION_KEY
wrangler secret put JWT_SECRET
wrangler secret put BRAVE_API_KEY        # 可选

npm run deploy:worker                    # = wrangler deploy
```

部署后会得到 `https://webllm-api.<你的子域>.workers.dev`。**API base = 该地址 + `/api`**，记下它(下一步前端要用)。

> CORS：`wrangler.toml` 里的 `CORS_ORIGINS` 现在是空的。等第 3 步拿到前端域名后，填进去（见第 4 步）再 `wrangler deploy` 一次。
> `MASTER_ENCRYPTION_KEY` 一旦设定不要更换——它解密已存的服务商 API key，换了就全部失效。

---

## 3. 前端（GitHub Pages）

前端用 **HashRouter**、资源 base 为 `./`，所以无论部署在 `/<仓库名>/` 子路径还是自定义域名都能正常工作，刷新/深链也不会 404。

仓库已带 `.github/workflows/deploy-pages.yml`，push 到 `main` 自动构建并发布。配置一次即可：

1. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
2. 仓库 **Settings → Secrets and variables → Actions → Variables** 新建一个 **Variable**：
   - Name：`VITE_API_URL`
   - Value：第 2 步的 Worker 地址 + `/api`，例如 `https://webllm-api.<sub>.workers.dev/api`
3. 把代码 push 到 `main`（或在 Actions 页面手动触发 workflow）。
4. 构建完成后前端地址为 `https://<用户名>.github.io/<仓库名>/`（用户/组织页或自定义域名则为根路径）。

> 若不想用 Actions，也可本地 `VITE_API_URL=<worker>/api npm run build:web`，把 `web/dist` 手动推到 `gh-pages` 分支。

---

## 4. 回填 CORS 并重新部署 Worker

拿到前端域名后，把它（**只要 origin，不带路径**）填进 `worker/wrangler.toml` 的 `CORS_ORIGINS`：

```toml
[vars]
CORS_ORIGINS = "https://<用户名>.github.io"
```

多个用逗号分隔。然后：

```bash
cd worker && npm run deploy:worker
```

> GitHub Pages 项目页的 origin 是 `https://<用户名>.github.io`（不含 `/<仓库名>`）。自定义域名则填该域名。

---

## 5. 验证

1. 打开前端地址，用 `admin` 和你在第 1 步生成的生产密码登录。
2. F12 → Network，确认 API 请求打到的是 Worker 域名且返回 200（不是 `<pages域名>/api`、不是 CORS 报错）。
3. 在「服务商」里加一个模型服务商 → 点「测试连接」应显示已连接。
4. 发一条消息验证流式输出；如需联网搜索，在「搜索服务」里加一个并设为默认。

---

## 本地开发（对照）

```bash
# worker/.dev.vars（已在 .gitignore）
JWT_SECRET=...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
MASTER_ENCRYPTION_KEY=...
BRAVE_API_KEY=            # 可选
CORS_ORIGINS=            # 本地默认已放行 localhost:3000 / 5173

npm run dev:worker   # localhost:8787
npm run dev:web      # localhost:3000，/api 经 Vite 代理到 8787（无需设 VITE_API_URL）
```

> 未配置 Supabase 时 Worker 进入 dev 模式：登录可用，数据接口返回空数组。生产环境不要依赖 dev 登录信息，必须为 Supabase 里的 `admin` 生成独立密码。
