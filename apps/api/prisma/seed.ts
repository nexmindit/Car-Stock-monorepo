import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_VEHICLE_TYPES } from '../src/modules/vehicle-types/vehicle-types.helpers';

const db = new PrismaClient();

const THAI_FIRST = [
  'สมชาย', 'สมหญิง', 'วิชัย', 'มาลี', 'ประยุทธ์', 'สุดา', 'อนุชา', 'วราภรณ์',
  'ธนา', 'กมล', 'ปิยะ', 'อรุณี', 'ชาญ', 'รัตนา', 'เกรียง', 'นภา',
  'ศิริ', 'พิมพ์', 'อภิชัย', 'สุภาพร', 'ณัฐ', 'วรรณา', 'ธีรพงษ์', 'จิรา',
];
const THAI_LAST = [
  'ใจดี', 'รักงาน', 'มานะ', 'สุขใจ', 'ตั้งใจ', 'เจริญ', 'วัฒนา', 'พงศ์ทอง',
  'ศรีสุข', 'บุญมี', 'ทองดี', 'แสงทอง', 'วิไล', 'เกษม', 'ชัยชนะ', 'รุ่งเรือง',
  'ประเสริฐ', 'สุขสันต์', 'มีชัย', 'อุดม', 'เจริญสุข', 'ทิพย์', 'ศรีเมือง', 'นวลจันทร์',
];
const PROVINCES = [
  { province: 'นครราชสีมา', district: 'เมือง', subdistrict: 'ในเมือง', postal: '30000' },
  { province: 'กรุงเทพมหานคร', district: 'ห้วยขวาง', subdistrict: 'ห้วยขวาง', postal: '10310' },
  { province: 'ขอนแก่น', district: 'เมือง', subdistrict: 'ในเมือง', postal: '40000' },
  { province: 'เชียงใหม่', district: 'เมือง', subdistrict: 'ศรีภูมิ', postal: '50200' },
  { province: 'ชลบุรี', district: 'เมือง', subdistrict: 'บางปลาสร้อย', postal: '20000' },
];
const COLORS = [
  'Pearl White', 'Midnight Blue', 'Titanium Gray', 'Ruby Red', 'Jet Black',
  'Silver Metallic', 'Forest Green', 'Sunset Orange', 'Sky Blue', 'Champagne Gold',
];
const FINANCE_PROVIDERS = ['ธนาคารกรุงไทย', 'ธนาคารกสิกรไทย', 'ธนาคารไทยพาณิชย์', 'กรุงศรี ออโต้', 'ทีทีบี'];
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD'] as const;
const SALE_STATUSES = ['RESERVED', 'PREPARING', 'DELIVERED', 'COMPLETED', 'CANCELLED'] as const;
const QTN_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'] as const;
const PAYMENT_TYPES = ['DEPOSIT', 'DOWN_PAYMENT', 'FINANCE_PAYMENT', 'OTHER_EXPENSE', 'MISCELLANEOUS'] as const;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(17, 0, 0, 0);
  return d;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

