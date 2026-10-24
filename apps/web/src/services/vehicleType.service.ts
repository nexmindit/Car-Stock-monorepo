import type {
  CreateVehicleTypeInput,
  UpdateVehicleTypeInput,
  VehicleTypeItem,
} from '@car-stock/shared/types';
import { api } from '../lib/api';

export type { VehicleTypeItem };

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class VehicleTypeService {
  async list(includeInactive = false): Promise<VehicleTypeItem[]> {
    const res = await api.get<ApiResponse<VehicleTypeItem[]>>(
      '/api/vehicle-types',
      includeInactive ? { includeInactive: 'true' } : undefined
    );
    return res.data ?? [];
  }

  async create(data: CreateVehicleTypeInput): Promise<ApiResponse<VehicleTypeItem>> {
    return api.post<ApiResponse<VehicleTypeItem>>('/api/vehicle-types', data);
  }

  async update(code: string, data: UpdateVehicleTypeInput): Promise<ApiResponse<VehicleTypeItem>> {
    return api.put<ApiResponse<VehicleTypeItem>>(
      `/api/vehicle-types/${encodeURIComponent(code)}`,
      data
    );
  }

  async remove(code: string): Promise<ApiResponse<void>> {
    return api.delete<ApiResponse<void>>(`/api/vehicle-types/${encodeURIComponent(code)}`);
  }
}

export const vehicleTypeService = new VehicleTypeService();
