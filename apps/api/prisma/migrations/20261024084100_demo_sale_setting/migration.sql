-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "allow_demo_sale" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "demo_sale_roles" "Role"[] DEFAULT ARRAY['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT']::"Role"[];
