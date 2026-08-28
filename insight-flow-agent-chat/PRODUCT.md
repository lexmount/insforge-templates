# Product

## Register

product

## Platform

web

## Users

People who want to talk to a configured Insight Flow Agent in a familiar, distraction-free chat product.

## Product Purpose

Turn a backend-stored Insight Flow connection into a continuous streaming conversation. Success means a signed-in user configures their Agent once in Settings, returns to a clean chat surface, sees finalized SSE chunks arrive, and continues the same Agent session without credentials appearing in the chat UI.

## Positioning

A familiar ChatGPT-style home for a privately configured Insight Flow Agent.

## Brand Personality

Quiet, familiar, and focused. The interface should disappear behind the conversation.

## Anti-references

Avoid neon-on-black AI aesthetics, oversized marketing copy, ornamental dashboards, credential forms inside chat, and unfamiliar chat controls.

## Design Principles

- Keep the main surface about conversation; configuration belongs on a separate Settings route.
- Store API keys in owner-only backend rows, mask them by default, and reveal the full value only after an explicit authenticated action.
- Prefer the documented `model: goclaw:<agent-key>` contract while keeping the legacy `agent` alias testable.
- Show streaming, cancellation, session reset, and errors as clear states rather than animations.
- Use a familiar sidebar, centered transcript, and bottom composer; collapse navigation on small screens.

## Accessibility & Inclusion

Use semantic controls, visible focus states, keyboard submission, readable contrast, non-color status cues, and reduced-motion-safe transitions.
