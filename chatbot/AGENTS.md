# Platform-managed AI and Storage contract

This template declares `ai.chat`, `ai.streaming`, and `storage`. Those runtime integrations are
part of the template contract even when an application adapts the framework, interface, or product
flow.

## AI

- Send model requests through the current application's InsForge Model Gateway. Prefer
  `client.ai.chat.completions.create(...)` from `@insforge/sdk`.
- Omit `model` by default so the server-owned `AI_DEFAULT_MODEL` selects the configured model.
  Pass an explicit model only when the product requirements demand an allowed override.
- Never read a provider API key from application or Edge Function code, and never call OpenRouter,
  DeepSeek, LiteLLM, OpenAI, Anthropic, or another provider endpoint directly.
- Exercise the product's real model path before delivery. A fallback-only result does not satisfy
  acceptance; verify the real model response and the explicit failure fallback separately.

## Storage

- Use InsForge Storage through `@insforge/sdk`. Browser and application source may contain only the
  public InsForge endpoint and Anon Key.
- Never read or ship COS/S3 access keys. Bucket routing and the application prefix are owned by the
  application's InsForge runtime.
