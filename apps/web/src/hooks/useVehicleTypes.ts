import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { type VehicleTypeItem, vehicleTypeService } from '../services/vehicleType.service';

export const VEHICLE_TYPES_QUERY_KEY = ['vehicle-types'] as const;

/**
 * ประเภทรถ from the vehicle_types table.
 * - `activeTypes` — for dropdowns (inactive types can't be picked any more)
 * - `typeLabel(code)` — Thai name for stored data, inactive types included
 */
export function useVehicleTypes() {
  const query = useQuery({
    queryKey: VEHICLE_TYPES_QUERY_KEY,
    queryFn: () => vehicleTypeService.list(true),
    staleTime: 5 * 60 * 1000,
  });

  const allTypes: VehicleTypeItem[] = useMemo(() => query.data ?? [], [query.data]);
  const activeTypes = useMemo(() => allTypes.filter((t) => t.isActive), [allTypes]);
  const labels = useMemo(() => new Map(allTypes.map((t) => [t.code, t.nameTh])), [allTypes]);
  const typeLabel = useCallback(
    (code: string | null | undefined) => (code ? (labels.get(code) ?? code) : '-'),
    [labels]
  );

  return {
    allTypes,
    activeTypes,
    typeLabel,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
