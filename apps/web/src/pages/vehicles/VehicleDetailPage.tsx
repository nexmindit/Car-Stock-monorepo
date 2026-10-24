import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { vehicleService } from '../../services/vehicle.service';
import type { VehicleModel } from '../../services/vehicle.service';
import { MainLayout } from '../../components/layout';
import { useVehicleTypes } from '../../hooks/useVehicleTypes';
import { ArrowLeft, Edit, Car, Calendar, Tag } from 'lucide-react';
import { useErrorHandler } from '../../hooks/useErrorHandler';

export default function VehicleDetailPage() {
  const { typeLabel } = useVehicleTypes();
  const { id } = useParams();
  const navigate = useNavigate();
  const { execute: executeQuery } = useErrorHandler({ showToast: true });
  const [vehicle, setVehicle] = useState<VehicleModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchVehicle(id);
    }
  }, [id]);

  const fetchVehicle = async (vehicleId: string) => {
    setLoading(true);
    const result = await executeQuery(vehicleService.getById(vehicleId));
    if (!result) {
      navigate('/vehicles');
    } else {
      setVehicle(result);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">กำลังโหลด...</p>
        </div>
      </MainLayout>
    );
  }

  if (!vehicle) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">ไม่พบข้อมูลรุ่นรถ</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        <button
          onClick={() => navigate('/vehicles')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          กลับ
        </button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {vehicle.brand} {vehicle.model} {vehicle.variant || ''}
            </h1>
            <p className="text-gray-600">ปี {vehicle.year}</p>
          </div>
          <Link
            to={`/vehicles/${vehicle.id}/edit`}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Edit className="w-5 h-5 mr-2" />
            แก้ไข
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">ข้อมูลทั่วไป</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start">
                <Car className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">ยี่ห้อ</p>
                  <p className="text-gray-900">{vehicle.brand}</p>
                </div>
              </div>

              <div className="flex items-start">
                <Car className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">รุ่น</p>
                  <p className="text-gray-900">{vehicle.model}</p>
                </div>
              </div>

              {vehicle.variant && (
                <div className="flex items-start">
                  <Tag className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">แบบรถ</p>
                    <p className="text-gray-900">{vehicle.variant}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">ปี</p>
                  <p className="text-gray-900">{vehicle.year}</p>
                </div>
              </div>

              <div className="flex items-start">
                <Tag className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">ประเภท</p>
                  <p className="text-gray-900">{typeLabel(vehicle.type)}</p>
                </div>
              </div>

              <div className="flex items-start">
                <Tag className="h-5 w-5 text-gray-400 mt-1 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">ราคาขาย</p>
                  <p className="text-gray-900">
                    {new Intl.NumberFormat('th-TH', {
                      style: 'currency',
                      currency: 'THB',
                    }).format(Number(vehicle.price))}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {vehicle.notes && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">หมายเหตุ</h2>
              <p className="text-gray-900">{vehicle.notes}</p>
            </div>
          )}

          {vehicle.primaryColor && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">สี</h2>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-500">สีหลัก</p>
                  <p className="text-gray-900">{vehicle.primaryColor}</p>
                </div>
                {vehicle.secondaryColor && (
                  <div>
                    <p className="text-sm text-gray-500">สีรอง</p>
                    <p className="text-gray-900">{vehicle.secondaryColor}</p>
                  </div>
                )}
                {vehicle.colorNotes && (
                  <div>
                    <p className="text-sm text-gray-500">หมายเหตุสี</p>
                    <p className="text-gray-900">{vehicle.colorNotes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {vehicle.engineSpecs && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">ข้อมูลจำเพาะ</h2>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-500">สเปคเครื่องยนต์</p>
                  <p className="text-gray-900">{vehicle.engineSpecs}</p>
                </div>
                {vehicle.dimensions && (
                  <div>
                    <p className="text-sm text-gray-500">ขนาด</p>
                    <p className="text-gray-900">{vehicle.dimensions}</p>
                  </div>
                )}
                {vehicle.mainOptions && (
                  <div>
                    <p className="text-sm text-gray-500">ออปชั่นหลัก</p>
                    <p className="text-gray-900">{vehicle.mainOptions}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Stock ที่เกี่ยวข้อง</h2>
            <p className="text-gray-500 text-center py-8">
              ไม่มีข้อมูล Stock ที่เกี่ยวข้อง
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">สรุปข้อมูล</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <span className="text-sm text-gray-600">ราคาขาย</span>
                <span className="font-medium text-gray-900">
                  {new Intl.NumberFormat('th-TH', {
                    style: 'currency',
                    currency: 'THB',
                  }).format(Number(vehicle.price))}
                </span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <span className="text-sm text-gray-600">ต้นทุนมาตรฐาน</span>
                <span className="font-medium text-gray-900">
                  {new Intl.NumberFormat('th-TH', {
                    style: 'currency',
                    currency: 'THB',
                  }).format(Number(vehicle.standardCost))}
                </span>
              </div>
              {vehicle.targetMargin && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Margin เป้าหมาย</span>
                  <span className="font-medium text-gray-900">
                    {Number(vehicle.targetMargin).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">การดำเนินการ</h2>
            <div className="space-y-2">
              <Link
                to={`/stock/new?vehicleModelId=${vehicle.id}`}
                className="block w-full px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700"
              >
                เพิ่ม Stock
              </Link>
              <Link
                to={`/sales/new?vehicleModelId=${vehicle.id}`}
                className="block w-full px-4 py-2 bg-green-600 text-white text-center rounded-lg hover:bg-green-700"
              >
                สร้างใบสั่งซื้อ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
