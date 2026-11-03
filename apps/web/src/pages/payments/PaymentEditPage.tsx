import { ArrowLeft, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { SearchSelect, type SearchSelectOption } from '../../components/ui/search-select';
import { useErrorHandler, useMutationHandler } from '../../hooks/useErrorHandler';
import { paymentService } from '../../services/payment.service';
import type { Payment, PaymentMethod, PaymentType } from '../../services/payment.service';
import { DatePicker } from '../../components/ui/date-picker';
import { userService, type User } from '../../services/user.service';
import { bankAccountsService, type BankAccount } from '../../services/bank-accounts.service';

const PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'DEPOSIT', label: 'เงินจอง' },
  { value: 'DOWN_PAYMENT', label: 'เงินดาวน์' },
  { value: 'FINANCE_PAYMENT', label: 'ยอดไฟแนนซ์' },
  { value: 'OTHER_EXPENSE', label: 'ค่าใช้จ่ายอื่น' },
  { value: 'MISCELLANEOUS', label: 'รายการทั่วไป' },
];

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'BANK_TRANSFER', label: 'โอนเงิน' },
  { value: 'CHEQUE', label: 'เช็ค' },
  { value: 'CREDIT_CARD', label: 'บัตรเครดิต' },
];

interface FormData {
  description: string;
  paymentDate: string;
  paymentType: PaymentType;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  notes: string;
  issuedBy: string;
  receivingBankAccountId: string;
  receivingBank: string;
  receivingBankName: string;
  receivingAccountNumber: string;
  receivingBranch: string;
  withholdingTaxAmount: number;
}

/** Match saved payment snapshot to a bank-account master row (by account number, then name). */
function resolveBankAccountId(
  accounts: BankAccount[],
  payment: Payment
): string {
  const accountNumber = payment.receivingAccountNumber?.trim();
  if (accountNumber) {
    const byNumber = accounts.find((a) => a.accountNumber === accountNumber);
    if (byNumber) return byNumber.id;
  }
  const bankName =
    payment.receivingBankName?.trim() || payment.receivingBank?.trim() || '';
  if (bankName) {
    const byName = accounts.find((a) => a.bankName === bankName);
    if (byName) return byName.id;
  }
  return '';
}

