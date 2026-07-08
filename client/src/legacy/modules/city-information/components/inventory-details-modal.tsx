import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/core/components/ui/dialog';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Skeleton } from '@/core/components/ui/skeleton';
import {
  ExternalLink,
  Calendar,
  Database,
  Building2,
  Activity,
  Clock,
  BarChart3,
  Zap,
  AlertCircle,
} from 'lucide-react';
import {
  useInventoryDetails,
  useInventoryDetailsDownload,
  type InventoryValue,
} from '../hooks/useInventoryDetails';
import { format } from 'date-fns';
import { useState } from 'react';
import { analytics } from '@/core/lib/analytics';

interface InventoryDetailsModalProps {
  inventoryId: string;
  year: number;
  cityName: string;
  children: React.ReactNode;
}

export function InventoryDetailsModal({
  inventoryId,
  year,
  cityName,
  children,
}: InventoryDetailsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    data: inventoryData,
    isLoading,
    error,
  } = useInventoryDetails(isOpen ? inventoryId : undefined);
  const {
    data: inventoryDownloadData,
    isLoading: isLoadingDownload,
    error: errorDownload,
  } = useInventoryDetailsDownload(isOpen ? inventoryId : undefined);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      analytics.inventory.detailsOpened(inventoryId);
    }
  };

  const formattedDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy');
    } catch {
      return 'Unknown';
    }
  };

  // Helper function to format emissions values
  const formatEmissions = (co2eq: string | number) => {
    const value = typeof co2eq === 'string' ? parseFloat(co2eq) : co2eq;
    if (isNaN(value)) return 'N/A';
    return `${value.toLocaleString()} CO₂e`;
  };

  // Helper function to get GPC sector name from reference number
  const getSectorName = (gpcRef: string) => {
    const sectorMap: { [key: string]: string } = {
      I: 'Stationary Energy',
      II: 'Transportation',
      III: 'Waste',
      IV: 'Industrial Processes and Product Use (IPPU)',
      V: 'Agriculture, Forestry and Other Land Use (AFOLU)',
    };
    const sectorNumber = gpcRef.split('.')[0];
    return sectorMap[sectorNumber] || `Sector ${sectorNumber}`;
  };

  // Helper function to organize inventory values by sector
  const organizeInventoryValuesBySector = (
    inventoryValues: InventoryValue[]
  ) => {
    const sectors: {
      [key: string]: { name: string; values: InventoryValue[] };
    } = {};

    inventoryValues.forEach(value => {
      const sectorNumber = value.gpcReferenceNumber.split('.')[0];
      if (!sectors[sectorNumber]) {
        sectors[sectorNumber] = {
          name: getSectorName(value.gpcReferenceNumber),
          values: [],
        };
      }
      sectors[sectorNumber].values.push(value);
    });

    return sectors;
  };

  const renderContent = () => {
    if (!isOpen) return null;

    if (isLoading || isLoadingDownload) {
      return (
        <>
          <DialogHeader>
            <DialogTitle>Loading Inventory Details...</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-4 w-1/2' />
            <Skeleton className='h-20 w-full' />
            <Skeleton className='h-32 w-full' />
          </div>
        </>
      );
    }

    if (error || !inventoryData?.data) {
      return (
        <>
          <DialogHeader>
            <DialogTitle>Error Loading Inventory Details</DialogTitle>
          </DialogHeader>
          <p className='text-destructive'>
            Failed to load inventory details:{' '}
            {error?.message || 'Unknown error'}
          </p>
        </>
      );
    }

    const inventory = inventoryData.data;
    return (
      <>
        <DialogHeader>
          <DialogTitle
            className='flex items-center gap-2 text-xl'
            data-testid='text-inventory-title'
          >
            <Database className='h-5 w-5' />
            {inventory.inventoryName}
          </DialogTitle>
        </DialogHeader>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* Basic Information */}
          <div className='space-y-4'>
            <h3 className='text-lg font-semibold flex items-center gap-2'>
              <Calendar className='h-4 w-4' />
              Basic Information
            </h3>

            <div className='grid grid-cols-2 gap-3 text-sm'>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Year
                </label>
                <p
                  className='text-foreground'
                  data-testid='text-inventory-year'
                >
                  {inventory.year}
                </p>
              </div>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Type
                </label>
                <Badge
                  variant='outline'
                  className='text-xs'
                  data-testid='badge-inventory-type'
                >
                  {inventory.inventoryType.toUpperCase()}
                </Badge>
              </div>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Total Emissions
                </label>
                <p
                  className='text-foreground'
                  data-testid='text-total-emissions'
                >
                  {inventory.totalEmissions !== null
                    ? `${inventory.totalEmissions.toLocaleString()} CO₂e`
                    : 'Not calculated'}
                </p>
              </div>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Status
                </label>
                <Badge
                  variant={inventory.isPublic ? 'default' : 'secondary'}
                  data-testid='badge-inventory-status'
                >
                  {inventory.isPublic ? 'Public' : 'Private'}
                </Badge>
              </div>
            </div>
          </div>

          {/* City Information */}
          <div className='space-y-4'>
            <h3 className='text-lg font-semibold flex items-center gap-2'>
              <Building2 className='h-4 w-4' />
              City Details
            </h3>

            <div className='space-y-3 text-sm'>
              <div>
                <label className='font-medium text-muted-foreground'>
                  City
                </label>
                <p
                  className='text-foreground'
                  data-testid='text-inventory-city'
                >
                  {inventory.city.name}
                </p>
              </div>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Country & Region
                </label>
                <p className='text-foreground'>
                  {inventory.city.country}, {inventory.city.region}
                </p>
              </div>
              <div>
                <label className='font-medium text-muted-foreground'>
                  LOCODE
                </label>
                <p className='text-foreground font-mono'>
                  {inventory.city.locode}
                </p>
              </div>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Area
                </label>
                <p className='text-foreground'>{inventory.city.area} km²</p>
              </div>
            </div>
          </div>

          {/* Technical Details */}
          <div className='space-y-4'>
            <h3 className='text-lg font-semibold flex items-center gap-2'>
              <Activity className='h-4 w-4' />
              Technical Details
            </h3>

            <div className='space-y-3 text-sm'>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Global Warming Potential
                </label>
                <p className='text-foreground'>
                  {inventory.globalWarmingPotentialType.toUpperCase()}
                </p>
              </div>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Country Emissions
                </label>
                <p className='text-foreground'>
                  {inventory.totalCountryEmissions !== null
                    ? `${inventory.totalCountryEmissions.toLocaleString()} CO₂e`
                    : 'Not available'}
                </p>
              </div>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Inventory ID
                </label>
                <p className='text-foreground font-mono text-xs'>
                  {inventory.inventoryId}
                </p>
              </div>
            </div>
          </div>

          {/* Project & Timeline */}
          <div className='space-y-4'>
            <h3 className='text-lg font-semibold flex items-center gap-2'>
              <Clock className='h-4 w-4' />
              Timeline & Project
            </h3>

            <div className='space-y-3 text-sm'>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Project
                </label>
                <p className='text-foreground'>{inventory.city.project.name}</p>
              </div>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Created
                </label>
                <p className='text-foreground'>
                  {formattedDate(inventory.created)}
                </p>
              </div>
              <div>
                <label className='font-medium text-muted-foreground'>
                  Last Updated
                </label>
                <p className='text-foreground'>
                  {formattedDate(inventory.lastUpdated)}
                </p>
              </div>
              {inventory.publishedAt && (
                <div>
                  <label className='font-medium text-muted-foreground'>
                    Published
                  </label>
                  <p className='text-foreground'>
                    {formattedDate(inventory.publishedAt)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Emissions Breakdown by GPC Sectors */}
        <div className='col-span-1 md:col-span-2 space-y-4 mt-6'>
          <h3 className='text-lg font-semibold flex items-center gap-2'>
            <BarChart3 className='h-4 w-4' />
            Emissions Breakdown by GPC Sectors
          </h3>

          {inventoryDownloadData?.data?.inventoryValues &&
          inventoryDownloadData.data.inventoryValues.length > 0 ? (
            <div className='space-y-4'>
              {(() => {
                const sectors = organizeInventoryValuesBySector(
                  inventoryDownloadData.data.inventoryValues
                );
                return Object.entries(sectors)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([sectorNumber, sectorData]) => (
                    <div
                      key={sectorNumber}
                      className='border rounded-lg p-4'
                      data-testid={`sector-${sectorNumber}`}
                    >
                      <div className='flex items-center gap-2 mb-3'>
                        <Zap className='h-4 w-4 text-primary' />
                        <h4 className='font-semibold text-sm'>
                          Sector {sectorNumber}: {sectorData.name}
                        </h4>
                      </div>

                      <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
                        {sectorData.values
                          .sort((a, b) =>
                            a.gpcReferenceNumber.localeCompare(
                              b.gpcReferenceNumber
                            )
                          )
                          .map(value => (
                            <div
                              key={value.id}
                              className='border-l-2 border-l-primary/20 pl-3 py-2'
                              data-testid={`subsector-${value.gpcReferenceNumber}`}
                            >
                              <div className='flex justify-between items-start gap-2'>
                                <div className='flex-1 min-w-0'>
                                  <div className='flex items-center gap-1 mb-1'>
                                    <span className='font-mono text-xs text-muted-foreground'>
                                      {value.gpcReferenceNumber}
                                    </span>
                                  </div>
                                  <p
                                    className='text-sm font-medium truncate'
                                    title={value.subSector.subsectorName}
                                  >
                                    {value.subSector.subsectorName}
                                  </p>
                                  {value.dataSource && (
                                    <p
                                      className='text-xs text-muted-foreground mt-1 truncate'
                                      title={value.dataSource.datasourceName}
                                    >
                                      Source: {value.dataSource.datasourceName}
                                    </p>
                                  )}
                                </div>
                                <div className='text-right'>
                                  <p
                                    className='text-sm font-semibold'
                                    data-testid={`emissions-${value.gpcReferenceNumber}`}
                                  >
                                    {formatEmissions(value.co2eq)}
                                  </p>
                                  {value.dataSource && (
                                    <Badge
                                      variant='outline'
                                      className='text-xs mt-1'
                                    >
                                      {value.dataSource.dataQuality}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {value.unavailableReason && (
                                <div className='flex items-center gap-1 mt-2 text-xs text-amber-600 dark:text-amber-400'>
                                  <AlertCircle className='h-3 w-3' />
                                  <span>
                                    Unavailable: {value.unavailableReason}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  ));
              })()}
            </div>
          ) : errorDownload ? (
            <div className='flex items-center gap-2 text-amber-600 dark:text-amber-400 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg'>
              <AlertCircle className='h-4 w-4' />
              <div>
                <p className='text-sm font-medium'>
                  Detailed emissions data unavailable
                </p>
                <p className='text-xs'>
                  Unable to load sector breakdown: {errorDownload.message}
                </p>
              </div>
            </div>
          ) : (
            <div className='flex items-center gap-2 text-muted-foreground p-4 bg-muted/50 rounded-lg'>
              <AlertCircle className='h-4 w-4' />
              <div>
                <p className='text-sm font-medium'>
                  No detailed emissions data available
                </p>
                <p className='text-xs'>
                  This inventory doesn't contain sector-level breakdown
                  information
                </p>
              </div>
            </div>
          )}
        </div>

        <div className='flex justify-end gap-3 pt-4 border-t'>
          <Button
            variant='outline'
            size='sm'
            data-testid='button-view-citycatalyst'
          >
            <ExternalLink className='h-4 w-4 mr-2' />
            View in CityCatalyst
          </Button>
        </div>
      </>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[80vh] overflow-y-auto'>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
