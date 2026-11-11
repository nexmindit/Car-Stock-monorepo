import { type SnapshotPanelKind, snapshotPanelRows } from '@car-stock/shared/daily-stock-snapshot';
import type { DailyStockSnapshotResponse } from '@car-stock/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { MainLayout } from '../../components/layout';
import { exportMultiSheet } from '../../components/reports/exportUtils';
import { useToast } from '../../components/toast';
import { reportService } from '../../services/report.service';
import { DatePicker } from '../../components/ui/date-picker';

export function DailyStockSnapshotPage(): React.ReactElement {
  const { addToast } = useToast();
  const [snapshotDate, setSnapshotDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );

  const { data, isLoading, error } = useQuery<DailyStockSnapshotResponse>({
    queryKey: ['daily-stock-snapshot', snapshotDate],
    queryFn: () => reportService.getDailyStockSnapshot({ date: snapshotDate }),
  });

  const handleExport = () => {
    if (!data) return;
    // Same rows as the table/PDF, including รวม <รุ่น> and รวมทั้งหมด.
    const makeRows = (kind: SnapshotPanelKind) =>
      snapshotPanelRows(data.models, data.colors, kind).map((r) => {
        const row: Record<string, string | number> = { แบบรถ: r.label };
        data.colors.forEach((c, ci) => {
          row[c] = r.cells[ci];
        });
        row.Total = r.total;
        return row;
      });

    exportMultiSheet({
      sheets: [
        { name: 'ยอดจองคงเหลือ', data: makeRows('reservations') },
        { name: 'สต๊อกคงเหลือ', data: makeRows('available') },
        { name: 'ยอดที่ต้องสั่งซื้อ', data: makeRows('required') },
      ],
      filename: `daily-stock-snapshot_${snapshotDate}`,
    });
    addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await reportService.getDailyStockSnapshotPdf({ date: snapshotDate });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `daily-stock-snapshot-${snapshotDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      addToast('ดาวน์โหลด PDF สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด PDF ไม่สำเร็จ', 'error');
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="animate-pulse h-8 bg-gray-200 rounded w-1/3 mb-6" />
        </div>
      </MainLayout>
    );
  }

  if (error || !data) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-red-800 font-semibold mb-2">เกิดข้อผิดพลาด</h2>
            <p className="text-red-600">ไม่สามารถโหลดรายงานได้</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const renderPanel = (title: string, kind: SnapshotPanelKind, cellClass?: (n: number) => string) => (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">แบบรถ</th>
              {data.colors.map((c) => (
                <th key={c} className="px-3 py-2 text-center font-medium">
                  {c}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {snapshotPanelRows(data.models, data.colors, kind).map((r) => (
              <tr
                key={r.key}
                className={
                  r.type === 'total'
                    ? 'bg-blue-50 font-bold border-t-2 border-gray-300'
                    : r.type === 'subtotal'
                      ? 'bg-gray-50 font-semibold'
                      : 'hover:bg-gray-50'
                }
              >
                <td className={`px-3 py-2 ${r.type === 'model' ? 'font-medium' : ''}`}>{r.label}</td>
                {r.cells.map((n, ci) => (
                  <td
                    key={data.colors[ci]}
                    className={`px-3 py-2 text-center ${r.type === 'model' && cellClass ? cellClass(n) : ''}`}
                  >
                    {r.type === 'model' ? n || '' : n}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-semibold">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">รายงานสต็อกประจำวัน</h1>
          <p className="text-gray-600 mt-1">แสดงยอดจอง สต็อกคงเหลือ และยอดที่ต้องสั่งซื้อ ณ วันที่เลือก</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 print-hide">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">วันที่:</label>
              <DatePicker
                value={snapshotDate}
                onChange={setSnapshotDate}
              />
            </div>
            <button
              type="button"
              onClick={handleExport}
              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700"
            >
              ดาวน์โหลด Excel
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
            >
              ดาวน์โหลด PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700"
            >
              พิมพ์
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-purple-600 font-medium">ยอดจอง</p>
            <p className="text-2xl font-bold text-purple-900">{data.grand.reservations}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-green-600 font-medium">สต็อกคงเหลือ</p>
            <p className="text-2xl font-bold text-green-900">{data.grand.available}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">รถ DEMO</p>
            <p className="text-2xl font-bold text-blue-900">{data.grand.demo}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <p className="text-sm text-orange-600 font-medium">ต้องสั่งซื้อเพิ่ม</p>
            <p className="text-2xl font-bold text-orange-900">{data.grand.required}</p>
          </div>
        </div>

        {renderPanel('ยอดจองคงเหลือ', 'reservations')}
        {renderPanel('สต๊อกคงเหลือ', 'available')}
        {renderPanel('ยอดที่ต้องสั่งซื้อ', 'required', (n) =>
          n > 0 ? 'bg-orange-50 text-orange-800' : ''
        )}

        {data.unassignedReservations > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
            มีการจองที่ยังไม่ได้ระบุรุ่นรถ {data.unassignedReservations} รายการ (ไม่แสดงในตาราง)
          </div>
        )}
      </div>
    </MainLayout>
  );
}
