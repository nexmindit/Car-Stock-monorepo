import type { ReceiptPrintLayout } from '@car-stock/shared/schemas';
import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { settingsService } from '../../services/settings.service';
import { useToast } from '../toast';

const LIMIT = 50;

const ROWS: {
  label: string;
  hint: string;
  x: keyof ReceiptPrintLayout;
  y: keyof ReceiptPrintLayout;
}[] = [
  {
    label: 'ใบเสร็จ Dot Matrix (พิมพ์ลงฟอร์มสำเร็จรูป)',
    hint: 'ใช้กับปุ่ม "ใบเสร็จ Dot Matrix"',
    x: 'overlayOffsetX',
    y: 'overlayOffsetY',
  },
  {
    label: 'ใบเสร็จ Dot Matrix (มีฟอร์ม) บนกระดาษต่อเนื่องเปล่า',
    hint: 'ใช้กับปุ่ม "ใบเสร็จ Dot Matrix (มีฟอร์ม)"',
    x: 'formOffsetX',
    y: 'formOffsetY',
  },
];

/**
 * Whole-sheet print offset (mm) for the dot-matrix receipt, saved per print
 * style and applied to every receipt. Printers/tractors sit differently, so
 * staff nudge once, print a test, adjust.
 */
export function ReceiptPrintOffsetPanel() {
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<ReceiptPrintLayout | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    if (!open && !layout) {
      try {
        setLayout(await settingsService.getReceiptPrintLayout());
      } catch {
        addToast('โหลดค่าตำแหน่งพิมพ์ไม่สำเร็จ', 'error');
        return;
      }
    }
    setOpen((o) => !o);
  };

  const setValue = (key: keyof ReceiptPrintLayout, raw: string) => {
    const n = Number.parseFloat(raw);
    const v = Number.isFinite(n) ? Math.max(-LIMIT, Math.min(LIMIT, n)) : 0;
    setLayout((prev) => (prev ? { ...prev, [key]: v } : prev));
  };

  const save = async () => {
    if (!layout) return;
    setSaving(true);
    try {
      setLayout(await settingsService.saveReceiptPrintLayout(layout));
      addToast('บันทึกตำแหน่งพิมพ์แล้ว — กดพิมพ์ใบเสร็จเพื่อลองอีกครั้ง', 'success');
    } catch {
      addToast('บันทึกตำแหน่งพิมพ์ไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow mb-6">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-6 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
      >
        <span className="flex items-center">
          <SlidersHorizontal className="h-4 w-4 mr-2 text-gray-500" />
          ปรับตำแหน่งพิมพ์ใบเสร็จ (พิมพ์เหลื่อม / ตกขอบ)
        </span>
        <span className="text-gray-400">{open ? 'ซ่อน' : 'แสดง'}</span>
      </button>
      {open && layout && (
        <div className="px-6 pb-5 space-y-4">
          <p className="text-sm text-gray-600">
            เลื่อนทั้งแผ่น หน่วยมิลลิเมตร — <b>ซ้าย/ขวา</b>: ค่าลบ = เลื่อนไปซ้าย, ค่าบวก = ไปขวา ·{' '}
            <b>ขึ้น/ลง</b>: ค่าลบ = เลื่อนขึ้น, ค่าบวก = ลง (ไม่เกิน ±{LIMIT} มม.) ใช้กับใบเสร็จทุกใบ
          </p>
          {ROWS.map((r) => (
            <div
              key={r.x}
              className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end"
            >
              <div>
                <div className="text-sm font-medium text-gray-800">{r.label}</div>
                <div className="text-xs text-gray-500">{r.hint}</div>
              </div>
              <label className="text-sm text-gray-700">
                ซ้าย/ขวา (มม.)
                <input
                  type="number"
                  step="0.5"
                  min={-LIMIT}
                  max={LIMIT}
                  value={layout[r.x]}
                  onChange={(e) => setValue(r.x, e.target.value)}
                  className="mt-1 block w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-right"
                />
              </label>
              <label className="text-sm text-gray-700">
                ขึ้น/ลง (มม.)
                <input
                  type="number"
                  step="0.5"
                  min={-LIMIT}
                  max={LIMIT}
                  value={layout[r.y]}
                  onChange={(e) => setValue(r.y, e.target.value)}
                  className="mt-1 block w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-right"
                />
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกตำแหน่ง'}
          </button>
        </div>
      )}
    </div>
  );
}
