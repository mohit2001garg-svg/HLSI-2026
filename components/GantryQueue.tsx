
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { db, checkPermission } from '../services/db';
import { Block, BlockStatus, PreCuttingProcess, StaffMember } from '../types';
import { exportToExcel } from '../services/utils';
import ExcelJS from 'exceljs';

interface Props {
  blocks: Block[];
  onRefresh: () => void;
  isGuest?: boolean;
  activeStaff: StaffMember;
}

const MONTHS = ["All Months", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = ["All Years", 2024, 2025, 2026];

export const GantryQueue: React.FC<Props> = ({ blocks, onRefresh, isGuest, activeStaff }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [localHiddenIds, setLocalHiddenIds] = useState<Set<string>>(new Set());
  const [selectedCompany, setSelectedCompany] = useState<string>('ALL');
  const [selectedMaterial, setSelectedMaterial] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('All Months');
  const [selectedYear, setSelectedYear] = useState<string>('All Years');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Block>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [queueModal, setQueueModal] = useState<{ open: boolean; blockId: string | null }>({ open: false, blockId: null });
  const [targetThickness, setTargetThickness] = useState<string>('18mm');

  // Sales Modal State
  const [saleModalOpen, setSaleModalOpen] = useState<{ open: boolean; block: Block | null }>({ open: false, block: null });
  const [saleFormData, setSaleFormData] = useState({ soldTo: '', billNo: '', soldWeight: '' });

  const rawGantryBlocks = useMemo(() => 
    blocks.filter(b => b.status === BlockStatus.GANTRY && !localHiddenIds.has(b.id)), 
    [blocks, localHiddenIds]
  );

  const uniqueCompanies = useMemo(() => 
    Array.from(new Set(rawGantryBlocks.map(b => b.company))).sort(), 
    [rawGantryBlocks]
  );
  
  const availableMaterials = useMemo(() => {
    const blocksForMaterials = selectedCompany === 'ALL' 
      ? rawGantryBlocks 
      : rawGantryBlocks.filter(b => b.company === selectedCompany);
    return Array.from(new Set(blocksForMaterials.map(b => b.material))).sort();
  }, [rawGantryBlocks, selectedCompany]);

  useEffect(() => {
    setSelectedMaterial('ALL');
  }, [selectedCompany]);

  const filtered = useMemo(() => {
    return rawGantryBlocks
      .filter(b => selectedCompany === 'ALL' ? true : b.company === selectedCompany)
      .filter(b => selectedMaterial === 'ALL' ? true : b.material === selectedMaterial)
      .filter(b => {
        if (selectedMonth === 'All Months') return true;
        const monthIndex = MONTHS.indexOf(selectedMonth) - 1;
        return new Date(b.arrivalDate).getMonth() === monthIndex;
      })
      .filter(b => {
        if (selectedYear === 'All Years') return true;
        return new Date(b.arrivalDate).getFullYear() === Number(selectedYear);
      })
      .filter(b => 
        b.jobNo.toLowerCase().includes(searchTerm.toLowerCase()) || 
        b.company.toLowerCase().includes(searchTerm.toLowerCase()) || 
        b.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.minesMarka && b.minesMarka.toLowerCase().includes(searchTerm.toLowerCase()))
      )
      .sort((a, b) => a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true }));
  }, [rawGantryBlocks, selectedCompany, selectedMaterial, selectedMonth, selectedYear, searchTerm]);

  const totals = useMemo(() => {
    return filtered.reduce((acc, b) => ({
      count: acc.count + 1,
      weight: acc.weight + (b.weight || 0)
    }), { count: 0, weight: 0 });
  }, [filtered]);

  const selectableBlocks = useMemo(() => filtered.filter(b => checkPermission(activeStaff, b.company)), [filtered, activeStaff]);
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

  const handleBulkDelete = async () => {
    if (isGuest || selectedIds.size === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.size} selected records from Gantry Stock?`)) return;
    setIsImporting(true);
    try {
      await db.deleteBlocks(Array.from(selectedIds) as string[]);
      setSelectedIds(new Set());
      onRefresh();
    } catch (err: any) {
      alert("Bulk delete failed: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExecuteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || !saleModalOpen.block) return;
    setIsSavingEdit(true);
    try {
      const soldAt = new Date().toISOString();
      const block = saleModalOpen.block;
      
      // For Gantry sales, we record in Tons (Weight), not SqFt.
      // We set totalSqFt to 0 to indicate it's a weight-based sale.
      const finalWeight = Number(saleFormData.soldWeight) || block.weight;

      await db.updateBlock(block.id, {
        status: BlockStatus.SOLD,
        soldTo: saleFormData.soldTo.toUpperCase(),
        billNo: saleFormData.billNo.toUpperCase(),
        weight: finalWeight,
        totalSqFt: 0, 
        soldAt: soldAt
      });

      setSaleModalOpen({ open: false, block: null });
      setSaleFormData({ soldTo: '', billNo: '', soldWeight: '' });
      onRefresh();
      alert(`Sale recorded successfully.`);
    } catch (err: any) {
      alert("Sale failed: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openSaleModal = (block: Block) => {
    setSaleFormData({ soldTo: '', billNo: '', soldWeight: block.weight?.toString() || '' });
    setSaleModalOpen({ open: true, block });
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
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      const headerRow = worksheet.getRow(1);
      const colMap: Record<string, number> = {};
      headerRow.eachCell((cell, colNumber) => {
        const val = getCellValue(cell).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        if (val.includes('job') || val === 'no') colMap['jobNo'] = colNumber;
        else if (val.includes('company') || val.includes('party')) colMap['company'] = colNumber;
        else if (val.includes('material')) colMap['material'] = colNumber;
        else if (val.includes('marka')) colMap['minesMarka'] = colNumber;
        else if (val.includes('weight') || val.includes('ton')) colMap['weight'] = colNumber;
        else if (val === 'l' || val.includes('length')) colMap['length'] = colNumber;
        else if (val === 'w' || val.includes('width')) colMap['width'] = colNumber;
        else if (val === 'h' || val.includes('height')) colMap['height'] = colNumber;
        else if (val.includes('dim') || val.includes('size')) colMap['combinedDims'] = colNumber;
      });

      if (!colMap['jobNo'] || !colMap['company']) throw new Error("Missing Job No or Company columns.");

      const newBlocks: Block[] = [];
      const existingJobNos = new Set(blocks.map(b => b.jobNo.toUpperCase()));
      const seenInFile = new Set<string>();

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 1) return;
        const jobNo = getCellValue(row, colMap['jobNo']).toUpperCase();
        if (!jobNo || existingJobNos.has(jobNo) || seenInFile.has(jobNo)) return;

        let length = getNumericValue(row, colMap['length']);
        let width = getNumericValue(row, colMap['width']);
        let height = getNumericValue(row, colMap['height']);

        if ((!length || !width || !height) && colMap['combinedDims']) {
          const dimStr = getCellValue(row, colMap['combinedDims']);
          const matches = dimStr.match(/[0-9]+(\.[0-9]+)?/g);
          if (matches && matches.length >= 3) {
            length = parseFloat(matches[0]);
            height = parseFloat(matches[1]);
            width = parseFloat(matches[2]);
          }
        }

        newBlocks.push({
          id: crypto.randomUUID(),
          jobNo,
          company: getCellValue(row, colMap['company']).toUpperCase(),
          material: getCellValue(row, colMap['material']).toUpperCase() || 'UNKNOWN',
          minesMarka: getCellValue(row, colMap['minesMarka']).toUpperCase() || '',
          length: length || 0,
          width: width || 0,
          height: height || 0,
          weight: getNumericValue(row, colMap['weight']),
          arrivalDate: new Date().toISOString().split('T')[0],
          status: BlockStatus.GANTRY,
          isPriority: false,
          preCuttingProcess: 'None',
          enteredBy: activeStaff,
          powerCuts: []
        });
        seenInFile.add(jobNo);
      });

      if (newBlocks.length > 0) {
        await db.addBlocks(newBlocks);
        onRefresh();
        alert(`Imported ${newBlocks.length} records.`);
      } else {
        alert("No new records found.");
      }
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportExcel = () => {
    const reportData = filtered.map(b => ({
      jobNo: b.jobNo, company: b.company, material: b.material, marka: b.minesMarka || '',
      dimensions: `${Math.round(b.length)} x ${Math.round(b.height)} x ${Math.round(b.width)}`, weight: b.weight.toFixed(2),
      status: b.isToBeCut ? `Queue (${b.thickness})` : 'Stock', preProcess: b.preCuttingProcess,
      arrival: new Date(b.arrivalDate).toLocaleDateString(), operator: b.enteredBy
    }));
    const columns = [
      { header: 'Job No', key: 'jobNo', width: 15 }, { header: 'Company', key: 'company', width: 20 },
      { header: 'Material', key: 'material', width: 20 }, { header: 'Marka', key: 'marka', width: 15 },
      { header: 'Dimensions', key: 'dimensions', width: 25 }, { header: 'Weight (T)', key: 'weight', width: 15 },
      { header: 'Status', key: 'status', width: 20 }, { header: 'Process', key: 'preProcess', width: 15 },
      { header: 'Arrival', key: 'arrival', width: 15 }, { header: 'Operator', key: 'operator', width: 15 },
    ];
    exportToExcel(reportData, columns, 'Gantry Stock', `Gantry_Report_${new Date().toISOString().split('T')[0]}`);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock) return;
    setIsSavingEdit(true);
    try {
      await db.updateBlock(editingBlock.id, {
        ...editFormData,
        jobNo: editFormData.jobNo?.toUpperCase(),
        company: editFormData.company?.toUpperCase(),
        material: editFormData.material?.toUpperCase(),
        minesMarka: editFormData.minesMarka?.toUpperCase(),
        weight: Number(editFormData.weight),
        length: Number(editFormData.length),
        width: Number(editFormData.width),
        height: Number(editFormData.height),
      });
      setEditingBlock(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const commonSelectStyle = "w-full bg-white border border-[#d6d3d1] rounded-lg p-2.5 text-xs font-medium focus:border-[#5c4033] outline-none shadow-sm transition-all";

  return (
    <div className="space-y-6 pb-24">
      
      {/* SECTION HEADER */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 shadow-sm">
          <i className="fas fa-layer-group text-lg"></i>
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#292524] leading-tight">Gantry Stock</h2>
          <p className="text-[10px] text-[#78716c] font-medium">Blocks awaiting production</p>
        </div>
      </div>

      {/* FILTER BAR - Compact */}
      <div className="bg-white p-3 rounded-xl border border-[#d6d3d1] shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
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
          
          <div><select className={commonSelectStyle} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
          <div><select className={commonSelectStyle} value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
          <div>
            <select className={commonSelectStyle} value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}>
              <option value="ALL">All Companies</option>
              {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <select className={commonSelectStyle} value={selectedMaterial} onChange={e => setSelectedMaterial(e.target.value)}>
              <option value="ALL">All Materials</option>
              {availableMaterials.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        
        {/* Buttons Row */}
        <div className="flex gap-2 mt-2 pt-2 border-t border-[#f5f5f4]">
          {!isGuest && (
            <>
              <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" onChange={handleImportExcel} />
              <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-[#f5f5f4] hover:bg-stone-200 text-[#57534e] px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all">
                <i className="fas fa-file-import mr-1"></i> Import
              </button>
            </>
          )}
          <button onClick={handleExportExcel} className="flex-1 bg-[#f5f5f4] hover:bg-stone-200 text-[#57534e] px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all">
            <i className="fas fa-file-excel mr-1 text-green-600"></i> Export
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-[#d6d3d1] rounded-xl p-4 shadow-sm">
          <div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-wider">Total Blocks</div>
          <div className="text-2xl font-black text-[#292524]">{totals.count}</div>
        </div>
        <div className="bg-white border border-[#d6d3d1] rounded-xl p-4 shadow-sm">
          <div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-wider">Total Weight</div>
          <div className="text-2xl font-black text-[#292524]">{totals.weight.toFixed(2)} <span className="text-xs text-[#a8a29e] font-medium">T</span></div>
        </div>
      </div>

      {/* QUEUE */}
      {filtered.some(b => b.isToBeCut) && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-[#4a3b32] uppercase tracking-wider px-1">Production Queue</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.filter(b => b.isToBeCut).map(block => {
               const canEdit = checkPermission(activeStaff, block.company);
               const isDisabled = isGuest || !canEdit;
               return (
                 <div key={block.id} className="bg-orange-50 border border-orange-200 p-4 rounded-xl shadow-sm space-y-3 transition-all">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-bold text-sm text-[#292524]">#{block.jobNo}</div>
                        <div className="text-[10px] font-bold text-orange-800 mt-0.5">{block.company} &bull; {block.thickness}</div>
                      </div>
                      <button onClick={() => db.updateBlock(block.id, { isToBeCut: false }).then(onRefresh)} className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-orange-300 shadow-sm hover:text-red-500 transition-colors"><i className="fas fa-times text-xs"></i></button>
                    </div>

                    {/* Treatment Buttons in Queue Card - Fix for mobile request */}
                    <div className="flex gap-2">
                        <button 
                          disabled={isDisabled}
                          onClick={() => db.updateBlock(block.id, { preCuttingProcess: block.preCuttingProcess === 'TENNAX' ? 'None' : 'TENNAX' }).then(onRefresh)} 
                          className={`flex-1 py-1.5 rounded text-[9px] font-black border transition-all ${block.preCuttingProcess === 'TENNAX' ? 'bg-amber-500 border-amber-600 text-white shadow-inner' : 'bg-white border-stone-200 text-stone-400 opacity-70'}`}
                        >
                          TNX
                        </button>
                        <button 
                          disabled={isDisabled}
                          onClick={() => db.updateBlock(block.id, { preCuttingProcess: block.preCuttingProcess === 'VACCUM' ? 'None' : 'VACCUM' }).then(onRefresh)} 
                          className={`flex-1 py-1.5 rounded text-[9px] font-black border transition-all ${block.preCuttingProcess === 'VACCUM' ? 'bg-cyan-500 border-cyan-600 text-white shadow-inner' : 'bg-white border-stone-200 text-stone-400 opacity-70'}`}
                        >
                          VAC
                        </button>
                    </div>
                 </div>
               );
            })}
          </div>
        </div>
      )}

      {/* MOBILE CARD LIST */}
      <div className="space-y-3 lg:hidden">
        {filtered.map(block => {
          const isSelected = selectedIds.has(block.id);
          const canEdit = checkPermission(activeStaff, block.company);
          const isDisabled = isGuest || !canEdit;
          
          return (
            <div key={block.id} className={`bg-white border border-[#d6d3d1] p-4 rounded-xl shadow-sm ${isSelected ? 'ring-2 ring-[#5c4033] bg-[#fffaf5]' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  {!isGuest && canEdit && (
                    <div onClick={() => {
                        const n = new Set(selectedIds);
                        if(n.has(block.id)) n.delete(block.id); else n.add(block.id);
                        setSelectedIds(n);
                    }} className={`w-6 h-6 rounded border flex items-center justify-center ${isSelected ? 'bg-[#5c4033] border-[#5c4033]' : 'border-stone-300'}`}>
                      {isSelected && <i className="fas fa-check text-white text-[10px]"></i>}
                    </div>
                  )}
                  <div>
                    <div className="text-base font-black text-[#292524]">#{block.jobNo}</div>
                    <div className="text-[10px] font-bold text-[#78716c] uppercase">{block.company}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-[#5c4033]">{block.weight?.toFixed(2)} T</div>
                  <div className="text-[10px] text-[#a8a29e] font-mono">{Math.round(block.length)}x{Math.round(block.height)}x{Math.round(block.width)}</div>
                </div>
              </div>

              {/* Treatment Buttons for Mobile - Side by side */}
              <div className="grid grid-cols-2 gap-3 my-3 pb-3 border-b border-[#f5f5f4]">
                  <button 
                    disabled={isDisabled}
                    onClick={() => db.updateBlock(block.id, { preCuttingProcess: block.preCuttingProcess === 'TENNAX' ? 'None' : 'TENNAX' }).then(onRefresh)} 
                    className={`py-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center justify-center gap-2 ${block.preCuttingProcess === 'TENNAX' ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-inner' : 'bg-white border-stone-200 text-stone-400'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <i className={`fas fa-check-circle ${block.preCuttingProcess === 'TENNAX' ? 'text-amber-600' : 'text-stone-200'}`}></i> TENNAX
                  </button>
                  <button 
                    disabled={isDisabled}
                    onClick={() => db.updateBlock(block.id, { preCuttingProcess: block.preCuttingProcess === 'VACCUM' ? 'None' : 'VACCUM' }).then(onRefresh)} 
                    className={`py-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center justify-center gap-2 ${block.preCuttingProcess === 'VACCUM' ? 'bg-cyan-100 border-cyan-300 text-cyan-900 shadow-inner' : 'bg-white border-stone-200 text-stone-400'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <i className={`fas fa-check-circle ${block.preCuttingProcess === 'VACCUM' ? 'text-cyan-600' : 'text-stone-200'}`}></i> VACUUM
                  </button>
              </div>
              
              <div className="mt-3 flex justify-between items-center">
                 <div className="text-[10px] font-bold text-[#57534e] truncate max-w-[140px]">{block.material} {block.minesMarka ? `(${block.minesMarka})` : ''}</div>
                 
                 {!isGuest && canEdit && (
                   <div className="flex gap-2">
                      <button onClick={() => openSaleModal(block)} className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center active:scale-95"><i className="fas fa-shopping-cart text-[10px]"></i></button>
                      <button onClick={() => { setEditingBlock(block); setEditFormData(block); }} className="w-9 h-9 rounded-lg bg-stone-50 border border-stone-200 text-stone-400 flex items-center justify-center active:scale-95"><i className="fas fa-pen text-[10px]"></i></button>
                      <button onClick={() => { 
                        if(!block.isToBeCut) { setQueueModal({ open: true, blockId: block.id }); } 
                        else { db.updateBlock(block.id, { isToBeCut: false }).then(onRefresh); }
                      }} className={`px-4 h-9 rounded-lg text-[10px] font-bold uppercase active:scale-95 transition-transform ${block.isToBeCut ? 'bg-orange-100 text-orange-700' : 'bg-[#5c4033] text-white'}`}>{block.isToBeCut ? 'Deque' : 'Queue'}</button>
                   </div>
                 )}
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP TABLE */}
      <div className="hidden lg:block bg-white border border-[#d6d3d1] rounded-2xl overflow-hidden shadow-sm">
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
                <th className="px-6 py-4">Job No</th>
                <th className="px-6 py-4">Company</th>
                <th className="px-6 py-4">Material & Marka</th>
                <th className="px-6 py-4">Dimensions</th>
                <th className="px-6 py-4">Weight</th>
                <th className="px-6 py-4 text-center">Treatment</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map(block => {
                const isSelected = selectedIds.has(block.id);
                const canEdit = checkPermission(activeStaff, block.company);
                return (
                  <tr key={block.id} className={`hover:bg-[#faf9f6] transition-colors ${isSelected ? 'bg-amber-50' : 'bg-white'}`}>
                    <td className="px-6 py-4 text-center">
                      {!isGuest && canEdit && (
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={() => { 
                            const n = new Set(selectedIds); 
                            if(n.has(block.id)) n.delete(block.id); 
                            else n.add(block.id); 
                            setSelectedIds(n); 
                          }} 
                          className="w-4 h-4 rounded border-stone-300 text-[#5c4033] cursor-pointer" 
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-sm text-[#292524]">{block.jobNo}{block.isToBeCut && <span className="ml-2 bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[9px] font-bold">Queue</span>}</td>
                    <td className="px-6 py-4 text-sm font-medium text-[#44403c]">{block.company}</td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-[#57534e]">{block.material}</div>
                      <div className="text-[9px] text-[#a8a29e] font-bold uppercase">{block.minesMarka || '-'}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono font-medium">{Math.round(block.length)} x {Math.round(block.height)} x {Math.round(block.width)}</td>
                    <td className="px-6 py-4 font-bold text-sm text-[#5c4033]">{block.weight?.toFixed(2)} T</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => db.updateBlock(block.id, { preCuttingProcess: block.preCuttingProcess === 'TENNAX' ? 'None' : 'TENNAX' }).then(onRefresh)} className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${block.preCuttingProcess === 'TENNAX' ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-stone-200 text-stone-400'}`}>TNX</button>
                        <button onClick={() => db.updateBlock(block.id, { preCuttingProcess: block.preCuttingProcess === 'VACCUM' ? 'None' : 'VACCUM' }).then(onRefresh)} className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${block.preCuttingProcess === 'VACCUM' ? 'bg-cyan-100 border-cyan-300 text-cyan-900' : 'bg-white border-stone-200 text-stone-400'}`}>VAC</button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {!isGuest && canEdit && (
                          <>
                            <button onClick={() => openSaleModal(block)} className="text-amber-600 hover:text-amber-800 p-2 transition-colors"><i className="fas fa-shopping-cart"></i></button>
                            <button onClick={() => { setEditingBlock(block); setEditFormData(block); }} className="text-stone-400 p-2 hover:text-stone-700 transition-colors"><i className="fas fa-edit"></i></button>
                            <button onClick={() => { 
                              if(!block.isToBeCut) { setQueueModal({ open: true, blockId: block.id }); } 
                              else { db.updateBlock(block.id, { isToBeCut: false }).then(onRefresh); }
                            }} className={`px-3 py-1.5 rounded text-[10px] font-bold shadow-sm transition-all uppercase ${block.isToBeCut ? 'bg-stone-100 text-stone-500' : 'bg-[#5c4033] text-white'}`}>{block.isToBeCut ? 'Dequeue' : 'Queue'}</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating bulk delete button */}
      {selectedIds.size > 0 && !isGuest && (
        <div className="fixed bottom-24 right-4 z-50 animate-in slide-in-from-bottom-4">
          <button 
            onClick={handleBulkDelete}
            className="bg-red-500 text-white px-5 py-3 rounded-full font-bold text-xs shadow-xl hover:bg-red-600 active:scale-95 flex items-center gap-2"
          >
            <i className="fas fa-trash"></i> Delete ({selectedIds.size})
          </button>
        </div>
      )}

      {/* Sale Modal - UPDATED FOR WEIGHT */}
      {saleModalOpen.open && (
        <div className="fixed inset-0 z-[600] bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95">
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                <div>
                   <h3 className="text-2xl font-black text-[#5c4033] uppercase italic">Record Block Sale</h3>
                   {saleModalOpen.block && (
                     <div className="text-[10px] font-bold text-stone-500 mt-1 uppercase">Job #{saleModalOpen.block.jobNo} &bull; Current Weight: {saleModalOpen.block.weight?.toFixed(2)} T</div>
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
                       <label className="block text-[10px] font-bold text-amber-800 uppercase">Sale Weight (Tons)</label>
                    </div>
                    <input 
                      type="number" 
                      step="0.01" 
                      required 
                      className="w-full bg-white border border-[#d6d3d1] p-4 rounded-xl text-xl font-black text-[#5c4033] focus:border-[#5c4033] outline-none" 
                      value={saleFormData.soldWeight} 
                      onChange={e => setSaleFormData({...saleFormData, soldWeight: e.target.value})} 
                      placeholder="0.00"
                    />
                    <div className="mt-2 text-[9px] text-stone-400">
                        *Updating weight here will overwrite block record.
                    </div>
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

      {/* Edit Modal */}
      {editingBlock && (
        <div className="fixed inset-0 z-[600] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h3 className="text-lg font-bold text-[#292524]">Update Gantry Registry</h3>
                <button onClick={() => setEditingBlock(null)}><i className="fas fa-times text-[#a8a29e]"></i></button>
             </div>
             <form onSubmit={handleSaveEdit} className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                   <label className="block text-[10px] font-bold text-[#78716c] mb-1 uppercase">Job Number</label>
                   <input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.jobNo || ''} onChange={e => setEditFormData({...editFormData, jobNo: e.target.value})} />
                </div>
                <div className="col-span-2">
                   <label className="block text-[10px] font-bold text-[#78716c] mb-1 uppercase">Company / Party</label>
                   <input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold uppercase" value={editFormData.company || ''} onChange={e => setEditFormData({...editFormData, company: e.target.value})} />
                </div>
                <div>
                   <label className="block text-[10px] font-bold text-[#78716c] mb-1 uppercase">Material</label>
                   <input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.material || ''} onChange={e => setEditFormData({...editFormData, material: e.target.value})} />
                </div>
                <div>
                   <label className="block text-[10px] font-bold text-[#78716c] mb-1 uppercase">Marka</label>
                   <input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.minesMarka || ''} onChange={e => setEditFormData({...editFormData, minesMarka: e.target.value})} />
                </div>
                <div className="col-span-2 pt-4 flex gap-3">
                   <button type="button" onClick={() => setEditingBlock(null)} className="flex-1 border py-3 rounded-xl font-bold text-xs uppercase text-[#78716c]">Cancel</button>
                   <button type="submit" disabled={isSavingEdit} className="flex-[2] bg-[#5c4033] text-white py-3 rounded-xl font-bold text-xs uppercase shadow-md">{isSavingEdit ? 'Saving...' : 'Update'}</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Queue Modal */}
      {queueModal.open && (
        <div className="fixed inset-0 z-[600] bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-base font-bold text-[#292524] mb-4">Set Cutting Thickness</h3>
              <select value={targetThickness} onChange={e => setTargetThickness(e.target.value)} className="w-full border border-[#d6d3d1] p-3 rounded-lg text-sm mb-6 outline-none focus:border-[#5c4033] bg-white"><option value="16mm">16mm</option><option value="18mm">18mm</option><option value="20mm">20mm</option></select>
              <div className="flex gap-3"><button onClick={() => setQueueModal({open: false, blockId: null})} className="flex-1 py-3 border rounded-lg text-xs font-bold text-[#78716c]">Cancel</button><button onClick={() => { if(queueModal.blockId) db.updateBlock(queueModal.blockId, { isToBeCut: true, thickness: targetThickness }).then(() => { onRefresh(); setQueueModal({open: false, blockId: null}); }); }} className="flex-[2] py-3 bg-[#5c4033] text-white rounded-lg text-xs font-bold shadow-md">Add to Queue</button></div>
           </div>
        </div>
      )}
    </div>
  );
};
