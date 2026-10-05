import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '../../components/layout';
import { CampaignModelPicker } from '../../components/campaigns/CampaignModelPicker';
import { campaignService } from '../../services/campaign.service';
import type { CreateCampaignData, UpdateCampaignData } from '../../services/campaign.service';
import { ArrowLeft, Save, X } from 'lucide-react';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { DatePicker } from '../../components/ui/date-picker';

export const CampaignFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);
  const { execute: executeQuery } = useErrorHandler({ showToast: true });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    status: 'DRAFT' as 'DRAFT' | 'ACTIVE' | 'ENDED',
    notes: '',
    branch: '',
    vehicleModelIds: [] as string[],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: campaign, isLoading: loadingCampaign } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignService.getById(id!),
    enabled: isEdit,
  });

  const { data: branchOptions = [] } = useQuery({
    queryKey: ['campaign-branches'],
    queryFn: () => campaignService.getBranches(),
  });

  useEffect(() => {
    if (campaign) {
      setFormData({
        name: campaign.name,
        description: campaign.description || '',
        startDate: campaign.startDate.split('T')[0],
        endDate: campaign.endDate.split('T')[0],
        status: campaign.status,
        notes: campaign.notes || '',
        branch: campaign.branch || '',
        vehicleModelIds: campaign.vehicleModels.map((vm) => vm.id),
      });
    }
  }, [campaign]);

  const createMutation = useMutation({
    mutationFn: (data: CreateCampaignData) => campaignService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      navigate('/campaigns');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateCampaignData) => campaignService.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      navigate('/campaigns');
    },
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'กรุณากรอกชื่อแคมเปญ';
    if (!formData.startDate) newErrors.startDate = 'กรุณาเลือกวันเริ่มต้น';
    if (!formData.endDate) newErrors.endDate = 'กรุณาเลือกวันสิ้นสุด';
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (start > end) {
        newErrors.endDate = 'วันสิ้นสุดต้องมากกว่าวันเริ่มต้น';
      }
    }
    if (formData.vehicleModelIds.length === 0) {
      newErrors.vehicleModelIds = 'กรุณาเลือกอย่างน้อย 1 รุ่นรถยนต์';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const data = {
      name: formData.name,
      description: formData.description || undefined,
      startDate: formData.startDate,
      endDate: formData.endDate,
      notes: formData.notes || undefined,
      branch: formData.branch.trim() || undefined,
      vehicleModelIds: formData.vehicleModelIds,
      ...(isEdit && { status: formData.status }),
    };

    await executeQuery(
      isEdit ? updateMutation.mutateAsync(data) : createMutation.mutateAsync(data)
    );
  };

  if (isEdit && loadingCampaign) {
    return (
      <MainLayout>
        <div className="text-center py-8">กำลังโหลด...</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/campaigns')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEdit ? 'แก้ไขแคมเปญ' : 'สร้างแคมเปญใหม่'}
            </h1>
            <p className="text-gray-600 mt-1">
              {isEdit ? 'แก้ไขข้อมูลแคมเปญและรุ่นรถยนต์' : 'กำหนดแคมเปญสำหรับวิเคราะห์ยอดขาย'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">ข้อมูลแคมเปญ</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ชื่อแคมเปญ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="เช่น โปรโมชั่นปีใหม่ 2568"
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="รายละเอียดเพิ่มเติมของแคมเปญ"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันเริ่มต้น <span className="text-red-500">*</span>
                </label>
                <DatePicker
                  value={formData.startDate}
                  onChange={(v) => setFormData({ ...formData, startDate: v })}
                  inputClassName={`w-full ${errors.startDate ? '!border-red-500' : ''}`}
                />
                {errors.startDate && (
                  <p className="text-red-500 text-sm mt-1">{errors.startDate}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันสิ้นสุด <span className="text-red-500">*</span>
                </label>
                <DatePicker
                  value={formData.endDate}
                  onChange={(v) => setFormData({ ...formData, endDate: v })}
                  inputClassName={`w-full ${errors.endDate ? '!border-red-500' : ''}`}
                />
                {errors.endDate && (
                  <p className="text-red-500 text-sm mt-1">{errors.endDate}</p>
                )}
              </div>
            </div>

            {isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as 'DRAFT' | 'ACTIVE' | 'ENDED',
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="DRAFT">แบบร่าง</option>
                  <option value="ACTIVE">กำลังดำเนินการ</option>
                  <option value="ENDED">สิ้นสุดแล้ว</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="หมายเหตุเพิ่มเติม"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สาขา</label>
              <input
                type="text"
                list="campaign-branch-options"
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น สำนักงานใหญ่"
              />
              <datalist id="campaign-branch-options">
                {branchOptions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">
              รุ่นรถยนต์ในแคมเปญ <span className="text-red-500">*</span>
            </h2>
            <p className="text-sm text-gray-500 mb-2">
              ค้นหาหรือกรองยี่ห้อแล้วติ๊กเลือกรุ่น — รุ่นที่เลือกจะอยู่ด้านบนเสมอ แม้จะเปลี่ยนตัวกรอง
            </p>
            <CampaignModelPicker
              selectedIds={formData.vehicleModelIds}
              onChange={(ids) => setFormData((prev) => ({ ...prev, vehicleModelIds: ids }))}
              initialSelectedModels={campaign?.vehicleModels}
              error={errors.vehicleModelIds}
            />
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/campaigns')}
              className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <X className="w-5 h-5" />
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {createMutation.isPending || updateMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
};

export default CampaignFormPage;
