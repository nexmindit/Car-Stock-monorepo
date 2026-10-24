import {
  ArrowLeft,
  Ban,
  CheckCircle,
  CreditCard,
  FileText,
  Pencil,
  Printer,
  User,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { useToast } from '../../components/toast';
import { useErrorHandler, useMutationHandler } from '../../hooks/useErrorHandler';
import { usePermission } from '../../hooks/usePermission';
import { paymentService } from '../../services/payment.service';
import type {
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../../services/payment.service';

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  DEPOSIT: 'เงินจอง',
  DOWN_PAYMENT: 'เงินดาวน์',
  FINANCE_PAYMENT: 'ยอดไฟแนนซ์',
  OTHER_EXPENSE: 'ค่าใช้จ่ายอื่น',
  MISCELLANEOUS: 'รายการทั่วไป',
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'โอนเงิน',
  CHEQUE: 'เช็ค',
  CREDIT_CARD: 'บัตรเครดิต',
};

const STATUS_COLORS: Record<PaymentStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 border-green-300',
  VOIDED: 'bg-red-100 text-red-800 border-red-300',
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  ACTIVE: 'ใช้งาน',
  VOIDED: 'ยกเลิก',
};

const STATUS_ICONS: Record<PaymentStatus, React.ReactNode> = {
  ACTIVE: <CheckCircle className="h-5 w-5" />,
  VOIDED: <XCircle className="h-5 w-5" />,
};

/**
 * Resolve the "issued by" name. Tolerates the stale "undefined undefined"
 * value that older payments stored before the create flow gained
 * null-safety, falling back to the createdBy relation.
 */
function resolveIssuedBy(payment: Payment): string {
  const raw = payment.issuedBy?.trim();
  if (raw && !/\bundefined\b/i.test(raw)) return raw;
  const u = payment.createdBy;
  if (u) {
    return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username;
  }
  return '';
}

