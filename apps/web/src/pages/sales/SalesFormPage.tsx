import { resolveSaleCarPrice, sumCustomCustomerCharges } from '@car-stock/shared/finance';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FinanceSheet } from '../../components/finance/FinanceSheet';
import {
  salesService,
  type CreateSaleData,
  type UpdateSaleData,
  type PaymentMode,
  type SaleFinanceCustomLine,
} from '../../services/sales.service';
import { usePermission } from '../../hooks/usePermission';
import { useMutationHandler, useErrorHandler } from '../../hooks/useErrorHandler';
import { customerService, type Customer } from '../../services/customer.service';
import { stockService, type Stock } from '../../services/stock.service';
import { vehicleService, type VehicleModel } from '../../services/vehicle.service';
import { MainLayout } from '../../components/layout';
import { useToast } from '../../components/toast';
import { useDemoSaleBlockReason } from '../../hooks/useDemoSale';
import { DatePicker } from '../../components/ui/date-picker';
import {
  ArrowLeft,
  User,
  Car,
  Calendar,
  DollarSign,
  Save
} from 'lucide-react';
import { AsyncSearchSelect, SearchSelect, type SearchSelectOption } from '../../components/ui/search-select';
import { PriceSourceModal, type PriceSource } from '../../components/PriceSourceModal';


// Creates DIRECT_SALE (pick a VIN now) or RESERVATION_SALE (pick model + color;
// VIN is assigned later from the sale detail page when the car arrives).

