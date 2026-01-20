
import React, { useState, useMemo } from 'react';
import { db, checkPermission } from '../services/db';
import { Block, BlockStatus, StaffMember } from '../types';
import { exportToExcel } from '../services/utils';

interface Props {
  blocks: Block[];
  onRefresh: () => void;
  isGuest?: boolean;
  activeStaff: StaffMember;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const YEARS = [2024, 2025, 2026];

export const SoldHistory: React.FC<Props> = ({ blocks, onRefresh, isGuest, activeStaff }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const uniqueCompanies = useMemo(() => {
    return Array.from(new Set(blocks.filter(b => b.status === BlockStatus.SOLD).map(b => b.company))).sort();
  }, [blocks]);

  const soldBlocks = useMemo(() => {
    return blocks
      .filter(b => b.status === BlockStatus.SOLD)
      .filter(b => selectedCompany === 'ALL' ? true : b.company === selectedCompany)
      .filter(b => {
        if (!b.soldAt) return true;
        const date = new Date(b.soldAt);
        const monthMatch = selectedMonth === 'ALL' ? true : date.getMonth() === parseInt(selectedMonth);
        const yearMatch = selectedYear === 'ALL' ? true : date.getFullYear() === parseInt(selectedYear);
        return monthMatch && yearMatch;
      })
      .filter(b => 
        b.soldTo?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        b.billNo?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        b.jobNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.company.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => new Date(b.soldAt!).getTime() - new Date(a.soldAt!).getTime());
  }, [blocks, searchTerm, selectedCompany, selectedMonth, selectedYear]);

  const handleDelete = async (id: string, company: string) => {
    if (isGuest || !checkPermission(activeStaff, company)) return;
    if (!window.confirm("PERMANENTLY DELETE RECORD?")) return;
    setDeletingId(id);
    try { await db.deleteBlock(id); onRefresh(); } catch (err) { alert("Delete failed."); } finally { setDeletingId(null); }
  };

  const handleExportExcel = () => {
    const reportData = soldBlocks.map(b => {
      const soldSqFt = b.totalSqFt || 0;
      let remainingSqFt = 0;
      const lastPIndex = b.jobNo.lastIndexOf('-P');
      if (lastPIndex !== -1) {
        const potentialParentJobNo = b.jobNo.substring(0, lastPIndex);
        const parentBlock = blocks.find(k => k.jobNo === potentialParentJobNo && k.company === b.company && k.status === BlockStatus.IN_STOCKYARD);
        if (parentBlock) remainingSqFt = parentBlock.totalSqFt || 0;
      }
      return {
        date: new Date(b.soldAt!).toLocaleDateString(), 
        billNo: b.billNo, 
        customer: b.soldTo, 
        jobNo: b.jobNo,
        company: b.company, 
        material: b.material, 
        totalStock: (soldSqFt + remainingSqFt).toFixed(2),
        soldSqFt: soldSqFt.toFixed(2), 
        remainingSqFt: remainingSqFt.toFixed(2),
        operator: b.enteredBy
      };
    });

    const columns = [
      { header: 'Date', key: 'date', width: 12 }, 
      { header: 'Bill No', key: 'billNo', width: 15 },
      { header: 'Customer', key: 'customer', width: 25 }, 
      { header: 'Job No', key: 'jobNo', width: 20 },
      { header: 'Company', key: 'company', width: 20 }, 
      { header: 'Material', key: 'material', width: 20 },
      { header: 'Total Stock (SqFt)', key: 'totalStock', width: 15 }, 
      { header: 'Sold Area (SqFt)', key: 'soldSqFt', width: 15 },
      { header: 'Remaining (SqFt)', key: 'remainingSqFt', width: 15 }, 
      { header: 'Operator', key: 'operator', width: 15 },
    ];
    const fileNameMonth = selectedMonth !== 'ALL' ? MONTHS[parseInt(selectedMonth)] : 'All';
    const fileNameYear = selectedYear !== 'ALL' ? selectedYear : 'All';
    exportToExcel(reportData, columns, 'Sales Ledger', `Sales_Report_${fileNameMonth}_${fileNameYear}_${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-3xl font-semibold text-[#5c4033] tracking-tight">
            <i className="fas fa-file-invoice-dollar text-[#a8a29e] mr-4"></i> Sales History
          </h2>
        </div>
        
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full lg:w-auto">
          <div className="flex gap-2 w-full sm:w-auto">
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-white border border-[#d6d3d1] text-[#44403c] rounded-lg px-3 py-3 font-medium text-xs flex-1 sm:w-32 shadow-sm">
              <option value="ALL">All Months</option>
              {MONTHS.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-white border border-[#d6d3d1] text-[#44403c] rounded-lg px-3 py-3 font-medium text-xs flex-1 sm:w-28 shadow-sm">
              <option value="ALL">All Years</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} className="bg-white border border-[#d6d3d1] text-[#44403c] rounded-lg px-4 py-3 font-medium text-xs w-full sm:w-48 shadow-sm">
            <option value="ALL">All Companies</option>
            {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-2 w-full sm:w-auto">
             <button onClick={handleExportExcel} className="bg-white border border-[#d6d3d1] hover:bg-stone-50 px-5 py-3 rounded-lg flex items-center justify-center gap-2 font-medium text-xs shadow-sm flex-1"><i className="fas fa-file-excel text-lg text-green-600"></i><span>Export Ledger</span></button>
             <div className="relative flex-1 sm:w-64">
               <input type="text" placeholder="Search..." className="w-full bg-white border border-[#d6d3d1] rounded-lg px-4 py-3 text-xs font-medium focus:outline-none pl-10 shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
               <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e] text-[10px]"></i>
             </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-start mb-8">
        <div className="bg-white border border-[#d6d3d1] p-6 rounded-xl shadow-sm min-w-[300px]">
          <div className="text-[10px] text-[#a8a29e] font-medium mb-2 uppercase tracking-widest">Total Area Sold (Sq.Ft)</div>
          <div className="text-4xl font-semibold text-[#5c4033]">
            {soldBlocks.reduce((a, b) => a + (b.totalSqFt || 0), 0).toFixed(2)}
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#d6d3d1] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#f5f5f4] text-[#78716c] text-xs font-medium border-b">
                <th className="px-8 py-5">Sale Date</th>
                <th className="px-8 py-5">Bill & Customer</th>
                <th className="px-8 py-5">Block Identifier</th>
                <th className="px-8 py-5 text-center">SqFt Sold</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {soldBlocks.map(block => (
                <tr key={block.id} className="hover:bg-[#faf9f6] transition-colors bg-white">
                  <td className="px-8 py-5">
                    <div className="text-sm font-semibold">{new Date(block.soldAt!).toLocaleDateString()}</div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="text-[#a8a29e] text-[10px]">Bill: {block.billNo}</div>
                    <div className="font-semibold text-[#292524]">{block.soldTo}</div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="text-[10px] font-medium">{block.jobNo} ({block.company})</div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <div className="text-lg font-semibold text-[#5c4033]">{block.totalSqFt?.toFixed(2)} ft</div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button onClick={() => handleDelete(block.id, block.company)} className="text-[#a8a29e] hover:text-red-500 transition-colors">
                      <i className="fas fa-trash-alt"></i>
                    </button>
                  </td>
                </tr>
              ))}
              {soldBlocks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-[#a8a29e] italic">No sales found for the selected period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
