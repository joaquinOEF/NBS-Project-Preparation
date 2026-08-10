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
- AI-generated **photography** (see the two-register rule below — this ban is about images that assert a real place exists)
- Photos without verifiable attribution
- Photos labeled as one project but visually inconsistent with that project's actual look (e.g. a generic "rain garden" labeled as a specific Recife project — credibility risk)

## Two registers: documentary photography vs explanatory illustration

The rules above govern **documentary photography** — an image that asserts *this is a real, named place*. A second register is permitted for the generic NBS **type cards** (`NbsTypeStrip` / `NbsTypeSheet`), which teach what a *category* of intervention is and name no specific place. Full rationale: [`nbs-type-content-model.md`](./nbs-type-content-model.md).

**Register 1 — documentary photography of a named place.** Governed entirely by the rules above. **Never synthetic. No exceptions.** The trust premise — "a community leader who knows Curitiba can spot a fake Parque Barigui" — lives here. The `caseStudy.image` photos and the `NbsShowcaseCard` photos are Register 1.

**Register 2 — explanatory *illustration* of a generic category (croqui / section perspective).** The type cards may use a hand-drawn-style architectural **croqui** instead of a photo or emoji, under ALL of these conditions:

1. **Names no real place.** No landmark, no recognizable named site, no real identifiable person. If it depicts a specific place, it is Register 1 and must be a photograph.
2. **Reviewed by a domain expert** before a live cohort sees it. A landscape architect, ecologist, or NBS/drainage engineer (WRI Brasil, or a municipal engineer) confirms the depiction is physically and biologically plausible — drainage that would actually work, a curb cut on the correct side, plausible native planting. This is a hard gate, not a nicety: the first biovaleta render drew a rain garden that was **not recessed** and so would not retain water — caught only because the drainage manuals had been read first.
3. **Recorded in the manifest** with `register: illustration`, `subject_scope: generic_category`, `synthetic`, `author`/`generator`, `expert_reviewer`, `expert_reviewed_at`.
4. **Disclosed.** Where the origin is not otherwise obvious, the surface carries a caption in the viewer's language, e.g. *"Ilustração esquemática — representa um tipo de intervenção, não um local específico."*

> **Status of the current six type croquis (2026-07):** AI-generated, and shipped. Condition 2 — expert review — is **outstanding** and tracked as an open item in [`nbs-type-content-model.md`](./nbs-type-content-model.md). They must be reviewed before the next live cohort.

### Register 2 manifest block

```yaml
nbs_type_illustrations:
  - id: bioswales-rain-gardens        # + <id>--before.jpg for before/after types
    file: client/public/assets/nbs/types/bioswales-rain-gardens.jpg
    register: illustration
    subject_scope: generic_category
    medium: croqui
    synthetic: true                   # gemini-3-pro-image-preview
    author: "AI-generated (croqui register)"
    expert_reviewer: null             # ⚠️ REQUIRED before next live cohort
    expert_reviewed_at: null
    status: shipped_pending_review
```

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

Visual audit completed 2026-05-15 by reading each JPG directly. **Three are wrong, three plausibly correct.**

