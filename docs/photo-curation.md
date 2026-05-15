# Photo Curation Standard

**Last updated**: 2026-05-15 · **Status**: active

Every photograph shown on the platform must demonstrably represent the named project or place. Stock-feeling photos that "look like a community garden somewhere" are not acceptable — a community leader who knows Curitiba can spot a fake Parque Barigui, and trust drops the moment they do.

## What is allowed

| Source | License | Notes |
|---|---|---|
| **Wikimedia Commons** | CC-BY / CC-BY-SA / Public Domain | Preferred. Stable URLs, machine-readable license metadata, freely redistributable. |
| **Prefeitura websites** (Curitiba, São Paulo, POA, Recife, BH, etc.) | Varies — check each ToS | Usually permissive for non-commercial educational use. Always attribute. |
| **Agência Brasil** | CC-BY | Brazilian state news agency. Many photos of public works + community projects. |
| **WRI Brasil publications** | Attribution required | NBS-specific projects already framed correctly. |
| **Partner orgs directly** (Vila Flores, Catalytic Communities, Sustainable Favela Network) | Direct permission | Best for their own work. Get written permission before use. |

## What is NOT allowed

- Stock photography (Getty, Shutterstock, Unsplash without explicit project match)
- AI-generated images
- Photos without verifiable attribution
- Photos labeled as one project but visually inconsistent with that project's actual look (e.g. a generic "rain garden" labeled as a specific Recife project — credibility risk)

## How to attribute

Every photo in `client/public/assets/*` or referenced in a manifest must record:

```yaml
- file: client/public/assets/interventions/flood-parks.jpg
  project: "Parque Barigui"
  city: "Curitiba, PR"
  source: "Wikimedia Commons"
  source_url: "https://commons.wikimedia.org/wiki/File:Parque_Barigui_-_Curitiba_DSC04494.JPG"
  photographer: "Agrinaldo Caires Fonseca"
  license: "CC-BY-SA-3.0"
  verified_at: "2026-05-15"
  verified_by: "JVP"
```

The `photoCredit` field on `caseStudies[]` in `shared/cbo-schema.ts` should be a rendering of `photographer` + `license`, e.g. *"Agrinaldo C. Fonseca · CC-BY-SA"*.

## Audit of existing intervention case-study photos

