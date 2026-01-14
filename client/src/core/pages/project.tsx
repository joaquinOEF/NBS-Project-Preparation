import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Map, ArrowRight, DollarSign, Settings } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { DisplayLarge } from '@oef/components';
import { Badge } from '@/core/components/ui/badge';
import { Skeleton } from '@/core/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
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
            <Badge variant={action.type === 'mitigation' ? 'default' : 'secondary'}>
              {action.type === 'mitigation' ? t('cityInfo.mitigation') : t('cityInfo.adaptation')}
            </Badge>
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
          <Badge variant={project.actionType === 'mitigation' ? 'default' : 'secondary'} className="mt-2">
            {project.actionType === 'mitigation' ? t('cityInfo.mitigation') : t('cityInfo.adaptation')}
          </Badge>
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
        </div>
      </div>
    </div>
  );
}
