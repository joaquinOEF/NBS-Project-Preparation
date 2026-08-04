# COUGAR NBS — Workshop 1/2 UX & Reliability Audit + Backlog

_Generated 2026-07-01. Sources: 10 screenshots (JVP live test), the 2026-07-01 meeting "COUGAR - Rede Learning Journey VS. NbS Project Builder" (Ana Radzevicius), and a 7-auditor code audit of the NBS Project Preparation repo._


> **Split:** the backlog is divided into **Orchestrator** (coordinator/OEF-facing) and **CBO-agent** (community-org-facing chat), plus **Map** (shared MapMicroapp used in the CBO flow) and **Infra**.


## Ana's meeting action items (2026-07-01)

All owned by JVP; the 07-08 items gate the Vila Flores demo (week of Jul 8–12).


| Action item | Due | Backlog id(s) |
|---|---|---|
| Site selection doesn't advance — can't tell neighborhood vs site; map doesn't transition cleanly | 07-08 | MAP-SEL-STALE, MAP-DRAWMODE-STUCK |
| Language toggle inconsistency (PT/EN) | 07-08 | CBO-LANG-AUTH, CBO-SKILL-ENGLISH, CBO-I18N-SYNC |
| Map layer overlap — flood/heat/landslide + boundaries all at once; should reveal sequentially (flood→heat→landslide→neighborhoods); OSM features overlap selection UI | 07-08 | MAP-STACKED-RISK |
| Simplify MapView UI; fix mobile-specific breakage | 07-08 | MAP-* / mobile |
| WS2: agent too slow on basic questions; missing NBS example photos | 07-08 | perf + NBS photos |
| Add 'where this data comes from' data-source/lineage button (Orchestrator + CBO) | 07-15 | NEW: data-literacy |
| Add risk-summary report in chat after neighborhood selection (real stats, not just color) | 07-22 | NEW: data-literacy / CBO-MAP-PAYLOAD |
| Check coordinator can belong to multiple cohorts + dropdown visibility in non-admin role | — | NEW: orchestrator |

**Decisions from the meeting:**

- Defer site selection from Encontro 2 → Encontro 3; add yes/no gate 'do you have a site idea?' (no-orgs develop ideas offline). Due 07-22.
- Add a data-literacy layer — Ana's key critique: 'they see colors but don't understand what the data means or where it's from'.
- Timeline: Jul 15 = profile + neighborhood risk overview; Aug 12 = online map exploration; late Aug = in-person clustering gate.
- Two cohorts: Vila Flores (first 10 orgs) + NBS-expert-sourced mature projects (by August). Fast-Track cohort removed.
- Known gap: NO clustering mechanism yet (can't merge org profiles into a shared cluster/portfolio).
- Vila Flores demo (Julia + Antônia) scheduled week of Jul 8–12, gated on the bug fixes above.

## Top 5 recommendations (start order)

1. **Build the per-turn validate-before-flush normalization layer at cboAgent.ts:1011-1026 (buffer text blocks + tool events, then lint/convert/dedupe/join/verify before pushEvent).**  
   _It is the single structural seam that makes the whole turn contract enforceable rather than dependent on LLM adherence: it simultaneously fixes inline options (CBO-INLINE-OPTIONS), duplicated question text (CBO-DUP-QUESTION), sentence-fusing concat (CBO-CONCAT-SEP), and gives the language check a home. Every ad-hoc guard collapses into one testable stage._
2. **Make cohort.language the authoritative, server-resolved language lock end-to-end and delete the skill's switch-to-English escape hatch.**  
   _Language is a P0 systemic defect with three conflicting sources; one server-side fix (CBO-LANG-AUTH + CBO-SKILL-ENGLISH) resolves five separate leaks (agent chat, ask_user, map narration, NBS type cards, map tour/site strings) instead of patching strings one by one. High leverage, moderate effort, low risk._
3. **Persist every user-prompting tool (ask_user/priority/anchoring/map) as a transcript composer message and rebuild composer state on load; then drive the resume/Continue gate off 'is a composer pending'.**  
   _The audience is phone-first on flaky networks, so a reload that drops the pending question and leaves only the derailing 'Continue' button is a top real-world failure. This fix (CBO-PERSIST-PROMPTS) also structurally unblocks the single-active-composer arbiter (CBO-STACKED-COMPOSERS) and the resume-overlap bug (CBO-RESUME-OVERLAP)._
4. **Fix the map neighborhood selection: add a selectedAssetsRef the mouseout reads live, and reset drawMode to 'off' when leaving the sites step.**  
   _MAP-SEL-STALE is the P0 'tapping a neighborhood does nothing' bug (worst on touch, the primary device), and MAP-DRAWMODE-STUCK is a hard 'can't click or pan' state after a Back navigation. Both are small, high-confidence fixes that restore the core interaction of the whole territory step._
5. **Introduce one shared server-side phaseComplete(state,phase) predicate consumed by the skill, the advance banner, and the set_phase gate; unblock the Encontro 2 dead-end first.**  
   _CBO-DEADEND-E2 is a P0 that strands orgs at the end of WS2 with no way forward, and the same predicate closes the turn-ender guard (CBO-TURNENDER-GUARD), phase-jump (CBO-PHASE-JUMP), and sub-phase (CBO-SUBPHASE) gaps - replacing fragile client heuristics with one enforceable engine invariant._

## Foolproof CBO-agent spec (12 invariants)

The single structural fix is a **per-turn validate-before-flush normalization layer** at `cboAgent.ts:1011-1026` that buffers the whole turn (text blocks + tool events) and lints/converts/dedupes/joins/language-checks before anything reaches the client.

1. Options are ALWAYS structured buttons, never inline prose: the per-turn normalizer (new stage at cboAgent.ts:1011-1026) must lint every chat text block for an option-list signature (>=2 lines matching /^\s*(?:[-*.]|[A-Z]\)|\d+[.)])\s+/ or a 'select multiple/selecione/escolha' lead-in) and reject-and-retry or auto-convert it into an ask_user event with multiSelect inferred, because today ask_user is optional and inline bullets render inert via ReactMarkdown (cbo-profile.tsx:1321-1322).
2. No duplicated question text: the normalizer buffers the turn's text blocks plus ask_user events and drops a trailing chat block whose normalized (lowercased, punctuation-stripped) text is a prefix of / ~equal to the following ask_user question, replacing the current exact-consecutive-only dedupe that is blind across event types (cboAgent.ts:105).
3. Server-tagged block boundaries: the server joins multi-block assistant text with explicit '\n\n' separators so the client's raw last.content+event.content concatenation can never fuse two sentences mid-token (cbo-profile.tsx:765-766).
4. Every turn ends with exactly one user affordance: split TURN_ENDERS into user-prompting (ask_user/open_map/open_intervention_selector/ask_priority_rank/ask_community_anchoring/show_examples) vs terminal (set_phase to 6); remove score_maturity entirely and require a prompting tool OR a genuine '?'-terminated question for phases<6, so a silent update_section+score_maturity turn always injects the recovery ask_user (cboAgent.ts:1041-1052).
5. Every prompt survives reload: persist ask_user/ask_priority_rank/ask_community_anchoring/open_map as messageType:'composer' transcript messages (like show_types already are) and rebuild activeQuestions/composer state from the trailing composer on load, since these are currently React-state-only and vanish on reload (cboAgent.ts:856-892, cbo-profile.tsx:293).
6. Single active composer: one arbitration point renders at most one interactive composer (precedence rank > anchoring > question card) and suppresses the ask_user card while a same-turn interactive strip awaits input, replacing the four independent self-gated widgets that co-render today (cbo-profile.tsx:1270-1297,1349,1363,1379).
7. Resume button never overlaps a live composer: drive the 'Continue from Phase X' gate from a single 'a user affordance is pending' selector (any of currentQuestion||priorityRankPrompt||anchoringPrompt||openMapParams||interventionSelectorParams) instead of checking only currentQuestion (cbo-profile.tsx:1518).
8. Clean human summaries, never raw payloads: map/intervention confirmations post a short human summary bubble ('Selecionei: bairro Partenon + Hospital Sao Pedro') while formatMapResult()'s scoring/coordinate dump goes to the agent as hidden context via a displayText/hiddenContext split on sendMessage (cbo-profile.tsx:62-88,1833,1857-1861).
9. Language is locked to the cohort, not the user: resolve the member's cohort.language server-side in /chat and use it as the authoritative sessionLang feeding buildSystemContext+langDirective (override client lang and text detection; detect only for true standalone sessions), replacing the three conflicting truths (cboRoutes.ts:130-140, cohortRoutes.ts:174).
10. The skill must not fight the language lock: delete the 'switch to English if the user writes English' instruction and all bilingual/English sample phrasings from encontro-*.md so the model stops copying English verbatim and overriding langDirective (encontro-1.md:25,34,344).
11. Client i18n and agent language share one source: derive i18n.language from the same server-resolved cohort language and block strips/map from mounting before it is set (or pass authoritative lang as a prop) so PT-backed strings (NBS type cards, map tour/site labels) can't render English in a pre-fetch race (NbsTypeStrip.tsx:111, MapMicroapp.tsx tour/site t() keys).
12. Forward progress uses one shared predicate: a server-side phaseComplete(state,phase) - based on section-fill / an explicit completion marker, NOT metrics a skill defers - is consumed by the skill, the advance banner, and the set_phase gate, and set_phase requires phaseComplete(current) plus a sequential target so E2 can't dead-end and phases can't be skipped (cbo-profile.tsx:1443-1448, encontro-2.md:75, phaseGating.ts:63).

