/**
 * Role-selection landing page (Phase 1 of role architecture).
 *
 * Entry point for fresh visitors: pick City / CBO / Orchestrator; we persist
 * the choice via RoleProvider (localStorage + ?role= deep-link) and route
 * into the role's entryRoute. If role is already set, this page redirects.
 *
 * See docs/ROLE-ARCHITECTURE.md.
 */
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Building2, Network, Users } from 'lucide-react';
import { Card, CardContent } from '@/core/components/ui/card';
import { TitleLarge, BodyMedium, BodySmall } from '@oef/components';
import { useRoleContext } from '@/core/contexts/role-context';
import { ROLE_CONFIGS, type AudienceRole } from '@shared/roles';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { analytics } from '@/core/lib/analytics';

type RolePresentation = {
  id: AudienceRole;
  Icon: typeof Building2;
  /** Tailwind classes for the card's icon bubble + accent. */
  accent: { bg: string; fg: string; ring: string };
};

const PRESENTATIONS: RolePresentation[] = [
  {
    id: 'city',
    Icon: Building2,
    accent: {
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      fg: 'text-blue-600 dark:text-blue-300',
      ring: 'group-hover:ring-blue-300 dark:group-hover:ring-blue-700',
    },
  },
  {
    id: 'cbo',
    Icon: Users,
    accent: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      fg: 'text-emerald-600 dark:text-emerald-300',
      ring: 'group-hover:ring-emerald-300 dark:group-hover:ring-emerald-700',
    },
  },
  {
    id: 'orchestrator',
    Icon: Network,
    accent: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      fg: 'text-amber-600 dark:text-amber-300',
      ring: 'group-hover:ring-amber-300 dark:group-hover:ring-amber-700',
    },
  },
];

export default function RoleSelectionPage() {
  const [, setLocation] = useLocation();
  const { role, setRole } = useRoleContext();
  const { i18n, t } = useTranslation();
  const { setSampleMode } = useSampleData();

  const locale: 'en' | 'pt' = i18n.language?.startsWith('pt') ? 'pt' : 'en';

  // If role is already set, skip the gate.
  useEffect(() => {
    if (role) {
      setLocation(ROLE_CONFIGS[role].entryRoute);
    }
  }, [role, setLocation]);

  useEffect(() => {
    analytics.navigation.pageViewed('RoleSelection');
  }, []);

  const choose = (next: AudienceRole) => {
    setRole(next);
    const config = ROLE_CONFIGS[next];
    // Bypass-auth roles go through sample mode so downstream components read
    // the right data source.
    if (config.bypassAuth) {
      setSampleMode(true);
    }
    setLocation(config.entryRoute);
  };

  return (
    <div
      className="min-h-screen relative flex flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-background dark:to-slate-950"
    >
      {/* Subtle decorative glow — ornament, not content */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-gradient-to-b from-emerald-50/40 via-transparent to-transparent dark:from-emerald-950/10"
      />

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
        <div className="flex items-center gap-1 text-xs font-medium">
          <button
            className={`px-2 py-1 rounded-md transition-colors ${locale === 'en' ? 'bg-foreground/10' : 'text-muted-foreground hover:bg-foreground/5'}`}
            onClick={() => i18n.changeLanguage('en')}
            data-testid="button-lang-en"
          >
            EN
          </button>
          <span className="text-muted-foreground/50">·</span>
          <button
            className={`px-2 py-1 rounded-md transition-colors ${locale === 'pt' ? 'bg-foreground/10' : 'text-muted-foreground hover:bg-foreground/5'}`}
            onClick={() => i18n.changeLanguage('pt')}
            data-testid="button-lang-pt"
          >
            PT
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pb-16">
        <div className="w-full max-w-5xl">
          <div className="text-center mb-12 sm:mb-16">
            <BodySmall className="uppercase tracking-[0.2em] text-muted-foreground mb-4">
              {t('roleSelection.eyebrow')}
            </BodySmall>
            <TitleLarge
              className="mb-4 !text-4xl sm:!text-5xl !leading-tight"
              data-testid="text-landing-title"
            >
              {t('roleSelection.title')}
            </TitleLarge>
            <BodyMedium className="text-muted-foreground max-w-2xl mx-auto">
              {t('roleSelection.subtitle')}
            </BodyMedium>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {PRESENTATIONS.map(({ id, Icon, accent }) => {
              const config = ROLE_CONFIGS[id];
              return (
                <button
                  key={id}
                  onClick={() => choose(id)}
                  className="group text-left"
                  data-testid={`card-role-${id}`}
                >
                  <Card
                    className={`h-full transition-all duration-300 ring-1 ring-transparent hover:-translate-y-1 hover:shadow-xl ${accent.ring}`}
                  >
                    <CardContent className="p-7 flex flex-col h-full">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${accent.bg} ${accent.fg} transition-transform duration-300 group-hover:scale-105`}
                      >
                        <Icon className="w-6 h-6" strokeWidth={1.75} />
                      </div>
                      <TitleLarge className="mb-2 !text-xl">
                        {config.label[locale]}
                      </TitleLarge>
                      <BodyMedium className="text-muted-foreground flex-1">
                        {config.tagline[locale]}
                      </BodyMedium>
                      <div className="mt-6 flex items-center gap-2 text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
                        <span>{t('roleSelection.continue')}</span>
                        <ArrowRight
                          className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                          strokeWidth={2}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-foreground/5 py-6 px-6 sm:px-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <BodySmall className="text-muted-foreground">
            {t('roleSelection.footer')}
          </BodySmall>
          <a
            href="https://openearth.org"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Open Earth Foundation ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
