import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { quotationService } from '../../services/quotation.service';
import type { Quotation, QuotationStatus } from '../../services/quotation.service';
import { MainLayout } from '../../components/layout';
import {
  ArrowLeft,
  Edit,
  User,
  Car,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  ArrowRight,
  Copy,
  Trash2,
  AlertCircle,
  ShoppingCart
} from 'lucide-react';
import { useMutationHandler, useErrorHandler } from '../../hooks/useErrorHandler';
import { useToast } from '../../components/toast';
import { useVehicleTypes } from '../../hooks/useVehicleTypes';

const STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'แบบร่าง',
  SENT: 'ส่งแล้ว',
  ACCEPTED: 'ซื้อ',
  REJECTED: 'ไม่ซื้อ',
  EXPIRED: 'หมดอายุ',
  CONVERTED: 'แปลงเป็นการขายแล้ว',
};

const STATUS_COLORS: Record<QuotationStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 border-gray-300',
  SENT: 'bg-blue-100 text-blue-800 border-blue-300',
  ACCEPTED: 'bg-green-100 text-green-800 border-green-300',
  REJECTED: 'bg-red-100 text-red-800 border-red-300',
  EXPIRED: 'bg-orange-100 text-orange-800 border-orange-300',
  CONVERTED: 'bg-purple-100 text-purple-800 border-purple-300',
};

const STATUS_ICONS: Record<QuotationStatus, React.ReactNode> = {
  DRAFT: <FileText className="h-4 w-4" />,
  SENT: <Send className="h-4 w-4" />,
  ACCEPTED: <CheckCircle className="h-4 w-4" />,
  REJECTED: <XCircle className="h-4 w-4" />,
  EXPIRED: <Clock className="h-4 w-4" />,
  CONVERTED: <ArrowRight className="h-4 w-4" />,
};

