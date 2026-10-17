import type { DailyPaymentItem, DailyPaymentReportResponse } from '@car-stock/shared/types';
import { ArrowLeft, FileText } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import {
  DateRangeFilter,
  ExportButton,
  PrintButton,
  formatCurrency,
  formatDate,
} from '../../components/reports';
import { reportService } from '../../services/report.service';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'เงินโอน',
  CHEQUE: 'เช็ค',
  CREDIT_CARD: 'บัตรเครดิต',
};

const METHOD_COLORS: Record<string, string> = {
  CASH: 'text-green-700 bg-green-50',
  BANK_TRANSFER: 'text-blue-700 bg-blue-50',
  CHEQUE: 'text-purple-700 bg-purple-50',
  CREDIT_CARD: 'text-orange-700 bg-orange-50',
};

/** Format a number with Thai conventions: 2 decimals, comma grouping. Returns empty string for 0/null. */
function fmtAmount(val: number | null | undefined): string {
  if (val == null) return '';
  if (val === 0) return '';
  return val.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Map payment method → report money columns matching legacy layout. */
function methodAmounts(p: DailyPaymentItem) {
  const a = p.amount;
  return {
    cash: p.paymentMethod === 'CASH' ? a : 0,
    cheque: p.paymentMethod === 'CHEQUE' ? a : 0,
    // CREDIT_CARD folded into เงินโอน (legacy sheet has no card column)
    transfer: p.paymentMethod === 'BANK_TRANSFER' || p.paymentMethod === 'CREDIT_CARD' ? a : 0,
  };
}

// These rows are temporary receipts (ใบรับเงินชั่วคราว), not tax invoices: booking
// fees, refundable red-plate deposits and registration fees carry no output VAT
// here. Match the customer's legacy report — full amount, ภาษีขาย left blank.
function enrichPayment(p: DailyPaymentItem) {
  const base = p.amount;
  const vat = 0;
  const methods = methodAmounts(p);
  return {
    ...p,
    baseAmount: base,
    vatAmount: vat,
    cashAmount: methods.cash,
    chequeAmount: methods.cheque,
    transferAmount: methods.transfer,
    // No data source yet — columns kept for parity with legacy report
    feeAmount: 0,
    otherIncomeAmount: 0,
    otherExpenseAmount: 0,
    customerPaidAmount: 0,
  };
}

type EnrichedPayment = ReturnType<typeof enrichPayment>;

function sumField(rows: EnrichedPayment[], key: keyof EnrichedPayment): number {
  return rows.reduce((sum, r) => sum + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0);
}

function totalsOf(rows: EnrichedPayment[]) {
  return {
    base: sumField(rows, 'baseAmount'),
    vat: sumField(rows, 'vatAmount'),
    total: sumField(rows, 'amount'),
    cash: sumField(rows, 'cashAmount'),
    cheque: sumField(rows, 'chequeAmount'),
    transfer: sumField(rows, 'transferAmount'),
    fee: sumField(rows, 'feeAmount'),
    otherIncome: sumField(rows, 'otherIncomeAmount'),
    otherExpense: sumField(rows, 'otherExpenseAmount'),
    customerPaid: sumField(rows, 'customerPaidAmount'),
  };
}

/** dd/mm/yyyy in Buddhist year, same as the PDF and the legacy sheet. */
function thaiNumericDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${Number(y) + 543}`;
}

/** รวมประจำวัน after each day, รวมทั้งสิ้น (double underline) once at the end. */
function TotalsRow({
  label,
  count,
  t,
  grand = false,
}: {
  label: string;
  count: number;
  t: ReturnType<typeof totalsOf>;
  grand?: boolean;
}) {
  const edge = grand ? ' border-t-2 border-b-4 border-double border-gray-800' : '';
  const strong = `px-1.5 py-2 text-right ${grand ? 'font-bold' : 'font-semibold'} text-gray-900 tabular-nums whitespace-nowrap${edge}`;
  const plain = `px-1.5 py-2 text-right tabular-nums whitespace-nowrap${edge}`;
  return (
    <tr className={grand ? 'bg-gray-100 border-t border-gray-400' : 'bg-gray-50 border-t-2 border-gray-400'}>
      <td
        colSpan={3}
        className={`px-1.5 py-2 text-left ${grand ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'} whitespace-nowrap`}
      >
        {label}
      </td>
      <td className="px-1.5 py-2 text-gray-700 whitespace-nowrap">{count} รายการ</td>
      <td className={`px-1.5 py-2${edge}`} />
      <td className={strong}>{fmtAmount(t.base)}</td>
      <td className={strong}>{fmtAmount(t.vat)}</td>
      <td className={strong}>{fmtAmount(t.total)}</td>
      <td className={plain}>{fmtAmount(t.customerPaid)}</td>
      <td className={strong}>{fmtAmount(t.cash)}</td>
      <td className={strong}>{fmtAmount(t.cheque)}</td>
      <td className={plain}>{fmtAmount(t.fee)}</td>
      <td className={strong}>{fmtAmount(t.transfer)}</td>
      <td className={plain}>{fmtAmount(t.otherIncome)}</td>
      <td className={plain}>{fmtAmount(t.otherExpense)}</td>
    </tr>
  );
}

