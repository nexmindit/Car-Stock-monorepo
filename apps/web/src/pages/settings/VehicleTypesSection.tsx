import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useQueryClient } from '@tanstack/react-query';
import { Car, Plus, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../components/toast';
import { useMutationHandler } from '../../hooks/useErrorHandler';
import { VEHICLE_TYPES_QUERY_KEY, useVehicleTypes } from '../../hooks/useVehicleTypes';
import { type VehicleTypeItem, vehicleTypeService } from '../../services/vehicleType.service';

interface Draft {
  code: string;
  nameTh: string;
  sortOrder: number;
  isActive: boolean;
}

const CODE_PATTERN = /^[A-Z0-9_]{1,30}$/;

/** ประเภทรถ (vehicle_types) — add / rename / reorder / deactivate / delete unused. */
export default function VehicleTypesSection() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { allTypes, isLoading } = useVehicleTypes();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);

  const { execute: executeCreate } = useMutationHandler('เพิ่มประเภทรถสำเร็จ');
  const { execute: executeUpdate } = useMutationHandler('แก้ไขประเภทรถสำเร็จ');
  const { execute: executeDelete } = useMutationHandler('ลบประเภทรถสำเร็จ');

  const refresh = () => queryClient.invalidateQueries({ queryKey: VEHICLE_TYPES_QUERY_KEY });

  const handleStartAdd = () => {
    const maxOrder = allTypes.reduce((m, t) => Math.max(m, t.sortOrder), 0);
    setEditingCode(null);
    setDraft({ code: '', nameTh: '', sortOrder: maxOrder + 10, isActive: true });
  };

  const handleStartEdit = (t: VehicleTypeItem) => {
    setEditingCode(t.code);
    setDraft({ code: t.code, nameTh: t.nameTh, sortOrder: t.sortOrder, isActive: t.isActive });
  };

  const handleCancel = () => {
    setDraft(null);
    setEditingCode(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    const nameTh = draft.nameTh.trim();
    if (!nameTh) {
      addToast('กรุณาระบุชื่อประเภทรถ', 'error');
      return;
    }
    let result: unknown;
    if (editingCode) {
      result = await executeUpdate(
        vehicleTypeService.update(editingCode, {
          nameTh,
          sortOrder: draft.sortOrder,
          isActive: draft.isActive,
        })
      );
    } else {
      const code = draft.code.trim().toUpperCase();
      if (!CODE_PATTERN.test(code)) {
        addToast('รหัสต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือ _ ไม่เกิน 30 ตัว', 'error');
        return;
      }
      result = await executeCreate(
        vehicleTypeService.create({
          code,
          nameTh,
          sortOrder: draft.sortOrder,
          isActive: draft.isActive,
        })
      );
    }
    if (result) {
      handleCancel();
      refresh();
    }
  };

  const handleDelete = async (t: VehicleTypeItem) => {
    if (!window.confirm(`ลบประเภทรถ "${t.nameTh}"?`)) return;
    const result = await executeDelete(vehicleTypeService.remove(t.code));
    if (result) refresh();
  };

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Car className="w-5 h-5" />
          ประเภทรถ (Vehicle Types)
        </h2>
        {!draft && (
          <button
            type="button"
            onClick={handleStartAdd}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            เพิ่มประเภทรถ
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500">
        ประเภทที่เปิดใช้งานจะให้เลือกในหน้ารุ่นรถและตัวกรองรายงาน — ประเภทที่มีรุ่นรถใช้อยู่ลบไม่ได้ ให้ปิดใช้งานแทน
      </p>

      {draft && (
        <VehicleTypeForm
          draft={draft}
          isEdit={!!editingCode}
          onChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {isLoading ? (
        <div className="text-sm text-gray-500">กำลังโหลด...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ</TableHead>
              <TableHead>รหัส</TableHead>
              <TableHead className="text-right">ลำดับ</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allTypes.map((t) => (
              <TableRow key={t.code} className={t.isActive ? '' : 'bg-gray-50 opacity-70'}>
                <TableCell className="font-medium text-gray-900">{t.nameTh}</TableCell>
                <TableCell className="font-mono text-sm text-gray-600">{t.code}</TableCell>
                <TableCell className="text-right">{t.sortOrder}</TableCell>
                <TableCell>
                  {t.isActive ? (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                      เปิดใช้งาน
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
                      ปิดใช้งาน
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(t)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="px-2 py-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label={`ลบ ${t.nameTh}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

interface VehicleTypeFormProps {
  draft: Draft;
  isEdit: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
}

function VehicleTypeForm({ draft, isEdit, onChange, onSave, onCancel }: VehicleTypeFormProps) {
  const fieldClass =
    'w-full rounded-lg border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-sm';
  return (
    <div className="p-4 border border-blue-300 bg-blue-50/40 rounded-lg space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label htmlFor="vt-name" className="block text-xs font-medium text-gray-700 mb-1">
            ชื่อ *
          </label>
          <input
            id="vt-name"
            type="text"
            value={draft.nameTh}
            onChange={(e) => onChange({ nameTh: e.target.value })}
            placeholder="มอเตอร์ไซค์"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="vt-code" className="block text-xs font-medium text-gray-700 mb-1">
            รหัส * {isEdit && <span className="text-gray-400">(แก้ไม่ได้)</span>}
          </label>
          <input
            id="vt-code"
            type="text"
            value={draft.code}
            disabled={isEdit}
            onChange={(e) => onChange({ code: e.target.value.toUpperCase() })}
            placeholder="MOTORCYCLE"
            className={`${fieldClass} font-mono disabled:bg-gray-100 disabled:text-gray-500`}
          />
        </div>
        <div>
          <label htmlFor="vt-order" className="block text-xs font-medium text-gray-700 mb-1">
            ลำดับ
          </label>
          <input
            id="vt-order"
            type="number"
            value={draft.sortOrder}
            onChange={(e) => onChange({ sortOrder: Number(e.target.value) || 0 })}
            className={fieldClass}
          />
        </div>
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(e) => onChange({ isActive: e.target.checked })}
          className="rounded"
        />
        เปิดใช้งาน (ให้เลือกได้)
      </label>

      <div className="flex justify-end gap-2 pt-2 border-t border-blue-200">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white"
        >
          <X className="w-4 h-4" />
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Save className="w-4 h-4" />
          บันทึก
        </button>
      </div>
    </div>
  );
}
