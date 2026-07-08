import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/core/components/ui/dialog';
import { Button } from '@/core/components/ui/button';
import { Skeleton } from '@/core/components/ui/skeleton';
import { Badge } from '@/core/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/core/components/ui/tabs';
import { useInventory } from '../hooks/useCityInfo';
import { X, Download, Table, BarChart3 } from 'lucide-react';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  locode: string;
  year: number;
  cityName: string;
}

export function InventoryModal({
  isOpen,
  onClose,
  locode,
  year,
  cityName,
}: InventoryModalProps) {
  const [activeTab, setActiveTab] = useState('table');
  const { data: inventory, isLoading, error } = useInventory(locode, year);

  // Reset tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('table');
    }
  }, [isOpen]);

  const renderInventoryData = () => {
    if (isLoading) {
      return (
        <div className='space-y-4'>
          <Skeleton className='h-8 w-full' />
          <Skeleton className='h-32 w-full' />
          <Skeleton className='h-8 w-full' />
          <Skeleton className='h-32 w-full' />
        </div>
      );
    }

    if (error) {
      return (
        <div className='text-center py-8'>
          <p className='text-destructive font-medium'>
            Failed to load inventory data
          </p>
          <p className='text-sm text-muted-foreground mt-2'>
            {error instanceof Error ? error.message : 'Unknown error occurred'}
          </p>
        </div>
      );
    }

    if (!inventory) {
      return (
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>No inventory data available</p>
        </div>
      );
    }

    // Display the raw inventory data for now
    // This will be enhanced with proper GPC sector organization
    return (
      <div className='space-y-4'>
        <div className='bg-muted/50 rounded-lg p-4'>
          <h3 className='font-medium mb-2'>Raw Inventory Data</h3>
          <p className='text-sm text-muted-foreground mb-3'>
            This shows the actual data structure returned by CityCatalyst API
          </p>
          <pre className='text-xs bg-background p-3 rounded border overflow-auto max-h-96'>
            {JSON.stringify(inventory, null, 2)}
          </pre>
        </div>

        <div className='text-sm text-muted-foreground'>
          <p>
            <strong>Note:</strong> This displays the raw API response structure.
            Can be enhanced with custom data parsing and organization.
          </p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='max-w-4xl max-h-[80vh] overflow-hidden'>
        <DialogHeader>
          <div className='flex items-center justify-between'>
            <div>
              <DialogTitle
                className='text-xl'
                data-testid='modal-inventory-title'
              >
                {cityName} - {year} Emissions Inventory
              </DialogTitle>
              <DialogDescription>
                UN/LOCODE: {locode} • Year: {year}
              </DialogDescription>
            </div>
            <div className='flex items-center gap-2'>
              <Badge variant='secondary'>{year}</Badge>
              <Button variant='ghost' size='icon' onClick={onClose}>
                <X className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className='flex-1 min-h-0'
        >
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='table' className='flex items-center gap-2'>
              <Table className='h-4 w-4' />
              Data Table
            </TabsTrigger>
            <TabsTrigger value='raw' className='flex items-center gap-2'>
              <BarChart3 className='h-4 w-4' />
              Raw Data
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value='table'
            className='mt-4 flex-1 min-h-0 overflow-auto'
          >
            <div className='space-y-4'>
              <div className='flex justify-between items-center'>
                <h3 className='font-medium'>Emissions by GPC Sector</h3>
                <Button variant='outline' size='sm'>
                  <Download className='h-4 w-4 mr-2' />
                  Export CSV
                </Button>
              </div>
              {renderInventoryData()}
            </div>
          </TabsContent>

          <TabsContent
            value='raw'
            className='mt-4 flex-1 min-h-0 overflow-auto'
          >
            {renderInventoryData()}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
