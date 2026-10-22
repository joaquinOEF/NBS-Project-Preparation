// ---------------------------------------------------------------------------
// Names the model invented before `routeModelWrite` (shared/field-destiny.ts)
// kept invented names out of the built sections.
//
// Seven real organisations still carry them, and the Perfil printed each one as
// its humanised key — "heat hazard score", "solution types", "design authors"
// (Aline, 22 Oct 2026: Conceito Arte's profile "still contains text in
// English"). The same names reached the notes as line prefixes ("Local gov
// contact:", "Biovaleta hardest:"), because a rerouted write is saved as
// `<Readable name>: <value>`.
//
// Real organisations will not redo their encontros, so the fix reads the
// records as they are: every name found on the prod records of 22 Oct gets its
// Portuguese here. A name that is ALSO a reading of ours (a hazard score) is
// not labelled — the Perfil never prints it (shared/org-profile.ts).
// ---------------------------------------------------------------------------

export const LEGACY_FIELD_LABELS: Record<string, { pt: string; en: string }> = {
  // ── fields in the built sections ──────────────────────────────────────────
  intervention_role: { pt: 'Papel na intervenção', en: 'Role in the intervention' },
  intervention_roles: { pt: 'Papéis na intervenção', en: 'Roles in the intervention' },
  intervention_roles_confirmed: { pt: 'Papéis confirmados', en: 'Roles confirmed' },
  selected_familias: { pt: 'Famílias de soluções escolhidas', en: 'Solution families chosen' },
  biggest_challenge: { pt: 'Maior desafio', en: 'Biggest challenge' },
  horta_water_source: { pt: 'Fonte de água da horta', en: 'Garden water source' },
  nbs_experience_specific: { pt: 'Experiência com soluções baseadas na natureza', en: 'Experience with nature-based solutions' },
  horta_construction_and_maintenance: { pt: 'Construção e manutenção da horta', en: 'Garden construction and upkeep' },
  hazard_flood_local: { pt: 'Alagamento no local', en: 'Flooding on site' },
  hazard_landslide_local: { pt: 'Deslizamento no local', en: 'Landslides on site' },
  site_water_behavior: { pt: 'Como a água se comporta no lugar', en: 'How water behaves on site' },
  wastewater_system_idea: { pt: 'Ideia para o tratamento de esgoto', en: 'Wastewater treatment idea' },
  wastewater_system_type: { pt: 'Tipo de sistema de esgoto', en: 'Wastewater system type' },
  wastewater_expert_engagement: { pt: 'Apoio técnico para o esgoto', en: 'Expert support on wastewater' },
  intervention_families_interest: { pt: 'Famílias de soluções de interesse', en: 'Solution families of interest' },
  intervention_families_interest_final: { pt: 'Famílias de soluções de interesse (final)', en: 'Solution families of interest (final)' },
  org_role_type: { pt: 'Tipo de papel da organização', en: "Organisation's type of role" },
  org_role: { pt: 'Papel da organização', en: "Organisation's role" },
  flood_photo: { pt: 'Foto de alagamento', en: 'Flood photo' },
  flood_photo_2: { pt: 'Foto de alagamento (2)', en: 'Flood photo (2)' },
  photo_drive_link: { pt: 'Link das fotos', en: 'Photo link' },
  budget_detail: { pt: 'Detalhe do orçamento', en: 'Budget detail' },
  budget_bacia_retencao: { pt: 'Orçamento da bacia de retenção', en: 'Retention basin budget' },
  budget_jardim_chuva_m2: { pt: 'Custo do jardim de chuva por m²', en: 'Rain garden cost per m²' },
  banco_floreira_custo_m2: { pt: 'Banco-floreira: custo por m²', en: 'Planter bench: cost per m²' },
  banco_floreira_formacao: { pt: 'Banco-floreira: formação', en: 'Planter bench: training' },
  banco_floreira_orcamento: { pt: 'Banco-floreira: orçamento', en: 'Planter bench: budget' },
  site_budget_brl: { pt: 'Orçamento do lugar (R$)', en: 'Site budget (BRL)' },
  design_sponsor: { pt: 'Apoio ao projeto', en: 'Design sponsor' },
  design_sponsor_2: { pt: 'Apoio ao projeto (2)', en: 'Design sponsor (2)' },
  design_date: { pt: 'Data do projeto', en: 'Design date' },
  design_firm: { pt: 'Escritório do projeto', en: 'Design firm' },
  design_phase: { pt: 'Fase do projeto', en: 'Design phase' },
  design_scale: { pt: 'Escala do projeto', en: 'Design scale' },
  design_authors: { pt: 'Autoria do projeto', en: 'Design authors' },
  volunteer_hours: { pt: 'Horas de voluntariado', en: 'Volunteer hours' },
  formacao_prevista: { pt: 'Formação prevista', en: 'Planned training' },
  academic_reference: { pt: 'Referência acadêmica', en: 'Academic reference' },
  technical_drawings: { pt: 'Desenhos técnicos', en: 'Technical drawings' },
  technical_proposal: { pt: 'Proposta técnica', en: 'Technical proposal' },
  project_documentation: { pt: 'Documentação do projeto', en: 'Project documentation' },
  nota_drenagem: { pt: 'Nota sobre a drenagem', en: 'Drainage note' },
  site_elements: { pt: 'Elementos do lugar', en: 'Site elements' },
  bacia_retencao_area_m2: { pt: 'Área da bacia de retenção (m²)', en: 'Retention basin area (m²)' },
  jardins_filtrantes_area_m2: { pt: 'Área dos jardins filtrantes (m²)', en: 'Filtering gardens area (m²)' },
  solution_types: { pt: 'Tipos de solução', en: 'Solution types' },
  solution_description: { pt: 'Descrição da solução', en: 'Solution description' },
  team_financing: { pt: 'Financiamento da equipe', en: 'Team financing' },
  community_led_scaling: { pt: 'Ampliação puxada pela comunidade', en: 'Community-led scaling' },
  // ── names that reached the notes as "<Name>: …" ───────────────────────────
  selected_solutions: { pt: 'Soluções escolhidas', en: 'Solutions chosen' },
  solution_groups: { pt: 'Grupos de soluções', en: 'Solution groups' },
  solution_labels: { pt: 'Soluções', en: 'Solutions' },
  local_gov_contact: { pt: 'Contato com o poder público local', en: 'Local government contact' },
  local_gov_contact_status: { pt: 'Situação do contato com o poder público', en: 'Local government contact status' },
  priority_weight: { pt: 'O que pesa mais', en: 'What weighs most' },
  solar_heater_use: { pt: 'Uso do aquecedor solar', en: 'Solar heater use' },
  first_solution_to_test: { pt: 'Primeira solução a testar', en: 'First solution to test' },
  solution_verdict_overall: { pt: 'Avaliação geral das soluções', en: 'Overall view of the solutions' },
  site_type_user: { pt: 'Tipo de lugar (nas palavras da organização)', en: "Type of place (the organisation's words)" },
  land_tenure_notes: { pt: 'Observações sobre a posse do terreno', en: 'Land tenure notes' },
  site_worry_other: { pt: 'Outra preocupação com o lugar', en: 'Other concern about the place' },
  wastewater_approach: { pt: 'Abordagem para o esgoto', en: 'Wastewater approach' },
  wastewater_source: { pt: 'Origem do esgoto', en: 'Wastewater source' },
  wastewater_treatment_idea: { pt: 'Ideia para o tratamento de esgoto', en: 'Wastewater treatment idea' },
  site_scope: { pt: 'Abrangência do lugar', en: 'Site scope' },
  recommended_familias_confirmed: { pt: 'Famílias recomendadas confirmadas', en: 'Recommended families confirmed' },
  familias_confirmation_note: { pt: 'Observação sobre as famílias', en: 'Note on the families' },
  familia_interest_first: { pt: 'Primeira família de interesse', en: 'First family of interest' },
  familias_interesse: { pt: 'Famílias de interesse', en: 'Families of interest' },
  desired_role: { pt: 'Papel desejado', en: 'Desired role' },
  site_area_approx: { pt: 'Área aproximada do lugar', en: 'Approximate site area' },
  energia_solar: { pt: 'Energia solar', en: 'Solar energy' },
  interesse_em_energia_solar: { pt: 'Interesse em energia solar', en: 'Interest in solar energy' },
  quem_cozinha: { pt: 'Quem cozinha', en: 'Who cooks' },
  cozinha_atual: { pt: 'Cozinha atual', en: 'Current kitchen' },
};

/**
 * Per-solution names the model made up in Encontro 3: `<solution>_verdict`,
 * `<solution>_who_builds`, `<solution>_hardest`. The solution's own name comes
 * from the catalog at the call site.
 */
export const PER_SOLUTION_SUFFIX: Array<{ suffix: string; pt: string; en: string }> = [
  { suffix: 'who_builds', pt: 'quem faria', en: 'who would do it' },
  { suffix: 'hardest', pt: 'o que mais pega', en: 'what is hardest' },
  { suffix: 'verdict', pt: 'reação', en: 'reaction' },
];