export default function PaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('PAYMENT_UPDATE');
  const { execute: executeQuery } = useErrorHandler({ showToast: true });
  const { execute: executeDownload } = useErrorHandler({ showToast: true });
  const { execute: executeVoid } = useMutationHandler('ยกเลิกการชำระเงินสำเร็จ');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printingForm, setPrintingForm] = useState(false);
  const [printingA4, setPrintingA4] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [lateFee, setLateFee] = useState(0);

  useEffect(() => {
    if (id) {
      fetchPayment(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchPayment = async (paymentId: string) => {
    setLoading(true);
    const result = await executeQuery(paymentService.getById(paymentId));
    if (result) {
      setPayment(result);
    } else {
      navigate('/payments');
    }
    setLoading(false);
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

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    return new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  const handleVoid = async () => {
    if (!payment) return;

    if (!voidReason.trim()) {
      addToast('กรุณาระบุเหตุผลในการยกเลิก', 'error');
      return;
    }

    setVoiding(true);
    const result = await executeVoid(
      paymentService.void(payment.id, { voidReason: voidReason.trim() })
    );
    if (result) {
      setShowVoidModal(false);
      setVoidReason('');
      await fetchPayment(payment.id);
    }
    setVoiding(false);
  };

  const handlePrint = async () => {
    if (!payment) return;
    setDownloading(true);
    await executeDownload(paymentService.printReceiptDirect(payment.id, lateFee || undefined));
    setDownloading(false);
  };

  const handlePrintForm = async () => {
    if (!payment) return;
    setPrintingForm(true);
    await executeDownload(
      paymentService.printReceiptDirect(payment.id, lateFee || undefined, true)
    );
    setPrintingForm(false);
  };

  const handlePrintA4 = async () => {
    if (!payment) return;
    setPrintingA4(true);
    await executeDownload(
      paymentService.printReceiptDirect(payment.id, lateFee || undefined, true, 'a4')
    );
    setPrintingA4(false);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">กำลังโหลด...</div>
        </div>
      </MainLayout>
    );
  }

  if (!payment) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">ไม่พบข้อมูลการชำระเงิน</p>
          <Link to="/payments" className="text-blue-600 hover:underline mt-4 inline-block">
            กลับไปหน้ารายการ
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/payments')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            กลับไปรายการ
          </button>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{payment.receiptNumber}</h1>
              <p className="text-gray-500 mt-1">บันทึกเมื่อ {formatDateTime(payment.createdAt)}</p>
            </div>

            <div className="flex items-center gap-3 flex-wrap justify-end">
              <span
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${STATUS_COLORS[payment.status]}`}
              >
                {STATUS_ICONS[payment.status]}
                {STATUS_LABELS[payment.status]}
              </span>

              {payment.status === 'ACTIVE' && (
                <>
                  {canEdit && (
                    <button
                      onClick={() => navigate(`/payments/${id}/edit`)}
                      className="inline-flex items-center px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      แก้ไข
                    </button>
                  )}
                  <div className="inline-flex items-center gap-1 border border-gray-300 rounded-lg px-3 py-1.5 bg-white">
                    <span className="text-xs text-gray-500 whitespace-nowrap">เบี้ยปรับล่าช้า</span>
                    <input
                      type="number"
                      min="0"
                      value={lateFee || ''}
                      onChange={(e) => setLateFee(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-24 text-sm text-right focus:outline-none"
                    />
                    <span className="text-xs text-gray-500">฿</span>
                  </div>
                  <button
                    onClick={handlePrint}
                    disabled={downloading}
                    title="สำหรับเครื่อง Dot Matrix + กระดาษต่อเนื่องที่มีฟอร์มพิมพ์ไว้แล้ว (9×5.5 นิ้ว)"
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    {downloading ? 'กำลังโหลด...' : 'ใบเสร็จ Dot Matrix'}
                  </button>
                  <button
                    onClick={handlePrintForm}
                    disabled={printingForm}
                    title="สำหรับเครื่อง Dot Matrix + กระดาษต่อเนื่องเปล่า — พิมพ์ฟอร์มพร้อมข้อมูล (9.5×5.5 นิ้ว)"
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    {printingForm ? 'กำลังโหลด...' : 'ใบเสร็จ Dot Matrix (มีฟอร์ม)'}
                  </button>
                  <button
                    onClick={handlePrintA4}
                    disabled={printingA4}
                    title="สำหรับเครื่องพิมพ์ A4 — เลย์อาวต์ A4 แยก ไม่ย่อกล่อง 9.5×5.5 ลงแผ่น A4"
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    {printingA4 ? 'กำลังโหลด...' : 'ใบเสร็จ A4 (มีฟอร์ม)'}
                  </button>
                  <button
                    onClick={() => setShowVoidModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    ยกเลิกใบเสร็จ
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Void Info Banner */}
        {payment.status === 'VOIDED' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3" />
              <div>
                <h3 className="font-medium text-red-800">ใบเสร็จนี้ถูกยกเลิกแล้ว</h3>
                <p className="text-sm text-red-700 mt-1">เหตุผล: {payment.voidReason || '-'}</p>
                <p className="text-sm text-red-600 mt-1">
                  ยกเลิกเมื่อ: {formatDateTime(payment.voidedAt)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Payment Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลการชำระเงิน
            </h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">จำนวนเงิน</dt>
                <dd className="text-lg font-bold text-green-600">
                  {formatCurrency(payment.amount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">วันที่ชำระ</dt>
                <dd className="text-sm font-medium">{formatDate(payment.paymentDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">ประเภท</dt>
                <dd className="text-sm font-medium">{PAYMENT_TYPE_LABELS[payment.paymentType]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">วิธีชำระ</dt>
                <dd className="text-sm font-medium">
                  {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                </dd>
              </div>
              {payment.referenceNumber && (
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">เลขที่อ้างอิง</dt>
                  <dd className="text-sm font-mono">{payment.referenceNumber}</dd>
                </div>
              )}
              {(payment.receivingBankName ||
                payment.receivingBank ||
                payment.receivingAccountNumber) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-sm text-gray-500 shrink-0">ธนาคารที่รับเงิน</dt>
                  <dd className="text-sm font-medium text-right">
                    <div>{payment.receivingBankName || payment.receivingBank || '-'}</div>
                    {payment.receivingAccountNumber && (
                      <div className="text-xs text-gray-500 font-mono mt-0.5">
                        {payment.receivingAccountNumber}
                        {payment.receivingBranch ? ` • ${payment.receivingBranch}` : ''}
                      </div>
                    )}
                  </dd>
                </div>
              )}
              {resolveIssuedBy(payment) && (
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">ออกโดย</dt>
                  <dd className="text-sm font-medium">{resolveIssuedBy(payment)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Customer Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <User className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลลูกค้า
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">รหัสลูกค้า</dt>
                <dd className="text-sm font-medium">{payment.customer.code}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">ชื่อลูกค้า</dt>
                <dd className="text-sm font-medium">{payment.customer.name}</dd>
              </div>
            </dl>
            <Link
              to={`/customers/${payment.customer.id}`}
              className="text-blue-600 hover:underline text-sm mt-4 inline-block"
            >
              ดูข้อมูลลูกค้าเพิ่มเติม →
            </Link>
          </div>

          {/* Sale Info (only if linked to a sale) */}
          {payment.sale ? (
            <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
                ข้อมูลการขาย
              </h2>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <dt className="text-sm text-gray-500">เลขที่ขาย</dt>
                  <dd className="text-sm font-medium">
                    <Link
                      to={`/sales/${payment.sale.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {payment.sale.saleNumber}
                    </Link>
                  </dd>
                </div>
                {payment.sale.totalAmount !== undefined && (
                  <div>
                    <dt className="text-sm text-gray-500">ยอดรวมการขาย</dt>
                    <dd className="text-sm font-medium">
                      {formatCurrency(payment.sale.totalAmount)}
                    </dd>
                  </div>
                )}
                {payment.sale.remainingAmount !== undefined && (
                  <div>
                    <dt className="text-sm text-gray-500">ยอดค้างชำระ (หลังรายการนี้)</dt>
                    <dd
                      className={`text-sm font-medium ${payment.sale.remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}
                    >
                      {formatCurrency(payment.sale.remainingAmount)}
                    </dd>
                  </div>
                )}
                {(() => {
                  // Linked unit first; a booking without a VIN shows the booked model + color.
                  const sale = payment.sale;
                  const vm = sale.stock?.vehicleModel ?? sale.vehicleModel;
                  const carName = vm
                    ? [vm.brand, vm.model, vm.variant].filter(Boolean).join(' ')
                    : '';
                  const color = sale.stock?.exteriorColor || sale.preferredExtColor || '';
                  const intColor = sale.stock?.interiorColor || sale.preferredIntColor || '';
                  if (!carName && !sale.stock) return null;
                  return (
                    <>
                      <div>
                        <dt className="text-sm text-gray-500">รถ</dt>
                        <dd className="text-sm font-medium">{carName || '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">สี</dt>
                        <dd className="text-sm font-medium">
                          {color || '-'}
                          {intColor && (
                            <span className="text-gray-500 font-normal"> (ภายใน {intColor})</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">เลข VIN</dt>
                        <dd className="text-sm font-medium">
                          {sale.stock?.vin ? (
                            <span className="font-mono">{sale.stock.vin}</span>
                          ) : (
                            <span className="text-amber-700">ยังไม่ระบุ VIN</span>
                          )}
                        </dd>
                      </div>
                    </>
                  );
                })()}
              </dl>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
                รายละเอียดรายการ
              </h2>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 font-medium">รายการทั่วไป (ไม่เชื่อมกับการขาย)</p>
                {payment.description && <p className="text-gray-700 mt-2">{payment.description}</p>}
              </div>
            </div>
          )}

          {/* Description (label "รายการ" matches PaymentEditPage's description field) */}
          {payment.description && (
            <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
              <h2 className="text-lg font-semibold mb-4">รายการ</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{payment.description}</p>
            </div>
          )}

          {/* Notes — free-text from PaymentEditPage's "หมายเหตุ" field */}
          {payment.notes && (
            <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
              <h2 className="text-lg font-semibold mb-4">หมายเหตุ</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{payment.notes}</p>
            </div>
          )}
        </div>

        {/* Created By */}
        {payment.createdBy && (
          <div className="mt-4 text-sm text-gray-500">
            สร้างโดย: {payment.createdBy.firstName} {payment.createdBy.lastName} (
            {payment.createdBy.username})
          </div>
        )}
      </div>

      {/* Void Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center text-red-600">
              <Ban className="h-5 w-5 mr-2" />
              ยืนยันการยกเลิกใบเสร็จ
            </h3>
            <p className="text-gray-600 mb-4">
              คุณต้องการยกเลิกใบเสร็จเลขที่ <strong>{payment.receiptNumber}</strong> หรือไม่?
            </p>
            <p className="text-sm text-gray-500 mb-4">
              {payment.sale
                ? `การยกเลิกจะทำให้ยอดชำระแล้วของการขายลดลง ${formatCurrency(payment.amount)}`
                : 'การยกเลิกจะทำให้รายการนี้ถูกยกเลิก'}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เหตุผลในการยกเลิก <span className="text-red-500">*</span>
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                placeholder="ระบุเหตุผลในการยกเลิก..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowVoidModal(false);
                  setVoidReason('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleVoid}
                disabled={voiding || !voidReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {voiding ? 'กำลังยกเลิก...' : 'ยืนยันการยกเลิก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
