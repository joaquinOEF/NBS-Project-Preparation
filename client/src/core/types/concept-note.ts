import { ProjectContextData } from '@/core/contexts/project-context';

/**
 * GCF-style concept note structure.
 * Each section maps to a standard GCF concept note section.
 * Content is assembled from ProjectContextData across all modules.
 */
export interface ConceptNote {
  generatedAt: string;
  projectName: string;
  cityName: string;
  sections: {
    summary: ConceptNoteSection;
    contextBaseline: ConceptNoteSection;
    projectDescription: ConceptNoteSection;
    expectedResults: ConceptNoteSection;
    implementation: ConceptNoteSection;
    financing: ConceptNoteSection;
    evidenceBase: ConceptNoteSection;
  };
}

export interface ConceptNoteSection {
  title: string; // i18n key
  content: string[];
  hasData: boolean;
}

/**
 * Assembles a concept note from project context data.
 * Each section pulls from the relevant module outputs.
 */
export function assembleConceptNote(context: ProjectContextData | null): ConceptNote {
  const now = new Date().toISOString();
  const projectName = context?.projectName || 'Untitled Project';
  const cityName = context?.cityName || 'Unknown City';

  return {
    generatedAt: now,
    projectName,
    cityName,
    sections: {
      summary: buildSummary(context),
      contextBaseline: buildContextBaseline(context),
      projectDescription: buildProjectDescription(context),
      expectedResults: buildExpectedResults(context),
      implementation: buildImplementation(context),
      financing: buildFinancing(context),
      evidenceBase: buildEvidenceBase(context),
    },
  };
}

function buildSummary(ctx: ProjectContextData | null): ConceptNoteSection {
  const content: string[] = [];
  if (!ctx) return { title: 'sectionA', content, hasData: false };

  if (ctx.projectName) content.push(`Project: ${ctx.projectName}`);
  if (ctx.cityName) content.push(`Location: ${ctx.cityName} (${ctx.cityLocode})`);
  if (ctx.actionType) content.push(`Type: ${ctx.actionType}`);
  if (ctx.hazardFocus?.length) content.push(`Hazard Focus: ${ctx.hazardFocus.join(', ')}`);
  if (ctx.projectDescription) content.push(ctx.projectDescription);

  // Funder pathway info
  if (ctx.funderSelection?.pathway?.primary) {
    content.push(`Financing Pathway: ${ctx.funderSelection.pathway.primary.replace(/_/g, ' ')}`);
  }
  if (ctx.funderSelection?.fundingPlan?.selectedFunderNow) {
    const fundInfo = ctx.funderSelection.targetFunders?.find(t => t.fundId === ctx.funderSelection?.fundingPlan?.selectedFunderNow);
    content.push(`Preparation Fund: ${fundInfo?.fundName || ctx.funderSelection.fundingPlan.selectedFunderNow}`);
  }
  if (ctx.funderSelection?.fundingPlan?.selectedFunderNext) {
    const fundInfo = ctx.funderSelection.targetFunders?.find(t => t.fundId === ctx.funderSelection?.fundingPlan?.selectedFunderNext);
    content.push(`Target Funder: ${fundInfo?.fundName || ctx.funderSelection.fundingPlan.selectedFunderNext}`);
  }

  return { title: 'sectionA', content, hasData: content.length > 0 };
}

function buildContextBaseline(ctx: ProjectContextData | null): ConceptNoteSection {
  const content: string[] = [];
  if (!ctx) return { title: 'sectionB', content, hasData: false };

  // Climate risk data from site explorer
  if (ctx.siteExplorer?.hazardSummary) {
    const hs = ctx.siteExplorer.hazardSummary;
    const hazards: string[] = [];
    if (hs.floodCells > 0) hazards.push(`Flood (${hs.floodCells} cells)`);
    if (hs.heatCells > 0) hazards.push(`Heat (${hs.heatCells} cells)`);
    if (hs.landslideCells > 0) hazards.push(`Landslide (${hs.landslideCells} cells)`);
    if (hazards.length) content.push(`Climate Hazards Identified: ${hazards.join(', ')}`);
    content.push(`Total Analysis Area: ${hs.totalCells} grid cells`);
  }

  // Selected zones
  if (ctx.siteExplorer?.selectedZones?.length) {
    content.push(`Intervention Zones: ${ctx.siteExplorer.selectedZones.length} zones selected for NBS deployment`);
    ctx.siteExplorer.selectedZones.forEach(zone => {
      if (typeof zone !== 'string' && zone.zoneId) {
        const riskPct = zone.riskScore !== undefined ? ` (risk: ${(zone.riskScore * 100).toFixed(0)}%)` : '';
        const area = zone.area ? `, ${zone.area.toFixed(2)} km²` : '';
        content.push(`  - Zone ${zone.zoneId}: ${zone.hazardType}${riskPct}${area}`);
      }
    });
  }

  // Stakeholder context
  if (ctx.stakeholders?.length) {
    content.push(`Stakeholders: ${ctx.stakeholders.map(s => `${s.name} (${s.type})`).join(', ')}`);
  }

  return { title: 'sectionB', content, hasData: content.length > 0 };
}