## Backlog — CBO-agent (community-org chat) (21)

#### [P0] `CBO-LANG-AUTH` — cohort.language is not the enforced language authority end-to-end  _(effort M)_
- **Symptom:** In a pt cohort the agent and UI still emit English (PT intro, then "What's your role in JVP test?", "How is the team structured? / All volunteers" as English ask_user cards). Language is decided by three conflicting sources.
- **Root cause:** Three competing truths: client i18n.language, server sessionLang which trusts the client-sent lang or text-detects from the message, and encontro-1.md which tells the agent to switch on user input. None is anchored to the member's cohort.language on the server, so any fallback to 'en' (standalone/test session, pre-fetch race, English-looking org name) turns everything English.
- **Evidence:** cboRoutes.ts:130-140 accepts client lang / text-detects, never loads cohort.language (available cohortRoutes.ts:174); cbo-profile.tsx:267 sends i18n.resolvedLanguage; buildSystemContext/langDirective at cboAgent.ts:1168-1214,146-148.
- **Fix:** Resolve the member's cohort.language server-side in /chat and use it as the authoritative sessionLang (override client lang + text detection; detect only for true standalone sessions). Feed it into buildSystemContext+langDirective and derive client i18n from the same server value so components can't render pre-sync. Fixes LANG-01..05 in one seam.

#### [P0] `CBO-DEADEND-E2` — End of Encontro 2 is a dead-end: advance banner needs metrics E2 is told NOT to score  _(effort M)_
- **Symptom:** A CBO finishes Encontro 2, sees the closing message, but the green 'Comecar Encontro 3' banner never appears even though the coordinator opened WS3 - no in-chat way to advance, org is stuck.
- **Root cause:** The advance banner returns null unless every PHASE_COMPLETION_METRICS[phase] is scored. For phase 2 that set is ['site_control','community_anchoring'], but encontro-2.md explicitly defers both scores ('do NOT call score_maturity'). So allScored is always false and the sole forward affordance never renders. The skill's completion contract and the client's advance gate use two different definitions of 'phase complete'.
- **Evidence:** cbo-profile.tsx:1443-1448 metric gate + :1478 sole path to /advance-phase; encontro-2.md:75,227 defer score_maturity; PHASE_COMPLETION_METRICS cbo-schema.ts:26.
- **Fix:** Introduce ONE server-side predicate phaseComplete(state,phase) consumed by the skill, the banner, and the set_phase gate, based on section-fill / an explicit completion marker rather than deferred metrics. Short-term: gate phase-2 banner on intervention_site required fields (bairro + site/deferred).

#### [P1] `CBO-NORM-LAYER` — No per-turn validate-before-flush normalization layer (the single seam for the turn contract)  _(effort L)_
- **Symptom:** Inline option lists, duplicated question text, silent state-only turns, and language drift all pass through because agent output is streamed straight to the client with only ad-hoc partial guards.
- **Root cause:** streamWithSdk pushes each text/tool block to the client the instant it arrives and pushEvent persists it verbatim; there is no buffering stage that inspects the whole turn before it reaches the user. Every desired invariant (structured composer not inline prose, no dup text, always advances state, cohort language) depends on LLM adherence to the skill prompt, which the screenshots show is unreliable.
- **Evidence:** cboAgent.ts:980-1026 stream-through loop (no buffer), :856-892 pushEvent persists verbatim, :1041-1073 coarse post-hoc guard, :102-106 exact dedupe only.
- **Fix:** Add a per-turn buffer+validate stage between the SDK loop and pushEvent that: (1) lints chat text for option-list/'select multiple' signatures and converts to ask_user; (2) drops chat blocks duplicating the following ask_user question and collapses near-dup preambles; (3) joins multi-block text with explicit server-side separators; (4) verifies >=1 user-prompting turn-ender for phases <6 and re-prompts otherwise; (5) language-checks outgoing text vs cohort language. Surface the whole-turn-hold latency tradeoff before implementing.

#### [P1] `CBO-PERSIST-PROMPTS` — ask_user / priority / anchoring / map composers are never persisted to the transcript; reload strands the user  _(effort M)_
- **Symptom:** On phone-first flaky networks, a reload (or cross-device resume) after the agent asked a chip question shows the past transcript but NO current question and no chips; the only escape is the derailing 'Continue' button.
- **Root cause:** pushEvent persists composer messages only for show_types/show_examples; ask_user, ask_priority_rank, ask_community_anchoring are pushed as SSE but never addCboMessage'd. Since skills mandate 'after a chip selection, no chat text - just update_section + ask_user', a normal turn produces zero persisted assistant message; activeQuestions lives only in React state and is not rebuilt from DB on load.
- **Evidence:** cboAgent.ts:856-892 pushEvent switch (ask_user/priority/anchoring absent); activeQuestions React-only at cbo-profile.tsx:293.
- **Fix:** Persist every user-prompting tool as messageType:'composer' (kind:'ask_user'|'priority'|'anchoring'|'map') like show_types, and rebuild activeQuestions/composer state from the trailing composer message on load so the pending prompt deterministically re-renders.

#### [P1] `CBO-INLINE-OPTIONS` — Choice lists render as inert markdown unless the agent chose ask_user; no enforcement  _(effort M · depends: CBO-NORM-LAYER)_
- **Symptom:** In one turn 'main focus area? You can select multiple:' listed options as plain markdown bullets while 'How is the team structured? A) All volunteers' rendered as selectable cards. Multi-select is the most-inlined case.
- **Root cause:** Two disjoint rendering paths: ask_user emits a structured event the client renders as chip/option cards; a plain assistant text block is forwarded verbatim as a chat event and rendered through ReactMarkdown as prose. Nothing on the server inspects chat text for option-list patterns or forces ask_user - the skill asks for chips but there is zero mechanical enforcement, so partial compliance is unpunished.
- **Evidence:** cboAgent.ts:1013-1015 forwards block.text verbatim; cbo-profile.tsx:1321-1322 ReactMarkdown; ask_user + multiSelect exist but optional at cboAgent.ts:416-443, cbo-schema.ts:225,433.
- **Fix:** In the normalizer (CBO-NORM-LAYER): before flushing a chat text block, detect an option-list signature (>=2 lines matching /^\s*(?:[-*.]|[A-Z]\)|\d+[.)])\s+/ or a 'select multiple/selecione/escolha' lead-in) and either strip+inject a corrective retry forcing ask_user, or auto-convert to an ask_user event with multiSelect inferred.

#### [P1] `CBO-DUP-QUESTION` — Question text appears twice: emitted as prose AND as the ask_user header; dedupe is exact/consecutive-only  _(effort M · depends: CBO-NORM-LAYER)_
- **Symptom:** 'What is JVP test's main focus area?What is JVP test's main focus area? You can select multiple:' - shown once in the chat bubble and again as the option-card header.
- **Root cause:** When the agent writes the question as chat text AND calls ask_user, the client renders the prose copy in the message list and the event.question again as the QuestionCard header. The only dedupe compares strictly the immediately-previous message with identical role AND content; it is blind across event types (chat string vs ask_user.question) and to near-dups ('...focus area?' vs '...focus area? You can select multiple:').
- **Evidence:** cboAgent.ts:105 exact-consecutive dedupe; ask_user header cbo-profile.tsx:829,1402 while same text lands as chat via cboAgent.ts:1013-1015.
- **Fix:** In the normalizer buffer the turn's text blocks and ask_user events; drop a trailing chat block whose normalized text is a prefix of / ~equal to the following ask_user question (strip 'you can select multiple' suffixes first). Collapse near-dup consecutive chat blocks via normalized (lowercased, punct-stripped) similarity instead of exact match.

