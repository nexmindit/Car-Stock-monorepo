import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { paymentService, type CreatePaymentData, type PaymentType, type PaymentMethod } from '../../services/payment.service';
import { salesService } from '../../services/sales.service';
import { customerService, type Customer } from '../../services/customer.service';
import { bankAccountsService, type BankAccount } from '../../services/bank-accounts.service';
import { vehicleService, type VehicleModel } from '../../services/vehicle.service';
import { stockService } from '../../services/stock.service';
import { usePermission } from '../../hooks/usePermission';
import { MainLayout } from '../../components/layout';
import { DatePicker } from '../../components/ui/date-picker';
import {
  ArrowLeft,
  CreditCard,
  DollarSign,
  Save,
  FileText,
  User,
  Receipt,
  Car
} from 'lucide-react';
import {
  AsyncSearchSelect,
  SearchSelect,
  type SearchSelectOption,
} from '../../components/ui/search-select';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useToast } from '../../components/toast';

// Payment types for sale-related payments
const SALE_PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'DEPOSIT', label: 'เงินจอง' },
  { value: 'DOWN_PAYMENT', label: 'เงินดาวน์' },
  { value: 'FINANCE_PAYMENT', label: 'ยอดไฟแนนซ์' },
  { value: 'OTHER_EXPENSE', label: 'ค่าใช้จ่ายอื่น' },
];

// Payment types for miscellaneous payments
const MISC_PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'MISCELLANEOUS', label: 'รายการทั่วไป' },
  { value: 'OTHER_EXPENSE', label: 'ค่าใช้จ่ายอื่น' },
];

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'BANK_TRANSFER', label: 'โอนเงิน' },
  { value: 'CHEQUE', label: 'เช็ค' },
  { value: 'CREDIT_CARD', label: 'บัตรเครดิต' },
];

interface SaleInfo {
  id: string;
  saleNumber: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  customer: {
    id: string;
    code: string;
    name: string;
  };
  stock?: {
    vin: string;
    exteriorColor?: string | null;
    vehicleModel: {
      brand: string;
      model: string;
      variant?: string | null;
    };
  } | null;
  /** Booked model — the car while no VIN is linked yet. */
  vehicleModel?: {
    brand: string;
    model: string;
    variant?: string | null;
  } | null;
  preferredExtColor?: string | null;
}

/** Model name + color of the selected sale — linked unit first, else the booking. */
function describeSale(sale: SaleInfo): { name: string; color: string } {
  const vm = sale.stock?.vehicleModel ?? sale.vehicleModel;
  const name = vm ? [vm.brand, vm.model, vm.variant].filter(Boolean).join(' ') : '';
  const color = sale.stock?.exteriorColor || sale.preferredExtColor || '';
  return { name, color };
}

interface CustomerInfo {
  id: string;
  code: string;
  name: string;
}

interface FormData {
  saleId: string;
  customerId: string;
  amount: number;
  paymentDate: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  description: string;
  receivingBankAccountId?: string;
  receivingBank?: string;
  receivingBankName?: string;
  receivingAccountNumber?: string;
  receivingBranch?: string;
  actualReceivedDate?: string;
  netReceivedAmount?: number;
}

/** reservation = จองรถ (รุ่น+สี ยังไม่ระบุ VIN): creates the booking sale and its deposit receipt. */
type PaymentMode = 'sale' | 'miscellaneous' | 'reservation';

interface ReservationFields {
  vehicleModelId: string;
  preferredExtColor: string;
  preferredIntColor: string;
  /** Car price — prefilled from the model price, editable. */
  totalAmount: number;
}

const EMPTY_RESERVATION: ReservationFields = {
  vehicleModelId: '',
  preferredExtColor: '',
  preferredIntColor: '',
  totalAmount: 0,
};

