export const CATALOG_TAGS = ['Unstitched', 'Stitched', 'Semi-Stitched', 'Ready to Wear'] as const;
export type CatalogTag = (typeof CATALOG_TAGS)[number];

export interface CatalogDesign {
  id: string;
  photoUrl?: string;
  designNameOrNumber: string;
  salesPrice: number;
  defaultPrice: number;
  tag: CatalogTag;
  description?: string;
  samplePrice?: number;
  designRecipe?: string;
  sizes?: string[];
  hsnCode?: string;
  gstPct?: number;
  minStockQty?: number;
  minOrderQty?: number;
  outOfStock?: boolean;
}

// TODO: Replace with API call — GET /api/v1/designs (catalog view)
export const mockCatalog: CatalogDesign[] = [
  {
    id: 'cat-1',
    designNameOrNumber: 'DR-1024 — Summer Floral Dress',
    salesPrice: 1400,
    defaultPrice: 1400,
    tag: 'Ready to Wear',
    description: 'Lightweight cotton floral print dress.',
    sizes: ['S', 'M', 'L', 'XL'],
    hsnCode: '62044200',
    gstPct: 5,
    minStockQty: 20,
    minOrderQty: 5,
  },
  {
    id: 'cat-2',
    designNameOrNumber: 'KU-5501 — Cotton Block Print Kurti',
    salesPrice: 850,
    defaultPrice: 850,
    tag: 'Stitched',
    sizes: ['M', 'L', 'XL'],
    outOfStock: true,
  },
];
