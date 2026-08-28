# Insight Flow Agent Chat

一个可直接部署的 Insight Flow Agent 流式对话模板。用户提供自己的 Insight Flow Base URL、API Key 和 Agent 标识，前端通过 InsForge Edge Function 转发 OpenAI-compatible `/v1/chat/completions` SSE。

## 功能

- 推荐使用 `model: "goclaw:<agent-key>"`，同时支持 PR #666 的兼容 `agent` 参数。
- 解析 `text/event-stream`，处理 OpenAI-compatible delta 和 `[DONE]`。
- 回传 `X-GoClaw-Session-Key`，后续消息延续同一个 Agent session。
- 支持停止生成、开始新会话和 `tool_choice: "none"`。
- API Key 仅保存在 React 内存和单次 Edge Function 请求中；不写数据库、Storage、日志或浏览器持久存储。
- Edge Function 拒绝 HTTP、本地主机和私有 IP 字面量，禁止上游重定向，并可通过服务端 `INSIGHT_FLOW_ALLOWED_HOSTS` 严格限制 Host。生产环境建议配置允许列表，避免域名经 DNS 指向内网地址。

## 本地运行

```bash
cp .env.example .env.local
npm install
npm run dev
```

配置公开的 InsForge 连接信息：

```text
VITE_INSFORGE_URL=https://your-insforge-app.example.com
VITE_INSFORGE_ANON_KEY=your-public-anon-key
VITE_INSIGHT_FLOW_BASE_URL=https://your-insight-flow-host
```

`VITE_INSIGHT_FLOW_BASE_URL` 只是可选的公开默认值。Insight Flow API Key 必须由用户在页面中输入，不能加入任何 `VITE_*` 环境变量。

## 部署 Edge Function

平台通过模板安装流程自动部署：

```text
functions/insight-flow-chat.ts
```

手动部署时可以使用：

```bash
npx -y @insforge/cli functions deploy insight-flow-chat --file ./functions/insight-flow-chat.ts
```

如需限制可访问的 Insight Flow 实例，在 Function 的服务端环境中配置逗号分隔的 Host：

```text
INSIGHT_FLOW_ALLOWED_HOSTS=insight-flow.example.com,agents.example.com
```

## 流式语义

Insight Flow PR #666 会在 Agent lifecycle finalization 完成后输出经过 sanitization 和 execution disclosure 处理的 SSE chunks。浏览器会逐块渲染这些 chunks，但它不是模型生成阶段的首 Token 低延迟通道。

InsForge Function 返回 `Content-Type: text/event-stream`、`X-Accel-Buffering: no` 和 `X-InsForge-Streaming: true`，要求使用支持 Function response streaming 的 v2 runtime。

## 验证

```bash
npm test
npm run typecheck
npm run build
deno test --allow-env tests/function_test.ts
```
