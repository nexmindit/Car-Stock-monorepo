import { useEffect, useMemo, useState } from 'react';
import { stockService, type StockFilterOptions } from '../services/stock.service';

export interface StockAttributeFilterValues {
  brand: string;
  model: string;
  exteriorColor: string;
  interiorColor: string;
}

const EMPTY: StockAttributeFilterValues = {
  brand: '',
  model: '',
  exteriorColor: '',
  interiorColor: '',
};

/** ยี่ห้อ / รุ่นรถ / สีภายนอก / สีภายใน dropdown state; '' = ทั้งหมด. Models narrow to the brand. */
export function useStockAttributeFilters() {
  const [filters, setFilters] = useState<StockAttributeFilterValues>(EMPTY);
  const [options, setOptions] = useState<StockFilterOptions>({
    models: [],
    exteriorColors: [],
    interiorColors: [],
  });

  useEffect(() => {
    stockService
      .getFilterOptions()
      .then(setOptions)
      .catch(() => {
        // Dropdowns just stay at ทั้งหมด; the page still works unfiltered.
      });
  }, []);

  const brands = useMemo(() => [...new Set(options.models.map((m) => m.brand))], [options.models]);
  const models = useMemo(
    () => [
      ...new Set(
        options.models
          .filter((m) => !filters.brand || m.brand === filters.brand)
          .map((m) => m.model)
      ),
    ],
    [options.models, filters.brand]
  );

  const setFilter = (key: keyof StockAttributeFilterValues, value: string) =>
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      // A model from the previous brand would match nothing.
      ...(key === 'brand' ? { model: '' } : {}),
    }));

  return {
    filters,
    setFilter,
    brands,
    models,
    exteriorColors: options.exteriorColors,
    interiorColors: options.interiorColors,
  };
}