export default function QuotationDetailPage() {
  const { typeLabel } = useVehicleTypes();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const { execute: executeQuery } = useErrorHandler({ showToast: true });
  const { execute: executeDelete } = useMutationHandler('ลบใบเสนอราคาสำเร็จ');
  const canEditQuotation = ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'].includes(user?.role || '');
  const canDeleteQuotation = user?.role === 'ADMIN';
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  // Quotation conversion is always RESERVATION_SALE
  const [convertData, setConvertData] = useState({
    depositAmount: 0,
    paymentMethod: 'CASH' as 'CASH' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'CHEQUE',
    paymentReferenceNumber: '',
  });

  useEffect(() => {
    if (id) {
      fetchQuotation(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchQuotation = async (quotationId: string) => {
    setLoading(true);
    const result = await executeQuery(quotationService.getById(quotationId));
    if (result) {
      setQuotation(result);
    } else {
      navigate('/quotations');
    }
    setLoading(false);
  };

  const handleStatusChange = async (newStatus: QuotationStatus) => {
    if (!quotation) return;

    const confirmMsg = `คุณต้องการเปลี่ยนสถานะเป็น "${STATUS_LABELS[newStatus]}" หรือไม่?`;
    if (!window.confirm(confirmMsg)) return;

    setUpdating(true);
    await executeQuery(
      quotationService.updateStatus(quotation.id, newStatus).then(updated => {
        setQuotation(updated);
        addToast('เปลี่ยนสถานะสำเร็จ', 'success');
      })
    );
    setUpdating(false);
  };

  const handleConvertToSale = async () => {
    if (!quotation) return;
    // Guard against re-entry: button is disabled while `updating`, but rapid
    // programmatic triggers (Enter key, repeated clicks before the state has
    // flushed) can still fire. An early return prevents a second API call.
    if (updating) return;

    setUpdating(true);
    try {
      await executeQuery(
        quotationService.convertToSale(quotation.id, {
          saleType: 'RESERVATION_SALE',
          depositAmount: convertData.depositAmount,
          paymentMethod: convertData.depositAmount > 0 ? convertData.paymentMethod : undefined,
          paymentReferenceNumber: convertData.depositAmount > 0 ? convertData.paymentReferenceNumber : undefined,
        }).then((result) => {
          setShowConvertModal(false);
          addToast(`แปลงเป็นการขายสำเร็จ! เลขที่การขาย: ${result.sale.saleNumber}`, 'success');
          navigate(`/sales/${result.sale.id}`);
        })
      );
    } finally {
      // Always clear the in-flight flag, even on error. Previously the naked
      // `setUpdating(false)` after the await could be skipped on unhandled
      // rejection, leaving the modal stuck.
      setUpdating(false);
    }
  };

  const handleCreateNewVersion = async () => {
    if (!quotation) return;

    setUpdating(true);
    await executeQuery(
      quotationService.createNewVersion(quotation.id, {}).then((result) => {
        addToast('สร้างเวอร์ชันใหม่สำเร็จ', 'success');
        navigate(`/quotations/${result.id}/edit`);
      })
    );
    setUpdating(false);
  };

  const handleDelete = async () => {
    if (!quotation) return;

    if (quotation.status !== 'DRAFT') {
      addToast('สามารถลบได้เฉพาะใบเสนอราคาที่เป็นแบบร่างเท่านั้น', 'error');
      return;
    }

    if (!window.confirm('คุณต้องการลบใบเสนอราคานี้หรือไม่?')) return;

    setUpdating(true);
    const result = await executeDelete(quotationService.delete(quotation.id));
    if (result) {
      navigate('/quotations');
    }
    setUpdating(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(dateString));
  };

  const getNextStatuses = (currentStatus: QuotationStatus): QuotationStatus[] => {
    const transitions: Record<QuotationStatus, QuotationStatus[]> = {
      DRAFT: ['SENT'],
      SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
      ACCEPTED: [],
      REJECTED: [],
      EXPIRED: [],
      CONVERTED: [],
    };
    return transitions[currentStatus] || [];
  };

  const canConvertToSale = (status: QuotationStatus): boolean => {
    return status === 'ACCEPTED';
  };

  const isExpired = (validUntil: string, status: QuotationStatus) => {
    if (['ACCEPTED', 'CONVERTED', 'REJECTED', 'EXPIRED'].includes(status)) return false;
    const expiryDate = new Date(validUntil);
    const today = new Date();
    return expiryDate < today;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-700">กำลังโหลด...</div>
        </div>
      </MainLayout>
    );
  }

  if (!quotation) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-gray-700">ไม่พบข้อมูลใบเสนอราคา</p>
          <Link to="/quotations" className="text-blue-600 hover:underline mt-4 inline-block">
            กลับไปหน้ารายการ
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/quotations')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{quotation.quotationNumber}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[quotation.status]}`}
                >
                  {STATUS_ICONS[quotation.status]}
                  <span className="ml-1">{STATUS_LABELS[quotation.status]}</span>
                </span>
                {quotation.version > 1 && (
                  <span className="text-sm text-gray-700">เวอร์ชัน {quotation.version}</span>
                )}
                {isExpired(quotation.validUntil, quotation.status) && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    หมดอายุแล้ว
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {['DRAFT', 'SENT'].includes(quotation.status) && canEditQuotation && (
              <Link
                to={`/quotations/${quotation.id}/edit`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Edit className="h-4 w-4 mr-2" />
                แก้ไข
              </Link>
            )}
            {quotation.status === 'DRAFT' && canDeleteQuotation && (
              <button
                onClick={handleDelete}
                disabled={updating}
                className="inline-flex items-center px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                ลบ
              </button>
            )}
            {['SENT', 'REJECTED', 'EXPIRED'].includes(quotation.status) && (
              <button
                onClick={handleCreateNewVersion}
                disabled={updating}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Copy className="h-4 w-4 mr-2" />
                สร้างเวอร์ชันใหม่
              </button>
            )}
            {canConvertToSale(quotation.status) && (
              <button
                onClick={() => setShowConvertModal(true)}
                disabled={updating}
                className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                แปลงเป็นการขาย
              </button>
            )}
          </div>
        </div>

        {/* Status Actions */}
        {getNextStatuses(quotation.status).length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-800 mb-3">เปลี่ยนสถานะ</h3>
            <div className="flex gap-2">
              {getNextStatuses(quotation.status).map((nextStatus) => (
                <button
                  key={nextStatus}
                  onClick={() => handleStatusChange(nextStatus)}
                  disabled={updating}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${nextStatus === 'REJECTED' || nextStatus === 'EXPIRED'
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : nextStatus === 'ACCEPTED'
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                  {STATUS_ICONS[nextStatus]}
                  <span className="ml-1">{STATUS_LABELS[nextStatus]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Linked Sale */}
        {quotation.sale && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-purple-600" />
                <span className="font-medium text-purple-800">แปลงเป็นการขายแล้ว</span>
              </div>
              <Link
                to={`/sales/${quotation.sale.id}`}
                className="inline-flex items-center text-purple-600 hover:text-purple-800"
              >
                {quotation.sale.saleNumber}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Customer Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center text-black">
              <User className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลลูกค้า
            </h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-600">รหัสลูกค้า</dt>
                <dd className="text-sm font-medium text-gray-900">{quotation.customer.code}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-600">ชื่อ</dt>
                <dd className="text-sm font-medium text-gray-900">{quotation.customer.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-600">ประเภท</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {quotation.customer.type === 'INDIVIDUAL' ? 'บุคคลธรรมดา' : 'นิติบุคคล'}
                </dd>
              </div>
              {quotation.customer.phone && (
                <div>
                  <dt className="text-sm text-gray-600">โทรศัพท์</dt>
                  <dd className="text-sm font-medium text-gray-900">{quotation.customer.phone}</dd>
                </div>
              )}
              {quotation.customer.email && (
                <div>
                  <dt className="text-sm text-gray-600">อีเมล</dt>
                  <dd className="text-sm font-medium text-gray-900">{quotation.customer.email}</dd>
                </div>
              )}
            </dl>
            <Link
              to={`/customers/${quotation.customer.id}`}
              className="text-blue-600 hover:underline text-sm mt-4 inline-block"
            >
              ดูข้อมูลลูกค้าเพิ่มเติม →
            </Link>
          </div>

          {/* Vehicle Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center text-black">
              <Car className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลรถยนต์
            </h3>
            {quotation.vehicleModel ? (
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-gray-600">รุ่นรถ</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {quotation.vehicleModel.brand} {quotation.vehicleModel.model}
                    {quotation.vehicleModel.variant && ` ${quotation.vehicleModel.variant}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600">ปี</dt>
                  <dd className="text-sm font-medium text-gray-900">{quotation.vehicleModel.year}</dd>
                </div>
                {quotation.vehicleModel.type && (
                  <div>
                    <dt className="text-sm text-gray-600">ประเภท</dt>
                    <dd className="text-sm font-medium text-gray-900">{typeLabel(quotation.vehicleModel.type)}</dd>
                  </div>
                )}
                {quotation.preferredExtColor && (
                  <div>
                    <dt className="text-sm text-gray-600">สีภายนอกที่ต้องการ</dt>
                    <dd className="text-sm font-medium text-gray-900">{quotation.preferredExtColor}</dd>
                  </div>
                )}
                {quotation.preferredIntColor && (
                  <div>
                    <dt className="text-sm text-gray-600">สีภายในที่ต้องการ</dt>
                    <dd className="text-sm font-medium text-gray-900">{quotation.preferredIntColor}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-gray-700 text-sm">ยังไม่ได้ระบุรถยนต์</p>
            )}
          </div>

          {/* Financial Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center text-black">
              <DollarSign className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลราคา
            </h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-600">ราคาเสนอ</dt>
                <dd className="text-sm font-medium text-gray-900">{formatCurrency(quotation.quotedPrice)}</dd>
              </div>
              {quotation.discountAmount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">ส่วนลด</dt>
                  <dd className="text-sm font-medium text-green-600">-{formatCurrency(quotation.discountAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t">
                <dt className="text-sm text-gray-700 font-semibold">ราคาสุทธิ</dt>
                <dd className="text-lg font-bold text-blue-600">{formatCurrency(quotation.finalPrice)}</dd>
              </div>
            </dl>
          </div>

          {/* Dates Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center text-black">
              <Calendar className="h-5 w-5 mr-2 text-blue-600" />
              วันที่สำคัญ
            </h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-600">วันที่สร้าง</dt>
                <dd className="text-sm font-medium text-gray-900">{formatDate(quotation.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-600">วันหมดอายุ</dt>
                <dd className={`text-sm font-medium ${isExpired(quotation.validUntil, quotation.status) ? 'text-red-600' : 'text-gray-900'
                  }`}>
                  {formatDate(quotation.validUntil)}
                  {isExpired(quotation.validUntil, quotation.status) && ' (หมดอายุแล้ว)'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Notes */}
        {quotation.notes && (
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h3 className="text-lg font-semibold mb-4 text-black">หมายเหตุ</h3>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{quotation.notes}</p>
          </div>
        )}

        {/* Created By */}
        {quotation.createdBy && (
          <div className="text-sm text-gray-700 mt-6">
            สร้างโดย: {quotation.createdBy.firstName} {quotation.createdBy.lastName} ({quotation.createdBy.username})
          </div>
        )}
      </div>

      {/* Convert to Sale Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4 text-black">แปลงเป็นการขายผ่านการจอง</h3>

            <div className="space-y-4">
              {/* Info about conversion type */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium">ขายผ่านการจอง (Reservation Sale)</p>
                <p className="text-sm text-blue-600 mt-1">
                  สร้างการขายจากใบเสนอราคานี้ โดยลูกค้าจะวางมัดจำก่อน แล้วรอเลือก Stock ในภายหลัง
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1">
                  เงินมัดจำ (บาท)
                </label>
                <input
                  type="number"
                  value={convertData.depositAmount}
                  onChange={(e) => setConvertData({ ...convertData, depositAmount: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>

              {convertData.depositAmount > 0 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-black mb-1">
                      วิธีการชำระเงิน
                    </label>
                    <select
                      value={convertData.paymentMethod}
                      onChange={(e) => setConvertData({ ...convertData, paymentMethod: e.target.value as any })}
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    >
                      <option value="CASH">เงินสด</option>
                      <option value="BANK_TRANSFER">โอนเงิน</option>
                      <option value="CREDIT_CARD">บัตรเครดิต</option>
                      <option value="CHEQUE">เช็ค</option>
                    </select>
                  </div>

                  {convertData.paymentMethod !== 'CASH' && (
                    <div>
                      <label className="block text-sm font-medium text-black mb-1">
                        เลขอ้างอิง (ถ้ามี)
                      </label>
                      <input
                        type="text"
                        value={convertData.paymentReferenceNumber}
                        onChange={(e) => setConvertData({ ...convertData, paymentReferenceNumber: e.target.value })}
                        placeholder="เลขอ้างอิงการโอน / เลขเช็ค"
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  <strong>หมายเหตุ:</strong> การแปลงจะสร้างรายการขายใหม่ในสถานะ "จองแล้ว" และเปลี่ยนสถานะใบเสนอราคาเป็น "แปลงแล้ว"
                </p>
                <p className="text-sm text-gray-700 mt-2">
                  <strong>ราคาสุทธิ:</strong> {formatCurrency(quotation.finalPrice)}
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  <em>สำหรับการขายตรง ให้ใช้เมนู "สร้างการขายตรง" โดยเลือก Stock ที่ต้องการโดยตรง</em>
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowConvertModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConvertToSale}
                disabled={updating}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {updating ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