export default function PaymentFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedSaleId = searchParams.get('saleId');
  const { addToast } = useToast();
  const { execute: executeQuery } = useErrorHandler({ showToast: true });
  const { hasAllPermissions } = usePermission();
  // A booking creates a sale and a payment — the API requires both rights.
  const canReserve = hasAllPermissions(['PAYMENT_CREATE', 'SALE_CREATE']);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Payment mode: linked to sale or standalone miscellaneous
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(preSelectedSaleId ? 'sale' : 'miscellaneous');

  // Sale-related state
  const [saleInfo, setSaleInfo] = useState<SaleInfo | null>(null);

  // Customer-related state (for miscellaneous payments)
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);

  const [formData, setFormData] = useState<FormData>({
    saleId: '',
    customerId: '',
    amount: 0,
    paymentDate: new Date().toISOString().split('T')[0],
    paymentType: 'DEPOSIT',
    paymentMethod: 'CASH',
    referenceNumber: '',
    description: '',
    receivingBankAccountId: '',
    receivingBank: '',
    receivingBankName: '',
    receivingAccountNumber: '',
    receivingBranch: '',
    actualReceivedDate: '',
    netReceivedAmount: 0,
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // จองรถ mode
  const [reservation, setReservation] = useState<ReservationFields>(EMPTY_RESERVATION);
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);
  const [colorSuggestions, setColorSuggestions] = useState<{
    exteriorColors: string[];
    interiorColors: string[];
  }>({ exteriorColors: [], interiorColors: [] });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (preSelectedSaleId) {
      setPaymentMode('sale');
      fetchSaleById(preSelectedSaleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedSaleId]);

  // Load active bank accounts for the "ธนาคารที่รับเงิน" select
  useEffect(() => {
    bankAccountsService.list().then((res) => {
      if (res.success && res.data) {
        setBankAccounts(res.data.filter((a) => a.isActive));
      }
    });
  }, []);

  // Vehicle models for จองรถ — loaded the first time that mode is opened
  useEffect(() => {
    if (paymentMode !== 'reservation' || vehicleModels.length > 0) return;
    vehicleService
      .getAllPages()
      .then((res) => setVehicleModels(res.data))
      .catch((error) => console.error('Error loading vehicle models:', error));
  }, [paymentMode, vehicleModels.length]);

  // Reset form when switching payment mode
  useEffect(() => {
    setErrors({});
    if (paymentMode === 'reservation') {
      setSaleInfo(null);
      setFormData(prev => ({
        ...prev,
        saleId: '',
        customerId: customerInfo?.id || '',
        paymentType: 'DEPOSIT',
        amount: 0,
        description: '',
      }));
    } else if (paymentMode === 'miscellaneous') {
      setReservation(EMPTY_RESERVATION);
      setSaleInfo(null);
      setFormData(prev => ({
        ...prev,
        saleId: '',
        customerId: customerInfo?.id || '',
        paymentType: 'MISCELLANEOUS',
        amount: 0,
        receivingBankAccountId: '',
        receivingBank: '',
        receivingBankName: '',
        receivingAccountNumber: '',
        receivingBranch: '',
        actualReceivedDate: '',
        netReceivedAmount: 0,
      }));
    } else {
      setCustomerInfo(null);
      setReservation(EMPTY_RESERVATION);
      setFormData(prev => ({
        ...prev,
        saleId: saleInfo?.id || '',
        customerId: saleInfo?.customer?.id || '',
        paymentType: 'DEPOSIT',
        amount: saleInfo?.remainingAmount || 0,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMode]);

  const fetchSaleById = async (saleId: string) => {
    setLoading(true);
    const result = await executeQuery(
      salesService.getById(saleId).then(sale => {
        const info: SaleInfo = {
          id: sale.id,
          saleNumber: sale.saleNumber,
          totalAmount: sale.totalAmount,
          paidAmount: sale.paidAmount,
          remainingAmount: sale.remainingAmount,
          status: sale.status,
          customer: sale.customer,
          stock: sale.stock,
          vehicleModel: sale.vehicleModel,
          preferredExtColor: sale.preferredExtColor,
        };
        setSaleInfo(info);
        setFormData(prev => ({
          ...prev,
          saleId: sale.id,
          customerId: sale.customer.id,
          amount: sale.remainingAmount > 0 ? sale.remainingAmount : 0,
        }));
        // execute() returns undefined on error — a value here means the sale loaded.
        return true;
      })
    );
    if (!result) {
      navigate('/payments');
    }
    setLoading(false);
  };

  // Async sale search for SearchSelect
  const loadSaleOptions = useCallback(async (query: string): Promise<SearchSelectOption<SaleInfo>[]> => {
    try {
      const response = await salesService.getAll({ search: query, limit: 10 });
      return response.data.map(sale => ({
        value: sale.id,
        label: sale.saleNumber,
        description: `${sale.customer.name} - ค้างชำระ ${formatCurrency(sale.remainingAmount)}`,
        data: {
          id: sale.id,
          saleNumber: sale.saleNumber,
          totalAmount: sale.totalAmount,
          paidAmount: sale.paidAmount,
          remainingAmount: sale.remainingAmount,
          status: sale.status,
          customer: sale.customer,
          stock: sale.stock,
          vehicleModel: sale.vehicleModel,
          preferredExtColor: sale.preferredExtColor,
        },
      }));
    } catch (error) {
      console.error('Error searching sales:', error);
      return [];
    }
  }, []);

  // Async customer search for SearchSelect
  const loadCustomerOptions = useCallback(async (query: string): Promise<SearchSelectOption<CustomerInfo>[]> => {
    try {
      const response = await customerService.getAll({ search: query, limit: 10 });
      return response.data.map((customer: Customer) => ({
        value: customer.id,
        label: customer.name,
        description: customer.code,
        data: {
          id: customer.id,
          code: customer.code,
          name: customer.name,
        },
      }));
    } catch (error) {
      console.error('Error searching customers:', error);
      return [];
    }
  }, []);

  const handleSaleSelect = (_value: string, option?: SearchSelectOption<SaleInfo>) => {
    if (option?.data) {
      const sale = option.data;
      setSaleInfo(sale);
      setFormData(prev => ({
        ...prev,
        saleId: sale.id,
        customerId: sale.customer.id,
        amount: sale.remainingAmount > 0 ? sale.remainingAmount : 0,
      }));
    } else {
      setSaleInfo(null);
      setFormData(prev => ({
        ...prev,
        saleId: '',
        customerId: '',
        amount: 0,
      }));
    }
  };

  const handleCustomerSelect = (value: string, option?: SearchSelectOption<CustomerInfo>) => {
    if (option?.data) {
      setCustomerInfo(option.data);
      setFormData(prev => ({
        ...prev,
        customerId: value,
      }));
    } else {
      setCustomerInfo(null);
      setFormData(prev => ({
        ...prev,
        customerId: '',
      }));
    }
  };

  const modelOptions: SearchSelectOption<VehicleModel>[] = useMemo(
    () =>
      vehicleModels.map((m) => ({
        value: m.id,
        label: `${m.brand} ${m.model}${m.variant ? ` ${m.variant}` : ''}`,
        description: `ปี ${m.year} • ราคา ฿${Number(m.price).toLocaleString()}`,
        data: m,
      })),
    [vehicleModels]
  );

  const handleReservationChange = (field: keyof ReservationFields, value: string | number) => {
    setReservation((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleModelSelect = (value: string, option?: SearchSelectOption<VehicleModel>) => {
    setReservation((prev) => ({
      ...prev,
      vehicleModelId: value,
      totalAmount: option?.data ? Number(option.data.price) || prev.totalAmount : prev.totalAmount,
    }));
    setErrors((prev) => ({ ...prev, vehicleModelId: '' }));
    setColorSuggestions({ exteriorColors: [], interiorColors: [] });
    if (value) {
      stockService
        .getModelColors(value)
        .then(setColorSuggestions)
        .catch((error) => console.error('Error loading model colors:', error));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
    }).format(amount);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (paymentMode === 'sale' && !formData.saleId) {
      newErrors.saleId = 'กรุณาเลือกการขาย';
    }

    if (paymentMode !== 'sale' && !formData.customerId) {
      newErrors.customerId = 'กรุณาเลือกลูกค้า';
    }

    if (paymentMode === 'reservation') {
      if (!reservation.vehicleModelId) newErrors.vehicleModelId = 'กรุณาเลือกรุ่นรถที่จอง';
      if (!reservation.preferredExtColor.trim()) {
        newErrors.preferredExtColor = 'กรุณาระบุสีภายนอกที่จอง';
      }
      if (reservation.totalAmount <= 0) newErrors.totalAmount = 'กรุณาระบุราคารถ';
      if (reservation.totalAmount > 0 && formData.amount > reservation.totalAmount) {
        newErrors.amount = 'ยอดเงินจองต้องไม่เกินราคารถ';
      }
    }

    if (paymentMode === 'miscellaneous' && !formData.description?.trim()) {
      newErrors.description = 'กรุณาระบุรายละเอียดสำหรับรายการทั่วไป';
    }

    if (formData.amount <= 0) {
      newErrors.amount = 'กรุณาระบุจำนวนเงิน';
    }

    if (!formData.paymentDate) {
      newErrors.paymentDate = 'กรุณาระบุวันที่ชำระ';
    }

    if (formData.paymentMethod === 'BANK_TRANSFER' && !formData.referenceNumber) {
      newErrors.referenceNumber = 'กรุณาระบุเลขที่อ้างอิงสำหรับการโอนเงิน';
    }

    if (formData.paymentMethod === 'CHEQUE' && !formData.referenceNumber) {
      newErrors.referenceNumber = 'กรุณาระบุเลขที่เช็ค';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSaving(true);

    if (paymentMode === 'reservation') {
      await executeQuery(
        paymentService
          .createReservationDeposit({
            customerId: formData.customerId,
            vehicleModelId: reservation.vehicleModelId,
            preferredExtColor: reservation.preferredExtColor.trim(),
            preferredIntColor: reservation.preferredIntColor.trim() || undefined,
            totalAmount: reservation.totalAmount,
            depositAmount: formData.amount,
            paymentDate: formData.paymentDate,
            paymentMethod: formData.paymentMethod,
            referenceNumber: formData.referenceNumber || undefined,
            receivingBank: formData.receivingBankName || formData.receivingBank || undefined,
            receivingBankName: formData.receivingBankName || undefined,
            receivingAccountNumber: formData.receivingAccountNumber || undefined,
            receivingBranch: formData.receivingBranch || undefined,
            description: formData.description.trim() || undefined,
          })
          .then((payment) => {
            addToast(
              `บันทึกการจอง ${payment.sale?.saleNumber ?? ''} และรับเงินจองสำเร็จ`,
              'success'
            );
            navigate(`/payments/${payment.id}`);
          })
      );
      setSaving(false);
      return;
    }

    const createData: CreatePaymentData = {
      customerId: formData.customerId,
      amount: formData.amount,
      paymentDate: formData.paymentDate,
      paymentType: formData.paymentType,
      paymentMethod: formData.paymentMethod,
      referenceNumber: formData.referenceNumber || undefined,
      description: formData.description || undefined,
      receivingBank: formData.receivingBankName || formData.receivingBank || undefined,
      receivingBankName: formData.receivingBankName || undefined,
      receivingAccountNumber: formData.receivingAccountNumber || undefined,
      receivingBranch: formData.receivingBranch || undefined,
      actualReceivedDate: formData.actualReceivedDate || undefined,
      netReceivedAmount: formData.netReceivedAmount || undefined,
    };

    // Only include saleId for sale-linked payments
    if (paymentMode === 'sale' && formData.saleId) {
      createData.saleId = formData.saleId;
    }

    await executeQuery(
      paymentService.create(createData).then((payment) => {
        addToast('บันทึกการชำระเงินสำเร็จ', 'success');
        // Navigate to payment detail or back to sale
        if (preSelectedSaleId) {
          navigate(`/sales/${preSelectedSaleId}`);
        } else {
          navigate(`/payments/${payment.id}`);
        }
      })
    );
    setSaving(false);
  };

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const currentPaymentTypeOptions =
    paymentMode === 'sale'
      ? SALE_PAYMENT_TYPE_OPTIONS
      : paymentMode === 'reservation'
        ? SALE_PAYMENT_TYPE_OPTIONS.filter((o) => o.value === 'DEPOSIT')
        : MISC_PAYMENT_TYPE_OPTIONS;

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">กำลังโหลด...</div>
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
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            กลับ
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            บันทึกการชำระเงิน
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Payment Mode Toggle */}
          {!preSelectedSaleId && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <Receipt className="h-5 w-5 mr-2 text-blue-600" />
                ประเภทการบันทึก
              </h2>
              <div className="flex flex-col md:flex-row gap-4">
                <button
                  type="button"
                  onClick={() => setPaymentMode('sale')}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${paymentMode === 'sale'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <FileText className="h-6 w-6 mx-auto mb-2" />
                  <div className="font-medium">เชื่อมกับการขาย</div>
                  <div className="text-sm text-gray-500">บันทึกการชำระที่เกี่ยวข้องกับรายการขาย</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('miscellaneous')}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${paymentMode === 'miscellaneous'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <DollarSign className="h-6 w-6 mx-auto mb-2" />
                  <div className="font-medium">รายการทั่วไป</div>
                  <div className="text-sm text-gray-500">บันทึกรายรับทั่วไปที่ไม่เกี่ยวกับการขาย</div>
                </button>
                {canReserve && (
                  <button
                    type="button"
                    onClick={() => setPaymentMode('reservation')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${paymentMode === 'reservation'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <Car className="h-6 w-6 mx-auto mb-2" />
                    <div className="font-medium">จองรถ (ยังไม่ระบุ VIN)</div>
                    <div className="text-sm text-gray-500">
                      เลือกรุ่น + สี แล้วรับเงินจอง — ผูก VIN ภายหลัง
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Sale Selection (for sale mode) */}
          {paymentMode === 'sale' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
                ข้อมูลการขาย
              </h2>

              {!preSelectedSaleId && (
                <div className="mb-4">
                  <AsyncSearchSelect<SaleInfo>
                    value={formData.saleId}
                    onChange={handleSaleSelect}
                    loadOptions={loadSaleOptions}
                    label="ค้นหาการขาย"
                    required
                    placeholder="พิมพ์เลขที่ขาย หรือชื่อลูกค้า..."
                    error={errors.saleId}
                    emptyMessage="ไม่พบการขาย"
                    minSearchLength={2}
                  />
                </div>
              )}

              {/* Sale Info Display */}
              {saleInfo && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-500">เลขที่ขาย</p>
                    <p className="font-medium">{saleInfo.saleNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ลูกค้า</p>
                    <p className="font-medium">{saleInfo.customer.name}</p>
                    <p className="text-sm text-gray-500">{saleInfo.customer.code}</p>
                  </div>
                  {(() => {
                    const car = describeSale(saleInfo);
                    if (!car.name && !saleInfo.stock) return null;
                    return (
                      <div className="md:col-span-2">
                        <p className="text-sm text-gray-500">รถยนต์</p>
                        <p className="font-medium">
                          {car.name || '-'}
                          {car.color && <span className="text-gray-700"> • สี {car.color}</span>}
                        </p>
                        <p className="text-sm text-gray-500">
                          {saleInfo.stock?.vin
                            ? `VIN: ${saleInfo.stock.vin}`
                            : 'ยังไม่ระบุ VIN (จองรุ่น/สี)'}
                        </p>
                      </div>
                    );
                  })()}
                  <div>
                    <p className="text-sm text-gray-500">ยอดรวม</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(saleInfo.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ชำระแล้ว</p>
                    <p className="font-semibold text-green-600">{formatCurrency(saleInfo.paidAmount)}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">ค้างชำระ</p>
                    <p className="text-xl font-bold text-red-600">{formatCurrency(saleInfo.remainingAmount)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Customer Selection (miscellaneous + จองรถ) */}
          {paymentMode !== 'sale' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <User className="h-5 w-5 mr-2 text-blue-600" />
                ข้อมูลลูกค้า
              </h2>

              <div className="mb-4">
                <AsyncSearchSelect<CustomerInfo>
                  value={formData.customerId}
                  onChange={handleCustomerSelect}
                  loadOptions={loadCustomerOptions}
                  label="ค้นหาลูกค้า"
                  required
                  placeholder="พิมพ์ชื่อลูกค้า หรือรหัสลูกค้า..."
                  error={errors.customerId}
                  emptyMessage="ไม่พบลูกค้า"
                  minSearchLength={2}
                />
              </div>

              {/* Customer Info Display */}
              {customerInfo && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">รหัสลูกค้า</p>
                      <p className="font-medium">{customerInfo.code}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">ชื่อลูกค้า</p>
                      <p className="font-medium">{customerInfo.name}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Description for miscellaneous payments */}
              {paymentMode === 'miscellaneous' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รายละเอียด <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={3}
                  placeholder="ระบุรายละเอียดของรายการ เช่น ค่าบริการ, ค่าอุปกรณ์เสริม..."
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.description ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {errors.description && (
                  <p className="text-sm text-red-500 mt-1">{errors.description}</p>
                )}
              </div>
              )}
            </div>
          )}

          {/* Booked car (จองรถ mode): model + color now, VIN assigned later */}
          {paymentMode === 'reservation' && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <Car className="h-5 w-5 mr-2 text-blue-600" />
                รถที่จอง
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <SearchSelect<VehicleModel>
                    value={reservation.vehicleModelId}
                    onChange={handleModelSelect}
                    options={modelOptions}
                    label="รุ่นรถ"
                    required
                    placeholder="ค้นหารุ่นรถ..."
                    error={errors.vehicleModelId}
                    emptyMessage="ไม่พบรุ่นรถ"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reservation-ext-color"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    สีภายนอก <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="reservation-ext-color"
                    type="text"
                    list="reservation-ext-colors"
                    value={reservation.preferredExtColor}
                    onChange={(e) => handleReservationChange('preferredExtColor', e.target.value)}
                    placeholder="เลือกหรือพิมพ์สี เช่น ขาว"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.preferredExtColor ? 'border-red-500' : 'border-gray-300'
                      }`}
                  />
                  <datalist id="reservation-ext-colors">
                    {colorSuggestions.exteriorColors.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  {colorSuggestions.exteriorColors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {colorSuggestions.exteriorColors.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleReservationChange('preferredExtColor', c)}
                          className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${reservation.preferredExtColor === c
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-300 text-gray-700 hover:border-blue-300'
                            }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                  {errors.preferredExtColor && (
                    <p className="text-sm text-red-500 mt-1">{errors.preferredExtColor}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="reservation-int-color"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    สีภายใน
                  </label>
                  <input
                    id="reservation-int-color"
                    type="text"
                    list="reservation-int-colors"
                    value={reservation.preferredIntColor}
                    onChange={(e) => handleReservationChange('preferredIntColor', e.target.value)}
                    placeholder="ไม่บังคับ"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="reservation-int-colors">
                    {colorSuggestions.interiorColors.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="reservation-total-amount"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    ราคารถ (บาท) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <input
                      id="reservation-total-amount"
                      type="number"
                      value={reservation.totalAmount || ''}
                      onChange={(e) =>
                        handleReservationChange('totalAmount', Number.parseFloat(e.target.value) || 0)
                      }
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.totalAmount ? 'border-red-500' : 'border-gray-300'
                        }`}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  {errors.totalAmount ? (
                    <p className="text-sm text-red-500 mt-1">{errors.totalAmount}</p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      ตั้งจากราคารุ่นรถ แก้ไขได้ • ระบบจะสร้างการขายแบบจอง (ยังไม่ผูก VIN) ซึ่งนับใน
                      "ยอดจอง" ของรายงานสต็อกประจำวัน จนกว่าจะผูก VIN ที่หน้ารายละเอียดการขาย
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Payment Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-blue-600" />
              รายละเอียดการชำระเงิน
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {paymentMode === 'reservation' ? 'ยอดเงินจอง (บาท)' : 'จำนวนเงิน (บาท)'}{' '}
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="number"
                    value={formData.amount || ''}
                    onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
                    className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.amount ? 'border-red-500' : 'border-gray-300'
                      }`}
                    min="0"
                    step="0.01"
                  />
                </div>
                {errors.amount && (
                  <p className="text-sm text-red-500 mt-1">{errors.amount}</p>
                )}
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันที่ชำระ <span className="text-red-500">*</span>
                </label>
                <DatePicker
                  value={formData.paymentDate}
                  onChange={(v) => handleInputChange('paymentDate', v)}
                  inputClassName={`w-full ${errors.paymentDate ? '!border-red-500' : ''}`}
                />
                {errors.paymentDate && (
                  <p className="text-sm text-red-500 mt-1">{errors.paymentDate}</p>
                )}
              </div>

              {/* Payment Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ประเภทการชำระ <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.paymentType}
                  onChange={(e) => handleInputChange('paymentType', e.target.value)}
                  disabled={paymentMode === 'reservation'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  {currentPaymentTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วิธีการชำระ <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.paymentMethod}
                  onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เลขที่อ้างอิง
                  {(formData.paymentMethod === 'BANK_TRANSFER' || formData.paymentMethod === 'CHEQUE') && (
                    <span className="text-red-500"> *</span>
                  )}
                </label>
                <input
                  type="text"
                  value={formData.referenceNumber}
                  onChange={(e) => handleInputChange('referenceNumber', e.target.value)}
                  placeholder={
                    formData.paymentMethod === 'BANK_TRANSFER' ? 'เลขที่รายการโอน' :
                      formData.paymentMethod === 'CHEQUE' ? 'เลขที่เช็ค' :
                        'เลขที่อ้างอิง (ถ้ามี)'
                  }
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.referenceNumber ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {errors.referenceNumber && (
                  <p className="text-sm text-red-500 mt-1">{errors.referenceNumber}</p>
                )}
              </div>

              {/* Receiving Bank - always visible so user can see saved accounts */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ธนาคารที่รับเงิน
                </label>
                {bankAccounts.length === 0 ? (
                  <p className="text-xs text-gray-500 mt-1">
                    ยังไม่มีบัญชีธนาคาร — เพิ่มได้ที่ ตั้งค่า &rarr; บัญชีธนาคาร
                  </p>
                ) : formData.paymentMethod === 'BANK_TRANSFER' ? (
                  <>
                    <select
                      value={formData.receivingBankAccountId || ''}
                      onChange={(e) => {
                        const id = e.target.value;
                        const acc = bankAccounts.find((a) => a.id === id);
                        setFormData((prev) => ({
                          ...prev,
                          receivingBankAccountId: id,
                          receivingBank: acc?.bankName || '',
                          receivingBankName: acc?.bankName || '',
                          receivingAccountNumber: acc?.accountNumber || '',
                          receivingBranch: acc?.branch || '',
                        }));
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">เลือกธนาคาร...</option>
                      {bankAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {`${acc.bankName} | เลขที่บัญชี ${acc.accountNumber}${
                            acc.branch ? ` | ${acc.branch}` : ''
                          }`}
                        </option>
                      ))}
                    </select>
                    {/* Show selected bank details for clear confirmation */}
                    {formData.receivingBankAccountId &&
                      (() => {
                        const selected = bankAccounts.find(
                          (a) => a.id === formData.receivingBankAccountId
                        );
                        if (!selected) return null;
                        return (
                          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                            <div className="font-medium text-blue-900">{selected.bankName}</div>
                            <div className="text-blue-800 mt-1">
                              <span className="text-blue-600">เลขที่บัญชี: </span>
                              <span className="font-mono font-semibold">
                                {selected.accountNumber}
                              </span>
                            </div>
                            <div className="text-blue-700 text-xs mt-0.5">
                              ชื่อบัญชี: {selected.accountName}
                              {selected.branch ? ` • สาขา: ${selected.branch}` : ''}
                            </div>
                          </div>
                        );
                      })()}
                  </>
                ) : (
                  /* Read-only preview of saved bank accounts */
                  <div className="space-y-2">
                    {bankAccounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                      >
                        <div className="font-medium text-gray-900">{acc.bankName}</div>
                        <div className="text-gray-700 mt-1">
                          <span className="text-gray-500">เลขที่บัญชี: </span>
                          <span className="font-mono font-semibold">{acc.accountNumber}</span>
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          ชื่อบัญชี: {acc.accountName}
                          {acc.branch ? ` • สาขา: ${acc.branch}` : ''}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-gray-500 mt-1">
                      เลือกวิธีชำระ "โอนเงิน" เพื่อระบุบัญชีที่ใช้รับเงิน
                    </p>
                  </div>
                )}
              </div>

              {/* Finance Details (Only for Finance Payment) */}
              {formData.paymentType === 'FINANCE_PAYMENT' && (
                <div className="md:col-span-2 bg-blue-50 p-4 rounded-lg space-y-4 border border-blue-100">
                  <h3 className="text-sm font-semibold text-blue-800 mb-2">ข้อมูลการรับเงินจากไฟแนนซ์</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        วันที่ได้รับเงินจริง
                      </label>
                      <DatePicker
                        value={formData.actualReceivedDate || ''}
                        onChange={(v) => handleInputChange('actualReceivedDate', v)}
                        inputClassName="w-full"
                        clearable
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ยอดเงินสุทธิที่ได้รับ
                      </label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                        <input
                          type="number"
                          value={formData.netReceivedAmount || ''}
                          onChange={(e) => handleInputChange('netReceivedAmount', parseFloat(e.target.value) || 0)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          step="0.01"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">ยอดเงินหลังจากหักค่าธรรมเนียมหรือส่วนต่าง</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes (sale + จองรถ; misc mode captures its description above) */}
              {paymentMode !== 'miscellaneous' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หมายเหตุ
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={3}
                    placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || (paymentMode === 'sale' && !formData.saleId) || (paymentMode !== 'sale' && !formData.customerId)}
              className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-5 w-5 mr-2" />
              {saving
                ? 'กำลังบันทึก...'
                : paymentMode === 'reservation'
                  ? 'บันทึกการจองและรับเงินจอง'
                  : 'บันทึกการชำระเงิน'}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
