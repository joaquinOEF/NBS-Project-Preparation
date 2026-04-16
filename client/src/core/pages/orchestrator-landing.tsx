/**
 * Orchestrator portfolio preview (Phase 1, demo-grade).
 *
 * A visual prototype of what role=orchestrator would look like once Phase 3
 * lands. All data here is hardcoded — the point is to give Villa Flores and
 * other coordinators something concrete to react to. Clicking a card shows
 * a toast instead of navigating; the banner makes it clear this is an
 * early design, not production.
 *
 * See docs/ROLE-ARCHITECTURE.md. Replace the demo cards + any hardcoded
 * copy with real data when Phase 3 materializes.
 */
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Clock, Compass, Droplets, Leaf, MapPin, Sparkles, Trees, Users,
} from 'lucide-react';
import { Card, CardContent } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { TitleLarge, BodyMedium, BodySmall } from '@oef/components';
import { useToast } from '@/core/hooks/use-toast';
import { useResetRole } from '@/core/contexts/role-context';

type CboProject = {
  id: string;
  name: { en: string; pt: string };
  neighborhood: string;
  interventionType: 'garden' | 'wetland' | 'forest';
  phaseKey: 'profile_partial' | 'profile_complete' | 'seeking_funding' | 'funded' | 'implementing';
  phaseProgress: number; // 0..100
  fundingSecured: number;
  fundingSought: number;
  currency: 'BRL';
  nextActionKey: string;
  updatedDaysAgo: number;
};

const DEMO_PROJECTS: CboProject[] = [
  {
    id: 'horta-cascata',
    name: { en: 'Horta Comunitária Cascata', pt: 'Horta Comunitária Cascata' },
    neighborhood: 'Cascata',
    interventionType: 'garden',
    phaseKey: 'seeking_funding',
    phaseProgress: 80,
    fundingSecured: 40_000,
    fundingSought: 150_000,
    currency: 'BRL',
    nextActionKey: 'orchestrator.demo.nextAction.applyTeia',
    updatedDaysAgo: 2,
  },
  {
    id: 'arquipelago-verde',
    name: { en: 'Coletivo Arquipélago Verde', pt: 'Coletivo Arquipélago Verde' },
    neighborhood: 'Arquipélago',
    interventionType: 'wetland',
    phaseKey: 'profile_partial',
    phaseProgress: 40,
    fundingSecured: 15_000,
    fundingSought: 60_000,
    currency: 'BRL',
    nextActionKey: 'orchestrator.demo.nextAction.completePhase3',
    updatedDaysAgo: 7,
  },
  {
    id: 'bosque-humaita',
    name: { en: 'Agentes do Bosque Humaitá', pt: 'Agentes do Bosque Humaitá' },
    neighborhood: 'Humaitá',
    interventionType: 'forest',
    phaseKey: 'profile_complete',
    phaseProgress: 95,
    fundingSecured: 0,
    fundingSought: 80_000,
    currency: 'BRL',
    nextActionKey: 'orchestrator.demo.nextAction.applyFundoCasa',
    updatedDaysAgo: 1,
  },
];

