import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { vehicleService } from '../../services/vehicle.service';
import type { VehicleModel } from '../../services/vehicle.service';
import { MainLayout } from '../../components/layout';
import { useVehicleTypes } from '../../hooks/useVehicleTypes';
import { Plus, Search, Edit, Trash2, Car } from 'lucide-react';
import { useMutationHandler, useErrorHandler } from '../../hooks/useErrorHandler';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableContainer,
  TableWrapper,
  TableEmpty,
  TableLoading,
  TablePagination,
} from '@/components/ui/table';

export default function VehiclesListPage() {
  const { execute: executeQuery } = useErrorHandler();
  const { typeLabel } = useVehicleTypes();
  const { execute: executeDelete } = useMutationHandler('ลบรุ่นรถสำเร็จ');
  const [vehicles, setVehicles] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  useEffect(() => {
    fetchVehicles();
  }, [page]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchTerm !== undefined) {
        setPage(1);
        fetchVehicles();
      }
    }, 500);

    return () => clearTimeout(delayedSearch);
  }, [searchTerm]);

  const fetchVehicles = async () => {
    setLoading(true);
    const filters: any = {
      page,
      limit,
    };

    if (searchTerm) {
      filters.search = searchTerm;
    }

    await executeQuery(
      vehicleService.getAll(filters).then((response) => {
        setVehicles(response?.data || []);
        setTotalPages(response?.meta?.totalPages || 1);
        setTotal(response?.meta?.total || 0);
      })
    );
    setLoading(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`คุณต้องการลบรุ่นรถ "${name}" หรือไม่?`)) {
      return;
    }

    const result = await executeDelete(vehicleService.delete(id));
    if (result) fetchVehicles();
  };

  return (
    <MainLayout>
    <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">จัดการรุ่นรถยนต์</h1>
          <Link
            to="/vehicles/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            เพิ่มรุ่นรถใหม่
          </Link>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหารุ่นรถ (ยี่ห้อ, รุ่น, เวอร์ชัน)"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <TableContainer>
          <TableLoading />
        </TableContainer>
      ) : (
        <>
          <TableContainer>
            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รุ่นรถ</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead>ราคาขาย</TableHead>
                    <TableHead>ต้นทุน</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell>
                        <div className="flex items-center">
                          <div className="shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <Car className="h-5 w-5 text-blue-600" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {vehicle.brand} {vehicle.model} {vehicle.variant || ''}
                            </div>
                            <div className="text-sm text-gray-500">
                              ปี {vehicle.year}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          {typeLabel(vehicle.type)}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-gray-900">
                        {typeof vehicle.price === 'string'
                          ? new Intl.NumberFormat('th-TH', {
                              style: 'currency',
                              currency: 'THB',
                            }).format(parseFloat(vehicle.price))
                          : new Intl.NumberFormat('th-TH', {
                              style: 'currency',
                              currency: 'THB',
                            }).format(vehicle.price)
                        }
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {typeof vehicle.standardCost === 'string'
                          ? new Intl.NumberFormat('th-TH', {
                              style: 'currency',
                              currency: 'THB',
                            }).format(parseFloat(vehicle.standardCost))
                          : new Intl.NumberFormat('th-TH', {
                              style: 'currency',
                              currency: 'THB',
                            }).format(vehicle.standardCost)
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/vehicles/${vehicle.id}`}
                            className="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ดูรายละเอียด"
                          >
                            ดู
                          </Link>
                          <Link
                            to={`/vehicles/${vehicle.id}/edit`}
                            className="inline-flex items-center justify-center p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="แก้ไข"
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(vehicle.id, `${vehicle.brand} ${vehicle.model}`)}
                            className="inline-flex items-center justify-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="ลบ"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>

            {vehicles.length === 0 && (
              <TableEmpty
                icon={<Car className="h-12 w-12" />}
                title="ไม่พบรุ่นรถยนต์"
                description="เริ่มต้นด้วยการเพิ่มรุ่นรถใหม่"
              />
            )}

            {totalPages > 1 && (
              <TablePagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={limit}
                onPageChange={setPage}
              />
            )}
          </TableContainer>
        </>
      )}
    </MainLayout>
  );
}
