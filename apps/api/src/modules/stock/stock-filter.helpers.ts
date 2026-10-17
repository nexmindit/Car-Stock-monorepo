export interface StockAttributeFilters {
  brand?: string;
  model?: string;
  exteriorColor?: string;
  interiorColor?: string;
}

/**
 * Exact-match where for the ยี่ห้อ / รุ่นรถ / สีภายนอก / สีภายใน dropdowns, shared by
 * GET /stock and the stock report. Blank ("ทั้งหมด") is ignored; an interiorColor
 * filter naturally excludes rows whose interiorColor is null.
 */
export function buildStockAttributeWhere(filters: StockAttributeFilters) {
  const where: {
    vehicleModel?: { brand?: string; model?: string };
    exteriorColor?: string;
    interiorColor?: string;
  } = {};
  const brand = filters.brand?.trim();
  const model = filters.model?.trim();
  const exteriorColor = filters.exteriorColor?.trim();
  const interiorColor = filters.interiorColor?.trim();

  if (brand || model) {
    where.vehicleModel = {
      ...(brand ? { brand } : {}),
      ...(model ? { model } : {}),
    };
  }
  if (exteriorColor) where.exteriorColor = exteriorColor;
  if (interiorColor) where.interiorColor = interiorColor;
  return where;
}