export default function PaymentEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { execute: executeQuery } = useErrorHandler({ showToast: true });
  const { execute: executeSave } = useMutationHandler('บันทึกการแก้ไขสำเร็จ');

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffOptions, setStaffOptions] = useState<SearchSelectOption[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [formData, setFormData] = useState<FormData>({
    description: '',
    paymentDate: '',
    paymentType: 'DEPOSIT',
    amount: 0,
    paymentMethod: 'CASH',
    referenceNumber: '',
    notes: '',
    issuedBy: '',
    receivingBankAccountId: '',
    receivingBank: '',
    receivingBankName: '',
    receivingAccountNumber: '',
    receivingBranch: '',
    withholdingTaxAmount: 0,
  });

  useEffect(() => {
    if (id) fetchPayment(id);
    fetchStaff();
    fetchBankAccounts();
  }, [id]);

  const fetchStaff = async () => {
    try {
      const response = await userService.getAll({ limit: 100 });
      const options = response.data
        .filter((u: User) => u.status === 'ACTIVE')
        .map((u: User) => {
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
          return {
            value: fullName,
            label: fullName,
            description: u.role,
          };
        });
      setStaffOptions(options);
    } catch {
      // fallback: leave empty, user can still type
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const res = await bankAccountsService.list();
      if (res.success && res.data) {
        setBankAccounts(res.data.filter((a) => a.isActive));
      }
    } catch {
      // leave empty — UI will show empty-state message
    }
  };

  const fetchPayment = async (paymentId: string) => {
    setLoading(true);
    const result = await executeQuery(paymentService.getById(paymentId));
    if (result) {
      setPayment(result);
      setFormData((prev) => ({
        ...prev,
        description: result.description || '',
        paymentDate: result.paymentDate ? result.paymentDate.split('T')[0] : '',
        paymentType: result.paymentType,
        amount: result.amount,
        paymentMethod: result.paymentMethod,
        referenceNumber: result.referenceNumber || '',
        notes: result.notes || '',
        issuedBy: result.issuedBy || '',
        receivingBank: result.receivingBank || result.receivingBankName || '',
        receivingBankName: result.receivingBankName || result.receivingBank || '',
        receivingAccountNumber: result.receivingAccountNumber || '',
        receivingBranch: result.receivingBranch || '',
        withholdingTaxAmount: Number(result.withholdingTaxAmount ?? 0),
        // account id resolved after bank list loads (see effect below)
        receivingBankAccountId: prev.receivingBankAccountId,
      }));
    } else {
      navigate('/payments');
    }
    setLoading(false);
  };

  // Once both payment and bank accounts are loaded, pre-select matching account
  useEffect(() => {
    if (!payment || bankAccounts.length === 0) return;
    setFormData((prev) => {
      if (prev.receivingBankAccountId) return prev;
      const matchedId = resolveBankAccountId(bankAccounts, payment);
      if (!matchedId) return prev;
      const acc = bankAccounts.find((a) => a.id === matchedId);
      return {
        ...prev,
        receivingBankAccountId: matchedId,
        receivingBank: acc?.bankName || prev.receivingBank,
        receivingBankName: acc?.bankName || prev.receivingBankName,
        receivingAccountNumber: acc?.accountNumber || prev.receivingAccountNumber,
        receivingBranch: acc?.branch || prev.receivingBranch,
      };
    });
  }, [payment, bankAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setSaving(true);
    const result = await executeSave(
      paymentService.update(id, {
        description: formData.description,
        paymentDate: formData.paymentDate,
        paymentType: formData.paymentType,
        amount: Number(formData.amount),
        paymentMethod: formData.paymentMethod,
        referenceNumber: formData.referenceNumber,
        notes: formData.notes,
        issuedBy: formData.issuedBy,
        receivingBank: formData.receivingBankName || formData.receivingBank || undefined,
        receivingBankName: formData.receivingBankName || undefined,
        receivingAccountNumber: formData.receivingAccountNumber || undefined,
        receivingBranch: formData.receivingBranch || undefined,
        withholdingTaxAmount: formData.withholdingTaxAmount || null,
      })
    );
    if (result) {
      navigate(`/payments/${id}`);
    }
    setSaving(false);
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  if (!payment) return null;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(`/payments/${id}`)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">แก้ไขใบเสร็จ</h1>
            <p className="text-gray-500">{payment.receiptNumber}</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-sm border p-6 space-y-5"
        >
          <div>
            <label className={labelClass}>รายการ</label>
            <input
              type="text"
              className={inputClass}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="รายละเอียดการชำระเงิน"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>วันที่ชำระ</label>
              <DatePicker
                value={formData.paymentDate}
                onChange={(v) => setFormData((prev) => ({ ...prev, paymentDate: v }))}
                inputClassName="w-full"
              />
            </div>
            <div>
              <label className={labelClass}>จำนวนเงิน (บาท)</label>
              <input
                type="number"
                className={inputClass}
                value={formData.amount || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    amount: Number.parseFloat(e.target.value) || 0,
                  }))
                }
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label htmlFor="withholdingTaxAmount" className={labelClass}>
                ลูกค้าหัก ณ ที่จ่าย (บาท)
              </label>
              <input
                id="withholdingTaxAmount"
                type="number"
                className={inputClass}
                value={formData.withholdingTaxAmount || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    withholdingTaxAmount: Number.parseFloat(e.target.value) || 0,
                  }))
                }
                min="0"
                step="0.01"
                placeholder="ไม่มีให้เว้นว่าง"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>ประเภท</label>
              <select
                className={inputClass}
                value={formData.paymentType}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, paymentType: e.target.value as PaymentType }))
                }
              >
                {PAYMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>วิธีชำระ</label>
              <select
                className={inputClass}
                value={formData.paymentMethod}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    paymentMethod: e.target.value as PaymentMethod,
                  }))
                }
              >
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>เลขที่อ้างอิง</label>
            <input
              type="text"
              className={inputClass}
              value={formData.referenceNumber}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, referenceNumber: e.target.value }))
              }
              placeholder="เลขที่เช็ค, เลขอ้างอิงโอนเงิน"
            />
          </div>

          {/* Receiving Bank — same UX as create payment form */}
          <div>
            <label className={labelClass}>ธนาคารที่รับเงิน</label>
            {bankAccounts.length === 0 ? (
              <p className="text-xs text-gray-500 mt-1">
                ยังไม่มีบัญชีธนาคาร — เพิ่มได้ที่ ตั้งค่า &rarr; บัญชีธนาคาร
              </p>
            ) : formData.paymentMethod === 'BANK_TRANSFER' ? (
              <>
                <select
                  value={formData.receivingBankAccountId || ''}
                  onChange={(e) => {
                    const accountId = e.target.value;
                    const acc = bankAccounts.find((a) => a.id === accountId);
                    setFormData((prev) => ({
                      ...prev,
                      receivingBankAccountId: accountId,
                      receivingBank: acc?.bankName || '',
                      receivingBankName: acc?.bankName || '',
                      receivingAccountNumber: acc?.accountNumber || '',
                      receivingBranch: acc?.branch || '',
                    }));
                  }}
                  className={inputClass}
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
                {!formData.receivingBankAccountId &&
                  (formData.receivingBankName || formData.receivingAccountNumber) && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                      <div className="font-medium text-amber-900">
                        ข้อมูลธนาคารที่บันทึกไว้ (บัญชีอาจถูกปิด/ลบแล้ว)
                      </div>
                      <div className="text-amber-800 mt-1">
                        {formData.receivingBankName || formData.receivingBank}
                        {formData.receivingAccountNumber
                          ? ` | ${formData.receivingAccountNumber}`
                          : ''}
                        {formData.receivingBranch ? ` | ${formData.receivingBranch}` : ''}
                      </div>
                    </div>
                  )}
              </>
            ) : (
              <div className="space-y-2">
                {(formData.receivingBankName || formData.receivingAccountNumber) && (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                    <div className="font-medium text-gray-900">
                      {formData.receivingBankName || formData.receivingBank || '-'}
                    </div>
                    {formData.receivingAccountNumber && (
                      <div className="text-gray-700 mt-1">
                        <span className="text-gray-500">เลขที่บัญชี: </span>
                        <span className="font-mono font-semibold">
                          {formData.receivingAccountNumber}
                        </span>
                      </div>
                    )}
                    {formData.receivingBranch && (
                      <div className="text-gray-500 text-xs mt-0.5">
                        สาขา: {formData.receivingBranch}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  เลือกวิธีชำระ &quot;โอนเงิน&quot; เพื่อระบุหรือเปลี่ยนบัญชีที่ใช้รับเงิน
                </p>
              </div>
            )}
          </div>

          <SearchSelect
            label="ออกโดย"
            value={formData.issuedBy}
            onChange={(value) => setFormData((prev) => ({ ...prev, issuedBy: value }))}
            options={staffOptions}
            placeholder="เลือกพนักงาน..."
            clearable
          />

          <div>
            <label className={labelClass}>หมายเหตุ</label>
            <textarea
              className={inputClass}
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => navigate(`/payments/${id}`)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