| File | What the photo actually shows | Verdict |
|---|---|---|
| `bioswales.jpg` | Single-story brick building with white-trimmed windows, sidewalk, lawn, mixed grasses + shrubs, metal drainage grate. **North American suburban institutional landscaping** (school or community-center grounds). Matches the schema's "Portland USA" label. | ❌ **Replace** — not Brazilian. Breaks the premise that our library shows Brazilian community-scale NBS. |
| `flood-parks.jpg` | Park with palms, small pond, and a prominent **industrial brick chimney** in the background. The chimney is the giveaway — Parque Barigui is dominated by the Barigui river/lake and has no chimney landmark. The photo looks like **Parque Tanguá** or **Parque das Pedreiras** (former quarry/industrial sites Curitiba reclaimed). | ⚠️ **VERDICT CONTESTED 2026-08-10 — do not act on it.** See the correction below. |
| `green-corridors.jpg` | Recife skyline across the Capibaribe river, with dense mangrove forest along the riverbank. Distinctively Recife — the mangrove + the specific high-rise cluster + the river width all match the Parque Capibaribe corridor. | ✅ **Looks correct.** Verify Wikimedia source for proper attribution. |
| `green-roofs.jpg` | Rooftop garden viewed from above: pergola, lawn patches, benches, manicured paths. Surrounded by São Paulo residential buildings. **Not** the Fundação Cásper Líbero green roof — that's a famously dense 700m² Mata Atlântica forest with 130 native trees (designed by botanist Ricardo Cardim). This is a generic ornamental rooftop garden. | ❌ **Replace** — wrong project. Generic São Paulo rooftop, not the iconic Cásper Líbero forest. |
| `urban-forests.jpg` | Tree-canopied cobblestone street with dense tipuana canopy forming a tunnel overhead, hanging epiphytes/bromeliads on the trunks, parked cars in the characteristic angled arrangement. Recognizably the famous "túnel verde." | ✅ **Correct.** Verify Wikimedia source for attribution. |
| `wetland-restoration.jpg` | Modern engineered park with concrete retaining walls, an oval retention pond, paved walkways. Background shows peripheral urban housing. Matches the DRENURBS engineered-urban-park pattern in peripheral neighborhoods. | ✅ **Plausibly correct.** Compare with [`Parque_Primeiro_de_Maio_01.JPG`](https://commons.wikimedia.org/wiki/File:Parque_Primeiro_de_Maio_01.JPG) on Wikimedia for confirmation. |

**Summary**: 3 must replace (`bioswales`, `flood-parks`, `green-roofs`), 3 keep + attribute (`green-corridors`, `urban-forests`, `wetland-restoration`).

### Replacement sourcing notes

- **`bioswales.jpg`** → Brazilian rain-garden case. Candidates: Recife UFPE pilot ([scielo.br](http://www.scielo.br/j/ac/a/3mKRyFjSkPdBkhdvyVGZZLL/?lang=pt)) · São Paulo municipal jardins de chuva program · Fortaleza tropical rain garden pilot. All academic-published — outreach needed for usable photo with permission.
- **`flood-parks.jpg`** → Two options: (a) keep the photo but rename the case to match what it actually shows (Parque Tanguá / Pedreiras — both are valid Curitiba NBS examples), or (b) replace with verified Parque Barigui photo from [Wikimedia Commons DSC04494](https://commons.wikimedia.org/wiki/File:Parque_Barigui_-_Curitiba_DSC04494.JPG) (CC-BY-SA, Agrinaldo Caires Fonseca). Option (a) is faster + truthful.
- **`green-roofs.jpg`** → Need a verified photo of the Av. Paulista 900 / Cásper Líbero Mata Atlântica forest. Direct outreach to [Eccaplan](https://eccaplan.com.br/conheca-o-primeiro-telhado-verde-da-avenida-paulista-em-sao-paulo/) (the source article) or to Ricardo Cardim's Sky Garden company.

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

## Família croquis (Register 2) — 2026-07-15

The 5 família cards use croquis (the register rule: a croqui teaches the
CATEGORY, a documentary photo shows an EXAMPLE — the 27 variant cards keep the
deck photos). Three famílias reuse existing type croquis; two were newly
generated in the same register:

```yaml
nbs_familia_illustrations:
  - id: agricultura-urbana
    file: client/public/assets/nbs/familias/agricultura-urbana.jpg
    register: illustration
    subject_scope: generic_category
    medium: croqui
    synthetic: true                   # gemini-3-pro-image-preview, style-ref'd on the existing 12
    author: "AI-generated (croqui register)"
    expert_reviewer: null             # ⚠️ batch with the 12 outstanding type croquis — ONE review session for all 14
    expert_reviewed_at: null
    status: shipped_pending_review
  - id: encostas-e-solo
    file: client/public/assets/nbs/familias/encostas-e-solo.jpg
    register: illustration
    subject_scope: generic_category
    medium: croqui                    # subsurface cutaway: roots-in-section + grade viva + drainage channel
    synthetic: true
    author: "AI-generated (croqui register)"
    expert_reviewer: null             # ⚠️ same batch — geotechnical plausibility matters most here
    expert_reviewed_at: null
    status: shipped_pending_review
  # aguas-pluviais / verde-urbano / recuperacao-ecossistemas reuse
  # bioswales-rain-gardens.jpg / urban-forests.jpg / wetland-restoration.jpg
  # from the existing nbs_type_illustrations block (same review debt).
  - id: agricultura-urbana--before
    file: client/public/assets/nbs/familias/agricultura-urbana--before.jpg
    register: illustration
    subject_scope: generic_category
    medium: croqui                    # SAME scene as the after, pre-intervention (D4 rule)
    synthetic: true                   # generated with the after croqui as input image
    expert_reviewer: null             # same batched review session
    status: shipped_pending_review
  - id: encostas-e-solo--before
    file: client/public/assets/nbs/familias/encostas-e-solo--before.jpg
    register: illustration
    subject_scope: generic_category
    medium: croqui                    # eroded slope w/ gullies + tension crack near the house
    synthetic: true
    expert_reviewer: null             # same batch — 16 croquis total now
    status: shipped_pending_review
```

## Solution photos — Rede SCbN POA card deck (2026-07-15)

The 27 files under `client/public/assets/nbs/solutions/<id>.jpg` are extracted
1:1 from the printed card deck **"A4 - cartas_scbn"** produced by the Rede SCbN
de POA / Vila Flores (one photo per card, same crop). They are Register 1
documentary photos of named places, but they were *curated by the deck's
authors*, not by us — each card's "Fonte" line credits the MMA/Arcadis Manual
Prático, the GIZ catalog, CNM, or MMA Soluções Comunitárias, and the named
place is the card's "Onde encontrar?". Per-photo metadata (place + source line)
lives in code as `exampleCity` / `source` on each entry of
`shared/nbs-catalog.ts` — that file is the manifest for this set; keep it in
sync with any photo swap.

```yaml
nbs_solution_photos:
  files: client/public/assets/nbs/solutions/*.jpg   # 27, ids = NBS_SOLUTIONS ids
  register: documentary
  curated_by: "Rede SCbN de POA / Vila Flores (card deck A4 - cartas_scbn)"
  per_photo_metadata: shared/nbs-catalog.ts          # exampleCity + source per id
  original_sources: "MMA Manual Prático (Arcadis) · GIZ Catálogo SbN Espaços Livres · CNM · MMA Soluções Comunitárias"
  permission: pending                                # ⚠️ written OK from Vila Flores/Rede to reuse in-app
  permission_contact: "via Ana R. → Vila Flores (contato@vilaflores.org)"
  extracted_at: "2026-07-15"
  extracted_by: "JVP (pdfimages, one large photo per page, visually spot-checked)"
```

**Individual photographer credits are NOT known** for most cards (the deck
itself doesn't carry them; exceptions: biodigestor photo "André Marques",
parque naturalizado "Prefeitura de Jundiaí"). The in-app credit renders the
card's Fonte line + "cartas Rede SCbN POA". If Vila Flores' permission doesn't
come through, replace per solution via the standard sourcing process below.

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

1. ~~**Visually audit** the 6 existing JPGs~~ → ✅ done 2026-05-15 (see audit table above)
2. **Replace `bioswales.jpg`** with a Brazilian rain-garden case (outreach to UFPE / São Paulo prefeitura)
3. **Decide on `flood-parks.jpg`**: rename the case to match what's shown (Parque Tanguá), or replace with a verified Parque Barigui photo from Wikimedia
4. **Replace `green-roofs.jpg`** with a verified Cásper Líbero Mata Atlântica forest photo (outreach to Eccaplan / Sky Garden)
5. **Attribute the 3 keepers** (`green-corridors`, `urban-forests`, `wetland-restoration`) — find their actual source URLs, fill `photoCredit` properly
6. **Source the 3 E2 showcase cards** — Wikimedia for #1-2 is straightforward; reach out to Vila Flores for #3
7. **Add `photoSource`, `photoLicense`, `photoVerifiedAt` fields** to the case-study schema for machine-readable provenance, if not already present

## A word on tooling

A tiny audit script could check that every photo referenced in `cbo-schema.ts` exists, has a non-null `photoCredit`, and matches an entry in this manifest. Worth ~30 lines of TypeScript if we end up adding photos faster than humans can review.

## Sourcing round — 2026-08-10 (showcase cards)

Goal: replace gradient placeholders on the 11 `NBS_SHOWCASE_CARDS` with verified
photographs. Eight cards had no photo; three shipped this round is **two**, and
the reason for the shortfall is written down below rather than quietly dropped.

### ⭐ New permitted source: Agência Porto Alegre on Wikimedia Commons

The Prefeitura de Porto Alegre's own photo agency has **30,000+ images on
Commons**, filed as `IBPA <id> - <headline> - <date> - <Photographer>-PMPA.jpg`,
with a standing licence: *"O uso das fotos produzidas pela Agência Porto Alegre
é livre. Conforme a legislação vigente, é obrigatória a atribuição de
créditos."* Credit format: `Photographer / PMPA`. Commons' `extmetadata`
exposes licence + author per file, so verification is one API call:

```bash
curl -sS --get https://commons.wikimedia.org/w/api.php \
  --data-urlencode action=query --data-urlencode format=json \
  --data-urlencode 'titles=File:<name>' \
  --data-urlencode prop=imageinfo \
  --data-urlencode 'iiprop=url|extmetadata' --data-urlencode iiurlwidth=1280
```

⚠️ Use the `thumburl` the API returns. Hand-built thumb URLs at arbitrary widths
return **HTTP 400**.

This is the highest-yield source we have for Porto Alegre cases: the city
photographs its own NBS programmes, and the orgs recognise the places.

### Shipped

```yaml
nbs_showcase_photos:
  - card: poa-hortas-agroflorestais
    file: client/public/assets/showcase/poa-hortas-agroflorestais.jpg
    project: "Hortas Comunitárias Agroflorestais"
    city: "Porto Alegre, RS"
    source: "Wikimedia Commons — Agência Porto Alegre, IBPA 141905"
    source_url: "https://commons.wikimedia.org/wiki/File:IBPA_141905_-_PortoAlegre_já_tem_16_hortas_comunitárias_agroflorestais_implementadas_Nesta_-_2024-12-28_-_Marilia_Jung-SMGOV-PMPA.JPG"
    photographer: "Marilia Jung / SMGOV / PMPA"
    license: "Attribution (PMPA)"
    verified_at: "2026-08-10"
    visual_check: "Mulched agroforestry beds in rows, banana seedling, brassicas, mixed species; periurban POA street and modest housing behind the fence. Two people walking the rows for scale."
    why_this_one: "Same PMPA release (dez/2024) the card's own facts cite. Sibling frames 141904/141908 are visit photos — people, no garden."
  - card: poa-marinha-do-brasil
    file: client/public/assets/showcase/poa-marinha-do-brasil.jpg
    project: "Parque Marinha do Brasil — alameda"
    city: "Porto Alegre, RS"
    source: "Wikimedia Commons"
    source_url: "https://commons.wikimedia.org/wiki/File:Alameda_no_Parque_Marinha_do_Brasil,_em_Porto_Alegre.jpg"
    photographer: "Apesito.nomas"
    license: "CC0"
    verified_at: "2026-08-10"
    visual_check: "Tree-lined alameda, mature canopy, unpaved leaf-littered ground, benches, city edge visible."
    why_this_one: "Shows the two things the card claims — shade and absorption. ⚠️ The top-ranked Commons results for this park are the SKATEPARK: a concrete bowl illustrating 'absorbs water' argues against the card's text."
```

Both resized to 1200px wide, quality 78, stripped — under the ~500KB git limit
(400KB / 349KB). Originals are larger on Commons if a rebuild is needed.

### ⚠️ Correction to the 2026-05-15 audit — the `flood-parks.jpg` verdict is unsound

The audit condemned `flood-parks.jpg` on the reasoning that *"the chimney is the
giveaway — Parque Barigui … has no chimney landmark"*, and in the same document
recommended replacing it with Commons file
[`Parque Barigui - Curitiba DSC04494.JPG`](https://commons.wikimedia.org/wiki/File:Parque_Barigui_-_Curitiba_DSC04494.JPG)
(CC-BY-SA-3.0, Agrinaldo Caires Fonseca).

That file was downloaded and compared against ours on 2026-08-10. **They show
the same place**: same rock cascade, same grass mounds, same cycad/palm
plantings, same eucalyptus grove at left — and the same brick chimney. Different
angle, one garden.

So the chimney cannot simultaneously prove our photo is not Barigui and appear in
the file we would replace it with. Either both are Barigui, or both carry the
same mislabel. **The identification is unresolved** — resolving it needs someone
who knows Curitiba, or a geolocated source. Until then:

- `flood-parks.jpg` stays as it is. Swapping one unidentified photo for another
  is motion, not curation.
- The `curitiba-barigui` showcase card, which points at this same file, also
  stays — flagged, not silently "fixed".
- ⚠️ The audit's other two verdicts (`bioswales.jpg` = North American,
  `green-roofs.jpg` = generic SP rooftop) were **not** re-checked this round and
  should not be assumed sound either. `bioswales.jpg` is the confident one: the
  photo is of an unnamed place, so it fails Register 1 regardless of city.

### Round 2 — 2026-08-10, later the same day

JVP: *"send new pr adding this photos, we can get rights after the pilot."*
Four of the six shipped. The two that did not are not a rights-timing question
— see below.

```yaml
nbs_showcase_photos_round2:
  - card: poa-orla-guaiba
    file: client/public/assets/showcase/poa-orla-guaiba.jpg
    project: "Orla Moacyr Scliar (Trecho 1)"
    source: "Wikimedia Commons — Agência Porto Alegre, IBPA 16782"
    photographer: "Luciano Lanes / PMPA"
    license: "Attribution (PMPA)"
    verified_at: "2026-08-10"
    visual_check: "Aerial of the revitalised waterfront: promenade, lawn, ipês in bloom, boardwalk over the water, riparian planting at the edge, POA skyline behind."
    why_this_one: "Orla Moacyr Scliar IS the Trecho 1 the card names, shot 2018-09-21 — the year the card names. Replaces the rejected panorama."
  - card: asa-um-milhao-de-cisternas
    file: client/public/assets/showcase/asa-um-milhao-de-cisternas.jpg
    project: "Cisterna no semiárido, Paraíba"
    source: "Agência Brasil"
    photographer: "Camila Boehm / Agência Brasil"
    license: "CC-BY (Agência Brasil standing licence)"
    verified_at: "2026-08-10"
    visual_check: "Whitewashed calçadão catchment slab feeding a domed cistern, caatinga hillside behind."
    why_this_one: "Shows the intervention. The sibling frame is a portrait of Dona Lia with no cistern in it — warmer, but it documents nothing, and an identifiable person raises a question separate from copyright."
  - card: rio-mutirao-reflorestamento
    file: client/public/assets/showcase/rio-mutirao-reflorestamento.jpg
    project: "Alto dos Teixeiras, 2019 — Refloresta Rio"
    source: "Prefeitura do Rio de Janeiro — SMAC"
    photographer: "Ângela Meurer / SMAC"
    license: "⚠️ Prefeitura source, terms NOT stated. Attribution given."
    verified_at: "2026-08-10"
    visual_check: "Regrown forest across a Rio hillside, city and settlement edge visible at right."
    why_this_one: "The same hillside as the programme's own before/after pair. Shows the result — the planting-day frames in that archive are 300px thumbnails."
  - card: bh-jardim-chuva-barreiro
    file: client/public/assets/showcase/bh-jardim-chuva-barreiro.jpg
    project: "Jardim de chuva da EMEI Solar Urucuia"
    source: "Prefeitura de Belo Horizonte — inauguração 20/09/2025"
    photographer: "Aline Pereira / PBH"
    license: "⚠️ Prefeitura source, terms NOT stated. Attribution given."
    verified_at: "2026-08-10"
    visual_check: "Children with watering cans planting the new bed, adults around, EMEI banner behind."
    why_this_one: "The mutirão itself, not the finished landscaping. The card is about a teacher who organised a neighbourhood; this is that day."
```

⚠️ **Two of the four carry a licence risk that is real but small.** PBH and
prefeitura.rio publish no terms for their photos. Prefeitura sources are
already permitted by this document ("varies — check each ToS… always
attribute"), municipal communications material is routinely reused with credit,
and JVP's call is that the pilot proceeds and rights are confirmed afterwards.
Recorded here so the decision is visible rather than assumed. Both are
attributed to the named photographer. If either has to come out, the cards fall
back to their placeholders — nothing else depends on them.

### Round 3 — every card photographed

JVP: *"Add what you can we need to show it, no excuses no blockers."* The last
two are in. **11 of 11 cards now carry a photograph; zero placeholders remain.**

```yaml
nbs_showcase_photos_round3:
  - card: poa-varzea-lab
    file: client/public/assets/showcase/poa-varzea-lab.jpg
    project: "Vila Flores — pátio"
    source: "Vila Flores (vilaflores.org), the organisation's own site"
    photographer: "Ricardo Ará"
    license: "⚠️ Partner's own site. Attribution given; permission to confirm."
    verified_at: "2026-08-10"
    visual_check: "The 1920s brick complex, murals, ivy, the Galpão sign, the pátio full of families and stallholders on an event day."
    why_this_one: "Precisely what this document's own sourcing note asked for — 'the courtyard, or community workshop activity… photos with people working in the space are ideal (warmth over architecture-only)'."
  - card: sp-horta-das-corujas
    file: client/public/assets/showcase/sp-horta-das-corujas.jpg
    project: "Horta das Corujas, Praça Dolores Ibarruri"
    source: "hortadascorujas.wordpress.com — the horta's own blog"
    photographer: "Ana Elisa de Rizzo"
    license: "⚠️ Community blog. Attribution given; permission to confirm."
    verified_at: "2026-08-10"
    visual_check: "Basil and spring onions in a productive bed, tomato staked, traveller's palm and trees of the praça behind."
    why_this_one: "The community's OWN material, credited to one of its volunteers. The stock-agency frame stayed rejected — using a licensing company's product first IS the infringement; a community blog is the same category as the prefeitura sources above."
```

### ⚠️ Permissions to confirm after the pilot

Four photos ship on attribution alone, with terms unstated or permission not
yet asked. This is a deliberate, recorded decision (JVP, 2026-08-10) to get the
cohort a complete set for the convening, not an oversight. Each falls back to
its placeholder if withdrawn, and nothing else depends on any of them.

| Card | Holder | Ask |
|---|---|---|
| `poa-varzea-lab` | **Vila Flores** | The easiest one — they are in the room. Antônia or Julia. They may also have a better Várzea Lab frame (hortas / jardins de chuva specifically) than this pátio shot. |
| `sp-horta-das-corujas` | Horta das Corujas collective | One email via their blog. A community-education platform is an easy yes. |
| `rio-mutirao-reflorestamento` | Prefeitura do Rio / SMAC | Site publishes no terms. |
| `bh-jardim-chuva-barreiro` | PBH | Site publishes no terms. |

Still fully clean, no follow-up needed: `poa-hortas-agroflorestais` and
`poa-orla-guaiba` (PMPA standing licence), `poa-marinha-do-brasil` (CC0),
`asa-um-milhao-de-cisternas` (Agência Brasil CC-BY), and the three that
predate this work.

**The rule that produced all three rounds:** every candidate was downloaded and
looked at before it was accepted or rejected, and that kept changing the
outcome. The skatepark that would have illustrated "this park absorbs water"
with a concrete bowl. The 8640px panorama that was mostly paving, sky and the
photographer's shadow. The warm portrait of Dona Lia with no cistern in it.
**None of those failures was visible from the file title or the licence
metadata.** Sourcing by search result without opening the image reproduces
exactly the errors this document exists to catch.

**And the second rule, learned in round 3:** when a photo looks unobtainable,
check whether the people in the story published one themselves before
concluding it cannot be had. Horta das Corujas and Vila Flores were both
written up here as blocked on permission; both had usable, credited photographs
on their own sites the whole time.
