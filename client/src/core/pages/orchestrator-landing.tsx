/**
 * Orchestrator "coming soon" stub (Phase 1).
 *
 * The real portfolio view is Phase 3. This page is what role=orchestrator
 * lands on for now — honest placeholder with a way to switch role.
 *
 * See docs/ROLE-ARCHITECTURE.md.
 */
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Network } from 'lucide-react';
import { Card, CardContent } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { TitleLarge, BodyMedium, BodySmall } from '@oef/components';
import { useResetRole } from '@/core/contexts/role-context';

export default function OrchestratorLandingPage() {
  const { t } = useTranslation();
  const switchRole = useResetRole();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-background dark:to-slate-950">
      <div className="w-full max-w-xl">
        <Card>
          <CardContent className="p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300 flex items-center justify-center mb-6">
              <Network className="w-7 h-7" strokeWidth={1.75} />
            </div>
            <TitleLarge className="mb-3" data-testid="text-orchestrator-title">
              {t('orchestrator.title')}
            </TitleLarge>
            <BodyMedium className="text-muted-foreground mb-2">
              {t('orchestrator.subtitle')}
            </BodyMedium>
            <BodySmall className="text-muted-foreground mb-8">
              {t('orchestrator.status')}
            </BodySmall>
            <Button
              variant="outline"
              onClick={switchRole}
              data-testid="button-orchestrator-switch-role"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('orchestrator.switchRole')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
