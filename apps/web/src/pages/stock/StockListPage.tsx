import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { stockService } from '../../services/stock.service';
import type { Stock, StockStats } from '../../services/stock.service';
import { useMutationHandler, useErrorHandler } from '../../hooks/useErrorHandler';
import { MainLayout } from '../../components/layout';
import { Plus, Search, Edit, Trash2, Package, Car, Calendar, DollarSign, TrendingUp } from 'lucide-react';
import { ExportButton } from '../../components/reports';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableContainer,
  TableWrapper,
  TableEmpty,
  TableLoading,
  TablePagination,
} from '@/components/ui/table';
import { usePermission } from '../../hooks/usePermission';
import {
  useStockAttributeFilters,
  type StockAttributeFilterValues,
} from '../../hooks/useStockAttributeFilters';

export default function StockListPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [stats, setStats] = useState<StockStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD' | 'DEMO'>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;
  const {
    filters: attrFilters,
    setFilter: setAttrFilter,
    brands,
    models,
    exteriorColors,
    interiorColors,
  } = useStockAttributeFilters();
  const attrSelects: [keyof StockAttributeFilterValues, string, string[]][] = [
    ['brand', 'ยี่ห้อทั้งหมด', brands],
    ['model', 'รุ่นรถทั้งหมด', models],
    ['exteriorColor', 'สีภายนอกทั้งหมด', exteriorColors],
    ['interiorColor', 'สีภายในทั้งหมด', interiorColors],
  ];

  const { execute: executeDelete } = useMutationHandler('ลบสต็อกสำเร็จ');
  const { execute: executeQuery } = useErrorHandler();

  const { hasPermission } = usePermission();
  const canCreate = hasPermission('STOCK_CREATE');
  const canEdit = hasPermission('STOCK_UPDATE');
  const canDelete = hasPermission('STOCK_DELETE');
  const canViewCost = hasPermission('STOCK_VIEW_COST');

  const fetchStocks = useCallback(async () => {
    setLoading(true);
    const filters: any = { page, limit };
    if (debouncedSearchTerm) filters.search = debouncedSearchTerm;
    if (statusFilter !== 'ALL') filters.status = statusFilter;
    Object.assign(filters, attrFilters);

    await executeQuery(
      stockService.getAll(filters).then((response) => {
        setStocks(response?.data || []);
        setTotalPages(response?.meta?.totalPages || 1);
        setTotal(response?.meta?.total || 0);
      })
    );
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearchTerm, statusFilter, attrFilters]);

  const fetchStats = useCallback(async () => {
    await executeQuery(
      stockService.getStats().then((data) => { setStats(data); })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  // Stats refresh on filter change — previously they only refreshed on
  // page/statusFilter swap via a combined effect, and never after a search
  // narrowed the list.
  useEffect(() => {
    fetchStats();
  }, [fetchStats, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset to page 1 whenever the debounced search term changes (but not on
  // first mount where both are '').
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm]);

  const handleDelete = async (id: string, vin: string) => {
    if (!window.confirm(`คุณต้องการลบ Stock VIN "${vin}" หรือไม่?`)) {
      return;
    }

    const result = await executeDelete(stockService.delete(id));
    if (result) {
      fetchStocks();
      fetchStats();
    }
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">จัดการ Stock</h1>
          <div className="flex gap-2">
            <ExportButton
              data={stocks.map(s => ({
                VIN: s.vin,
                ยี่ห้อ: s.vehicleModel?.brand || '-',
                รุ่น: s.vehicleModel?.model || '-',
                สี: s.exteriorColor || '-',
                สถานะ: s.status,
                ต้นทุน: Number(s.baseCost || 0),
                ราคาขาย: Number(s.expectedSalePrice || 0),
              }))}
              filename="stock-list"
              sheetName="Stock"
              loading={loading}
            />
            {canCreate && (
              <Link
                to="/stock/new"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5 mr-2" />
                เพิ่ม Stock ใหม่
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Stock ทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalStock || 0}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">พร้อมขาย</p>
                <p className="text-2xl font-bold text-green-600">{stats?.availableStock || 0}</p>
              </div>
              <Car className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">จองแล้ว</p>
                <p className="text-2xl font-bold text-yellow-600">{stats?.reservedStock || 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-yellow-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">ขายแล้ว</p>
                <p className="text-2xl font-bold text-gray-600">{stats?.soldStock || 0}</p>
              </div>
              <DollarSign className="h-8 w-8 text-gray-600" />
            </div>
          </div>

          {canViewCost && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">มูลค่ารวม</p>
                  <p className="text-xl font-bold text-purple-600">
                    {stats ? new Intl.NumberFormat('th-TH', {
                      style: 'currency',
                      currency: 'THB',
                      notation: 'compact',
                    }).format(stats.totalValue) : '--'}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหา Stock (VIN, ยี่ห้อ, รุ่น, สี)"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL">สถานะทั้งหมด</option>
            <option value="AVAILABLE">พร้อมขาย</option>
            <option value="RESERVED">จองแล้ว</option>
            <option value="PREPARING">เตรียมขาย</option>
            <option value="SOLD">ขายแล้ว</option>
            <option value="DEMO">รถ Demo</option>
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          {attrSelects.map(([key, allLabel, values]) => (
            <select
              key={key}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={attrFilters[key]}
              onChange={(e) => {
                setAttrFilter(key, e.target.value);
                setPage(1);
              }}
            >
              <option value="">{allLabel}</option>
              {values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ))}
        </div>
      </div>

      {loading ? (
        <TableContainer>
          <TableLoading />
        </TableContainer>
      ) : (
        <>
          <TableContainer>
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stock</TableHead>
                    <TableHead>รถยนต์</TableHead>
                    <TableHead>สี</TableHead>
                    <TableHead>วันที่เข้า</TableHead>
                    {canViewCost && (
                      <>
                        <TableHead>ราคาต้นทุน</TableHead>
                        <TableHead>ราคาขาย</TableHead>
                        <TableHead>ดอกเบี้ยสะสม</TableHead>
                      </>
                    )}
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stocks || []).map((stock) => (
                    <TableRow key={stock.id}>
                      <TableCell>
                        <div className="text-sm font-medium text-gray-900">{stock.vin}</div>
                        {stock.parkingSlot && (
                          <div className="text-sm text-gray-500">Slot: {stock.parkingSlot}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-gray-900">
                          {stock.vehicleModel.brand} {stock.vehicleModel.model} {stock.vehicleModel.variant || ''}
                        </div>
                        <div className="text-sm text-gray-500">
                          ปี {stock.vehicleModel.year}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-gray-900">
                          {stock.exteriorColor}
                        </div>
                        {stock.interiorColor && (
                          <div className="text-sm text-gray-500">
                            ใน: {stock.interiorColor}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-900">
                        {stock.arrivalDate ? new Date(stock.arrivalDate).toLocaleDateString('th-TH') : '-'}
                      </TableCell>
                      {canViewCost && (
                        <>
                          <TableCell className="text-gray-900">
                            {new Intl.NumberFormat('th-TH', {
                              style: 'currency',
                              currency: 'THB',
                            }).format(stock.baseCost)}
                          </TableCell>
                          <TableCell className="text-gray-900">
                            {(stock.expectedSalePrice || stock.vehicleModel.price) ? (
                              <div>
                                <div>
                                  {new Intl.NumberFormat('th-TH', {
                                    style: 'currency',
                                    currency: 'THB',
                                  }).format(stock.expectedSalePrice || stock.vehicleModel.price || 0)}
                                </div>
                                {!stock.expectedSalePrice && (
                                  <div className="text-xs text-red-600">*เป็นราคาจากรุ่นรถยนต์</div>
                                )}
                              </div>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-gray-900">
                            {new Intl.NumberFormat('th-TH', {
                              style: 'currency',
                              currency: 'THB',
                            }).format(stock.calculatedInterest ?? 0)}
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        <span
                          className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${stock.status === 'AVAILABLE'
                              ? 'bg-green-100 text-green-800'
                              : stock.status === 'RESERVED'
                                ? 'bg-yellow-100 text-yellow-800'
                                : stock.status === 'PREPARING'
                                  ? 'bg-blue-100 text-blue-800'
                                  : stock.status === 'DEMO'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                          {stock.status === 'AVAILABLE' && 'พร้อมขาย'}
                          {stock.status === 'RESERVED' && 'จองแล้ว'}
                          {stock.status === 'PREPARING' && 'เตรียมขาย'}
                          {stock.status === 'SOLD' && 'ขายแล้ว'}
                          {stock.status === 'DEMO' && 'รถ Demo'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/stock/${stock.id}`}
                            className="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ดูรายละเอียด"
                          >
                            ดู
                          </Link>
                          {canEdit && (
                            <Link
                              to={`/stock/${stock.id}/edit`}
                              className="inline-flex items-center justify-center p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="แก้ไข"
                            >
                              <Edit className="h-4 w-4" />
                            </Link>
                          )}
                          {canDelete && stock.status !== 'SOLD' && (
                            <button
                              onClick={() => handleDelete(stock.id, stock.vin)}
                              className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="ลบ"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>

            {stocks.length === 0 && (
              <TableEmpty
                icon={<Package className="h-12 w-12" />}
                title="ไม่พบ Stock"
                description="เริ่มต้นด้วยการเพิ่ม Stock ใหม่"
              />
            )}

            {totalPages > 1 && (
              <TablePagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
              />
            )}
          </TableContainer>
        </>
      )}
    </MainLayout>
  );
}