async function seed() {
  console.log('🌱 Starting database seed...');

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await db.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@vbeyond.co.th',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      phone: '044-272-888',
      role: 'ADMIN' as Role,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Admin user created:', admin.username);

  const roles: { role: Role; username: string; firstName: string; lastName: string }[] = [
    { role: 'SALES_MANAGER', username: 'manager1', firstName: 'สมชาย', lastName: 'จัดการดี' },
    { role: 'SALES_STAFF', username: 'sales1', firstName: 'สมหญิง', lastName: 'ขายเก่ง' },
    { role: 'STOCK_STAFF', username: 'stock1', firstName: 'สมศักดิ์', lastName: 'ดูแลสต็อก' },
    { role: 'ACCOUNTANT', username: 'account1', firstName: 'สมพร', lastName: 'บัญชีดี' },
  ];

  const defaultPassword = await bcrypt.hash('password123', 10);
  for (const userData of roles) {
    const user = await db.user.upsert({
      where: { username: userData.username },
      update: {},
      create: {
        username: userData.username,
        email: `${userData.username}@vbeyond.co.th`,
        password: defaultPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: '044-272-888',
        role: userData.role,
        status: 'ACTIVE',
      },
    });
    console.log(`✅ ${userData.role} user created:`, user.username);
  }

  const salesStaff = await db.user.findUniqueOrThrow({ where: { username: 'sales1' } });
  const manager = await db.user.findUniqueOrThrow({ where: { username: 'manager1' } });
  const accountant = await db.user.findUniqueOrThrow({ where: { username: 'account1' } });

  // -------------------------------------------------------------------------
  // Company settings + bank accounts
  // -------------------------------------------------------------------------
  const companyCount = await db.companySettings.count();
  if (companyCount === 0) {
    await db.companySettings.create({
      data: {
        companyNameTh: 'บริษัท วีบียอนด์ มอเตอร์ จำกัด',
        companyNameEn: 'VBeyond Motor Co., Ltd.',
        taxId: '0123456789012',
        addressTh: '123 ถนนมิตรภาพ ต.ในเมือง อ.เมือง จ.นครราชสีมา 30000',
        addressEn: '123 Mittraphap Rd., Nai Mueang, Mueang, Nakhon Ratchasima 30000',
        phone: '044-272-888',
        mobile: '081-234-5678',
        fax: '044-272-889',
        email: 'info@vbeyond.co.th',
        website: 'https://vbeyond.co.th',
      },
    });
    console.log('✅ Company settings created');
  }

  const banks = [
    { bankName: 'ธนาคารกสิกรไทย', accountNumber: '123-4-56789-0', accountName: 'บจก. วีบียอนด์ มอเตอร์', branch: 'โคราช', accountType: 'ออมทรัพย์', displayOrder: 1 },
    { bankName: 'ธนาคารกรุงไทย', accountNumber: '987-6-54321-0', accountName: 'บจก. วีบียอนด์ มอเตอร์', branch: 'เมืองนครราชสีมา', accountType: 'กระแสรายวัน', displayOrder: 2 },
    { bankName: 'ธนาคารไทยพาณิชย์', accountNumber: '456-7-89123-4', accountName: 'บจก. วีบียอนด์ มอเตอร์', branch: 'เดอะมอลล์โคราช', accountType: 'ออมทรัพย์', displayOrder: 3 },
  ];
  for (const b of banks) {
    const exists = await db.bankAccount.findFirst({
      where: { bankName: b.bankName, accountNumber: b.accountNumber },
    });
    if (!exists) {
      await db.bankAccount.create({ data: b });
    }
  }
  console.log('✅ Bank accounts ready');

  // -------------------------------------------------------------------------
  // Vehicle types (the migration seeds these too; this covers `db push` setups)
  // -------------------------------------------------------------------------
  for (const vt of DEFAULT_VEHICLE_TYPES) {
    await db.vehicleType.upsert({ where: { code: vt.code }, update: {}, create: vt });
  }
  console.log(`✅ Vehicle types ready: ${DEFAULT_VEHICLE_TYPES.length}`);

  // -------------------------------------------------------------------------
  // Vehicle models (25+)
  // -------------------------------------------------------------------------
  const vehicleModelDefs: Array<{
    brand: string;
    model: string;
    variant: string;
    year: number;
    type: string; // vehicle_types.code
    primaryColor: string;
    secondaryColor: string;
    mainOptions: string;
    engineSpecs: string;
    dimensions: string;
    price: number;
    standardCost: number;
    targetMargin: number;
  }> = [
    { brand: 'VBeyond', model: 'VB-E1', variant: 'Standard Range', year: 2025, type: 'EV', primaryColor: 'Pearl White', secondaryColor: 'Black', mainOptions: 'LED Headlights, 10" Touchscreen, Keyless Entry', engineSpecs: 'Electric Motor 150kW, Battery 60kWh, Range 400km', dimensions: '4,500 x 1,850 x 1,650 mm', price: 1299000, standardCost: 950000, targetMargin: 15 },
    { brand: 'VBeyond', model: 'VB-E1', variant: 'Long Range', year: 2025, type: 'EV', primaryColor: 'Midnight Blue', secondaryColor: 'Gray', mainOptions: 'LED Headlights, 12" Touchscreen, Premium Sound, Keyless Entry', engineSpecs: 'Electric Motor 180kW, Battery 80kWh, Range 550km', dimensions: '4,500 x 1,850 x 1,650 mm', price: 1599000, standardCost: 1150000, targetMargin: 15 },
    { brand: 'VBeyond', model: 'VB-SUV', variant: 'Premium', year: 2025, type: 'SUV', primaryColor: 'Titanium Gray', secondaryColor: 'Black', mainOptions: '7 Seats, Panoramic Sunroof, 360 Camera, Premium Sound', engineSpecs: 'Electric Motor 200kW, Battery 100kWh, Range 500km', dimensions: '4,900 x 1,950 x 1,750 mm', price: 2199000, standardCost: 1600000, targetMargin: 12 },
    { brand: 'VBeyond', model: 'VB-E2', variant: 'City', year: 2025, type: 'HATCHBACK', primaryColor: 'Ruby Red', secondaryColor: 'Black', mainOptions: 'Compact EV, Apple CarPlay, Rear Camera', engineSpecs: 'Electric 100kW, 45kWh, Range 320km', dimensions: '4,100 x 1,780 x 1,550 mm', price: 899000, standardCost: 650000, targetMargin: 14 },
    { brand: 'VBeyond', model: 'VB-E2', variant: 'Plus', year: 2025, type: 'HATCHBACK', primaryColor: 'Jet Black', secondaryColor: 'Gray', mainOptions: 'Larger Battery, Fast Charge, Adaptive Cruise', engineSpecs: 'Electric 120kW, 55kWh, Range 400km', dimensions: '4,100 x 1,780 x 1,550 mm', price: 1049000, standardCost: 760000, targetMargin: 14 },
    { brand: 'VBeyond', model: 'VB-X', variant: 'Adventure', year: 2025, type: 'CROSSOVER', primaryColor: 'Forest Green', secondaryColor: 'Black', mainOptions: 'AWD, Roof Rails, Off-road Mode', engineSpecs: 'Dual Motor 220kW, 90kWh, Range 480km', dimensions: '4,650 x 1,900 x 1,700 mm', price: 1899000, standardCost: 1400000, targetMargin: 13 },
    { brand: 'VBeyond', model: 'VB-X', variant: 'Urban', year: 2025, type: 'CROSSOVER', primaryColor: 'Silver Metallic', secondaryColor: 'Beige', mainOptions: 'RWD, Soft Close Doors, HUD', engineSpecs: 'Single Motor 180kW, 75kWh, Range 450km', dimensions: '4,650 x 1,900 x 1,700 mm', price: 1699000, standardCost: 1250000, targetMargin: 13 },
    { brand: 'VBeyond', model: 'VB-Sedan', variant: 'Executive', year: 2025, type: 'SEDAN', primaryColor: 'Champagne Gold', secondaryColor: 'Brown', mainOptions: 'Leather Seats, Ambient Light, Bose Sound', engineSpecs: 'Electric 160kW, 70kWh, Range 480km', dimensions: '4,800 x 1,860 x 1,480 mm', price: 1499000, standardCost: 1100000, targetMargin: 15 },
    { brand: 'VBeyond', model: 'VB-Sedan', variant: 'Sport', year: 2025, type: 'SEDAN', primaryColor: 'Sunset Orange', secondaryColor: 'Black', mainOptions: 'Sport Suspension, 20" Wheels, Performance Mode', engineSpecs: 'Dual Motor 250kW, 85kWh, Range 420km', dimensions: '4,800 x 1,860 x 1,480 mm', price: 1799000, standardCost: 1320000, targetMargin: 14 },
    { brand: 'VBeyond', model: 'VB-MPV', variant: 'Family', year: 2025, type: 'MPV', primaryColor: 'Sky Blue', secondaryColor: 'Gray', mainOptions: '8 Seats, Sliding Doors, Rear AC', engineSpecs: 'Electric 150kW, 80kWh, Range 400km', dimensions: '5,000 x 1,950 x 1,800 mm', price: 1999000, standardCost: 1480000, targetMargin: 12 },
    { brand: 'VBeyond', model: 'VB-MPV', variant: 'Business', year: 2025, type: 'MPV', primaryColor: 'Pearl White', secondaryColor: 'Black', mainOptions: 'Captain Seats, Privacy Glass, Mini Fridge', engineSpecs: 'Electric 170kW, 90kWh, Range 450km', dimensions: '5,000 x 1,950 x 1,800 mm', price: 2299000, standardCost: 1700000, targetMargin: 12 },
    { brand: 'VBeyond', model: 'VB-Pickup', variant: 'Work', year: 2025, type: 'PICKUP', primaryColor: 'Jet Black', secondaryColor: 'Gray', mainOptions: 'Hard Tonneau, Tow Package, Steel Wheels', engineSpecs: 'Electric 180kW, 85kWh, Range 350km', dimensions: '5,300 x 1,920 x 1,800 mm', price: 1399000, standardCost: 1050000, targetMargin: 11 },
    { brand: 'VBeyond', model: 'VB-Pickup', variant: 'Luxe', year: 2025, type: 'PICKUP', primaryColor: 'Titanium Gray', secondaryColor: 'Brown', mainOptions: 'Leather, Soft Tonneau, 360 Camera', engineSpecs: 'Dual Motor 230kW, 100kWh, Range 400km', dimensions: '5,300 x 1,920 x 1,800 mm', price: 1799000, standardCost: 1350000, targetMargin: 12 },
    { brand: 'VBeyond', model: 'VB-SUV', variant: 'Base', year: 2025, type: 'SUV', primaryColor: 'Silver Metallic', secondaryColor: 'Black', mainOptions: '5 Seats, LED Lights, 12" Screen', engineSpecs: 'Electric 180kW, 80kWh, Range 450km', dimensions: '4,850 x 1,930 x 1,720 mm', price: 1799000, standardCost: 1320000, targetMargin: 13 },
    { brand: 'VBeyond', model: 'VB-SUV', variant: 'Sport', year: 2025, type: 'SUV', primaryColor: 'Ruby Red', secondaryColor: 'Black', mainOptions: 'Sport Pack, Air Suspension, Matrix LED', engineSpecs: 'Dual Motor 280kW, 110kWh, Range 480km', dimensions: '4,900 x 1,950 x 1,750 mm', price: 2599000, standardCost: 1950000, targetMargin: 12 },
    { brand: 'VBeyond', model: 'VB-E1', variant: 'Fleet', year: 2024, type: 'EV', primaryColor: 'White', secondaryColor: 'Gray', mainOptions: 'Fleet Telematics, Durable Interior', engineSpecs: 'Electric 150kW, 60kWh, Range 380km', dimensions: '4,500 x 1,850 x 1,650 mm', price: 1199000, standardCost: 900000, targetMargin: 10 },
    { brand: 'VBeyond', model: 'VB-E3', variant: 'Compact', year: 2026, type: 'EV', primaryColor: 'Mint Green', secondaryColor: 'White', mainOptions: 'City EV, V2L, Wireless Charge', engineSpecs: 'Electric 90kW, 40kWh, Range 300km', dimensions: '3,900 x 1,720 x 1,520 mm', price: 749000, standardCost: 540000, targetMargin: 16 },
    { brand: 'VBeyond', model: 'VB-E3', variant: 'Touring', year: 2026, type: 'EV', primaryColor: 'Midnight Blue', secondaryColor: 'Gray', mainOptions: 'Larger Battery, Heat Pump, Auto Park', engineSpecs: 'Electric 110kW, 55kWh, Range 420km', dimensions: '3,900 x 1,720 x 1,520 mm', price: 899000, standardCost: 650000, targetMargin: 15 },
    { brand: 'VBeyond', model: 'VB-X', variant: 'Pro', year: 2026, type: 'CROSSOVER', primaryColor: 'Pearl White', secondaryColor: 'Black', mainOptions: 'Level 2 ADAS, Massaging Seats', engineSpecs: 'Dual Motor 240kW, 95kWh, Range 500km', dimensions: '4,700 x 1,920 x 1,710 mm', price: 2099000, standardCost: 1550000, targetMargin: 13 },
    { brand: 'VBeyond', model: 'VB-Sedan', variant: 'Base', year: 2024, type: 'SEDAN', primaryColor: 'Silver Metallic', secondaryColor: 'Black', mainOptions: 'Cloth Seats, 10" Screen, Cruise', engineSpecs: 'Electric 140kW, 60kWh, Range 400km', dimensions: '4,750 x 1,840 x 1,470 mm', price: 1199000, standardCost: 880000, targetMargin: 14 },
    { brand: 'VBeyond', model: 'VB-Cargo', variant: 'Van', year: 2025, type: 'MPV', primaryColor: 'White', secondaryColor: 'Gray', mainOptions: 'Cargo Partition, Payload 800kg', engineSpecs: 'Electric 130kW, 70kWh, Range 320km', dimensions: '5,200 x 1,950 x 1,950 mm', price: 1299000, standardCost: 980000, targetMargin: 11 },
    { brand: 'VBeyond', model: 'VB-Cargo', variant: 'Van XL', year: 2025, type: 'MPV', primaryColor: 'White', secondaryColor: 'Black', mainOptions: 'High Roof, Side Door, Fleet Kit', engineSpecs: 'Electric 150kW, 85kWh, Range 350km', dimensions: '5,500 x 1,980 x 2,200 mm', price: 1499000, standardCost: 1120000, targetMargin: 11 },
    { brand: 'VBeyond', model: 'VB-E1', variant: 'GT', year: 2026, type: 'EV', primaryColor: 'Jet Black', secondaryColor: 'Red', mainOptions: 'Sport Seats, Track Mode, Carbon Trim', engineSpecs: 'Dual Motor 300kW, 90kWh, Range 420km', dimensions: '4,520 x 1,870 x 1,640 mm', price: 1999000, standardCost: 1480000, targetMargin: 14 },
    { brand: 'VBeyond', model: 'VB-SUV', variant: '7S', year: 2026, type: 'SUV', primaryColor: 'Titanium Gray', secondaryColor: 'Beige', mainOptions: '7 Seats, 3rd Row AC, Power Tailgate', engineSpecs: 'Electric 200kW, 100kWh, Range 480km', dimensions: '4,950 x 1,960 x 1,780 mm', price: 2399000, standardCost: 1780000, targetMargin: 12 },
    { brand: 'VBeyond', model: 'VB-Pickup', variant: 'Double Cab', year: 2026, type: 'PICKUP', primaryColor: 'Forest Green', secondaryColor: 'Black', mainOptions: '4 Doors, Bed Liner, 4x4 Mode', engineSpecs: 'Dual Motor 250kW, 105kWh, Range 380km', dimensions: '5,350 x 1,930 x 1,820 mm', price: 1899000, standardCost: 1420000, targetMargin: 12 },
  ];

  const createdModels = [];
  for (const model of vehicleModelDefs) {
    const existing = await db.vehicleModel.findFirst({
      where: {
        brand: model.brand,
        model: model.model,
        variant: model.variant,
        year: model.year,
      },
    });
    const created = existing
      ? existing
      : await db.vehicleModel.create({
          data: {
            brand: model.brand,
            model: model.model,
            variant: model.variant,
            year: model.year,
            type: model.type,
            primaryColor: model.primaryColor,
            secondaryColor: model.secondaryColor,
            mainOptions: model.mainOptions,
            engineSpecs: model.engineSpecs,
            dimensions: model.dimensions,
            price: model.price,
            standardCost: model.standardCost,
            targetMargin: model.targetMargin,
          },
        });
    createdModels.push(created);
  }
  console.log(`✅ Vehicle models ready: ${createdModels.length}`);

  // -------------------------------------------------------------------------
  // Number sequences
  // -------------------------------------------------------------------------
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const sequences = [
    { prefix: 'CUST', year: currentYear, month: null },
    { prefix: 'SL', year: currentYear, month: null },
    { prefix: 'QTN', year: currentYear, month: currentMonth },
    { prefix: 'RCPT', year: currentYear, month: currentMonth },
  ];
  for (const seq of sequences) {
    await db.numberSequence.upsert({
      where: {
        prefix_year_month: {
          prefix: seq.prefix,
          year: seq.year,
          month: seq.month ?? 0,
        },
      },
      update: {},
      create: {
        prefix: seq.prefix,
        year: seq.year,
        month: seq.month,
        lastNumber: 0,
      },
    });
  }
  console.log('✅ Number sequences initialized');

  // -------------------------------------------------------------------------
  // Customers (25)
  // -------------------------------------------------------------------------
  const customers = [];
  for (let i = 1; i <= 25; i++) {
    const code = `CUST-BULK-${pad(i)}`;
    const loc = PROVINCES[i % PROVINCES.length];
    const isCompany = i % 5 === 0;
    const existing = await db.customer.findUnique({ where: { code } });
    if (existing) {
      customers.push(existing);
      continue;
    }
    const c = await db.customer.create({
      data: {
        code,
        type: isCompany ? 'COMPANY' : 'INDIVIDUAL',
        salesType: i % 7 === 0 ? 'FLEET_SALES' : 'NORMAL_SALES',
        name: isCompany
          ? `บริษัท ${THAI_LAST[i % THAI_LAST.length]} จำกัด`
          : `${THAI_FIRST[i % THAI_FIRST.length]} ${THAI_LAST[i % THAI_LAST.length]}`,
        taxId: isCompany ? `0${pad(i, 12)}` : null,
        houseNumber: String(10 + i),
        street: `ถนนตัวอย่าง ${i}`,
        subdistrict: loc.subdistrict,
        district: loc.district,
        province: loc.province,
        postalCode: loc.postal,
        phone: `08${pad(i, 8)}`,
        email: isCompany ? `contact${i}@company-demo.th` : `customer${i}@demo.th`,
        contactName: isCompany ? `${THAI_FIRST[(i + 3) % THAI_FIRST.length]} ${THAI_LAST[(i + 2) % THAI_LAST.length]}` : null,
        contactRole: isCompany ? 'ผู้จัดการจัดซื้อ' : null,
        contactMobile: isCompany ? `09${pad(i, 8)}` : null,
        creditTermDays: isCompany ? 30 : null,
        creditLimit: isCompany ? 5_000_000 : null,
        notes: i % 4 === 0 ? 'ลูกค้า VIP ทดลองระบบ' : null,
      },
    });
    customers.push(c);
  }
  console.log(`✅ Customers ready: ${customers.length}`);

  // -------------------------------------------------------------------------
  // Stock (30) — mix of AVAILABLE / RESERVED / SOLD / DEMO / PREPARING
  // -------------------------------------------------------------------------
  const stocks = [];
  const stockStatuses = [
    'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE',
    'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE',
    'RESERVED', 'RESERVED', 'RESERVED', 'PREPARING', 'PREPARING',
    'DEMO', 'DEMO', 'SOLD', 'SOLD', 'SOLD',
    'SOLD', 'SOLD', 'SOLD', 'SOLD', 'SOLD',
    'AVAILABLE', 'AVAILABLE', 'RESERVED', 'SOLD', 'SOLD',
  ] as const;

  for (let i = 1; i <= 30; i++) {
    const vin = `SEEDBULK${pad(i, 9)}XX`;
    const existing = await db.stock.findUnique({ where: { vin } });
    if (existing) {
      stocks.push(existing);
      continue;
    }
    const vm = createdModels[(i - 1) % createdModels.length];
    const status = stockStatuses[i - 1];
    const baseCost = Number(vm.standardCost);
    const price = Number(vm.price);
    const hasDebt = i % 3 !== 0;
    const debtAmount = hasDebt ? baseCost * 0.7 : 0;
    const paidDebt = status === 'SOLD' && hasDebt ? debtAmount * 0.3 : 0;
    const arrival = daysAgo(90 - i * 2);

    const stock = await db.stock.create({
      data: {
        stockNumber: `STK-BULK-${pad(i)}`,
        vin,
        engineNumber: `ENG-BULK-${pad(i, 4)}`,
        motorNumber1: i % 2 === 0 ? `MOT-A-${pad(i, 4)}` : null,
        vehicleModelId: vm.id,
        exteriorColor: COLORS[i % COLORS.length],
        interiorColor: i % 2 === 0 ? 'Black' : 'Beige',
        arrivalDate: arrival,
        orderDate: daysAgo(120 - i),
        status,
        parkingSlot: status === 'AVAILABLE' || status === 'DEMO' ? `A-${pad(i)}` : null,
        receivedFrom: 'โรงงาน VBeyond',
        baseCost,
        transportCost: 15000 + (i % 5) * 1000,
        accessoryCost: i % 3 === 0 ? 25000 : 0,
        otherCosts: i % 4 === 0 ? 5000 : 0,
        financeProvider: hasDebt ? FINANCE_PROVIDERS[i % FINANCE_PROVIDERS.length] : null,
        interestRate: hasDebt ? 0.065 : 0,
        interestPrincipalBase: 'BASE_COST_ONLY',
        accumulatedInterest: hasDebt ? Math.round(debtAmount * 0.065 * (30 + i) / 365) : 0,
        financePaymentDate: hasDebt ? arrival : null,
        stopInterestCalc: status === 'SOLD',
        expectedSalePrice: price,
        actualSalePrice: status === 'SOLD' ? price - (i % 5) * 10000 : null,
        soldDate: status === 'SOLD' ? daysAgo(i) : null,
        debtAmount,
        paidDebtAmount: paidDebt,
        paidInterestAmount: hasDebt && status === 'SOLD' ? 5000 : 0,
        remainingDebt: Math.max(0, debtAmount - paidDebt),
        debtStatus: !hasDebt ? 'NO_DEBT' : status === 'SOLD' && paidDebt >= debtAmount ? 'PAID_OFF' : 'ACTIVE',
        notes: `สต็อกจำลอง #${i}`,
      },
    });
    stocks.push(stock);

    // Interest period for stocks with debt
    if (hasDebt) {
      await db.interestPeriod.create({
        data: {
          stockId: stock.id,
          startDate: arrival,
          endDate: status === 'SOLD' ? daysAgo(i) : null,
          annualRate: 6.5,
          principalBase: 'BASE_COST_ONLY',
          principalAmount: debtAmount,
          calculatedInterest: Math.round(debtAmount * 0.065 * (30 + i) / 365),
          daysCount: 30 + i,
          createdById: admin.id,
          notes: 'อัตราดอกเบี้ยเริ่มต้น (seed)',
        },
      });
    }
  }
  console.log(`✅ Stocks ready: ${stocks.length}`);

  // -------------------------------------------------------------------------
  // Sales (25) — link SOLD/RESERVED stocks where possible
  // -------------------------------------------------------------------------
  const sales = [];
  const soldOrReserved = stocks.filter((s) =>
    ['SOLD', 'RESERVED', 'PREPARING'].includes(s.status),
  );

  for (let i = 1; i <= 25; i++) {
    const saleNumber = `SL-${currentYear}-BULK-${pad(i)}`;
    const existing = await db.sale.findUnique({ where: { saleNumber } });
    if (existing) {
      sales.push(existing);
      continue;
    }

    const customer = customers[(i - 1) % customers.length];
    const vm = createdModels[(i - 1) % createdModels.length];
    const price = Number(vm.price);
    const status = SALE_STATUSES[(i - 1) % SALE_STATUSES.length];
    const paymentMode = (['CASH', 'FINANCE', 'MIXED'] as const)[i % 3];
    const deposit = Math.round(price * 0.05);
    const paid =
      status === 'COMPLETED' || status === 'DELIVERED'
        ? price
        : status === 'CANCELLED'
          ? 0
          : deposit + (i % 3) * 20000;
    const remaining = Math.max(0, price - paid);
    const stock = soldOrReserved[i - 1] ?? null;

    // Avoid unique stockId collision if already linked
    let stockId: string | null = null;
    if (stock) {
      const linked = await db.sale.findFirst({ where: { stockId: stock.id } });
      if (!linked) {
        stockId = stock.id;
      }
    }

    // When a stock unit is linked, model must match that unit (not a separate preferred id).
    const vehicleModelIdForSale = stockId && stock ? stock.vehicleModelId : vm.id;

    const sale = await db.sale.create({
      data: {
        saleNumber,
        type: i % 2 === 0 ? 'DIRECT_SALE' : 'RESERVATION_SALE',
        status,
        customerId: customer.id,
        stockId,
        vehicleModelId: vehicleModelIdForSale,
        preferredExtColor: COLORS[i % COLORS.length],
        preferredIntColor: i % 2 === 0 ? 'Black' : 'Beige',
        totalAmount: price,
        depositAmount: deposit,
        paidAmount: paid,
        remainingAmount: remaining,
        reservedDate: daysAgo(40 - i),
        expirationDate: status === 'RESERVED' ? daysFromNow(14) : null,
        hasExpiration: status === 'RESERVED',
        deliveryDate: ['DELIVERED', 'COMPLETED'].includes(status) ? daysAgo(Math.max(1, i - 5)) : null,
        completedDate: status === 'COMPLETED' ? daysAgo(Math.max(1, i - 8)) : null,
        discountSnapshot: i % 4 === 0 ? 10000 : 0,
        campaignSubsidySnapshot: null,
        freebiesSnapshot: i % 5 === 0 ? 'ฟิล์ม+พรม+ประกันชั้น 1 (1 ปี)' : null,
        paymentMode,
        downPayment: paymentMode !== 'CASH' ? Math.round(price * 0.25) : null,
        financeAmount: paymentMode !== 'CASH' ? Math.round(price * 0.75) : null,
        financeProvider: paymentMode !== 'CASH' ? FINANCE_PROVIDERS[i % FINANCE_PROVIDERS.length] : null,
        carDiscount: i % 3 === 0 ? 15000 : 0,
        insuranceFee: 18000 + (i % 4) * 1000,
        compulsoryInsuranceFee: 650,
        registrationFee: 3500,
        salesCommission: 8000 + i * 100,
        salesExpense: 2000,
        financeCommission: paymentMode !== 'CASH' ? 5000 : 0,
        interestRate: paymentMode !== 'CASH' ? 0.0299 : null,
        numberOfTerms: paymentMode !== 'CASH' ? 48 + (i % 3) * 12 : null,
        monthlyInstallment: paymentMode !== 'CASH' ? Math.round((price * 0.75) / 60) : null,
        refundPolicy: status === 'CANCELLED' ? 'PARTIAL' : 'FULL',
        refundAmount: status === 'CANCELLED' ? deposit * 0.5 : null,
        notes: `ใบขายจำลอง #${i}`,
        cancellationReason: status === 'CANCELLED' ? 'ลูกค้าเปลี่ยนใจ (seed)' : null,
        createdById: i % 2 === 0 ? salesStaff.id : manager.id,
        createdAt: daysAgo(45 - i),
      },
    });
    sales.push(sale);

    await db.saleHistory.create({
      data: {
        saleId: sale.id,
        action: 'CREATED',
        fromStatus: null,
        toStatus: status,
        notes: 'สร้างจาก seed ข้อมูลจำลอง',
        createdById: admin.id,
      },
    });

    // Custom finance lines for some sales
    if (i % 3 === 0) {
      await db.saleFinanceLine.createMany({
        data: [
          {
            saleId: sale.id,
            key: `custom:seed-charge-${i}`,
            label: 'ค่าติดตั้งอุปกรณ์เพิ่ม',
            group: 'CUSTOMER_CHARGE',
            amount: 12000,
            source: 'CUSTOM',
            sortOrder: 1,
          },
          {
            saleId: sale.id,
            key: `custom:seed-dealer-${i}`,
            label: 'ค่าโปรโมทบูธ',
            group: 'DEALER',
            amount: 3000,
            source: 'CUSTOM',
            sortOrder: 2,
          },
        ],
      });
    }
  }
  console.log(`✅ Sales ready: ${sales.length}`);

  // -------------------------------------------------------------------------
  // Payments (30) — tied to sales + miscellaneous
  // -------------------------------------------------------------------------
  let paymentCount = 0;
  for (let i = 1; i <= 30; i++) {
    const receiptNumber = `RCPT-${currentYear}${pad(currentMonth)}-BULK-${pad(i)}`;
    const existing = await db.payment.findUnique({ where: { receiptNumber } });
    if (existing) {
      paymentCount++;
      continue;
    }
    const sale = sales[(i - 1) % sales.length];
    const customer = customers.find((c) => c.id === sale.customerId) ?? customers[0];
    const amount =
      i % 5 === 0
        ? 5000 + i * 100
        : Math.round(Number(sale.depositAmount) || 20000);
    const method = PAYMENT_METHODS[i % PAYMENT_METHODS.length];
    const type = PAYMENT_TYPES[i % PAYMENT_TYPES.length];
    const bank = banks[i % banks.length];

    await db.payment.create({
      data: {
        receiptNumber,
        customerId: customer.id,
        saleId: type === 'MISCELLANEOUS' ? null : sale.id,
        paymentDate: daysAgo(30 - (i % 28)),
        paymentType: type,
        amount,
        paymentMethod: method,
        referenceNumber: method === 'BANK_TRANSFER' ? `TRX${pad(i, 8)}` : method === 'CHEQUE' ? `CHQ${pad(i, 6)}` : null,
        notes: type === 'MISCELLANEOUS' ? 'รายรับเบ็ดเตล็ด (seed)' : `ชำระตามใบขาย ${sale.saleNumber}`,
        receivingBank: method === 'BANK_TRANSFER' ? bank.bankName : null,
        receivingBankName: method === 'BANK_TRANSFER' ? bank.accountName : null,
        receivingAccountNumber: method === 'BANK_TRANSFER' ? bank.accountNumber : null,
        receivingBranch: method === 'BANK_TRANSFER' ? bank.branch : null,
        actualReceivedDate: daysAgo(29 - (i % 28)),
        netReceivedAmount: amount,
        status: i === 30 ? 'VOIDED' : 'ACTIVE',
        voidReason: i === 30 ? 'ออกซ้ำ (seed demo void)' : null,
        voidedAt: i === 30 ? daysAgo(1) : null,
        issuedBy: accountant.firstName + ' ' + accountant.lastName,
        createdById: i % 2 === 0 ? accountant.id : salesStaff.id,
        description: type === 'MISCELLANEOUS' ? 'ค่าบริการเอกสาร' : undefined,
      },
    });
    paymentCount++;
  }
  console.log(`✅ Payments ready: ${paymentCount}`);

  // -------------------------------------------------------------------------
  // Quotations (22)
  // -------------------------------------------------------------------------
  let qtnCount = 0;
  for (let i = 1; i <= 22; i++) {
    const quotationNumber = `QTN-${currentYear}${pad(currentMonth)}-BULK-${pad(i)}`;
    const existing = await db.quotation.findUnique({ where: { quotationNumber } });
    if (existing) {
      qtnCount++;
      continue;
    }
    const customer = customers[(i + 2) % customers.length];
    const vm = createdModels[(i + 1) % createdModels.length];
    const price = Number(vm.price);
    const discount = i % 3 === 0 ? 20000 : 0;
    const status = QTN_STATUSES[(i - 1) % QTN_STATUSES.length];
    // Only attach sale if not already used by another quotation
    let saleId: string | null = null;
    if (status === 'CONVERTED' && sales[i - 1]) {
      const used = await db.quotation.findFirst({ where: { saleId: sales[i - 1].id } });
      if (!used) saleId = sales[i - 1].id;
    }

    await db.quotation.create({
      data: {
        quotationNumber,
        saleId,
        version: 1,
        quotedPrice: price,
        validUntil: daysFromNow(15 + (i % 10)),
        status,
        notes: `ใบเสนอราคาจำลอง #${i}`,
        createdById: salesStaff.id,
        customerId: customer.id,
        discountAmount: discount,
        finalPrice: price - discount,
        preferredExtColor: COLORS[i % COLORS.length],
        preferredIntColor: 'Black',
        vehicleModelId: vm.id,
        createdAt: daysAgo(20 - (i % 15)),
      },
    });
    qtnCount++;
  }
  console.log(`✅ Quotations ready: ${qtnCount}`);

  // -------------------------------------------------------------------------
  // Extra campaigns (to reach a fuller demo set)
  // -------------------------------------------------------------------------
  const campaignNames = [
    'โปรเปิดตัว VB-E1',
    'ลดล้างสต็อกไตรมาส 2',
    'แคมเปญฟลีทองค์กร',
    'โปรโอนไฟแนนซ์ 0%',
    'แคมเปญฤดูร้อน EV',
  ];
  for (let i = 0; i < campaignNames.length; i++) {
    const name = campaignNames[i];
    let camp = await db.campaign.findFirst({ where: { name } });
    if (!camp) {
      camp = await db.campaign.create({
        data: {
          name,
          description: `แคมเปญจำลอง: ${name}`,
          status: (['ACTIVE', 'ACTIVE', 'DRAFT', 'ENDED', 'ACTIVE'] as const)[i],
          startDate: daysAgo(60 - i * 5),
          endDate: daysFromNow(30 + i * 10),
          branch: i % 2 === 0 ? 'โคราช' : 'ขอนแก่น',
          notes: 'seed bulk campaign',
          createdById: admin.id,
          vehicleModels: {
            create: [
              { vehicleModelId: createdModels[i % createdModels.length].id },
              { vehicleModelId: createdModels[(i + 3) % createdModels.length].id },
            ],
          },
        },
      });
      await db.campaignModelFormula.create({
        data: {
          campaignId: camp.id,
          vehicleModelId: createdModels[i % createdModels.length].id,
          name: 'ส่วนลดแคมเปญ',
          operator: 'FIXED',
          value: 10000 + i * 2000,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 1,
        },
      });
    }
  }
  console.log(`✅ Extra campaigns ready: ${campaignNames.length}`);

  // -------------------------------------------------------------------------
  // Stock debt payments (sample history on stocks with debt)
  // -------------------------------------------------------------------------
  let debtPayCount = 0;
  const debtStocks = stocks.filter((s) => Number(s.debtAmount) > 0).slice(0, 12);
  for (let i = 0; i < debtStocks.length; i++) {
    const s = debtStocks[i];
    const ref = `DEBT-SEED-${pad(i + 1)}`;
    const exists = await db.stockDebtPayment.findFirst({
      where: { stockId: s.id, referenceNumber: ref },
    });
    if (exists) {
      debtPayCount++;
      continue;
    }
    const principal = Number(s.debtAmount);
    const payAmt = Math.round(principal * 0.1);
    await db.stockDebtPayment.create({
      data: {
        stockId: s.id,
        paymentDate: daysAgo(15 - i),
        amount: payAmt,
        paymentMethod: 'BANK_TRANSFER',
        referenceNumber: ref,
        principalBefore: principal,
        principalAfter: Math.max(0, principal - payAmt),
        accruedInterestAtPayment: Number(s.accumulatedInterest) || 0,
        interestPaid: Math.min(payAmt * 0.2, Number(s.accumulatedInterest) || 0),
        principalPaid: payAmt * 0.8,
        notes: 'จ่ายหนี้สต็อก (seed)',
        createdById: accountant.id,
      },
    });
    debtPayCount++;
  }
  console.log(`✅ Stock debt payments ready: ${debtPayCount}`);

  // -------------------------------------------------------------------------
  // Activity logs (sample)
  // -------------------------------------------------------------------------
  const actCount = await db.activityLog.count();
  if (actCount < 20) {
    const actions = ['LOGIN', 'CREATE', 'UPDATE', 'VIEW', 'EXPORT'];
    const entities = ['Sale', 'Customer', 'Stock', 'Payment', 'Quotation', 'Campaign'];
    for (let i = 1; i <= 25; i++) {
      await db.activityLog.create({
        data: {
          userId: [admin.id, salesStaff.id, manager.id, accountant.id][i % 4],
          action: actions[i % actions.length],
          entity: entities[i % entities.length],
          entityId: sales[i % sales.length]?.id,
          details: { seed: true, index: i },
          createdAt: daysAgo(i),
        },
      });
    }
    console.log('✅ Activity logs seeded (25)');
  }

  // -------------------------------------------------------------------------
  // Campaign claim report seed (รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำงวด)
  // Needs: sale.campaignId + status != CANCELLED + soldDate/completedDate
  // in the selected month + brand match + campaign formulas on the model.
  // -------------------------------------------------------------------------
  {
    const claimNow = new Date();
    const claimMonthStart = new Date(claimNow.getFullYear(), claimNow.getMonth(), 1, 12, 0, 0, 0);
    const claimMonthEnd = new Date(
      claimNow.getFullYear(),
      claimNow.getMonth() + 1,
      0,
      12,
      0,
      0,
      0
    );
    const claimModels = createdModels.filter((m) => m.brand === 'VBeyond').slice(0, 12);
    if (claimModels.length === 0) {
      console.warn('⚠️  Skip campaign-claim seed: no VBeyond models');
    } else {
      let claimCampaign = await db.campaign.findFirst({
        where: { name: 'แคมเปญเบิกเงินส่งเสริมประจำงวด (SEED)' },
      });
      if (!claimCampaign) {
        claimCampaign = await db.campaign.create({
          data: {
            name: 'แคมเปญเบิกเงินส่งเสริมประจำงวด (SEED)',
            description:
              'Seed สำหรับรายงานเบิกแคมเปญเงินส่งเสริมการขายประจำงวด — เลือกยี่ห้อ VBeyond เดือนปัจจุบัน',
            status: 'ACTIVE',
            startDate: new Date(claimNow.getFullYear(), claimNow.getMonth() - 1, 1),
            endDate: new Date(claimNow.getFullYear(), claimNow.getMonth() + 2, 0, 23, 59, 59),
            branch: 'โคราช',
            notes: 'seed campaign-claim monthly',
            createdById: admin.id,
            vehicleModels: {
              create: claimModels.map((m) => ({ vehicleModelId: m.id })),
            },
          },
        });
      } else {
        for (const m of claimModels) {
          await db.campaignVehicleModel.upsert({
            where: {
              campaignId_vehicleModelId: {
                campaignId: claimCampaign.id,
                vehicleModelId: m.id,
              },
            },
            update: {},
            create: { campaignId: claimCampaign.id, vehicleModelId: m.id },
          });
        }
      }

      // Brand-style expense columns (formula names = report columns)
      const claimFormulaTemplates: Array<{
        name: string;
        operator: 'PERCENT' | 'FIXED';
        value: number;
        priceTarget: 'SELLING_PRICE' | 'COST_PRICE';
        sortOrder: number;
      }> = [
        {
          // PDF form header name (alias STOCK LEVEL kept in projector for legacy rows)
          name: 'STOCK 0.5%',
          operator: 'PERCENT',
          value: 0.5,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 1,
        },
        {
          name: 'After Sales — ไม่ร้องเรียน',
          operator: 'PERCENT',
          value: 0.25,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 2,
        },
        {
          name: 'After Sales — Google QR',
          operator: 'PERCENT',
          value: 0.25,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 3,
        },
        {
          // PDF form header name (alias MARKETING kept in projector for legacy rows)
          name: 'Marketing 1%',
          operator: 'PERCENT',
          value: 1,
          priceTarget: 'COST_PRICE',
          sortOrder: 4,
        },
        {
          name: 'เป้าขาย (Retail)',
          operator: 'PERCENT',
          value: 1,
          priceTarget: 'COST_PRICE',
          sortOrder: 5,
        },
        {
          name: 'เปิดบูธ',
          operator: 'FIXED',
          value: 3000,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 6,
        },
        {
          name: 'ค่าขนส่ง',
          operator: 'FIXED',
          value: 2000,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 7,
        },
        {
          name: 'ทดสอบ',
          operator: 'FIXED',
          value: 1000,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 8,
        },
      ];

      for (const m of claimModels) {
        for (const f of claimFormulaTemplates) {
          const exists = await db.campaignModelFormula.findFirst({
            where: {
              campaignId: claimCampaign.id,
              vehicleModelId: m.id,
              name: f.name,
            },
          });
          if (!exists) {
            await db.campaignModelFormula.create({
              data: {
                campaignId: claimCampaign.id,
                vehicleModelId: m.id,
                name: f.name,
                operator: f.operator,
                value: f.value,
                priceTarget: f.priceTarget,
                sortOrder: f.sortOrder,
              },
            });
          }
        }
      }
      console.log(
        `✅ Claim campaign ready: ${claimCampaign.id} (${claimModels.length} models, ${claimFormulaTemplates.length} formulas each)`
      );

      // 22 completed sales with stock soldDate spread across current month
      let claimSaleCount = 0;
      for (let i = 1; i <= 22; i++) {
        const saleNumber = `SL-CLAIM-${currentYear}-${pad(i)}`;
        const vm = claimModels[(i - 1) % claimModels.length];
        const customer = customers[(i - 1) % customers.length];
        const day = Math.min(
          claimMonthEnd.getDate(),
          1 + ((i - 1) % Math.max(1, claimMonthEnd.getDate()))
        );
        const soldAt = new Date(
          claimNow.getFullYear(),
          claimNow.getMonth(),
          day,
          10 + (i % 6),
          0,
          0,
          0
        );
        // Clamp to not exceed "today" so date range default (month-to-date) still includes them
        if (soldAt > claimNow) {
          soldAt.setTime(
            claimMonthStart.getTime() + ((i - 1) % Math.max(1, claimNow.getDate())) * 86400000
          );
        }

        const vin = `CLAIMSEED${pad(i, 8)}X`;
        let stock = await db.stock.findUnique({ where: { vin } });
        if (!stock) {
          stock = await db.stock.create({
            data: {
              stockNumber: `STK-CLAIM-${pad(i)}`,
              vin,
              engineNumber: `ENG-CLAIM-${pad(i, 4)}`,
              vehicleModelId: vm.id,
              exteriorColor: COLORS[i % COLORS.length],
              interiorColor: 'Black',
              status: 'SOLD',
              baseCost: Number(vm.standardCost),
              transportCost: 15000,
              expectedSalePrice: Number(vm.price),
              actualSalePrice: Number(vm.price) - (i % 4) * 5000,
              soldDate: soldAt,
              arrivalDate: daysAgo(60 + i),
              financeProvider: FINANCE_PROVIDERS[i % FINANCE_PROVIDERS.length],
              notes: 'seed for campaign-claim report',
            },
          });
        } else {
          stock = await db.stock.update({
            where: { id: stock.id },
            data: {
              status: 'SOLD',
              vehicleModelId: vm.id,
              soldDate: soldAt,
              actualSalePrice: Number(vm.price),
            },
          });
        }

        const price = Number(vm.price);
        let sale = await db.sale.findUnique({ where: { saleNumber } });
        if (!sale) {
          const linked = await db.sale.findFirst({ where: { stockId: stock.id } });
          if (linked) {
            // Free stock if linked to another seed sale number we don't care about
            await db.sale.update({
              where: { id: linked.id },
              data: { stockId: null },
            });
          }
          sale = await db.sale.create({
            data: {
              saleNumber,
              type: 'DIRECT_SALE',
              status: 'COMPLETED',
              customerId: customer.id,
              stockId: stock.id,
              vehicleModelId: vm.id,
              totalAmount: price,
              depositAmount: Math.round(price * 0.05),
              paidAmount: price,
              remainingAmount: 0,
              reservedDate: daysAgo(20 + i),
              deliveryDate: soldAt,
              completedDate: soldAt,
              campaignId: claimCampaign.id,
              campaignSubsidySnapshot: 25000 + i * 100,
              discountSnapshot: i % 3 === 0 ? 10000 : 0,
              freebiesSnapshot: i % 4 === 0 ? 'ฟิล์ม+ประกัน' : null,
              paymentMode: i % 2 === 0 ? 'FINANCE' : 'CASH',
              downPayment: i % 2 === 0 ? Math.round(price * 0.25) : null,
              financeAmount: i % 2 === 0 ? Math.round(price * 0.75) : null,
              financeProvider:
                i % 2 === 0 ? FINANCE_PROVIDERS[i % FINANCE_PROVIDERS.length] : null,
              carDiscount: i % 3 === 0 ? 15000 : 5000,
              insuranceFee: 18000,
              compulsoryInsuranceFee: 650,
              registrationFee: 3500,
              salesCommission: 8000,
              salesExpense: 2000,
              financeCommission: i % 2 === 0 ? 4500 : 0,
              createdById: salesStaff.id,
              notes: 'seed รายงานเบิกแคมเปญประจำงวด',
              createdAt: soldAt,
            },
          });
        } else {
          sale = await db.sale.update({
            where: { id: sale.id },
            data: {
              status: 'COMPLETED',
              campaignId: claimCampaign.id,
              customerId: customer.id,
              stockId: stock.id,
              vehicleModelId: vm.id,
              completedDate: soldAt,
              deliveryDate: soldAt,
              totalAmount: price,
              paidAmount: price,
              remainingAmount: 0,
              financeProvider:
                i % 2 === 0 ? FINANCE_PROVIDERS[i % FINANCE_PROVIDERS.length] : null,
              paymentMode: i % 2 === 0 ? 'FINANCE' : 'CASH',
            },
          });
        }
        claimSaleCount++;
      }
      console.log(
        `✅ Campaign-claim sales ready: ${claimSaleCount} (month ${claimNow.getFullYear()}-${pad(claimNow.getMonth() + 1)}, brand VBeyond)`
      );
      console.log(
        `   → เปิดรายงาน: ยี่ห้อ VBeyond, วันที่ ${claimMonthStart.toISOString().slice(0, 10)} ถึง ${claimMonthEnd.toISOString().slice(0, 10)}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Campaign demo data — full path for report testing (kept from original seed)
  // -------------------------------------------------------------------------
  const models = await db.vehicleModel.findMany({
    where: {
      OR: [
        { brand: 'VBeyond', model: 'VB-E1', variant: 'Standard Range', year: 2025 },
        { brand: 'VBeyond', model: 'VB-E1', variant: 'Long Range', year: 2025 },
      ],
    },
  });
  const modelStd = models.find((m) => m.variant === 'Standard Range');
  const modelLr = models.find((m) => m.variant === 'Long Range');

  if (!modelStd || !modelLr) {
    console.warn('⚠️  Skip campaign demo: VB-E1 Standard/Long Range models missing');
  } else {
    const customer =
      (await db.customer.findFirst({ where: { code: 'CUST-DEMO-CAMP' } })) ??
      (await db.customer.create({
        data: {
          code: 'CUST-DEMO-CAMP',
          type: 'INDIVIDUAL',
          salesType: 'NORMAL_SALES',
          name: 'ลูกค้าทดสอบแคมเปญ',
          houseNumber: '99',
          street: 'ถนนทดสอบ',
          subdistrict: 'ในเมือง',
          district: 'เมือง',
          province: 'นครราชสีมา',
          postalCode: '30000',
          phone: '0812345678',
        },
      }));
    console.log('✅ Demo customer:', customer.code);

    const now = new Date();
    // Keep demo sales inside the current calendar month so claim report default range includes them
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
    const demoSoldAt = new Date(
      now.getFullYear(),
      now.getMonth(),
      Math.min(now.getDate(), 15),
      14,
      0,
      0,
      0
    );

    let fullCampaign = await db.campaign.findFirst({
      where: { name: 'DEMO รายงานแคมเปญครบ' },
    });
    if (!fullCampaign) {
      fullCampaign = await db.campaign.create({
        data: {
          name: 'DEMO รายงานแคมเปญครบ',
          description: 'Seed: รุ่น + สูตร + ใบขายผูกครบ — ใช้เทส /campaigns/:id/report',
          status: 'ACTIVE',
          startDate,
          endDate,
          branch: 'โคราช',
          notes: 'seed demo full report',
          createdById: admin.id,
          vehicleModels: {
            create: [{ vehicleModelId: modelStd.id }, { vehicleModelId: modelLr.id }],
          },
        },
      });
    } else {
      for (const vmId of [modelStd.id, modelLr.id]) {
        await db.campaignVehicleModel.upsert({
          where: {
            campaignId_vehicleModelId: {
              campaignId: fullCampaign.id,
              vehicleModelId: vmId,
            },
          },
          update: {},
          create: { campaignId: fullCampaign.id, vehicleModelId: vmId },
        });
      }
    }
    console.log('✅ Full campaign:', fullCampaign.id);

    const formulaSpecs: Array<{
      vehicleModelId: string;
      name: string;
      operator: 'PERCENT' | 'FIXED';
      value: number;
      priceTarget: 'SELLING_PRICE' | 'COST_PRICE';
      sortOrder: number;
    }> = [
      { vehicleModelId: modelStd.id, name: 'Marketing 1%', operator: 'PERCENT', value: 1, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
      { vehicleModelId: modelStd.id, name: 'เปิดบูธ', operator: 'FIXED', value: 5000, priceTarget: 'SELLING_PRICE', sortOrder: 2 },
      { vehicleModelId: modelLr.id, name: 'Marketing 1%', operator: 'PERCENT', value: 1, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
      { vehicleModelId: modelLr.id, name: 'STOCK LEVEL 0.5%', operator: 'PERCENT', value: 0.5, priceTarget: 'COST_PRICE', sortOrder: 2 },
    ];

    for (const f of formulaSpecs) {
      const exists = await db.campaignModelFormula.findFirst({
        where: {
          campaignId: fullCampaign.id,
          vehicleModelId: f.vehicleModelId,
          name: f.name,
        },
      });
      if (!exists) {
        await db.campaignModelFormula.create({
          data: {
            campaignId: fullCampaign.id,
            vehicleModelId: f.vehicleModelId,
            name: f.name,
            operator: f.operator,
            value: f.value,
            priceTarget: f.priceTarget,
            sortOrder: f.sortOrder,
          },
        });
      }
    }
    console.log('✅ Full campaign formulas seeded');

    const stockDefs = [
      {
        vin: 'SEEDCAMPSTD0000001',
        engineNumber: 'ENG-SEED-STD-01',
        vehicleModelId: modelStd.id,
        baseCost: 950000,
        saleNumber: 'SL-SEED-CAMP-001',
        totalAmount: 1299000,
        financeCommission: 3000,
      },
      {
        vin: 'SEEDCAMPLR00000001',
        engineNumber: 'ENG-SEED-LR-01',
        vehicleModelId: modelLr.id,
        baseCost: 1150000,
        saleNumber: 'SL-SEED-CAMP-002',
        totalAmount: 1599000,
        financeCommission: 4500,
      },
    ];

    for (const def of stockDefs) {
      let stock = await db.stock.findUnique({ where: { vin: def.vin } });
      if (!stock) {
        stock = await db.stock.create({
          data: {
            stockNumber: `STK-SEED-${def.vin}`,
            vin: def.vin,
            engineNumber: def.engineNumber,
            vehicleModelId: def.vehicleModelId,
            exteriorColor: 'Pearl White',
            interiorColor: 'Black',
            status: 'SOLD',
            baseCost: def.baseCost,
            actualSalePrice: def.totalAmount,
            soldDate: demoSoldAt,
            arrivalDate: startDate,
          },
        });
      } else {
        stock = await db.stock.update({
          where: { id: stock.id },
          data: {
            status: 'SOLD',
            actualSalePrice: def.totalAmount,
            soldDate: demoSoldAt,
          },
        });
      }

      const existingSale = await db.sale.findUnique({ where: { saleNumber: def.saleNumber } });
      if (!existingSale) {
        const linked = await db.sale.findFirst({ where: { stockId: stock.id } });
        if (linked && linked.saleNumber !== def.saleNumber) {
          console.warn(`⚠️  Stock ${def.vin} already linked to ${linked.saleNumber}, skip sale create`);
          continue;
        }
        await db.sale.create({
          data: {
            saleNumber: def.saleNumber,
            type: 'DIRECT_SALE',
            status: 'COMPLETED',
            customerId: customer.id,
            stockId: stock.id,
            vehicleModelId: def.vehicleModelId,
            totalAmount: def.totalAmount,
            depositAmount: 0,
            paidAmount: def.totalAmount,
            remainingAmount: 0,
            completedDate: demoSoldAt,
            campaignId: fullCampaign.id,
            campaignSubsidySnapshot: 0,
            paymentMode: 'FINANCE',
            financeProvider: 'ธนาคารทดสอบ',
            financeCommission: def.financeCommission,
            createdById: admin.id,
          },
        });
        console.log(`✅ Demo sale ${def.saleNumber} → campaign ${fullCampaign.id}`);
      } else {
        await db.sale.update({
          where: { id: existingSale.id },
          data: {
            campaignId: fullCampaign.id,
            status: 'COMPLETED',
            completedDate: demoSoldAt,
            stockId: stock.id,
          },
        });
        console.log(`✅ Refresh demo sale ${def.saleNumber} dates → current month`);
      }
    }

    let emptySalesCampaign = await db.campaign.findFirst({
      where: { name: 'DEMO แคมเปญมีสูตรไม่มีขาย' },
    });
    if (!emptySalesCampaign) {
      emptySalesCampaign = await db.campaign.create({
        data: {
          name: 'DEMO แคมเปญมีสูตรไม่มีขาย',
          description: 'Seed: มีสูตรแต่ไม่มีใบขาย — รายงานจะว่างแถวรถ',
          status: 'ACTIVE',
          startDate,
          endDate,
          branch: 'โคราช',
          createdById: admin.id,
          vehicleModels: { create: [{ vehicleModelId: modelStd.id }] },
        },
      });
      await db.campaignModelFormula.create({
        data: {
          campaignId: emptySalesCampaign.id,
          vehicleModelId: modelStd.id,
          name: 'Marketing 1%',
          operator: 'PERCENT',
          value: 1,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 1,
        },
      });
      console.log('✅ Empty-sales campaign:', emptySalesCampaign.id);
    }

    let noFormulaCampaign = await db.campaign.findFirst({
      where: { name: 'DEMO แคมเปญมีขายไม่มีสูตร' },
    });
    if (!noFormulaCampaign) {
      noFormulaCampaign = await db.campaign.create({
        data: {
          name: 'DEMO แคมเปญมีขายไม่มีสูตร',
          description: 'Seed: มีใบขายแต่ไม่มีสูตร — รายงานไม่มีคอลัมน์สูตร',
          status: 'ACTIVE',
          startDate,
          endDate,
          branch: 'โคราช',
          createdById: admin.id,
          vehicleModels: { create: [{ vehicleModelId: modelLr.id }] },
        },
      });

      const vin = 'SEEDCAMPNOFORMULA01';
      let stock = await db.stock.findUnique({ where: { vin } });
      if (!stock) {
        stock = await db.stock.create({
          data: {
            stockNumber: 'STK-NOFORM',
            vin,
            engineNumber: 'ENG-SEED-NOFORM-01',
            vehicleModelId: modelLr.id,
            exteriorColor: 'Midnight Blue',
            status: 'SOLD',
            baseCost: 1150000,
            actualSalePrice: 1599000,
            soldDate: demoSoldAt,
            arrivalDate: startDate,
          },
        });
      } else {
        stock = await db.stock.update({
          where: { id: stock.id },
          data: { status: 'SOLD', soldDate: demoSoldAt, actualSalePrice: 1599000 },
        });
      }
      const saleNo = 'SL-SEED-CAMP-NOFORM';
      const existingNoForm = await db.sale.findUnique({ where: { saleNumber: saleNo } });
      if (!existingNoForm) {
        const linked = await db.sale.findFirst({ where: { stockId: stock.id } });
        if (!linked) {
          await db.sale.create({
            data: {
              saleNumber: saleNo,
              type: 'DIRECT_SALE',
              status: 'COMPLETED',
              customerId: customer.id,
              stockId: stock.id,
              vehicleModelId: modelLr.id,
              totalAmount: 1599000,
              depositAmount: 0,
              paidAmount: 1599000,
              remainingAmount: 0,
              completedDate: demoSoldAt,
              campaignId: noFormulaCampaign.id,
              paymentMode: 'CASH',
              createdById: admin.id,
            },
          });
        }
      } else {
        await db.sale.update({
          where: { id: existingNoForm.id },
          data: {
            campaignId: noFormulaCampaign.id,
            status: 'COMPLETED',
            completedDate: demoSoldAt,
            stockId: stock.id,
          },
        });
      }
      console.log('✅ No-formula campaign:', noFormulaCampaign.id);
    }
  }

  // -------------------------------------------------------------------------
  // Summary counts
  // -------------------------------------------------------------------------
  const counts = {
    users: await db.user.count(),
    customers: await db.customer.count(),
    vehicleModels: await db.vehicleModel.count(),
    stocks: await db.stock.count(),
    sales: await db.sale.count(),
    payments: await db.payment.count(),
    quotations: await db.quotation.count(),
    campaigns: await db.campaign.count(),
    bankAccounts: await db.bankAccount.count(),
    interestPeriods: await db.interestPeriod.count(),
    debtPayments: await db.stockDebtPayment.count(),
    activityLogs: await db.activityLog.count(),
  };

  console.log('');
  console.log('🎉 Database seed completed!');
  console.log('');
  console.log('📊 Record counts:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(18)} ${v}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📋 Test Credentials:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Admin:         admin / admin123');
  console.log('Sales Manager: manager1 / password123');
  console.log('Sales Staff:   sales1 / password123');
  console.log('Stock Staff:   stock1 / password123');
  console.log('Accountant:    account1 / password123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
