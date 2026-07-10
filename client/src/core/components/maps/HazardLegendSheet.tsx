import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/core/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import type { LegendSpec } from '@shared/legend-types';
import { legendBands, rampWarning } from '@shared/hazard-legend';
import { DATA_PROVENANCE, type ProvenanceKey } from '@shared/data-provenance';

/**
 * "Como ler este mapa" — the per-hazard legend explainer for the E2 risk tour.
 *
 * A bottom sheet rather than a chat message: on a phone the map panel REPLACES
 * the chat (cbo-profile's mobileActiveTab), so an explanation delivered in chat
 * is an explanation you cannot read while looking at the colors it describes.
 * The sheet caps at 72% height so the tour caption + gradient bar stay visible
 * above it, and only the prose scrolls — the two buttons are pinned, or on a
 * short phone they fall below the fold and the sheet looks like a dead end.
 *
 * Rendered at the ROOT of MapMicroapp, not inside the map pane, so the scrim
 * also covers the action bar. Otherwise "Próximo risco" stays tappable behind
 * the sheet and the user advances the tour while reading about it.
 *
 * Every swatch is sampled from the layer's own LegendSpec — the same array the
 * gradient bar is built from — so the two can never disagree. The only authored
 * color claim is the warning line, and which warning shows (if any) is derived
 * from the ramp's endpoints, not hardcoded per hazard.
 */

interface Props {
  open: boolean;
  /** Which hazard is on screen. Doubles as the DATA_PROVENANCE key. */
  family: ProvenanceKey;
  /** The active layer's legend. Undefined until layer-legends.json resolves. */
  spec: LegendSpec | undefined;
  lang: 'en' | 'pt';
  onClose: () => void;
  /** Escalate into the chat. Omitted in flows with no agent (concept-note). */
  onAskAgent?: () => void;
}

export default function HazardLegendSheet({
  open,
  family,
  spec,
  lang,
  onClose,
  onAskAgent,
}: Props) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);

  // Esc closes. Focus moves into the sheet so a keyboard/screen-reader user
  // isn't left behind on the map underneath.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    sheetRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const bands = legendBands(spec);
  const warning = rampWarning(spec);
  const prov = DATA_PROVENANCE[family]?.[lang];

  const title = t(`mapMicroapp.helpTitle_${family}`, {
    defaultValue: t('mapMicroapp.helpTitle', { defaultValue: 'Como ler este mapa' }),
  });

  return (
    <>
      <div
        className='absolute inset-0 z-[1000] bg-foreground/25'
        onClick={onClose}
        data-testid='map-help-scrim'
      />
      <div
        ref={sheetRef}
        tabIndex={-1}
        role='dialog'
        aria-modal='true'
        aria-label={title}
        className='absolute inset-x-0 bottom-0 z-[1001] flex max-h-[72%] flex-col rounded-t-xl border-t bg-background pt-2 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.45)] outline-none'
        data-testid='map-help-sheet'
      >
        <div className='mx-auto mb-2.5 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/30' />

        {/* Only the prose scrolls; the buttons below stay pinned. */}
        <div className='min-h-0 flex-1 overflow-y-auto px-4'>
          <h3 className='text-xs font-semibold mb-2'>{title}</h3>

          {bands.length > 0 ? (
            <div className='grid gap-1 mb-2.5' data-testid='map-help-bands'>
              {bands.map(band => (
                <div key={band.key} className='flex items-center gap-2.5'>
                  <span
                    className='h-4 w-7 shrink-0 rounded-sm border border-foreground/15'
                    style={{ background: band.color }}
                  />
                  <span className='text-[11px] flex-1'>
                    {t(`riskBands.${band.key}`)}
                  </span>
                  <span className='text-[9px] tabular-nums text-muted-foreground'>
                    {band.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className='text-[11px] text-muted-foreground mb-2.5'>
              {t('mapMicroapp.helpNoLegend', {
                defaultValue: 'A escala de cores deste mapa ainda está carregando.',
              })}
            </p>
          )}

          {/* Shown only when the ramp's own endpoints say it's misleading, so it
              disappears on its own if the tiles are ever re-baked. */}
          {warning && (
            <div
              className='mb-2.5 flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
              data-testid={`map-help-warn-${warning}`}
            >
              <AlertTriangle className='mt-px h-3.5 w-3.5 shrink-0' />
              <span>
                {warning === 'inverted'
                  ? t('mapMicroapp.helpWarnInverted', {
                      defaultValue:
                        'Neste mapa o verde é o risco ALTO — não o baixo.',
                    })
                  : t('mapMicroapp.helpWarnLowContrast', {
                      defaultValue:
                        'Quase toda a cidade fica na faixa mais baixa — as diferenças de cor aqui são sutis.',
                    })}
              </span>
            </div>
          )}

          <p className='text-[11px] leading-snug text-foreground/75 mb-1.5'>
            {t('mapMicroapp.helpRelative', {
              defaultValue:
                'A cor compara a cidade com ela mesma: "Muito Alto" é o mais alto daqui.',
            })}
          </p>

          {prov?.caveat && (
            <p className='text-[11px] leading-snug text-foreground/75 pb-3'>
              {prov.caveat}
            </p>
          )}
        </div>

        <div className='flex shrink-0 gap-2 border-t bg-background px-4 py-3'>
          <Button
            size='sm'
            className='h-7 flex-1 text-xs'
            onClick={onClose}
            data-testid='map-help-understood'
          >
            {t('mapMicroapp.helpUnderstood', { defaultValue: 'Entendi' })}
          </Button>
          {onAskAgent && (
            <Button
              size='sm'
              variant='outline'
              className='h-7 flex-1 text-xs'
              onClick={onAskAgent}
              data-testid='map-help-ask'
            >
              {t('mapMicroapp.helpAskAgent', {
                defaultValue: 'Tenho outra dúvida',
              })}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
