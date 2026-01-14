import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { ArrowLeft, Map, ArrowRight, DollarSign, Settings, Landmark, Database, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { DisplayLarge } from '@oef/components';
import { Badge } from '@/core/components/ui/badge';
import { Skeleton } from '@/core/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/core/components/ui/dialog';
import { ScrollArea } from '@/core/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/core/components/ui/collapsible';
import { useTranslation } from 'react-i18next';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useProjectContext, ProjectContextData } from '@/core/contexts/project-context';

interface Project {
  id: string;
  actionId: string;
  actionName: string;
  actionDescription: string;
  actionType: string;
  cityId: string;
  status: string;
}

function ContextSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg mb-3">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-t-lg">
        <span className="font-medium text-sm">{title}</span>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="p-3 pt-0 border-t">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    'NOT_STARTED': 'outline',
    'DRAFT': 'secondary',
    'READY': 'default',
  };
  const labels: Record<string, string> = {
    'NOT_STARTED': t('project.contextLabels.notStarted'),
    'DRAFT': t('project.contextLabels.draft'),
    'READY': t('project.contextLabels.ready'),
  };
  return <Badge variant={variants[status] || 'outline'}>{labels[status] || status}</Badge>;
}

function DataRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1">
      <span className="text-muted-foreground text-xs shrink-0">{label}:</span>
      <span className={`text-xs text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function ContextViewer({ context }: { context: ProjectContextData | null }) {
  const { t } = useTranslation();
  const [showRawJson, setShowRawJson] = useState(false);
  
  if (!context) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('project.contextEmpty')}
      </div>
    );
  }

  if (showRawJson) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Raw JSON (for AI/debugging)</span>
          <Button variant="outline" size="sm" onClick={() => setShowRawJson(false)}>
            Show Formatted
          </Button>
        </div>
        <ScrollArea className="h-[55vh]">
          <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(context, null, 2)}
          </pre>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setShowRawJson(true)}>
          Show Raw JSON
        </Button>
      </div>
      <ScrollArea className="h-[55vh]">
        <div className="space-y-2 pr-4">
          <ContextSection title={t('project.contextSections.projectInfo')} defaultOpen={true}>
            <div className="space-y-1 text-sm">
              <DataRow label="ID" value={context.projectId} mono />
              <DataRow label="Name" value={context.projectName} />
              <DataRow label="Description" value={context.projectDescription || '-'} />
              <DataRow label="Type" value={<Badge variant={context.actionType === 'mitigation' ? 'default' : 'secondary'} className="text-xs">{context.actionType}</Badge>} />
              <DataRow label="City" value={`${context.cityName} (${context.cityLocode})`} />
              <DataRow label="Hazard Focus" value={
                <div className="flex gap-1 flex-wrap justify-end">
                  {context.hazardFocus?.map(h => (
                    <Badge key={h} variant="outline" className="text-xs">{h}</Badge>
                  ))}
                </div>
              } />
            </div>
          </ContextSection>

          <ContextSection title={`${t('project.contextSections.stakeholders')} (${context.stakeholders?.length || 0})`}>
            <div className="space-y-1">
              {context.stakeholders?.map(s => (
                <div key={s.id} className="flex justify-between items-center py-1 text-xs">
                  <span>{s.name}</span>
                  <Badge variant="outline" className="text-xs">{s.type}</Badge>
                </div>
              ))}
            </div>
          </ContextSection>

          <ContextSection title={`${t('project.contextSections.sites')} (${context.sites?.length || 0})`}>
            <div className="space-y-1">
              {context.sites?.map(s => (
                <div key={s.id} className="flex justify-between items-center py-1 text-xs">
                  <span>{s.name}</span>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-xs">{s.hazardType}</Badge>
                    <Badge variant="secondary" className="text-xs">{s.interventionType}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </ContextSection>

          <ContextSection title={t('project.contextSections.funderSelection')}>
            {context.funderSelection ? (
              <div className="space-y-2">
                <DataRow label="Status" value={<StatusBadge status={context.funderSelection.status} />} />
                
                {context.funderSelection.questionnaire && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Questionnaire Answers:</p>
                    {context.funderSelection.questionnaire.projectName && (
                      <DataRow label="Project Name" value={context.funderSelection.questionnaire.projectName} />
                    )}
                    {context.funderSelection.questionnaire.projectDescription && (
                      <DataRow label="Description" value={context.funderSelection.questionnaire.projectDescription} />
                    )}
                    {context.funderSelection.questionnaire.sectors?.length > 0 && (
                      <DataRow label="Sectors" value={context.funderSelection.questionnaire.sectors.join(', ')} />
                    )}
                    {context.funderSelection.questionnaire.projectStage && (
                      <DataRow label="Stage" value={context.funderSelection.questionnaire.projectStage} />
                    )}
                    {context.funderSelection.questionnaire.existingElements?.length > 0 && (
                      <DataRow label="Existing Elements" value={context.funderSelection.questionnaire.existingElements.join(', ')} />
                    )}
                    {context.funderSelection.questionnaire.budgetPreparation && (
                      <DataRow label="Budget for Preparation" value={context.funderSelection.questionnaire.budgetPreparation} />
                    )}
                    {context.funderSelection.questionnaire.budgetImplementation && (
                      <DataRow label="Budget for Implementation" value={context.funderSelection.questionnaire.budgetImplementation} />
                    )}
                    {context.funderSelection.questionnaire.generatesRevenue && (
                      <DataRow label="Generates Revenue" value={context.funderSelection.questionnaire.generatesRevenue} />
                    )}
                    {context.funderSelection.questionnaire.repaymentSource && (
                      <DataRow label="Repayment Source" value={context.funderSelection.questionnaire.repaymentSource} />
                    )}
                    {context.funderSelection.questionnaire.investmentSize && (
                      <DataRow label="Investment Size" value={context.funderSelection.questionnaire.investmentSize} />
                    )}
                    {context.funderSelection.questionnaire.fundingReceiver && (
                      <DataRow label="Funding Receiver" value={context.funderSelection.questionnaire.fundingReceiver} />
                    )}
                    {context.funderSelection.questionnaire.canTakeDebt && (
                      <DataRow label="Can Take Debt" value={context.funderSelection.questionnaire.canTakeDebt} />
                    )}
                    {context.funderSelection.questionnaire.nationalApproval && (
                      <DataRow label="National Approval" value={context.funderSelection.questionnaire.nationalApproval} />
                    )}
                    {context.funderSelection.questionnaire.openToBundling && (
                      <DataRow label="Open to Bundling" value={context.funderSelection.questionnaire.openToBundling} />
                    )}
                  </div>
                )}

                {context.funderSelection.pathway?.primary && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Pathway:</p>
                    <DataRow label="Primary" value={context.funderSelection.pathway.primary} />
                    {context.funderSelection.pathway.secondary && (
                      <DataRow label="Secondary" value={context.funderSelection.pathway.secondary} />
                    )}
                    <DataRow label="Readiness Level" value={context.funderSelection.pathway.readinessLevel} />
                    {context.funderSelection.pathway.limitingFactors?.length > 0 && (
                      <DataRow label="Limiting Factors" value={context.funderSelection.pathway.limitingFactors.join(', ')} />
                    )}
                  </div>
                )}

                {(context.funderSelection.selectedFunds?.length > 0 || context.funderSelection.shortlistedFunds?.length > 0) && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Funds:</p>
                    <DataRow label="Selected" value={context.funderSelection.selectedFunds?.length || 0} />
                    <DataRow label="Shortlisted" value={context.funderSelection.shortlistedFunds?.length || 0} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('project.contextLabels.notStarted')}</p>
            )}
          </ContextSection>

          <ContextSection title={t('project.contextSections.operations')}>
            {context.operations ? (
              <div className="space-y-2">
                <DataRow label="Status" value={<StatusBadge status={context.operations.status} />} />
                {context.operations.operatingModel && (
                  <DataRow label="Operating Model" value={<Badge variant="secondary" className="text-xs">{context.operations.operatingModel.replace(/_/g, ' ')}</Badge>} />
                )}

                {context.operations.roles && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Roles:</p>
                    {context.operations.roles.assetOwnerEntityId && (
                      <DataRow label="Asset Owner" value={context.operations.roles.assetOwnerEntityId} />
                    )}
                    {context.operations.roles.programOwnerEntityId && (
                      <DataRow label="Program Owner" value={context.operations.roles.programOwnerEntityId} />
                    )}
                    {context.operations.roles.operatorEntityId && (
                      <DataRow label="Operator" value={context.operations.roles.operatorEntityId} />
                    )}
                    {context.operations.roles.maintainerEntityId && (
                      <DataRow label="Maintainer" value={context.operations.roles.maintainerEntityId} />
                    )}
                    {context.operations.roles.verifierEntityId && (
                      <DataRow label="Verifier" value={context.operations.roles.verifierEntityId} />
                    )}
                    {context.operations.roles.communityRole && (
                      <DataRow label="Community Role" value={context.operations.roles.communityRole.replace(/_/g, ' ')} />
                    )}
                    {context.operations.roles.stewardshipScope && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">Stewardship Scope:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {context.operations.roles.stewardshipScope.routineMaintenance && <Badge variant="outline" className="text-xs">Routine Maintenance</Badge>}
                          {context.operations.roles.stewardshipScope.inspections && <Badge variant="outline" className="text-xs">Inspections</Badge>}
                          {context.operations.roles.stewardshipScope.minorRepairs && <Badge variant="outline" className="text-xs">Minor Repairs</Badge>}
                          {context.operations.roles.stewardshipScope.monitoringSupport && <Badge variant="outline" className="text-xs">Monitoring Support</Badge>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {context.operations.nbsExtensions && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">NBS Extensions:</p>
                    <DataRow label="Establishment Period" value={`${context.operations.nbsExtensions.establishmentPeriodMonths} months`} />
                    <DataRow label="Maintenance Intensity" value={context.operations.nbsExtensions.maintenanceIntensity} />
                    <DataRow label="Survival Target" value={`${context.operations.nbsExtensions.survivalTargetPercent}%`} />
                    <DataRow label="Replacement Policy" value={context.operations.nbsExtensions.replacementPolicy?.replace(/_/g, ' ')} />
                    {context.operations.nbsExtensions.nbsAssetTypes?.length > 0 && (
                      <DataRow label="Asset Types" value={context.operations.nbsExtensions.nbsAssetTypes.join(', ')} />
                    )}
                  </div>
                )}

                {context.operations.serviceLevels?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Service Levels ({context.operations.serviceLevels.length}):</p>
                    {context.operations.serviceLevels.map((sl, i) => (
                      <div key={i} className="bg-muted/50 p-2 rounded text-xs mb-1">
                        <div>{sl.serviceType}: {sl.targetStatement}</div>
                        <div className="text-muted-foreground">Metric: {sl.proxyMetric} | Freq: {sl.inspectionFrequency}</div>
                      </div>
                    ))}
                  </div>
                )}

                {context.operations.taskPlan?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Task Plan ({context.operations.taskPlan.length} tasks):</p>
                    {context.operations.taskPlan.slice(0, 5).map(task => (
                      <div key={task.id} className="text-xs py-1 border-b last:border-0">
                        <span className="font-medium">{task.name}</span>
                        <span className="text-muted-foreground ml-2">[{task.category}] {task.frequency}</span>
                      </div>
                    ))}
                    {context.operations.taskPlan.length > 5 && (
                      <p className="text-xs text-muted-foreground mt-1">...and {context.operations.taskPlan.length - 5} more</p>
                    )}
                  </div>
                )}

                {context.operations.omCostBand && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Cost Band:</p>
                    <DataRow label="Range" value={`${context.operations.omCostBand.currency} ${context.operations.omCostBand.low?.toLocaleString()} - ${context.operations.omCostBand.high?.toLocaleString()}`} />
                    <DataRow label="Basis" value={context.operations.omCostBand.basis} />
                    {context.operations.omCostBand.assumptions && (
                      <DataRow label="Assumptions" value={context.operations.omCostBand.assumptions} />
                    )}
                  </div>
                )}

                {context.operations.omFunding && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Funding:</p>
                    <DataRow label="Duration" value={`${context.operations.omFunding.durationYears} years`} />
                    {context.operations.omFunding.mechanisms?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {context.operations.omFunding.mechanisms.map(m => (
                          <Badge key={m} variant="outline" className="text-xs">{m.replace(/_/g, ' ')}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {context.operations.capacity && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Capacity Assessment:</p>
                    {context.operations.capacity.assessment && (
                      <DataRow label="Assessment" value={context.operations.capacity.assessment.replace(/_/g, ' ')} />
                    )}
                    {context.operations.capacity.notes && (
                      <DataRow label="Notes" value={context.operations.capacity.notes} />
                    )}
                  </div>
                )}

                {context.operations.opsRisks?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Risks ({context.operations.opsRisks.length}):</p>
                    {context.operations.opsRisks.map(risk => (
                      <div key={risk.id} className="text-xs py-1">
                        <Badge variant={risk.riskLevel === 'HIGH' ? 'destructive' : risk.riskLevel === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs mr-2">
                          {risk.riskLevel}
                        </Badge>
                        {risk.riskType.replace(/_/g, ' ')}
                        {risk.mitigation && <span className="text-muted-foreground ml-1">({risk.mitigation})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {context.operations.readiness && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Readiness:</p>
                    {context.operations.readiness.blockers?.length > 0 && (
                      <div className="mb-2">
                        <span className="text-xs text-muted-foreground">Blockers: </span>
                        {context.operations.readiness.blockers.map((b, i) => (
                          <Badge key={i} variant="destructive" className="text-xs mr-1">{b}</Badge>
                        ))}
                      </div>
                    )}
                    {context.operations.readiness.checklist && (
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <span className={context.operations.readiness.checklist.operatingModelSelected ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.operations.readiness.checklist.operatingModelSelected ? '✓' : '○'} Operating Model
                        </span>
                        <span className={context.operations.readiness.checklist.operatorAssigned ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.operations.readiness.checklist.operatorAssigned ? '✓' : '○'} Operator Assigned
                        </span>
                        <span className={context.operations.readiness.checklist.taskPlanPresent ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.operations.readiness.checklist.taskPlanPresent ? '✓' : '○'} Task Plan
                        </span>
                        <span className={context.operations.readiness.checklist.fundingMechanismSelected ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.operations.readiness.checklist.fundingMechanismSelected ? '✓' : '○'} Funding Mechanism
                        </span>
                        <span className={context.operations.readiness.checklist.verifierSet ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.operations.readiness.checklist.verifierSet ? '✓' : '○'} Verifier Set
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('project.contextLabels.notStarted')}</p>
            )}
          </ContextSection>

          <ContextSection title={t('project.contextSections.businessModel')}>
            {context.businessModel ? (
              <div className="space-y-2">
                <DataRow label="Status" value={<StatusBadge status={context.businessModel.status} />} />
                {context.businessModel.primaryArchetype && (
                  <DataRow label="Archetype" value={<Badge variant="secondary" className="text-xs">{context.businessModel.primaryArchetype.replace(/_/g, ' ')}</Badge>} />
                )}

                {context.businessModel.payerBeneficiaryMap && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Payers & Beneficiaries:</p>
                    {context.businessModel.payerBeneficiaryMap.primaryPayerId && (
                      <DataRow label="Primary Payer" value={context.businessModel.payerBeneficiaryMap.primaryPayerId} />
                    )}
                    {context.businessModel.payerBeneficiaryMap.beneficiaries?.length > 0 && (
                      <div className="mt-1">
                        <span className="text-xs text-muted-foreground">Beneficiaries:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {context.businessModel.payerBeneficiaryMap.beneficiaries.map(b => (
                            <Badge key={b.stakeholderId} variant="outline" className="text-xs">
                              {b.stakeholderId}{b.benefitType ? ` (${b.benefitType})` : ''}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {context.businessModel.payerBeneficiaryMap.candidatePayers?.length > 0 && (
                      <div className="mt-1">
                        <span className="text-xs text-muted-foreground">Candidate Payers:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {context.businessModel.payerBeneficiaryMap.candidatePayers.map(p => (
                            <Badge key={p.stakeholderId} variant="secondary" className="text-xs">
                              {p.stakeholderId}{p.mechanismHint ? ` (${p.mechanismHint})` : ''}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {context.businessModel.paymentMechanism?.type && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Payment Mechanism:</p>
                    <DataRow label="Type" value={context.businessModel.paymentMechanism.type.replace(/_/g, ' ')} />
                    {context.businessModel.paymentMechanism.basis && (
                      <DataRow label="Basis" value={context.businessModel.paymentMechanism.basis.replace(/_/g, ' ')} />
                    )}
                    {context.businessModel.paymentMechanism.durationYears && (
                      <DataRow label="Duration" value={`${context.businessModel.paymentMechanism.durationYears} years`} />
                    )}
                  </div>
                )}

                {context.businessModel.revenueStack?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Revenue Stack ({context.businessModel.revenueStack.length}):</p>
                    {context.businessModel.revenueStack.map(rev => (
                      <div key={rev.id} className="text-xs py-1 border-b last:border-0 bg-muted/30 p-1 rounded mb-1">
                        <div className="flex items-center gap-1">
                          <Badge variant={rev.confidence === 'HIGH' ? 'default' : rev.confidence === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs">
                            {rev.confidence}
                          </Badge>
                          <span className="font-medium">{rev.revenueType.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="text-muted-foreground">
                          Role: {rev.role.replace(/_/g, ' ')}
                          {rev.durationYears && ` | ${rev.durationYears}y`}
                        </div>
                        {rev.prerequisites && rev.prerequisites.length > 0 && (
                          <div className="text-muted-foreground">Prerequisites: {rev.prerequisites.join(', ')}</div>
                        )}
                        {rev.notes && <div className="text-muted-foreground">Notes: {rev.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {context.businessModel.sourcesAndUsesRom && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Sources & Uses (ROM):</p>
                    {context.businessModel.sourcesAndUsesRom.capexBand && (
                      <DataRow label="CAPEX Band" value={`${context.businessModel.sourcesAndUsesRom.capexBand.currency || 'USD'} ${context.businessModel.sourcesAndUsesRom.capexBand.low?.toLocaleString()} - ${context.businessModel.sourcesAndUsesRom.capexBand.high?.toLocaleString()}`} />
                    )}
                    {context.businessModel.sourcesAndUsesRom.opexBand && (
                      <DataRow label="OPEX Band" value={`${context.businessModel.sourcesAndUsesRom.opexBand.currency || 'USD'} ${context.businessModel.sourcesAndUsesRom.opexBand.low?.toLocaleString()} - ${context.businessModel.sourcesAndUsesRom.opexBand.high?.toLocaleString()}`} />
                    )}
                    {context.businessModel.sourcesAndUsesRom.mrvBudgetBand && (
                      <DataRow label="MRV Budget" value={`${context.businessModel.sourcesAndUsesRom.mrvBudgetBand.currency || 'USD'} ${context.businessModel.sourcesAndUsesRom.mrvBudgetBand.low?.toLocaleString()} - ${context.businessModel.sourcesAndUsesRom.mrvBudgetBand.high?.toLocaleString()}`} />
                    )}
                    {context.businessModel.sourcesAndUsesRom.assumptions && (
                      <DataRow label="Assumptions" value={context.businessModel.sourcesAndUsesRom.assumptions} />
                    )}
                  </div>
                )}

                {context.businessModel.financingPathway?.pathway && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Financing Pathway:</p>
                    <DataRow label="Pathway" value={<Badge variant="outline" className="text-xs">{context.businessModel.financingPathway.pathway.replace(/_/g, ' ')}</Badge>} />
                    {context.businessModel.financingPathway.rationale && (
                      <DataRow label="Rationale" value={context.businessModel.financingPathway.rationale} />
                    )}
                  </div>
                )}

                {context.businessModel.enablingActions?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Enabling Actions ({context.businessModel.enablingActions.length}):</p>
                    {context.businessModel.enablingActions.map(action => (
                      <div key={action.id} className="text-xs py-1">
                        <Badge variant={action.priority === 'HIGH' ? 'destructive' : action.priority === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs mr-2">
                          {action.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs mr-2">{action.category}</Badge>
                        {action.action}
                        {action.ownerStakeholderId && <span className="text-muted-foreground ml-1">({action.ownerStakeholderId})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {context.businessModel.bmRisks?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Risks ({context.businessModel.bmRisks.length}):</p>
                    {context.businessModel.bmRisks.map(risk => (
                      <div key={risk.id} className="text-xs py-1">
                        <Badge variant={risk.riskLevel === 'HIGH' ? 'destructive' : risk.riskLevel === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs mr-2">
                          {risk.riskLevel}
                        </Badge>
                        {risk.riskType.replace(/_/g, ' ')}
                        {risk.mitigation && <span className="text-muted-foreground ml-1">({risk.mitigation})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {context.businessModel.readiness && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Readiness:</p>
                    {context.businessModel.readiness.blockers?.length > 0 && (
                      <div className="mb-2">
                        <span className="text-xs text-muted-foreground">Blockers: </span>
                        {context.businessModel.readiness.blockers.map((b, i) => (
                          <Badge key={i} variant="destructive" className="text-xs mr-1">{b}</Badge>
                        ))}
                      </div>
                    )}
                    {context.businessModel.readiness.checklist && (
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <span className={context.businessModel.readiness.checklist.primaryArchetypeSelected ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.primaryArchetypeSelected ? '✓' : '○'} Archetype
                        </span>
                        <span className={context.businessModel.readiness.checklist.primaryPayerSelected ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.primaryPayerSelected ? '✓' : '○'} Primary Payer
                        </span>
                        <span className={context.businessModel.readiness.checklist.oneHighConfidenceRevenueLine ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.oneHighConfidenceRevenueLine ? '✓' : '○'} HIGH Revenue
                        </span>
                        <span className={context.businessModel.readiness.checklist.durationSet ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.durationSet ? '✓' : '○'} Duration Set
                        </span>
                        <span className={context.businessModel.readiness.checklist.financingPathwaySelected ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.financingPathwaySelected ? '✓' : '○'} Financing Pathway
                        </span>
                        <span className={context.businessModel.readiness.checklist.consistencyCheckedWithOps ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.consistencyCheckedWithOps ? '✓' : '○'} O&M Consistency
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('project.contextLabels.notStarted')}</p>
            )}
          </ContextSection>

          <ContextSection title={t('project.contextSections.siteExplorer')}>
            {context.siteExplorer ? (
              <div className="space-y-2">
                {context.siteExplorer.selectedZones?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Selected Zones ({context.siteExplorer.selectedZones.length}):</p>
                    {context.siteExplorer.selectedZones.map((zone, i) => {
                      if (typeof zone === 'string') {
                        return (
                          <div key={zone} className="text-xs py-1 bg-muted/30 p-1 rounded mb-1">
                            <span className="font-medium">{zone}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={zone.zoneId || i} className="text-xs py-1 bg-muted/30 p-1 rounded mb-1">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">{zone.hazardType}</Badge>
                            <span className="font-medium">{zone.zoneId}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {zone.riskScore !== undefined && `Risk: ${(zone.riskScore * 100).toFixed(0)}%`}
                            {zone.area && ` | Area: ${zone.area.toFixed(2)} km²`}
                          </div>
                          {zone.interventionType && (
                            <Badge variant="secondary" className="text-xs mt-1">{zone.interventionType.replace(/_/g, ' ')}</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {context.siteExplorer.hazardSummary && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Hazard Summary:</p>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <DataRow label="Flood Cells" value={context.siteExplorer.hazardSummary.floodCells} />
                      <DataRow label="Heat Cells" value={context.siteExplorer.hazardSummary.heatCells} />
                      <DataRow label="Landslide Cells" value={context.siteExplorer.hazardSummary.landslideCells} />
                      <DataRow label="Total Cells" value={context.siteExplorer.hazardSummary.totalCells} />
                    </div>
                  </div>
                )}
                {context.siteExplorer.layerPreferences && Object.keys(context.siteExplorer.layerPreferences).length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Layer Preferences:</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(context.siteExplorer.layerPreferences)
                        .filter(([_, enabled]) => enabled)
                        .map(([layer]) => (
                          <Badge key={layer} variant="outline" className="text-xs">{layer}</Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('project.contextLabels.notStarted')}</p>
            )}
          </ContextSection>

          {context.lastUpdated && Object.keys(context.lastUpdated).length > 0 && (
          <ContextSection title={t('project.contextLabels.lastUpdated')}>
            <div className="space-y-1 text-xs text-muted-foreground">
              {Object.entries(context.lastUpdated).map(([module, date]) => (
                <div key={module} className="flex justify-between">
                  <span>{module}:</span>
                  <span>{date ? new Date(date).toLocaleString() : '-'}</span>
                </div>
              ))}
            </div>
          </ContextSection>
        )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { isSampleMode, sampleActions, initiatedProjects, sampleCity } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();
  const { context, loadContext, migrateExistingData } = useProjectContext();
  const [contextOpen, setContextOpen] = useState(false);

  const { data: projectData, isLoading } = useQuery<{ project: Project }>({
    queryKey: ['/api/project', projectId],
    enabled: !isSampleMode && !isSampleRoute && !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    
    const existing = loadContext(projectId);
    if (!existing && (isSampleMode || isSampleRoute)) {
      const action = sampleActions.find(a => a.id === projectId);
      if (action) {
        migrateExistingData(projectId, {
          name: action.name,
          description: action.description,
          actionType: action.type,
          cityId: action.cityId,
          cityName: sampleCity?.name || 'Porto Alegre',
          cityLocode: sampleCity?.locode || 'BR POA',
        });
      }
    }
  }, [projectId, isSampleMode, isSampleRoute, loadContext, migrateExistingData, sampleActions, sampleCity]);

  if (isSampleMode || isSampleRoute) {
    const action = sampleActions.find(a => a.id === projectId);
    const isInitiated = initiatedProjects.includes(projectId || '');
    
    if (!action || !isInitiated) {
      return (
        <div className="min-h-screen bg-background">
          <Header />
          <div className="container mx-auto px-4 py-8">
            <Link href={`${routePrefix}/cities`}>
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('common.back')}
              </Button>
            </Link>
            <p>{t('project.notFound')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Link href={`${routePrefix}/city-information/${action.cityId}`}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <DisplayLarge>{action.name}</DisplayLarge>
              <Badge variant="secondary">{t('cityInfo.sampleDataBadge')}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant={action.type === 'mitigation' ? 'default' : 'secondary'}>
                {action.type === 'mitigation' ? t('cityInfo.mitigation') : t('cityInfo.adaptation')}
              </Badge>
              <Dialog open={contextOpen} onOpenChange={setContextOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Database className="h-4 w-4 mr-2" />
                    {t('project.showContext')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{t('project.contextModalTitle')}</DialogTitle>
                    <DialogDescription>{t('project.contextModalDescription')}</DialogDescription>
                  </DialogHeader>
                  <ContextViewer context={context} />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link href={`${routePrefix}/funder-selection/${projectId}`}>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                    <CardTitle className="text-lg">{t('project.funderSelection')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {t('project.funderSelectionDescription')}
                  </CardDescription>
                  <div className="flex items-center text-green-600 text-sm font-medium">
                    {t('common.view')}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`${routePrefix}/site-explorer/${projectId}`}>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Map className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{t('project.siteExplorer')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {t('project.siteExplorerDescription')}
                  </CardDescription>
                  <div className="flex items-center text-primary text-sm font-medium">
                    {t('common.view')}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`${routePrefix}/project-operations/${projectId}`}>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/10 rounded-lg">
                      <Settings className="h-6 w-6 text-orange-600" />
                    </div>
                    <CardTitle className="text-lg">{t('project.projectOperations')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {t('project.projectOperationsDescription')}
                  </CardDescription>
                  <div className="flex items-center text-orange-600 text-sm font-medium">
                    {t('common.view')}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`${routePrefix}/business-model/${projectId}`}>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <Landmark className="h-6 w-6 text-purple-600" />
                    </div>
                    <CardTitle className="text-lg">{t('project.businessModel')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {t('project.businessModelDescription')}
                  </CardDescription>
                  <div className="flex items-center text-purple-600 text-sm font-medium">
                    {t('common.view')}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-12 w-64 mb-2" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
    );
  }

  const project = projectData?.project;

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Link href="/cities">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>
          <p>{t('project.notFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <Link href={`/city-information/${project.cityId}`}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
        </Link>

        <div className="mb-8">
          <DisplayLarge>{project.actionName}</DisplayLarge>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant={project.actionType === 'mitigation' ? 'default' : 'secondary'}>
              {project.actionType === 'mitigation' ? t('cityInfo.mitigation') : t('cityInfo.adaptation')}
            </Badge>
            <Dialog open={contextOpen} onOpenChange={setContextOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Database className="h-4 w-4 mr-2" />
                  {t('project.showContext')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t('project.contextModalTitle')}</DialogTitle>
                  <DialogDescription>{t('project.contextModalDescription')}</DialogDescription>
                </DialogHeader>
                <ContextViewer context={context} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href={`/funder-selection/${projectId}`}>
            <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                  <CardTitle className="text-lg">{t('project.funderSelection')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  {t('project.funderSelectionDescription')}
                </CardDescription>
                <div className="flex items-center text-green-600 text-sm font-medium">
                  {t('common.view')}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/site-explorer/${projectId}`}>
            <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Map className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{t('project.siteExplorer')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  {t('project.siteExplorerDescription')}
                </CardDescription>
                <div className="flex items-center text-primary text-sm font-medium">
                  {t('common.view')}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/project-operations/${projectId}`}>
            <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <Settings className="h-6 w-6 text-orange-600" />
                  </div>
                  <CardTitle className="text-lg">{t('project.projectOperations')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  {t('project.projectOperationsDescription')}
                </CardDescription>
                <div className="flex items-center text-orange-600 text-sm font-medium">
                  {t('common.view')}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/business-model/${projectId}`}>
            <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Landmark className="h-6 w-6 text-purple-600" />
                  </div>
                  <CardTitle className="text-lg">{t('project.businessModel')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  {t('project.businessModelDescription')}
                </CardDescription>
                <div className="flex items-center text-purple-600 text-sm font-medium">
                  {t('common.view')}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
