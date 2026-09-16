/**
 * PDF Controller
 * API endpoints for PDF generation
 */

import { PAYMENT_METHOD_LABELS, PAYMENT_TYPE_LABELS } from '@car-stock/shared/constants';
import { computeDeliveryTotal, sumCustomCustomerCharges } from '@car-stock/shared/finance';
import { splitVat } from '@car-stock/shared/formulas';
import { DEFAULT_VEHICLE_CARD_LAYOUT } from '@car-stock/shared/schemas';
import { Elysia, t } from 'elysia';
import { generateContractNumber, getCurrentContractNumberFormat } from '../../lib/contractNumber';
import { db } from '../../lib/db';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { projectCampaignClaimForPdf } from '../reports/campaign-claim-pdf';
import { reportsService } from '../reports/reports.service';
import { formatThaiDate, numberToThaiText, resolveThankYouLetterDate } from './helpers';
import { pdfService } from './pdf.service';
import {
  computeThankYouFinancials,
  resolveCarDiscount,
  resolveThankYouSellingPrice,
} from './thank-you-financials';
import {
  type CarInfo,
  ContractData,
  type CustomerInfo,
  type DailyPaymentReportData,
  type DeliveryReceiptData,
  DepositReceiptData,
  type PaymentReceiptData,
  PdfTemplateType,
  type SalesConfirmationData,
  type SalesConfirmationFormData,
  type SalesRecordData,
  type TemporaryReceiptData,
  type ThankYouLetterData,
  type VehicleCardData,
} from './types';

// Inject a self-print + self-close script so a browser tab/popup that loads this
// HTML fires the print dialog on load and closes after `afterprint`. Shared by
// every auto-print /html document: the temporary receipt and both vehicle cards.
// setTimeout gives the browser one tick to lay out fonts before print().
function injectAutoPrint(html: string): string {
  const autoPrint = `
<script>
  window.addEventListener('load', function () {
    setTimeout(function () {
      window.focus();
      window.print();
    }, 250);
  });
  window.addEventListener('afterprint', function () {
    window.close();
  });
</script>`;
  return html.replace('</body>', `${autoPrint}</body>`);
}

// Build paymentMethod block for temporary-receipt templates from a Payment row.
// Snapshot fields (receivingBankName/receivingAccountNumber/receivingBranch) take
// precedence; legacy `receivingBank` is the fallback for rows created before the
// snapshot columns existed.
function buildReceiptPaymentMethod(payment: any) {
  const isCash = payment.paymentMethod === 'CASH';
  const isCheque = payment.paymentMethod === 'CHEQUE';
  const isTransfer = payment.paymentMethod === 'BANK_TRANSFER';
  const paymentDate = payment.paymentDate || payment.createdAt;
  return {
    isCash,
    isCheque,
    isTransfer,
    bankName: payment.receivingBankName || payment.receivingBank || '',
    branchName: payment.receivingBranch || '',
    accountNumber: payment.receivingAccountNumber || '',
    chequeNumber: isCheque ? payment.referenceNumber || '' : '',
    chequeDate: isCheque ? formatThaiDate(paymentDate) : '',
    chequeAmount: isCheque ? payment.amount.toString() : '',
    transferDate: isTransfer ? formatThaiDate(paymentDate) : '',
    transferAmount: isTransfer ? payment.amount.toString() : '',
  };
}

// Bank account block for the temporary-receipt overlay. The payment row only
// snapshots bank name / number / branch (no account name), so look the account
// name up from the bank_accounts master by the receiving account number.
// Returns undefined for cash (no receiving account) so the template hides it.
async function buildReceiptBankAccount(payment: any) {
  const accountNumber = payment.receivingAccountNumber;
  if (!accountNumber) return undefined;
  const master = await db.bankAccount.findFirst({ where: { accountNumber } });
  return {
    bankName: payment.receivingBankName || master?.bankName || '',
    accountNumber,
    accountName: master?.accountName || '',
  };
}

// Helper function to transform customer data
function transformCustomer(customer: any): CustomerInfo {
  return {
    name: customer?.name || '-',
    address: customer?.houseNumber || '-', // mapped from houseNumber
    street: customer?.street || '-',
    subdistrict: customer?.subdistrict || '-',
    district: customer?.district || '-',
    province: customer?.province || '-',
    postalCode: customer?.postalCode || '-',
    phone: customer?.phone || '-',
    taxId: customer?.taxId || customer?.passportNumber,
  };
}

// Helper function to transform stock/vehicle data
function transformCar(stock: any): CarInfo {
  return {
    brand: stock?.vehicleModel?.brand || '-',
    model: stock?.vehicleModel?.model || '-',
    engineNo: stock?.engineNumber || stock?.motorNumber1 || '-',
    chassisNo: stock?.vin || '-', // VIN is the chassis number
    color: stock?.exteriorColor || '-',
    type: 'รถยนต์ไฟฟ้า',
  };
}

/**
 * freebiesSnapshot stores one gift per line (newline-separated). Legacy rows
 * may be comma-separated free text — split on both so old sales still render.
 */
