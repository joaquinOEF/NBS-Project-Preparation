import { useParams, Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Skeleton } from '@/core/components/ui/skeleton';
import { Header } from '@/core/components/layout/header';
import {
  HeadlineLarge,
  DisplayLarge,
  BodySmall,
} from '@oef/components';
import { useCityInformation } from '../hooks/useCityInformation';
import {
  MapPin,
  Globe,
  ArrowLeft,
  Leaf,
  Shield,
  AlertCircle,
  ArrowRight,
  FolderOpen,
  Undo2,
  TreePine,
  Building2,
  Bus,
  Thermometer,
  Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ACTION_ICONS: Record<string, { type: 'lucide'; icon: LucideIcon } | { type: 'image'; src: string }> = {
  'sample-mit-1': { type: 'lucide', icon: TreePine },
  'sample-mit-2': { type: 'lucide', icon: Building2 },
  'sample-mit-3': { type: 'lucide', icon: Bus },
  'sample-ada-1': { type: 'image', src: '/assets/nbs-icon.png' },
  'sample-ada-2': { type: 'lucide', icon: Thermometer },
  'sample-ada-3': { type: 'lucide', icon: Waves },
};
import { useTranslation } from 'react-i18next';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/core/lib/queryClient';
import { track } from '@/core/lib/analytics';

interface Project {
  id: string;
  actionId: string;
  actionName: string;
  actionDescription: string;
  actionType: string;
  cityId: string;
  status: string;
}

export default function CityInformation() {
  const { cityId } = useParams<{ cityId: string }>();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { isSampleMode, sampleCity, sampleActions, initiatedProjects, initiateProject, uninitateProject } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();

  const shouldFetchFromApi = !isSampleMode && !isSampleRoute;
  
  const { data: cityInfo, isLoading, error } = useCityInformation(cityId, shouldFetchFromApi);

  const { data: projectsData } = useQuery<{ projects: Project[] }>({
    queryKey: ['/api/projects', cityId],
    enabled: shouldFetchFromApi && !!cityId,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (action: { id: string; name: string; description: string; type: string; cityId: string }) => {
      return apiRequest('POST', '/api/projects', {
        actionId: action.id,
        actionName: action.name,
        actionDescription: action.description,
        actionType: action.type,
        cityId: action.cityId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', cityId] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest('DELETE', `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', cityId] });
    },
  });

  const useSampleContent = isSampleMode || isSampleRoute;
  
  const cityData = useSampleContent ? sampleCity : cityInfo?.data;
  const city = cityData ? {
    name: cityData.name,
    country: cityData.country,
    locode: cityData.locode,
  } : null;

  const cityActions = useSampleContent 
    ? sampleActions.filter(a => a.cityId === cityId)
    : [];

  const initiatedProjectIds = useSampleContent 
    ? initiatedProjects 
    : (projectsData?.projects || []).map(p => p.actionId);

  const selectedActions = cityActions.filter(a => !initiatedProjectIds.includes(a.id));
  const initiatedProjectActions = cityActions.filter(a => initiatedProjectIds.includes(a.id));

  const handleStartProject = (action: { id: string; name: string; description: string; type: string; cityId: string }) => {
    track('Climate Action - Start Project', {
      actionId: action.id,
      actionName: action.name,
      actionType: action.type,
      cityId: action.cityId,
      isSampleMode,
    });

    if (isSampleMode || isSampleRoute) {
      initiateProject(action.id);
      if (action.id === 'sample-ada-1') {
        setLocation(`${routePrefix}/project/${action.id}`);
      }
    } else {
      createProjectMutation.mutate(action, {
        onSuccess: (response: any) => {
          setLocation(`/project/${response.project.id}`);
        },
      });
    }
  };

  const handleGoToProject = (actionId: string, projectId?: string) => {
    track('Climate Action - Go to Project', {
      actionId,
      projectId,
      isSampleMode,
    });

    if (isSampleMode || isSampleRoute) {
      setLocation(`${routePrefix}/project/${actionId}`);
    } else if (projectId) {
      setLocation(`/project/${projectId}`);
    }
  };

  const handleRemoveProject = (actionId: string, projectId?: string) => {
    track('Climate Action - Remove Project', {
      actionId,
      projectId,
      isSampleMode,
    });

    if (isSampleMode || isSampleRoute) {
      uninitateProject(actionId);
    } else if (projectId) {
      deleteProjectMutation.mutate(projectId);
    }
  };

  if (isLoading && !useSampleContent) {
    return (
      <div className='min-h-screen bg-background'>
        <Header />
        <div className='container mx-auto px-4 py-8'>
          <Skeleton className='h-8 w-32 mb-4' />
          <Skeleton className='h-12 w-64 mb-2' />
          <Skeleton className='h-6 w-48' />
        </div>
      </div>
    );
  }

  if (error && !isSampleMode && !isSampleRoute) {
    return (
      <div className='min-h-screen bg-background'>
        <Header />
        <div className='container mx-auto px-4 py-8'>
          <Link href={`${routePrefix}/cities`}>
            <Button variant='ghost' className='mb-4'>
              <ArrowLeft className='h-4 w-4 mr-2' />
              {t('common.back')}
            </Button>
          </Link>
          <p className='text-destructive'>{t('errors.loadFailed')}</p>
        </div>
      </div>
    );
  }

  const renderActionCard = (action: { id: string; name: string; description: string; type: string; cityId: string }, isInitiated: boolean) => {
    const project = !useSampleContent 
      ? (projectsData?.projects || []).find(p => p.actionId === action.id)
      : null;

    const actionIcon = ACTION_ICONS[action.id];

    return (
      <Card key={action.id} className='mb-4'>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              {actionIcon && (
                actionIcon.type === 'image' ? (
                  <img src={actionIcon.src} alt='' className='h-6 w-6 rounded' />
                ) : (
                  <actionIcon.icon className='h-5 w-5 text-muted-foreground shrink-0' />
                )
              )}
              <CardTitle className='text-lg'>{action.name}</CardTitle>
            </div>
            <Badge variant={action.type === 'mitigation' ? 'default' : 'secondary'}>
              {action.type === 'mitigation' ? t('cityInfo.mitigation') : t('cityInfo.adaptation')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground mb-4'>{action.description}</p>
          {isInitiated ? (
            <div className='flex gap-2'>
              {useSampleContent && action.id !== 'sample-ada-1' ? (
                <Button
                  disabled
                  variant='outline'
                  className='flex-1'
                >
                  {t('cityInfo.moduleComingSoon')}
                </Button>
              ) : (
                <Button
                  onClick={() => handleGoToProject(action.id, project?.id)}
                  className='flex-1'
                >
                  {t('cityInfo.goToProject')}
                  <ArrowRight className='h-4 w-4 ml-2' />
                </Button>
              )}
              <Button
                variant='ghost'
                size='icon'
                onClick={() => handleRemoveProject(action.id, project?.id)}
                disabled={deleteProjectMutation.isPending}
                title={t('cityInfo.removeProject')}
              >
                <Undo2 className='h-4 w-4' />
              </Button>
            </div>
          ) : (
            <Button 
              onClick={() => handleStartProject(action)}
              variant='outline'
              className='w-full'
              disabled={createProjectMutation.isPending}
            >
              {t('cityInfo.startProject')}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className='min-h-screen bg-background'>
      <Header />
      <div className='container mx-auto px-4 py-8'>
        <Link href={`${routePrefix}/cities`}>
          <Button variant='ghost' className='mb-4'>
            <ArrowLeft className='h-4 w-4 mr-2' />
            {t('common.back')}
          </Button>
        </Link>

        <div className='mb-8'>
          <div className='flex items-center gap-3 mb-2'>
            <DisplayLarge data-testid='text-city-name'>
              {city?.name}
            </DisplayLarge>
            {useSampleContent && (
              <Badge variant='secondary' data-testid='badge-sample-mode'>
                {t('citySelection.sampleDataBadge')}
              </Badge>
            )}
          </div>
          <div className='flex flex-wrap gap-4 items-center text-muted-foreground'>
            <div className='flex items-center gap-2'>
              <Globe className='h-4 w-4' />
              <span data-testid='text-city-country'>{city?.country}</span>
            </div>
            <div className='flex items-center gap-2'>
              <MapPin className='h-4 w-4' />
              <span data-testid='text-city-locode'>{city?.locode}</span>
            </div>
          </div>
        </div>

        {useSampleContent && (
          <div className='mb-6 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-3'>
            <AlertCircle className='h-5 w-5 text-blue-600' />
            <BodySmall className='text-blue-700 dark:text-blue-300'>
              {t('cityInfo.sampleDataNotice')}
            </BodySmall>
          </div>
        )}

        <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
          <div>
            <div className='flex items-center gap-2 mb-4'>
              <Leaf className='h-5 w-5 text-green-600' />
              <HeadlineLarge>{t('cityInfo.selectedActions')}</HeadlineLarge>
            </div>
            
            {selectedActions.length > 0 ? (
              selectedActions.map(action => renderActionCard(action, false))
            ) : (
              <Card className='border-dashed'>
                <CardContent className='py-8 text-center'>
                  <FolderOpen className='h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50' />
                  <p className='text-muted-foreground mb-2'>{t('cityInfo.noSelectedActions')}</p>
                  <p className='text-sm text-muted-foreground'>{t('cityInfo.emptySelectedActionsHint')}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            <div className='flex items-center gap-2 mb-4'>
              <Shield className='h-5 w-5 text-blue-600' />
              <HeadlineLarge>{t('cityInfo.initiatedProjects')}</HeadlineLarge>
            </div>
            
            {initiatedProjectActions.length > 0 ? (
              initiatedProjectActions.map(action => renderActionCard(action, true))
            ) : (
              <Card className='border-dashed'>
                <CardContent className='py-8 text-center'>
                  <FolderOpen className='h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50' />
                  <p className='text-muted-foreground'>{t('cityInfo.noInitiatedProjects')}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
