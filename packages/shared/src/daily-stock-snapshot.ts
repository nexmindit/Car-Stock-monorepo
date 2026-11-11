/**
 * Rows for one panel of รายงานสต็อกประจำวัน (ยอดจอง / สต๊อก / ต้องสั่งซื้อ),
 * shared by the web table, the Excel export and the PDF so all three print the
 * same totals. Adds a "รวม <family>" row after a model family that has more
 * than one variant (e.g. รวม CHERY Q = QOOL + QUINT) and a "รวมทั้งหมด" row
 * with per-colour totals at the end.
 */
export type SnapshotPanelKind = 'reservations' | 'available' | 'required';

export interface SnapshotPanelModel {
  vehicleModelId: string;
  modelName: string;
  /** brand + model without the variant; rows with the same family get a subtotal. */
  familyName?: string;
  reservationsByColor: Record<string, number>;
  reservationsTotal: number;
  availableByColor: Record<string, number>;
  availableTotal: number;
  requiredByColor: Record<string, number>;
  requiredTotal: number;
}

export interface SnapshotPanelRow {
  type: 'model' | 'subtotal' | 'total';
  key: string;
  label: string;
  cells: number[];
  total: number;
}

const pick = (m: SnapshotPanelModel, kind: SnapshotPanelKind) =>
  kind === 'reservations'
    ? { byColor: m.reservationsByColor, total: m.reservationsTotal }
    : kind === 'available'
      ? { byColor: m.availableByColor, total: m.availableTotal }
      : { byColor: m.requiredByColor, total: m.requiredTotal };

export function snapshotPanelRows(
  models: SnapshotPanelModel[],
  colors: string[],
  kind: SnapshotPanelKind
): SnapshotPanelRow[] {
  const sorted = [...models].sort((a, b) =>
    (a.familyName ?? a.modelName).localeCompare(b.familyName ?? b.modelName) ||
    a.modelName.localeCompare(b.modelName)
  );
  const rows: SnapshotPanelRow[] = [];
  const grand = colors.map(() => 0);
  let grandTotal = 0;

  let i = 0;
  while (i < sorted.length) {
    const family = sorted[i].familyName ?? sorted[i].modelName;
    const group: SnapshotPanelModel[] = [];
    while (i < sorted.length && (sorted[i].familyName ?? sorted[i].modelName) === family) {
      group.push(sorted[i]);
      i++;
    }
    const sub = colors.map(() => 0);
    let subTotal = 0;
    for (const m of group) {
      const { byColor, total } = pick(m, kind);
      const cells = colors.map((c) => byColor[c] || 0);
      cells.forEach((n, ci) => {
        sub[ci] += n;
        grand[ci] += n;
      });
      subTotal += total;
      grandTotal += total;
      rows.push({ type: 'model', key: m.vehicleModelId, label: m.modelName, cells, total });
    }
    if (group.length > 1) {
      rows.push({ type: 'subtotal', key: `sub:${family}`, label: `รวม ${family}`, cells: sub, total: subTotal });
    }
  }

  rows.push({ type: 'total', key: 'total', label: 'รวมทั้งหมด', cells: grand, total: grandTotal });
  return rows;
}