const INTERVENTION_ICON: Record<CboProject['interventionType'], typeof Leaf> = {
  garden: Leaf,
  wetland: Droplets,
  forest: Trees,
};
const INTERVENTION_TONE: Record<CboProject['interventionType'], { bubble: string; fg: string }> = {
  garden:  { bubble: 'bg-emerald-50 dark:bg-emerald-950/40', fg: 'text-emerald-600 dark:text-emerald-300' },
  wetland: { bubble: 'bg-sky-50 dark:bg-sky-950/40',         fg: 'text-sky-600 dark:text-sky-300' },
  forest:  { bubble: 'bg-amber-50 dark:bg-amber-950/40',     fg: 'text-amber-600 dark:text-amber-300' },
};
const PHASE_STYLE: Record<CboProject['phaseKey'], { label: string; chip: string }> = {
  profile_partial:  { label: 'orchestrator.demo.phase.profilePartial',  chip: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  profile_complete: { label: 'orchestrator.demo.phase.profileComplete', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  seeking_funding:  { label: 'orchestrator.demo.phase.seekingFunding',  chip: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800' },
  funded:           { label: 'orchestrator.demo.phase.funded',          chip: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800' },
  implementing:     { label: 'orchestrator.demo.phase.implementing',    chip: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800' },
};

function formatBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
}

export default function OrchestratorLandingPage() {
  const { t, i18n } = useTranslation();
  const switchRole = useResetRole();
  const { toast } = useToast();
  const locale: 'en' | 'pt' = i18n.language?.startsWith('pt') ? 'pt' : 'en';

  const totalSecured = DEMO_PROJECTS.reduce((s, p) => s + p.fundingSecured, 0);
  const totalSought = DEMO_PROJECTS.reduce((s, p) => s + p.fundingSought, 0);

  const openProject = (p: CboProject) => {
    toast({
      title: t('orchestrator.demo.toastTitle'),
      description: t('orchestrator.demo.toastBody', { project: p.name[locale] }),
    });
  };

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-background dark:to-slate-950">
      {/* Header */}
      <header className="relative z-10 px-6 sm:px-10 py-6 border-b border-foreground/5 bg-background/40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300 flex items-center justify-center">
              <Compass className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <BodySmall className="text-muted-foreground uppercase tracking-wide text-[11px]">
                {t('orchestrator.demo.headerEyebrow')}
              </BodySmall>
              <TitleLarge className="!text-lg tracking-tight">{t('orchestrator.demo.headerTitle')}</TitleLarge>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={switchRole} data-testid="button-orchestrator-switch-role">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('orchestrator.switchRole')}
          </Button>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        {/* Co-design ribbon */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-4 py-3"
        >
          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-300 mt-0.5 shrink-0" />
          <div className="flex-1">
            <BodySmall className="text-amber-900 dark:text-amber-200 font-medium">
              {t('orchestrator.demo.codesignBannerTitle')}
            </BodySmall>
            <BodySmall className="text-amber-900/80 dark:text-amber-200/80 mt-0.5 text-xs">
              {t('orchestrator.demo.codesignBannerBody')}
            </BodySmall>
          </div>
        </motion.div>

        {/* Aggregate stats */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
        >
          {[
            { label: t('orchestrator.demo.stats.activeProjects'), value: String(DEMO_PROJECTS.length) },
            { label: t('orchestrator.demo.stats.totalSecured'),   value: formatBRL(totalSecured) },
            { label: t('orchestrator.demo.stats.totalSought'),    value: formatBRL(totalSought) },
          ].map((s, i) => (
            <motion.div
              key={i}
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }}
            >
              <Card>
                <CardContent className="p-5">
                  <BodySmall className="text-muted-foreground uppercase tracking-wide text-[11px] mb-1">
                    {s.label}
                  </BodySmall>
                  <div className="text-2xl font-semibold tracking-tight">{s.value}</div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Section heading */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <TitleLarge className="!text-xl tracking-tight mb-0.5">
              {t('orchestrator.demo.portfolioTitle')}
            </TitleLarge>
            <BodySmall className="text-muted-foreground">
              {t('orchestrator.demo.portfolioSubtitle')}
            </BodySmall>
          </div>
        </div>

        {/* Project cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } } }}
        >
          {DEMO_PROJECTS.map(p => {
            const Icon = INTERVENTION_ICON[p.interventionType];
            const tone = INTERVENTION_TONE[p.interventionType];
            const phase = PHASE_STYLE[p.phaseKey];
            const pct = p.fundingSought > 0 ? Math.round((p.fundingSecured / p.fundingSought) * 100) : 0;
            return (
              <motion.button
                key={p.id}
                onClick={() => openProject(p)}
                className="group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 rounded-xl"
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                data-testid={`card-orchestrator-project-${p.id}`}
              >
                <Card className="h-full transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-foreground/5">
                  <CardContent className="p-5 flex flex-col h-full">
                    {/* Top row: icon + name + phase chip */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${tone.bubble} ${tone.fg}`}>
                        <Icon className="w-5 h-5" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold tracking-tight truncate">{p.name[locale]}</h3>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <MapPin className="w-3 h-3" />
                          <span>{p.neighborhood}</span>
                        </div>
                      </div>
                    </div>

                    {/* Phase */}
                    <div className="mb-4">
                      <span className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${phase.chip}`}>
                        {t(phase.label)}
                      </span>
                    </div>

                    {/* Funding progress */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">{t('orchestrator.demo.funding')}</span>
                        <span className="font-medium text-foreground/80">
                          {formatBRL(p.fundingSecured)} / {formatBRL(p.fundingSought)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-foreground/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Next action + updated */}
                    <div className="mt-auto pt-3 border-t border-foreground/5 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <ArrowRight className="w-3 h-3 text-foreground/50" />
                        <span className="text-foreground/80">{t(p.nextActionKey)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{t('orchestrator.demo.updatedAgo', { count: p.updatedDaysAgo })}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.button>
            );
          })}
        </motion.div>

        {/* Feedback prompt */}
        <motion.div
          className="mt-10 rounded-xl border border-dashed border-foreground/15 bg-card/40 p-6 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-foreground/5 mb-3">
            <Users className="w-4 h-4 text-foreground/60" />
          </div>
          <TitleLarge className="!text-base tracking-tight mb-1">
            {t('orchestrator.demo.feedbackTitle')}
          </TitleLarge>
          <BodySmall className="text-muted-foreground max-w-xl mx-auto">
            {t('orchestrator.demo.feedbackBody')}
          </BodySmall>
        </motion.div>
      </main>
    </div>
  );
}
