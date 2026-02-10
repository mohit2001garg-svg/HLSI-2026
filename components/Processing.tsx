
import React, { useState, useMemo, useRef } from 'react';
import { db, checkPermission } from '../services/db';
import { Block, BlockStatus, StaffMember } from '../types';
import ExcelJS from 'exceljs';

interface Props {
  blocks: Block[];
  onRefresh: () => void;
  isGuest?: boolean;
  activeStaff: StaffMember;
}

interface ImportSummary {
  success: number;
  duplicates: string[];
  invalid: string[];
}

export const Processing: React.FC<Props> = ({ blocks, onRefresh, isGuest, activeStaff }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string>('ALL');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [finishModalOpen, setFinishModalOpen] = useState<{ id: string; action: 'finish' | 'resin' } | null>(null);
  const [finishData, setFinishData] = useState({ slabLength: '', slabWidth: '', slabCount: '', totalSqFt: '' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sales Modal State
  const [saleModalOpen, setSaleModalOpen] = useState<{ open: boolean; block: Block | null }>({ open: false, block: null });
  const [saleFormData, setSaleFormData] = useState({ soldTo: '', billNo: '', soldSqFt: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');

  const normalize = (s: string) => (s || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // Derive unique companies for the dropdown (Merged variations)
  const companies = useMemo(() => {
    const map = new Map<string, string>();
    blocks
      .filter(b => b.status === BlockStatus.PROCESSING && !b.isSentToResin)
      .forEach(b => {
        const name = b.company.trim();
        const norm = normalize(name);
        if (norm && !map.has(norm)) {
          map.set(norm, name);
        }
      });
    return Array.from(map.values()).sort();
  }, [blocks]);

  const processingBlocks = useMemo(() => {
    return blocks
      .filter(b => b.status === BlockStatus.PROCESSING && !b.isSentToResin)
      .filter(b => selectedCompany === 'ALL' || normalize(b.company) === normalize(selectedCompany))
      .filter(b => 
        b.jobNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.minesMarka && b.minesMarka.toLowerCase().includes(searchTerm.toLowerCase()))
      )
      .sort((a, b) => a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true }));
  }, [blocks, searchTerm, selectedCompany]);

  const stats = useMemo(() => {
    const totalSqFt = processingBlocks.reduce((acc, b) => acc + (b.totalSqFt || 0), 0);
    const totalWeight = processingBlocks.reduce((acc, b) => acc + (b.weight || 0), 0);
    const avgRecovery = totalWeight > 0 ? (totalSqFt / totalWeight).toFixed(2) : '0.00';
    
    return {
      count: processingBlocks.length,
      totalSqFt,
      avgRecovery
    };
  }, [processingBlocks]);

  const selectableBlocks = useMemo(() => 
    processingBlocks.filter(b => checkPermission(activeStaff, b.company)),
    [processingBlocks, activeStaff]
  );

  const handleSelectAll = () => {
    if (isGuest) return;
    const isAllSelected = selectableBlocks.length > 0 && selectableBlocks.every(b => selectedIds.has(b.id));
    if (isAllSelected) {
      const newSelected = new Set(selectedIds);
      selectableBlocks.forEach(b => newSelected.delete(b.id));
      setSelectedIds(newSelected);
    } else {
      const newSelected = new Set(selectedIds);
      selectableBlocks.forEach(b => newSelected.add(b.id));
      setSelectedIds(newSelected);
    }
  };

  const handleToggleId = (id: string) => {
    if (isGuest) return;
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handleDelete = async (id: string, jobNo: string) => {
    if (isGuest) return;
    if (!window.confirm(`Permanently delete Block #${jobNo} from processing?`)) return;
    setLoadingId(id);
    try {
      await db.deleteBlock(id);
      onRefresh();
    } catch (err) {
      alert("Delete failed.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (isGuest || selectedIds.size === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.size} selected records?`)) return;
    setIsImporting(true);
    try {
      await db.deleteBlocks(Array.from(selectedIds) as string[]);
      setSelectedIds(new Set());
      onRefresh();
    } catch (err) {
      alert("Bulk delete failed.");
    } finally {
      setIsImporting(false);
    }
  };

  const openFinishModal = (block: Block, action: 'finish' | 'resin') => {
    if (!checkPermission(activeStaff, block.company)) return;
    setFinishData({
      slabLength: block.slabLength?.toString() || '', 
      slabWidth: block.slabWidth?.toString() || '',
      slabCount: block.slabCount?.toString() || '',
      totalSqFt: block.totalSqFt?.toString() || ''
    });
    setFinishModalOpen({ id: block.id, action });
  };

  const openSaleModal = (block: Block) => {
    if (!checkPermission(activeStaff, block.company)) return;
    setSaleFormData({ soldTo: '', billNo: '', soldSqFt: block.totalSqFt?.toFixed(2) || '' }); 
    setSaleModalOpen({ open: true, block });
  };

  const handleExecuteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || !saleModalOpen.block) return;
    setIsSavingEdit(true);
    try {
      const soldAt = new Date().toISOString();
      const block = saleModalOpen.block;
      await db.updateBlock(block.id, {
        status: BlockStatus.SOLD,
        soldTo: saleFormData.soldTo.toUpperCase(),
        billNo: saleFormData.billNo.toUpperCase(),
        totalSqFt: Number(saleFormData.soldSqFt) || 0,
        soldAt: soldAt
      });
      setSaleModalOpen({ open: false, block: null });
      setSaleFormData({ soldTo: '', billNo: '', soldSqFt: '' });
      onRefresh();
      alert(`Sale recorded successfully.`);
    } catch (err: any) {
      alert("Sale failed: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleExportExcel = async () => {
    if (!exportStart || !exportEnd) {
      alert("Please select a date range.");
      return;
    }
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const s = new Date(exportStart);
      const e = new Date(exportEnd);
      e.setHours(23, 59, 59, 999);

      // Sort by date ascending
      const filteredBlocks = blocks
        .filter(b => {
          const dateStr = b.endTime || b.resinEndTime || b.arrivalDate;
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return d >= s && d <= e;
        })
        .sort((a, b) => {
          const dA = new Date(a.endTime || a.resinEndTime || a.arrivalDate || 0).getTime();
          const dB = new Date(b.endTime || b.resinEndTime || b.arrivalDate || 0).getTime();
          return dA - dB;
        });

      const columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Job No', key: 'jobNo', width: 15 },
        { header: 'Company', key: 'company', width: 25 },
        { header: 'Material', key: 'material', width: 20 },
        { header: 'Marka', key: 'marka', width: 15 },
        { header: 'Thickness', key: 'thickness', width: 12 },
        { header: 'Weight (T)', key: 'weight', width: 12 },
        { header: 'Dimensions', key: 'dim', width: 15 }
      ];

      const formatThickness = (t: string | undefined) => {
        if (!t) return '-';
        const val = t.toUpperCase().trim();
        return val.includes('MM') ? val : `${val} MM`;
      };

      const mapBlock = (b: Block) => ({
        date: new Date(b.endTime || b.resinEndTime || b.arrivalDate || 0).toLocaleDateString(),
        jobNo: b.jobNo,
        company: b.company,
        material: b.material,
        marka: b.minesMarka || '',
        thickness: formatThickness(b.thickness),
        weight: b.weight?.toFixed(2),
        dim: b.status === BlockStatus.COMPLETED || b.status === BlockStatus.IN_STOCKYARD || b.status === BlockStatus.SOLD
          ? `${Math.round(b.slabLength || 0)} x ${Math.round(b.slabWidth || 0)}`
          : `${Math.round(b.length || 0)} x ${Math.round(b.height || 0)} x ${Math.round(b.width || 0)}`
      });

      const setupSheet = (name: string, data: any[]) => {
        const sheet = workbook.addWorksheet(name);
        sheet.columns = columns;
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5C4033' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        data.forEach(row => {
          const r = sheet.addRow(row);
          r.eachCell(cell => cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} });
        });
      };

      // Only include Vacuum tab per request
      setupSheet('Vacuum', filteredBlocks.filter(b => b.preCuttingProcess === 'VACCUM').map(mapBlock));

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Vacuum_Processing_Report_${exportStart}_to_${exportEnd}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (err) {
      alert("Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFinalizeBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || !finishModalOpen) return;
    setLoadingId(finishModalOpen.id);
    try {
      const updates = { 
        slabLength: Number(finishData.slabLength), slabWidth: Number(finishData.slabWidth),
        slabCount: Number(finishData.slabCount), totalSqFt: Number(finishData.totalSqFt) 
      };
      if (finishModalOpen.action === 'finish') {
        await db.updateBlock(finishModalOpen.id, { ...updates, status: BlockStatus.COMPLETED, processingStage: 'Field' });
      } else {
        await db.updateBlock(finishModalOpen.id, { ...updates, isSentToResin: true, processingStage: 'Resin Plant' });
      }
      onRefresh(); setFinishModalOpen(null);
    } catch (err) { alert("Update failed."); } finally { setLoadingId(null); }
  };

  const commonInputStyle = "w-full bg-white border border-[#d6d3d1] rounded-lg px-3 py-2.5 text-xs font-medium focus:border-[#5c4033] outline-none shadow-sm transition-all";

  return (
    <div className="space-y-6 pb-24">
      
      {/* SECTION HEADER */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 shadow-sm">
            <i className="fas fa-arrows-spin text-lg"></i>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#292524] leading-tight">Processing</h2>
            <p className="text-[10px] text-[#78716c] font-medium">Floor Operations & Output</p>
          </div>
        </div>
        
        <button 
          onClick={() => setShowExportModal(true)}
          className="bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all"
        >
          <i className="fas fa-file-excel text-green-600"></i> Detailed Export
        </button>
      </div>
        
      {/* FILTER BAR - Compact */}
      <div className="bg-white p-3 rounded-xl border border-[#d6d3d1] shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#a8a29e] text-xs"></i>
            <input 
              type="text" 
              placeholder="Search..." 
              className="w-full bg-[#f5f5f4] border border-transparent focus:bg-white focus:border-[#5c4033] rounded-lg p-2.5 pl-9 text-xs font-medium outline-none transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <select 
              className={commonInputStyle}
              value={selectedCompany}
              onChange={e => setSelectedCompany(e.target.value)}
            >
              <option value="ALL">All Parties</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        
        {/* Bulk Delete */}
        {selectedIds.size > 0 && !isGuest && (
          <div className="mt-2 pt-2 border-t border-[#f5f5f4]">
            <button 
              onClick={handleBulkDelete}
              className="w-full bg-red-50 text-red-600 border border-red-100 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2"
            >
              <i className="fas fa-trash-alt"></i> Delete Selected ({selectedIds.size})
            </button>
          </div>
        )}
      </div>

      {/* SUMMARY STATS */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-[#d6d3d1] rounded-xl p-3 shadow-sm text-center">
          <div className="text-[9px] text-[#a8a29e] font-bold uppercase tracking-wider">Count</div>
          <div className="text-xl font-black text-[#292524]">{stats.count}</div>
        </div>
        <div className="bg-white border border-[#d6d3d1] rounded-xl p-3 shadow-sm text-center">
          <div className="text-[9px] text-[#a8a29e] font-bold uppercase tracking-wider">Area</div>
          <div className="text-xl font-black text-[#292524]">{Math.round(stats.totalSqFt)}</div>
        </div>
        <div className="bg-white border border-[#d6d3d1] rounded-xl p-3 shadow-sm text-center">
          <div className="text-[9px] text-[#a8a29e] font-bold uppercase tracking-wider">Yield</div>
          <div className="text-xl font-black text-emerald-600">{stats.avgRecovery}</div>
        </div>
      </div>

      {/* MOBILE CARD VIEW */}
      <div className="space-y-3 lg:hidden">
        {processingBlocks.length > 0 ? (
          processingBlocks.map(block => {
            const canEdit = checkPermission(activeStaff, block.company);
            const isSelected = selectedIds.has(block.id);
            const recovery = (block.totalSqFt && block.weight) ? (block.totalSqFt / block.weight).toFixed(2) : '0.00';

            return (
              <div key={block.id} className={`bg-white border border-[#d6d3d1] p-4 rounded-xl shadow-sm ${isSelected ? 'ring-2 ring-[#5c4033] bg-[#fffaf5]' : ''}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    {!isGuest && canEdit && (
                      <div onClick={() => handleToggleId(block.id)} className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-[#5c4033] border-[#5c4033]' : 'border-stone-300'}`}>
                        {isSelected && <i className="fas fa-check text-white text-[10px]"></i>}
                      </div>
                    )}
                    <div>
                      <div className="text-base font-black text-[#292524]">#{block.jobNo}</div>
                      <div className="text-[10px] font-bold text-[#78716c] uppercase">{block.company}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-[#5c4033]">{block.totalSqFt?.toFixed(2)} ft</div>
                    <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded font-bold mt-1 ${Number(recovery) > 250 ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-50 text-stone-600'}`}>
                      {recovery} ft/T
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px] border-t border-[#f5f5f4] pt-2 mt-2">
                  <div>
                    <span className="text-[#a8a29e] block font-medium">Material</span>
                    <span className="font-bold text-[#44403c] truncate">{block.material}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[#a8a29e] block font-medium">Slabs</span>
                    <span className="font-bold text-[#44403c]">{block.slabCount || '-'}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[#a8a29e] block font-medium">Size</span>
                    <span className="font-mono text-[#44403c]">{Math.round(block.slabLength || 0)} x {Math.round(block.slabWidth || 0)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-[#f5f5f4]">
                  {!isGuest && canEdit ? (
                    <>
                      <button onClick={() => openSaleModal(block)} className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-bold text-amber-600 uppercase tracking-wider"><i className="fas fa-shopping-cart"></i></button>
                      <button onClick={() => openFinishModal(block, 'resin')} className="flex-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-[10px] font-bold text-cyan-600 uppercase tracking-wider">To Resin</button>
                      <button onClick={() => openFinishModal(block, 'finish')} className="flex-1 px-3 py-2 bg-[#5c4033] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm">Ready</button>
                      <button onClick={() => handleDelete(block.id, block.jobNo)} className="px-3 py-2 text-red-400 bg-red-50 rounded-lg"><i className="fas fa-trash-alt text-xs"></i></button>
                    </>
                  ) : (
                    <span className="text-[9px] text-[#a8a29e] italic font-bold w-full text-center py-1 bg-[#f5f5f4] rounded">Read Only</span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center text-stone-400 italic text-xs">No active processing blocks</div>
        )}
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden lg:block bg-white border border-[#d6d3d1] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#f5f5f4] text-[#78716c] text-[10px] font-bold uppercase border-b">
              <tr>
                <th className="px-6 py-4 w-12 text-center">
                  {!isGuest && (
                    <input 
                      type="checkbox" 
                      onChange={handleSelectAll} 
                      className="w-4 h-4 rounded border-stone-300 text-[#5c4033] cursor-pointer" 
                    />
                  )}
                </th>
                <th className="px-6 py-4">Job & Party</th>
                <th className="px-6 py-4">Material & Marka</th>
                <th className="px-6 py-4 text-center">Weight (T)</th>
                <th className="px-6 py-4 text-center">Yield (ft/T)</th>
                <th className="px-6 py-4 text-center">Slab Size</th>
                <th className="px-6 py-4 text-center">Slabs</th>
                <th className="px-6 py-4 text-center">SqFt</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {processingBlocks.length > 0 ? (
                processingBlocks.map(block => {
                  const canEdit = checkPermission(activeStaff, block.company);
                  const recovery = (block.totalSqFt && block.weight) ? (block.totalSqFt / block.weight).toFixed(2) : '0.00';
                  const isSelected = selectedIds.has(block.id);
                  
                  return (
                    <tr key={block.id} className={`hover:bg-[#faf9f6] transition-colors ${isSelected ? 'bg-amber-50' : 'bg-white'}`}>
                      <td className="px-6 py-4 text-center">
                        {!isGuest && canEdit && (
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={() => handleToggleId(block.id)}
                            className="w-4 h-4 rounded border-stone-300 text-[#5c4033] cursor-pointer" 
                          />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-sm">#{block.jobNo}</div>
                        <div className="text-[10px] font-medium text-[#78716c] uppercase truncate max-w-[150px]">{block.company}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-[#44403c] truncate max-w-[150px]">{block.material}</div>
                        <div className="text-[9px] text-[#a8a29e] font-medium uppercase tracking-wider truncate max-w-[150px]">{block.minesMarka || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-sm text-[#292524]">{block.weight?.toFixed(2)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${Number(recovery) > 250 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-stone-50 text-stone-600 border border-stone-100'}`}>
                          {recovery}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-xs text-[#5c4033]">
                        {Math.round(block.slabLength || 0)} x {Math.round(block.slabWidth || 0)}
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-xs text-[#5c4033]">
                        {block.slabCount || '-'}
                      </td>
                      <td className="px-6 py-4 text-center font-black text-[#5c4033] text-sm">
                        {block.totalSqFt?.toFixed(2) || '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          {!isGuest && canEdit ? (
                            <>
                              <button onClick={() => openSaleModal(block)} className="w-8 h-8 flex items-center justify-center bg-white border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-50 transition-all shadow-sm" title="Record Sale"><i className="fas fa-shopping-cart text-xs"></i></button>
                              <button onClick={() => openFinishModal(block, 'resin')} className="w-8 h-8 flex items-center justify-center bg-white border border-cyan-200 text-cyan-600 rounded-lg hover:bg-cyan-50 transition-all shadow-sm" title="Move to Resin"><i className="fas fa-flask text-xs"></i></button>
                              <button onClick={() => openFinishModal(block, 'finish')} className="bg-[#5c4033] hover:bg-[#4a3b32] text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-md active:scale-95">Ready</button>
                              <button disabled={loadingId === block.id} onClick={() => handleDelete(block.id, block.jobNo)} className="w-8 h-8 flex items-center justify-center bg-white border border-red-100 text-red-400 rounded-lg hover:bg-red-50 transition-all shadow-sm">{loadingId === block.id ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-trash-alt text-xs"></i>}</button>
                            </>
                          ) : (
                            <span className="text-[9px] text-[#a8a29e] italic font-bold uppercase tracking-widest">Read Only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={9} className="py-20 text-center text-stone-400 italic bg-white">No blocks currently on the processing floor.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sale Modal */}
      {saleModalOpen.open && (
        <div className="fixed inset-0 z-[600] bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95">
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                <div>
                   <h3 className="text-2xl font-black text-[#5c4033] uppercase italic">Record Sale</h3>
                   {saleModalOpen.block && (
                     <div className="text-[10px] font-bold text-stone-500 mt-1 uppercase">Job #{saleModalOpen.block.jobNo} &bull; Est SqFt: {saleModalOpen.block.totalSqFt?.toFixed(2)}</div>
                   )}
                </div>
                <button onClick={() => setSaleModalOpen({open: false, block: null})} className="text-stone-400 hover:text-stone-600"><i className="fas fa-times"></i></button>
              </div>

              <form onSubmit={handleExecuteSale} className="space-y-6">
                 <div>
                    <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Customer Name</label>
                    <input required className="w-full bg-white border border-[#d6d3d1] p-4 rounded-xl text-sm font-bold uppercase text-[#5c4033] focus:border-[#5c4033] outline-none" placeholder="NAME OF BUYER" value={saleFormData.soldTo} onChange={e => setSaleFormData({...saleFormData, soldTo: e.target.value})} />
                 </div>
                 <div>
                    <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Bill / Invoice No</label>
                    <input required className="w-full bg-white border border-[#d6d3d1] p-4 rounded-xl text-sm font-bold uppercase text-[#5c4033] focus:border-[#5c4033] outline-none" placeholder="INV-2025-..." value={saleFormData.billNo} onChange={e => setSaleFormData({...saleFormData, billNo: e.target.value})} />
                 </div>
                 
                 <div className="bg-[#fffaf5] p-5 rounded-xl border border-amber-100">
                    <div className="flex justify-between items-center mb-1.5">
                       <label className="block text-[10px] font-bold text-amber-800 uppercase">Quantity (SqFt)</label>
                    </div>
                    <input 
                      type="number" 
                      step="0.01" 
                      required 
                      className="w-full bg-white border border-[#d6d3d1] p-4 rounded-xl text-xl font-black text-[#5c4033] focus:border-[#5c4033] outline-none" 
                      value={saleFormData.soldSqFt} 
                      onChange={e => setSaleFormData({...saleFormData, soldSqFt: e.target.value})} 
                    />
                 </div>
                 
                 <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setSaleModalOpen({open: false, block: null})} className="flex-1 bg-stone-100 py-4 rounded-xl font-bold uppercase text-xs text-stone-600">Cancel</button>
                    <button type="submit" disabled={isSavingEdit} className="flex-[2] bg-[#5c4033] text-white py-4 rounded-xl font-bold uppercase text-xs shadow-xl active:scale-95 transition-all">
                      {isSavingEdit ? 'Recording...' : 'Complete Sale'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Finish Modal */}
      {finishModalOpen && (
        <div className="fixed inset-0 z-[600] bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-lg font-black text-[#292524] uppercase italic">Update Output</h3>
                <p className="text-[#78716c] text-[10px] font-bold uppercase tracking-widest mt-1">Job #{blocks.find(b => b.id === finishModalOpen.id)?.jobNo}</p>
              </div>
              <button onClick={() => setFinishModalOpen(null)} className="text-[#a8a29e] hover:text-[#57534e] transition-colors"><i className="fas fa-times text-lg"></i></button>
            </div>

            <form onSubmit={handleFinalizeBlock} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-[#78716c] uppercase tracking-widest">Length (In)</label>
                  <input type="number" step="0.01" required autoFocus className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl p-3 text-sm font-bold focus:border-[#5c4033] outline-none" value={finishData.slabLength} onChange={e => setFinishData({...finishData, slabLength: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-[#78716c] uppercase tracking-widest">Width (In)</label>
                  <input type="number" step="0.01" required className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl p-3 text-sm font-bold focus:border-[#5c4033] outline-none" value={finishData.slabWidth} onChange={e => setFinishData({...finishData, slabWidth: e.target.value})} />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-[#78716c] uppercase tracking-widest">Slabs</label>
                  <input type="number" required className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl p-3 text-sm font-bold focus:border-[#5c4033] outline-none" value={finishData.slabCount} onChange={e => setFinishData({...finishData, slabCount: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-[#78716c] uppercase tracking-widest">Total Sq Ft</label>
                  <input type="number" step="0.01" required className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl p-3 text-lg font-black text-[#5c4033] focus:border-[#5c4033] outline-none" value={finishData.totalSqFt} onChange={e => setFinishData({...finishData, totalSqFt: e.target.value})} />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setFinishModalOpen(null)} className="flex-1 bg-stone-100 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-[#57534e]">Cancel</button>
                <button type="submit" disabled={!!loadingId} className={`flex-[2] text-white py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all ${finishModalOpen.action === 'finish' ? 'bg-[#5c4033] hover:bg-[#4a3b32]' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
                  {loadingId ? <i className="fas fa-spinner fa-spin"></i> : (finishModalOpen.action === 'finish' ? 'Finalize' : 'To Resin')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[600] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-[#292524]">Select Export Range</h3>
                <button onClick={() => setShowExportModal(false)} className="text-[#a8a29e] hover:text-[#57534e] transition-colors"><i className="fas fa-times"></i></button>
             </div>
             <div className="space-y-4">
                <div>
                   <label className="block text-[10px] font-bold text-[#a8a29e] mb-1 uppercase tracking-wider">Start Date</label>
                   <input type="date" className="w-full border border-[#d6d3d1] p-3 rounded-lg text-sm" value={exportStart} onChange={e => setExportStart(e.target.value)} />
                </div>
                <div>
                   <label className="block text-[10px] font-bold text-[#a8a29e] mb-1 uppercase tracking-wider">End Date</label>
                   <input type="date" className="w-full border border-[#d6d3d1] p-3 rounded-lg text-sm" value={exportEnd} onChange={e => setExportEnd(e.target.value)} />
                </div>
                <div className="pt-4 flex gap-3">
                   <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 border rounded-lg text-xs font-bold text-stone-500">Cancel</button>
                   <button onClick={handleExportExcel} disabled={isExporting} className="flex-[2] py-3 bg-[#5c4033] text-white rounded-lg text-xs font-bold shadow-md">
                     {isExporting ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-file-excel mr-2"></i>}
                     {isExporting ? 'Generating...' : 'Export Excel'}
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
