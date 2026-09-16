import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  STOCK_STATUS_LABELS,
  getManualStockStatusTargets,
  type CreateStockStatusValue,
} from '@car-stock/shared/constants';
import { api } from '../../lib/api';
import { stockService } from '../../services/stock.service';
import type { Stock } from '../../services/stock.service';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useToast } from '../../components/toast';
import { MainLayout } from '../../components/layout';
import { usePermission } from '../../hooks/usePermission';
import { printHtmlViaPopup } from '../../components/reports/PrintButton';
import {
  ArrowLeft,
  Edit,
  Car,
  Calendar,
  Package,
  DollarSign,
  TrendingUp,
  Hash,
  MapPin,
  Palette,
  RefreshCw,
  AlertTriangle,
  FileText
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  RESERVED: 'bg-yellow-100 text-yellow-800',
  PREPARING: 'bg-blue-100 text-blue-800',
  SOLD: 'bg-gray-100 text-gray-800',
  DEMO: 'bg-purple-100 text-purple-800',
};

const MANUAL_STATUS_BUTTON_CLASS: Record<CreateStockStatusValue, string> = {
  DEMO: 'w-full px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600',
  AVAILABLE: 'w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600',
};

const MANUAL_STATUS_BUTTON_LABEL: Record<CreateStockStatusValue, string> = {
  DEMO: 'ตั้งเป็นรถ Demo',
  AVAILABLE: 'ตั้งเป็นพร้อมขาย',
};

