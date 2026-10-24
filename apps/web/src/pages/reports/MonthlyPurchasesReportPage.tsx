import type { MonthlyPurchasesItem, MonthlyPurchasesResponse } from '@car-stock/shared/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { MainLayout } from '../../components/layout';
import { exportMultiSheet, sheetsByVehicleType } from '../../components/reports/exportUtils';
import { useToast } from '../../components/toast';
import { useVehicleTypes } from '../../hooks/useVehicleTypes';
import { reportService } from '../../services/report.service';

const MONTH_NAMES_TH = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export function MonthlyPurchasesReportPage(): React.ReactElement {
  const { addToast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [vehicleType, setVehicleType] = useState('');
  const { activeTypes, allTypes, typeLabel } = useVehicleTypes();

  const { data, isLoading, error } = useQuery<MonthlyPurchasesResponse>({
    queryKey: ['monthly-purchases', year, month, vehicleType],
    queryFn: () =>
      reportService.getMonthlyPurchasesReport({
        year,
        month,
        vehicleType: vehicleType || undefined,
      }),
  });

  const handleExport = async () => {
    if (!data) return;
    const toRow = (i: MonthlyPurchasesItem) => ({
      NO: i.no,
      แบบรถ: i.vehicleModelName,
      สี: i.exteriorColor,
      แชชซี่ส์: i.vin,
      เลขเครื่อง: i.engineNumber,
      วันที่สั่งซื้อ: i.orderDate ? i.orderDate.split('T')[0] : '-',
      วันที่รับเข้า: i.arrivalDate.split('T')[0],
      รับจาก: i.receivedFrom,
      'ราคาก่อน VAT': i.priceNet,
      VAT: i.priceVat,
      'ราคารวม VAT': i.priceGross,
      สถานที่จอด: i.parkingSlot,
      ชื่อลูกค้า: i.customerName ?? '-',
      วันที่ขาย: i.soldDate ? i.soldDate.split('T')[0] : '-',
      ผู้จัดซื้อ: i.purchasedBy ?? '-',
      หมายเหตุ: i.notes ?? '-',
    });

    try {
      // Per-type sheets come from the whole month, not the on-screen type filter.
      const all = vehicleType
        ? await reportService.getMonthlyPurchasesReport({ year, month })
        : data;
      exportMultiSheet({
        sheets: [
          { name: 'รายการซื้อรถประจำเดือน', data: data.items.map(toRow) },
          ...sheetsByVehicleType(all.items, {
            getType: (i) => i.vehicleType,
            typeLabel,
            typeOrder: allTypes.map((t) => t.code),
            prefix: 'รายการซื้อแยก',
            toRow,
          }),
        ],
        filename: `monthly-purchases_${year}-${String(month).padStart(2, '0')}`,
      });
      addToast('ดาวน์โหลด Excel สำเร็จ', 'success');
    } catch {
      addToast('ดาวน์โหลด Excel ไม่สำเร็จ', 'error');
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await reportService.getMonthlyPurchasesReportPdf({
        year,
        month,
        vehicleType: vehicleType || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `monthly-purchases-${year}-${String(month).padStart(2, '0')}.pdf`;
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
        <div className="p-6 animate-pulse">กำลังโหลด...</div>
      </MainLayout>
    );
  }
  if (error || !data) {
    return (
      <MainLayout>
        <div className="p-6 text-red-600">ไม่สามารถโหลดรายงานได้</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">รายงานรายการซื้อประจำเดือน</h1>
          <p className="text-gray-600 mt-1">รายการรถที่รับเข้าภายในเดือนที่เลือก</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 print-hide">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ปี:</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-24"
                min={2000}
                max={3000}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">เดือน:</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {MONTH_NAMES_TH[m - 1]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">ประเภทรถ:</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="">ทั้งหมด</option>
                {activeTypes.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.nameTh}
                  </option>
                ))}
              </select>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">จำนวนรถ</p>
            <p className="text-2xl font-bold text-blue-900">{data.summary.totalVehicles}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-green-600 font-medium">ราคาก่อน VAT รวม</p>
            <p className="text-2xl font-bold text-green-900">
              {data.summary.totalPriceNet.toLocaleString()}
            </p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-purple-600 font-medium">ราคารวม VAT</p>
            <p className="text-2xl font-bold text-purple-900">
              {data.summary.totalPriceGross.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {[
                  'NO',
                  'แบบรถ',
                  'สี',
                  'แชชซี่ส์',
                  'เลขเครื่อง',
                  'วันสั่งซื้อ',
                  'วันรับเข้า',
                  'รับจาก',
                  'ก่อน VAT',
                  'VAT',
                  'รวม VAT',
                  'ที่จอด',
                  'ลูกค้า',
                  'วันขาย',
                  'ผู้จัดซื้อ',
                  'หมายเหตุ',
                ].map((h) => (
                  <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.items.map((i) => (
                <tr key={i.vin} className="hover:bg-gray-50">
                  <td className="px-2 py-1">{i.no}</td>
                  <td className="px-2 py-1">{i.vehicleModelName}</td>
                  <td className="px-2 py-1">{i.exteriorColor}</td>
                  <td className="px-2 py-1 font-mono">{i.vin}</td>
                  <td className="px-2 py-1 font-mono">{i.engineNumber}</td>
                  <td className="px-2 py-1">{i.orderDate?.split('T')[0] ?? '-'}</td>
                  <td className="px-2 py-1">{i.arrivalDate.split('T')[0]}</td>
                  <td className="px-2 py-1">{i.receivedFrom}</td>
                  <td className="px-2 py-1 text-right">{i.priceNet.toLocaleString()}</td>
                  <td className="px-2 py-1 text-right">{i.priceVat.toLocaleString()}</td>
                  <td className="px-2 py-1 text-right">{i.priceGross.toLocaleString()}</td>
                  <td className="px-2 py-1">{i.parkingSlot}</td>
                  <td className="px-2 py-1">{i.customerName ?? '-'}</td>
                  <td className="px-2 py-1">{i.soldDate?.split('T')[0] ?? '-'}</td>
                  <td className="px-2 py-1">{i.purchasedBy ?? '-'}</td>
                  <td className="px-2 py-1">{i.notes ?? '-'}</td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-2 py-6 text-center text-gray-500">
                    ไม่พบข้อมูลรายงาน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