#### [P1] `CBO-CONCAT-SEP` — Consecutive assistant chat chunks are string-concatenated with no separator, fusing sentences  _(effort S · depends: CBO-NORM-LAYER)_
- **Symptom:** Message read '...build JVP test's profile:A few quick questions to build the profile - let's take them one at a time.' - two sentences glued mid-token after the colon.
- **Root cause:** The client merges consecutive chat SSE events into one bubble by raw string concatenation last.content+event.content with no joining space/newline. The SDK emits one chat event per assistant text block; two separate blocks in a turn fuse with no boundary.
- **Evidence:** cbo-profile.tsx:765-766 {...last,content:last.content+event.content}; server emits discrete chat event per block cboAgent.ts:1013-1015.
- **Fix:** Best: have the server (normalizer) join multi-block text with explicit '\n\n' separators. Client belt-and-suspenders: if last.content doesn't end with whitespace and event.content doesn't start with whitespace, join with a boundary (guard on whole-block vs sub-block delta streaming; the CBO path emits whole blocks so '\n\n' is safe).

#### [P1] `CBO-TURNENDER-GUARD` — score_maturity/set_phase count as valid turn-enders, so silent state-only turns strand the user with a bare 'Continue'  _(effort S)_
- **Symptom:** Right after a name+role answer the user sees 'Phase 1/5, 1 sections filled' with a lone Continue button and no question; tapping it sends 'Continuar da Fase 1' which derails the agent instead of resuming the interview.
- **Root cause:** The post-turn guard treats ANY TURN_ENDER as safe, and that set includes score_maturity and set_phase - neither prompts the user. A spurious/early score_maturity with no follow-up satisfies hadTurnEnder and suppresses recovery. Recovery is also gated on !emittedText, so a stray ack blocks it too.
- **Evidence:** cboAgent.ts:1041-1052 TURN_ENDERS includes 'score_maturity'/'set_phase' as 'closing'; resume gate cbo-profile.tsx:1518-1521,1546.
- **Fix:** Split enders into user-prompting (ask_user, open_map, open_intervention_selector, ask_priority_rank, ask_community_anchoring, show_examples) vs terminal (set_phase to 6). Remove score_maturity entirely. For phases <6, require a user-prompting tool OR a genuine question (text ending in '?'); a pure ack must still trigger the deterministic recovery ask_user.

#### [P1] `CBO-MAP-PAYLOAD` — Map-selection result rendered verbatim as a user chat bubble instead of a clean summary + hidden context  _(effort M)_
- **Symptom:** After confirming the map, a giant machine-readable dump appears as the user's own green bubble: 'Map selection (composite mode): -[zone] Partenon: HEAT risk...priority:0.43...at(-30.06,-51.17)... Total: 5 assets'. Scoring, coords, raster values leak into the transcript.
- **Root cause:** MapMicroapp.onConfirm builds one machine-readable string via formatMapResult() (meant for the agent) and feeds that exact string to the visible transcript via sendMessage/handleSelectOption with hidden=false, so it renders raw as a user bubble. There is no separation of a human summary (bubble) from the technical payload (silent model context). InterventionSelector.onConfirm has the identical leak.
- **Evidence:** cbo-profile.tsx:62-88 formatMapResult, :1833 onConfirm->sendMessage/handleSelectOption, :899 renders user bubble, :1315-1318 markdown; intervention leak :1857-1861.
- **Fix:** Split into (1) a short human summary for the bubble ('Selecionei: bairro Partenon + Hospital Sao Pedro (2 locais)') and (2) the full formatMapResult() payload delivered as hidden context. Extend sendMessage with optional displayText/hiddenContext (the hidden flag already exists), or push formatMapResult server-side and post only the summary. Apply to InterventionSelector too.

#### [P1] `CBO-STACKED-COMPOSERS` — Multiple chat composers render simultaneously with no single-active arbiter  _(effort L · depends: CBO-PERSIST-PROMPTS)_
- **Symptom:** A 'Question 1 of 4 . Tab to cycle' pager appears with what looks like two questions at once - an inline multi-select strip plus a separate option card - so it's unclear what to answer.
- **Root cause:** There is no 'active composer' concept. Persisted strips (NbsTypeStrip / NbsShowcaseCardStrip with per-card Salvar toggles), priorityRankPrompt, anchoringPrompt, and currentQuestion each render their own widget with no mutual exclusion. A favorites showcase strip stays in the transcript while an ask_user card renders below it. Separately, multiple ask_user events in one turn collapse into a hidden Tab-cycle pager the user must fully answer before anything sends.
- **Evidence:** cbo-profile.tsx:1270-1297 strips unconditional, :1349 rank, :1363 anchoring, :1379 question card, :827-830 ask_user append, :1382-1398 pager, NbsShowcaseCard.tsx:87-99 favorites toggle.
- **Fix:** Introduce one arbitration point rendering at most one interactive composer (precedence rank>anchoring>question card), suppress the ask_user card while a same-turn interactive strip awaits input, and render multi-ask_user sequentially (send after each) or as one grouped 'answer all' card instead of a hidden Tab pager.

#### [P1] `CBO-RESUME-OVERLAP` — 'Continue from Phase X' resume button appears over a legitimate composer  _(effort S · depends: CBO-PERSIST-PROMPTS)_
- **Symptom:** After the agent correctly opens ask_priority_rank/ask_community_anchoring/map, the resume/Continue block also renders, competing with the composer; tapping it sends 'Continuar da Fase X' and derails the turn.
- **Root cause:** The resume gate only suppresses when currentQuestion (an ask_user) is set. open_map, ask_priority_rank, ask_community_anchoring, open_intervention_selector set their OWN composer state and never set currentQuestion, and leave no assistant content message, so agentOwesResponse is true and the button renders.
- **Evidence:** cbo-profile.tsx:1518 gate checks only currentQuestion; ask_priority_rank handler sets only setPriorityRankPrompt+setIsStreaming(false) at :868-871.
- **Fix:** Extend the resume-gate suppression to any active composer (return null when priorityRankPrompt||anchoringPrompt||openMapParams||interventionSelectorParams). Better: drive the gate from a single 'a user affordance is pending' selector once composers are persisted.

