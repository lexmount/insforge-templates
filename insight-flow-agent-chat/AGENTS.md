# Insight Flow Agent template contract

## Credential boundary

- Configuration belongs on `/settings`, never in the chat composer or sidebar.
- Encrypt the API key with AES-256-GCM inside `insight-flow-config` before database storage. The encryption key is the server-only `INSIGHT_FLOW_CONFIG_ENCRYPTION_KEY` secret.
- Never return plaintext API keys to the browser. The settings API may return only configured state and the last four characters.
- Never place the API key in localStorage, sessionStorage, cookies, analytics, logs, URLs, public environment variables, or generated source packages.
- Keep owner-only RLS on `insight_flow_agent_configs`. The optional `INSIGHT_FLOW_ALLOWED_HOSTS` secret narrows outbound destinations.

## Streaming boundary

- Browser code calls `/functions/insight-flow-chat` with the SDK HTTP client's `rawFetch`; do not replace this with `functions.invoke`, which parses the complete response.
- Preserve `text/event-stream`, `X-Accel-Buffering: no`, and `X-InsForge-Streaming: true` in the Function response.
- Parse OpenAI-compatible `choices[0].delta.content` events and stop at `data: [DONE]`.
- Forward `X-GoClaw-Session-Key` as `X-InsightFlow-Session-Key` so later turns can resume the same Agent session.
- Pass request cancellation to the upstream fetch.

## Insight Flow contract

- Prefer `model: "goclaw:<agent-key>"`.
- Keep the legacy `agent` request field as an explicit compatibility mode; when both are present, Insight Flow gives `agent` precedence.
- `tool_choice: "none"` disables tools.
- PR #666 emits finalized, delivery-safe chunks after Agent lifecycle finalization. Do not describe it as first-token streaming.

## InsForge boundary

- Frontend source contains only the public InsForge endpoint and anon key.
- Both Functions authenticate the user JWT. Configuration rows are isolated by `auth.uid()` RLS.
- The template requires an InsForge v2 runtime with streaming Function responses.
