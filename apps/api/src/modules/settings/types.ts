import { DemoSaleSettingsSchema } from '@car-stock/shared/schemas';
import { z } from 'zod';

const CompanyInfoSchema = z.object({
  companyNameTh: z.string().min(1, 'Company Name (TH) is required'),
  companyNameEn: z.string().min(1, 'Company Name (EN) is required'),
  taxId: z.string().min(1, 'Tax ID is required'),
  addressTh: z.string().min(1, 'Address (TH) is required'),
  addressEn: z.string().min(1, 'Address (EN) is required'),
  phone: z.string().min(1, 'Phone number is required'),
  mobile: z.string().optional().default(''),
  fax: z.string().optional().default(''),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  logo: z.string().optional(), // Base64 string
});

/** PUT /settings body: company info + the demo-sale switch/roles. */
export const CompanySettingsSchema = CompanyInfoSchema.merge(DemoSaleSettingsSchema);

export type CompanySettingsDTO = z.infer<typeof CompanySettingsSchema>;