#### [P1] `CBO-SKILL-ENGLISH` — encontro-1.md authorizes switching to English, contradicting the PT lock  _(effort S · depends: CBO-LANG-AUTH)_
- **Symptom:** Agent starts in PT then flips to English mid-session ('What's your role in JVP test?', 'How is the team structured? / All volunteers' as English ask_user).
- **Root cause:** The skill markdown tells the agent to switch languages based on user input, overriding the server langDirective. An English-looking org name or English reply trips the switch. Bilingual example phrasings ('Anotado.'/'Got it.') get copied verbatim.
- **Evidence:** encontro-1.md:25 'Switch to English only if the user writes in English first', :34 bilingual example, :344 'Switch immediately'; langDirective cboRoutes.ts:146-148.
- **Fix:** Delete the switch-to-English escape hatch from encontro-1.md and all sibling encontro-*.md; replace with 'Always respond in the cohort language provided by the system; never switch based on what the user types.' Remove bilingual/English sample phrasings.

#### [P1] `CBO-I18N-SYNC` — NBS type cards + map tour/site strings render English despite existing PT data (i18n.language not synced)  _(effort S · depends: CBO-LANG-AUTH)_
- **Symptom:** Type strip cards ('Channels and planted areas that filter rainwater...'), map tour ('Where water tends to pool', less/more risk, 'Step 1: Click your neighborhood'), and site step ('How do you want to mark your place?', 'A point', 'Click vertices, double-click to close') all render English.
- **Root cause:** These all have PT data (cbo-schema.ts pt.description) or existing pt.json keys; they leak only because client i18n.language is 'en' at render (standalone/test session or pre-fetch race) - a sync problem, not a missing-key problem.
- **Evidence:** NbsTypeStrip.tsx:111 selects by i18n.language; cbo-schema.ts:107-188 has pt.description + getLocalizedNbsType; MapMicroapp.tsx:1033,1044-1045,1129,810,833,836,948 use t() with keys present in pt.json.
- **Fix:** Resolve via CBO-LANG-AUTH (guarantee i18n.language === cohort language before strips/map mount, incl. standalone). Optionally pass the authoritative lang as a prop from cbo-profile instead of reading i18n.language so components can't render pre-sync. Align MapMicroapp.tsx:948 addSite inline default to PT for defense-in-depth.

#### [P2] `CBO-HARDCODED-STATUS` — MapMicroapp loading-status strings are hardcoded English with no i18n key  _(effort S)_
- **Symptom:** 'Fetching Parks & Green...', 'Loading neighborhoods...', 'Running ...', 'Loading sites...' always appear in English even when everything else is correct PT.
- **Root cause:** These setLoadingStatus calls are string literals with no t() wrapper and no key in either locale - a true hardcoded leak a cohort-language sync cannot fix. 'Fetching Parks & Green' also interpolates the English OSM layer name.
- **Evidence:** MapMicroapp.tsx:248,399,472,503 setLoadingStatus literals; layer name English at geospatial-layers.ts:274.
- **Fix:** Add mapMicroapp.loadingNeighborhoods/loadingSites/fetchingLayer/runningQuery keys to en.json+pt.json and wrap each setLoadingStatus in t(). For the interpolated name, add a localized label map or drop the layer name from user-facing status.

#### [P2] `CBO-MAP-TAB-SPINNER` — Map tab shows a bare lone spinner (no skeleton/heading) while the lazy MapMicroapp chunk loads  _(effort S)_
- **Symptom:** Opening the Map panel briefly (or for seconds on slow connections) shows a blank panel with one centered spinner and no context; can flicker between spinner and a 'map opens later' placeholder off-phase.
- **Root cause:** open_map (or ask_user showMap) switches rightTab to 'map' before the ~63KB lazy component is ready, and the Suspense fallback is a bare Loader2 with no label/skeleton. ask_user-with-showMap sets tab but never sets openMapParams, so the live render depends on defaultParams which returns null unless phase===2, causing spinner<->placeholder flicker.
- **Evidence:** cbo-profile.tsx:1791 bare fallback, :836-846 immediate tab switch, :833 showMap sets tab not params, :125-134 defaultParams gated on phase===2, :1843-1845 placeholder.
- **Fix:** Replace the bare spinner with a labeled map skeleton (panel heading + 'Carregando o mapa...' + shimmer). Guard the tab switch so the map tab only auto-activates once openMapParams (or valid defaultParams) exist; consider prefetching the MapMicroapp chunk when the map tool becomes pending.

#### [P2] `CBO-BANNER-FLICKER` — 'Comecar Encontro N' banner gated on raw isStreaming (not debounced), so it flickers mid-turn  _(effort S)_
- **Symptom:** A next-workshop banner briefly flashes 'Comecar Encontro N' between SSE packets during a turn.
- **Root cause:** The banner block returns null only when isStreaming is true, unlike the resume block which uses the 250ms stableStreamEnded debounce. Any mid-turn event flipping isStreaming=false (ask_user, open_map) or the 'done' packet gap lets the banner flash.
- **Evidence:** cbo-profile.tsx:1434 gate (no stableStreamEnded) vs :1518 which includes !stableStreamEnded.
- **Fix:** Add '|| !stableStreamEnded' to the banner gate at :1434 so it uses the same debounced end-of-turn signal as the resume block.

#### [P2] `CBO-PHASE-WRITERS` — Phase advance has three writers; none update member.snapshotPhase; chat-regex path skips durable flush  _(effort M)_
- **Symptom:** After advance-phase or a set_phase, the coordinator roster/welcome can show the wrong encontro until a member payload re-fetch; a phase bumped only by the chat regex can be lost on restart within the 2s debounce.
- **Root cause:** advanceCboPhase sets state.phase+flushNow but never writes cohortMembers.snapshotPhase (only lazily reconciled on read). The chat handler's 'vamos comecar o encontro N' regex sets state.phase inline with its own gate and only debouncedPersist, bypassing advanceCboPhase's flushNow - the duplication the AdvancePhaseResult refactor meant to remove.
- **Evidence:** cboAgent.ts:178-194 no snapshotPhase; cohortRoutes.ts:148-157 read-time self-heal; cboRoutes.ts:107-123 inline regex advance no flushNow.
- **Fix:** Have advanceCboPhase also update cohortMembers.snapshotPhase in the same durable step, and route the chat-regex advance through advanceCboPhase so gating, snapshot, and flushNow are single-sourced.

#### [P2] `CBO-SUBPHASE` — Phase 3 sub-sections 3a/3b/3c have no engine-enforced ordering or completion  _(effort M · depends: CBO-DEADEND-E2)_
- **Symptom:** Within Encontro 3 the agent can jump to 3c without 3b, or re-run 3a, with nothing detecting it; a skipped sub-section silently leaves its metric unscored until the 3->4 banner.
- **Root cause:** set_phase only accepts an integer 0-6; 3a/3b/3c all collapse to phase 3, and cbo_state has no sub-phase cursor, so intra-phase-3 progression is governed solely by prompt discipline.
- **Evidence:** cbo-schema.ts:11-13 three sections share phase:3; set_phase z.number().min(0).max(6) at cboAgent.ts:279; no subPhase field cbo-schema.ts:76-101.
- **Fix:** Track an explicit sub-phase cursor (state.subPhase or per-section complete flags) and an advance_subphase tool/guard enforcing 3a->3b->3c and blocking re-entry, mirroring the phase gate.

#### [P3] `CBO-PHASE-JUMP` — Phase gate checks set-membership only, so the agent can skip phases (1->3)  _(effort S · depends: CBO-DEADEND-E2)_
- **Symptom:** If the coordinator opened phases 1,2,3, a stray set_phase(3) from phase 1 succeeds, skipping the entire Encontro 2 territory capture.
- **Root cause:** advanceCboPhase only verifies the target is in unlockedPhases (includes), not that it is the immediate next phase or that the current phase is complete.
- **Evidence:** phaseGating.ts:63 return policy.unlockedPhases.includes(requestedPhase); cboAgent.ts:186-188.
- **Fix:** Require target === currentPhase+1 (or currentPhase) AND phaseComplete(state,currentPhase), unless an explicit coordinator/skip override is set. Reuse the shared phaseComplete() predicate from CBO-DEADEND-E2.

#### [P3] `CBO-PREAMBLE-KEY` — Preamble 'seen' dedup key changes within a session (cboId before member resolves, memberSlug after)  _(effort S)_
- **Symptom:** The encontro preamble can appear twice for the same CBO in one session, or re-appear on a new device / cleared storage.
- **Root cause:** The seen key is memberSlug ?? cboId ?? '' in localStorage; memberSlug resolves asynchronously, so an early evaluation keys on cboId and a later one on memberSlug - different keys, so hasPreambleBeenSeen misses and the preamble re-fires. Also contradicts 'session = server cboStateId, not localStorage'.
- **Evidence:** cbo-profile.tsx:1065,1098 seenKey; EncontroPreamble.tsx localStorage.
- **Fix:** Pin the seen key to a stable identity (prefer server cboStateId, or block preamble evaluation until memberSlug resolves). Optionally persist 'preamble seen' server-side on the member so it survives device/storage changes.

#### [P3] `CBO-PT-KEY` — common.continue/common.warning missing from pt.json  _(effort S)_
- **Symptom:** Any component using t('common.continue') falls back to English 'Continue' in a PT session.
- **Root cause:** Keys exist in en.json but are absent from pt.json (among 19 en-only keys). common.continue is generic and reachable.
- **Evidence:** en/pt diff: common.continue present in en.json, missing in pt.json; server recovery chip hardcodes PT 'Continuar' at cboAgent.ts:1069.
- **Fix:** Add common.continue/common.warning to pt.json ('Continuar'/'Aviso'). Verify it is actually referenced in the CBO chat flow before shipping.


## Backlog — Map (shared MapMicroapp in the CBO flow) (7)

#### [P0] `MAP-SEL-STALE` — Stale-closure mouseout handler wipes the neighborhood selection highlight (worst on touch)  _(effort S)_
- **Symptom:** Tapping/clicking a bairro flashes the blue highlight then instantly reverts to the risk color - selection 'doesn't stick', reading as 'tapping does nothing'. On touch the synthesized mouseout fires immediately after the tap so the highlight never even appears.
- **Root cause:** The zones onEachFeature mouseout handler computes isSelected = selectedAssets.some(...) reading selectedAssets captured when the GeoJSON was built (the zones-load effect runs once on [mapReady], so the captured value is always the initial []). isSelected is permanently false, so mouseout resets to featureDefaultStyle, clearing the just-applied selection style. React state IS updated (the bottom chip appears) but the map visual is cleared.
- **Evidence:** MapMicroapp.tsx:367-370 reads once-captured selectedAssets (no selectedAssetsRef); click select-style :359; default style :337; zones effect deps only [mapReady] :243-378.
- **Fix:** Track selection in a ref the mouseout reads live: selectedAssetsRef synced via effect on [selectedAssets], and use selectedAssetsRef.current.some(...) in mouseout. Alternatively stash _selected on the layer inside the setSelectedAssets updater and re-apply the selected style in mouseout.

#### [P1] `MAP-DRAWMODE-STUCK` — drawMode stuck at 'point' after returning from the sites step disables neighborhood clicks and panning  _(effort S)_
- **Symptom:** After advancing to step 2 (sites) and tapping Back to the neighborhood step, clicking a bairro no longer selects anything and the map can't be dragged - a hard 'can't click a neighborhood' state.
- **Root cause:** An effect sets drawMode='point' whenever allowDeferSite && isComposite && compositeStep==='assets', but backToZones never resets it and the effect has no else-branch to clear it on the zone step. With drawMode='point' the zone click handler early-returns and the custom-draw effect calls map.dragging.disable() and binds a map-level click that drops a purple point instead of selecting the zone.
- **Evidence:** MapMicroapp.tsx:216-218 set point (no reset), :506-531 backToZones lacks setDrawMode, :340 click early-return, :672 dragging.disable().
- **Fix:** Reset drawMode in backToZones (add setDrawMode('off')), and/or give the effect at :216 an explicit else setting 'off' when not on the assets step.

#### [P1] `MAP-STACKED-RISK` — Two stacked risk-coloring systems on the zone step: auto-enabled hazard rasters over the choropleth  _(effort M)_
- **Symptom:** On the CBO zone step the map shows both the per-bairro choropleth AND three semi-transparent hazard rasters at opacity 0.6, producing muddy color and washing out the low-contrast blue selection highlight - reinforcing 'I see risk colors but can't select'.
- **Root cause:** defaultParams for phase 2 passes both showLegendSimple:true and allowDeferSite:true with three risk tileLayers. The auto-enable effect fires (hazardTour false, showLegendSimple true) enabling all three rasters at 0.6, while getDefaultStyle's allowDeferSite branch already colors every zone by dominant-hazard typology. The rasters are redundant since the choropleth already encodes risk.
- **Evidence:** cbo-profile.tsx:125-134; MapMicroapp.tsx:151-156 auto-enable, :277-288 choropleth, :359 selected style, :563-565 raster opacity 0.6.
- **Fix:** On the allowDeferSite/showLegendSimple zone step, do NOT auto-enable the rasters (guard the effect with && !params.allowDeferSite or skip while compositeStep==='zone'); let the choropleth carry risk with hazard chips as opt-in toggles. Strengthen the selected-zone style (thicker white halo / higher-contrast fill).

#### [P2] `MAP-SITE-NOPAN` — Sites step: satellite map cannot be panned because drawMode is never 'off'  _(effort S · depends: MAP-DRAWMODE-STUCK)_
- **Symptom:** On the CBO site step (satellite basemap) the user can't drag the map to find their location before dropping a point; only zoom works until the first point is placed.
- **Root cause:** The step opens with drawMode='point' and the prominent control only toggles point<->area, never 'off'. The active draw effect calls map.dragging.disable() for both point and polygon, so dragging stays disabled until a point drop flips drawMode to 'off'.
- **Evidence:** MapMicroapp.tsx:216-218, :669-683 (dragging.disable :672), :831-848 prominent control, :623 reset on drop.
- **Fix:** Keep dragging enabled in point mode (only disable during polygon vertex drawing), or add a pan/'move' toggle to the point/area control. At minimum don't disable dragging for drawMode==='point'.

#### [P2] `MAP-DEAD-SHOWZONES` — Dead showZones guard - zones stay click-interactive during the hazard tour  _(effort S)_
- **Symptom:** During the flood->heat->landslide tour (selection meant to be locked), tapping a bairro through the raster silently adds a zone to selectedAssets (a chip appears) even though the tour UI implies selection is disabled.
- **Root cause:** showZones was intended to suppress zone interactivity during the tour but is never consumed (only showAssets is used). The zones layer is added unconditionally with live click handlers, so it remains interactive under the pointer-events:none tour caption.
- **Evidence:** MapMicroapp.tsx:135 showZones defined (only showAssets used at :807); zones effect :243-374 adds handlers regardless of tour; caption pointer-events:none :1025.
- **Fix:** Gate the zone click handler on tour state (early-return when tourActive via a tourActiveRef) or don't enable the zones layer until the tour completes; remove the dead showZones or wire it to disable interactivity.

#### ✅ FIXED [P2] `MAP-PARAM-DIVERGENCE` — Live-agent open vs re-entry param divergence: zone fill can be invisible (fillOpacity 0)  _(effort M)_
> Resolved by `shared/cbo-map-presets.ts`: the E2 map is defined once and the agent
> names a preset (`e2_risk_tour` / `e2_site` / `e2_browse`) instead of retyping params.
> It was worse than recorded — **five** definitions, in `cboAgent.ts` (tool description
> + phase map), `cbo-profile.tsx` (defaultParams) and `encontro-2.md` (three recipes,
> two of which contradicted the file's own "NOT 'neighborhoods'" comment).
> Pinned by `e2e/cougar-e2-map-presets.spec.ts`, which asserts the bairros actually
> have nonzero fill; reverting the preset to the old params drops it to exactly 0.
> The `minimum fillOpacity` half of the suggested fix was NOT done — invisible zones
> are now impossible by construction, and a floor would mask the next divergence.
- **Symptom:** Depending on whether the map was opened live by the agent vs restored from defaultParams, the zone step looks different: on the live path the choropleth may be missing and with zoneSource 'neighborhoods' (null priorityScore) zone fillOpacity computes to 0, so bairros look absent and only rasters show - feeding 'no clickable zones, just an overlay'.
- **Root cause:** cboAgent.ts open_map examples pass showLegendSimple but omit allowDeferSite and hazardTour, whereas defaultParams sets allowDeferSite:true. Without allowDeferSite, getDefaultStyle takes the intervention-color branch where fillOpacity = priorityScore!=null ? ... : 0 -> 0 for raw-IBGE neighborhoods.
- **Evidence:** cboAgent.ts:1300,1305 (no allowDeferSite/hazardTour); cbo-profile.tsx:125-134 sets them; MapMicroapp.tsx:289-292 fillOpacity 0 when priorityScore null.
- **Fix:** Make the agent open_map for the CBO phase-2 step pass the same allowDeferSite/hazardTour/zoneSource contract as defaultParams (single source of truth), or default allowDeferSite from role/phase in the schema. Give the intervention branch a nonzero minimum fillOpacity so zones are never invisible.

#### [P3] `MAP-BOUNDARY-INTERACTIVE` — City boundary polygon is interactive and overlays the whole map  _(effort S)_
- **Symptom:** Clicks in gaps between neighborhoods hit the transparent city-boundary polygon rather than passing through; harmless today but a latent click-swallow if zone geometry has gaps.
- **Root cause:** The boundary is added with default interactive:true and fill:true (fillOpacity 0.02) covering the entire city; it needlessly captures pointer events (zones paint above so real neighborhoods are unaffected today).
- **Evidence:** MapMicroapp.tsx:228-232.
- **Fix:** Add interactive:false to the boundary L.geoJSON options so it never intercepts clicks.


## Backlog — Orchestrator (coordinator / OEF-facing) (5)

#### [P1] `ORCH-1` — Bairro hover tooltips stack and never dismiss (sticky:true, no explicit close)  _(effort S)_
- **Symptom:** Hovering neighborhoods on the Community-projects map piles multiple tooltips (Passo da Areia, Jardim Carvalho, Partenon...) on top of each other, overlapping and unreadable; they don't replace when moving to the next bairro.
- **Root cause:** Each bairro polygon binds its tooltip with {sticky:true}; sticky tooltips follow the pointer and Leaflet's per-layer mouseout->closeTooltip does not reliably fire when crossing a shared border, so the prior tooltip is never closed. The hover setStyle churn re-renders the SVG path and adds spurious enter/leave flicker. Non-sticky CBO marker tooltips do NOT stack, confirming sticky is the differentiator.
- **Evidence:** orchestrator-landing.tsx:381 bindTooltip(...{sticky:true}); hover-mutation handlers :383-384; contrast marker tooltip :323 (no sticky, no stacking).
- **Fix:** Drop sticky:true on the bairro tooltip (anchored tooltips open/close cleanly) and add belt-and-suspenders lyr.on('mouseout',()=>lyr.closeTooltip()). Move the hover highlight to a CSS class toggle instead of setStyle to stop SVG re-render churn.

#### [P2] `ORCH-2` — Four unrelated color palettes for the same hazards (markers vs choropleth vs toggle dots vs rasters)  _(effort M)_
- **Symptom:** 'Risk by neighborhood' coloring does not match the CBO markers, and the RISK VIEW toggle dots match neither. A 'heat' CBO shows an amber marker on a red heat neighborhood; the flood toggle dot is blue while the flood raster it enables is viridis.
- **Root cause:** Four independent color systems: CBO markers colored by chosen INTERVENTION tone (TONE_STYLES), the choropleth by zone TYPOLOGY (TYPOLOGY_COLORS), toggle dots by a third hardcoded set, hazard rasters by ramp palettes. Markers encode the SOLUTION axis while fills encode the PROBLEM axis with no shared legend.
- **Evidence:** orchestrator-landing.tsx:166-171 TONE_STYLES markers, :314-315 marker tone select, :458-461 toggle dots, :213-217 HAZARD_RAMPS; TYPOLOGY_COLORS in shared/risk-display.ts.
- **Fix:** Unify hazard hues on a single source of truth (reuse TYPOLOGY_COLORS for choropleth, toggle dots, and raster-dot approximations). If markers must stay intervention-colored, add a legend clarifying markers=intervention vs fill=risk and align the base flood/heat/landslide hues.

#### [P3] `ORCH-3` — Choropleth intensity encodes raw hazard mean, not the priorityScore used for recruitment  _(effort M)_
- **Symptom:** 'Stronger fill = higher risk' implies darkest = recruit-first, but fill darkness ranks bairros by raw hazard mean while the tooltip 'priority X.XX' and recruit action use priorityScore (hazard x vulnerability), so the visually-darkest bairro is not necessarily highest priority.
- **Root cause:** fillOpacity = zoneRiskOpacity(norm) where norm normalizes zoneMaxRisk (max of mean hazards); priorityScore = dominant hazard x (1+vulnerabilityFactor) is a different metric, surfaced in the tooltip and recruit toast.
- **Evidence:** orchestrator-landing.tsx:223-225 zoneMaxRisk, :245 fillOpacity, :380 tooltip priorityScore, :777-798 recruit handler.
- **Fix:** Normalize fill opacity on priorityScore (the same metric tooltip and recruit ranking use) so darkest == highest priority; or relabel the legend to state what opacity actually encodes.

#### [P3] `ORCH-4` — CBO marker tooltip hardcoded to English name (p.name.en)  _(effort S)_
- **Symptom:** In a PT-forced cohort, hovering a CBO marker shows the English org name, ignoring cohort language.
- **Root cause:** Line 323 binds p.name.en unconditionally instead of p.name[locale]. Masked today only because memberToView sets name.en===name.pt for real members; distinct pt/en names or sample data leak English.
- **Evidence:** orchestrator-landing.tsx:323 bindTooltip(p.name.en); card uses project.name[locale] at :602; memberToView :138.
- **Fix:** Pass locale into MapPanel and bind p.name[locale], rebuilding markers on locale change.

#### [P3] `ORCH-5` — 2.5MB zones JSON refetched per map mount; bairro click is a dead-end toast; scroll-zoom silently off  _(effort M)_
- **Symptom:** Navigating away and back re-downloads a 2.5MB GeoJSON; clicking a neighborhood only pops a 'Recruit from X' toast that goes nowhere; scroll-wheel zoom does nothing with no hint, so the map can feel broken.
- **Root cause:** neighborhoodCacheRef is a per-MapPanel-instance ref discarded on unmount, so the fetch reloads the full file each mount; handleBairroClick is an intentional placeholder toast; scrollWheelZoom:false is deliberate but unlabeled.
- **Evidence:** orchestrator-landing.tsx:395 fetch (2,526,499 bytes), :274 per-instance cache ref, :777-798 placeholder toast, :295 scrollWheelZoom:false.
- **Fix:** Hoist the zones cache to a module-level var or React Query so it survives navigation (and precompute slimmer geometry/gzip); wire the bairro click to the pre-filled Invite-CBO flow; add a '+/- to zoom' hint or enable ctrl-scroll.


## Backlog — Infra (tiles / healthcheck) (3)

#### [P2] `TILE-1` — Tile proxy 204 conflates 'no data at coord' with transient S3/network failures and blacklists both for 1h  _(effort S)_
- **Symptom:** Logs show many '/api/geospatial/tiles/poa_flood_hazard/11/{x}/{y}.png 204'. Most are benign edge-of-extent tiles, but a transient S3 5xx/timeout during a pan can blank real tiles for up to an hour, making patches of a hazard/risk layer look empty even after S3 recovers.
- **Root cause:** On both the not-ok and catch branches, any failure - 404 (definitive no-data), 403, 5xx, fetch timeout, AbortError - is treated identically: the coord is written to failedTiles and returned as 204. The fail-cache TTL is a flat 1h checked before re-fetch, so a single transient hiccup blacklists that coordinate for the hour, and every failure is indistinguishable in logs (all 204, no upstream status recorded). Verified S3 IS populated (valid PNGs z10-13 at POA center), so z11 204s are just out-of-extent.
- **Evidence:** tileProxyRoutes.ts:158-169 (not-ok+catch), :208-210/218-220 (proxy-tile), FAIL_CACHE_MS flat 1h :128, checked :143-144,193-194.
- **Fix:** Branch on upstream status: only fail-cache definitive absences (403/404) and return 404 (not 204) so logs/clients distinguish empty-extent from breakage; for 5xx/timeout/abort do NOT write the long-lived fail-cache (or use ~30s TTL) and return 502/504 so a later pan re-fetches. Log response.status/'timeout'/'abort' on error branches.

#### [P2] `HEALTH-2` — Error-handling middleware re-throws after responding - can crash the process (uncaughtException)  _(effort S)_
- **Symptom:** Latent: any API route forwarding an error via next(err) triggers a genuine 500 AND then an uncaught exception that can take down the autoscale instance, producing a 500 immediately followed by 'connection refused' during restart (same signature as the isolated 11:07 event).
- **Root cause:** The Express error handler does res.status(status).json({message}); throw err;. Throwing inside error middleware after the response is sent propagates as an uncaughtException (no process.on('uncaughtException') handler exists), crashing/restarting Node. It is also registered BEFORE setupVite/serveStatic, so it is not the true terminal handler.
- **Evidence:** server/index.ts:45-51 (throw err after res.status().json()); no uncaughtException/unhandledRejection guard; registered at :45 before serveStatic :56-60.
- **Fix:** Remove throw err (log it via console.error instead) and return after responding. Move the error handler to register AFTER serveStatic/setupVite so it is the terminal handler. Add process-level uncaughtException/unhandledRejection logging so a stray throw degrades gracefully instead of restarting.

#### [P3] `HEALTH-1` — No dedicated /health probe - liveness depends on registerRoutes()/DB startup (benign boot 500s)  _(effort S)_
- **Symptom:** During deploy/boot Replit logs 'healthcheck / returned status 500' repeatedly plus 'connection refused'; a standalone 500 on '/' on another deployment.
- **Root cause:** index.ts awaits registerRoutes(app) (DB wiring) and only then calls server.listen, so until listen fires the port is unbound and the healthcheck on '/' gets connection-refused, surfaced upstream as 500/502. Post-boot '/' is the static index.html catch-all returning 200, so these are cold-start races, not a post-boot root-route failure.
- **Evidence:** server/index.ts:43 registerRoutes then :67 listen; static catch-all vite.ts:82-84; no '/health' or app.get('/') route exists.
- **Fix:** Add a lightweight route registered BEFORE the async DB work (app.get('/health',(_,res)=>res.sendStatus(200)) and/or a synchronous '/') and point the Replit healthcheck at /health, decoupling liveness from DB startup. Guard against registerRoutes() hanging (DB unreachable) which would leave the port permanently unbound.

---

# v2 — Integration audit + field-safety wave (2026-07-02)

_After the v1 wave (#312–#320, all merged), a second deep audit ran against the integrated branch: two independent code reviews (agentic seamlessness vs the 12-point spec; phone-first PT-user UX) plus a **documented Playwright walkthrough** at 390×844 with screenshots per beat. Verdict at the time: ~60% to "foolproof" — demo-ready with a facilitator, not yet safe for an org alone on a phone._

## Shipped in the field-safety wave (#321–#326)

| PR | Fix | Was |
|---|---|---|
| #321 | Restart requires confirmation (AlertDialog, PT/EN) | one-tap irreversible wipe next to Export |
| #322 | Invite-link error card (invalid-token vs network + retry, 15s timeout) | infinite spinner |
| #323 | Brazilian decimal-comma coordinates + POA-region sanity net | PT placeholder input parsed into the ocean, silently persisted |
| #324 | Invite-prefilled fields don't count as phase progress | premature "Começar Encontro 2" banner at turn 0 |
| #325 | Site step pans by default; arm-to-drop; tap-first-vertex closes areas; panning stays on while drawing | auto-armed pin-drop + dragging disabled = unusable on phones |
| #326 | SSE 60s watchdog + localized "Tentar de novo" retry chip | frozen "Processando…" forever, or raw English "Error:" |

## Remaining backlog (next waves, priority order)

### Wave: agent robustness (the structural 40%)
1. **PERSIST-PROMPTS (P0, M/L)** — persist `ask_user` / `ask_priority_rank` / `ask_community_anchoring` (and #316-converted questions, which today vanish from BOTH the transcript and the agent's decision log) as `messageType:'composer'` transcript messages; rehydrate the trailing composer on load. Single seam that closes: reload-drops-question, converted-question amnesia, resume-overlap, and most of stacked-composers.
2. **Pending-affordance selector (P1, S)** — one `pendingAffordance` (question ‖ rank ‖ anchoring ‖ map ‖ selector) drives BOTH the Continue gate and the advance banner (today they check only `currentQuestion`).
3. **Duplicated question prose+ask_user (P1, M)** — needs the turn buffer in `cboAgent.ts` streamWithSdk; drop a trailing text block ≈ the following ask_user question.
4. **Agent latency (P1, S/M)** — Ana's "too slow": strip `Read/Glob/Grep` + set maxTurns; slim `encontro-*.md` (29KB!) ~60%; per-phase `model:` frontmatter; consider persistent session/prompt caching. System prompt ≈ 9-10K tokens rebuilt per turn + fresh SDK process per message.
5. **Raw payload persisted server-side (P2, S/M)** — reload swaps the clean risk-summary bubble back for the `formatMapResult` dump (persist a displayText alongside content); InterventionSelector still sends its raw machine string visibly.
6. **Turn-ender residual holes (P2, S)** — ack-only text turn still strands (recovery gated on `!emittedText`); `show_types/show_examples` count as enders without a paired ask_user.
7. **Server `set_phase` gate (P2, S)** — require sequential target + `phaseComplete(current)` (reuse the shared predicate).

### Wave: mobile & language polish
8. **EN leaks that persist into data (P1, S/M)** — 'Custom point/area/site' asset names (echoed in the PT summary + coordinator view → use PT names), zone tooltip labels/riskBand raw EN, "click to select", "(select all that apply)", "Confirm N selected", "Question X of Y · Tab to cycle", EditableField Cancel/Save, drag overlay, "Error:" prefix, OSM loading statuses (`Fetching Parks & Green…` at MapMicroapp:406-493 — hardcoded EN).
9. **Types-strip horizontal overflow (P2, S)** — drags the whole page sideways at 390px (walkthrough beats 3/7); contain with overflow-x-auto + max-w-full.
10. **MapMicroapp sticky tooltips (P2, S)** — same fix as orchestrator #319: drop `sticky:true`, close on mouseout; on touch they linger half off-screen and mislead (walkthrough beat 6).
11. **OSM loading UX (P1→P2, M)** — non-blocking corner chip instead of the full-map overlay; 15s client AbortSignal; "alguns locais não carregaram" notice on silent failure.
12. **Desktop tab row on mobile (P2, S)** — `hidden md:flex` (4 tabs overflow 390px and duplicate the bottom nav).
13. **Touch targets (P2, S)** — map chrome h-5/h-6/h-7 → ≥h-9; badge-remove X is 10px.
14. **Hover-only edit pencil (P2, S)** — `opacity-60 md:opacity-0 md:group-hover:opacity-100` so touch users can discover field editing.
15. **Zone-step density (P2, M)** — one Next button (not two), merge chips+overlay legend, surface "não tem um lugar exato? pode usar o bairro todo" on the zone step.
16. **Hazard rasters disagree on what green means (P1, M — data pipeline)** — sampled from the shipped tiles: `poa_flood_hazard` runs dark purple (low) → **green** (high), while `poa_heat_hazard` and `poa_landslide_hazard` run green (low) → orange / pale yellow (high). Green is therefore the safe end on two hazards and the dangerous end on the third, shown back to back in the E2 tour. The "Como ler este mapa" sheet now *detects and warns about* this (`rampWarning()` in `shared/hazard-legend.ts`), and `data-provenance.ts` no longer claims "verde = menor risco" for flood — but the root fix is re-baking the three rasters onto one shared risk ramp in geospatial-data, then deleting `helpWarnInverted` and the assertions in `e2e/cougar-e2-map-help.spec.ts`. Related: `poa_landslide_hazard`'s p98 is only 0.393, so its whole ramp sits in green and the real variation is invisible (`helpWarnLowContrast`).
17. **`map` turns persist their raw payload (P2, S)** — a map selection stores `Map selection (composite mode): …` as the user's transcript row, so a reload shows the dump. `map_help` turns now persist `displayText` instead (`cboRoutes.ts`); doing the same for `map` means the agent stops re-reading H×E×V numbers out of `buildDecisionLog`, so it needs the structured site data threaded in first.

### Deferred product decisions (Ana)
- Site selection E2 → E3 with a "do you have a site idea?" gate (meeting decision, due 07-22).
- NBS example photos in WS2; clustering mechanism (known platform gap).

### Wave: orchestrator portfolio dashboard (Ana, 2026-07-30)
19. **NBS sizing parameters + "what NBS solve / don't solve" panel (P1 for the panel, P2 for sizing — from Conceito Arte, 2026-07-31)** — the cohort's most mature org sent an unprompted technical manual (`Documento_SBN_Dimensionamento_e_Dashboard.pdf`) with (a) retention capacity per typology — bacia 0.15–0.35 m³/m², microfloresta Miyawaki 0.20–0.30 m³/m² at 3–12 mudas/m², jardim de chuva 0.15–0.35 m³/m², biovaleta 0.10–0.20 m³/m linear, calçada permeável 0.014–0.194 m³/h/m² — each with its sizing formula; (b) a scale-honesty table for Bacia do Sarandi: NBS absorb ~0.03% of the 2024 historic flood (18.45M m³) but ~11.5% of a microbasin flooding event (50k m³), with a feasibility exercise showing that retaining 20% of a historic flood would need ~30,000 detention basins over 12 km²; (c) a 6-block impact dashboard spec including a transparency panel separating what NBS solve (street flooding, gallery overload in routine rain, heat islands, biodiversity loss) from what they don't (Guaíba/river rise above flood level, dike failure, macrodrainage pump failure). Three landing places: the transparency panel belongs in **W2's educational beat** (expectation-setting before orgs design against the wrong problem — cf. Ana 8 Jul on not overselling community-scale project potential); the retention parameters belong in `nbs-catalog.ts` as new performance fields feeding **W3 sizing** (`impactModelService.ts` today generates narrative only, no quantitative sizing); the dashboard merges with #18 as its impact view. ⚠️ Figures are illustrative for Bacia do Sarandi, not measured — mark provenance like `classificationEstimated`. Note the Miyawaki parameters also answer the reforestation scale-variant question Robson and Julia raised on 16 Jul.

18. **Aggregated cohort table/dashboard + agent maturity analysis (P1, M/L)** — Ana's ask (2026-07-30, verbatim): "estaba pensando qué tan fácil sería hacer una visualización más agregada, tipo tabla/dashboard, con la etapa en que cada organización está y una visión de su perfil… un poco de cómo el agente podría ya empezar a ayudar a hacer análisis sobre la madurez del grupo y posibles sinergias." Today `orchestrator-landing.tsx` shows per-org cards (phase, sections complete, maturity 27-pt, priority flags) with a hover-linked map, but no cross-org aggregate view. Two parts: (a) a sortable/filterable table — one row per org, columns: encontro stage reached, profile completeness, maturity score, NBS-família interests + role preferences (E2 `nbs_interest` / `role_preference` fields), site/bairro status; (b) an agent-generated portfolio read on top: group maturity distribution and candidate synergies/clusters (overlapping família interests, same bairro/risk profile, complementary roles) — feeds the coordination's Sep cluster-formation moment (biweekly 2026-07-16 decision: "platform supports portfolio-level strategy") and Robson's dual-input feasibility assessment (2026-07-30). Explored in `docs/nbs-catalog-robson-review-proposal.html` §Orchestrator.

### Wave: W2 field test — JVP, 2026-08-03 (one full session as a test org)

20. **Chips that need a file should OPEN the file picker (P1, S — structural)** — tapping "Tenho arquivos pra anexar" answers with prose ("Show! Toca no 📎 e manda o que tiver") and leaves the user to find the paperclip themselves. The chip already knows the user wants to attach; making them hunt for the affordance is a dead step, and it repeats at every upload invite in every workshop (E1 documents, E2 site photos, E3a plans, E5 evidence links). Wanted structurally, not per-checkpoint: give an `ask_user` option an optional **client-side action** (e.g. `action: 'open_file_picker'`) that the chip renderer executes on tap in addition to posting the answer, so any workshop's checkpoint can offer it declaratively. The same seam would later serve "open the map" and "start a voice note". ⚠️ Must stay additive — the chip still posts its message, or the checkpoint machine loses the turn.

21. **Export a full context bundle from the CBO side panel (P1, M)** — JVP, 2026-08-03: an export button on the org panel (Convite / Arquivos / Conversa / Perfil) that downloads a folder with everything the platform holds for that org, "that you or another agent can read to get the full context bundle". Contents: the profile fields (all 7 sections with source + confidence), the full transcript, the uploaded files as originals, the voice-note transcriptions, the site (bairro, coordinates, address, risks), the maturity scorecard, the família recommendation with its why-lines, and the depth read. Agent-readable first — a `context.md` plus the raw assets, not a PDF. The motivating question — "shared images and a voice note, how did that impact the famílias that were recommended?" — is really an **explainability** ask: the bundle should make the recommendation's inputs inspectable. ⚠️ Note the honest answer today is partly "they didn't": `rankFamiliasForSite` takes only bairro risks + `current_use` + site-name keywords; photos and the voice-note story reach the ranking only through the `site_worry` boost and the model's `show_familia_recommendation` override. The bundle should state that rather than implying a richer causal chain than exists. To be refined with JVP.

22. **Voice-note transcription keeps the speaker's language, not the session's (P2, S)** — in the 2026-08-03 test the org spoke Spanish and `site_story` was stored verbatim in **Spanish** inside a pt-BR session ("Este sitio es una escuela que tiene muy poco terreno verde…"). It flows unchanged into the profile panel, the concept note, and anything a coordinator reads. Decide deliberately: keep the verbatim transcript (respecting their words — the photovoice principle already applied elsewhere) **plus** a session-language rendering, rather than silently storing whichever language the audio happened to be in. Worth checking against the cohort — some orgs may be more comfortable in Spanish.

### Wave: chip actions — JVP, 2026-08-04 (refined, approved, not built)

23. **A chip carries its action; the model is not asked to retype a string literal (P1, M — structural)** — JVP got stuck on the famílias question: he tapped "Ver exemplos reais" and nothing happened. Two defects met there. The freeze itself is fixed (PR for CBO-TURN-TAIL-FREEZE); this is the cause behind it.

    `serveE2Checkpoint` is a string-matching state machine — it routes on exact chip labels (`is({ pt: 'Já conheço SbN — pular', … })`). When the *template* wrote the chips, the labels match and the step resolves in 0ms (`model=template`). When the *model* wrote them, they don't. The strip tools (`show_types`, `show_familias`, `show_familia_recommendation`) end their tool result by instructing the model: *"in this SAME turn you MUST follow with a short message and an `ask_user` (e.g. options 'Ver exemplos' / 'Já conheço, pular')"*. That sentence delegates authorship of the flow's control surface to a model. "Ver exemplos" became "Ver exemplos reais"; nothing matched; the tap fell through to a full ~10s model turn — which is also what made the turn-tail race wide enough to freeze on.

    **Principle (JVP's, and the rule to hold to): the model interprets what people WRITE; the template resolves what people TAP.** A tap is already unambiguous — re-interpreting it costs ~10s, tokens, and a contract that fails silently.

    Decided 2026-08-04 (both via /refine, JVP picked both recommendations):
    - **Routing = action id on the option.** Extend the existing `action` field (today `'upload' | 'upload_then_answer'`, already honoured end to end by the chip renderer) into the E2 intents: `show_examples`, `skip_examples`, `open_map`, `pronto`. The server dispatches on the id; the label becomes pure copy the model may still phrase freely.
    - **Every tap deterministic.** No chip in E2 costs a model turn. The model keeps the story, the uploads, the read-back, the diagnostic — everything requiring prose.

    Work: (a) widen the `action` union + carry `chipAction` on the chat POST; (b) `serveE2Checkpoint` dispatches on the id BEFORE label matching, with label matching kept as the fallback so sessions already in flight keep working; (c) the strip tools push their own follow-up `ask_user` with fixed ids instead of instructing the model to write one; (d) delete the "you MUST follow with an ask_user" line from the tool descriptions and `knowledge/_skills/encontro-2.md`.

    ⚠️ **The action id must be persisted on the composer row**, not just sent live — chips re-render from that row after a reload, and an id that isn't stored means a reloaded session silently drops back to label matching. That would leave the bug alive for exactly the people whose connection dropped.

    ⚠️ Cost to weigh per step: a templated reply can't react in the moment the way a model can. Nobody will miss that on navigation chips ("see examples", "open the map"); a step whose reply should sound like it heard them is a judgement call, not a blanket conversion.

    Applies beyond E2 — the seam is in the shared `ask_user`/checkpoint layer, and JVP flagged it as relevant for W3 onwards. Worth landing before W3's flow is written on top of label matching.

## Field report — Ana, 2026-07-07 (org profile via news-article link)

Symptoms: `prior_project_scale`/`nbs_experience` filled silently from the article as raw machine ids ("funded", "gardens-and-greening") shown in English on the panel and wrong; the "Quero ajustar" list omitted those two fields but offered "Liderança atual", which isn't a schema field; name/role never re-asked when the first user message is a link.

Root causes and fixes:
1. **Enum storage lottery** (skill spec says machine ids, system prompt says PT, chips store labels; no display mapping) → `shared/cbo-field-catalog.ts`: canonical `{id, pt, en}` catalog; `update_section` canonicalizes writes + rejects unknown org_profile field names; `E1Cards`/`CboProfileSummary` map legacy ids on render. PR #334.
2. **Doc over-inference + recap divergence** → E1 skill Step 1 contract: docs fill descriptive fields only; the two scoring enums become Batch-B suggestions ("Pelo artigo parece que… confere?"); contact_name/role only from the human; recap = exactly the persisted fields; "O que mudo?" chips = same list; re-ask name/role after a doc-first opening. PR #335.

## Audit 2026-07-07 — same bug classes elsewhere (3-agent sweep after the field report)

Fixed immediately: phase-3+ flat table rendered org_profile values raw, bypassing the E1Cards mapping (→ #334); E2 photo-upload turn said "silently update_section anything useful", contradicting its own confirm-don't-assert rule (→ #335).

Open, by priority:
1. **InterventionSelector confirm payload (P1, S)** — `cbo-profile.tsx` onConfirm sends `Selected NBS types: … (rain_gardens, …). Knowledge files: nbs/….md` with NO displayText → raw English machine string visible in the bubble immediately AND persisted. Same family as backlog v2 #5 (map raw payload on reload); fix both with a persisted displayText.
2. **E2 deferred beats store English enum ids (P1 before those beats ship, P3 today)** — `current_use` (encontro-2.md:307), hazard ranking ids (322-326), `land_tenure` (342), consolidated write (392); closing references `{primary_hazard_label}` that nothing produces (398). Port the E1 "store the PT chip label" rule + extend cbo-field-catalog to intervention_site enums when enabling.
3. **intervention_site machine fields render as document rows (P2, S)** — `site_lat/site_lng/site_geometry/site_deferred` show as table rows ("site geometry: POLYGON((…))"); most E2 field names have no `cbo.fields.*` locale key (bairro, current_use, primary/secondary_hazard, community_anchoring_lead, community_engagement_methods) → humanized English fallbacks. Hide machine fields from render + add labels.
4. **bairro ↔ neighborhood split (P2, S)** — map-nudge isDone checks `bairro`/`site_name` but SAMPLE_CBO_DATA skip path writes `neighborhood` → dev skip leaves "Abrir o mapa" nudge stuck; locale vocabulary also uses `neighborhood`/`current_conditions`. Reconcile on the E2 skill names.
5. **flag_gap.sectionId unvalidated (P2, S)** — bogus sectionId (or org_profile field outside FIELD_GROUPS) makes the gap silently invisible; agent believes it flagged. Validate like update_section.
6. **Markdown export is all-English (P2, S/M)** — `exportCboMarkdown` headers + raw values; community-facing download button.
7. **MapMicroapp hover tooltip shows raw intervention type (P3, S)** — `interventionType.replace(/_/g,' ')` → "urban forest" in EN.
8. **open_map layer ids unvalidated (P3, S)** — unknown id = silently missing hazard layer.

Verified clean: Placar metrics/flags fully localized; roster bands localized; phaseComplete does NOT key on field names (synonym field can't dead-end the banner); E2 recaps are field-bound; no one-shot-question drop in E2.

## SSE stream trust — 2026-07-07 evening (PR #343)

Fixed: 15s heartbeat, deliberate-abort suppression on restart/unmount, stale-session error suppression, honest disconnect log. Fake model gained a `wait` op for simulating thinking gaps.

Open:
9. **Same-session-in-two-tabs degrades (P3, M)** — `pushEventRegistry` is one slot per cboId, so two live streams for the same member hijack each other's tool events; the starved tab hits the watchdog. Not a real-user pattern (each CBO has one phone), hit only when testing with duplicated tabs. Fix would be per-connection pushers with broadcast.
10. **Kickoff double-send under StrictMode (P3, S)** — dev-mode double-mount fires the auto-kickoff twice (doubled `sample/init`/`by-token` in logs); prod unaffected. A sent-once ref on the kickoff effect closes it.
