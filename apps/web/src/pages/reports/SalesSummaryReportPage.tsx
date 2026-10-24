import type {
  SalesBySalesperson,
  SalesSummaryItem,
  SalesSummaryReportResponse,
} from '@car-stock/shared/types';
import { ArrowLeft, Award, DollarSign, FileText, Target, TrendingUp, Users } from 'lucide-react';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import {
  DateRangeFilter,
  PrintButton,
  ReportBarChart,
  ReportPieChart,
  ReportTable,
  SummaryCard,
  SummaryCardsGrid,
  formatCurrency,
  formatNumber,
} from '../../components/reports';
import { exportMultiSheet, sheetsByVehicleType } from '../../components/reports/exportUtils';
import { useVehicleTypes } from '../../hooks/useVehicleTypes';
import { reportService } from '../../services/report.service';
import { buildSalesSummaryExportRow } from './salesSummaryColumns';

export default function SalesSummaryReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SalesSummaryReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('');
  const { activeTypes, allTypes, typeLabel } = useVehicleTypes();

  // Default dates (first day of month to today)
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await reportService.getSalesSummaryReport({
        startDate,
        endDate,
        status: statusFilter || undefined,
        vehicleType: vehicleTypeFilter || undefined,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const toSaleExportRow = (s: SalesSummaryItem, idx: number) => buildSalesSummaryExportRow(s, idx);

  const handleExportExcel = async () => {
    if (!data) return;
    try {
      setLoading(true);
      // Per-type sheets: same dates/status, every vehicle type.
      const all = await reportService.getSalesSummaryReport({
        startDate,
        endDate,
        status: statusFilter || undefined,
      });
      exportMultiSheet({
        sheets: [
          { name: 'รายการตัดขายประจำเดือน', data: data.sales.map(toSaleExportRow) },
          ...sheetsByVehicleType(all.sales, {
            getType: (s) => s.vehicleType,
            typeLabel,
            typeOrder: allTypes.map((t) => t.code),
            prefix: 'รายการตัดขายแยก',
            toRow: toSaleExportRow,
          }),
        ],
        filename: 'sales-summary',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ดาวน์โหลด Excel ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salespersonColumns = [
    {
      key: 'rank',
      label: '#',
      align: 'center' as const,
      render: (_: number, row: SalesBySalesperson) => {
        const index = data?.bySalesperson.findIndex((s) => s.id === row.id) ?? 0;
        return (
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              index === 0
                ? 'bg-yellow-400 text-yellow-900'
                : index === 1
                  ? 'bg-gray-300 text-gray-800'
                  : index === 2
                    ? 'bg-orange-400 text-orange-900'
                    : 'bg-gray-100 text-gray-600'
            }`}
          >
            {index + 1}
          </span>
        );
      },
    },
    { key: 'salesperson', label: 'พนักงานขาย' },
    {
      key: 'totalSales',
      label: 'จำนวนขาย',
      align: 'right' as const,
      render: (value: number) => `${formatNumber(value)} คัน`,
    },
    {
      key: 'pendingCount',
      label: 'รอดำเนินการ',
      align: 'right' as const,
      render: (value: number) => formatNumber(value),
    },
    {
      key: 'completedCount',
      label: 'สำเร็จ',
      align: 'right' as const,
      render: (value: number) => (
        <span className="text-green-600 font-medium">{formatNumber(value)}</span>
      ),
    },
    {
      key: 'canceledCount',
      label: 'ยกเลิก',
      align: 'right' as const,
      render: (value: number) => <span className="text-red-600">{formatNumber(value)}</span>,
    },
    {
      key: 'totalAmount',
      label: 'ยอดขาย',
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'commission',
      label: 'ค่าคอม',
      align: 'right' as const,
      render: (value: number) => (
        <span className="text-blue-600 font-medium">{formatCurrency(value)}</span>
      ),
    },
    {
      key: 'commissionVat',
      label: 'VAT 7%',
      align: 'right' as const,
      render: (value: number) => (
        <span className="text-orange-600 font-medium">{formatCurrency(value)}</span>
      ),
    },
    {
      key: 'commissionWithVat',
      label: 'ค่าคอมรวม VAT',
      align: 'right' as const,
      render: (value: number) => (
        <span className="text-green-600 font-medium">{formatCurrency(value)}</span>
      ),
    },
  ];

  const handleExportPdf = async () => {
    try {
      setLoading(true);
      const blob = await reportService.getSalesSummaryReportPdf({
        startDate,
        endDate,
        status: statusFilter || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sales-summary-report-${startDate}.pdf`;
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
        <h1 className="text-2xl font-bold text-gray-900">รายงานสรุปยอดขาย</h1>
        <p className="text-gray-600 mt-1">รายงานสรุปยอดขายแยกตามพนักงานขายและสถานะการขาย</p>
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

      {/* Status + VehicleType Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">ทั้งหมด</option>
            <option value="QUOTATION">ใบเสนอราคา</option>
            <option value="DEPOSIT_PENDING">รอวางมัดจำ</option>
            <option value="DEPOSIT_RECEIVED">รับมัดจำแล้ว</option>
            <option value="FINANCE_PENDING">รอไฟแนนซ์</option>
            <option value="FINANCE_APPROVED">ไฟแนนซ์อนุมัติ</option>
            <option value="PREPARING_DELIVERY">เตรียมส่งมอบ</option>
            <option value="DELIVERED">ส่งมอบแล้ว</option>
            <option value="COMPLETED">สำเร็จ</option>
            <option value="CANCELED">ยกเลิก</option>
          </select>
        </div>
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
          title="รายงานสรุปยอดขาย"
          disabled={loading || !data}
          getPdf={() =>
            reportService.getSalesSummaryReportPdf({
              startDate,
              endDate,
              status: statusFilter || undefined,
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
                title="ยอดขายทั้งหมด"
                value={formatNumber(data.summary.totalCount)}
                subtitle="รายการ"
                icon={TrendingUp}
                iconColor="text-blue-600"
                iconBgColor="bg-blue-100"
              />
              <SummaryCard
                title="มูลค่ารวม"
                value={formatCurrency(data.summary.totalAmount)}
                subtitle={`เฉลี่ย ${formatCurrency(data.summary.averageAmount)}`}
                icon={DollarSign}
                iconColor="text-green-600"
                iconBgColor="bg-green-100"
              />
              <SummaryCard
                title="สำเร็จ"
                value={formatNumber(data.summary.completedCount)}
                subtitle={`${data.summary.totalCount > 0 ? ((data.summary.completedCount / data.summary.totalCount) * 100).toFixed(1) : 0}%`}
                icon={Target}
                iconColor="text-purple-600"
                iconBgColor="bg-purple-100"
              />
              <SummaryCard
                title="พนักงานขายขายดี"
                value={data.summary.topSalesperson || '-'}
                subtitle="ยอดขายสูงสุด"
                icon={Award}
                iconColor="text-yellow-600"
                iconBgColor="bg-yellow-100"
              />
              <SummaryCard
                title="เงินสนับสนุน (เบิกแคมเปญ)"
                value={formatCurrency(data.summary.totalCampaignSubsidy ?? 0)}
                subtitle={
                  data.summary.totalNetCarDiscount != null
                    ? `ส่วนลดสุทธิ ${formatCurrency(data.summary.totalNetCarDiscount)}`
                    : 'ยอดเบิกจากสูตรแคมเปญ'
                }
                icon={FileText}
                iconColor="text-emerald-600"
                iconBgColor="bg-emerald-100"
              />
            </SummaryCardsGrid>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">สัดส่วนสถานะการขาย</h3>
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">ยอดขายรายเดือน</h3>
                <ReportBarChart
                  data={data.chartData.monthly}
                  xKey="month"
                  yKey="count"
                  yKeyLabels={['จำนวน']}
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>
            </div>

            {/* Status Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">สถานะการขาย</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {data.chartData.byStatus.map((status) => (
                  <div key={status.status} className="p-3 bg-gray-50 rounded-lg text-center">
                    <p className="text-xs text-gray-600 mb-1">{status.label}</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {formatNumber(status.count)}
                    </p>
                    <p className="text-sm text-gray-500">{formatCurrency(status.amount)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Salesperson Table */}
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-gray-700" />
                <h3 className="text-lg font-semibold text-gray-900">ยอดขายตามพนักงาน</h3>
              </div>
              <ReportTable
                columns={salespersonColumns}
                data={data.bySalesperson}
                loading={loading}
                emptyMessage="ไม่พบข้อมูลพนักงานขาย"
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
