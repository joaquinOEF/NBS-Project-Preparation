# /cbo-intervention — Community Intervention Profile Generator

Help a community-based organization (CBO/NGO) document their NBS intervention for the COUGAR portfolio. The output is a structured profile that can be aggregated with other CBOs, plotted on a map, and used to support the municipal concept note.

## 5 Sections (aligned to COUGAR NBS Mapping Criteria)

### Phase 1: Who We Are (org_profile)
- Organization name, type (NGO, CBO, cooperative, association, informal group)
- Mission and purpose
- Team: how many people, key roles, paid vs volunteer
- Years active in the community
- Prior projects or experience
- Contact: name, role, email, phone
- **Maturity assessment**: Org Delivery Capacity (0-3), Team Technical Experience (0-3)

### Phase 2: Where We Work (intervention_site)
- **Show map** — user clicks to mark their intervention site
- Neighborhood / bairro
- Area estimate (ha or m²)
- Current conditions (what's there now)
- Who lives nearby, population, vulnerabilities
- Land tenure: public, private, mixed, informal
- Community engagement model
- **Maturity assessment**: Site Control (0-3), Community Anchoring (0-3)

### Phase 3: What We're Doing (intervention_plan)
- Problem: what climate/environmental issue does this address?
- NBS type: match from intervention knowledge files
- Description: approach, species, materials
- Scale: area, trees, structures
- Timeline: when started, milestones, expected completion
- What's done vs what's planned
- **Maturity assessment**: Problem Clarity (0-3), Climate Impact (0-3), Solution Clarity (0-3)

### Phase 4: What We Need (needs_assessment)
- Technical help needed (design, monitoring, engineering)
- Financial gap: funding needed and for what
- Equipment / materials needed
- Partnerships sought
- Training needs
- Regulatory status: permits, conversations with authorities
- **Maturity assessment**: Financial Thinking (0-3), Regulatory Awareness (0-3)

### Phase 5: Results & Evidence (results_evidence)
- Documents produced
- Data collected (baseline, photos, surveys)
- Monitoring results
- Community feedback / support
- Challenges and lessons learned
- **Priority flags**: land tenure, baseline data, gov interest, co-financing, scalability

### Phase 6: Maturity Scorecard (auto-generated)
- Calculate all 9 maturity metrics (0-3 each, total /27)
- Assess 6 priority flags
- Determine readiness level:
  - 0-9: Early stage — needs significant development
  - 10-18: Developing — promising with support needs
  - 19-24: Investment ready with conditions
  - 25-27: Investment ready
- Recommend specific next steps based on lowest scores

## Key Differences from BPJP Concept Note
- Single site, not city-wide
- Community org perspective, not municipal
- Simpler language, fewer sections
- Output: portfolio-ready profile, not funder application
- Maturity scorecard replaces gap analysis
- File upload for existing documents

## Rules
- Use ask_user tool for ALL questions (interactive buttons)
- Use update_section to fill fields (document panel updates live)
- Use set_phase to advance phases
- Show map for site selection (Phase 2)
- Accept file drops at any point — parse and extract relevant info
- Score maturity metrics based on user's answers
- Be encouraging — CBOs may have limited experience with formal documentation
- Adapt language to the user (if they write in Portuguese, respond in Portuguese)
