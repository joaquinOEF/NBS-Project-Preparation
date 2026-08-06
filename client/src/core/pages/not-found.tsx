import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/core/components/ui/card';
import { TitleLarge, BodySmall } from '@oef/components';
import { AlertCircle } from 'lucide-react';

// ⚠️ This page said "404 Page Not Found" and "Did you forget to add the page to
// the router?" — a note from one developer to another, shown to whoever lands
// here. A CBO reaches it by tapping an invite link that WhatsApp truncated, and
// then reads a question about a router. Of everything the cohort could be shown,
// that is the one most likely to make them think the platform isn't for them —
// the exact fear CboDataNoticeDialog exists to answer.
//
// So: their language, plain words, and a next step instead of a dead end.
export default function NotFound() {
  const { t, i18n } = useTranslation();
  const isPt = !(i18n.resolvedLanguage || '').startsWith('en');

  return (
    <div className='min-h-screen w-full flex items-center justify-center bg-gray-50'>
      <Card className='w-full max-w-md mx-4'>
        <CardContent className='pt-6'>
          <div className='flex mb-4 gap-2'>
            <AlertCircle className='h-8 w-8 text-amber-500' />
            <TitleLarge color='content.primary'>
              {t('notFound.title', { defaultValue: isPt ? 'Página não encontrada' : 'Page not found' })}
            </TitleLarge>
          </div>

          <BodySmall color='content.tertiary' className='mt-4'>
            {t('notFound.body', {
              defaultValue: isPt
                ? 'Esse endereço não existe — às vezes o link chega cortado pelo WhatsApp. Se vocês receberam um convite, abre ele de novo pelo link inteiro. Se ainda assim não abrir, fala com quem coordena o grupo de vocês.'
                : "This address doesn't exist — links sometimes arrive truncated. If you were sent an invitation, open it again using the whole link. If it still doesn't open, talk to whoever coordinates your group.",
            })}
          </BodySmall>
        </CardContent>
      </Card>
    </div>
  );
}
