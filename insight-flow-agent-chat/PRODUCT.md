# Product

## Register

product

## Platform

web

## Users

Insight Flow Agent builders and operators who want a focused place to verify an Agent through its OpenAI-compatible API without writing a client first.

## Product Purpose

Turn an Insight Flow API key and Agent identifier into a safe, continuous streaming conversation. Success means a user can configure a connection, send a first message, see the finalized SSE chunks arrive, continue the same Agent session, and stop or restart without exposing credentials.

## Positioning

The shortest secure path from an Insight Flow Agent API key to a working streaming chat experience.

## Brand Personality

Focused, technical, and calm. The interface should feel like a dependable Agent workbench rather than a decorative AI demo.

## Anti-references

Avoid neon-on-black AI aesthetics, oversized marketing copy, ornamental dashboards, persistent credential forms, and controls that obscure the standard chat workflow.

## Design Principles

- Keep connection details visible and understandable without competing with the conversation.
- Make credential handling explicit: memory only, never persisted.
- Prefer the documented `model: goclaw:<agent-key>` contract while keeping the legacy `agent` alias testable.
- Show streaming, cancellation, session reset, and errors as clear states rather than animations.
- Preserve a usable single-column flow on small screens.

## Accessibility & Inclusion

Use semantic controls, visible focus states, keyboard submission, readable contrast, non-color status cues, and reduced-motion-safe transitions.
