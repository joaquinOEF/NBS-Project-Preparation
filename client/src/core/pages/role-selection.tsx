/**
 * Role-selection landing page (Phase 1 of role architecture).
 *
 * Entry point for fresh visitors: pick City / CBO / Orchestrator; we persist
 * the choice via RoleProvider (localStorage + ?role= deep-link) and route
 * into the role's entryRoute. If role is already set AND the URL carries a
 * `?role=` query param, skip the gate. A persisted-only role does NOT skip
 * the gate — users should always be able to reach `/` and switch.
 *
 * See docs/ROLE-ARCHITECTURE.md.
 */
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, Check, Droplets, Leaf, Mountain, Network, Sparkles, Sprout, Trees, Users, Waves } from 'lucide-react';
import { Card, CardContent } from '@/core/components/ui/card';
import { TitleLarge, BodyMedium, BodySmall } from '@oef/components';
import { useRoleContext } from '@/core/contexts/role-context';
import { ROLE_CONFIGS, type AudienceRole } from '@shared/roles';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { analytics } from '@/core/lib/analytics';

type RolePresentation = {
  id: AudienceRole;
  Icon: typeof Building2;
  /** Tailwind accent classes tuned per-role for icon bubble + hover glow. */
  accent: {
    bubble: string;
    iconFg: string;
    ringHover: string;
    glowFrom: string;
    glowVia: string;
    corner: string;
  };
};

// NBS typology showcase — the educational strip below the role cards. Derived
// from the intervention types referenced in server/services/cboAgent.ts and
// the sample-data interventions. Copy is deliberately compact; the grid is
// scannable, not a full catalog.
type NbsTypology = {
  key: string;
  Icon: typeof Building2;
  /** primary hazard for icon color accent */
  tone: 'flood' | 'heat' | 'landslide' | 'biodiversity';
  /** Public-path image shown at the top of the card. All assets under
   *  /assets/nbs/ are sourced from Wikimedia Commons (CC-BY / CC-BY-SA /
   *  CC0). See `credits` below for attribution; full list rendered in
   *  the landing footer.
   */
  image: string;
  credit: { author: string; license: string; source: string };
};

const NBS_TYPOLOGIES: NbsTypology[] = [
  {
    key: 'floodParks',
    Icon: Droplets,
    tone: 'flood',
    image: '/assets/nbs/flood-park.jpg',
    credit: { author: 'Marc Merlin', license: 'CC BY-SA 4.0', source: 'Wikimedia Commons' },
  },
  {
    key: 'bioswales',
    Icon: Leaf,
    tone: 'flood',
    image: '/assets/nbs/bioswales.jpg',
    credit: { author: 'Ɱ (Wikimedia)', license: 'CC BY-SA 4.0', source: 'Wikimedia Commons' },
  },
  {
    key: 'urbanForests',
    Icon: Trees,
    tone: 'heat',
    image: '/assets/nbs/urban-forest.jpg',
    credit: { author: 'Ciaran Hendry', license: 'CC BY-SA 4.0', source: 'Wikimedia Commons' },
  },
  {
    key: 'greenCorridors',
    Icon: Sprout,
    tone: 'biodiversity',
    image: '/assets/nbs/green-corridor.jpg',
    credit: { author: 'Luca Nebuloni', license: 'CC BY 2.0', source: 'Wikimedia Commons' },
  },
  {
    key: 'wetlands',
    Icon: Waves,
    tone: 'flood',
    image: '/assets/nbs/wetland.jpg',
    credit: { author: 'Basile Morin', license: 'CC BY-SA 4.0', source: 'Wikimedia Commons' },
  },
  {
    key: 'slopeStabilize',
    Icon: Mountain,
    tone: 'landslide',
    image: '/assets/nbs/slope-stabilization.jpg',
    credit: { author: 'Germartin1', license: 'CC0', source: 'Wikimedia Commons' },
  },
];

