import { DEFAULT_DEMO_SALE_POLICY, type DemoSalePolicy } from '@car-stock/shared/constants';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { settingsService } from '../services/settings.service';
import type { CompanySettings } from '../services/settings.service';

interface CompanyContextType {
  companyName: string;
  settings: CompanySettings | null;
  loading: boolean;
  /** Who may sell DEMO stock (defaults until settings load; the API re-checks on save). */
  demoSalePolicy: DemoSalePolicy;
  /** Re-read settings (after login, or after an admin saves them). */
  refreshSettings: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType>({
  companyName: '',
  settings: null,
  loading: true,
  demoSalePolicy: DEFAULT_DEMO_SALE_POLICY,
  refreshSettings: async () => {},
});

export const useCompany = () => useContext(CompanyContext);

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await settingsService.getSettings();
      if (res.success && res.data) {
        setSettings(res.data);
      }
    } catch {
      // Not logged in yet (GET /settings needs a token) — keep what we have.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // Default to Thai name, fallback to English, fallback to empty string
  const companyName = settings?.companyNameTh || settings?.companyNameEn || '';

  const demoSalePolicy = useMemo<DemoSalePolicy>(
    () => ({
      allowDemoSale: settings?.allowDemoSale ?? DEFAULT_DEMO_SALE_POLICY.allowDemoSale,
      demoSaleRoles: settings?.demoSaleRoles ?? DEFAULT_DEMO_SALE_POLICY.demoSaleRoles,
    }),
    [settings?.allowDemoSale, settings?.demoSaleRoles]
  );

  return (
    <CompanyContext.Provider
      value={{ companyName, settings, loading, demoSalePolicy, refreshSettings }}
    >
      {children}
    </CompanyContext.Provider>
  );
};