function parseFreebies(snapshot: string | null | undefined): { name: string }[] {
  if (!snapshot) return [];
  return snapshot
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

// Helper to get company header from settings or default
async function getCompanyHeader(): Promise<any> {
  const [settings, bankAccounts] = await Promise.all([
    db.companySettings.findFirst(),
    db.bankAccount.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const bankAccountsForDoc = bankAccounts.map((b) => ({
    bankName: b.bankName,
    accountNumber: b.accountNumber,
    accountName: b.accountName,
    branch: b.branch || '',
    accountType: b.accountType || '',
  }));

  if (settings) {
    return {
      logoBase64: settings.logo || '',
      companyName: settings.companyNameTh,
      companyNameEn: settings.companyNameEn,
      address1: settings.addressTh,
      address2: '',
      phone: `โทร. ${settings.phone}${settings.fax ? ` โทรสาร. ${settings.fax}` : ''}`,
      taxId: settings.taxId,
      fax: settings.fax || '',
      mobile: settings.mobile,
      email: settings.email,
      bankAccounts: bankAccountsForDoc,
    };
  }

  // Fallback — should not reach here if settings are configured
  return {
    logoBase64: '',
    companyName: '(กรุณาตั้งค่าข้อมูลบริษัทใน Settings)',
    companyNameEn: '',
    address1: '',
    address2: '',
    phone: '',
    taxId: '',
    fax: '',
    mobile: '',
    email: '',
    bankAccounts: bankAccountsForDoc,
  };
}

const calculateDays = (startDate: Date, endDate: Date): number => {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

const calculateAccumulatedInterest = (stock: any): number => {
  if (!stock?.financeProvider) {
    return 0;
  }

  const baseCost = Number(stock.baseCost || 0);
  const transportCost = Number(stock.transportCost || 0);
  const accessoryCost = Number(stock.accessoryCost || 0);
  const otherCosts = Number(stock.otherCosts || 0);
  const totalCost = baseCost + transportCost + accessoryCost + otherCosts;
  const principalAmount = stock.interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;
  const today = new Date();
  const activeEndDate = stock.soldDate || today;
  const interestStartDate = stock.orderDate || stock.arrivalDate;
  const hasStopDate = stock.stopInterestCalc && stock.interestStoppedAt;
  const endDate = hasStopDate
    ? new Date(Math.min(activeEndDate.getTime(), stock.interestStoppedAt.getTime()))
    : activeEndDate;
  const canAccrueActiveInterest = stock.debtStatus !== 'PAID_OFF' && !stock.stopInterestCalc;

  if (stock.interestPeriods?.length) {
    let totalAccumulatedInterest = 0;

    stock.interestPeriods.forEach((period: any) => {
      if (period.endDate) {
        totalAccumulatedInterest += Number(period.calculatedInterest);
        return;
      }

      if (!canAccrueActiveInterest) {
        return;
      }

      const days = calculateDays(period.startDate, activeEndDate);
      const dailyRate = Number(period.annualRate) / 100 / 365;
      totalAccumulatedInterest += Number(period.principalAmount) * dailyRate * days;
    });

    return totalAccumulatedInterest;
  }

  const canAccrueInterest = stock.debtStatus !== 'PAID_OFF' || hasStopDate;
  if (!canAccrueInterest) {
    return 0;
  }

  const days = calculateDays(interestStartDate, endDate);
  const dailyRate = Number(stock.interestRate || 0) / 365;
  return principalAmount * dailyRate * days;
};

export const pdfRoutes = new Elysia({ prefix: '/pdf' })
  /**
   * Generate Delivery Receipt PDF (ใบปล่อยรถ/ใบรับรถ)
   */
  .get(
    '/delivery-receipt/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          stock: {
            include: {
              vehicleModel: true,
            },
          },
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const header = await getCompanyHeader();
      // If logo is missing in settings, try to load default from service (or handle it in getCompanyHeader)
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      // Build line items showing the financial summary that must be paid/already paid
      // on delivery. Only include non-zero values to keep the receipt focused.
      const items: { description: string; amount: string }[] = [];
      const totalAmount = Number(sale.totalAmount) || 0;
      const carDiscount = Number(sale.carDiscount) || 0;
      const downPayment = Number(sale.downPayment) || 0;
      const financeAmount = Number(sale.financeAmount) || 0;
      const paidAmount = Number(sale.paidAmount) || 0;
      const remainingAmount = Number(sale.remainingAmount) || 0;

      if (totalAmount > 0)
        items.push({ description: 'ยอดรวมการขาย', amount: totalAmount.toString() });
      if (carDiscount > 0)
        items.push({ description: 'หัก ส่วนลดตัวรถ', amount: carDiscount.toString() });
      if (sale.paymentMode !== 'CASH' && downPayment > 0) {
        items.push({ description: 'เงินดาวน์', amount: downPayment.toString() });
      }
      if (sale.paymentMode !== 'CASH' && financeAmount > 0) {
        items.push({
          description: `ยอดจัดไฟแนนซ์${sale.financeProvider ? ` (${sale.financeProvider})` : ''}`,
          amount: financeAmount.toString(),
        });
      }
      if (paidAmount > 0) items.push({ description: 'ชำระแล้ว', amount: paidAmount.toString() });
      if (remainingAmount > 0)
        items.push({ description: 'ยอดค้างชำระ', amount: remainingAmount.toString() });

      // Fall back to createdAt when deliveryDate is not set (advance-keyed sales
      // print the doc before the actual pickup; user can edit deliveryDate later).
      const docDate = sale.deliveryDate || sale.createdAt;

      const data: DeliveryReceiptData = {
        header,
        customer: transformCustomer(sale.customer),
        car: transformCar(sale.stock),
        deliveryDate: formatThaiDate(docDate),
        items,
      };

      const pdfBuffer = await pdfService.generateDeliveryReceipt(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="delivery-receipt-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Delivery Receipt PDF',
        description: 'Generate ใบปล่อยรถ/ใบรับรถ PDF for a sale',
      },
    }
  )

  /**
   * Generate Thank You Letter PDF (หนังสือขอบคุณ)
   */
  .get(
    '/thank-you-letter/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          vehicleModel: true,
          stock: {
            include: {
              vehicleModel: true,
            },
          },
          payments: true,
          financeLines: true,
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const car = transformCar(sale.stock);

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      // Recompute คงเหลือ / ยอดจัดไฟแนนซ์ / ค่างวด live from the sale's base inputs
      // (matches the customer's .ods ขอบคุณ sheet + SalesFormPage) so the printed
      // letter never drifts from the formula even if a stored column is stale.
      // ส่วนลดตัวรถ lives on sale.carDiscount (manual sale-form entry); discountSnapshot
      // is only set on quotation→sale conversion. See resolveCarDiscount for the precedence.
      const carDiscount = resolveCarDiscount(sale.carDiscount, sale.discountSnapshot);
      // List price: stock unit first, then the sale's preferred model (reservations
      // without stock). Reconstructs chosen Stock price; missing list uses net + ส่วนลดรถ.
      const sellingPrice = resolveThankYouSellingPrice(
        sale.stock?.vehicleModel?.price ?? sale.vehicleModel?.price,
        sale.totalAmount,
        carDiscount,
        sumCustomCustomerCharges(sale.financeLines),
        sale.stock?.expectedSalePrice
      );
      // เงินดาวน์ = sale.downPayment only. เงินจอง = depositAmount (own row).
      // CASH รวมเงินออกรถ = คงเหลือ − เงินจอง + จดทะเบียน; FINANCE = ดาวน์ − ส่วนลดดาวน์ + fees.
      const downPayment = Number(sale.downPayment ?? 0);
      const deposit = Number(sale.depositAmount ?? 0);
      const financials = computeThankYouFinancials({
        sellingPrice,
        carDiscount,
        downPayment,
        deposit,
        downPaymentDiscount: Number(sale.downPaymentDiscount) || 0,
        insurance: Number(sale.insuranceFee) || 0,
        actInsurance: Number(sale.compulsoryInsuranceFee) || 0,
        registrationFee: Number(sale.registrationFee) || 0,
        interestRatePercentPerYear: Number(sale.interestRate) || 0,
        termMonths: Number(sale.numberOfTerms) || 0,
        isFinanced: sale.paymentMode !== 'CASH',
      });

      const data: ThankYouLetterData = {
        header,
        thaiDate: resolveThankYouLetterDate(sale.deliveryDate, sale.createdAt),
        customerName: sale.customer?.name || '-',
        carBrand: car.brand,
        detailsTable: {
          sellingPrice: sellingPrice.toString(),
          discount: carDiscount.toString(),
          remaining: financials.remaining.toString(),
          // เงินจอง = เงินมัดจำ (sale.depositAmount); shown as its own row, default 0.00
          bookingDeposit: sale.depositAmount?.toString() || '0',
          downPayment: sale.downPayment?.toString() || '0',
          downPaymentDiscount: sale.downPaymentDiscount?.toString() || '0',
          insurance: sale.insuranceFee?.toString() || '0',
          actInsurance: sale.compulsoryInsuranceFee?.toString() || '0',
          registrationFee: sale.registrationFee?.toString() || '0',
          totalDelivery: financials.totalDelivery.toString(),
          financeAmount: financials.financeAmount.toString(),
          // Sale.interestRate stores percent (2.49 = 2.49%/yr), not fraction — see SalesFormPage rate/100 calc
          interestRate: sale.interestRate?.toString() || '0',
          installmentMonths: sale.numberOfTerms?.toString() || '0',
          monthlyPayment: financials.monthlyPayment.toString(),
          gifts: parseFreebies(sale.freebiesSnapshot),
        },
        contactPerson: {
          name: 'นายณัฐนันท์ คมฤทัย',
          phone: 'โทร.(044) 272888, 094-978-9926',
          position: 'ฝ่ายตรวจสอบ',
        },
      };

      const pdfBuffer = await pdfService.generateThankYouLetter(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="thank-you-letter-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Thank You Letter PDF',
        description: 'Generate หนังสือขอบคุณ PDF for a sale',
      },
    }
  )

  /**
   * Generate Sales Confirmation PDF (หนังสือยืนยันการซื้อ-ขาย)
   */
  .get(
    '/sales-confirmation/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          stock: {
            include: {
              vehicleModel: true,
            },
          },
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      // Prefer deliveryDate (user-set pickup date) over createdAt for advance-keyed
      // sales where the doc is printed before the actual pickup day.
      const docDate = sale.deliveryDate || sale.createdAt;

      const data: SalesConfirmationData = {
        header,
        createdDate: docDate.toISOString(),
        car: transformCar(sale.stock),
        customer: transformCustomer(sale.customer),
        paymentMethod:
          sale.paymentMode === 'CASH'
            ? 'เงินสด'
            : sale.paymentMode === 'FINANCE'
              ? 'บริษัทไฟแนนซ์'
              : sale.paymentMode,
      };

      const pdfBuffer = await pdfService.generateSalesConfirmation(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="sales-confirmation-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Sales Confirmation PDF',
        description: 'Generate หนังสือยืนยันการซื้อ-ขาย PDF for a sale',
      },
    }
  )

  /**
   * Generate Sales Record PDF (ใบบันทึกการขาย)
   */
  .get(
    '/sales-record/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          stock: {
            include: {
              vehicleModel: true,
            },
          },
          createdBy: true,
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: SalesRecordData = {
        header,
        customer: transformCustomer(sale.customer),
        car: transformCar(sale.stock),
        pricing: (() => {
          const downPayment = Number(sale.downPayment ?? sale.depositAmount ?? 0);
          const downPaymentDiscount = Number(sale.downPaymentDiscount ?? 0);
          const insurance = Number(sale.insuranceFee ?? 0);
          const actInsurance = Number(sale.compulsoryInsuranceFee ?? 0);
          const registrationFee = Number(sale.registrationFee ?? 0);
          const totalAmount = Number(sale.totalAmount ?? 0);
          const deposit = Number(sale.depositAmount ?? 0);
          // CASH: total − deposit + registration; FINANCE/MIXED: down − downDisc + fees
          // (same helper as FinanceSheet delivery_total)
          const totalDelivery = computeDeliveryTotal({
            paymentMode: sale.paymentMode as 'CASH' | 'FINANCE' | 'MIXED',
            totalAmount,
            deposit,
            downPayment,
            downPaymentDiscount,
            insuranceFee: insurance,
            compulsoryInsuranceFee: actInsurance,
            registrationFee,
          });
          return {
            sellingPrice: sale.totalAmount?.toString() || '0',
            remaining: sale.remainingAmount?.toString() || '0',
            downPayment: downPayment.toString(),
            downPaymentDiscount: downPaymentDiscount.toString(),
            insurance: insurance.toString(),
            actInsurance: actInsurance.toString(),
            registrationFee: registrationFee.toString(),
            totalDelivery: totalDelivery.toString(),
            financeAmount: sale.financeAmount?.toString() || '0',
            deductDeposit: sale.paidAmount?.toString() || '0',
            deliveryAmount: sale.paidAmount?.toString() || '0',
            outstandingBalance: sale.remainingAmount?.toString() || '0',
            paymentDueDate: sale.expirationDate
              ? formatThaiDate(sale.expirationDate, 'short')
              : '-',
            financeCompany: sale.financeProvider || '-',
            // Sale.interestRate stores percent (2.49 = 2.49%/yr), not fraction — see SalesFormPage rate/100 calc
            interestRate: sale.interestRate?.toString() || '0',
            installmentMonths: sale.numberOfTerms?.toString() || '0',
            monthlyPayment: sale.monthlyInstallment?.toString() || '0',
          };
        })(),
        gifts: parseFreebies(sale.freebiesSnapshot),
        staff: {
          salesConsultant: sale.createdBy
            ? `${sale.createdBy.firstName} ${sale.createdBy.lastName}`
            : '-',
          salesManager: '-',
          auditor: '-',
        },
      };

      const pdfBuffer = await pdfService.generateSalesRecord(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="sales-record-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_SALES_RECORD')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Sales Record PDF',
        description: 'Generate ใบบันทึกการขาย PDF for a sale',
      },
    }
  )

  /**
   * Generate Sales Confirmation Form PDF (ใบยืนยันรายละเอียดการขาย)
   */
  .get(
    '/sales-confirmation-form/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          vehicleModel: true,
          stock: { include: { vehicleModel: true } },
          createdBy: true,
          financeLines: true,
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const vm = sale.stock?.vehicleModel;
      const vehicleName = [vm?.brand, vm?.model, vm?.variant].filter(Boolean).join(' ') || '-';

      const data: SalesConfirmationFormData = {
        header,
        vehicleName,
        plate: '—',
        pricing: (() => {
          const carDiscount = Number(sale.carDiscount ?? 0);
          const sellingPrice = resolveThankYouSellingPrice(
            sale.stock?.vehicleModel?.price ?? sale.vehicleModel?.price,
            sale.totalAmount,
            carDiscount,
            sumCustomCustomerCharges(sale.financeLines),
            sale.stock?.expectedSalePrice
          );
          const deposit = Number(sale.depositAmount ?? 0);
          const downPayment = Number(sale.downPayment ?? sale.depositAmount ?? 0);
          const downPaymentDiscount = Number(sale.downPaymentDiscount ?? 0);
          const insurance = Number(sale.insuranceFee ?? 0);
          const actInsurance = Number(sale.compulsoryInsuranceFee ?? 0);
          const registrationFee = Number(sale.registrationFee ?? 0);
          // คงเหลือ = ราคาขาย − ส่วนลด (รถยนต์)
          const remaining = sellingPrice - carDiscount;
          // รวมเงินออกรถ = เงินดาวน์ − ส่วนลดดาวน์ + ประกันชั้น 1 + พรบ. + จดทะเบียน
          const totalDelivery =
            downPayment - downPaymentDiscount + insurance + actInsurance + registrationFee;
          return {
            sellingPrice: sellingPrice.toString(),
            carDiscount: carDiscount.toString(),
            remaining: remaining.toString(),
            deposit: deposit.toString(),
            downPayment: downPayment.toString(),
            downPaymentDiscount: downPaymentDiscount.toString(),
            insurance: insurance.toString(),
            actInsurance: actInsurance.toString(),
            registrationFee: registrationFee.toString(),
            totalDelivery: totalDelivery.toString(),
            financeAmount: sale.financeAmount?.toString() || '0',
            // Sale.interestRate stores percent (3.39 = 3.39%/yr), not fraction
            interestRate: sale.interestRate?.toString() || '0',
            installmentMonths: sale.numberOfTerms?.toString() || '0',
            monthlyPayment: sale.monthlyInstallment?.toString() || '0',
          };
        })(),
        gifts: parseFreebies(sale.freebiesSnapshot),
      };

      const pdfBuffer = await pdfService.generateSalesConfirmationForm(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="sales-confirmation-form-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Sales Confirmation Form PDF',
        description: 'Generate ใบยืนยันรายละเอียดการขาย PDF for a sale',
      },
    }
  )

  /**
   * Generate Contract PDF (สัญญาจองรถยนต์)
   */
  .get(
    '/contract/:saleId',
    async ({ params, set }) => {
      const sale = await db.sale.findUnique({
        where: { id: params.saleId },
        include: {
          customer: true,
          vehicleModel: true,
          stock: {
            include: {
              vehicleModel: true,
            },
          },
          payments: {
            orderBy: {
              paymentDate: 'asc',
            },
            take: 1, // Get the first payment as reservation/deposit
          },
          createdBy: true,
        },
      });

      if (!sale) {
        set.status = 404;
        return { success: false, error: 'Sale not found' };
      }

      const car = transformCar(sale.stock);

      // Get reservation payment (first payment)
      const reservationPayment =
        sale.payments && sale.payments.length > 0 ? sale.payments[0] : null;

      // Get or generate contract number (เล่มที่ and เลขที่)
      // If the Sale already has a contract number, use it; otherwise generate a new one and save it
      let contractNumber: { volumeNumber: string; documentNumber: string };

      if (sale.contractVolumeNumber && sale.contractDocumentNumber) {
        // Use existing contract number
        contractNumber = {
          volumeNumber: sale.contractVolumeNumber,
          documentNumber: sale.contractDocumentNumber,
        };
      } else {
        // Generate new contract number and save to Sale
        contractNumber = await generateContractNumber();
        await db.sale.update({
          where: { id: sale.id },
          data: {
            contractVolumeNumber: contractNumber.volumeNumber,
            contractDocumentNumber: contractNumber.documentNumber,
          },
        });
      }

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: any = {
        // Using any to bypass strict type check for now to support the template
        copyTypes: [
          { thai: 'ต้นฉบับ', english: 'ORIGINAL' },
          { thai: 'คู่ฉบับ', english: 'DUPLICATE' },
          { thai: 'สำเนาคู่ฉบับ', english: 'COPY' },
        ],
        header,
        documentInfo: {
          volumeNumber: contractNumber.volumeNumber, // เล่มที่ e.g., "01/2568"
          documentNumber: contractNumber.documentNumber, // เลขที่ e.g., "68010001"
          contractLocation: header.companyName,
          salesManagerName: '', // Placeholder, no data available on sale object
          salesManagerPhone: '',
          salesStaffName: sale.createdBy
            ? `${sale.createdBy.firstName} ${sale.createdBy.lastName}`
            : '-',
          salesStaffPhone: sale.createdBy?.phone || '-',
        },
        reservationNumber: sale.saleNumber,
        date: {
          day: new Date().getDate().toString(),
          month: (new Date().getMonth() + 1).toString(),
          year: (new Date().getFullYear() + 543).toString(),
        },
        customer: transformCustomer(sale.customer),
        vehicleModel: sale.stock?.vehicleModel || sale.vehicleModel,
        financial: {
          totalPrice: sale.totalAmount?.toString() || '0',
          depositAmount: sale.depositAmount?.toString() || '0',
          refundPolicy: 'ตามข้อตกลง',
        },
        reservationFee: reservationPayment
          ? {
              amount: reservationPayment.amount.toString(),
              isCash: reservationPayment.paymentMethod === 'CASH',
              isBankTransfer: reservationPayment.paymentMethod === 'BANK_TRANSFER',
              isCreditCard: reservationPayment.paymentMethod === 'CREDIT_CARD',
              isCheque: reservationPayment.paymentMethod === 'CHEQUE',
              bank: reservationPayment.receivingBankName || reservationPayment.receivingBank || '',
              accountNo: reservationPayment.receivingAccountNumber || '',
              chequeNo: reservationPayment.referenceNumber || '',
              chequeDate: reservationPayment.paymentDate
                ? formatThaiDate(reservationPayment.paymentDate)
                : '',
            }
          : {
              amount: '0',
              isCash: false,
              isBankTransfer: false,
              isCreditCard: false,
              isCheque: false,
            },
      };

      const pdfBuffer = await pdfService.generateContract(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="contract-${sale.saleNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        saleId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Contract PDF',
        description: 'Generate สัญญาจองรถยนต์ PDF for a sale',
      },
    }
  )

  /**
   * Generate Deposit Receipt PDF (ใบรับเงินมัดจำ)
   */
  .get(
    '/deposit-receipt/:paymentId',
    async ({ params, set }) => {
      const payment = await db.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: {
                include: {
                  vehicleModel: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        set.status = 404;
        return { success: false, error: 'Payment not found' };
      }

      const sale = payment.sale;
      const customer = payment.customer || sale?.customer;

      // Build items: payment type label as main item, description as sub-item
      const typeLabel =
        PAYMENT_TYPE_LABELS[payment.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || 'ค่าชำระเงิน';
      const carName = sale?.stock?.vehicleModel
        ? `${sale.stock.vehicleModel.brand} ${sale.stock.vehicleModel.model}`
        : '';
      const methodLabel =
        PAYMENT_METHOD_LABELS[payment.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || '';
      const mainItem = `${typeLabel}${carName ? ` - ${carName}` : ''}`;
      const items: { description: string; amount: string }[] = [
        { description: mainItem, amount: payment.amount.toString() },
      ];
      if (payment.description) {
        items.push({ description: payment.description, amount: '' });
      }

      const paymentMethodData = buildReceiptPaymentMethod(payment);

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: TemporaryReceiptData = {
        header: {
          ...header,
          fax: '',
        },
        customerCode: customer?.code || '',
        receiptNumber: payment.receiptNumber,
        date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
        contractNumber: sale?.saleNumber || '',
        customer: transformCustomer(customer),
        items,
        paymentAmount: payment.amount.toString(),
        lateFee: '0',
        discount: '0',
        totalAmount: payment.amount.toString(),
        totalAmountText: numberToThaiText(Number(payment.amount)),
        paymentMethod: paymentMethodData,
        paymentMethodLabel: methodLabel,
        note: payment.notes || undefined,
      };

      const pdfBuffer = await pdfService.generateTemporaryReceipt(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="deposit-receipt-${payment.receiptNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        paymentId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Deposit Receipt PDF',
        description: 'Generate ใบรับเงินมัดจำ PDF for a payment',
      },
    }
  )

  /**
   * Generate Payment Receipt PDF (ใบเสร็จรับเงิน)
   */
  .get(
    '/payment-receipt/:paymentId',
    async ({ params, set }) => {
      const payment = await db.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: {
                include: {
                  vehicleModel: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        set.status = 404;
        return { success: false, error: 'Payment not found' };
      }

      const sale = payment.sale;
      const customer = payment.customer || sale?.customer;

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      // Build items from payment notes/description
      const items = [];
      if (payment.notes) {
        // Split notes by newline to create multiple items
        const lines = payment.notes.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          items.push({ description: line.trim(), amount: '' });
        }
      }
      if (items.length === 0) {
        // Default item based on payment type
        const typeLabels: Record<string, string> = {
          DEPOSIT: 'ค่ามัดจำ',
          DOWN_PAYMENT: 'ค่าเงินดาวน์',
          FINANCE_PAYMENT: 'ค่างวดไฟแนนซ์',
          OTHER_EXPENSE: 'ค่าใช้จ่ายอื่นๆ',
          MISCELLANEOUS: 'เบ็ดเตล็ด',
        };
        const label = typeLabels[payment.paymentType] || 'ค่าชำระเงิน';
        const carName = sale?.stock?.vehicleModel
          ? `${sale.stock.vehicleModel.brand} ${sale.stock.vehicleModel.model}`
          : '';
        items.push({
          description: `${label} ${carName}`.trim(),
          amount: payment.amount.toString(),
        });
      }

      const data: PaymentReceiptData = {
        header,
        receiptNumber: payment.receiptNumber,
        date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
        customer: transformCustomer(customer),
        car: transformCar(sale?.stock),
        items,
        amount: payment.amount.toString(),
        amountText: numberToThaiText(Number(payment.amount)),
        paymentMethod: payment.paymentMethod || 'CASH',
        note: payment.notes || undefined,
      };

      const pdfBuffer = await pdfService.generatePaymentReceipt(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="payment-receipt-${payment.receiptNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({
        paymentId: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Payment Receipt PDF',
        description: 'Generate ใบเสร็จรับเงิน PDF for a payment',
      },
    }
  )

  /**
   * Generate Vehicle Card PDF (การ์ดรายละเอียดรถยนต์)
   */
  .get(
    '/vehicle-card/:stockId',
    async ({ params, query, set }) => {
      const stock = await db.stock.findUnique({
        where: { id: params.stockId },
        include: {
          vehicleModel: true,
          interestPeriods: {
            select: {
              startDate: true,
              endDate: true,
              annualRate: true,
              principalAmount: true,
              calculatedInterest: true,
            },
          },
        },
      });

      if (!stock) {
        set.status = 404;
        return { success: false, error: 'Stock not found' };
      }

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const accumulatedInterest = calculateAccumulatedInterest(stock);
      const baseCost = Number(stock.baseCost || 0);
      const transportCost = Number(stock.transportCost || 0);
      const accessoryCost = Number(stock.accessoryCost || 0);
      const otherCosts = Number(stock.otherCosts || 0);
      const totalCost = baseCost + transportCost + accessoryCost + otherCosts + accumulatedInterest;

      // VAT calculations (baseCost includes VAT)
      const beforeVat = baseCost / 1.07;
      const vatAmount = baseCost - beforeVat;

      const splitAmount = (amount: number) => {
        const fixed = amount.toFixed(2);
        const [intPart, decPart] = fixed.split('.');
        return {
          full: Number(amount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          int: Number(intPart).toLocaleString('en-US'),
          dec: decPart,
        };
      };

      const beforeVatParts = splitAmount(beforeVat);
      const vatParts = splitAmount(vatAmount);
      const totalVatParts = splitAmount(baseCost);

      const data: VehicleCardData = {
        header,
        stockNumber: stock.stockNumber || '-',
        date: formatThaiDate(new Date()),
        orderDate: stock.orderDate ? formatThaiDate(stock.orderDate) : '',
        car: {
          brand: stock.vehicleModel?.brand || '-',
          model: stock.vehicleModel?.model || '-',
          variant: stock.vehicleModel?.variant || '',
          year: stock.vehicleModel?.year?.toString() || '-',
          color: stock.exteriorColor || '-',
          interiorColor: stock.interiorColor || '-',
          engineNo: stock.engineNumber || '-',
          chassisNo: stock.vin || '-',
          motorNumbers: [stock.motorNumber1, stock.motorNumber2].filter(Boolean).join(' / '),
          ccOrKw: '-',
        },
        costs: {
          baseCost: baseCost.toString(),
          beforeVat: beforeVatParts.full,
          beforeVatInt: beforeVatParts.int,
          beforeVatDec: beforeVatParts.dec,
          vatAmount: vatParts.full,
          vatAmountInt: vatParts.int,
          vatAmountDec: vatParts.dec,
          totalWithVat: totalVatParts.full,
          totalWithVatInt: totalVatParts.int,
          totalWithVatDec: totalVatParts.dec,
          transportCost: transportCost.toString(),
          accessoryCost: accessoryCost.toString(),
          otherCosts: otherCosts.toString(),
          totalCost: totalCost.toString(),
        },
        location: stock.parkingSlot || '-',
      };

      // Layout editor: the resolved field values for this car, no rendering.
      if (query.format === 'json') {
        const { values } = pdfService.buildVehicleCardContext(data, DEFAULT_VEHICLE_CARD_LAYOUT);
        return { success: true, data: { values } };
      }

      if (query.format === 'html') {
        set.headers['Content-Type'] = 'text/html; charset=utf-8';
        set.headers['Cache-Control'] = 'no-store';
        return injectAutoPrint(await pdfService.renderVehicleCardHtml(data));
      }

      const pdfBuffer = await pdfService.generateVehicleCard(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="vehicle-card-${stock.vin}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_CAR_DETAIL_CARD')],
      params: t.Object({
        stockId: t.String(),
      }),
      query: t.Object({
        format: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Vehicle Card PDF',
        description: 'Generate การ์ดรายละเอียดรถยนต์ PDF for a stock',
      },
    }
  )

  /**
   * Generate Temporary Receipt PDF (ใบรับเงินชั่วคราว)
   */
  .get(
    '/temporary-receipt/:paymentId',
    async ({
      params,
      query,
      set,
    }: { params: { paymentId: string }; query: { lateFee?: string }; set: any }) => {
      const payment = await db.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: {
                include: {
                  vehicleModel: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        set.status = 404;
        return { success: false, error: 'Payment not found' };
      }

      const sale = payment.sale;
      const customer = payment.customer || sale?.customer;

      // Build items: payment type label as main item, description as sub-item
      const typeLabel =
        PAYMENT_TYPE_LABELS[payment.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || 'ค่าชำระเงิน';
      const carName = sale?.stock?.vehicleModel
        ? `${sale.stock.vehicleModel.brand} ${sale.stock.vehicleModel.model}`
        : '';
      const methodLabel =
        PAYMENT_METHOD_LABELS[payment.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || '';
      const mainItem = `${typeLabel}${carName ? ` - ${carName}` : ''}`;
      const items: { description: string; amount: string }[] = [
        { description: mainItem, amount: payment.amount.toString() },
      ];
      if (payment.description) {
        items.push({ description: payment.description, amount: '' });
      }

      const paymentMethodData = buildReceiptPaymentMethod(payment);

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: TemporaryReceiptData = {
        header: {
          ...header,
          fax: '',
        },
        customerCode: customer?.code || '',
        receiptNumber: payment.receiptNumber,
        date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
        contractNumber: sale?.saleNumber || '',
        customer: transformCustomer(customer),
        items,
        paymentAmount: payment.amount.toString(),
        lateFee: query.lateFee || '0',
        discount: '0',
        totalAmount: (Number(payment.amount) + Number(query.lateFee || 0)).toString(),
        totalAmountText: numberToThaiText(Number(payment.amount) + Number(query.lateFee || 0)),
        paymentMethod: paymentMethodData,
        paymentMethodLabel: methodLabel,
        note: payment.notes || undefined,
      };

      const pdfBuffer = await pdfService.generateTemporaryReceipt(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="temporary-receipt-${payment.receiptNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({ paymentId: t.String() }),
      query: t.Object({ lateFee: t.Optional(t.String()) }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Temporary Receipt PDF',
        description: 'Generate ใบรับเงินชั่วคราว PDF for a payment',
      },
    }
  )

  /**
   * Render Temporary Receipt as standalone HTML (auto-prints in popup window).
   * Overlay: 9×5.5 in. withForm: 9.5×5.5 in continuous. withForm+paper=a4: A4 landscape.
   */
  .get(
    '/temporary-receipt/:paymentId/html',
    async ({
      params,
      query,
      set,
    }: {
      params: { paymentId: string };
      query: { lateFee?: string; withForm?: string; paper?: string };
      set: any;
    }) => {
      const payment = await db.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: { include: { vehicleModel: true } },
            },
          },
        },
      });

      if (!payment) {
        set.status = 404;
        return { success: false, error: 'Payment not found' };
      }

      const sale = payment.sale;
      const customer = payment.customer || sale?.customer;

      const typeLabel =
        PAYMENT_TYPE_LABELS[payment.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || 'ค่าชำระเงิน';
      const carName = sale?.stock?.vehicleModel
        ? `${sale.stock.vehicleModel.brand} ${sale.stock.vehicleModel.model}`
        : '';
      const methodLabel =
        PAYMENT_METHOD_LABELS[payment.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || '';
      const mainItem = `${typeLabel}${carName ? ` - ${carName}` : ''}`;
      const items: { description: string; amount: string }[] = [
        { description: mainItem, amount: payment.amount.toString() },
      ];
      if (payment.description) {
        items.push({ description: payment.description, amount: '' });
      }

      const paymentMethodData = buildReceiptPaymentMethod(payment);

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: TemporaryReceiptData = {
        header: { ...header, fax: '' },
        customerCode: customer?.code || '',
        receiptNumber: payment.receiptNumber,
        date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
        contractNumber: sale?.saleNumber || '',
        customer: transformCustomer(customer),
        items,
        paymentAmount: payment.amount.toString(),
        lateFee: query.lateFee || '0',
        discount: '0',
        totalAmount: (Number(payment.amount) + Number(query.lateFee || 0)).toString(),
        totalAmountText: numberToThaiText(Number(payment.amount) + Number(query.lateFee || 0)),
        paymentMethod: paymentMethodData,
        paymentMethodLabel: methodLabel,
        bankAccount: await buildReceiptBankAccount(payment),
        note: payment.notes || undefined,
      };

      // withForm=true prints the CSS-drawn form too (for blank continuous paper);
      // default remains the data-only overlay for pre-printed SIAMK forms.
      const withForm = query.withForm === 'true';
      // paper=a4 is ignored on the overlay — that grid is locked to 9×5.5 in.
      const paperA4 = withForm && query.paper === 'a4';
      const templateType = withForm
        ? PdfTemplateType.TEMPORARY_RECEIPT
        : PdfTemplateType.TEMPORARY_RECEIPT_BG;

      // padding 0: overlay coordinates map to the pre-printed origin; the full
      // form draws its own frame. Page box comes from the template @page
      // (9.5×5.5 in continuous, A4 landscape, or 9×5.5 in overlay).
      const html = await pdfService.renderHtml(
        templateType,
        { ...data, paperA4 },
        {
          width: paperA4 ? '297mm' : withForm ? '9.5in' : '9in',
          height: paperA4 ? '210mm' : '5.5in',
          padding: '0mm',
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        }
      );

      set.headers['Content-Type'] = 'text/html; charset=utf-8';
      set.headers['Cache-Control'] = 'no-store';
      return injectAutoPrint(html);
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({ paymentId: t.String() }),
      query: t.Object({
        lateFee: t.Optional(t.String()),
        withForm: t.Optional(t.String()),
        paper: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Render Temporary Receipt HTML (auto-print)',
        description:
          'Returns standalone HTML that auto-prints via window.print(). Overlay stays 9×5.5 in. withForm=true draws the CSS form on 9.5×5.5 in continuous paper; withForm=true&paper=a4 uses A4 landscape so the driver does not fit the tractor-feed box onto A4.',
      },
    }
  )

  /**
   * Generate Temporary Receipt PDF (ใบรับเงินชั่วคราว - แบบมีพื้นหลัง)
   */
  .get(
    '/temporary-receipt-bg/:paymentId',
    async ({
      params,
      query,
      set,
    }: { params: { paymentId: string }; query: { lateFee?: string }; set: any }) => {
      const payment = await db.payment.findUnique({
        where: { id: params.paymentId },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: {
                include: {
                  vehicleModel: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        set.status = 404;
        return { success: false, error: 'Payment not found' };
      }

      const sale = payment.sale;
      const customer = payment.customer || sale?.customer;

      // Build items: payment type label as main item, description as sub-item
      const typeLabel =
        PAYMENT_TYPE_LABELS[payment.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || 'ค่าชำระเงิน';
      const carName = sale?.stock?.vehicleModel
        ? `${sale.stock.vehicleModel.brand} ${sale.stock.vehicleModel.model}`
        : '';
      const methodLabel =
        PAYMENT_METHOD_LABELS[payment.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] || '';
      const mainItem = `${typeLabel}${carName ? ` - ${carName}` : ''}`;
      const items: { description: string; amount: string }[] = [
        { description: mainItem, amount: payment.amount.toString() },
      ];
      if (payment.description) {
        items.push({ description: payment.description, amount: '' });
      }

      const paymentMethodData = buildReceiptPaymentMethod(payment);

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: TemporaryReceiptData = {
        header: {
          ...header,
          fax: '',
        },
        customerCode: customer?.code || '',
        receiptNumber: payment.receiptNumber,
        date: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
        contractNumber: sale?.saleNumber || '',
        customer: transformCustomer(customer),
        items,
        paymentAmount: payment.amount.toString(),
        lateFee: query.lateFee || '0',
        discount: '0',
        totalAmount: (Number(payment.amount) + Number(query.lateFee || 0)).toString(),
        totalAmountText: numberToThaiText(Number(payment.amount) + Number(query.lateFee || 0)),
        paymentMethod: paymentMethodData,
        paymentMethodLabel: methodLabel,
        bankAccount: await buildReceiptBankAccount(payment),
        note: payment.notes || undefined,
      };

      const pdfBuffer = await pdfService.generateTemporaryReceiptBg(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="temporary-receipt-bg-${payment.receiptNumber}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')],
      params: t.Object({ paymentId: t.String() }),
      query: t.Object({ lateFee: t.Optional(t.String()) }),
      detail: {
        tags: ['PDF'],
        summary: 'Generate Temporary Receipt PDF with Background',
        description: 'Generate ใบรับเงินชั่วคราว PDF (แบบมีพื้นหลัง) for a payment',
      },
    }
  )

  /**
   * Generate Daily Payment Report PDF
   */
  .get(
    '/daily-payment-report/:date',
    async ({ params, set }) => {
      const date = new Date(params.date);
      // Single-day window: [start of day, start of next day)
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      const dailyPaymentReport = await db.payment.findMany({
        where: {
          paymentDate: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
        include: {
          customer: true,
          sale: {
            include: {
              customer: true,
              stock: {
                include: {
                  vehicleModel: true,
                },
              },
            },
          },
        },
        orderBy: {
          paymentDate: 'asc',
        },
      });

      // Calculate summary
      const totalAmount = dailyPaymentReport.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalCount = dailyPaymentReport.length;

      // VAT-inclusive split via shared helper. Layout keeps zero stub columns for
      // legacy parity; description/notes stay on the payment API for on-screen use.
      const mappedPayments = dailyPaymentReport.map((p) => {
        const amount = Number(p.amount);
        const { net: baseAmount, vat: vatAmount } = splitVat(amount);
        return {
          paymentDate: p.paymentDate,
          receiptNumber: p.receiptNumber,
          customerName: p.customer?.name || p.sale?.customer?.name || 'ลูกค้าทั่วไป',
          // PaymentForm "หมายเหตุ" (sale mode) is stored in description; edit form uses notes.
          itemDetail: p.description || p.notes || '',
          description: p.description || '',
          issuedBy: p.issuedBy || '',
          notes: p.notes || '',
          amount,
          baseAmount,
          vatAmount,
          cashAmount: p.paymentMethod === 'CASH' ? amount : 0,
          chequeAmount: p.paymentMethod === 'CHEQUE' ? amount : 0,
          transferAmount:
            p.paymentMethod === 'BANK_TRANSFER' || p.paymentMethod === 'CREDIT_CARD' ? amount : 0,
          // Layout-parity stubs (no data source yet)
          feeAmount: 0,
          otherIncomeAmount: 0,
          otherExpenseAmount: 0,
          customerPaidAmount: 0,
        };
      });

      const sumCol = (
        key: 'baseAmount' | 'vatAmount' | 'cashAmount' | 'chequeAmount' | 'transferAmount'
      ) => mappedPayments.reduce((s, p) => s + p[key], 0);

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const data: DailyPaymentReportData = {
        header,
        dateRange: `${formatThaiDate(date, 'numeric')} ถึง ${formatThaiDate(date, 'numeric')}`,
        payments: mappedPayments,
        summary: {
          totalAmount,
          totalCount,
          baseAmount: sumCol('baseAmount'),
          vatAmount: sumCol('vatAmount'),
          cashAmount: sumCol('cashAmount'),
          chequeAmount: sumCol('chequeAmount'),
          transferAmount: sumCol('transferAmount'),
          feeAmount: 0,
          otherIncomeAmount: 0,
          otherExpenseAmount: 0,
          customerPaidAmount: 0,
          byMethod: [],
          byType: [],
        },
      };

      const pdfBuffer = await pdfService.generateDailyPaymentReport(data);

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `inline; filename="daily-payment-report-${date.toISOString().slice(0, 10)}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('REPORT_FINANCE')],
      params: t.Object({
        date: t.String(),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Daily Payment Report PDF',
        description: 'Generate ใบบันทึกการชำระเงินรายวัน PDF',
      },
    }
  )
  // Daily Stock Snapshot PDF
  .get(
    '/daily-stock-snapshot',
    async ({ query, set }) => {
      const date = new Date(query.date);
      if (Number.isNaN(date.getTime())) {
        set.status = 400;
        return 'Invalid date';
      }
      const report = await reportsService.getDailyStockSnapshot({ date });
      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const panels = [
        {
          title: 'ยอดจองคงเหลือ',
          rows: report.models.map((m) => ({
            modelName: m.modelName,
            cells: report.colors.map((c) => m.reservationsByColor[c] || 0),
            total: m.reservationsTotal,
          })),
        },
        {
          title: 'สต๊อกคงเหลือ',
          rows: report.models.map((m) => ({
            modelName: m.modelName,
            cells: report.colors.map((c) => m.availableByColor[c] || 0),
            total: m.availableTotal,
          })),
        },
        {
          title: 'ยอดที่ต้องสั่งซื้อ',
          rows: report.models.map((m) => ({
            modelName: m.modelName,
            cells: report.colors.map((c) => m.requiredByColor[c] || 0),
            total: m.requiredTotal,
          })),
        },
      ];

      const pdfBuffer = await pdfService.generateDailyStockSnapshotPdf({
        header,
        date: report.date,
        colors: report.colors,
        panels,
      });
      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="daily-stock-snapshot-${report.date}.pdf"`;
      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('REPORT_STOCK')],
      query: t.Object({ date: t.String() }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Daily Stock Snapshot PDF',
      },
    }
  )
  // Monthly Purchases Report PDF
  .get(
    '/monthly-purchases',
    async ({ query, set }) => {
      const year = Number(query.year);
      const month = Number(query.month);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        set.status = 400;
        return 'Invalid year/month';
      }
      const report = await reportsService.getMonthlyPurchasesReport({
        year,
        month,
        vehicleType: query.vehicleType as any,
      });
      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const items = report.items.map((i) => ({
        ...i,
        orderDate: i.orderDate ? i.orderDate.split('T')[0] : '-',
        arrivalDate: i.arrivalDate.split('T')[0],
      }));

      const pdfBuffer = await pdfService.generateMonthlyPurchasesReportPdf({
        header,
        period: report.period,
        items,
        summary: report.summary,
      });
      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="monthly-purchases-${year}-${String(month).padStart(2, '0')}.pdf"`;
      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('REPORT_STOCK')],
      query: t.Object({
        year: t.String(),
        month: t.String(),
        vehicleType: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Monthly Purchases Report PDF',
      },
    }
  )
  // Monthly Campaign Claim Report PDF (brand submission form)
  .get(
    '/campaign-claims',
    async ({ query, set }) => {
      const startDate = new Date(`${query.startDate}T00:00:00`);
      const endDate = new Date(`${query.endDate}T00:00:00`);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        set.status = 400;
        return 'Invalid startDate/endDate';
      }
      if (!query.brand) {
        set.status = 400;
        return 'brand is required';
      }

      const report = await reportsService.getCampaignClaimReport({
        startDate,
        endDate,
        brand: query.brand,
        campaignId: query.campaignId || undefined,
      });
      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const periodLabel = `${formatThaiDate(startDate, 'full')} - ${formatThaiDate(endDate, 'full')}`;

      // PDF-only: fixed expense columns (ลำดับ…ราคาขาย + 5 expenses + รวม/คัน + วันที่แจ้งขาย)
      const projected = projectCampaignClaimForPdf(report);

      const pdfBuffer = await pdfService.generateCampaignClaimReportPdf({
        header,
        periodLabel,
        brand: report.brand,
        expenseColumns: projected.expenseColumns,
        rows: projected.rows,
        summary: projected.summary,
        printedAt: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      });
      const safeBrand = query.brand.replace(/[^A-Za-z0-9_-]/g, '_');
      const baseName = `campaign-claims-${safeBrand}-${query.startDate}_to_${query.endDate}.pdf`;
      const utf8Name = encodeURIComponent(
        `campaign-claims-${query.brand}-${query.startDate}_to_${query.endDate}.pdf`
      );
      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="${baseName}"; filename*=UTF-8''${utf8Name}`;
      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      query: t.Object({
        startDate: t.String(),
        endDate: t.String(),
        brand: t.String(),
        campaignId: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Documents'],
        summary: 'Generate Monthly Campaign Claim Report PDF',
      },
    }
  );
