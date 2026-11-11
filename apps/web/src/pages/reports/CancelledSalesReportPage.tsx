import type { CancelledSalesReportResponse } from '@car-stock/shared/types';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { DateRangeFilter, formatCurrency } from '../../components/reports';
import { exportMultiSheet } from '../../components/reports/exportUtils';
import { reportService } from '../../services/report.service';

/** dd/mm/yyyy in Buddhist year, same as the PDF. */
function thaiDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
}

/** รายงานลูกค้ายกเลิก — who cancelled and how much was received, for finance to refund. */
export function CancelledSalesReportPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [startDate, setStartDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [data, setData] = useState<CancelledSalesReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await reportService.getCancelledSalesReport({ startDate, endDate }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once; the filter has its own apply button
  useEffect(() => {
    fetchReport();
  }, []);

  const handlePdf = async () => {
    try {
      setLoading(true);
      const blob = await reportService.getCancelledSalesReportPdf({ startDate, endDate });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cancelled-sales-${startDate}_${endDate}.pdf`;
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

  const handleExcel = () => {
    if (!data) return;
    exportMultiSheet({
      sheets: [
        {
          name: 'ลูกค้ายกเลิก',
          data: data.rows.map((r, i) => ({
            ลำดับ: i + 1,
            เลขที่ใบขาย: r.saleNumber,
            ชื่อลูกค้า: r.customerName,
            โทร: r.customerPhone,
            รถ: r.vehicleName,
            สี: r.color,
            วันที่จอง: thaiDate(r.saleDate),
            วันที่ยกเลิก: thaiDate(r.cancelledAt),
            ราคารถ: r.totalAmount,
            'รับเงินแล้ว (ยอดคืน)': r.paidAmount,
            เหตุผล: r.reason,
            พนักงานขาย: r.salesperson,
          })),
        },
      ],
      filename: `cancelled-sales_${startDate}_${endDate}`,
    });
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate('/reports')}
          className="inline-flex items-center text-gray-700 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          กลับ
        </button>
        <h1 className="text-2xl font-bold text-gray-900">รายงานลูกค้ายกเลิก</h1>
        <p className="text-gray-600 mt-1">
          รายการขาย/จองที่ยกเลิก พร้อมยอดเงินที่รับไว้แล้ว สำหรับการเงินใช้คืนเงินลูกค้า (กรองตามวันที่ยกเลิก)
        </p>
      </div>

      <div className="mb-4">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onApply={fetchReport}
          loading={loading}
        />
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          type="button"
          onClick={handleExcel}
          disabled={!data || loading}
          className="inline-flex items-center px-4 py-2 border border-green-600 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50"
        >
          <Download className="w-4 h-4 mr-2" />
          ดาวน์โหลด Excel
        </button>
        <button
          type="button"
          onClick={handlePdf}
          disabled={!data || loading}
          className="inline-flex items-center px-4 py-2 border border-blue-600 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50"
        >
          <FileText className="w-4 h-4 mr-2" />
          พิมพ์ PDF (F14)
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {data && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-center font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">เลขที่ใบขาย</th>
                <th className="px-3 py-2 text-left font-medium">ลูกค้า</th>
                <th className="px-3 py-2 text-left font-medium">รถ</th>
                <th className="px-3 py-2 text-center font-medium">วันที่จอง</th>
                <th className="px-3 py-2 text-center font-medium">วันที่ยกเลิก</th>
                <th className="px-3 py-2 text-right font-medium">ราคารถ</th>
                <th className="px-3 py-2 text-right font-medium">รับเงินแล้ว (ยอดคืน)</th>
                <th className="px-3 py-2 text-left font-medium">เหตุผล / พนักงานขาย</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                    ไม่มีลูกค้ายกเลิกในช่วงเวลานี้
                  </td>
                </tr>
              )}
              {data.rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-center">{i + 1}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/sales/${r.id}`)}
                      className="text-blue-600 hover:underline"
                    >
                      {r.saleNumber}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {r.customerName}
                    {r.customerPhone && <div className="text-xs text-gray-500">{r.customerPhone}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {r.vehicleName}
                    {r.color && <div className="text-xs text-gray-500">สี {r.color}</div>}
                  </td>
                  <td className="px-3 py-2 text-center">{thaiDate(r.saleDate)}</td>
                  <td className="px-3 py-2 text-center">{thaiDate(r.cancelledAt)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(r.totalAmount)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(r.paidAmount)}</td>
                  <td className="px-3 py-2">
                    {r.reason}
                    <div className="text-xs text-gray-500">{r.salesperson}</div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-blue-50 font-semibold">
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right">
                  รวม {data.summary.count} ราย
                </td>
                <td className="px-3 py-2 text-right">{formatCurrency(data.summary.totalPaid)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </MainLayout>
  );
}
