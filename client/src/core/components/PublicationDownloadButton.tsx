// "Dados da publicação (ZIP)" — beside "Todos os perfis (PDF)" in the roster
// header. The ZIP is built live on the server (server/services/
// publicationPackage.ts); the maps are the last upload, so when a pin has moved
// since they were drawn the button says so before anyone sends a stale map.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@/core/components/ui/button';

interface Status { orgs: number; maps: { renderedAt: string; stale: string[] } | null }

export function PublicationDownloadButton({ coordinatorSlug }: { coordinatorSlug: string }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/cohort/${coordinatorSlug}/publication/status`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(s => { if (!off) setStatus(s); })
      .catch(() => {});
    return () => { off = true; };
  }, [coordinatorSlug]);

  const drawn = status?.maps ? new Date(status.maps.renderedAt).toLocaleDateString(i18n.language?.startsWith('pt') ? 'pt-BR' : 'en-GB') : null;
  const stale = status?.maps?.stale ?? [];
  const warn = status && (!status.maps || stale.length > 0);
  const hint = !status ? '' : !status.maps
    ? t('orchestrator.publication.noMaps', { defaultValue: 'No maps uploaded yet — the ZIP has the tables and texts only' })
    : stale.length
      ? t('orchestrator.publication.stale', { defaultValue: 'Maps drawn on {{date}} are out of date: {{list}}', date: drawn, list: stale.join('; ') })
      : t('orchestrator.publication.fresh', { defaultValue: 'Maps drawn on {{date}} with every current pin', date: drawn });

  return (
    <span className="inline-flex items-center gap-2">
      <Button asChild size="sm" variant="outline">
        <a
          href={`/api/cohort/${coordinatorSlug}/publication.zip`}
          download
          data-testid="link-publication-zip"
          title={`${t('orchestrator.publication.hint', { defaultValue: 'Tables, city context, the 27 solutions and the maps — built now from every organisation\'s current pin' })}${hint ? `\n${hint}` : ''}`}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {t('orchestrator.publication.button', { defaultValue: 'Publication data (ZIP)' })}
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a
          href={`/api/cohort/${coordinatorSlug}/publication.xlsx`}
          download
          data-testid="link-publication-xlsx"
          title={t('orchestrator.publication.xlsxHint', { defaultValue: 'The same tables in one Excel workbook, with a tab explaining every column' })}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {t('orchestrator.publication.xlsx', { defaultValue: 'Spreadsheet (Excel)' })}
        </a>
      </Button>
      {status?.maps && (
        <Button asChild size="sm" variant="outline">
          <a
            href={`/api/cohort/${coordinatorSlug}/publication/maps.zip`}
            download
            data-testid="link-publication-maps"
            title={`${t('orchestrator.publication.mapsHint', { defaultValue: 'Flood, heat-wave and landslide hazard (PLAC), today and 2050, on one scale — PNG and PDF' })}\n${hint}`}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {t('orchestrator.publication.maps', { defaultValue: 'Maps (ZIP)' })}
          </a>
        </Button>
      )}
      {warn && (
        <span className="text-[11px] text-amber-700" title={hint} data-testid="publication-maps-warning">
          ⚠ {stale.length ? t('orchestrator.publication.staleShort', { defaultValue: 'maps out of date' }) : t('orchestrator.publication.noMapsShort', { defaultValue: 'no maps yet' })}
        </span>
      )}
    </span>
  );
}