function buildProjectDescription(ctx: ProjectContextData | null): ConceptNoteSection {
  const content: string[] = [];
  if (!ctx) return { title: 'sectionC', content, hasData: false };

  if (ctx.projectDescription) {
    content.push(ctx.projectDescription);
  }

  // Intervention types from zones
  if (ctx.siteExplorer?.selectedZones?.length) {
    const interventionTypes = new Set<string>();
    ctx.siteExplorer.selectedZones.forEach(zone => {
      if (typeof zone !== 'string' && zone.interventionType) {
        interventionTypes.add(zone.interventionType.replace(/_/g, ' '));
      }
    });
    if (interventionTypes.size > 0) {
      content.push(`NBS Interventions: ${Array.from(interventionTypes).join(', ')}`);
    }
  }

  // Sites
  if (ctx.sites?.length) {
    content.push('Project Sites:');
    ctx.sites.forEach(s => {
      content.push(`  - ${s.name}: ${s.hazardType} / ${s.interventionType}`);
    });
  }

  return { title: 'sectionC', content, hasData: content.length > 0 };
}

function buildExpectedResults(ctx: ProjectContextData | null): ConceptNoteSection {
  const content: string[] = [];
  if (!ctx) return { title: 'sectionD', content, hasData: false };

  if (!ctx.impactModel) return { title: 'sectionD', content, hasData: false };

  // Prefer quantified impacts when available
  const qi = ctx.impactModel.quantifiedImpacts;
  if (qi) {
    // Structured KPI data from quantify step
    if (qi.impactGroups?.length) {
      content.push('Quantified Impact KPIs:');
      for (const group of qi.impactGroups) {
        content.push(`  ${group.hazardType} — ${group.interventionBundle}:`);
        for (const kpi of group.kpis) {
          const range = `${kpi.valueRange.low}–${kpi.valueRange.high} ${kpi.unit}`;
          content.push(`    • ${kpi.name}: ${range} (${kpi.confidence} confidence, ${kpi.evidenceTier})`);
        }
      }
    }

    if (qi.coBenefits?.length) {
      content.push('');
      content.push('Co-Benefits:');
      for (const cb of qi.coBenefits) {
        const range = cb.valueRange
          ? `${cb.valueRange.low}–${cb.valueRange.high} ${cb.unit}`
          : cb.metric;
        content.push(`  • ${cb.title} (${cb.category}): ${range} [${cb.confidence}, ${cb.evidenceTier}]`);
      }
    }

    if (qi.mrvIndicators?.length) {
      content.push('');
      content.push('MRV Indicators:');
      for (const mrv of qi.mrvIndicators) {
        content.push(`  • ${mrv.name}: baseline ${mrv.baselineValue} → target ${mrv.targetValue} (${mrv.frequency}, source: ${mrv.dataSource})`);
      }
    }
  } else {
    // Fall back to narrative-based bullet points
    if (ctx.impactModel.selectedLens && ctx.impactModel.selectedLens !== 'neutral') {
      content.push(`Impact Lens: ${ctx.impactModel.selectedLens}`);
    }
    if (ctx.impactModel.narrativeCache?.base?.length) {
      content.push(`Impact Narratives: ${ctx.impactModel.narrativeCache.base.length} narrative blocks generated`);
    }
    const coBenefits = ctx.impactModel.coBenefits?.filter(cb => cb.included);
    if (coBenefits?.length) {
      content.push(`Co-benefits: ${coBenefits.map(cb => cb.title || cb.id).join(', ')}`);
    }
  }

  // Downstream signals (common to both paths)
  const signals = ctx.impactModel.downstreamSignals;
  if (signals) {
    const totalSignals = Object.values(signals).flat().length;
    if (totalSignals > 0) {
      content.push(`Downstream Signals: ${totalSignals} signals identified for operations and business model`);
    }
  }

  return { title: 'sectionD', content, hasData: content.length > 0 };
}

function buildEvidenceBase(ctx: ProjectContextData | null): ConceptNoteSection {
  const content: string[] = [];
  if (!ctx) return { title: 'sectionG', content, hasData: false };

  const qi = ctx.impactModel?.quantifiedImpacts;
  if (!qi?.evidenceContext) return { title: 'sectionG', content, hasData: false };

  const ec = qi.evidenceContext;
  content.push(`Evidence chunks used: ${ec.chunksUsed}`);

  if (ec.topSources?.length) {
    content.push('Top Sources:');
    for (const src of ec.topSources) {
      content.push(`  • ${src.title} (relevance: ${src.score.toFixed(2)})`);
    }
  }

  if (ec.searchQueries?.length) {
    content.push(`Search queries: ${ec.searchQueries.length} evidence queries executed`);
  }

  if (qi.generationMeta) {
    content.push(`Generated: ${qi.generationMeta.generatedAt} (model: ${qi.generationMeta.model}, RAG chunks: ${qi.generationMeta.ragChunksUsed})`);
  }

  return { title: 'sectionG', content, hasData: content.length > 0 };
}

