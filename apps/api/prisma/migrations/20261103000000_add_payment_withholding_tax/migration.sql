-- ลูกค้าหัก ณ ที่จ่าย: amount the customer withheld from this receipt.
ALTER TABLE "payments" ADD COLUMN "withholding_tax_amount" DECIMAL(15,2);
