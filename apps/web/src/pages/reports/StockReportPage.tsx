import type { StockReportItem, StockReportResponse } from '@car-stock/shared/types';
import { ArrowLeft, Car, Download, FileText, Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import {
  DateRangeFilter,
  PrintButton,
  ReportBarChart,
  ReportPieChart,
  ReportTable,
  StatusBadge,
  SummaryCard,
  SummaryCardsGrid,
  formatCurrency,
  formatDate,
  formatNumber,
} from '../../components/reports';
import { exportMultiSheet, sheetsByVehicleType } from '../../components/reports/exportUtils';
import {
  type StockAttributeFilterValues,
  useStockAttributeFilters,
} from '../../hooks/useStockAttributeFilters';
import { useVehicleTypes } from '../../hooks/useVehicleTypes';
import { reportService } from '../../services/report.service';

export default function StockReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StockReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('');
  const { activeTypes, allTypes, typeLabel } = useVehicleTypes();
  const {
    filters: attrFilters,
    setFilter: setAttrFilter,
    brands,
    models,
    exteriorColors,
    interiorColors,
  } = useStockAttributeFilters();
  const attrSelects: [keyof StockAttributeFilterValues, string, string[]][] = [
    ['brand', 'ยี่ห้อ', brands],
    ['model', 'รุ่นรถ', models],
    ['exteriorColor', 'สีภายนอก', exteriorColors],
    ['interiorColor', 'สีภายใน', interiorColors],
  ];

  // Default dates
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await reportService.getStockReport({
        startDate,
        endDate,
        vehicleType: vehicleTypeFilter || undefined,
        ...attrFilters,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    {
      key: 'vin',
      label: 'เลขถัง / เลขเครื่อง',
      render: (_: string, row: StockReportItem) => (
        <div>
          <div>{row.vin || '-'}</div>
          <div className="text-gray-500">{row.engineNumber || '-'}</div>
        </div>
      ),
    },
    {
      key: 'brand',
      label: 'ยี่ห้อ/รุ่น',
      render: (_: string, row: StockReportItem) => `${row.brand} ${row.model} ${row.variant || ''}`,
    },
    { key: 'year', label: 'ปี', align: 'center' as const },
    { key: 'exteriorColor', label: 'สี' },
    {
      key: 'parkingSlot',
      label: 'ที่จอด',
      align: 'center' as const,
      render: (value: string | null | undefined) => value || '-',
    },
    {
      key: 'statusLabel',
      label: 'สถานะ',
      render: (value: string, row: StockReportItem) => (
        <StatusBadge status={row.status} label={value} />
      ),
    },
    {
      key: 'arrivalDate',
      label: 'วันที่รับเข้า',
      render: (value: string) => formatDate(value),
    },
    {
      key: 'receivedFrom',
      label: 'รับจาก',
      render: (value: string | null | undefined) => value || '-',
    },
    {
      key: 'daysInStock',
      label: 'อายุ (วัน)',
      align: 'right' as const,
      render: (value: number) => formatNumber(value),
    },
    {
      key: 'totalCost',
      label: 'ต้นทุนรวม',
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
    },
  ];

  const toExportRow = (s: StockReportItem) => ({
    VIN: s.vin,
    เลขเครื่อง: s.engineNumber || '-',
    แบบรถ: `${s.brand} ${s.model} ${s.variant || ''}`.trim(),
    ปี: s.year,
    สีภายนอก: s.exteriorColor,
    สีภายใน: s.interiorColor || '-',
    สถานะ: s.statusLabel,
    วันที่สั่งซื้อ: s.orderDate ? formatDate(s.orderDate) : '-',
    วันที่รับเข้า: formatDate(s.arrivalDate),
    รับจาก: s.receivedFrom || '-',
    'ราคาก่อน VAT': s.priceNet ?? 0,
    VAT: s.priceVat ?? 0,
    'ราคารวม VAT': s.priceGross ?? s.baseCost,
    สถานที่จอด: s.parkingSlot || '-',
    หมายเหตุ: s.notes ?? '-',
  });

  const handleExportExcel = async () => {
    if (!data) return;
    try {
      setLoading(true);
      // Per-type sheets: same dates/attribute filters, every vehicle type.
      const all = await reportService.getStockReport({ startDate, endDate, ...attrFilters });
      exportMultiSheet({
        sheets: [
          { name: 'สต็อกรถทั้งหมด', data: data.stocks.map(toExportRow) },
          ...sheetsByVehicleType(all.stocks, {
            getType: (s) => s.vehicleType,
            typeLabel,
            typeOrder: allTypes.map((t) => t.code),
            prefix: 'สต็อกแยก',
            toRow: toExportRow,
          }),
        ],
        filename: 'stock-report',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ดาวน์โหลด Excel ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      setLoading(true);
      const blob = await reportService.getStockReportPdf({
        startDate,
        endDate,
        vehicleType: vehicleTypeFilter || undefined,
        ...attrFilters,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stock-report-${startDate}.pdf`;
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
      <div className="mb-6">
        <button
          onClick={() => navigate('/reports')}
          className="inline-flex items-center text-gray-700 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          กลับ
        </button>
        <h1 className="text-2xl font-bold text-gray-900">รายงานสต็อก</h1>
        <p className="text-gray-600 mt-1">แสดงเฉพาะรถพร้อมขายและรถ Demo แยกตามยี่ห้อ</p>
      </div>

      {/* Date Filter */}
      <div className="mb-6">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onApply={fetchReport}
          loading={loading}
        />
      </div>

      {/* VehicleType Filter */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทรถ</label>
          <select
            value={vehicleTypeFilter}
            onChange={(e) => setVehicleTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">ทั้งหมด</option>
            {activeTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.nameTh}
              </option>
            ))}
          </select>
        </div>
        {attrSelects.map(([key, label, values]) => (
          <div key={key}>
            <label
              htmlFor={`stock-filter-${key}`}
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {label}
            </label>
            <select
              id={`stock-filter-${key}`}
              value={attrFilters[key]}
              onChange={(e) => setAttrFilter(key, e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">ทั้งหมด</option>
              {values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="flex items-end">
          <button
            onClick={fetchReport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            กรองข้อมูล
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6 print-hide">
        <button
          onClick={handleExportExcel}
          disabled={loading || !data}
          className="inline-flex items-center px-4 py-2 border border-green-200 rounded-lg text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50"
        >
          <Download className="w-4 h-4 mr-2" />
          ดาวน์โหลด Excel
        </button>
        <button
          onClick={handleExportPdf}
          disabled={loading || !data}
          className="inline-flex items-center px-4 py-2 border border-blue-200 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
        >
          <FileText className="w-4 h-4 mr-2" />
          ส่งออก PDF
        </button>
        <PrintButton
          title="รายงานสต็อก"
          disabled={loading || !data}
          getPdf={() =>
            reportService.getStockReportPdf({
              startDate,
              endDate,
              vehicleType: vehicleTypeFilter || undefined,
              ...attrFilters,
            })
          }
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div id="report-content">
        {data && (
          <>
            {/* Summary Cards */}
            <SummaryCardsGrid>
              <SummaryCard
                title="รถทั้งหมด"
                value={formatNumber(data.summary.totalCount)}
                subtitle={`มูลค่า ${formatCurrency(data.summary.totalValue)}`}
                icon={Package}
                iconColor="text-blue-600"
                iconBgColor="bg-blue-100"
              />
              <SummaryCard
                title="พร้อมขาย"
                value={formatNumber(data.summary.availableCount)}
                subtitle={
                  data.summary.totalCount > 0
                    ? `${((data.summary.availableCount / data.summary.totalCount) * 100).toFixed(1)}%`
                    : '0%'
                }
                icon={Car}
                iconColor="text-green-600"
                iconBgColor="bg-green-100"
              />
              <SummaryCard
                title="รถ Demo"
                value={formatNumber(data.summary.demoCount)}
                subtitle={
                  data.summary.totalCount > 0
                    ? `${((data.summary.demoCount / data.summary.totalCount) * 100).toFixed(1)}%`
                    : '0%'
                }
                icon={Car}
                iconColor="text-purple-600"
                iconBgColor="bg-purple-100"
              />
            </SummaryCardsGrid>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">สัดส่วนตามสถานะ</h3>
                <ReportPieChart
                  data={data.chartData.byStatus.map((s) => ({
                    name: s.label,
                    value: s.count,
                    status: s.status,
                  }))}
                  nameKey="name"
                  valueKey="value"
                  useStatusColors
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">จำนวนรถตามยี่ห้อ</h3>
                <ReportBarChart
                  data={data.chartData.byBrand}
                  xKey="brand"
                  yKey="count"
                  yKeyLabels={['จำนวน']}
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>
            </div>

            {/* Table */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">รายละเอียดรถในสต็อก</h3>
              <ReportTable
                columns={columns}
                data={data.stocks}
                loading={loading}
                emptyMessage="ไม่พบข้อมูลรถในสต็อก"
              />
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
