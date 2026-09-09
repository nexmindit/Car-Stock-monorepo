import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import {
  ArrowLeft,
  Percent,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  Car,
  FileText,
} from 'lucide-react';
import { reportService } from '../../services/report.service';
import {
  DateRangeFilter,
  SummaryCard,
  SummaryCardsGrid,
  ReportBarChart,
  ReportLineChart,
  ReportTable,
  ExportButton,
  PrintButton,
  formatCurrency,
  formatDate,
  formatNumber,
} from '../../components/reports';
import type { StockInterestReportResponse, StockInterestItem } from '@car-stock/shared/types';

export default function StockInterestReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StockInterestReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Default dates (first day of year to today)
  const today = new Date();
  const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
  const [startDate, setStartDate] = useState(firstDayOfYear.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await reportService.getStockInterestReport({
        startDate,
        endDate,
        status: statusFilter || undefined,
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
    { key: 'vin', label: 'VIN' },
    {
      key: 'vehicleInfo',
      label: 'รุ่น',
      render: (value: string) => value,
    },
    {
      key: 'status',
      label: 'สถานะ',
      render: (_: string, row: StockInterestItem) => {
        const statusMap: Record<string, { label: string; color: string }> = {
          'AVAILABLE': { label: 'พร้อมขาย', color: 'bg-green-100 text-green-800' },
          'RESERVED': { label: 'จองแล้ว', color: 'bg-yellow-100 text-yellow-800' },
          'PREPARING': { label: 'เตรียมส่งมอบ', color: 'bg-blue-100 text-blue-800' },
          'SOLD': { label: 'ขายแล้ว', color: 'bg-gray-100 text-gray-800' },
          'DEMO': { label: 'รถ Demo', color: 'bg-purple-100 text-purple-800' },
        };
        const s = statusMap[row.status] || { label: row.status, color: 'bg-gray-100 text-gray-800' };
        return <span className={`px-2 py-1 text-xs rounded-full ${s.color}`}>{s.label}</span>;
      },
    },
    {
      key: 'interestActionDate',
      label: 'วันที่เริ่ม/หยุดคิด',
      render: (value: string) => formatDate(value),
    },
    {
      key: 'isCalculating',
      label: 'สถานะดอกเบี้ย',
      align: 'center' as const,
      render: (_: boolean, row: StockInterestItem) =>
        row.isCalculating ? (
          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">กำลังคิด</span>
        ) : (
          <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">หยุดแล้ว</span>
        ),
    },
    {
      key: 'principalAmount',
      label: 'ต้นทุน/ฐาน',
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'interestRate',
      label: 'ดอกเบี้ย %',
      align: 'center' as const,
      render: (value: number) => `${value.toFixed(2)}%`,
    },
    {
      key: 'daysCount',
      label: 'จำนวนวัน',
      align: 'center' as const,
      render: (value: number) => (
        <span className={value > 90 ? 'text-red-600 font-medium' : value > 60 ? 'text-yellow-600' : ''}>
          {formatNumber(value)}
        </span>
      ),
    },
    {
      key: 'accumulatedInterest',
      label: 'ดบ. ในช่วง',
      align: 'right' as const,
      render: (value: number) => (
        <span className="text-red-600">{formatCurrency(value)}</span>
      ),
    },
    {
      key: 'paidInterest',
      label: 'จ่ายแล้ว',
      align: 'right' as const,
      render: (value: number) => (
        <span className="text-green-600">{formatCurrency(value)}</span>
      ),
    },
    {
      key: 'pendingInterest',
      label: 'ค้างชำระ',
      align: 'right' as const,
      render: (value: number) => (
        <span className={value > 0 ? 'text-orange-600 font-medium' : ''}>
          {formatCurrency(value)}
        </span>
      ),
    },
  ];

  const exportHeaders = [
    { key: 'vin', label: 'VIN' },
    { key: 'vehicleInfo', label: 'รุ่น' },
    { key: 'statusLabel', label: 'สถานะ' },
    { key: 'interestActionDate', label: 'วันที่เริ่ม/หยุดคิด' },
    { key: 'interestStatusLabel', label: 'สถานะดอกเบี้ย' },
    { key: 'principalAmount', label: 'ต้นทุน/ฐาน' },
    { key: 'interestRate', label: 'ดอกเบี้ย %' },
    { key: 'daysCount', label: 'จำนวนวัน' },
    { key: 'accumulatedInterest', label: 'ดบ. ในช่วง' },
    { key: 'paidInterest', label: 'จ่ายแล้ว' },
    { key: 'pendingInterest', label: 'ค้างชำระ' },
    { key: 'totalCostWithInterest', label: 'ต้นทุนรวมดอกเบี้ย' },
  ];

  const handleExportPdf = async () => {
    try {
      setLoading(true);
      const blob = await reportService.getStockInterestReportPdf({
        startDate,
        endDate,
        status: statusFilter || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stock-interest-report-${startDate}.pdf`;
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
        <h1 className="text-2xl font-bold text-gray-900">รายงานดอกเบี้ยสต็อก</h1>
        <p className="text-gray-600 mt-1">
          รายงานดอกเบี้ยรถในสต็อก คิดเฉพาะช่วงวันที่ที่เลือก แยกตามสถานะการชำระ
        </p>
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

      {/* Status Filter */}
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">สถานะรถ</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">ทั้งหมด</option>
            <option value="AVAILABLE">พร้อมขาย</option>
            <option value="RESERVED">จองแล้ว</option>
            <option value="PREPARING">เตรียมส่งมอบ</option>
            <option value="SOLD">ขายแล้ว</option>
            <option value="DEMO">รถ Demo</option>
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
      <div className="flex gap-3 mb-6">
        <ExportButton
          data={data?.items || []}
          filename="รายงานดอกเบี้ยสต็อก"
          sheetName="ดอกเบี้ยสต็อก"
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
        <PrintButton
          title="รายงานดอกเบี้ยสต็อก"
          disabled={loading || !data}
          getPdf={() =>
            reportService.getStockInterestReportPdf({
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
                title="ดอกเบี้ยในช่วงที่เลือก"
                value={formatCurrency(data.summary.totalInterest)}
                subtitle={`${formatNumber(data.summary.totalVehicles)} คัน`}
                icon={Percent}
                iconColor="text-red-600"
                iconBgColor="bg-red-100"
              />
              <SummaryCard
                title="ดอกเบี้ยชำระแล้ว"
                value={formatCurrency(data.summary.paidInterest)}
                subtitle={`${data.summary.totalInterest > 0 ? ((data.summary.paidInterest / data.summary.totalInterest) * 100).toFixed(1) : 0}%`}
                icon={CheckCircle}
                iconColor="text-green-600"
                iconBgColor="bg-green-100"
              />
              <SummaryCard
                title="ดอกเบี้ยค้างชำระ"
                value={formatCurrency(data.summary.pendingInterest)}
                subtitle={`${data.summary.totalInterest > 0 ? ((data.summary.pendingInterest / data.summary.totalInterest) * 100).toFixed(1) : 0}%`}
                icon={Clock}
                iconColor="text-orange-600"
                iconBgColor="bg-orange-100"
              />
              <SummaryCard
                title="ค่าดอกเบี้ยเฉลี่ย/วัน"
                value={formatCurrency(data.summary.averageInterestPerDay)}
                icon={DollarSign}
                iconColor="text-blue-600"
                iconBgColor="bg-blue-100"
              />
            </SummaryCardsGrid>

            {/* Warning Section */}
            {data.summary.overdueVehicles > 0 && (
              <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-orange-800">รถค้างนาน</h4>
                  <p className="text-sm text-orange-700">
                    มีรถ <span className="font-bold">{data.summary.overdueVehicles}</span> คัน
                    ที่อยู่ในสต็อกเกิน 90 วัน สะสมดอกเบี้ยรวม{' '}
                    <span className="font-bold">{formatCurrency(data.summary.overdueInterest)}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">ดอกเบี้ยในช่วง แยกตามเดือนที่รับรถ</h3>
                <ReportBarChart
                  data={data.chartData.monthlyInterest}
                  xKey="month"
                  yKey="interest"
                  yKeyLabels={['ดอกเบี้ย']}
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">แนวโน้มดอกเบี้ยสะสม</h3>
                <ReportLineChart
                  data={data.chartData.monthlyInterest}
                  xKey="month"
                  yKey={['interest', 'paidInterest']}
                  yKeyLabels={['ดอกเบี้ย', 'ชำระแล้ว']}
                  colors={['#EF4444', '#10B981']}
                  height={300}
                  className="border-0 shadow-none p-0"
                />
              </div>
            </div>

            {/* Interest status */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">สถานะดอกเบี้ย</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-sm font-medium text-green-800">กำลังคิด</p>
                  <p className="text-xs text-green-700">{formatNumber(data.summary.calculatingCount)} คัน</p>
                  <p className="text-sm font-semibold text-green-800 mt-1">
                    {formatCurrency(data.summary.calculatingInterest)}
                  </p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-sm font-medium text-red-800">หยุดแล้ว</p>
                  <p className="text-xs text-red-700">{formatNumber(data.summary.stoppedCount)} คัน</p>
                  <p className="text-sm font-semibold text-red-800 mt-1">
                    {formatCurrency(data.summary.stoppedInterest)}
                  </p>
                </div>
              </div>
            </div>

            {/* Interest by Brand */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Car className="w-5 h-5 text-gray-700" />
                <h3 className="text-lg font-semibold text-gray-900">ดอกเบี้ยแยกตามยี่ห้อ</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {data.chartData.byBrand.map((item) => (
                  <div key={item.brand} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-900">{item.brand}</p>
                    <p className="text-xs text-gray-500">{formatNumber(item.count)} คัน</p>
                    <p className="text-sm font-semibold text-red-600 mt-1">
                      {formatCurrency(item.interest)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Interest Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">สรุปต้นทุนดอกเบี้ย</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">ต้นทุนรถทั้งหมด</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {formatCurrency(data.summary.totalBaseCost)}
                  </p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-600">ดอกเบี้ยในช่วงที่เลือก</p>
                  <p className="text-xl font-semibold text-red-700">
                    +{formatCurrency(data.summary.totalInterest)}
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600">ดอกเบี้ยชำระแล้ว</p>
                  <p className="text-xl font-semibold text-green-700">
                    -{formatCurrency(data.summary.paidInterest)}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600">ต้นทุนรวม (หลังหักชำระ)</p>
                  <p className="text-xl font-semibold text-blue-700">
                    {formatCurrency(data.summary.totalBaseCost + data.summary.pendingInterest)}
                  </p>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">รายการดอกเบี้ย</h3>
              <ReportTable
                columns={columns}
                data={data.items}
                loading={loading}
                emptyMessage="ไม่พบข้อมูลดอกเบี้ยสต็อก"
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
