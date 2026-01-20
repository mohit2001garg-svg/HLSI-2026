
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

  const commonSelectStyle = "w-full bg-white border border-[#d6d3d1] rounded-lg p-3 text-sm font-medium focus:border-[#5c4033] outline-none shadow-sm transition-all";

  return (
    <div className="space-y-10 pb-32">
      
      {/* SECTION HEADER */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center text-stone-500">
          <i className="fas fa-warehouse text-xl"></i>
        </div>
        <h2 className="text-2xl font-bold text-[#292524]">Gantry Stock</h2>
      </div>

      {/* FILTER BAR */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <div className="lg:col-span-2 relative">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e] text-xs"></i>
          <input 
            type="text" 
            placeholder="Search Job, Company, Material, Marka..." 
            className={`${commonSelectStyle} pl-10`} 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
        
        <div>
          <select className={commonSelectStyle} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <select className={commonSelectStyle} value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

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

        <div className="flex gap-2 lg:col-span-2 xl:col-span-1">
          {!isGuest && (
            <>
              <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" onChange={handleImportExcel} />
              <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all">
                <i className="fas fa-file-import text-blue-600"></i> Import
              </button>
            </>
          )}
          <button onClick={handleExportExcel} className="flex-1 bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all">
            <i className="fas fa-file-excel text-green-600"></i> Export
          </button>
        </div>
      </div>

      {/* Bulk action buttons */}
      {selectedIds.size > 0 && !isGuest && (
        <div className="fixed bottom-24 right-8 z-50 flex gap-2 animate-in slide-in-from-bottom-4">
          <button 
            onClick={handleBulkDelete}
            className="bg-red-500 text-white px-6 py-4 rounded-xl font-bold text-sm shadow-2xl hover:bg-red-600 flex items-center gap-3 transition-all active:scale-95"
          >
            <i className="fas fa-trash"></i> DELETE SELECTED ({selectedIds.size})
          </button>
        </div>
      )}

      {/* SUMMARY AREA */}
      <div className="flex flex-wrap gap-4">
        <div className="bg-white border border-[#d6d3d1] rounded-2xl px-8 py-6 min-w-[200px] shadow-sm">
          <div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-widest mb-1">Total Blocks</div>
          <div className="text-4xl font-black text-[#292524] tabular-nums">{totals.count}</div>
        </div>
        <div className="bg-white border border-[#d6d3d1] rounded-2xl px-8 py-6 min-w-[260px] shadow-sm">
          <div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-widest mb-1">Total Weight</div>
          <div className="text-4xl font-black text-[#292524] tabular-nums">
            {totals.weight.toFixed(2)} <span className="text-sm font-bold text-[#a8a29e]">T</span>
          </div>
        </div>
      </div>

      {/* PRODUCTION QUEUE HEADER */}
      <div className="pt-4 border-t border-[#e7e5e4]">
        <div className="flex items-center gap-3 mb-6">
          <i className="fas fa-sort-amount-down text-orange-400"></i>
          <h3 className="text-lg font-bold text-[#4a3b32]">Production Queue</h3>
        </div>
        
        {filtered.filter(b => b.isToBeCut).length === 0 ? (
          <div className="bg-white border border-[#d6d3d1] border-dashed rounded-2xl p-12 text-center text-[#a8a29e] text-sm">
            Empty Queue
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.filter(b => b.isToBeCut).map(block => (
               <div key={block.id} className="bg-white border-l-4 border-l-orange-400 border border-[#d6d3d1] p-4 rounded-xl shadow-sm flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm">#{block.jobNo} | {block.company}</div>
                    <div className="text-[10px] text-[#78716c]">
                      {block.material} {block.minesMarka ? `(${block.minesMarka})` : ''} &bull; {block.thickness}
                    </div>
                  </div>
                  <button onClick={() => db.updateBlock(block.id, { isToBeCut: false }).then(onRefresh)} className="text-red-400 hover:text-red-600 p-2"><i className="fas fa-times-circle"></i></button>
               </div>
            ))}
          </div>
        )}
      </div>

      {/* INVENTORY TABLE HEADER */}
      <div className="pt-4 border-t border-[#e7e5e4]">
        <div className="flex items-center gap-3 mb-6">
          <i className="fas fa-layer-group text-stone-400"></i>
          <h3 className="text-lg font-bold text-[#4a3b32]">Inventory</h3>
        </div>

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
                      <td className="px-6 py-4 font-semibold text-sm">{block.jobNo}{block.isToBeCut && <span className="ml-2 bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded text-[9px] border border-amber-200">Queue</span>}</td>
                      <td className="px-6 py-4 text-sm font-medium text-[#44403c]">{block.company}</td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-[#57534e]">{block.material}</div>
                        <div className="text-[9px] text-[#a8a29e] font-medium uppercase tracking-wider">{block.minesMarka || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono">{Math.round(block.length || 0)} x {Math.round(block.height || 0)} x {Math.round(block.width || 0)}</td>
                      <td className="px-6 py-4 font-bold text-sm text-[#5c4033]">{block.weight?.toFixed(2)} T</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => db.updateBlock(block.id, { preCuttingProcess: block.preCuttingProcess === 'TENNAX' ? 'None' : 'TENNAX' }).then(onRefresh)} className={`px-2 py-1 rounded text-[9px] font-black border transition-all ${block.preCuttingProcess === 'TENNAX' ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-stone-200 text-stone-400'}`}>TENNAX</button>
                          <button onClick={() => db.updateBlock(block.id, { preCuttingProcess: block.preCuttingProcess === 'VACCUM' ? 'None' : 'VACCUM' }).then(onRefresh)} className={`px-2 py-1 rounded text-[9px] font-black border transition-all ${block.preCuttingProcess === 'VACCUM' ? 'bg-cyan-100 border-cyan-300 text-cyan-900' : 'bg-white border-stone-200 text-stone-400'}`}>VACCUM</button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {!isGuest && canEdit && (
                            <>
                              <button onClick={() => { setEditingBlock(block); setEditFormData(block); }} className="text-stone-400 p-2 hover:text-stone-700 transition-colors"><i className="fas fa-edit"></i></button>
                              <button onClick={() => { 
                                if(!block.isToBeCut) { setQueueModal({ open: true, blockId: block.id }); } 
                                else { db.updateBlock(block.id, { isToBeCut: false }).then(onRefresh); }
                              }} className={`px-3 py-1.5 rounded text-[10px] font-bold shadow-sm transition-all ${block.isToBeCut ? 'bg-white border border-red-200 text-red-400' : 'bg-[#5c4033] text-white'}`}>{block.isToBeCut ? 'Dequeue' : 'Queue'}</button>
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
      </div>

      {/* Edit Modal */}
      {editingBlock && (
        <div className="fixed inset-0 z-[600] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-xl p-8 shadow-2xl">
             <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h3 className="text-xl font-bold text-[#292524]">Update Gantry Registry</h3>
                <button onClick={() => setEditingBlock(null)}><i className="fas fa-times text-[#a8a29e]"></i></button>
             </div>
             <form onSubmit={handleSaveEdit} className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                   <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Job Number</label>
                   <input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.jobNo || ''} onChange={e => setEditFormData({...editFormData, jobNo: e.target.value})} />
                </div>
                <div>
                   <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Material</label>
                   <input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.material || ''} onChange={e => setEditFormData({...editFormData, material: e.target.value})} />
                </div>
                <div>
                   <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Marka</label>
                   <input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.minesMarka || ''} onChange={e => setEditFormData({...editFormData, minesMarka: e.target.value})} />
                </div>
                <div>
                   <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Weight (T)</label>
                   <input type="number" step="0.01" className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.weight || 0} onChange={e => setEditFormData({...editFormData, weight: Number(e.target.value)})} />
                </div>
                <div className="grid grid-cols-3 gap-2 col-span-2">
                  <div><label className="block text-[10px] font-bold text-[#78716c] mb-1 uppercase">L (In)</label><input type="number" step="0.01" className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-2 rounded text-sm font-bold" value={editFormData.length} onChange={e => setEditFormData({...editFormData, length: Number(e.target.value)})} /></div>
                  <div><label className="block text-[10px] font-bold text-[#78716c] mb-1 uppercase">H (In)</label><input type="number" step="0.01" className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-2 rounded text-sm font-bold" value={editFormData.height} onChange={e => setEditFormData({...editFormData, height: Number(e.target.value)})} /></div>
                  <div><label className="block text-[10px] font-bold text-[#78716c] mb-1 uppercase">W (In)</label><input type="number" step="0.01" className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-2 rounded text-sm font-bold" value={editFormData.width} onChange={e => setEditFormData({...editFormData, width: Number(e.target.value)})} /></div>
                </div>
                <div className="col-span-2 pt-4 flex gap-3">
                   <button type="button" onClick={() => setEditingBlock(null)} className="flex-1 border py-4 rounded-xl font-bold text-xs uppercase">Cancel</button>
                   <button type="submit" disabled={isSavingEdit} className="flex-[2] bg-[#5c4033] text-white py-4 rounded-xl font-bold text-xs uppercase shadow-xl">{isSavingEdit ? 'Syncing...' : 'Update Records'}</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Queue Modal Logic */}
      {queueModal.open && (
        <div className="fixed inset-0 z-[600] bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white rounded-xl w-full max-sm p-8 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-lg font-bold text-[#292524] mb-4">Set Cutting Thickness</h3>
              <select value={targetThickness} onChange={e => setTargetThickness(e.target.value)} className="w-full border border-[#d6d3d1] p-3 rounded-lg text-sm mb-6 outline-none focus:border-[#5c4033]"><option value="16mm">16mm</option><option value="18mm">18mm</option><option value="20mm">20mm</option></select>
              <div className="flex gap-3"><button onClick={() => setQueueModal({open: false, blockId: null})} className="flex-1 py-3 border rounded-lg text-xs font-bold text-[#78716c]">Cancel</button><button onClick={() => { if(queueModal.blockId) db.updateBlock(queueModal.blockId, { isToBeCut: true, thickness: targetThickness }).then(() => { onRefresh(); setQueueModal({open: false, blockId: null}); }); }} className="flex-[2] py-3 bg-[#5c4033] text-white rounded-lg text-xs font-bold shadow-md">Add to Queue</button></div>
           </div>
        </div>
      )}
    </div>
  );
};
