import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

interface ExportHeader {
  key: string;
  label: string;
}

interface SheetData {
  name: string;
  data: Record<string, unknown>[];
  headers?: ExportHeader[];
}

interface MultiSheetExportProps {
  sheets: SheetData[];
  filename: string;
}

/**
 * Export data to Excel with multiple sheets
 */
export function exportMultiSheet({ sheets, filename }: MultiSheetExportProps) {
  const wb = XLSX.utils.book_new();

  sheets.forEach(({ name, data, headers }) => {
    let exportData = data;

    if (headers && headers.length > 0) {
      exportData = data.map((row) => {
        const newRow: Record<string, unknown> = {};
        headers.forEach(({ key, label }) => {
          newRow[label] = row[key];
        });
        return newRow;
      });
    }

    const ws = XLSX.utils.json_to_sheet(exportData);

    // Auto-width columns
    if (exportData?.length > 0) {
      const colWidths = Object.keys(exportData[0]).map((key) => {
        const maxLength = Math.max(
          key.length,
          ...exportData.map((row) => String(row[key] ?? '').length)
        );
        return { wch: Math.min(maxLength + 2, 50) };
      });
      ws['!cols'] = colWidths;
    }

    // Default every exported sheet to A4 landscape (project convention).
    const wsAny = ws as unknown as {
      '!pageSetup'?: {
        orientation?: string;
        paperSize?: number;
        fitToWidth?: number;
        fitToHeight?: number;
      };
      '!margins'?: {
        left: number;
        right: number;
        top: number;
        bottom: number;
        header: number;
        footer: number;
      };
    };
    wsAny['!pageSetup'] = {
      orientation: 'landscape',
      paperSize: 9,
      fitToWidth: 1,
      fitToHeight: 0,
    };
    wsAny['!margins'] = {
      left: 0.3,
      right: 0.3,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    };

    XLSX.utils.book_append_sheet(wb, ws, name);
  });

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  saveAs(blob, `${filename}_${dateStr}.xlsx`);
}

interface SingleSheetExportProps {
  data: Record<string, unknown>[];
  filename: string;
  sheetName?: string;
  headers?: ExportHeader[];
}

/**
 * Export data to Excel with a single sheet
 */
export function exportToExcel({
  data,
  filename,
  sheetName = 'รายงาน',
  headers,
}: SingleSheetExportProps) {
  exportMultiSheet({
    sheets: [{ name: sheetName, data, headers }],
    filename,
  });
}

/** Excel sheet names: max 31 chars, none of : \ / ? * [ ] */
export function toSheetName(name: string): string {
  return name.replace(/[:\/?*[\]]/g, ' ').slice(0, 31);
}

/**
 * One sheet per vehicle type that actually has rows (e.g. "รายการซื้อแยกเก๋ง"),
 * ordered like `typeOrder` (vehicle_types sortOrder); unknown types go last.
 */
export function sheetsByVehicleType<T>(
  rows: T[],
  {
    getType,
    typeLabel,
    typeOrder,
    prefix,
    toRow,
  }: {
    getType: (row: T) => string | null | undefined;
    typeLabel: (code: string) => string;
    typeOrder: string[];
    prefix: string;
    toRow: (row: T, index: number) => Record<string, unknown>;
  }
): SheetData[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const type = getType(row);
    if (!type) continue;
    const list = groups.get(type) ?? [];
    list.push(row);
    groups.set(type, list);
  }
  const rank = (code: string) => {
    const i = typeOrder.indexOf(code);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([type, list]) => ({
      name: toSheetName(`${prefix}${typeLabel(type)}`),
      data: list.map(toRow),
    }));
}
