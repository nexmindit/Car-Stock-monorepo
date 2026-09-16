import { db } from '../../lib/db';
import type { CompanySettingsDTO } from './types';

export class SettingsService {
  private static instance: SettingsService;

  private constructor() {}

  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  /**
   * Get company settings
   * If no settings exist, returns null or default empty structure
   */
  async getSettings() {
    // We assume there's only one settings record. We grab the first one.
    const settings = await db.companySettings.findFirst();
    return settings;
  }

  /**
   * Update or Create company settings
   * Since we only want one record, we upsert based on ID if we have it,
   * or we check if one exists and update it, otherwise create.
   */
  async updateSettings(data: CompanySettingsDTO) {
    const existing = await db.companySettings.findFirst();

    if (existing) {
      return await db.companySettings.update({
        where: { id: existing.id },
        data,
      });
    } else {
      return await db.companySettings.create({
        data,
      });
    }
  }
  /** Saved print layout for `key` (e.g. 'vehicle-card'), or null when never saved. */
  async getPrintLayout(key: string): Promise<unknown | null> {
    const row = await db.printLayout.findUnique({ where: { key } });
    return row?.data ?? null;
  }

  async savePrintLayout(key: string, data: object) {
    const row = await db.printLayout.upsert({
      where: { key },
      create: { key, data },
      update: { data },
    });
    return row.data;
  }
}

export const settingsService = SettingsService.getInstance();
