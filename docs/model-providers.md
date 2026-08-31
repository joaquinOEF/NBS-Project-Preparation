# Which model provider does what, and why

Audit prompted by a fair question: *"what are we using OpenAI for? can't we use
the Anthropic one for all calls?"*

**Short answer: everything except one thing, and that one thing is voice notes.**

## The audit

| Call site | What it does | Can it be Anthropic? |
|---|---|---|
| `fileExtract` · `audio.transcriptions` | **Transcribes the voice notes organisations record in the chat** | ❌ **No.** Anthropic has no speech-to-text API. This is the only hard blocker in the codebase. |
| `fileExtract` · `chat.completions` | Vision — describes an uploaded image, and the images embedded in PDFs and PPTX | ✅ Yes, Anthropic does vision |
| `fileExtract` · `responses.create` | PDF sent whole; the model renders the pages internally so we avoid a local PDF→image dependency | ✅ Yes — Anthropic takes PDFs as document blocks |
| `familiaRanker` | The W2 família ranking, structured output over their site photos | ✅ **Done** — now goes through `structuredModel` |
| `w3Advisor` | The W3 reading pass | ✅ **Done** |
| `synergyReport` | The portfolio narrative | ✅ **Done** |
| `agentService` | The legacy **city** agent behind `agentRoutes` | ✅ Possible. Not on the COUGAR path — a bigger migration for no COUGAR benefit |
| `impactModelService` | Impact narrative and KPI blocks, same city flow | ✅ Possible, same caveat |
| `embeddingService` | — | **Not OpenAI at all.** Local hash-based vectors (`generateTextBasedEmbedding`), no provider call |

## So where does that leave us

Every model call **on the COUGAR path** now runs on Anthropic when
`ANTHROPIC_API_KEY` is set — the conversation (Agent SDK), the W2 família
ranking, the W3 reading pass and the synergy narrative — **except** the
transcription of a recorded voice note, which has nowhere else to go.

`agentService` and `impactModelService` remain on the OpenAI-compatible path.
They belong to the older city flow, not to the CBO workshops, and moving them
buys nothing for Porto Alegre.

## Why the OpenAI key is not going away

Two reasons, and neither is inertia:

1. **Voice notes.** Recording audio instead of typing is one of the things that
   makes these workshops workable for the organisations using them. That path
   needs speech-to-text.
2. **The key is not really an OpenAI key.** Replit sets
   `AI_INTEGRATIONS_OPENAI_BASE_URL` to its own gateway
   (`http://localhost:1106/modelfarm/openai`) with `_DUMMY_API_KEY_`, and
   `openaiClient.ts` passes both through. So "the OpenAI path" resolves to
   Replit's model farm, not to OpenAI, and costs nothing extra to keep.

## The rule going forward

New structured calls go through `server/services/structuredModel.ts`, never
`openaiClient` directly. It prefers Anthropic, falls back to the
OpenAI-compatible path, and `CBO_STRUCTURED_PROVIDER` forces either — so the
trade between Replit's gateway and a direct Anthropic bill is an environment
variable rather than a code change.

⚠️ Watch the capability checks. `rankerCanRun()` named the OpenAI key
specifically, which meant a deployment carrying only an Anthropic key would skip
assembling the context and fall back silently — the photographs an organisation
was asked to walk its own site for would have informed nothing, and nothing
would have looked broken.