export default function DailyPaymentReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DailyPaymentReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await reportService.getDailyPaymentReport({ startDate, endDate });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const payments = (data?.payments ?? []).map(enrichPayment);
  const totalCount = payments.length;
  const totalAmount = data?.summary.totalAmount ?? 0;
  const totals = { ...totalsOf(payments), total: totalAmount };
  // API sorts by date then receipt no., so each day is one contiguous run.
  const days: { date: string; rows: EnrichedPayment[] }[] = [];
  for (const p of payments) {
    const date = p.paymentDate.split('T')[0];
    if (days.at(-1)?.date !== date) days.push({ date, rows: [] });
    days[days.length - 1].rows.push(p);
  }

  const exportHeaders = [
    { key: 'paymentDate', label: 'วันที่เอกสาร' },
    { key: 'receiptNumber', label: 'เลขที่เอกสาร' },
    { key: 'invoiceNumber', label: 'เลขที่ใบกำกับ' },
    { key: 'customerName', label: 'ชื่อลูกค้า' },
    { key: 'itemDetail', label: 'รายละเอียดรายการ' },
    { key: 'baseAmount', label: 'จำนวนเงิน' },
    { key: 'vatAmount', label: 'ภาษีขาย' },
    { key: 'amount', label: 'รวมทั้งสิ้น' },
    { key: 'customerPaidAmount', label: 'ลูกค้าหัก ณ ที่จ่าย' },
    { key: 'cashAmount', label: 'เงินสด' },
    { key: 'chequeAmount', label: 'เช็ค' },
    { key: 'feeAmount', label: 'ค่าธรรมเนียม' },
    { key: 'transferAmount', label: 'เงินโอน' },
    { key: 'otherIncomeAmount', label: 'รายได้อื่นๆ' },
    { key: 'otherExpenseAmount', label: 'ค่าใช้จ่ายอื่นๆ' },
    { key: 'issuedBy', label: 'ผู้รับเงิน' },
  ];

  const exportRows = payments.map((p) => ({
    ...p,
    paymentDate: p.paymentDate.split('T')[0],
    invoiceNumber: p.receiptNumber,
    // PaymentForm "หมายเหตุ" (sale) → description; edit form notes → notes
    itemDetail: p.description || p.notes || '',
    issuedBy: p.issuedBy || '',
    baseAmount: p.baseAmount || '',
    vatAmount: p.vatAmount || '',
    cashAmount: p.cashAmount || '',
    chequeAmount: p.chequeAmount || '',
    feeAmount: p.feeAmount || '',
    transferAmount: p.transferAmount || '',
    otherIncomeAmount: p.otherIncomeAmount || '',
    otherExpenseAmount: p.otherExpenseAmount || '',
    customerPaidAmount: p.customerPaidAmount || '',
  }));

  const handleExportPdf = async () => {
    try {
      setLoading(true);
      const blob = await reportService.getDailyPaymentReportPdf({ startDate, endDate });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `daily-payment-report-${startDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้าง PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: 'Sarabun', sans-serif; font-size: 8pt; }
          .print-clean { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <div className="mb-6 no-print">
        <button
          onClick={() => navigate('/reports')}
          className="inline-flex items-center text-gray-700 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          กลับ
        </button>
        <h1 className="text-2xl font-bold text-gray-900">รายงานรายวันรับเงินมัดจำ</h1>
        <p className="text-gray-600 mt-1">เรียงตามวันที่เอกสาร — แยกยอดเงินสด / เช็ค / เงินโอน</p>
      </div>

      {/* Date Filter */}
      <div className="mb-6 no-print">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onApply={fetchReport}
          loading={loading}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6 no-print">
        <ExportButton
          data={exportRows}
          filename="รายงานรายวันรับเงินมัดจำ"
          sheetName="รายการรับเงิน"
          headers={exportHeaders}
          loading={loading}
        />
        <button
          onClick={handleExportPdf}
          disabled={loading || !data}
          className="inline-flex items-center px-4 py-2 border border-blue-200 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
        >
          <FileText className="w-4 h-4 mr-2" />
          ส่งออก PDF
        </button>
        <PrintButton title="รายงานรายวันรับเงินมัดจำ" contentId="report-content" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div id="report-content">
        {data && (
          <>
            {/* Print header — matches reference document title */}
            <div className="hidden print:block text-center mb-3">
              <div className="text-base font-bold">รายงานรายวันรับเงินมัดจำ - เรียงตามวันที่เอกสาร (แบบเลือกเอง)</div>
              <div className="text-xs mt-1">
                จากวันที่ {formatDate(startDate)} ถึง {formatDate(endDate)}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print-clean">
              <div className="px-6 py-3 border-b bg-gray-50 no-print">
                <h3 className="text-sm font-semibold text-gray-900">รายละเอียดการรับเงิน</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-gray-50 border-b-2 border-gray-400">
                    <tr>
                      <th className="px-1.5 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        วันที่เอกสาร
                      </th>
                      <th className="px-1.5 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        เลขที่เอกสาร
                      </th>
                      <th className="px-1.5 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        เลขที่ใบกำกับ
                      </th>
                      <th className="px-1.5 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        ชื่อลูกค้า
                      </th>
                      <th className="px-1.5 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">
                        รายละเอียดรายการ
                      </th>
                      <th className="px-1.5 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        จำนวนเงิน
                      </th>
                      <th className="px-1.5 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        ภาษีขาย
                      </th>
                      <th className="px-1.5 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        รวมทั้งสิ้น
                      </th>
                      <th className="px-1.5 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        ลูกค้าหัก ณ ที่จ่าย
                      </th>
                      <th className="px-1.5 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        เงินสด
                      </th>
                      <th className="px-1.5 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        เช็ค
                      </th>
                      <th className="px-1.5 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        ค่าธรรมเนียม
                      </th>
                      <th className="px-1.5 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        เงินโอน
                      </th>
                      <th className="px-1.5 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        รายได้อื่นๆ
                      </th>
                      <th className="px-1.5 py-2 text-right font-semibold text-gray-700 whitespace-nowrap">
                        ค่าใช้จ่ายอื่นๆ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={15} className="px-2 py-12 text-center text-gray-500">
                          ไม่พบรายการรับเงินในช่วงเวลาที่เลือก
                        </td>
                      </tr>
                    )}
                    {days.map((day) => (
                      <Fragment key={day.date}>
                        {day.rows.map((p) => (
                          <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-1.5 py-1.5 text-gray-900 whitespace-nowrap">
                              {thaiNumericDate(p.paymentDate)}
                            </td>
                            <td className="px-1.5 py-1.5 text-gray-900 whitespace-nowrap">
                              {p.receiptNumber}
                            </td>
                            <td className="px-1.5 py-1.5 text-gray-900 whitespace-nowrap">
                              {p.receiptNumber}
                            </td>
                            <td className="px-1.5 py-1.5 text-gray-900">
                              {p.customerName}
                            </td>
                            <td
                              className="px-1.5 py-1.5 text-gray-900 max-w-[10rem] truncate"
                              title={p.description || p.notes || undefined}
                            >
                              {p.description || p.notes || ''}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                              {fmtAmount(p.baseAmount)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                              {fmtAmount(p.vatAmount)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-gray-900 font-medium tabular-nums whitespace-nowrap">
                              {fmtAmount(p.amount)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                              {fmtAmount(p.customerPaidAmount)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                              {fmtAmount(p.cashAmount)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                              {fmtAmount(p.chequeAmount)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                              {fmtAmount(p.feeAmount)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                              {fmtAmount(p.transferAmount)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                              {fmtAmount(p.otherIncomeAmount)}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-gray-900 tabular-nums whitespace-nowrap">
                              {fmtAmount(p.otherExpenseAmount)}
                            </td>
                          </tr>
                        ))}
                        <TotalsRow label="รวมประจำวัน" count={day.rows.length} t={totalsOf(day.rows)} />
                      </Fragment>
                    ))}
                  </tbody>
                  {payments.length > 0 && (
                    <tfoot>
                      <TotalsRow label="รวมทั้งสิ้น" count={totalCount} t={totals} grand />
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Method Breakdown Summary — below table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mt-6 print-clean no-print">
              <div className="px-6 py-3 border-b bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900">สรุปยอดรับเงินแยกตามวิธีชำระ</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                        วิธีชำระ
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">
                        จำนวนรายการ
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">
                        ยอดเงิน (บาท)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD'].map((method) => {
                      const found = data.summary.byMethod.find((m) => m.method === method);
                      const count = found?.count || 0;
                      const amount = found?.amount || 0;
                      return (
                        <tr key={method} className={amount > 0 ? '' : 'opacity-40'}>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${METHOD_COLORS[method] || 'text-gray-700 bg-gray-100'}`}
                            >
                              {PAYMENT_METHOD_LABELS[method] || method}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-700">{count} รายการ</td>
                          <td className="px-4 py-2 text-right font-medium tabular-nums">
                            {formatCurrency(amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td className="px-4 py-2 font-bold text-gray-900">ยอดรวมทั้งหมด</td>
                      <td className="px-4 py-2 text-right font-bold text-gray-900">
                        {data.summary.totalCount} รายการ
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-gray-900 tabular-nums">
                        {formatCurrency(data.summary.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}

        {loading && !data && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-700">กำลังโหลดข้อมูล...</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
