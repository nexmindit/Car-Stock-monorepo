import {
  Ban,
  Banknote,
  CalendarDays,
  ClipboardList,
  Landmark,
  Lock,
  Megaphone,
  Package,
  Percent,
  ShoppingCart,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { useAuth } from '../../contexts/AuthContext';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  color: string;
  bgColor: string;
  permission: string[];
}

const REPORTS: ReportCard[] = [
  {
    id: 'daily-payments',
    title: 'รายงานรายวันรับเงินมัดจำ',
    description: 'รายงานการรับชำระเงิน แยกตามวันที่และวิธีการชำระ',
    icon: <Banknote className="w-8 h-8" />,
    path: '/reports/daily-payments',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    permission: ['ADMIN', 'ACCOUNTANT'],
  },
  {
    id: 'stock',
    title: 'รายงานสต็อก',
    description: 'รายงานสถานะรถในสต็อก แยกตามยี่ห้อและสถานะ',
    icon: <Package className="w-8 h-8" />,
    path: '/reports/stock',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    permission: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF'],
  },
  {
    id: 'profit-loss',
    title: 'รายงานกำไร-ขาดทุน',
    description: 'รายงานผลกำไร-ขาดทุนจากการขาย รวมต้นทุนดอกเบี้ย',
    icon: <TrendingUp className="w-8 h-8" />,
    path: '/reports/profit-loss',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    permission: ['ADMIN', 'SALES_MANAGER'],
  },
  {
    id: 'sales-summary',
    title: 'รายงานสรุปยอดขาย',
    description: 'สรุปยอดขายรวม แยกตามพนักงานขายและสถานะ',
    icon: <ShoppingCart className="w-8 h-8" />,
    path: '/reports/sales-summary',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    permission: ['ADMIN', 'SALES_MANAGER'],
  },
  {
    id: 'cancelled-sales',
    title: 'รายงานลูกค้ายกเลิก',
    description: 'ลูกค้าที่ยกเลิกการจอง/ซื้อ พร้อมยอดเงินที่รับไว้ สำหรับคืนเงิน',
    icon: <Ban className="w-8 h-8" />,
    path: '/reports/cancelled-sales',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    permission: ['ADMIN', 'SALES_MANAGER', 'ACCOUNTANT'],
  },
  {
    id: 'stock-interest',
    title: 'รายงานดอกเบี้ยสต็อก',
    description: 'รายงานดอกเบี้ยสะสมของรถในสต็อก ดอกเบี้ยที่จ่ายและค้างจ่าย',
    icon: <Percent className="w-8 h-8" />,
    path: '/reports/stock-interest',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    permission: ['ADMIN', 'ACCOUNTANT', 'STOCK_STAFF'],
  },
  {
    id: 'purchase-requirement',
    title: 'รายงานความต้องการซื้อรถ',
    description: 'แสดงรุ่นรถที่ต้องซื้อเพิ่มจากการเปรียบเทียบการจองกับสต็อก',
    icon: <Truck className="w-8 h-8" />,
    path: '/reports/purchase-requirement',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    permission: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF'],
  },
  {
    id: 'daily-stock-snapshot',
    title: 'รายงานสต็อกประจำวัน',
    description: 'ยอดจอง สต็อกคงเหลือ และยอดที่ต้องสั่งซื้อ แยกตามสี',
    icon: <CalendarDays className="w-8 h-8" />,
    path: '/reports/daily-stock-snapshot',
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
    permission: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF'],
  },
  {
    id: 'monthly-purchases',
    title: 'รายงานรายการซื้อประจำเดือน',
    description: 'รายการรถที่รับเข้าในเดือนที่เลือก',
    icon: <ClipboardList className="w-8 h-8" />,
    path: '/reports/monthly-purchases',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    permission: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF'],
  },
  {
    id: 'campaign-claims',
    title: 'รายงานเบิกแคมเปญ (ส่ง Brand)',
    description: 'รายงานเบิกเงินส่งเสริมการขายประจำเดือน แยกตามยี่ห้อ',
    icon: <Megaphone className="w-8 h-8" />,
    path: '/reports/campaign-claims',
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
    permission: ['ADMIN', 'SALES_MANAGER', 'ACCOUNTANT', 'SALES_STAFF'],
  },
  {
    id: 'bank-interest',
    title: 'รายงานคำนวณดอกเบี้ยธนาคาร',
    description: 'คำนวณดอกเบี้ยไฟแนนซ์รถในสต็อกต่องวด แบบเดียวกับใบแจ้งของธนาคาร',
    icon: <Landmark className="w-8 h-8" />,
    path: '/reports/bank-interest',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    permission: ['ADMIN', 'ACCOUNTANT', 'STOCK_STAFF'],
  },
];

export default function ReportsPage() {
  const { user } = useAuth();
  const userRole = user?.role || '';

  const hasAccess = (permission: string[]) => {
    return permission.includes(userRole);
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">รายงาน</h1>
        <p className="text-gray-600 mt-1">เลือกรายงานที่ต้องการดู</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {REPORTS.map((report) => {
          const canAccess = hasAccess(report.permission);

          if (!canAccess) {
            return (
              <div
                key={report.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 opacity-50 cursor-not-allowed"
              >
                <div className="flex items-start">
                  <div className={`p-3 rounded-lg bg-gray-100`}>
                    <Lock className="w-8 h-8 text-gray-400" />
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-lg font-semibold text-gray-600">{report.title}</h3>
                    <p className="text-sm text-gray-400 mt-1">{report.description}</p>
                    <p className="text-xs text-gray-400 mt-2">ไม่มีสิทธิ์เข้าถึง</p>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={report.id}
              to={report.path}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-gray-300 transition-all"
            >
              <div className="flex items-start">
                <div className={`p-3 rounded-lg ${report.bgColor}`}>
                  <span className={report.color}>{report.icon}</span>
                </div>
                <div className="ml-4 flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{report.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{report.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </MainLayout>
  );
}
