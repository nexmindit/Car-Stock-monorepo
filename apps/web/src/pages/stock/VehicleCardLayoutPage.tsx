import {
  VEHICLE_CARD_FIELDS,
  VEHICLE_CARD_FIELD_HEIGHT,
  VEHICLE_CARD_PAPER,
  type VehicleCardFieldKey,
} from '@car-stock/shared/constants';
import {
  DEFAULT_VEHICLE_CARD_LAYOUT,
  VEHICLE_CARD_FONTS,
  type VehicleCardField,
  type VehicleCardLayout,
} from '@car-stock/shared/schemas';
import { ArrowLeft, Printer, RotateCcw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { printHtmlViaPopup } from '../../components/reports/PrintButton';
import { useToast } from '../../components/toast';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { api } from '../../lib/api';
import { settingsService } from '../../services/settings.service';

// The canvas is laid out in CSS mm, the same unit the print template uses,
// so a box drawn here lands at the same spot on paper. Only pointer deltas
// (px) need converting, and zoom is a pure CSS transform on top.
const PX_PER_MM = 96 / 25.4;
const FIELD_KEYS = Object.keys(VEHICLE_CARD_FIELDS) as VehicleCardFieldKey[];
const ZOOMS = [0.75, 1, 1.25, 1.5];
const FONT_LABELS: Record<VehicleCardLayout['fontFamily'], string> = {
  Sarabun: 'Sarabun',
  Kanit: 'Kanit (ฝังใน PDF ทุกเครื่อง)',
  Tahoma: 'Tahoma',
};

const round = (v: number, step: number) => Number((Math.round(v / step) * step).toFixed(2));
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const inputCls = 'mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm';

// Uncontrolled on purpose: clearing the box to retype must not write 0 into
// the layout (blank canvas, rejected save). Commits a clamped value on blur/Enter;
// `key` re-seeds it when the value changes from a drag or arrow key.
function NumInput(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  const { label, value, min, max, onCommit } = props;
  const commit = (el: HTMLInputElement) => {
    const n = Number(el.value);
    if (el.value === '' || Number.isNaN(n)) el.value = String(value);
    else onCommit(clamp(n, min, max));
  };
  return (
    <label className="block text-xs text-gray-600">
      {label}
      <input
        key={value}
        type="number"
        step={0.5}
        min={min}
        max={max}
        defaultValue={value}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className={inputCls}
      />
    </label>
  );
}

export default function VehicleCardLayoutPage() {
  const { id } = useParams();
  const { addToast } = useToast();
  const { execute } = useErrorHandler({ showToast: true });

  const [layout, setLayout] = useState<VehicleCardLayout | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<VehicleCardFieldKey | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    Promise.all([
      settingsService.getVehicleCardLayout(),
      api.get<{ data: { values: Record<string, string> } }>(
        `/api/pdf/vehicle-card/${id}?format=json`
      ),
    ])
      .then(([l, v]) => {
        setLayout(l);
        setValues(v.data.values);
      })
      .catch(() => setLoadError(true));
  }, [id]);

  // Don't lose an unsaved layout to a tab close / refresh, or to any in-app
  // link (sidebar, back button). A capture-phase preventDefault reaches the
  // native event before React Router's <Link> reads defaultPrevented.
  // ponytail: browser Back is not covered — needs a data router + useBlocker.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const guardLinks = (e: MouseEvent) => {
      if (!(e.target as Element).closest('a[href]')) return;
      if (!window.confirm('ยังไม่ได้บันทึกการแก้ไข ออกจากหน้านี้หรือไม่?')) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardLinks, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardLinks, true);
    };
  }, [dirty]);

  const patchField = (key: VehicleCardFieldKey, patch: Partial<VehicleCardField>) => {
    setLayout((l) => {
      if (!l) return l;
      // Drop an undefined fontSize so the saved JSON has no null key.
      const { fontSize, ...rest } = { ...l.fields[key], ...patch };
      const f: VehicleCardField = fontSize === undefined ? rest : { ...rest, fontSize };
      f.x = clamp(f.x, 0, VEHICLE_CARD_PAPER.w - 1);
      f.y = clamp(f.y, 0, VEHICLE_CARD_PAPER.h - VEHICLE_CARD_FIELD_HEIGHT);
      return { ...l, fields: { ...l.fields, [key]: f } };
    });
    setDirty(true);
  };

  const patchLayout = (patch: Partial<Omit<VehicleCardLayout, 'fields'>>) => {
    setLayout((l) => (l ? { ...l, ...patch } : l));
    setDirty(true);
  };

  // Arrow keys nudge the selected box: 1mm, or 0.1mm with Shift for fine alignment.
  // biome-ignore lint/correctness/useExhaustiveDependencies: patchField is stable per render
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        setSelected(null);
        return;
      }
      const step = e.shiftKey ? 0.1 : 1;
      const d: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const delta = d[e.key];
      if (!delta || !layout) return;
      e.preventDefault();
      const f = layout.fields[selected];
      patchField(selected, { x: round(f.x + delta[0], 0.1), y: round(f.y + delta[1], 0.1) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, layout]);

  const startDrag = (key: VehicleCardFieldKey) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!layout) return;
    e.preventDefault();
    setSelected(key);
    const origin = {
      px: e.clientX,
      py: e.clientY,
      x: layout.fields[key].x,
      y: layout.fields[key].y,
    };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const scale = PX_PER_MM * zoom;
    const onMove = (ev: PointerEvent) => {
      patchField(key, {
        x: round(origin.x + (ev.clientX - origin.px) / scale, 0.5),
        y: round(origin.y + (ev.clientY - origin.py) / scale, 0.5),
      });
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const save = async () => {
    if (!layout) return false;
    setSaving(true);
    try {
      const saved = await settingsService.saveVehicleCardLayout(layout);
      setLayout(saved);
      setDirty(false);
      addToast('บันทึกตำแหน่งการ์ดแล้ว', 'success');
      return true;
    } finally {
      setSaving(false);
    }
  };

  // Popup must open synchronously inside the click, before any await.
  const saveAndPrint = () =>
    execute(
      printHtmlViaPopup(async () => {
        if (dirty && !(await save())) throw new Error('บันทึกไม่สำเร็จ');
        return api.getBlob(`/api/pdf/vehicle-card/${id}?format=html`);
      })
    );

  if (loadError) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">โหลดข้อมูลการ์ดไม่สำเร็จ</p>
          <Link
            to={`/stock/${id}`}
            className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            กลับหน้า Stock
          </Link>
        </div>
      </MainLayout>
    );
  }

  if (!layout) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="mt-2 text-gray-600">กำลังโหลด...</p>
        </div>
      </MainLayout>
    );
  }

  const sel = selected ? layout.fields[selected] : null;
  const fontCss = VEHICLE_CARD_FONTS[layout.fontFamily];

  return (
    <MainLayout>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to={`/stock/${id}`}
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            กลับ
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            ปรับตำแหน่งการ์ดรถยนต์
            {dirty && (
              <span className="text-xs font-normal bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                ยังไม่บันทึก
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            ลากกล่องให้ตรงช่องบนฟอร์ม · ลูกศร 1mm · Shift+ลูกศร 0.1mm · Esc ยกเลิกเลือก ·
            ถ้าพิมพ์แล้วเลื่อนทั้งแผ่นเท่ากันให้ใช้ค่าชดเชย
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-gray-500 mr-1">ซูม</span>
          {ZOOMS.map((z) => (
            <button
              type="button"
              key={z}
              onClick={() => setZoom(z)}
              className={`px-2 py-1 rounded border ${
                z === zoom
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {Math.round(z * 100)}%
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Paper canvas — real mm × zoom; scrolls when wider than the screen */}
        <div
          className="overflow-auto bg-gray-200 p-4 rounded-lg flex-1 min-w-0"
          style={{ maxHeight: 'calc(100vh - 200px)' }}
          onPointerDown={() => setSelected(null)}
        >
          <div
            style={{
              width: `calc(${VEHICLE_CARD_PAPER.w}mm * ${zoom})`,
              height: `calc(${VEHICLE_CARD_PAPER.h}mm * ${zoom})`,
            }}
          >
            <div
              className="relative bg-white shadow origin-top-left"
              style={{
                width: `${VEHICLE_CARD_PAPER.w}mm`,
                height: `${VEHICLE_CARD_PAPER.h}mm`,
                transform: `scale(${zoom})`,
                fontFamily: fontCss,
                // cm grid (dark) + 5mm grid (light); a scanned form on top hides it.
                backgroundImage:
                  'repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 .2mm, transparent .2mm 10mm),' +
                  'repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 .2mm, transparent .2mm 10mm),' +
                  'repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 .2mm, transparent .2mm 5mm),' +
                  'repeating-linear-gradient(0deg, rgba(0,0,0,.05) 0 .2mm, transparent .2mm 5mm)',
              }}
            >
              <img
                src="/vehicle-card-bg.jpg"
                alt=""
                draggable={false}
                className="absolute inset-0 w-full h-full select-none pointer-events-none"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              {/* cm ruler labels */}
              {Array.from({ length: VEHICLE_CARD_PAPER.w / 10 }, (_, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: the index is the cm mark
                  key={`x${i}`}
                  className="absolute text-[7px] text-gray-400 pointer-events-none"
                  style={{ left: `${i * 10 + 0.5}mm`, top: 0 }}
                >
                  {i}
                </span>
              ))}
              {Array.from({ length: VEHICLE_CARD_PAPER.h / 10 }, (_, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: the index is the cm mark
                  key={`y${i}`}
                  className="absolute text-[7px] text-gray-400 pointer-events-none"
                  style={{ top: `${i * 10}mm`, left: '0.5mm' }}
                >
                  {i}
                </span>
              ))}

              <div
                className="absolute inset-0"
                style={{
                  transform: `translate(${layout.offsetX}mm, ${layout.offsetY}mm)`,
                  fontSize: `${layout.fontSize}px`,
                }}
              >
                {FIELD_KEYS.map((key) => {
                  const f = layout.fields[key];
                  const isSel = key === selected;
                  return (
                    <div
                      key={key}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startDrag(key)(e);
                      }}
                      title={VEHICLE_CARD_FIELDS[key]}
                      className={`absolute cursor-move select-none whitespace-nowrap overflow-hidden border ${
                        isSel
                          ? 'border-blue-500 bg-blue-50/60 z-10'
                          : 'border-dashed border-gray-400 hover:border-gray-600'
                      }`}
                      style={{
                        top: `${f.y}mm`,
                        left: `${f.x}mm`,
                        width: `${f.w}mm`,
                        height: `${VEHICLE_CARD_FIELD_HEIGHT}mm`,
                        lineHeight: `${VEHICLE_CARD_FIELD_HEIGHT}mm`,
                        textAlign: f.align,
                        fontWeight: f.bold ? 'bold' : 'normal',
                        fontSize: f.fontSize ? `${f.fontSize}px` : undefined,
                        color: values[key] ? '#000' : '#9ca3af',
                      }}
                    >
                      {values[key] || VEHICLE_CARD_FIELDS[key]}
                    </div>
                  );
                })}
                {sel && selected && (
                  <span
                    className="absolute text-[9px] leading-none bg-blue-600 text-white px-1 py-0.5 rounded whitespace-nowrap font-sans pointer-events-none z-20"
                    style={{ left: `${sel.x}mm`, top: `calc(${sel.y}mm - 4mm)` }}
                  >
                    {VEHICLE_CARD_FIELDS[selected]} · {sel.x}, {sel.y}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="w-72 shrink-0 space-y-4">
          <div className="bg-white rounded-lg shadow p-4 space-y-3">
            <h2 className="font-medium text-gray-900">
              {selected ? VEHICLE_CARD_FIELDS[selected] : 'เลือกช่อง'}
            </h2>
            {sel && selected ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {(['x', 'y', 'w'] as const).map((k) => (
                    <NumInput
                      key={k}
                      label={`${k === 'w' ? 'กว้าง' : k.toUpperCase()} (mm)`}
                      value={sel[k]}
                      min={k === 'w' ? 1 : 0}
                      max={k === 'y' ? VEHICLE_CARD_PAPER.h : VEHICLE_CARD_PAPER.w}
                      onCommit={(v) => patchField(selected, { [k]: v })}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-gray-600">
                    จัดข้อความ
                    <select
                      value={sel.align}
                      onChange={(e) =>
                        patchField(selected, { align: e.target.value as VehicleCardField['align'] })
                      }
                      className={inputCls}
                    >
                      <option value="left">ชิดซ้าย</option>
                      <option value="center">กึ่งกลาง</option>
                      <option value="right">ชิดขวา</option>
                    </select>
                  </label>
                  <label className="text-xs text-gray-600">
                    ขนาดตัวอักษร (px)
                    <input
                      type="number"
                      step={0.5}
                      min={5}
                      max={20}
                      placeholder={`ทั้งแผ่น ${layout.fontSize}`}
                      value={sel.fontSize ?? ''}
                      onChange={(e) =>
                        patchField(selected, {
                          fontSize: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      className={inputCls}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={sel.bold}
                    onChange={(e) => patchField(selected, { bold: e.target.checked })}
                  />
                  ตัวหนา
                </label>
              </>
            ) : (
              <ul className="divide-y divide-gray-100 -mx-1">
                {FIELD_KEYS.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setSelected(key)}
                      className="w-full flex justify-between gap-2 px-1 py-1.5 text-sm text-left hover:bg-gray-50 rounded"
                    >
                      <span className="text-gray-700">{VEHICLE_CARD_FIELDS[key]}</span>
                      <span
                        className={`truncate max-w-[9rem] ${values[key] ? 'text-gray-500' : 'text-gray-300 italic'}`}
                      >
                        {values[key] || 'ว่าง'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-4 space-y-3">
            <h2 className="font-medium text-gray-900">ทั้งแผ่น</h2>
            <label className="block text-xs text-gray-600">
              ฟอนต์
              <select
                value={layout.fontFamily}
                onChange={(e) =>
                  patchLayout({ fontFamily: e.target.value as VehicleCardLayout['fontFamily'] })
                }
                className={inputCls}
              >
                {(Object.keys(VEHICLE_CARD_FONTS) as VehicleCardLayout['fontFamily'][]).map((f) => (
                  <option key={f} value={f}>
                    {FONT_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
            <NumInput
              label="ขนาดตัวอักษร (px)"
              value={layout.fontSize}
              min={5}
              max={20}
              onCommit={(v) => patchLayout({ fontSize: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumInput
                label="ชดเชย X (mm)"
                value={layout.offsetX}
                min={-50}
                max={50}
                onCommit={(v) => patchLayout({ offsetX: v })}
              />
              <NumInput
                label="ชดเชย Y (mm)"
                value={layout.offsetY}
                min={-50}
                max={50}
                onCommit={(v) => patchLayout({ offsetY: v })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => execute(save())}
              disabled={saving || !dirty}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'กำลังบันทึก...' : dirty ? 'บันทึก' : 'บันทึกแล้ว'}
            </button>
            <button
              type="button"
              onClick={saveAndPrint}
              disabled={saving}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center"
            >
              <Printer className="w-4 h-4 mr-2" />
              {dirty ? 'บันทึกแล้วพิมพ์ทดสอบ' : 'พิมพ์ทดสอบ'}
            </button>
            <button
              type="button"
              onClick={() => {
                setLayout(DEFAULT_VEHICLE_CARD_LAYOUT);
                setDirty(true);
              }}
              className="w-full px-4 py-2 text-gray-500 rounded-lg hover:bg-gray-100 flex items-center justify-center text-sm"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              คืนค่าเริ่มต้น
            </button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
