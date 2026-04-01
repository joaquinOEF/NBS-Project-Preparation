# Session Handoff — 2026-04-01

## What Was Built (this session + previous)

### Core Platform
- **Project Builder** (`/concept-note`) — BPJP/C40 concept note with AI agent interview
- **Community Builder** (`/cbo-profile`) — CBO intervention profile with maturity scorecard
- Both share: split-screen UI, chat agent, map, persistence, file drop, language detection

### Key Files
- `server/services/conceptNoteAgent.ts` — Project Builder agent (V1 SDK, fresh session per turn, decision log)
- `server/services/cboAgent.ts` — Community Builder agent (same architecture + score_maturity + set_priority_flag tools)
- `client/src/core/pages/concept-note.tsx` — Project Builder page (~1300 lines)
- `client/src/core/pages/cbo-profile.tsx` — Community Builder page (~580 lines)
- `client/src/core/components/concept-note/ConceptNoteMap.tsx` — Shared map with grid + zones + 49 evidence tile layers
- `shared/concept-note-schema.ts` — 23 BPJP sections
- `shared/cbo-schema.ts` — 5 CBO sections + maturity scoring
- `shared/geospatial-layers.ts` — 49 tile layer definitions
- `server/routes/tileProxyRoutes.ts` — S3 tile proxy (49 layers)
- `server/routes/uploadRoutes.ts` — File upload with mammoth/pdf-parse
- `server/services/fileParser.ts` — PDF, DOCX, XLSX parsing
- `.claude/commands/concept-note.md` — CLI skill file
- `.claude/commands/cbo-intervention.md` — CBO CLI skill file
- `knowledge/` — 26+ knowledge files for Porto Alegre

### Architecture
- Claude Agent SDK V1 with `query()` — fresh session each turn (no continue:true)
- System prompt includes: skill file + city knowledge + state summary + decision log + recent exchanges
- MCP tools: update_section, ask_user, set_phase, flag_gap, read_knowledge, score_maturity (CBO), set_priority_flag (CBO)
- No built-in Read/Glob/Grep removal — agent has file access but guided by prompt
- SSE streaming for real-time UI updates
- Filesystem persistence (knowledge/runs/)
- Language detection (PT/EN) per message

## What's Next (in priority order)

### Immediate — #42 Phases 3-6
1. **Phase 3: Hover/value decoding** — port fetchTilePixels + RGB→value decode from Geo-Layer-Viewer. Show actual values (e.g., "Flood Risk: 0.72") on tile hover.
2. **Phase 4: Spatial queries** — vector-raster intersection (settlements in high flood risk, etc.)
3. **Phase 5: Site explorer integration** — add 49 tile layers to site-explorer.tsx alongside existing GeoJSON layers
4. **Phase 6: OSM reference layers** — parks, schools, hospitals, wetlands from Overpass API

### Open Backlog (GitHub Issues)
- #16: Ask CAPAG in Phase 6 (skill)
- #17: Ask political instruments in Phase 5 (skill)
- #18: Restructure gap review (skill)
- #22: Respect community scope (skill)
- #23: Financing structure questions (skill)
- #24: Branching logic for Explore (skill)
- #25: Summary vs full output (skill)
- #26: Zone-to-intervention mapping (skill)
- #36: Funder alignment review / evaluation simulation
- #38: Agent export triggers real download
- #39: Geo-Layer-Viewer integration + naming (Project Builder / Community Builder)
- #41: Keyboard nav down→input fix (done but verify)
- #42: Geo layers integration (Phases 3-6 remaining)

### Known Issues
- Agent sometimes writes questions as text instead of using ask_user tool
- PDF parsing may fail on Replit if pdf-parse not installed
- V2 SDK sessions don't support MCP tools — V1 is primary path
- First turn is still ~20-30s (subprocess startup)
- CBO module needs end-to-end testing on Replit

## Key Decisions Made
1. Fresh session per turn (no continue:true) — prevents context bloat
2. Pre-baked city knowledge in system prompt — eliminates startup file reads
3. Skill file embedded in prompt — agent follows same flow as CLI
4. V1 SDK primary, V2 disabled (no MCP support)
5. Both flows share ConceptNoteMap component
6. File drop: client reads text files, server parses binary (mammoth/pdf-parse)
7. Language: auto-detect per message, directive appended server-side
8. Naming: "Project Builder" (BPJP) and "Community Builder" (CBO)
