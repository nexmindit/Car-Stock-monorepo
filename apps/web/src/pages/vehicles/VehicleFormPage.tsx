import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { vehicleService } from '../../services/vehicle.service';
import { MainLayout } from '../../components/layout';
import { ArrowLeft, Save } from 'lucide-react';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useToast } from '../../components/toast';
import { useVehicleTypes } from '../../hooks/useVehicleTypes';

export default function VehicleFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { addToast } = useToast();
  const { execute: executeQuery } = useErrorHandler({ showToast: true });
  const { activeTypes, allTypes } = useVehicleTypes();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    variant: '',
    year: new Date().getFullYear(),
    type: '',
    primaryColor: '',
    secondaryColor: '',
    colorNotes: '',
    mainOptions: '',
    engineSpecs: '',
    dimensions: '',
    price: '' as number | '',
    standardCost: '' as number | '',
    targetMargin: '' as number | '',
    notes: '',
  });

  useEffect(() => {
    if (isEdit && id) {
      fetchVehicle(id);
    }
  }, [id, isEdit]);

  const fetchVehicle = async (vehicleId: string) => {
    setLoading(true);
    await executeQuery(
      vehicleService.getById(vehicleId).then(vehicle => {
        setFormData({
          brand: vehicle.brand,
          model: vehicle.model,
          variant: vehicle.variant || '',
          year: vehicle.year,
          type: vehicle.type,
          primaryColor: vehicle.primaryColor || '',
          secondaryColor: vehicle.secondaryColor || '',
          colorNotes: vehicle.colorNotes || '',
          mainOptions: vehicle.mainOptions || '',
          engineSpecs: vehicle.engineSpecs || '',
          dimensions: vehicle.dimensions || '',
          price: typeof vehicle.price === 'string' ? parseFloat(vehicle.price) : vehicle.price,
          standardCost: typeof vehicle.standardCost === 'string' ? parseFloat(vehicle.standardCost) : vehicle.standardCost,
          targetMargin: vehicle.targetMargin ? (typeof vehicle.targetMargin === 'string' ? parseFloat(vehicle.targetMargin) : vehicle.targetMargin) : 0,
          notes: vehicle.notes || '',
        });
      })
    );
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'year'
        ? Number(value)
        : ['price', 'standardCost', 'targetMargin'].includes(name)
          ? (value === '' ? '' : Number(value))
          : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard against double-submit: the submit button (outside the <form>) and
    // the form's own onSubmit (Enter key inside fields) both call this handler.
    if (saving) return;
    if (!formData.type) {
      addToast('กรุณาเลือกประเภทรถ', 'error');
      return;
    }
    setSaving(true);

    const data = {
      brand: formData.brand,
      model: formData.model,
      variant: formData.variant || undefined,
      year: formData.year,
      type: formData.type,
      primaryColor: formData.primaryColor || undefined,
      secondaryColor: formData.secondaryColor || undefined,
      colorNotes: formData.colorNotes || undefined,
      mainOptions: formData.mainOptions || undefined,
      engineSpecs: formData.engineSpecs || undefined,
      dimensions: formData.dimensions || undefined,
      price: formData.price === '' ? 0 : Number(formData.price),
      standardCost: formData.standardCost === '' ? 0 : Number(formData.standardCost),
      targetMargin: formData.targetMargin === '' ? undefined : Number(formData.targetMargin),
      notes: formData.notes || undefined,
    };

    let result;
    if (isEdit && id) {
      result = await executeQuery(vehicleService.update(id, data));
      if (result) addToast('อัปเดตข้อมูลรุ่นรถสำเร็จ', 'success');
    } else {
      result = await executeQuery(vehicleService.create(data));
      if (result) addToast('เพิ่มรุ่นรถใหม่สำเร็จ', 'success');
    }
    if (result) navigate('/vehicles');
    setSaving(false);
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
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'แก้ไขข้อมูลรุ่นรถ' : 'เพิ่มรุ่นรถใหม่'}
        </h1>
      </div>

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Basic Vehicle Information */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">ข้อมูลพื้นฐานรถยนต์</h2>
              <p className="text-sm text-gray-500 mt-1">ระบุข้อมูลพื้นฐานของรถและรายละเอียดการผลิต</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ยี่ห้อ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  รุ่น <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="model"
                  value={formData.model}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  แบบรถ
                </label>
                <input
                  type="text"
                  name="variant"
                  value={formData.variant}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ปี <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="year"
                  value={formData.year}
                  onChange={handleChange}
                  required
                  min="1900"
                  max="2100"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ประเภท <span className="text-red-500">*</span>
                </label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
                >
                  <option value="">-- เลือกประเภท --</option>
                  {activeTypes.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.nameTh}
                    </option>
                  ))}
                  {/* Keep a model's current type selectable even after it was deactivated */}
                  {formData.type &&
                    !activeTypes.some((t) => t.code === formData.type) && (
                      <option value={formData.type}>
                        {allTypes.find((t) => t.code === formData.type)?.nameTh ?? formData.type}{' '}
                        (ปิดใช้งาน)
                      </option>
                    )}
                </select>
              </div>
            </div>
          </form>
        </section>

        {/* Color Information */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">ข้อมูลสี</h2>
            <p className="text-sm text-gray-500 mt-1">ระบุสีและตัวเลือกสีต่าง ๆ ของรุ่นรถ</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                สีหลัก
              </label>
              <input
                type="text"
                name="primaryColor"
                value={formData.primaryColor}
                onChange={handleChange}
                placeholder="เช่น แดง, ขาว, ดำ"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                สีรอง
              </label>
              <input
                type="text"
                name="secondaryColor"
                value={formData.secondaryColor}
                onChange={handleChange}
                placeholder="เช่น เทา, เงิน"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                หมายเหตุเรื่องสี
              </label>
              <input
                type="text"
                name="colorNotes"
                value={formData.colorNotes}
                onChange={handleChange}
                placeholder="รายละเอียดเพิ่มเติมเกี่ยวกับสี"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              />
            </div>
          </div>
        </section>

        {/* Specifications */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">ข้อมูลจำเพาะ</h2>
            <p className="text-sm text-gray-500 mt-1">ระบุข้อมูลทางเทคนิคและคุณสมบัติของรถ</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ออพชั่นหลัก
              </label>
              <input
                type="text"
                name="mainOptions"
                value={formData.mainOptions}
                onChange={handleChange}
                placeholder="เช่น ระบบนำทาง, เครื่องเสียง, ถุงลมนิรภัย"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ข้อมูลเครื่องยนต์
              </label>
              <input
                type="text"
                name="engineSpecs"
                value={formData.engineSpecs}
                onChange={handleChange}
                placeholder="เช่น 2.0L Turbo, 150 HP, Hybrid"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ขนาดและมิติ
              </label>
              <input
                type="text"
                name="dimensions"
                value={formData.dimensions}
                onChange={handleChange}
                placeholder="เช่น ความยาว 4,500mm, กว้าง 1,800mm, สูง 1,450mm"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              />
            </div>
          </div>
        </section>

        {/* Financial Information */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">ข้อมูลการเงิน</h2>
            <p className="text-sm text-gray-500 mt-1">ระบุราคาขาย, ต้นทุน และกำไรเป้าหมาย</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ราคาขาย (บาท) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ต้นทุนมาตรฐาน (บาท) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="standardCost"
                value={formData.standardCost}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                อัตรากำไรเป้าหมาย (%)
              </label>
              <input
                type="number"
                name="targetMargin"
                value={formData.targetMargin}
                onChange={handleChange}
                min="0"
                max="100"
                step="0.01"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
              />
            </div>
          </div>
        </section>

        {/* Additional Notes */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 lg:p-8 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">หมายเหตุเพิ่มเติม</h2>
            <p className="text-sm text-gray-500 mt-1">ข้อมูลเพิ่มเติมเกี่ยวกับรุ่นรถ</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              หมายเหตุ
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              placeholder="รายละเอียดเพิ่มเติมเกี่ยวกับรุ่นรถ"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-900"
            />
          </div>

          {/* Form Actions */}
          <div className="flex flex-wrap justify-end gap-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/vehicles')}
              className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSubmit}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Save className="w-5 h-5 mr-2" />
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
