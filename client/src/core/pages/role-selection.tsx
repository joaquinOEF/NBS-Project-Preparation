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
import { ArrowRight, Building2, Check, Network, Sparkles, Users } from 'lucide-react';
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
  const { setSampleMode } = useSampleData();

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