export default function StockDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stock, setStock] = useState<Stock | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const { addToast } = useToast();
  const { execute: executeQuery } = useErrorHandler({ showToast: true });

  const { hasPermission } = usePermission();
  const canEdit = hasPermission('STOCK_UPDATE');
  const canUpdateStatus = hasPermission('STOCK_UPDATE');
  const canRecalculateInterest = hasPermission('INTEREST_UPDATE');
  const canCreateSale = hasPermission('SALE_CREATE');
  const canPrintCard = hasPermission('DOC_CAR_DETAIL_CARD');
  const canViewCost = hasPermission('STOCK_VIEW_COST');

  useEffect(() => {
    if (id) {
      fetchStock(id);
    }
  }, [id]);

  const fetchStock = async (stockId: string) => {
    setLoading(true);
    let found = false;
    await executeQuery(
      stockService.getById(stockId).then((data) => {
        setStock(data);
        setNotesDraft(data.notes || '');
        found = true;
      })
    );
    if (!found) navigate('/stock');
    setLoading(false);
  };

  const handleRecalculateInterest = async () => {
    if (!stock) return;
    setRecalculating(true);
    await executeQuery(
      stockService.recalculateInterest(stock.id).then((updated) => {
        setStock(updated);
        addToast('คำนวณดอกเบี้ยใหม่สำเร็จ', 'success');
      })
    );
    setRecalculating(false);
  };

  const handleSaveNotes = async () => {
    if (!stock) return;
    setSavingNotes(true);
    await executeQuery(
      stockService.update(stock.id, { notes: notesDraft }).then((updated) => {
        setStock({ ...stock, notes: updated.notes ?? '' });
        setNotesDraft(updated.notes || '');
        addToast('บันทึกหมายเหตุสำเร็จ', 'success');
      })
    );
    setSavingNotes(false);
  };

  const handleStatusChange = async (newStatus: CreateStockStatusValue) => {
    if (!stock) return;

    const confirmMsg = `คุณต้องการเปลี่ยนสถานะเป็น "${STOCK_STATUS_LABELS[newStatus]}" หรือไม่?`;
    if (!window.confirm(confirmMsg)) return;

    await executeQuery(
      stockService.updateStatus(stock.id, newStatus).then((updated) => {
        setStock(updated);
        addToast('เปลี่ยนสถานะสำเร็จ', 'success');
      })
    );
  };

  // Open the popup synchronously (inside the click gesture) so it isn't
  // popup-blocked; the server HTML auto-prints and self-closes.
  const handlePrintVehicleCard = () => {
    if (!stock) return;
    return executeQuery(
      printHtmlViaPopup(() => api.getBlob(`/api/pdf/vehicle-card/${stock.id}?format=html`))
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">กำลังโหลด...</p>
        </div>
      </MainLayout>
    );
  }

  if (!stock) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-600">ไม่พบข้อมูล Stock</p>
          <Link
            to="/stock"
            className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            กลับไปหน้ารายการ Stock
          </Link>
        </div>
      </MainLayout>
    );
  }

  const totalCost = Number(stock.baseCost) + Number(stock.transportCost) + Number(stock.accessoryCost) + Number(stock.otherCosts);
  const interestAmount = stock.calculatedInterest ?? 0;
  const totalWithInterest = totalCost + interestAmount;
  const manualStatusTargets = getManualStockStatusTargets(stock.status);
  const isSalesLifecycleStatus = stock.status === 'RESERVED' || stock.status === 'PREPARING';

  return (
    <MainLayout>
      <div className="mb-6">
        <button
          onClick={() => navigate('/stock')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          กลับ
        </button>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{stock.vin}</h1>
              <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${STATUS_COLORS[stock.status]}`}>
                {STOCK_STATUS_LABELS[stock.status]}
              </span>
            </div>
            <p className="text-gray-600 mt-1">
              {stock.vehicleModel.brand} {stock.vehicleModel.model} {stock.vehicleModel.variant} ({stock.vehicleModel.year})
            </p>
          </div>
          <div className="flex gap-2">
            {canRecalculateInterest && (
              <button
                onClick={handleRecalculateInterest}
                disabled={recalculating}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
                คำนวณดอกเบี้ยใหม่
              </button>
            )}
            {canEdit && (
              <Link
                to={`/stock/${stock.id}/edit`}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Edit className="w-5 h-5 mr-2" />
                แก้ไข
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Left Side */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vehicle Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <Car className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลรถยนต์
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">VIN</p>
                <p className="text-gray-900 font-mono">{stock.vin}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">หมายเลขเครื่องยนต์</p>
                <p className="text-gray-900 font-mono">{stock.engineNumber || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">หมายเลขมอเตอร์ 1</p>
                <p className="text-gray-900 font-mono">{stock.motorNumber1 || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">หมายเลขมอเตอร์ 2</p>
                <p className="text-gray-900 font-mono">{stock.motorNumber2 || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ยี่ห้อ/รุ่น</p>
                <p className="text-gray-900">
                  {stock.vehicleModel.brand} {stock.vehicleModel.model}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">รุ่นย่อย</p>
                <p className="text-gray-900">{stock.vehicleModel.variant || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ปี</p>
                <p className="text-gray-900">{stock.vehicleModel.year}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ประเภท</p>
                <p className="text-gray-900">{stock.vehicleModel.type}</p>
              </div>
            </div>
          </div>

          {/* Colors & Location */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <Palette className="h-5 w-5 mr-2 text-purple-600" />
              สี & ตำแหน่ง
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start">
                <Palette className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">สีภายนอก</p>
                  <p className="text-gray-900">{stock.exteriorColor}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Palette className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">สีภายใน</p>
                  <p className="text-gray-900">{stock.interiorColor || '-'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <MapPin className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">ช่องจอด</p>
                  <p className="text-gray-900">{stock.parkingSlot || '-'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          {canViewCost && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                รายละเอียดต้นทุน
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">ต้นทุนฐาน</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(stock.baseCost)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">ค่าขนส่ง</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(stock.transportCost)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">ค่าอุปกรณ์เสริม</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(stock.accessoryCost)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">ค่าใช้จ่ายอื่นๆ</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(stock.otherCosts)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200 bg-gray-50 -mx-6 px-6">
                  <span className="text-gray-700 font-medium">ต้นทุนรวม</span>
                  <span className="text-gray-900 font-bold">{formatCurrency(totalCost)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600 flex items-center">
                    <TrendingUp className="h-4 w-4 mr-1 text-orange-500" />
                    ดอกเบี้ยสะสม
                  </span>
                  <span className="text-orange-600 font-medium">{formatCurrency(interestAmount)}</span>
                </div>
                <div className="flex justify-between py-3 bg-blue-50 -mx-6 px-6 rounded-b-lg">
                  <span className="text-blue-700 font-semibold">ต้นทุนรวม + ดอกเบี้ย</span>
                  <span className="text-blue-900 font-bold text-lg">{formatCurrency(totalWithInterest)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-blue-600" />
              วันที่สำคัญ
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">วันที่สั่งซื้อ</p>
                  <p className="text-gray-900">{stock.orderDate ? formatDate(stock.orderDate) : '-'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">วันที่รถเข้า</p>
                  <p className="text-gray-900">{formatDate(stock.arrivalDate)}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">วันที่สร้างรายการ</p>
                  <p className="text-gray-900">{formatDate(stock.createdAt)}</p>
                </div>
              </div>
              {stock.daysInStock !== undefined && (
                <div className="flex items-start">
                  <Hash className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">จำนวนวันใน Stock</p>
                    <p className="text-gray-900">{stock.daysInStock} วัน</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Price Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">ราคา</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">ราคาขายที่คาดหวัง</p>
                <p className="text-2xl font-bold text-green-600">
                  {stock.expectedSalePrice ? formatCurrency(stock.expectedSalePrice) : '-'}
                </p>
              </div>
              {stock.actualSalePrice && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500">ราคาขายจริง</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(stock.actualSalePrice)}
                  </p>
                </div>
              )}
              {stock.expectedSalePrice && canViewCost && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500">กำไรที่คาดหวัง</p>
                  <p className={`text-xl font-bold ${stock.expectedSalePrice - totalWithInterest >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(stock.expectedSalePrice - totalWithInterest)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Status Change — manual targets from shared policy; sales lifecycle via sales module */}
          {canUpdateStatus && manualStatusTargets && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">เปลี่ยนสถานะ</h2>
              <div className="space-y-2">
                {manualStatusTargets.map((target) => (
                  <button
                    key={target}
                    onClick={() => handleStatusChange(target)}
                    className={MANUAL_STATUS_BUTTON_CLASS[target]}
                  >
                    {MANUAL_STATUS_BUTTON_LABEL[target]}
                  </button>
                ))}
                <p className="text-xs text-gray-500 pt-1">
                  สถานะจอง / เตรียมส่งมอบ / ขายแล้ว เปลี่ยนผ่านใบสั่งขายเท่านั้น
                </p>
              </div>
            </div>
          )}
          {canUpdateStatus && !manualStatusTargets && isSalesLifecycleStatus && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-2">เปลี่ยนสถานะ</h2>
              <p className="text-sm text-gray-600">
                รถคันนี้อยู่ในกระบวนการขาย — จัดการสถานะผ่านหน้าใบสั่งขาย
                (ยกเลิกการจอง / เตรียมส่งมอบ / ส่งมอบ)
              </p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">การดำเนินการ</h2>
            <div className="space-y-2">
              {canCreateSale && stock.status === 'AVAILABLE' && (
                <Link
                  to={`/sales/new?stockId=${stock.id}`}
                  className="block w-full px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700"
                >
                  สร้างใบสั่งขาย
                </Link>
              )}
              {canEdit && (
                <Link
                  to={`/stock/${stock.id}/edit`}
                  className="block w-full px-4 py-2 border border-gray-300 text-gray-700 text-center rounded-lg hover:bg-gray-50"
                >
                  แก้ไขข้อมูล
                </Link>
              )}
              <button
                onClick={handlePrintVehicleCard}
                className="block w-full px-4 py-2 border border-gray-300 text-gray-700 text-center rounded-lg hover:bg-gray-50 flex items-center justify-center"
              >
                <FileText className="w-4 h-4 mr-2" />
                พิมพ์การ์ดรถยนต์
              </button>
              {canPrintCard && (
                <Link
                  to={`/stock/${stock.id}/card-layout`}
                  className="block w-full px-4 py-2 border border-dashed border-gray-300 text-gray-500 text-center rounded-lg hover:bg-gray-50 text-sm"
                >
                  ปรับตำแหน่งการ์ด
                </Link>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">หมายเหตุ</h2>
            {canEdit ? (
              <div className="space-y-3">
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={4}
                  placeholder="ข้อมูลเพิ่มเติมเกี่ยวกับรถคันนี้..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 text-sm"
                />
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={savingNotes || notesDraft === (stock.notes || '')}
                  className="w-full px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingNotes ? 'กำลังบันทึก...' : 'บันทึกหมายเหตุ'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {stock.notes?.trim() ? stock.notes : 'ไม่มีหมายเหตุ'}
              </p>
            )}
          </div>

          {/* Warning if old stock */}
          {stock.daysInStock && stock.daysInStock > 90 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5 mr-2" />
                <div>
                  <h3 className="text-sm font-medium text-orange-800">Stock ค้างนาน</h3>
                  <p className="text-sm text-orange-700 mt-1">
                    รถคันนี้อยู่ใน Stock มานาน {stock.daysInStock} วัน ดอกเบี้ยสะสมอาจสูง
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
