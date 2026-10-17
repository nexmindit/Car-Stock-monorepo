import { describe, expect, test } from 'bun:test';
import Handlebars from 'handlebars';
import { groupPaymentsByDay } from '../modules/pdf/helpers';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const templatePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../modules/pdf/templates/daily-payment-report.hbs',
);

const source = readFileSync(templatePath, 'utf-8');

function cssBlock(cssSource: string, selector: string): string {
  const re = new RegExp(`${selector.replaceAll('.', '\\.')}\\s*\\{([^}]+)\\}`);
  const match = cssSource.match(re);
  if (!match) throw new Error(`no CSS block for ${selector}`);
  return match[1];
}

function cssDecl(block: string, prop: string): string {
  const match = block.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`no declaration ${prop}`);
  return match[1].trim();
}

describe('daily payment report layout — amount overflow', () => {
  test('amount cells use a smaller font than text cells', () => {
    const text = cssBlock(source, '.daily-payment-table th,\n  .daily-payment-table td');
    const num = cssBlock(source, '.daily-payment-table td.num');
    const textPx = Number.parseFloat(cssDecl(text, 'font-size'));
    const numPx = Number.parseFloat(cssDecl(num, 'font-size'));
    expect(numPx).toBeLessThan(textPx);
    expect(numPx).toBeLessThanOrEqual(7);
  });

  test('amount cells do not wrap mid-number', () => {
    const num = cssBlock(source, '.daily-payment-table td.num');
    expect(cssDecl(num, 'white-space')).toBe('nowrap');
    expect(cssDecl(num, 'word-wrap')).toBe('normal');
    expect(cssDecl(num, 'overflow-wrap')).toBe('normal');
  });

  test('money columns are at least 6% so 203,000.00 fits after the smaller font', () => {
    expect(source).toMatch(/width:\s*7%["']?\s*class="text-right">จำนวนเงิน/);
    expect(source).toMatch(/width:\s*6%["']?\s*class="text-right">ภาษีขาย/);
    expect(source).toMatch(/width:\s*7%["']?\s*class="text-right">รวมทั้งสิ้น/);
    expect(source).toMatch(/width:\s*6%["']?\s*class="text-right">เงินโอน/);
  });

  test('renders large totals inside num cells on both summary rows', () => {
    Handlebars.registerHelper('formatCurrency', (v: number) =>
      Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
    Handlebars.registerHelper('formatThaiDate', (v: string) => v);
    Handlebars.registerHelper('formatThaiDateWithDay', (v: string) => v);
    Handlebars.registerHelper('currentThaiDate', () => '2026-08-18');

    const payments = [
        {
          paymentDate: '2026-08-18',
          receiptNumber: 'RCPT-2608-0039',
          customerName: 'นาย สุทธิชัย จันโทวาท',
          itemDetail: 'ค่ารถ',
          baseAmount: 186915.89,
          vatAmount: 13084.11,
          amount: 200000,
          transferAmount: 200000,
        },
    ];
    const html = Handlebars.compile(source)({
      header: { companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด' },
      dateRange: '18/08/2569 ถึง 18/08/2569',
      payments,
      days: groupPaymentsByDay(payments), // what PdfService passes the template
      summary: {
        totalCount: 2,
        baseAmount: 189719.63,
        vatAmount: 13280.37,
        totalAmount: 203000,
        transferAmount: 203000,
      },
    });

    const numCells = [...html.matchAll(/<td class="num text-right">([^<]*)<\/td>/g)].map(
      (m) => m[1],
    );
    expect(numCells).toContain('200,000.00');
    expect(numCells).toContain('189,719.63');
    expect(numCells).toContain('13,280.37');
    expect(numCells).toContain('203,000.00');
    expect(html).toContain('row-daily-total');
    expect(html).toContain('row-grand-total');
    expect(html.match(/class="num text-right"/g)?.length).toBeGreaterThanOrEqual(30);
  });
});
