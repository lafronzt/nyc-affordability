/* Build-time loader for /data/: gathers the content collections and data
   files the pages use and hands them to the pure builders in dataExport.ts.
   Kept separate because astro:content only exists inside the Astro build. */
import { getCollection } from 'astro:content';
import { ASSUMPTIONS } from '../data/assumptions.ts';
import { AFFORDABILITY_INDEX } from '../data/affordabilityIndex.ts';
import { BOROUGH_HUBS } from '../data/boroughs.ts';
import { AMI_BASE, AMI_SOURCE_URL, AMI_YEAR } from './amiTable.ts';
import {
  marketFiguresDataset, incomeNeededDataset, affordabilityIndexDataset, amiDataset, assumptionsDataset,
  type AreaFigures, type Dataset,
} from './dataExport.ts';

export async function loadDatasets(): Promise<Dataset[]> {
  const hoods = (await getCollection('neighborhoods', ({ data }) => !data.draft))
    .sort((a, b) => a.id.localeCompare(b.id));
  const areas: AreaFigures[] = [
    ...BOROUGH_HUBS.map((h) => ({ areaType: 'borough' as const, slug: h.slug, name: h.name, borough: h.slug, figures: h.figures })),
    ...hoods.map((h) => ({ areaType: 'neighborhood' as const, slug: h.id, name: h.data.name, borough: h.data.borough, figures: h.data.figures })),
  ];
  return [
    marketFiguresDataset(areas),
    incomeNeededDataset(areas),
    affordabilityIndexDataset(AFFORDABILITY_INDEX),
    amiDataset(AMI_BASE, AMI_SOURCE_URL, AMI_YEAR),
    assumptionsDataset(ASSUMPTIONS),
  ];
}
