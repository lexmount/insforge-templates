# Insight Flow Agent Chat

一个 ChatGPT 风格的 Insight Flow Agent 流式对话模板。主界面只负责对话；登录用户在独立 `/settings` 页面配置一次 Base URL、API Key 和 model/agent 参数，之后由 InsForge Edge Function 从后端读取配置并代理 `/v1/chat/completions` SSE。

## 功能

- ChatGPT 风格侧栏、居中消息流和底部 composer，支持桌面与移动端。
- InsForge 邮箱 OTP 登录，每个用户拥有独立 Agent 配置。
- API Key 明文保存在用户自己的后端配置行中，由登录认证和 RLS 隔离；设置页默认脱敏，点击眼睛后可查看完整值。
- 推荐 `model: "goclaw:<agent-key>"`，同时兼容 PR #666 的 `agent` 参数。
- 解析 OpenAI-compatible SSE delta 与 `[DONE]`，支持停止生成。
- 回传 `X-GoClaw-Session-Key`，在当前页面中延续 Agent session。
- 支持 `tool_choice: "none"`。
- RLS 使用 `auth.uid()` 隔离每个用户的配置。

## 初始化后端

模板安装流程会应用 migration 并部署两个 Functions：

```text
migrations/20260828054000_create-insight-flow-agent-configs.sql
functions/insight-flow-config.ts
functions/insight-flow-chat.ts
```

手动初始化时：

```bash
npx -y @insforge/cli db migrations up --all
npx -y @insforge/cli functions deploy insight-flow-config --file ./functions/insight-flow-config.ts
npx -y @insforge/cli functions deploy insight-flow-chat --file ./functions/insight-flow-chat.ts
```

生产环境建议再限制允许连接的 Insight Flow Host：

```bash
npx -y @insforge/cli secrets add INSIGHT_FLOW_ALLOWED_HOSTS 'insight-flow.example.com,agents.example.com'
```

Function 拒绝 HTTP、本地主机和私有 IP 字面量。Host allowlist 是生产环境更可靠的边界，可降低域名解析到私有网络带来的 SSRF 风险。

API Key 不会进入聊天页、URL、浏览器存储或公共环境变量。默认读取设置时接口只返回脱敏占位符；用户在设置页点击眼睛后，经过身份认证的 Function 才返回该用户自己的完整 Key。数据库管理员仍可读取明文值，因此该模板适合以部署简洁为优先的场景。

## 前端环境变量

```bash
cp .env.example .env
```

只把 InsForge 公共连接信息提供给 Vite：

```text
VITE_INSFORGE_URL=https://your-app.region.insforge.app
VITE_INSFORGE_ANON_KEY=your-public-anon-key
```

然后运行：

```bash
npm install
npm run dev
```

## 流式语义

Insight Flow PR #666 在 Agent lifecycle finalization 后输出经过 sanitization 和 execution disclosure 处理的 SSE chunks。浏览器会逐块渲染这些 chunks，但这不是模型生成阶段的首 Token 低延迟通道。

`insight-flow-chat` 返回 `Content-Type: text/event-stream`、`X-Accel-Buffering: no` 和 `X-InsForge-Streaming: true`，要求使用支持 Function response streaming 的 InsForge v2 runtime。

## 验证

```bash
npm test
npm run typecheck
npm run build
deno check functions/insight-flow-config.ts functions/insight-flow-chat.ts
deno test --allow-env tests/function_test.ts
```
