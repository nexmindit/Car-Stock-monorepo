/**
 * PDF Helper Functions
 * Thai date formatting, currency formatting, and utility functions
 */

// Thai month names
const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const THAI_MONTH_ABBR = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// Thai number words
const THAI_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_DIGIT_NAMES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

/**
 * Format date to Thai Buddhist calendar format
 * @param date - Date object or date string
 * @param format - 'full' | 'short' | 'numeric'
 * @returns Formatted Thai date string
 */
export function formatThaiDate(
  date: Date | string | null | undefined,
  format: 'full' | 'short' | 'numeric' = 'full'
): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  const day = d.getDate();
  const month = d.getMonth();
  const buddhistYear = d.getFullYear() + 543;

  switch (format) {
    case 'full':
      return `${day} ${THAI_MONTHS[month]} ${buddhistYear}`;
    case 'short':
      return `${day} ${THAI_MONTH_ABBR[month]} ${buddhistYear}`;
    case 'numeric':
      return `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${buddhistYear}`;
    default:
      return `${day} ${THAI_MONTHS[month]} ${buddhistYear}`;
  }
}

/**
 * Format date with day name in Thai
 * @param date - Date object or date string
 * @returns Formatted Thai date with day name
 */
export function formatThaiDateWithDay(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  const dayName = THAI_DAYS[d.getDay()];
  const day = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const buddhistYear = d.getFullYear() + 543;

  return `วัน${dayName}ที่ ${day} ${month} ${buddhistYear}`;
}

/**
 * Format number as Thai currency
 * @param amount - Number to format
 * @param showCurrency - Whether to show "บาท" suffix
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number | string, showCurrency: boolean = true): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '-';

  const formatted = num.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return showCurrency ? `${formatted} บาท` : formatted;
}

/**
 * Format a number as whole baht — no decimals, no currency suffix. For dense
 * tables (e.g. the sales summary report) where "1,234,567.00 บาท" would wrap to
 * multiple lines. The "บาท" unit is shown once in the report header instead.
 */
export function formatInt(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '-';
  return num.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

/**
 * Convert number to Thai words
 * @param num - Number to convert (supports up to 9,999,999.99)
 * @returns Thai text representation
 */
export function numberToThaiText(num: number | string): string {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '';
  if (n === 0) return 'ศูนย์บาทถ้วน';

  // Split integer and decimal parts
  const [intPart, decPart] = n.toFixed(2).split('.');
  const intNum = parseInt(intPart, 10);
  const decNum = parseInt(decPart, 10);

  let result = '';

  // Convert integer part
  if (intNum > 0) {
    result = convertIntegerToThai(intNum) + 'บาท';
  }

  // Convert decimal part
  if (decNum > 0) {
    result += convertIntegerToThai(decNum) + 'สตางค์';
  } else {
    result += 'ถ้วน';
  }

  return result;
}

/**
 * Helper function to convert integer to Thai words
 */
function convertIntegerToThai(num: number): string {
  if (num === 0) return '';
  if (num > 9999999) {
    // Handle numbers larger than 9,999,999
    const millions = Math.floor(num / 1000000);
    const remainder = num % 1000000;
    return convertIntegerToThai(millions) + 'ล้าน' + convertIntegerToThai(remainder);
  }

  let result = '';
  const numStr = num.toString();
  const len = numStr.length;

  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr[i], 10);
    const position = len - i - 1;

    if (digit === 0) continue;

    // Special cases for Thai number system
    if (position === 0) {
      // Units position
      if (digit === 1 && len > 1) {
        result += 'เอ็ด';
      } else {
        result += THAI_DIGITS[digit];
      }
    } else if (position === 1) {
      // Tens position
      if (digit === 1) {
        result += 'สิบ';
      } else if (digit === 2) {
        result += 'ยี่สิบ';
      } else {
        result += THAI_DIGITS[digit] + 'สิบ';
      }
    } else {
      result += THAI_DIGITS[digit] + THAI_DIGIT_NAMES[position];
    }
  }

  return result;
}

/**
 * Format phone number for display
 * @param phone - Phone number string
 * @returns Formatted phone number
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');

  // Format based on length
  if (cleaned.length === 10) {
    // Mobile: 0XX-XXX-XXXX
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 9) {
    // Landline: 0XX-XXX-XXX
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  return phone;
}

/**
 * Format ID card number
 * @param idCard - ID card number string
 * @returns Formatted ID card number (X-XXXX-XXXXX-XX-X)
 */
export function formatIdCard(idCard: string | null | undefined): string {
  if (!idCard) return '';
  const cleaned = idCard.replace(/\D/g, '');
  if (cleaned.length !== 13) return idCard;

  return `${cleaned[0]}-${cleaned.slice(1, 5)}-${cleaned.slice(5, 10)}-${cleaned.slice(10, 12)}-${cleaned[12]}`;
}

/**
 * Generate current Thai date string
 * @returns Current date in Thai format
 */
export function getCurrentThaiDate(): string {
  return formatThaiDate(new Date(), 'full');
}

/**
 * Date in the top-right of the thank-you letter (หนังสือขอบคุณ).
 * Prefer วันที่ลูกค้ารับรถ (sale.deliveryDate); fall back to วันที่สร้างรายการ
 * (sale.createdAt). Never use the print day — CARSTOCK01-20.
 */
export function resolveThankYouLetterDate(
  deliveryDate: Date | string | null | undefined,
  createdAt: Date | string | null | undefined,
): string {
  return formatThaiDate(deliveryDate || createdAt, 'full');
}

/**
 * Calculate age from birthdate
 * @param birthdate - Birthdate
 * @returns Age in years
 */
export function calculateAge(birthdate: Date | string): number {
  const birth = typeof birthdate === 'string' ? new Date(birthdate) : birthdate;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Pad number with leading zeros
 * @param num - Number to pad
 * @param length - Desired length
 * @returns Padded string
 */
export function padNumber(num: number, length: number = 4): string {
  return num.toString().padStart(length, '0');
}

/**
 * Safe string getter - returns empty string if null/undefined
 */
export function safeString(value: string | null | undefined, defaultValue: string = '-'): string {
  return value || defaultValue;
}

/**
 * Engine slot on the vehicle card. EV/hybrid stock often has no engine number;
 * print the motor number in that box instead of "-".
 */
export function vehicleCardEngineNo(stock: {
  engineNumber?: string | null;
  motorNumber1?: string | null;
  motorNumber2?: string | null;
}): string {
  const filled = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : '';
  };
  return (
    filled(stock.engineNumber) || filled(stock.motorNumber1) || filled(stock.motorNumber2) || '-'
  );
}

/**
 * Format percentage
 */
export function formatPercentage(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return `${num.toFixed(2)}%`;
}