/** Local calendar day as yyyy-MM-dd (not UTC from toISOString). */
function toLocalYmd(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Updated form data for Direct Sale only
interface FormData {
  customerId: string;
  stockId: string;
  vehicleModelId: string;
  preferredExtColor: string;
  totalAmount: number;
  depositAmount: number;
  paymentMode: PaymentMode;
  downPayment: number;
  financeAmount: number;
  financeProvider: string;
  carDiscount: number;
  downPaymentDiscount: number;
  insuranceFee: number;
  compulsoryInsuranceFee: number;
  registrationFee: number;
  salesCommission: number;
  salesExpense: number;
  financeCommission: number;
  interestRate: number;
  numberOfTerms: number;
  monthlyInstallment: number;
  createdAt: string;
  deliveryDate: string;
  notes: string;
  freebiesSnapshot: string;
  financeEditedKeys: string[];
  customLines: SaleFinanceCustomLine[];
}

export default function SalesFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const { hasPermission, user } = usePermission();
  const canDiscount = hasPermission('SALE_DISCOUNT');
  const [saleStatus, setSaleStatus] = useState<string | null>(null);
  const [saleType, setSaleType] = useState<'DIRECT_SALE' | 'RESERVATION_SALE'>('DIRECT_SALE');
  const [createdBy, setCreatedBy] = useState<{
    firstName: string;
    lastName: string;
    username: string;
  } | null>(null);
  const isCompletedAsAccountant = isEditing && saleStatus === 'COMPLETED' && user?.role === 'ACCOUNTANT';

  const { execute: executeMutation, clearFieldErrors } = useMutationHandler(
    isEditing ? 'แก้ไขข้อมูลการขายสำเร็จ' : 'สร้างการขายสำเร็จ',
    { onSuccess: () => navigate('/sales') }
  );
  const { execute: executeQuery } = useErrorHandler({ showToast: true });
  const { addToast } = useToast();
  // Non-null when this user may not sell DEMO cars (Settings → การขายรถ Demo).
  const demoBlockReason = useDemoSaleBlockReason();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableStocks, setAvailableStocks] = useState<Stock[]>([]);
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);
  const [colorOptions, setColorOptions] = useState<string[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [pendingStock, setPendingStock] = useState<Stock | null>(null);
  
  // Simplified form data for Direct Sale
  const [formData, setFormData] = useState<FormData>({
    customerId: '',
    stockId: '',
    vehicleModelId: '',
    preferredExtColor: '',
    totalAmount: 0,
    depositAmount: 0,
    paymentMode: 'CASH',
    downPayment: 0,
    financeAmount: 0,
    financeProvider: '',
    carDiscount: 0,
    downPaymentDiscount: 0,
    insuranceFee: 0,
    compulsoryInsuranceFee: 0,
    registrationFee: 0,
    salesCommission: 0,
    salesExpense: 0,
    financeCommission: 0,
    interestRate: 0,
    numberOfTerms: 0,
    monthlyInstallment: 0,
    createdAt: toLocalYmd(),
    deliveryDate: '',
    notes: '',
    freebiesSnapshot: '',
    financeEditedKeys: [],
    customLines: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (id) {
      fetchSale(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchInitialData = async () => {
    setLoading(true);
    await executeQuery(
      Promise.all([
        stockService.getAvailable(),
        vehicleService.getAllPages(),
        stockService.getFilterOptions(),
      ]).then(([stocksRes, modelsRes, filterRes]) => {
        setAvailableStocks(stocksRes);
        setVehicleModels(modelsRes.data);
        // Stock colors are free text (White/WHITE) — one entry per color.
        const seen = new Map<string, string>();
        for (const c of filterRes.exteriorColors) {
          const key = c.trim().toLowerCase();
          if (key && !seen.has(key)) seen.set(key, c.trim());
        }
        setColorOptions([...seen.values()].sort((a, b) => a.localeCompare(b)));
      })
    );
    setLoading(false);
  };

  const fetchSale = async (saleId: string) => {
    setLoading(true);
    let found = false;
    await executeQuery(
      salesService.getById(saleId).then((sale) => {
        // Direct + reservation sales are both editable here (delivery date, amounts, etc.).
        // New sales created from this form remain DIRECT_SALE only.
        found = true;
        setSaleStatus(sale.status);
        setSaleType(sale.type === 'RESERVATION_SALE' ? 'RESERVATION_SALE' : 'DIRECT_SALE');
        setFormData({
          customerId: sale.customer.id,
          stockId: sale.stock?.id || '',
          vehicleModelId: sale.vehicleModel?.id || '',
          preferredExtColor: sale.preferredExtColor || '',
          totalAmount: Number(sale.totalAmount) || 0,
          depositAmount: Number(sale.depositAmount) || 0,
          paymentMode: sale.paymentMode,
          downPayment: Number(sale.downPayment) || 0,
          financeAmount: Number(sale.financeAmount) || 0,
          financeProvider: sale.financeProvider || '',
          carDiscount: Number(sale.carDiscount) || 0,
          downPaymentDiscount: Number(sale.downPaymentDiscount) || 0,
          insuranceFee: Number(sale.insuranceFee) || 0,
          compulsoryInsuranceFee: Number(sale.compulsoryInsuranceFee) || 0,
          registrationFee: Number(sale.registrationFee) || 0,
          salesCommission: Number(sale.salesCommission) || 0,
          salesExpense: Number(sale.salesExpense) || 0,
          financeCommission: Number(sale.financeCommission) || 0,
          interestRate: Number(sale.interestRate) || 0,
          numberOfTerms: Number(sale.numberOfTerms) || 0,
          monthlyInstallment: Number(sale.monthlyInstallment) || 0,
          createdAt: sale.createdAt ? toLocalYmd(new Date(sale.createdAt)) : toLocalYmd(),
          deliveryDate: sale.deliveryDate ? toLocalYmd(new Date(sale.deliveryDate)) : '',
          notes: sale.stock?.notes || sale.notes || '',
          freebiesSnapshot: sale.freebiesSnapshot || '',
          financeEditedKeys: sale.financeEditedKeys ?? [],
          customLines: sale.customLines ?? [],
        });

        setSelectedCustomer(sale.customer as Customer);
        if (sale.stock) {
          setSelectedStock(sale.stock as unknown as Stock);
        }
        setCreatedBy(sale.createdBy ?? null);
      })
    );
    if (!found) navigate('/sales');
    setLoading(false);
  };

  // Async customer search for SearchSelect
  const loadCustomerOptions = useCallback(async (query: string): Promise<SearchSelectOption<Customer>[]> => {
    const response = await customerService.getAll({ search: query, limit: 10 });
    return response.data.map((customer: Customer) => ({
      value: customer.id,
      label: customer.name,
      description: `${customer.code} • ${customer.phone}`,
      data: customer,
    }));
  }, []);

  const handleCustomerSelect = (value: string, option?: SearchSelectOption<Customer>) => {
    if (option?.data) {
      setSelectedCustomer(option.data);
      setFormData(prev => ({ ...prev, customerId: value }));
    } else {
      setSelectedCustomer(null);
      setFormData(prev => ({ ...prev, customerId: '' }));
    }
  };

  // Convert stocks to SearchSelect options. Include the currently assigned stock
  // even when it is no longer AVAILABLE (e.g. RESERVED on this sale) so re-save
  // and display stay correct while still allowing swap to other available units.
  // Label shows last 8 VIN chars for readability; full VIN is in description + filterFn
  // so users can search by complete VIN or any substring.
  const stockOptions: SearchSelectOption<Stock>[] = useMemo(() => {
    const toOption = (stock: Stock): SearchSelectOption<Stock> => {
      const isDemo = stock.status === 'DEMO';
      const demoBlocked = isDemo && demoBlockReason !== null;
      const pricePart = stock.expectedSalePrice
        ? ` • ราคา: ฿${stock.expectedSalePrice.toLocaleString()}`
        : '';
      return {
        value: stock.id,
        label: `${stock.vehicleModel.brand} ${stock.vehicleModel.model} - VIN: ${stock.vin.slice(-8)} (${stock.exteriorColor})${isDemo ? ' · รถ Demo' : ''}`,
        description: demoBlocked
          ? `VIN: ${stock.vin} · รถ Demo — ${demoBlockReason}`
          : `VIN: ${stock.vin}${isDemo ? ' · รถ Demo' : ''}${pricePart}`,
        data: stock,
        disabled: demoBlocked,
      };
    };
    // AVAILABLE first, then DEMO (API already prefers this order)
    const options = [...availableStocks]
      .sort((a, b) => {
        if (a.status === b.status) return 0;
        if (a.status === 'AVAILABLE') return -1;
        if (b.status === 'AVAILABLE') return 1;
        return 0;
      })
      .map(toOption);
    if (selectedStock && !options.some((o) => o.value === selectedStock.id)) {
      options.unshift(toOption(selectedStock));
    }
    return options;
  }, [availableStocks, selectedStock, demoBlockReason]);

  const filterStockOption = useCallback((option: SearchSelectOption<Stock>, query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    const stock = option.data;
    return (
      option.label.toLowerCase().includes(q) ||
      (option.description?.toLowerCase().includes(q) ?? false) ||
      (stock?.vin?.toLowerCase().includes(q) ?? false) ||
      (stock?.exteriorColor?.toLowerCase().includes(q) ?? false) ||
      (stock?.vehicleModel?.brand?.toLowerCase().includes(q) ?? false) ||
      (stock?.vehicleModel?.model?.toLowerCase().includes(q) ?? false) ||
      (stock?.vehicleModel?.variant?.toLowerCase().includes(q) ?? false)
    );
  }, []);

  const handleStockSelect = (value: string, option?: SearchSelectOption<Stock>) => {
    const stock = option?.data || null;

    // Belt-and-suspenders: the option is disabled, and the API re-checks on save
    if (stock?.status === 'DEMO' && demoBlockReason) {
      addToast(demoBlockReason, 'warning');
      return;
    }

    setSelectedStock(stock);

    if (stock) {
      setFormData((prev) => ({
        ...prev,
        stockId: value,
      }));

      // Open price source modal if both VehicleModel price and Stock expectedSalePrice exist
      if (stock.vehicleModel?.price != null) {
        setPendingStock(stock);
        setPriceModalOpen(true);
      } else {
        // Fallback: auto-fill from stock expectedSalePrice
        setFormData((prev) => ({
          ...prev,
          stockId: value,
          totalAmount: stock.expectedSalePrice || prev.totalAmount,
        }));
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        stockId: '',
      }));
    }
  };

  const handlePriceSourceSelect = (source: PriceSource) => {
    if (!pendingStock) return;

    if (source === 'model') {
      setFormData((prev) => ({
        ...prev,
        totalAmount: Number(pendingStock.vehicleModel.price) || prev.totalAmount,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        totalAmount: pendingStock.expectedSalePrice || prev.totalAmount,
      }));
    }
    setPendingStock(null);
  };

  const selectedModel = vehicleModels.find((m) => m.id === formData.vehicleModelId);

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

  const handleModelSelect = (value: string, option?: SearchSelectOption<VehicleModel>) => {
    setFormData((prev) => ({
      ...prev,
      vehicleModelId: value,
      totalAmount: option?.data ? Number(option.data.price) || prev.totalAmount : prev.totalAmount,
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.customerId) {
      newErrors.customerId = 'กรุณาเลือกลูกค้า';
    }

    // Direct sale needs a VIN now; a booking needs model + color so the daily
    // stock report can count it, and gets its VIN later.
    if (saleType === 'DIRECT_SALE' && !formData.stockId) {
      newErrors.stockId = 'กรุณาเลือก Stock สำหรับการขายตรง';
    }
    if (saleType === 'RESERVATION_SALE' && !formData.stockId) {
      if (!formData.vehicleModelId) newErrors.vehicleModelId = 'กรุณาเลือกรุ่นรถที่จอง';
      if (!formData.preferredExtColor) newErrors.preferredExtColor = 'กรุณาเลือกสีที่จอง';
    }

    if (formData.totalAmount <= 0) {
      newErrors.totalAmount = 'กรุณาระบุยอดรวม';
    }

    if (formData.depositAmount > formData.totalAmount) {
      newErrors.depositAmount = 'เงินมัดจำต้องไม่เกินยอดรวม';
    }

    if (formData.paymentMode === 'FINANCE' && !formData.financeProvider) {
      newErrors.financeProvider = 'กรุณาระบุบริษัทไฟแนนซ์';
    }

    if (!formData.createdAt) {
      newErrors.createdAt = 'กรุณาระบุวันที่สร้างรายการ';
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
    clearFieldErrors();

    // Update must not send `type` (immutable) and must omit empty stockId so
    // Prisma does not get an invalid FK. Booked model/color only matter while
    // no VIN is linked (the linked stock owns the model otherwise).
    const sharedFields = {
      totalAmount: formData.totalAmount,
      depositAmount: formData.depositAmount || undefined,
      paymentMode: formData.paymentMode,
      downPayment: formData.downPayment || undefined,
      financeAmount: formData.financeAmount || undefined,
      financeProvider: formData.financeProvider || undefined,
      carDiscount: formData.carDiscount,
      downPaymentDiscount: formData.downPaymentDiscount,
      insuranceFee: formData.insuranceFee,
      compulsoryInsuranceFee: formData.compulsoryInsuranceFee,
      registrationFee: formData.registrationFee,
      salesCommission: formData.salesCommission,
      salesExpense: formData.salesExpense,
      financeCommission: formData.financeCommission,
      interestRate: formData.interestRate || undefined,
      numberOfTerms: formData.numberOfTerms || undefined,
      monthlyInstallment: formData.monthlyInstallment || undefined,
      createdAt: formData.createdAt || undefined,
      deliveryDate: formData.deliveryDate || undefined,
      notes: formData.notes || undefined,
      freebiesSnapshot: formData.freebiesSnapshot,
      financeEditedKeys: formData.financeEditedKeys,
      customLines: formData.customLines,
      ...(!formData.stockId && formData.vehicleModelId
        ? {
            vehicleModelId: formData.vehicleModelId,
            preferredExtColor: formData.preferredExtColor || undefined,
          }
        : {}),
    };

    const data: CreateSaleData | UpdateSaleData = isEditing
      ? {
          ...(isCompletedAsAccountant
            ? {}
            : {
                customerId: formData.customerId,
                ...(formData.stockId ? { stockId: formData.stockId } : {}),
              }),
          ...sharedFields,
        }
      : {
          type: saleType,
          customerId: formData.customerId,
          ...(formData.stockId ? { stockId: formData.stockId } : {}),
          ...sharedFields,
        };

    await executeMutation(
      isEditing && id ? salesService.update(id, data) : salesService.create(data as CreateSaleData)
    );
    setSaving(false);
  };

  // Chosen list price (Stock expectedSalePrice or model.price), not net totalAmount
  const carPrice = resolveSaleCarPrice({
    totalAmount: formData.totalAmount,
    carDiscount: formData.carDiscount,
    customCustomerCharges: sumCustomCustomerCharges(formData.customLines),
    vehicleModelPrice: selectedStock?.vehicleModel?.price ?? selectedModel?.price,
    expectedSalePrice: selectedStock?.expectedSalePrice,
  });

  const creatorPerson = createdBy ?? (isEditing ? null : user);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-700">กำลังโหลด...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/sales')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditing
                ? saleType === 'RESERVATION_SALE'
                  ? 'แก้ไขการขาย (ผ่านการจอง)'
                  : 'แก้ไขการขาย'
                : 'สร้างการขาย'}
            </h1>
            <p className="text-sm text-gray-700 mt-1">
              {isEditing
                ? 'แก้ไขยอดเงิน วันที่รับรถ และรายละเอียดการขายได้ที่นี่'
                : 'ขายตรง = เลือกรถจากสต็อกเลย • จองรถ = เลือกรุ่น/สี แล้วผูกเลข VIN ภายหลัง'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sale Type (fixed after create) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(
              [
                ['DIRECT_SALE', 'ขายตรง (Direct Sale)', 'เลือกรถจาก Stock ที่มีอยู่ → รับเงิน → ส่งมอบรถ'],
                [
                  'RESERVATION_SALE',
                  'จองรถ (ยังไม่ผูก VIN)',
                  'เลือกรุ่น + สี → รับเงินจอง → ผูก VIN เมื่อรถมาถึง',
                ],
              ] as const
            ).map(([type, title, hint]) => {
              const active = saleType === type;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={isEditing}
                  aria-pressed={active}
                  onClick={() => {
                    setSaleType(type);
                    setErrors({});
                  }}
                  className={`text-left rounded-lg border p-4 transition-colors ${
                    active
                      ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  } ${isEditing && !active ? 'hidden' : ''} disabled:cursor-default`}
                >
                  <div className="flex items-center gap-2">
                    <Car className={`h-5 w-5 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                    <span className={`font-medium ${active ? 'text-blue-800' : 'text-gray-800'}`}>
                      {title}
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${active ? 'text-blue-600' : 'text-gray-600'}`}>
                    {hint}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Customer Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
              <User className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลลูกค้า
            </h2>
            
            <AsyncSearchSelect<Customer>
              value={formData.customerId}
              onChange={handleCustomerSelect}
              loadOptions={loadCustomerOptions}
              label="ค้นหาลูกค้า"
              required
              placeholder="พิมพ์ชื่อ, รหัส หรือเบอร์โทรลูกค้า..."
              error={errors.customerId}
              emptyMessage="ไม่พบลูกค้า"
              minSearchLength={2}
              disabled={isCompletedAsAccountant}
            />

            {/* Selected Customer Info */}
            {selectedCustomer && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{selectedCustomer.name}</p>
                    <p className="text-sm text-gray-700">{selectedCustomer.code}</p>
                    <p className="text-sm text-gray-700">{selectedCustomer.phone}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Vehicle Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
              <Car className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลรถยนต์
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Booking: model + color now, VIN later (from the sale detail page) */}
              {saleType === 'RESERVATION_SALE' && !formData.stockId && (
                <>
                  <SearchSelect<VehicleModel>
                    value={formData.vehicleModelId}
                    onChange={handleModelSelect}
                    options={modelOptions}
                    label="รุ่นรถที่จอง"
                    required
                    placeholder="ค้นหารุ่นรถ..."
                    error={errors.vehicleModelId}
                    emptyMessage="ไม่พบรุ่นรถ"
                    disabled={isCompletedAsAccountant}
                  />
                  <SearchSelect<string>
                    value={formData.preferredExtColor}
                    onChange={(value) =>
                      setFormData((prev) => ({ ...prev, preferredExtColor: value }))
                    }
                    options={colorOptions.map((c) => ({ value: c, label: c }))}
                    label="สีภายนอกที่จอง"
                    required
                    placeholder="เลือกสี..."
                    error={errors.preferredExtColor}
                    emptyMessage="ไม่พบสี"
                    disabled={isCompletedAsAccountant}
                  />
                  <p className="md:col-span-2 text-xs text-gray-500 -mt-2">
                    ไม่ต้องเลือกเลข VIN — การจองนี้จะนับใน "ยอดจองคงเหลือ" ของรายงานสต็อกประจำวัน
                    จนกว่าจะผูก VIN ที่หน้ารายละเอียดการขาย
                  </p>
                </>
              )}

              {/* Stock: required for direct sale; booking assigns it later */}
              <div className={`md:col-span-2 ${saleType === 'RESERVATION_SALE' && !isEditing ? 'hidden' : ''}`}>
                <SearchSelect<Stock>
                  value={formData.stockId}
                  onChange={handleStockSelect}
                  options={stockOptions}
                  filterFn={filterStockOption}
                  onDisabledSelect={() => demoBlockReason && addToast(demoBlockReason, 'warning')}
                  label={
                    saleType === 'RESERVATION_SALE'
                      ? 'เลือก / เปลี่ยน Stock (รถในสต็อก)'
                      : 'เลือก Stock (รถที่มีในสต็อก)'
                  }
                  required={saleType === 'DIRECT_SALE'}
                  placeholder="ค้นหาด้วยรุ่น, สี หรือเลข VIN"
                  error={errors.stockId}
                  emptyMessage="ไม่พบ Stock ที่ตรงกับการค้นหา"
                  disabled={isCompletedAsAccountant}
                />
                {saleType === 'RESERVATION_SALE' && (
                  <p className="text-xs text-gray-500 mt-1">
                    เปลี่ยนคันได้ — ระบบจะคืนรถเดิมเข้าสต็อกและจองคันใหม่ให้อัตโนมัติ
                    (หลังส่งมอบ/เสร็จสิ้นแล้วเปลี่ยนไม่ได้)
                  </p>
                )}
                {availableStocks.length === 0 && !selectedStock && (
                  <p className="text-yellow-600 text-sm mt-1">ไม่มี Stock ที่พร้อมขาย กรุณาเพิ่ม Stock ก่อน</p>
                )}
              </div>
            </div>

            {/* Selected Stock Info */}
            {selectedStock && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="font-medium text-blue-800">
                  {selectedStock.vehicleModel.brand} {selectedStock.vehicleModel.model}
                  {selectedStock.vehicleModel.variant && ` ${selectedStock.vehicleModel.variant}`}
                </p>
                <p className="text-sm text-blue-600">VIN: {selectedStock.vin}</p>
                <p className="text-sm text-blue-600">
                  สี: {selectedStock.exteriorColor}
                  {selectedStock.interiorColor && ` / ${selectedStock.interiorColor}`}
                </p>
              </div>
            )}
          </div>

          {/* Financial Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
              <DollarSign className="h-5 w-5 mr-2 text-blue-600" />
              ข้อมูลการเงิน
            </h2>

            <FinanceSheet
              paymentMode={formData.paymentMode}
              carPrice={carPrice}
              value={formData}
              canEditDiscounts={canDiscount}
              canEditDealerFields={canDiscount}
              onChange={(patch) =>
                setFormData((prev) => ({
                  ...prev,
                  ...patch,
                  totalAmount: Number(patch.totalAmount ?? prev.totalAmount) || 0,
                  depositAmount: Number(patch.depositAmount ?? prev.depositAmount) || 0,
                  downPayment: Number(patch.downPayment ?? prev.downPayment) || 0,
                  financeAmount: Number(patch.financeAmount ?? prev.financeAmount) || 0,
                  financeProvider: patch.financeProvider ?? prev.financeProvider ?? '',
                  carDiscount: Number(patch.carDiscount ?? prev.carDiscount) || 0,
                  downPaymentDiscount:
                    Number(patch.downPaymentDiscount ?? prev.downPaymentDiscount) || 0,
                  insuranceFee: Number(patch.insuranceFee ?? prev.insuranceFee) || 0,
                  compulsoryInsuranceFee:
                    Number(patch.compulsoryInsuranceFee ?? prev.compulsoryInsuranceFee) || 0,
                  registrationFee: Number(patch.registrationFee ?? prev.registrationFee) || 0,
                  salesCommission: Number(patch.salesCommission ?? prev.salesCommission) || 0,
                  salesExpense: Number(patch.salesExpense ?? prev.salesExpense) || 0,
                  financeCommission: Number(patch.financeCommission ?? prev.financeCommission) || 0,
                  interestRate: Number(patch.interestRate ?? prev.interestRate) || 0,
                  numberOfTerms: Number(patch.numberOfTerms ?? prev.numberOfTerms) || 0,
                  monthlyInstallment:
                    Number(patch.monthlyInstallment ?? prev.monthlyInstallment) || 0,
                  paymentMode: patch.paymentMode ?? prev.paymentMode,
                  financeEditedKeys: patch.financeEditedKeys ?? prev.financeEditedKeys,
                  customLines: patch.customLines ?? prev.customLines,
                }))
              }
            />

            {errors.totalAmount && (
              <p className="text-red-500 text-sm mt-2">{errors.totalAmount}</p>
            )}
            {errors.depositAmount && (
              <p className="text-red-500 text-sm mt-2">{errors.depositAmount}</p>
            )}
            {errors.financeProvider && (
              <p className="text-red-500 text-sm mt-2">{errors.financeProvider}</p>
            )}
          </div>

          {/* Dates + creator */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
                <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                วันที่สำคัญ
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    วันที่สร้างรายการ <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    value={formData.createdAt}
                    onChange={(v) => setFormData((prev) => ({ ...prev, createdAt: v }))}
                    inputClassName="w-full"
                  />
                  {errors.createdAt && (
                    <p className="text-sm text-red-600 mt-1">{errors.createdAt}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    แสดงในรายการขายและรายงาน — เลือกวันย้อนหลังได้ถ้าคีย์ช้ากว่าวันขายจริง
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    วันที่ลูกค้ารับรถ
                  </label>
                  <DatePicker
                    value={formData.deliveryDate}
                    onChange={(v) => setFormData((prev) => ({ ...prev, deliveryDate: v }))}
                    inputClassName="w-full"
                    clearable
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    สำหรับใบปล่อยรถและหนังสือยืนยันการซื้อ-ขาย — ถ้าไม่กรอกจะใช้วันที่คีย์ข้อมูล
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center text-black">
                <User className="h-5 w-5 mr-2 text-blue-600" />
                ผู้สร้างการขายนี้
              </h2>
              {creatorPerson ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm text-gray-700">ชื่อ</dt>
                    <dd className="text-sm font-medium text-black">
                      {[creatorPerson.firstName, creatorPerson.lastName].filter(Boolean).join(' ') ||
                        '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-700">ชื่อผู้ใช้</dt>
                    <dd className="text-sm font-medium text-black">{creatorPerson.username}</dd>
                  </div>
                  {!isEditing && (
                    <p className="text-xs text-gray-500">บันทึกเป็นผู้สร้างเมื่อบันทึกรายการ</p>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-gray-500">ไม่ระบุผู้สร้าง</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 text-black">หมายเหตุ</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-black mb-1">รายการของแถม</label>
              <textarea
                value={formData.freebiesSnapshot}
                onChange={(e) => setFormData(prev => ({ ...prev, freebiesSnapshot: e.target.value }))}
                rows={4}
                placeholder={'พิมพ์ของแถมบรรทัดละ 1 รายการ เช่น\nฟิล์มกรองแสง\nพรมปูพื้น'}
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
              <p className="text-xs text-gray-500 mt-1">แสดงในใบบันทึกการขาย (บรรทัดละ 1 รายการ)</p>
            </div>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              placeholder="หมายเหตุเพิ่มเติม..."
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/sales')}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'กำลังบันทึก...' : isEditing ? 'บันทึกการแก้ไข' : 'สร้างการขาย'}
            </button>
          </div>
        </form>
      </div>

      {/* Price Source Selection Modal */}
      {pendingStock && pendingStock.vehicleModel && (
        <PriceSourceModal
          open={priceModalOpen}
          onClose={() => {
            setPriceModalOpen(false);
            setPendingStock(null);
          }}
          vehicleModel={{
            brand: pendingStock.vehicleModel.brand,
            model: pendingStock.vehicleModel.model,
            variant: pendingStock.vehicleModel.variant,
            year: pendingStock.vehicleModel.year,
            price: Number(pendingStock.vehicleModel.price),
          }}
          stock={{
            exteriorColor: pendingStock.exteriorColor,
            vin: pendingStock.vin,
            expectedSalePrice: pendingStock.expectedSalePrice,
          }}
          onSelect={handlePriceSourceSelect}
        />
      )}
    </MainLayout>
  );
}
