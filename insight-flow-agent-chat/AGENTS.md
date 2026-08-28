# Insight Flow Agent template contract

## Credential boundary

- The Insight Flow API key belongs to the end user. Keep it in page memory only.
- Never place it in localStorage, sessionStorage, cookies, databases, analytics, logs, URLs, public environment variables, or generated source packages.
- Send it only in the JSON body of the authenticated InsForge Function request. The Function forwards it as the upstream Bearer token and must never echo it.
- The optional `INSIGHT_FLOW_ALLOWED_HOSTS` setting is server-only and narrows outbound proxy destinations.

## Streaming boundary

- Browser code calls `/functions/insight-flow-chat` with raw `fetch`; do not replace this with a helper that buffers the body.
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
- The template requires an InsForge v2 runtime with streaming Function responses.
