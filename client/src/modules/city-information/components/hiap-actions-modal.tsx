import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/core/components/ui/dialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { Skeleton } from '@/core/components/ui/skeleton';
import { useHIAPData } from '../hooks/useHIAPData';
import { HIAPRankedAction } from '../types/city-info';
import {
  Leaf,
  Shield,
  AlertTriangle,
  Clock,
  DollarSign,
  Target,
  Users,
  TreePine,
  Droplets,
  Wind,
  Home,
  Car,
} from 'lucide-react';

interface SampleAction {
  id: string;
  name: string;
  description: string;
  ghg_reduction_potential?: string;
  risk_addressed?: string;
  cost_level: string;
  implementation_timeline: string;
  co_benefits: string[];
  kpis: string[];
}

interface HIAPActionsModalProps {
  inventoryId: string;
  actionType: 'mitigation' | 'adaptation';
  trigger: React.ReactNode;
  title: string;
  description: string;
  isSampleMode?: boolean;
  sampleData?: { data: { actions: SampleAction[] } };
}

export function HIAPActionsModal({
  inventoryId,
  actionType,
  trigger,
  title,
  description,
  isSampleMode = false,
  sampleData,
}: HIAPActionsModalProps) {
  const [open, setOpen] = useState(false);

  const {
    data: hiapData,
    isLoading,
    error,
  } = useHIAPData(
    open && !isSampleMode ? inventoryId : undefined,
    actionType,
    'en'
  );

  const getCostColor = (cost: string) => {
    const costLower = cost.toLowerCase();
    if (costLower === 'low') return 'text-green-600 bg-green-50';
    if (costLower === 'medium') return 'text-yellow-600 bg-yellow-50';
    if (costLower === 'high') return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getCobenefit = (value: number) => {
    if (value >= 2) return { color: 'text-green-600', label: 'High' };
    if (value >= 1) return { color: 'text-yellow-600', label: 'Medium' };
    return { color: 'text-gray-500', label: 'Low' };
  };

  const renderCobenefit = (key: string, value: number) => {
    const icons: Record<string, any> = {
      habitat: TreePine,
      housing: Home,
      mobility: Car,
      air_quality: Wind,
      water_quality: Droplets,
      cost_of_living: DollarSign,
      stakeholder_engagement: Users,
    };

    const Icon = icons[key] || Target;
    const benefit = getCobenefit(value);

    return (
      <div key={key} className='flex items-center gap-1'>
        <Icon className={`h-3 w-3 ${benefit.color}`} />
        <span className='text-xs capitalize'>
          {key.replace(/_/g, ' ')}:{' '}
          <span className={benefit.color}>{benefit.label}</span>
        </span>
      </div>
    );
  };

  const renderSampleActionCard = (action: SampleAction, index: number) => (
    <Card key={action.id} className='border' data-testid={`card-action-${index}`}>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between mb-2'>
          <Badge
            variant={actionType === 'mitigation' ? 'default' : 'secondary'}
            className='text-xs'
          >
            Action #{index + 1}
          </Badge>
          <div className='flex gap-2'>
            <Badge
              variant='outline'
              className={`text-xs ${getCostColor(action.cost_level)}`}
            >
              {action.cost_level} cost
            </Badge>
            <Badge variant='outline' className='text-xs'>
              <Clock className='h-3 w-3 mr-1' />
              {action.implementation_timeline}
            </Badge>
          </div>
        </div>
        <CardTitle className='text-sm font-medium leading-tight'>
          {action.name}
        </CardTitle>
      </CardHeader>
      <CardContent className='pt-0 space-y-4'>
        <p className='text-sm text-muted-foreground'>{action.description}</p>

        {action.ghg_reduction_potential && (
          <div>
            <label className='text-xs font-medium text-muted-foreground'>
              GHG Reduction Potential:
            </label>
            <Badge variant='secondary' className='ml-2 text-xs'>
              {action.ghg_reduction_potential}
            </Badge>
          </div>
        )}

        {action.risk_addressed && (
          <div>
            <label className='text-xs font-medium text-muted-foreground'>
              Risk Addressed:
            </label>
            <Badge variant='outline' className='ml-2 text-xs'>
              {action.risk_addressed}
            </Badge>
          </div>
        )}

        <div>
          <label className='text-xs font-medium text-muted-foreground'>
            Co-benefits:
          </label>
          <div className='flex flex-wrap gap-1 mt-1'>
            {action.co_benefits.map((benefit, idx) => (
              <Badge key={idx} variant='outline' className='text-xs'>
                {benefit}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <label className='text-xs font-medium text-muted-foreground'>
            Key Performance Indicators:
          </label>
          <ul className='text-xs text-muted-foreground mt-1 space-y-1'>
            {action.kpis.map((kpi, idx) => (
              <li key={idx} className='flex items-start gap-1'>
                <Target className='h-3 w-3 text-primary mt-0.5 flex-shrink-0' />
                <span className='flex-1'>{kpi}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );

  const renderActionCard = (action: HIAPRankedAction, index: number) => (
    <Card
      key={action.id}
      className='border'
      data-testid={`card-action-${index}`}
    >
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between mb-2'>
          <Badge
            variant={actionType === 'mitigation' ? 'default' : 'secondary'}
            className='text-xs'
          >
            Rank #{action.rank}
          </Badge>
          <div className='flex gap-2'>
            <Badge
              variant='outline'
              className={`text-xs ${getCostColor(action.costInvestmentNeeded)}`}
            >
              {action.costInvestmentNeeded} cost
            </Badge>
            <Badge variant='outline' className='text-xs'>
              <Clock className='h-3 w-3 mr-1' />
              {action.timelineForImplementation}
            </Badge>
          </div>
        </div>
        <CardTitle className='text-sm font-medium leading-tight'>
          {action.name}
        </CardTitle>
      </CardHeader>
      <CardContent className='pt-0 space-y-4'>
        <p className='text-sm text-muted-foreground'>{action.description}</p>

        <div>
          <label className='text-xs font-medium text-muted-foreground'>
            Sectors:
          </label>
          <div className='flex flex-wrap gap-1 mt-1'>
            {action.sectors.map((sector, idx) => (
              <Badge key={idx} variant='outline' className='text-xs'>
                {sector.toUpperCase()}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <label className='text-xs font-medium text-muted-foreground'>
            Co-benefits:
          </label>
          <div className='grid grid-cols-2 gap-1 mt-2'>
            {Object.entries(action.cobenefits)
              .filter(([_, value]) => value > 0)
              .map(([key, value]) => renderCobenefit(key, value))}
          </div>
        </div>

        {action.GHGReductionPotential &&
          Object.values(action.GHGReductionPotential).some(v => v) && (
            <div>
              <label className='text-xs font-medium text-muted-foreground'>
                GHG Reduction Potential:
              </label>
              <div className='flex flex-wrap gap-1 mt-1'>
                {Object.entries(action.GHGReductionPotential)
                  .filter(([_, value]) => value)
                  .map(([sector, potential]) => (
                    <Badge key={sector} variant='secondary' className='text-xs'>
                      {sector}: {potential}%
                    </Badge>
                  ))}
              </div>
            </div>
          )}

        {action.dependencies && action.dependencies.length > 0 && (
          <div>
            <label className='text-xs font-medium text-muted-foreground'>
              Key Dependencies:
            </label>
            <ul className='text-xs text-muted-foreground mt-1 space-y-1'>
              {action.dependencies.slice(0, 2).map((dep, idx) => (
                <li key={idx} className='flex items-start gap-1'>
                  <span className='text-primary'>•</span>
                  <span className='flex-1'>{dep}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {action.keyPerformanceIndicators &&
          action.keyPerformanceIndicators.length > 0 && (
            <div>
              <label className='text-xs font-medium text-muted-foreground'>
                Key Performance Indicators:
              </label>
              <ul className='text-xs text-muted-foreground mt-1 space-y-1'>
                {action.keyPerformanceIndicators.slice(0, 2).map((kpi, idx) => (
                  <li key={idx} className='flex items-start gap-1'>
                    <Target className='h-3 w-3 text-primary mt-0.5 flex-shrink-0' />
                    <span className='flex-1'>{kpi}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        <div className='flex justify-between text-xs'>
          <span className='text-muted-foreground'>Implementation Level:</span>
          <div className='flex gap-1'>
            {action.powersAndMandates.map((power, idx) => (
              <Badge key={idx} variant='outline' className='text-xs'>
                {power}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderContent = () => {
    if (isSampleMode && sampleData) {
      const actions = sampleData.data.actions || [];
      return (
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <h4 className='font-medium text-sm'>
              {actions.length} Sample Actions
            </h4>
            <Badge variant='secondary' className='text-xs'>
              Sample Data
            </Badge>
          </div>
          <div className='grid grid-cols-1 gap-4 max-h-96 overflow-y-auto'>
            {actions.map((action, index) => renderSampleActionCard(action, index))}
          </div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className='space-y-4'>
          {[1, 2, 3].map(i => (
            <div key={i} className='space-y-2'>
              <Skeleton className='h-4 w-3/4' />
              <Skeleton className='h-32 w-full' />
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className='text-center py-8'>
          <AlertTriangle className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
          <h3 className='text-lg font-semibold mb-2'>Unable to load actions</h3>
          <p
            className='text-muted-foreground text-sm'
            data-testid='text-hiap-error'
          >
            {error instanceof Error
              ? error.message
              : 'Failed to fetch action data'}
          </p>
        </div>
      );
    }

    if (!hiapData?.data) {
      return (
        <div className='text-center py-8'>
          <div className='h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4'>
            {actionType === 'mitigation' ? (
              <Leaf className='h-6 w-6' />
            ) : (
              <Shield className='h-6 w-6' />
            )}
          </div>
          <h3 className='text-lg font-semibold mb-2'>No actions available</h3>
          <p className='text-muted-foreground'>
            No {actionType} actions are available for this inventory.
          </p>
        </div>
      );
    }

    const actions = hiapData.data.rankedActions || [];

    if (!Array.isArray(actions) || actions.length === 0) {
      return (
        <div className='space-y-2'>
          <h4 className='font-medium'>Raw HIAP Data</h4>
          <pre
            className='text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-96'
            data-testid='text-hiap-raw-data'
          >
            {JSON.stringify(hiapData.data, null, 2)}
          </pre>
        </div>
      );
    }

    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <h4 className='font-medium text-sm'>
            {actions.length} Ranked Actions
          </h4>
          <Badge variant='outline' className='text-xs'>
            Status: {hiapData.data.status}
          </Badge>
        </div>
        <div className='grid grid-cols-1 gap-4 max-h-96 overflow-y-auto'>
          {actions.map((action, index) => renderActionCard(action, index))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[80vh] overflow-hidden'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {actionType === 'mitigation' ? (
              <Leaf className='h-5 w-5 text-green-600' />
            ) : (
              <Shield className='h-5 w-5 text-blue-600' />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className='mt-4'>{renderContent()}</div>
      </DialogContent>
    </Dialog>
  );
}