Six photos already shipping in `client/public/assets/interventions/`. Verdicts based on the schema labels in `shared/cbo-schema.ts:87-142` (full visual audit requires opening each JPG; this doc flags what's verified by label-vs-source-search).

| File | Labeled as | Verdict | Action |
|---|---|---|---|
| `bioswales.jpg` | "Bioretention Rain Garden, Portland USA" | ❌ **Not Brazilian.** Schema says Portland — this is the single clearest miss. The whole intervention library is supposed to read as Brazilian. | **Replace** with a Brazilian case. Recife UFPE pilot project documented at [scielo.br](http://www.scielo.br/j/ac/a/3mKRyFjSkPdBkhdvyVGZZLL/?lang=pt); São Paulo has multiple municipal projects. Need a verified-source photo. |
| `flood-parks.jpg` | "Parque Barigui, Curitiba" | ⚠️ **Verify against Wikimedia.** Multiple high-quality Wikimedia photos exist for this park. | **Verify or replace** with `Parque_Barigui_-_Curitiba_DSC04494.JPG` (CC-BY-SA, photographer Agrinaldo Caires Fonseca). |
| `green-corridors.jpg` | "Parque Capibaribe, Recife" | ⚠️ **Wikimedia category exists but no canonical photo found for Capibaribe specifically.** | **Verify** — if the existing JPG looks like the Recife Capibaribe project (linear riverside park, palms, walking paths), keep + attribute. Otherwise pull from [Prefeitura do Recife photo gallery](http://meioambiente.recife.pe.gov.br/parque-capibaribe) with permission. |
| `green-roofs.jpg` | "Fundação Cásper Líbero, São Paulo" | ⚠️ **Specific project — Av. Paulista 900, Edifício Gazeta, 700 m² Mata Atlântica green roof by botanist Ricardo Cardim.** | **Verify** — the photo should show the rooftop forest with 130 native plant species, urban Av. Paulista context. If it's a generic green roof, replace. |
| `urban-forests.jpg` | "Rua Gonçalo de Carvalho, Porto Alegre" | ⚠️ **Very recognizable place — 500m tipuana tree tunnel.** Easy to verify visually. | **Verify** — if the JPG isn't unmistakably the green-tunnel street with cobblestones + 19th-century buildings, replace. [Wikipedia article](https://pt.wikipedia.org/wiki/Rua_Gon%C3%A7alo_de_Carvalho) has source photos. |
| `wetland-restoration.jpg` | "DRENURBS Parque Primeiro de Maio, Belo Horizonte" | ⚠️ **Verify against Wikimedia.** | **Verify or replace** with [`Parque_Primeiro_de_Maio_01.JPG`](https://commons.wikimedia.org/wiki/File:Parque_Primeiro_de_Maio_01.JPG) (Wikimedia Commons). |

**One definite replacement (`bioswales.jpg`) + five visual verifications needed before pilot launch.**

## New photos to source for E2 NbsShowcaseCard

Per the curriculum plan, E2's showcase cards need 3 Brazilian NBS examples. Sourced URLs below.

### Card 1 — Curitiba · Parques do Barigui (NbS for flooding)

- **Source**: [Wikimedia Commons — Parque Barigui DSC04494](https://commons.wikimedia.org/wiki/File:Parque_Barigui_-_Curitiba_DSC04494.JPG)
- **Photographer**: Agrinaldo Caires Fonseca
- **License**: CC-BY-SA-3.0
- **Alt source**: [Category:Parks in Curitiba](https://commons.wikimedia.org/wiki/Category:Parks_in_Curitiba) — multiple Barigui photos
- **Visual check**: should show wide-open park space with the Barigui river / lake visible; capybaras optional but iconic

### Card 2 — São Paulo · Parque do Tietê (NbS for flooding + biodiversity)

- **Source**: [Wikimedia Commons — Category:Parque Ecológico do Tietê](https://commons.wikimedia.org/wiki/Category:Parque_Ecol%C3%B3gico_do_Tiet%C3%AA) (613+ files)
- **License**: varies per file — pick one that's CC-BY or PD
- **Recommendation**: photo showing the Bandeiras do DAEE or Barragem da Penha is iconic; a wider park shot showing the riparian floodplain works for the "1.400 ha with ecological function" framing
- **Alt source**: [Governo do Estado de SP photo gallery](https://www.saopaulo.sp.gov.br/conhecasp/parques-e-reservas-naturais/parque-ecologico-do-tiete/) — verify reuse terms

### Card 3 — Porto Alegre · Várzea Lab · Vila Flores (NbS for community adaptation)

- **Source**: **Direct from Vila Flores** (`contato@vilaflores.org`)
- **License**: Direct permission for COUGAR platform use
- **Why direct**: This is their work; they own the visuals; relationship-appropriate to ask. Antônia or Julia should provide 1-2 photos of the courtyard / rain garden / community workshops on site.
- **Visual check**: should show the 1920s architectural complex from Rua São Carlos, the courtyard, or community workshop activity. Photos with people working in the space are ideal (warmth over architecture-only)
- **Fallback while waiting**: gradient placeholder per the mockup. The card label says *"Foto em breve"* until Vila Flores delivers.

## What we DO NOT do for `bioswales.jpg` replacement

The "Bioretention Rain Garden, Portland USA" entry is clearly wrong context (the whole intervention library is meant to be Brazilian-grounded). We replace with one of:

- **Recife rain-garden pilot** ([UFPE study](http://www.scielo.br/j/ac/a/3mKRyFjSkPdBkhdvyVGZZLL/?lang=pt)) — academic publication, may need permission from authors
- **São Paulo municipal jardins de chuva program** — multiple bairros documented; check Prefeitura de SP photo gallery
- **Fortaleza tropical rain garden pilot** ([ResearchGate paper](https://www.researchgate.net/publication/387488450)) — also research-based

**Recommended path**: contact UFPE researchers or São Paulo prefeitura via direct outreach; explain the use case (community education platform); request a verified-attribution photo.

Until a Brazilian-grounded photo is sourced, the bioswales card should use the gradient + emoji placeholder pattern (per the E2 mockup), not the current Portland JPG.

## Process for adding new photos

1. **Identify** the project (specific named place, not a category).
2. **Search**: Wikimedia Commons → category → file pages. If not found there: Prefeitura site → photo gallery. If not found there: partner org → direct ask.
3. **Verify** the photo visually represents the named project (e.g. Parque Barigui photos should show the actual park, ideally with recognizable landmarks).
4. **Download** to `client/public/assets/<category>/<filename>.jpg`. Compress to ~80 KB max (web-ready).
5. **Register** in this doc's manifest block (below) + update the `caseStudies[]` entry in `shared/cbo-schema.ts` if applicable.
6. **Commit** the file + manifest update in the same PR.

## Photo manifest (canonical list — update as photos are added)

```yaml
# As of 2026-05-15, all entries below are PROPOSED. Existing JPGs in
# client/public/assets/interventions/ have NOT yet been verified or replaced.
# This manifest tracks the intended state — actual files need to be downloaded
# and audited in a follow-up commit.

interventions:
  - file: client/public/assets/interventions/flood-parks.jpg
    project: Parque Barigui
    city: Curitiba, PR
    source: Wikimedia Commons
    source_url: https://commons.wikimedia.org/wiki/File:Parque_Barigui_-_Curitiba_DSC04494.JPG
    photographer: Agrinaldo Caires Fonseca
    license: CC-BY-SA-3.0
    status: proposed
    verified_at: null

  - file: client/public/assets/interventions/wetland-restoration.jpg
    project: Parque Primeiro de Maio (DRENURBS)
    city: Belo Horizonte, MG
    source: Wikimedia Commons
    source_url: https://commons.wikimedia.org/wiki/File:Parque_Primeiro_de_Maio_01.JPG
    license: CC-BY-SA (verify on file page)
    status: proposed
    verified_at: null

  - file: client/public/assets/interventions/urban-forests.jpg
    project: Rua Gonçalo de Carvalho (Túnel Verde)
    city: Porto Alegre, RS
    source: Wikipedia (multiple photos linked from article)
    source_url: https://pt.wikipedia.org/wiki/Rua_Gon%C3%A7alo_de_Carvalho
    license: varies per file — must pick CC-BY/PD
    status: needs_visual_check
    verified_at: null

  - file: client/public/assets/interventions/green-corridors.jpg
    project: Parque Capibaribe
    city: Recife, PE
    source: Prefeitura do Recife (request reuse) OR Wikimedia (no canonical found)
    source_url: http://meioambiente.recife.pe.gov.br/parque-capibaribe
    license: needs_permission
    status: needs_outreach
    verified_at: null

  - file: client/public/assets/interventions/green-roofs.jpg
    project: Fundação Cásper Líbero (telhado verde 900 Av. Paulista)
    city: São Paulo, SP
    source: Eccaplan article (need direct photographer source)
    source_url: https://eccaplan.com.br/conheca-o-primeiro-telhado-verde-da-avenida-paulista-em-sao-paulo/
    license: needs_permission
    status: needs_outreach
    verified_at: null

  - file: client/public/assets/interventions/bioswales.jpg
    project: NEEDS_REPLACEMENT — currently labeled Portland USA
    city: TBD (Brazilian city)
    candidates:
      - Recife rain-garden pilot (UFPE / scielo.br)
      - São Paulo jardins de chuva municipal program
      - Fortaleza tropical rain garden pilot (ResearchGate)
    status: blocked_pending_replacement
    verified_at: null

nbs_showcase_e2:
  - id: curitiba-barigui
    project: Parques do Barigui
    city: Curitiba, PR
    file: client/public/assets/nbs/showcase/curitiba-barigui.jpg
    source: Wikimedia Commons
    source_url: https://commons.wikimedia.org/wiki/File:Parque_Barigui_-_Curitiba_DSC04494.JPG
    photographer: Agrinaldo Caires Fonseca
    license: CC-BY-SA-3.0
    status: proposed

  - id: sao-paulo-tiete
    project: Parque Ecológico do Tietê
    city: São Paulo, SP
    file: client/public/assets/nbs/showcase/sao-paulo-tiete.jpg
    source: Wikimedia Commons
    source_url: https://commons.wikimedia.org/wiki/Category:Parque_Ecol%C3%B3gico_do_Tiet%C3%AA
    license: varies per file (pick CC-BY/PD)
    status: proposed_pending_file_selection

  - id: vila-flores-varzea
    project: Várzea Lab · Vila Flores
    city: Porto Alegre, RS
    file: client/public/assets/nbs/showcase/vila-flores-varzea.jpg
    source: Direct from Vila Flores (contato@vilaflores.org)
    license: direct_permission
    status: pending_outreach
    notes: |
      Photo of courtyard, rain garden, or community workshop. Warmth over
      architecture. Antônia / Julia can provide.
```

## Open action items

Before pilot launch (June 11):

1. **Visually audit** the 5 "needs_visual_check" interventions JPGs. Anything that doesn't clearly represent the named project gets replaced.
2. **Replace** `bioswales.jpg` with a Brazilian rain-garden case.
3. **Source the 3 E2 showcase cards** — Wikimedia for #1-2 is straightforward; reach out to Vila Flores for #3.
4. **Outreach** for Prefeitura do Recife (Parque Capibaribe) + Eccaplan/Cásper Líbero (telhado verde) reuse permissions.
5. **Add `photoSource`, `photoLicense`, `photoVerifiedAt` fields** to the case-study schema for machine-readable provenance, if not already present.

## A word on tooling

A tiny audit script could check that every photo referenced in `cbo-schema.ts` exists, has a non-null `photoCredit`, and matches an entry in this manifest. Worth ~30 lines of TypeScript if we end up adding photos faster than humans can review.
