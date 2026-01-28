
import React, { useState, useMemo } from 'react';
import { db } from '../services/db';
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
  
  // Edit State
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [editFormData, setEditFormData] = useState({ soldTo: '', billNo: '', soldAt: '', totalSqFt: '', weight: '' });
  const [isAreaSale, setIsAreaSale] = useState(false); // Checkbox state
  const [isSaving, setIsSaving] = useState(false);

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
    if (isGuest) return;
    if (!window.confirm("PERMANENTLY DELETE RECORD? This will remove the sale record.")) return;
    try { await db.deleteBlock(id); onRefresh(); } catch (err) { alert("Delete failed."); }
  };

  const handleEditClick = (block: Block) => {
    if (isGuest) return;
    const bill = block.billNo || '';
    setEditingBlock(block);
    setIsAreaSale(bill.toUpperCase().startsWith('S'));
    setEditFormData({
        soldTo: block.soldTo || '',
        billNo: bill,
        soldAt: block.soldAt ? new Date(block.soldAt).toISOString().split('T')[0] : '',
        totalSqFt: block.totalSqFt?.toString() || '',
        weight: block.weight?.toString() || ''
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock) return;
    setIsSaving(true);
    try {
        let finalBillNo = editFormData.billNo.toUpperCase();
        if (isAreaSale) {
            if (!finalBillNo.startsWith('S')) {
                // If it starts with a dash like "-123", just add S. If "123", add "S-".
                if (finalBillNo.startsWith('-')) finalBillNo = 'S' + finalBillNo;
                else finalBillNo = 'S-' + finalBillNo;
            }
        } else {
            // If user unchecks, remove the S- or S prefix if present
            finalBillNo = finalBillNo.replace(/^S-?/, '');
        }

        await db.updateBlock(editingBlock.id, {
            soldTo: editFormData.soldTo.toUpperCase(),
            billNo: finalBillNo,
            soldAt: new Date(editFormData.soldAt).toISOString(),
            totalSqFt: Number(editFormData.totalSqFt),
            weight: Number(editFormData.weight)
        });
        setEditingBlock(null);
        onRefresh();
    } catch(err: any) {
        alert("Update failed: " + err.message);
    } finally {
        setIsSaving(false);
    }
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
      
      const soldQtyDisplay = soldSqFt > 0 ? `${soldSqFt.toFixed(2)} SqFt` : `${b.weight.toFixed(2)} T`;

      return {
        date: new Date(b.soldAt!).toLocaleDateString(), 
        billNo: b.billNo, 
        customer: b.soldTo, 
        jobNo: b.jobNo,
        company: b.company, 
        material: b.material, 
        totalStock: (soldSqFt + remainingSqFt).toFixed(2),
        soldQty: soldQtyDisplay, 
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
      { header: 'Sold Qty', key: 'soldQty', width: 15 },
      { header: 'Remaining (SqFt)', key: 'remainingSqFt', width: 15 }, 
      { header: 'Operator', key: 'operator', width: 15 },
    ];
    const fileNameMonth = selectedMonth !== 'ALL' ? MONTHS[parseInt(selectedMonth)] : 'All';
    const fileNameYear = selectedYear !== 'ALL' ? selectedYear : 'All';
    exportToExcel(reportData, columns, 'Sales Ledger', `Sales_Report_${fileNameMonth}_${fileNameYear}_${new Date().toISOString().split('T')[0]}`);
  };

  // Summaries
  // UPDATE: Only show the area sold quantity if the bill no has 'S' IN ITS PREFIX
  const totalAreaSold = soldBlocks.reduce((a, b) => {
    const isAreaBill = b.billNo?.toUpperCase().startsWith('S');
    return isAreaBill ? a + (b.totalSqFt || 0) : a;
  }, 0);
  
  const totalWeightSold = soldBlocks.filter(b => !b.totalSqFt).reduce((a, b) => a + (b.weight || 0), 0);

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
          <div className="text-[10px] text-[#a8a29e] font-medium mb-2 uppercase tracking-widest">Total Sales</div>
          <div className="flex gap-8">
             <div>
                <div className="text-xs text-[#78716c]">Area Sold (Bill 'S-...')</div>
                <div className="text-3xl font-semibold text-[#5c4033]">
                   {totalAreaSold.toFixed(2)} <span className="text-sm font-bold text-[#a8a29e]">ft</span>
                </div>
             </div>
             <div className="w-px bg-[#d6d3d1]"></div>
             <div>
                <div className="text-xs text-[#78716c]">Weight Sold</div>
                <div className="text-3xl font-semibold text-[#5c4033]">
                   {totalWeightSold.toFixed(2)} <span className="text-sm font-bold text-[#a8a29e]">T</span>
                </div>
             </div>
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
                <th className="px-8 py-5 text-center">Sold Qty</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {soldBlocks.map(block => {
                const isAreaSale = (block.totalSqFt || 0) > 0;
                return (
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
                    {isAreaSale ? (
                        <div className="text-lg font-semibold text-[#5c4033]">{block.totalSqFt?.toFixed(2)} ft</div>
                    ) : (
                        <div className="text-lg font-semibold text-[#5c4033]">{block.weight?.toFixed(2)} T</div>
                    )}
                  </td>
                  <td className="px-8 py-5 text-right">
                    {!isGuest && (
                        <div className="flex justify-end gap-2">
                            <button onClick={() => handleEditClick(block)} className="w-8 h-8 rounded flex items-center justify-center text-stone-400 hover:text-[#5c4033] hover:bg-stone-50 transition-colors">
                                <i className="fas fa-pen text-xs"></i>
                            </button>
                            <button onClick={() => handleDelete(block.id, block.company)} className="w-8 h-8 rounded flex items-center justify-center text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <i className="fas fa-trash-alt text-xs"></i>
                            </button>
                        </div>
                    )}
                  </td>
                </tr>
                );
              })}
              {soldBlocks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-[#a8a29e] italic">No sales found for the selected period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT MODAL */}
      {editingBlock && (
        <div className="fixed inset-0 z-[600] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-[#292524]">Correction: Sale Entry</h3>
                    <button onClick={() => setEditingBlock(null)}><i className="fas fa-times text-[#a8a29e]"></i></button>
                </div>
                <form onSubmit={handleSaveEdit} className="space-y-5">
                    <div>
                        <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Customer Name</label>
                        <input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold uppercase" value={editFormData.soldTo} onChange={e => setEditFormData({...editFormData, soldTo: e.target.value})} required />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Bill Number</label>
                        <input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold uppercase" value={editFormData.billNo} onChange={e => setEditFormData({...editFormData, billNo: e.target.value})} required />
                    </div>
                    
                    {/* Ask Option Checkbox for 'S' prefix */}
                    <div className="flex items-center gap-3 bg-stone-50 p-3 rounded-lg border border-stone-200">
                        <input 
                            type="checkbox" 
                            id="areaSaleCheck" 
                            className="w-5 h-5 text-[#5c4033] rounded cursor-pointer"
                            checked={isAreaSale}
                            onChange={(e) => setIsAreaSale(e.target.checked)}
                        />
                        <label htmlFor="areaSaleCheck" className="text-xs font-bold text-[#5c4033] uppercase cursor-pointer select-none">
                            Count as Area Sale (Bill No starts with 'S')
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Sale Date</label>
                            <input type="date" className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.soldAt} onChange={e => setEditFormData({...editFormData, soldAt: e.target.value})} required />
                        </div>
                        <div>
                            {/* Dynamically show input based on what was originally sold */}
                            {Number(editFormData.totalSqFt) > 0 ? (
                                <>
                                    <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">SqFt Sold</label>
                                    <input type="number" step="0.01" className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.totalSqFt} onChange={e => setEditFormData({...editFormData, totalSqFt: e.target.value})} required />
                                </>
                            ) : (
                                <>
                                    <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Weight Sold (T)</label>
                                    <input type="number" step="0.01" className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.weight} onChange={e => setEditFormData({...editFormData, weight: e.target.value})} required />
                                </>
                            )}
                        </div>
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setEditingBlock(null)} className="flex-1 border py-3 rounded-xl font-bold text-xs uppercase text-stone-500">Cancel</button>
                        <button type="submit" disabled={isSaving} className="flex-[2] bg-[#5c4033] text-white py-3 rounded-xl font-bold text-xs uppercase shadow-md">{isSaving ? 'Updating...' : 'Save Correction'}</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
