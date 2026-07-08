import { lazy } from 'react';
import { ModuleRegistry } from '@/core/types/module';

// Lazy so the whole city-information module tree (13 files) splits out of the
// entry bundle with the rest of the route-level code splitting (DC-3).
const CityInformation = lazy(() => import('@/modules/city-information/pages/city-information'));

// Module registry - this is where new modules can be registered
export const moduleRegistry: ModuleRegistry = {
  'city-information': {
    id: 'city-information',
    name: 'City Information',
    description: 'Detailed city information and inventory data viewer',
    routes: [
      {
        path: '/city-information/:cityId',
        component: CityInformation,
      },
      {
        path: '/sample/city-information/:cityId',
        component: CityInformation,
      },
    ],
    enabled: true,
  },
  // Future modules can be added here:
  // gallery: {
  //   id: "gallery",
  //   name: "City Gallery",
  //   description: "City image gallery and visualization",
  //   routes: [
  //     {
  //       path: "/city-gallery/:cityId",
  //       component: CityGallery,
  //     },
  //   ],
  //   enabled: true,
  // },
};