const TONE_STYLES: Record<NbsTypology['tone'], { bubble: string; fg: string; chip: string }> = {
  flood:        { bubble: 'bg-sky-50 dark:bg-sky-950/40',       fg: 'text-sky-600 dark:text-sky-300',       chip: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800' },
  heat:         { bubble: 'bg-amber-50 dark:bg-amber-950/40',   fg: 'text-amber-600 dark:text-amber-300',   chip: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  landslide:    { bubble: 'bg-orange-50 dark:bg-orange-950/40', fg: 'text-orange-600 dark:text-orange-300', chip: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800' },
  biodiversity: { bubble: 'bg-emerald-50 dark:bg-emerald-950/40', fg: 'text-emerald-600 dark:text-emerald-300', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
};

const PRESENTATIONS: RolePresentation[] = [
  {
    id: 'city',
    Icon: Building2,
    accent: {
      bubble: 'bg-blue-50 dark:bg-blue-950/40',
      iconFg: 'text-blue-600 dark:text-blue-300',
      ringHover: 'group-hover:ring-blue-300/60 dark:group-hover:ring-blue-700/60',
      glowFrom: 'from-blue-400/20',
      glowVia: 'via-sky-300/15',
      corner: 'from-blue-400/15',
    },
  },
  {
    id: 'cbo',
    Icon: Users,
    accent: {
      bubble: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconFg: 'text-emerald-600 dark:text-emerald-300',
      ringHover: 'group-hover:ring-emerald-300/60 dark:group-hover:ring-emerald-700/60',
      glowFrom: 'from-emerald-400/20',
      glowVia: 'via-teal-300/15',
      corner: 'from-emerald-400/15',
    },
  },
  {
    id: 'orchestrator',
    Icon: Network,
    accent: {
      bubble: 'bg-amber-50 dark:bg-amber-950/40',
      iconFg: 'text-amber-600 dark:text-amber-300',
      ringHover: 'group-hover:ring-amber-300/60 dark:group-hover:ring-amber-700/60',
      glowFrom: 'from-amber-400/20',
      glowVia: 'via-orange-300/15',
      corner: 'from-amber-400/15',
    },
  },
];

export default function RoleSelectionPage() {
  const [, setLocation] = useLocation();
  const { role, setRole } = useRoleContext();
  const { i18n, t } = useTranslation();
  const { setSampleMode, initiateProject } = useSampleData();

  const locale: 'en' | 'pt' = i18n.language?.startsWith('pt') ? 'pt' : 'en';

  // Only auto-skip the gate when a `?role=` query param is in the URL
  // (deep-link intent). A persisted role in localStorage is NOT a reason
  // to hide the landing — users should always be able to switch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasDeepLinkedRole = new URLSearchParams(window.location.search).has('role');
    if (hasDeepLinkedRole && role) {
      setLocation(ROLE_CONFIGS[role].entryRoute);
    }
  }, [role, setLocation]);

  useEffect(() => {
    analytics.navigation.pageViewed('RoleSelection');
  }, []);

  const choose = (next: AudienceRole) => {
    setRole(next);
    const config = ROLE_CONFIGS[next];
    // Keep sample mode in sync with the chosen role's auth posture. Picking
    // a bypass-auth role (CBO demo) enables sample data; picking an
    // auth-requiring role (City) clears any sticky CBO sample mode.
    setSampleMode(config.bypassAuth);
    // Auto-switch to Portuguese for the CBO path — our primary CBO audience
    // is Brazilian. City / Orchestrator keep whatever the user picked on the
    // landing. Users can always override via the EN/PT pill.
    if (next === 'cbo' && !i18n.language?.startsWith('pt')) {
      i18n.changeLanguage('pt');
    }
    // Pre-initiate any sample projects this role's entryRoute lands on
    // directly — otherwise the project page sees an un-initiated id and
    // renders "project not found" on the first click.
    if (config.seedSampleProjects) {
      for (const id of config.seedSampleProjects) initiateProject(id);
    }
    setLocation(config.entryRoute);
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Aurora backdrop — three soft, slowly drifting color blobs. Tasteful,
          non-distracting. Respects prefers-reduced-motion. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[55vw] h-[55vw] max-w-[700px] max-h-[700px] rounded-full bg-emerald-300/35 dark:bg-emerald-500/10 blur-3xl animate-aurora-a" />
        <div className="absolute top-[10%] right-[-15%] w-[50vw] h-[50vw] max-w-[650px] max-h-[650px] rounded-full bg-sky-300/30 dark:bg-sky-500/10 blur-3xl animate-aurora-b" />
        <div className="absolute bottom-[-20%] left-[20%] w-[45vw] h-[45vw] max-w-[550px] max-h-[550px] rounded-full bg-amber-200/30 dark:bg-amber-500/10 blur-3xl animate-aurora-c" />
        <div className="absolute inset-0 bg-noise opacity-40 mix-blend-soft-light" />
      </div>

      {/* Header strip */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6">
        <div className="flex items-center gap-3">
          <img
            src="/poc-icon.png"
            alt="OEF"
            className="w-9 h-9 rounded-lg shadow-sm"
          />
          <BodySmall className="font-medium tracking-wide text-muted-foreground">
            {t('roleSelection.header')}
          </BodySmall>
        </div>
        {/* Language switcher */}
        <div className="flex items-center gap-1 text-xs font-medium rounded-full border border-foreground/10 bg-background/50 backdrop-blur-sm px-1 py-1">
          <button
            className={`px-3 py-1 rounded-full transition-colors ${locale === 'en' ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => i18n.changeLanguage('en')}
            data-testid="button-lang-en"
          >
            EN
          </button>
          <button
            className={`px-3 py-1 rounded-full transition-colors ${locale === 'pt' ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => i18n.changeLanguage('pt')}
            data-testid="button-lang-pt"
          >
            PT
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16">
        <div className="w-full max-w-5xl">
          {/* Hero */}
          <motion.div
            className="text-center mb-12 sm:mb-16"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-background/60 backdrop-blur-sm border border-foreground/10 px-4 py-1.5 mb-6">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2} />
              <BodySmall className="text-foreground/70 tracking-wide">
                {t('roleSelection.eyebrow')}
              </BodySmall>
            </div>
            <TitleLarge
              className="mb-5 !text-4xl sm:!text-6xl !leading-[1.1] tracking-tight"
              data-testid="text-landing-title"
            >
              {t('roleSelection.title')}
            </TitleLarge>
            <BodyMedium className="text-muted-foreground max-w-2xl mx-auto !text-base sm:!text-lg leading-relaxed">
              {t('roleSelection.subtitle')}
            </BodyMedium>
          </motion.div>

          {/* Role cards — stagger entry */}
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
            }}
          >
            {PRESENTATIONS.map(({ id, Icon, accent }) => {
              const config = ROLE_CONFIGS[id];
              const isCurrent = role === id;
              return (
                <motion.button
                  key={id}
                  onClick={() => choose(id)}
                  className="group text-left relative focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 rounded-[14px]"
                  variants={{
                    hidden: { opacity: 0, y: 24 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
                  }}
                  whileHover={{ y: -6 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  data-testid={`card-role-${id}`}
                >
                  {/* Soft glow behind the card on hover */}
                  <div
                    aria-hidden
                    className={`absolute -inset-2 rounded-[18px] bg-gradient-to-br ${accent.glowFrom} ${accent.glowVia} to-transparent opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500`}
                  />

                  <Card
                    className={`relative h-full overflow-hidden ring-1 ring-transparent transition-all duration-300 hover:shadow-2xl hover:shadow-foreground/5 ${accent.ringHover}`}
                  >
                    {/* Decorative corner wash */}
                    <div
                      aria-hidden
                      className={`pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br ${accent.corner} to-transparent blur-2xl`}
                    />

                    {isCurrent && (
                      <div className="absolute top-4 right-4 flex items-center gap-1 rounded-full bg-foreground/5 text-foreground/70 text-[11px] font-medium px-2.5 py-1 border border-foreground/10">
                        <Check className="w-3 h-3" strokeWidth={2.5} />
                        <span>{t('roleSelection.currentBadge')}</span>
                      </div>
                    )}

                    <CardContent className="relative p-7 flex flex-col h-full">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${accent.bubble} ${accent.iconFg} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-3deg]`}
                      >
                        <Icon className="w-6 h-6" strokeWidth={1.75} />
                      </div>
                      <TitleLarge className="mb-2 !text-xl tracking-tight">
                        {config.label[locale]}
                      </TitleLarge>
                      <BodyMedium className="text-muted-foreground flex-1 leading-relaxed">
                        {config.tagline[locale]}
                      </BodyMedium>
                      <div className="mt-6 flex items-center gap-2 text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
                        <span>{t('roleSelection.continue')}</span>
                        <ArrowRight
                          className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1.5"
                          strokeWidth={2}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.button>
              );
            })}
          </motion.div>

          {/* Tiny contextual footer under the cards */}
          <motion.div
            className="mt-12 sm:mt-14 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <BodySmall className="text-muted-foreground">
              {t('roleSelection.helper')}
            </BodySmall>
          </motion.div>
        </div>
      </main>

      {/* NBS typology showcase — scroll-down educational strip */}
      <section className="relative z-10 border-t border-foreground/5 bg-background/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <motion.div
            className="text-center mb-10 sm:mb-12"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
          >
            <BodySmall className="uppercase tracking-[0.2em] text-muted-foreground mb-3">
              {t('roleSelection.showcase.eyebrow')}
            </BodySmall>
            <TitleLarge className="!text-2xl sm:!text-3xl tracking-tight mb-3">
              {t('roleSelection.showcase.title')}
            </TitleLarge>
            <BodyMedium className="text-muted-foreground max-w-2xl mx-auto">
              {t('roleSelection.showcase.subtitle')}
            </BodyMedium>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.06 } },
            }}
          >
            {NBS_TYPOLOGIES.map(({ key, Icon, tone, image }) => {
              const toneStyle = TONE_STYLES[tone];
              const hazards = t(`roleSelection.showcase.typologies.${key}.hazards`, { returnObjects: true }) as string[];
              return (
                <motion.div
                  key={key}
                  variants={{
                    hidden: { opacity: 0, y: 16 },
                    show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
                  }}
                >
                  <div className="group h-full overflow-hidden rounded-xl border border-foreground/10 bg-card hover:border-foreground/20 hover:shadow-lg transition-all duration-300">
                    {/* Image — 16:9, center-cropped, subtle zoom on hover */}
                    <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                      <img
                        src={image}
                        alt={t(`roleSelection.showcase.typologies.${key}.name`)}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
                      />
                      {/* Soft gradient so the icon bubble stays readable */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                      {/* Icon bubble pinned top-left */}
                      <div className={`absolute top-3 left-3 w-10 h-10 rounded-lg flex items-center justify-center backdrop-blur-md bg-white/80 dark:bg-black/40 ${toneStyle.fg} shadow-sm`}>
                        <Icon className="w-5 h-5" strokeWidth={1.75} />
                      </div>
                    </div>
                    {/* Content */}
                    <div className="p-5 sm:p-6">
                      <h3 className="text-base sm:text-lg font-semibold tracking-tight mb-1.5">
                        {t(`roleSelection.showcase.typologies.${key}.name`)}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                        {t(`roleSelection.showcase.typologies.${key}.description`)}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.isArray(hazards) && hazards.map((h, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border ${toneStyle.chip}`}
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Image credits — small, unobtrusive, compliant with CC licensing */}
          <div className="mt-8 text-center">
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              {t('roleSelection.showcase.creditsPrefix')}{' '}
              {NBS_TYPOLOGIES.map((tpy, i) => {
                const name = t(`roleSelection.showcase.typologies.${tpy.key}.name`);
                return (
                  <span key={tpy.key}>
                    {i > 0 ? ' · ' : ''}
                    <span className="text-muted-foreground">
                      {name}
                    </span>
                    <span> © {tpy.credit.author} / {tpy.credit.license}</span>
                  </span>
                );
              })}
              {' · '}
              <a
                href="https://commons.wikimedia.org"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                Wikimedia Commons
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-foreground/5 py-6 px-6 sm:px-10 bg-background/40 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <BodySmall className="text-muted-foreground">
            {t('roleSelection.footer')}
          </BodySmall>
          <div className="flex items-center gap-4">
            <a
              href="https://openearth.org"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('roleSelection.footerLink')} ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