function buildImplementation(ctx: ProjectContextData | null): ConceptNoteSection {
  const content: string[] = [];
  if (!ctx) return { title: 'sectionE', content, hasData: false };

  if (ctx.operations) {
    if (ctx.operations.operatingModel) {
      content.push(`Operating Model: ${ctx.operations.operatingModel.replace(/_/g, ' ')}`);
    }
    if (ctx.operations.roles) {
      const roles: string[] = [];
      if (ctx.operations.roles.assetOwnerEntityId) roles.push(`Asset Owner: ${ctx.operations.roles.assetOwnerEntityId}`);
      if (ctx.operations.roles.operatorEntityId) roles.push(`Operator: ${ctx.operations.roles.operatorEntityId}`);
      if (ctx.operations.roles.maintainerEntityId) roles.push(`Maintainer: ${ctx.operations.roles.maintainerEntityId}`);
      if (roles.length) content.push(`Key Roles: ${roles.join(' | ')}`);
    }
    if (ctx.operations.taskPlan?.length) {
      content.push(`Task Plan: ${ctx.operations.taskPlan.length} operational tasks defined`);
    }
    if (ctx.operations.nbsExtensions) {
      const ext = ctx.operations.nbsExtensions;
      content.push(`NBS Parameters: ${ext.establishmentPeriodMonths}mo establishment, ${ext.maintenanceIntensity} maintenance, ${ext.survivalTargetPercent}% survival target`);
    }
    if (ctx.operations.omCostBand?.low && ctx.operations.omCostBand?.high) {
      content.push(`O&M Cost Range: ${ctx.operations.omCostBand.currency} ${ctx.operations.omCostBand.low.toLocaleString()} - ${ctx.operations.omCostBand.high.toLocaleString()}`);
    }
  }

  return { title: 'sectionE', content, hasData: content.length > 0 };
}

function buildFinancing(ctx: ProjectContextData | null): ConceptNoteSection {
  const content: string[] = [];
  if (!ctx) return { title: 'sectionF', content, hasData: false };

  if (ctx.businessModel) {
    if (ctx.businessModel.primaryArchetype) {
      content.push(`Business Archetype: ${ctx.businessModel.primaryArchetype.replace(/_/g, ' ')}`);
    }
    if (ctx.businessModel.revenueStack?.length) {
      content.push('Revenue Stack:');
      ctx.businessModel.revenueStack.forEach(rev => {
        const dur = rev.durationYears ? ` (${rev.durationYears}y)` : '';
        content.push(`  - ${rev.revenueType.replace(/_/g, ' ')} [${rev.confidence}]${dur}`);
      });
    }
    if (ctx.businessModel.sourcesAndUsesRom) {
      const rom = ctx.businessModel.sourcesAndUsesRom;
      if (rom.capexBand?.low && rom.capexBand?.high) {
        content.push(`CAPEX: ${rom.capexBand.currency || 'USD'} ${rom.capexBand.low.toLocaleString()} - ${rom.capexBand.high.toLocaleString()}`);
      }
      if (rom.opexBand?.low && rom.opexBand?.high) {
        content.push(`OPEX: ${rom.opexBand.currency || 'USD'} ${rom.opexBand.low.toLocaleString()} - ${rom.opexBand.high.toLocaleString()}`);
      }
    }
    if (ctx.businessModel.financingPathway?.pathway) {
      content.push(`Financing Pathway: ${ctx.businessModel.financingPathway.pathway.replace(/_/g, ' ')}`);
      if (ctx.businessModel.financingPathway.rationale) {
        content.push(`Rationale: ${ctx.businessModel.financingPathway.rationale}`);
      }
    }
  }

  // Funder selection data
  if (ctx.funderSelection?.fundingPlan) {
    const plan = ctx.funderSelection.fundingPlan;
    if (plan.selectedFunderNow) {
      const fundInfo = ctx.funderSelection.targetFunders?.find(t => t.fundId === plan.selectedFunderNow);
      content.push(`Project Preparation Facility: ${fundInfo?.fundName || plan.selectedFunderNow}`);
    }
    if (plan.selectedFunderNext) {
      const fundInfo = ctx.funderSelection.targetFunders?.find(t => t.fundId === plan.selectedFunderNext);
      content.push(`Target Investment Funder: ${fundInfo?.fundName || plan.selectedFunderNext}`);
    }
  }

  return { title: 'sectionF', content, hasData: content.length > 0 };
}
