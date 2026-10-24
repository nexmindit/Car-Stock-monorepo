import { demoSaleBlockReason } from '@car-stock/shared/constants';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';

/**
 * Why the current user may not sell a DEMO stock unit, or null when they may
 * (Settings → การขายรถ Demo). Pickers disable DEMO options when non-null; the API
 * enforces the same rule on save.
 */
export function useDemoSaleBlockReason(): string | null {
  const { user } = useAuth();
  const { demoSalePolicy } = useCompany();
  return demoSaleBlockReason(demoSalePolicy, user?.role);
}
