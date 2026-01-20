
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

  // Derive unique companies for the dropdown
  const companies = useMemo(() => {
    const list = blocks
      .filter(b => b.status === BlockStatus.PROCESSING && !b.isSentToResin)
      .map(b => b.company);
    return Array.from(new Set(list)).sort();
  }, [blocks]);

  const processingBlocks = useMemo(() => {
    return blocks
      .filter(b => b.status === BlockStatus.PROCESSING && !b.isSentToResin)
      .filter(b => selectedCompany === 'ALL' || b.company === selectedCompany)
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

  const isAllSelected = selectableBlocks.length > 0 && selectableBlocks.every(b => selectedIds.has(b.id));

  const handleSelectAll = () => {
    if (isGuest) return;
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

  const getCellValue = (rowOrCell: any, colNumber?: number) => {
    const cell = (colNumber && typeof rowOrCell.getCell === 'function') ? rowOrCell.getCell(colNumber) : rowOrCell;
    
    if (!cell) return '';
    const val = cell.value;
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
       if ('result' in val) return String(val.result || '').trim();
       if ('text' in val) return String(val.text || '').trim();
       if ('richText' in val) return val.richText.map((rt: any) => rt.text).join('').trim();
    }
    return String(val).trim();
  };

  const getNumericValue = (row: ExcelJS.Row, colNumber?: number) => {
    const val = getCellValue(row, colNumber);
    if (!val) return 0;
    const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
    return num || 0;
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isGuest) return;
    setIsImporting(true);
    setImportSummary(null);
    
    const summary: ImportSummary = { success: 0, duplicates: [], invalid: [] };
    
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      const headerRow = worksheet.getRow(1);
      const colMap: Record<string, number> = {};

      headerRow.eachCell((cell, colNumber) => {
        const val = getCellValue(cell).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        if (val.includes('job') || val === 'no') colMap['jobNo'] = colNumber;
        else if (val.includes('company')) colMap['company'] = colNumber;
        else if (val.includes('material')) colMap['material'] = colNumber;
        else if (val.includes('marka')) colMap['minesMarka'] = colNumber;
        else if (val.includes('weight') || val.includes('ton')) colMap['weight'] = colNumber;
        else if (val === 'l') colMap['slabLength'] = colNumber;
        else if (val === 'h') colMap['slabWidth'] = colNumber;
        else if (val.includes('pcs') || val.includes('count')) colMap['slabCount'] = colNumber;
        else if (val.includes('sqft') || val.includes('sq ft') || val.includes('area')) colMap['totalSqFt'] = colNumber;
        else if (val.includes('thickness')) colMap['thickness'] = colNumber;
      });

      if (!colMap['jobNo'] || !colMap['company']) {
        throw new Error("Excel format invalid. Required: JOB NO, COMPANY");
      }

      const newBlocks: Block[] = [];
      const existingJobNos = new Set(blocks.map(b => b.jobNo.toUpperCase()));
      const seenInFile = new Set<string>();

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 1) return;
        const jobNo = getCellValue(row, colMap['jobNo']).toUpperCase();
        
        if (!jobNo) {
          summary.invalid.push(`Row ${rowNumber}: Missing Job No`);
          return;
        }

        if (existingJobNos.has(jobNo) || seenInFile.has(jobNo)) {
          summary.duplicates.push(jobNo);
          return;
        }

        newBlocks.push({
          id: crypto.randomUUID(),
          jobNo,
          company: getCellValue(row, colMap['company']).toUpperCase(),
          material: getCellValue(row, colMap['material']).toUpperCase() || 'UNKNOWN',
          minesMarka: getCellValue(row, colMap['minesMarka']).toUpperCase() || '',
          weight: getNumericValue(row, colMap['weight']),
          thickness: getCellValue(row, colMap['thickness']),
          slabLength: getNumericValue(row, colMap['slabLength']),
          slabWidth: getNumericValue(row, colMap['slabWidth']),
          slabCount: Math.round(getNumericValue(row, colMap['slabCount'])),
          totalSqFt: getNumericValue(row, colMap['totalSqFt']),
          status: BlockStatus.PROCESSING,
          arrivalDate: new Date().toISOString().split('T')[0],
          length: 0, width: 0, height: 0, 
          isPriority: false, 
          preCuttingProcess: 'None',
          enteredBy: activeStaff,
          powerCuts: [],
          processingStage: 'Field',
          processingStartedAt: new Date().toISOString()
        });
        seenInFile.add(jobNo);
        summary.success++;
      });

      if (newBlocks.length > 0) {
        await db.addBlocks(newBlocks);
        onRefresh();
      }
      setImportSummary(summary);
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFinalizeBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || !finishModalOpen) return;
    setLoadingId(finishModalOpen.id);
    try {
      if (finishModalOpen.action === 'finish') {
        await db.updateBlock(finishModalOpen.id, { 
          status: BlockStatus.COMPLETED, processingStage: 'Field',
          slabLength: Number(finishData.slabLength), slabWidth: Number(finishData.slabWidth),
          slabCount: Number(finishData.slabCount), totalSqFt: Number(finishData.totalSqFt)
        });
      } else {
        await db.updateBlock(finishModalOpen.id, { 
          isSentToResin: true, processingStage: 'Resin Plant',
          slabLength: Number(finishData.slabLength), slabWidth: Number(finishData.slabWidth),
          slabCount: Number(finishData.slabCount), totalSqFt: Number(finishData.totalSqFt)
        });
      }
      onRefresh(); setFinishModalOpen(null);
    } catch (err) { alert("Update failed."); } finally { setLoadingId(null); }
  };

  const commonInputStyle = "bg-white border border-[#d6d3d1] rounded-lg px-4 py-3 text-sm font-medium focus:border-[#5c4033] outline-none shadow-sm transition-all";

  return (
    <div className="space-y-8 pb-32">
      
      {/* SECTION HEADER */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center text-stone-500">
            <i className="fas fa-arrows-spin text-xl"></i>
          </div>
          <h2 className="text-2xl font-bold text-[#292524]">Processing Floor</h2>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <div className="flex flex-col md:flex-row gap-3 flex-1 xl:flex-initial">
            {/* COMPANY DROPDOWN */}
            <div className="relative min-w-[200px]">
              <select 
                className={`${commonInputStyle} w-full appearance-none pr-10`}
                value={selectedCompany}
                onChange={e => setSelectedCompany(e.target.value)}
              >
                <option value="ALL">All Parties</option>
                {companies.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-[#a8a29e] text-[10px] pointer-events-none"></i>
            </div>

            {/* SEARCH BOX */}
            <div className="relative flex-1 md:w-80">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e] text-xs"></i>
              <input 
                type="text" 
                placeholder="Search Job, Material..." 
                className={`${commonInputStyle} w-full pl-10`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {!isGuest && (
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <button 
                  onClick={handleBulkDelete}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-5 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all animate-in fade-in slide-in-from-right-2"
                >
                  <i className="fas fa-trash-alt"></i>
                  <span>Delete ({selectedIds.size})</span>
                </button>
              )}
              
              <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" onChange={handleImportExcel} />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-5 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all"
              >
                {isImporting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-import text-blue-600"></i>}
                <span>Import Production</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* IMPORT SUMMARY REPORT - ALWAYS SHOW IF EXISTS */}
      {importSummary && (importSummary.duplicates.length > 0 || importSummary.invalid.length > 0) && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-6 rounded-r-xl shadow-sm animate-in slide-in-from-top-4">
           <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                 <i className="fas fa-exclamation-triangle text-amber-500 text-xl"></i>
                 <h3 className="text-sm font-black text-amber-900 uppercase tracking-widest">Import Activity Log</h3>
              </div>
              <button onClick={() => setImportSummary(null)} className="text-amber-400 hover:text-amber-600 transition-colors"><i className="fas fa-times text-lg"></i></button>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {importSummary.duplicates.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <i className="fas fa-clone"></i> Skipped Duplicates ({importSummary.duplicates.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {importSummary.duplicates.map(job => (
                      <span key={job} className="bg-white border border-amber-200 px-2 py-1 rounded text-[10px] font-bold text-amber-900">#{job}</span>
                    ))}
                  </div>
                </div>
              )}
              {importSummary.invalid.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-red-800 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <i className="fas fa-times-circle"></i> Rejected / Invalid Rows ({importSummary.invalid.length})
                  </div>
                  <div className="space-y-1">
                    {importSummary.invalid.map((err, i) => (
                      <div key={i} className="text-[10px] text-red-700 font-medium italic">&bull; {err}</div>
                    ))}
                  </div>
                </div>
              )}
           </div>
           
           <div className="mt-4 pt-4 border-t border-amber-200 text-[10px] font-bold text-amber-700 uppercase">
             Successfully Processed: {importSummary.success} Records
           </div>
        </div>
      )}

      {/* SUMMARY STATS */}
      <div className="flex flex-wrap gap-4">
        <div className="bg-white border border-[#d6d3d1] rounded-2xl px-8 py-6 min-w-[180px] shadow-sm">
          <div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-widest mb-1">In Process</div>
          <div className="text-4xl font-black text-[#292524] tabular-nums">{stats.count}</div>
        </div>
        <div className="bg-white border border-[#d6d3d1] rounded-2xl px-8 py-6 min-w-[220px] shadow-sm">
          <div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-widest mb-1">Floor Area</div>
          <div className="text-4xl font-black text-[#292524] tabular-nums">{stats.totalSqFt.toFixed(2)} <span className="text-sm font-bold text-[#a8a29e]">Sq Ft</span></div>
        </div>
        <div className="bg-white border border-[#d6d3d1] rounded-2xl px-8 py-6 min-w-[180px] shadow-sm">
          <div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-widest mb-1">Avg Yield</div>
          <div className="text-4xl font-black text-emerald-600 tabular-nums">{stats.avgRecovery} <span className="text-sm font-bold text-[#a8a29e]">ft/T</span></div>
        </div>
      </div>

      {/* TABLE VIEW (COLUMNAR LAYOUT) */}
      <div className="bg-white border border-[#d6d3d1] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#f5f5f4] text-[#78716c] text-[10px] font-bold uppercase border-b">
              <tr>
                <th className="px-6 py-4 w-12 text-center">
                  {!isGuest && (
                    <input 
                      type="checkbox" 
                      checked={isAllSelected} 
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
                              <button 
                                onClick={() => openFinishModal(block, 'resin')} 
                                className="w-8 h-8 flex items-center justify-center bg-white border border-cyan-200 text-cyan-600 rounded-lg hover:bg-cyan-50 transition-all shadow-sm"
                                title="Move to Resin"
                              >
                                <i className="fas fa-flask text-xs"></i>
                              </button>
                              <button 
                                onClick={() => openFinishModal(block, 'finish')} 
                                className="bg-[#5c4033] hover:bg-[#4a3b32] text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-md active:scale-95"
                              >
                                Ready
                              </button>
                              <button 
                                disabled={loadingId === block.id}
                                onClick={() => handleDelete(block.id, block.jobNo)}
                                className="w-8 h-8 flex items-center justify-center bg-white border border-red-100 text-red-400 rounded-lg hover:bg-red-50 transition-all shadow-sm"
                                title="Delete Record"
                              >
                                {loadingId === block.id ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-trash-alt text-xs"></i>}
                              </button>
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
                <tr>
                  <td colSpan={9} className="py-20 text-center text-stone-400 italic bg-white">
                    No blocks currently on the processing floor for the selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PRODUCTION MODAL */}
      {finishModalOpen && (
        <div className="fixed inset-0 z-[600] bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-10 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-2xl font-black text-[#292524] uppercase italic">Update Output</h3>
                <p className="text-[#78716c] text-[10px] font-bold uppercase tracking-widest mt-1">Job #{blocks.find(b => b.id === finishModalOpen.id)?.jobNo}</p>
              </div>
              <button onClick={() => setFinishModalOpen(null)} className="text-[#a8a29e] hover:text-[#57534e] transition-colors"><i className="fas fa-times text-xl"></i></button>
            </div>

            <form onSubmit={handleFinalizeBlock} className="space-y-6">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#78716c] uppercase tracking-widest">Slab Length (In)</label>
                  <input type="number" step="0.01" required autoFocus className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl p-4 text-sm font-bold focus:border-[#5c4033] outline-none" value={finishData.slabLength} onChange={e => setFinishData({...finishData, slabLength: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#78716c] uppercase tracking-widest">Slab Width (In)</label>
                  <input type="number" step="0.01" required className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl p-4 text-sm font-bold focus:border-[#5c4033] outline-none" value={finishData.slabWidth} onChange={e => setFinishData({...finishData, slabWidth: e.target.value})} />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#78716c] uppercase tracking-widest">No. of Slabs</label>
                  <input type="number" required className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl p-4 text-sm font-bold focus:border-[#5c4033] outline-none" value={finishData.slabCount} onChange={e => setFinishData({...finishData, slabCount: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#78716c] uppercase tracking-widest">Total Sq Ft</label>
                  <input type="number" step="0.01" required className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl p-4 text-xl font-black text-[#5c4033] focus:border-[#5c4033] outline-none" value={finishData.totalSqFt} onChange={e => setFinishData({...finishData, totalSqFt: e.target.value})} />
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setFinishModalOpen(null)} className="flex-1 bg-stone-100 py-4 rounded-2xl text-xs font-bold uppercase tracking-widest text-[#57534e]">Cancel</button>
                <button type="submit" disabled={!!loadingId} className={`flex-[2] text-white py-4 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all ${finishModalOpen.action === 'finish' ? 'bg-[#5c4033] hover:bg-[#4a3b32]' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
                  {loadingId ? <i className="fas fa-spinner fa-spin"></i> : (finishModalOpen.action === 'finish' ? 'Finalize Production' : 'Commit to Resin')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
