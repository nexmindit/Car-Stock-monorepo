import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { MainLayout } from '../../components/layout';
import { usePermission } from '../../hooks/usePermission';
import { campaignService } from '../../services/campaign.service';
import type { Campaign } from '../../services/campaign.service';
import { Plus, Search, Eye, Edit, Trash2, Calendar, BarChart3, Copy, Printer } from 'lucide-react';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useToast } from '../../components/toast';

const statusColors = {
  DRAFT: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-green-100 text-green-800',
  ENDED: 'bg-red-100 text-red-800',
};

const statusLabels = {
  DRAFT: 'แบบร่าง',
  ACTIVE: 'กำลังดำเนินการ',
  ENDED: 'สิ้นสุดแล้ว',
};

export const CampaignsListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('CAMPAIGN_CREATE');
  const canUpdate = hasPermission('CAMPAIGN_UPDATE');
  const canDelete = hasPermission('CAMPAIGN_DELETE');
  const { addToast } = useToast();
  const { execute: executeQuery } = useErrorHandler({ showToast: true });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  const { data: branchOptions = [] } = useQuery({
    queryKey: ['campaign-branches'],
    queryFn: () => campaignService.getBranches(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaigns', page, search, branchFilter],
    queryFn: () => campaignService.getAll({ page, limit: 20, search, branch: branchFilter || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => campaignService.duplicate(id),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      navigate(`/campaigns/${created.id}/edit`);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleDelete = async (campaign: Campaign) => {
    if (campaign.salesCount > 0) {
      addToast('ไม่สามารถลบแคมเปญที่มีการขายได้', 'error');
      return;
    }
    if (window.confirm(`ต้องการลบแคมเปญ "${campaign.name}" หรือไม่?`)) {
      await executeQuery(deleteMutation.mutateAsync(campaign.id));
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (error) {
    return (
      <MainLayout>
        <div className="text-center text-red-600 py-8">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">จัดการแคมเปญ</h1>
            <p className="text-gray-600 mt-1">วิเคราะห์ยอดขายตามแคมเปญและรุ่นรถยนต์</p>
          </div>
          {canCreate && (
            <Link
              to="/campaigns/new"
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              สร้างแคมเปญ
            </Link>
          )}
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow p-4">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="ค้นหาแคมเปญ..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={branchFilter}
              onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">ทุกสาขา</option>
              {branchOptions.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              ค้นหา
            </button>
          </form>
        </div>

        {data?.data?.some((c) => c.status === 'DRAFT') && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
            มีแคมเปญสถานะ <b>แบบร่าง</b> ซึ่งยังไม่ถูกนำไปคำนวณในรายงาน — กดแก้ไขแล้วเปลี่ยนสถานะเป็น "กำลังดำเนินการ"
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="text-center py-8">กำลังโหลด...</div>
          ) : data?.data?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">ไม่พบแคมเปญ</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ชื่อแคมเปญ
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ระยะเวลา
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      สถานะ
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      รุ่นรถยนต์
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ยอดขาย
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      สาขา
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      การดำเนินการ
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data?.data.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-gray-900">{campaign.name}</div>
                          {campaign.description && (
                            <div className="text-sm text-gray-500 truncate max-w-xs">
                              {campaign.description}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="w-4 h-4 mr-2" />
                          {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 text-sm font-semibold rounded-full ${
                            statusColors[campaign.status]
                          }`}
                          title={campaign.status === 'DRAFT' ? 'แบบร่าง: ยังไม่ถูกนำไปคำนวณในรายงาน' : undefined}
                        >
                          {statusLabels[campaign.status] ?? campaign.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {campaign.vehicleModels.length} รุ่น
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {campaign.salesCount} รายการ
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {campaign.branch || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => navigate(`/campaigns/${campaign.id}`)}
                            className="text-blue-600 hover:text-blue-900 p-1"
                            title="ดูรายละเอียด"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => navigate(`/campaigns/${campaign.id}/report`)}
                            className="text-purple-600 hover:text-purple-900 p-1"
                            title="ดูรายงาน"
                          >
                            <Printer className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => navigate(`/campaigns/${campaign.id}/analytics`)}
                            className="text-green-600 hover:text-green-900 p-1"
                            title="ดูสถิติ"
                          >
                            <BarChart3 className="w-5 h-5" />
                          </button>
                          {canUpdate && (
                            <button
                              onClick={() => navigate(`/campaigns/${campaign.id}/edit`)}
                              className="text-yellow-600 hover:text-yellow-900 p-1"
                              title="แก้ไข"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                          )}
                          {canCreate && (
                            <button
                              onClick={() => duplicateMutation.mutate(campaign.id)}
                              disabled={duplicateMutation.isPending}
                              className="text-gray-600 hover:text-blue-600 disabled:opacity-50"
                              title="ทำสำเนา"
                            >
                              <Copy className="w-5 h-5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(campaign)}
                              className="text-red-600 hover:text-red-900 p-1"
                              title="ลบ"
                              disabled={campaign.salesCount > 0}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {data && data.meta.totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={!data.meta.hasPrevPage}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  ก่อนหน้า
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={!data.meta.hasNextPage}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  ถัดไป
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    แสดง <span className="font-medium">{(page - 1) * data.meta.limit + 1}</span> ถึง{' '}
                    <span className="font-medium">
                      {Math.min(page * data.meta.limit, data.meta.total)}
                    </span>{' '}
                    จาก <span className="font-medium">{data.meta.total}</span> รายการ
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={!data.meta.hasPrevPage}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={!data.meta.hasNextPage}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default CampaignsListPage;
