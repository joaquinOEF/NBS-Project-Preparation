import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/core/components/ui/card';
import { CCTerraButton } from '@oef/components';
import { TitleMedium, BodySmall, LabelSmall } from '@oef/components';
import { Badge } from '@/core/components/ui/badge';
import { CityCatalystInventory } from '../types/city-info';
import { Calendar, Database, ExternalLink, Activity } from 'lucide-react';
import { InventoryDetailsModal } from './inventory-details-modal';
import { analytics } from '@/core/lib/analytics';

interface InventoryCardProps {
  inventory: {
    year: number;
    inventoryId: string;
    lastUpdate: string;
  };
  cityName: string;
  locode: string;
  onSelect?: () => void;
}

export function InventoryCard({
  inventory,
  cityName,
  locode,
  onSelect,
}: InventoryCardProps) {
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  const handleInventorySelect = () => {
    analytics.inventory.itemSelected(inventory.inventoryId, 'emissions');
    onSelect?.();
  };

  return (
    <Card
      className='hover:shadow-md transition-shadow'
      data-testid={`card-inventory-${inventory.year}`}
    >
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2'>
            <Calendar className='h-4 w-4' />
            <TitleMedium>{inventory.year}</TitleMedium>
          </CardTitle>
          <Badge
            variant='outline'
            data-testid={`badge-inventory-year-${inventory.year}`}
          >
            <Activity className='h-3 w-3 mr-1' />
            Emissions
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='text-sm'>
          <BodySmall color='content.tertiary'>
            Emissions inventory for {cityName}
          </BodySmall>
          <LabelSmall color='content.tertiary' className='font-mono mt-1'>
            ID: {inventory.inventoryId}
          </LabelSmall>
        </div>

        <div className='space-y-2 text-sm'>
          <div className='flex items-center gap-2'>
            <Database className='h-3 w-3' />
            <BodySmall color='content.tertiary'>UN/LOCODE: {locode}</BodySmall>
          </div>
          <div className='flex items-center gap-2'>
            <Calendar className='h-3 w-3' />
            <BodySmall color='content.tertiary'>
              Updated: {formatDate(inventory.lastUpdate)}
            </BodySmall>
          </div>
        </div>

        <InventoryDetailsModal
          inventoryId={inventory.inventoryId}
          year={inventory.year}
          cityName={cityName}
        >
          <CCTerraButton
            className='w-full'
            variant='outlined'
            data-testid={`button-view-inventory-${inventory.year}`}
            onClick={handleInventorySelect}
            leftIcon={<ExternalLink className='h-4 w-4' />}
          >
            View Details
          </CCTerraButton>
        </InventoryDetailsModal>
      </CardContent>
    </Card>
  );
}
