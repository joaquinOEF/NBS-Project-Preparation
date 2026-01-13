import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { DisplayLarge } from '@oef/components';
import { Badge } from '@/core/components/ui/badge';
import { Skeleton } from '@/core/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';

interface Project {
  id: string;
  actionId: string;
  actionName: string;
  actionDescription: string;
  actionType: string;
  cityId: string;
  status: string;
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { isSampleMode, sampleActions, initiatedProjects } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();

  const { data: projectData, isLoading } = useQuery<{ project: Project }>({
    queryKey: ['/api/project', projectId],
    enabled: !isSampleMode && !isSampleRoute && !!projectId,
  });

  if (isSampleMode || isSampleRoute) {
    const action = sampleActions.find(a => a.id === projectId);
    const isInitiated = initiatedProjects.includes(projectId || '');
    
    if (!action || !isInitiated) {
      return (
        <div className="container mx-auto px-4 py-8">
          <Link href={`${routePrefix}/cities`}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>
          <p>{t('project.notFound')}</p>
        </div>
      );
    }

    return (
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
          <Badge variant={action.type === 'mitigation' ? 'default' : 'secondary'}>
            {action.type === 'mitigation' ? t('cityInfo.mitigation') : t('cityInfo.adaptation')}
          </Badge>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-32 mb-4" />
        <Skeleton className="h-12 w-64 mb-2" />
        <Skeleton className="h-6 w-24" />
      </div>
    );
  }

  const project = projectData?.project;

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link href="/cities">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
        </Link>
        <p>{t('project.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link href={`/city-information/${project.cityId}`}>
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('common.back')}
        </Button>
      </Link>

      <div className="mb-8">
        <DisplayLarge>{project.actionName}</DisplayLarge>
        <Badge variant={project.actionType === 'mitigation' ? 'default' : 'secondary'} className="mt-2">
          {project.actionType === 'mitigation' ? t('cityInfo.mitigation') : t('cityInfo.adaptation')}
        </Badge>
      </div>
    </div>
  );
}
