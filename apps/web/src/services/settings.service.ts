import type { VehicleCardLayout } from '@car-stock/shared/schemas';
import { api } from '../lib/api';

export interface CompanySettings {
  id?: string;
  companyNameTh: string;
  companyNameEn: string;
  taxId: string;
  addressTh: string;
  addressEn: string;
  phone: string;
  mobile: string;
  fax: string;
  email: string;
  website: string;
  logo: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class SettingsService {
  async getSettings(): Promise<ApiResponse<CompanySettings>> {
    return api.get<ApiResponse<CompanySettings>>('/api/settings');
  }

  async updateSettings(data: Partial<CompanySettings>): Promise<ApiResponse<CompanySettings>> {
    return api.put<ApiResponse<CompanySettings>>('/api/settings', data);
  }

  async getVehicleCardLayout(): Promise<VehicleCardLayout> {
    const res = await api.get<ApiResponse<VehicleCardLayout>>(
      '/api/settings/print-layout/vehicle-card'
    );
    return res.data as VehicleCardLayout;
  }

  async saveVehicleCardLayout(layout: VehicleCardLayout): Promise<VehicleCardLayout> {
    const res = await api.put<ApiResponse<VehicleCardLayout>>(
      '/api/settings/print-layout/vehicle-card',
      layout
    );
    return res.data as VehicleCardLayout;
  }
}

export const settingsService = new SettingsService();
