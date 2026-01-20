
import React, { useState, useMemo, useRef } from 'react';
import { db, checkPermission } from '../services/db';
import { Block, BlockStatus, StockyardLocation, StaffMember } from '../types';
import { exportToExcel } from '../services/utils';
import ExcelJS from 'exceljs';

interface Props {
  blocks: Block[];
  onRefresh: () => void;
  activeStaff: StaffMember;
  isGuest?: boolean;
}

const MONTHS = ["All Months", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = ["All Years", 2024, 2025, 2026];

export const Stockyard: React.FC<Props> = ({ blocks, onRefresh, activeStaff, isGuest }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [selectedMaterial, setSelectedMaterial] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('All Months');
  const [selectedYear, setSelectedYear] = useState<string>('All Years');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // MODALS
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Block>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  const [saleModalOpen, setSaleModalOpen] = useState<{ open: boolean; block: Block | null }>({ open: false, block: null });
  const [saleFormData, setSaleFormData] = useState({ soldTo: '', billNo: '', soldSqFt: '' });

  // Base list of yard blocks (unfiltered by selection, only status)
  const baseYardBlocks = useMemo(() => blocks.filter(b => b.status === BlockStatus.IN_STOCKYARD), [blocks]);

  // Unique companies available in Stockyard
  const uniqueCompanies = useMemo(() => 
    Array.from(new Set(baseYardBlocks.map(b => b.company))).sort(), 
  [baseYardBlocks]);

  // Derived options for Material and Location based on Selected Company
  const availableMaterials = useMemo(() => {
    const companyFiltered = selectedCompany === 'ALL' 
      ? baseYardBlocks 
      : baseYardBlocks.filter(b => b.company === selectedCompany);
    return Array.from(new Set(companyFiltered.map(b => b.material))).sort();
  }, [baseYardBlocks, selectedCompany]);

  const availableLocations = useMemo(() => {
    const companyFiltered = selectedCompany === 'ALL' 
      ? baseYardBlocks 
      : baseYardBlocks.filter(b => b.company === selectedCompany);
    return Array.from(new Set(companyFiltered.map(b => b.stockyardLocation).filter(Boolean))).sort() as StockyardLocation[];
  }, [baseYardBlocks, selectedCompany]);

  const yardBlocks = useMemo(() => 
    baseYardBlocks
      .filter(b => selectedCompany === 'ALL' ? true : b.company === selectedCompany)
      .filter(b => selectedLocation === 'ALL' ? true : (b.stockyardLocation?.toUpperCase() === selectedLocation.toUpperCase()))
      .filter(b => selectedMaterial === 'ALL' ? true : b.material === selectedMaterial)
      .filter(b => {
        if (selectedMonth === 'All Months') return true;
        const dateStr = b.transferredToYardAt || b.arrivalDate;
        if (!dateStr) return true;
        const monthIndex = MONTHS.indexOf(selectedMonth) - 1;
        return new Date(dateStr).getMonth() === monthIndex;
      })
      .filter(b => {
        if (selectedYear === 'All Years') return true;
        const dateStr = b.transferredToYardAt || b.arrivalDate;
        if (!dateStr) return true;
        return new Date(dateStr).getFullYear() === Number(selectedYear);
      })
      .filter(b => b.jobNo.toLowerCase().includes(searchTerm.toLowerCase()) || b.company.toLowerCase().includes(searchTerm.toLowerCase()) || b.material.toLowerCase().includes(searchTerm.toLowerCase()) || (b.minesMarka && b.minesMarka.toLowerCase().includes(searchTerm.toLowerCase())))
      .sort((a, b) => a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true })), 
  [baseYardBlocks, selectedCompany, selectedLocation, selectedMaterial, selectedMonth, selectedYear, searchTerm]);

  const totals = useMemo(() => {
    const vol = yardBlocks.reduce((acc, b) => acc + (b.totalSqFt || 0), 0);
    const weight = yardBlocks.reduce((acc, b) => acc + (b.weight || 0), 0);
    return {
      count: yardBlocks.length,
      volume: vol,
      avgYield: weight > 0 ? (vol / weight).toFixed(2) : '0.00'
    };
  }, [yardBlocks]);

  const selectableBlocks = useMemo(() => yardBlocks.filter(b => checkPermission(activeStaff, b.company)), [yardBlocks, activeStaff]);
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
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handleDelete = async (id: string, jobNo: string) => {
    if (isGuest) return;
    if (!window.confirm(`Permanently delete Block #${jobNo} from stock?`)) return;
    try {
      await db.deleteBlock(id);
      onRefresh();
    } catch (err) {
      alert("Delete failed.");
    }
  };

  const handleBulkDelete = async () => {
    if (isGuest || selectedIds.size === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.size} selected records from Stockyard?`)) return;
    setIsSavingEdit(true);
    try {
      await db.deleteBlocks(Array.from(selectedIds) as string[]);
      setSelectedIds(new Set());
      onRefresh();
    } catch (err: any) {
      alert("Bulk delete failed: " + err.message);
    } finally {
      setIsSavingEdit(false);
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
        const rawTxt = getCellValue(cell); 
        const txt = rawTxt.toLowerCase().trim();
        const val = txt.replace(/[^a-z0-9]/g, '');

        if (val.includes('job') || val === 'no') colMap['jobNo'] = colNumber;
        else if (val.includes('company') || val.includes('party')) colMap['company'] = colNumber;
        else if (val.includes('material')) colMap['material'] = colNumber;
        else if (val.includes('marka')) colMap['minesMarka'] = colNumber;
        else if (val.includes('weight') || val.includes('ton')) colMap['weight'] = colNumber;
        else if (val.includes('pcs') || val.includes('count')) colMap['slabCount'] = colNumber;
        else if (val.includes('sqft') || val.includes('sq ft') || val.includes('area')) colMap['totalSqFt'] = colNumber;
        else if (val.includes('msp') || val.includes('price')) colMap['msp'] = colNumber;
        else if (val.includes('loc')) colMap['location'] = colNumber;
        
        // Strict Dimension Matching
        else if (val === 'l' || val === 'len' || val === 'length') colMap['slabLength'] = colNumber;
        else if (val === 'w' || val === 'wid' || val === 'width') colMap['slabWidth'] = colNumber;
        else if (val === 'h' || val === 'height') colMap['slabWidth'] = colNumber; // Map H to Width for Slabs
        
        // Fallback for Merged/Complex Headers
        else if (val.includes('dim') || val.includes('size')) colMap['_dimStart'] = colNumber;
      });

      // --- INTELLIGENT MAPPING RECOVERY ---
      
      // 1. If no explicit Length found, but 'Dimension' column exists, use it as Length
      if (!colMap['slabLength'] && colMap['_dimStart']) {
          colMap['slabLength'] = colMap['_dimStart'];
      }

      // 2. If Length is found (explicitly or via fallback), but Width is missing:
      // Check the VERY NEXT column. If it's not already mapped to something else, assume it's Width.
      if (colMap['slabLength'] && !colMap['slabWidth']) {
          const nextCol = colMap['slabLength'] + 1;
          const isTaken = Object.values(colMap).includes(nextCol);
          // Also check if next col header looks like a dimension unit or empty
          if (!isTaken) {
              colMap['slabWidth'] = nextCol;
          }
      }

      if (!colMap['jobNo']) throw new Error("Missing 'Job No' column.");

      const newBlocks: Block[] = [];
      const existingJobNos = new Set(blocks.map(b => b.jobNo.toUpperCase()));
      const seenInFile = new Set<string>();

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 1) return;
        const jobNo = getCellValue(row, colMap['jobNo']).toUpperCase();
        if (!jobNo || existingJobNos.has(jobNo) || seenInFile.has(jobNo)) return;

        let sLength = getNumericValue(row, colMap['slabLength']);
        let sWidth = getNumericValue(row, colMap['slabWidth']);

        // 3. Combined String Fallback (e.g. "106x64" in one cell)
        // If we only have one value (or Length column had text), try parsing it
        if ((!sLength || !sWidth) && colMap['slabLength']) {
             const rawVal = getCellValue(row, colMap['slabLength']);
             // Matches "106 x 64", "106*64", "106 64"
             const match = rawVal.match(/([0-9]+(?:\.[0-9]+)?)\s*[x*X\s]\s*([0-9]+(?:\.[0-9]+)?)/);
             if (match) {
                 sLength = parseFloat(match[1]);
                 sWidth = parseFloat(match[2]);
             }
        }

        newBlocks.push({
          id: crypto.randomUUID(),
          jobNo,
          company: getCellValue(row, colMap['company']).toUpperCase() || 'UNKNOWN',
          material: getCellValue(row, colMap['material']).toUpperCase() || 'UNKNOWN',
          minesMarka: getCellValue(row, colMap['minesMarka']).toUpperCase() || '',
          weight: getNumericValue(row, colMap['weight']),
          slabLength: sLength,
          slabWidth: sWidth,
          slabCount: Math.round(getNumericValue(row, colMap['slabCount'])),
          totalSqFt: getNumericValue(row, colMap['totalSqFt']),
          msp: getCellValue(row, colMap['msp']).toUpperCase(),
          stockyardLocation: (getCellValue(row, colMap['location']) as StockyardLocation) || 'Field',
          status: BlockStatus.IN_STOCKYARD,
          transferredToYardAt: new Date().toISOString(),
          arrivalDate: new Date().toISOString().split('T')[0],
          length: 0, width: 0, height: 0, 
          isPriority: false, preCuttingProcess: 'None', enteredBy: activeStaff, powerCuts: []
        });
        seenInFile.add(jobNo);
      });

      if (newBlocks.length > 0) {
        await db.addBlocks(newBlocks);
        onRefresh();
        alert(`Imported ${newBlocks.length} records to stock.`);
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

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock || isGuest) return;
    setIsSavingEdit(true);
    try {
      await db.updateBlock(editingBlock.id, {
        ...editFormData,
        jobNo: editFormData.jobNo?.toUpperCase(),
        company: editFormData.company?.toUpperCase(),
        material: editFormData.material?.toUpperCase(),
        minesMarka: editFormData.minesMarka?.toUpperCase(),
        msp: editFormData.msp?.toUpperCase(),
        slabLength: Number(editFormData.slabLength),
        slabWidth: Number(editFormData.slabWidth),
        slabCount: Number(editFormData.slabCount),
        totalSqFt: Number(editFormData.totalSqFt),
        weight: Number(editFormData.weight)
      });
      setEditingBlock(null);
      onRefresh();
    } catch (err: any) {
      alert("Update failed: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleExecuteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) return;
    setIsSavingEdit(true);
    try {
      const soldAt = new Date().toISOString();
      
      if (saleModalOpen.block) {
        const block = saleModalOpen.block;
        const requestedSft = Number(Number(saleFormData.soldSqFt).toFixed(2));
        const currentSft = Number((block.totalSqFt || 0).toFixed(2));

        if (requestedSft > currentSft) {
          throw new Error(`Sold quantity (${requestedSft}) cannot exceed stock (${currentSft})`);
        }

        if (requestedSft < currentSft) {
          const soldPart: Block = {
            ...block,
            id: crypto.randomUUID(),
            jobNo: `${block.jobNo}-P${Date.now().toString().slice(-4)}`, 
            status: BlockStatus.SOLD,
            totalSqFt: requestedSft,
            soldTo: saleFormData.soldTo.toUpperCase(),
            billNo: saleFormData.billNo.toUpperCase(),
            soldAt: soldAt,
            slabCount: Math.round((block.slabCount || 0) * (requestedSft / currentSft))
          };
          await db.addBlock(soldPart);
          
          const remainingSft = Number((currentSft - requestedSft).toFixed(2));
          await db.updateBlock(block.id, {
            totalSqFt: remainingSft,
            slabCount: (block.slabCount || 0) - (soldPart.slabCount || 0)
          });
        } else {
          await db.updateBlock(block.id, {
            status: BlockStatus.SOLD,
            soldTo: saleFormData.soldTo.toUpperCase(),
            billNo: saleFormData.billNo.toUpperCase(),
            soldAt: soldAt
          });
        }
      } else {
        const idsArray = Array.from(selectedIds) as string[];
        for (const id of idsArray) {
          await db.updateBlock(id, {
            status: BlockStatus.SOLD,
            soldTo: saleFormData.soldTo.toUpperCase(),
            billNo: saleFormData.billNo.toUpperCase(),
            soldAt: soldAt
          });
        }
      }

      setSelectedIds(new Set());
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

  const handleExportExcel = () => {
    const reportData = yardBlocks.map(b => ({
      jobNo: b.jobNo, company: b.company, material: b.material, marka: b.minesMarka || '', dim: `${Math.round(b.slabLength || 0)} x ${Math.round(b.slabWidth || 0)}`,
      slabs: b.slabCount, sqFt: b.totalSqFt?.toFixed(2), weight: b.weight?.toFixed(2), location: b.stockyardLocation, msp: b.msp || ''
    }));
    const columns = [
      { header: 'Job No', key: 'jobNo', width: 15 }, { header: 'Company', key: 'company', width: 20 },
      { header: 'Material', key: 'material', width: 20 }, { header: 'Marka', key: 'marka', width: 15 },
      { header: 'Dimensions', key: 'dim', width: 15 },
      { header: 'Slabs', key: 'slabs', width: 10 }, { header: 'Sq Ft', key: 'sqFt', width: 15 },
      { header: 'Weight', key: 'weight', width: 12 }, { header: 'Location', key: 'location', width: 15 },
      { header: 'MSP', key: 'msp', width: 12 },
    ];
    exportToExcel(reportData, columns, 'Yard', `Stockyard_Report_${new Date().toISOString().split('T')[0]}`);
  };

  const commonSelectStyle = "w-full bg-white border border-[#d6d3d1] rounded-lg p-3 text-sm font-medium focus:border-[#5c4033] outline-none shadow-sm transition-all";

  return (
    <div className="space-y-10 pb-32">
      {/* SECTION HEADER */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center text-stone-500">
          <i className="fas fa-warehouse text-xl"></i>
        </div>
        <h2 className="text-2xl font-bold text-[#292524]">Stockyard Inventory</h2>
      </div>

      {/* FILTER BAR */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <div className="lg:col-span-2 relative">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e] text-xs"></i>
          <input 
            type="text" 
            placeholder="Search..." 
            className={`${commonSelectStyle} pl-10`} 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
        
        <div><select className={commonSelectStyle} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>{MONTHS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
        <div><select className={commonSelectStyle} value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
        <div>
          <select className={commonSelectStyle} value={selectedCompany} onChange={e => { setSelectedCompany(e.target.value); setSelectedMaterial('ALL'); setSelectedLocation('ALL'); }}>
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
        
        <div>
          <select className={commonSelectStyle} value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
            <option value="ALL">All Locations</option>
            {availableLocations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="flex gap-2 lg:col-span-2 xl:col-span-1">
          {!isGuest && (
            <>
              <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" onChange={handleImportExcel} />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex-1 bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all"
              >
                {isImporting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-import text-blue-600"></i>} Import
              </button>
            </>
          )}
          <button onClick={handleExportExcel} className="flex-1 bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all"><i className="fas fa-file-excel text-green-600"></i> Export</button>
        </div>
      </div>

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && !isGuest && (
        <div className="fixed bottom-24 right-8 z-50 flex flex-col sm:flex-row gap-3 animate-in slide-in-from-bottom-4">
          <button 
            onClick={() => {
              if (selectedIds.size === 1) {
                const singleBlock = yardBlocks.find(b => selectedIds.has(b.id));
                if (singleBlock) {
                  setSaleFormData({ soldTo: '', billNo: '', soldSqFt: (singleBlock.totalSqFt || 0).toFixed(2) });
                  setSaleModalOpen({ open: true, block: singleBlock });
                  return;
                }
              }
              setSaleFormData({ soldTo: '', billNo: '', soldSqFt: '' });
              setSaleModalOpen({open: true, block: null});
            }} 
            className="bg-[#5c4033] text-white px-8 py-4 rounded-xl font-bold text-sm shadow-2xl hover:bg-[#4a3b32] flex items-center gap-3 transition-all active:scale-95 animate-pulse"
          >
            <i className="fas fa-shopping-cart"></i> RECORD SALE ({selectedIds.size})
          </button>
          <button 
            onClick={handleBulkDelete}
            className="bg-red-500 text-white px-8 py-4 rounded-xl font-bold text-sm shadow-2xl hover:bg-red-600 flex items-center gap-3 transition-all active:scale-95"
          >
            <i className="fas fa-trash"></i> DELETE SELECTED
          </button>
        </div>
      )}

      {/* SUMMARY AREA */}
      <div className="flex flex-wrap gap-4">
        <div className="bg-white border border-[#d6d3d1] rounded-2xl px-8 py-6 min-w-[180px] shadow-sm"><div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-widest mb-1">Total Blocks</div><div className="text-4xl font-black text-[#292524] tabular-nums">{totals.count}</div></div>
        <div className="bg-white border border-[#d6d3d1] rounded-2xl px-8 py-6 min-w-[240px] shadow-sm"><div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-widest mb-1">Total Volume</div><div className="text-4xl font-black text-[#292524] tabular-nums">{totals.volume.toFixed(2)} <span className="text-sm font-bold text-[#78716c]">Sq Ft</span></div></div>
        <div className="bg-white border border-[#d6d3d1] rounded-2xl px-8 py-6 min-w-[180px] shadow-sm"><div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-widest mb-1">Avg Yield</div><div className="text-4xl font-black text-emerald-600 tabular-nums">{totals.avgYield} <span className="text-sm font-bold text-[#78716c]">ft/T</span></div></div>
      </div>

      {/* INVENTORY LIST */}
      <div className="pt-4 border-t border-[#e7e5e4]">
        <div className="flex items-center gap-3 mb-6">
          <i className="fas fa-layer-group text-stone-400"></i>
          <h3 className="text-lg font-bold text-[#4a3b32]">Yard Inventory</h3>
        </div>

        {/* MOBILE VIEW (CARDS) */}
        <div className="lg:hidden space-y-4">
          {yardBlocks.map(block => {
            const isSelected = selectedIds.has(block.id);
            const canEdit = checkPermission(activeStaff, block.company);
            const recovery = (block.totalSqFt && block.weight) ? (block.totalSqFt / block.weight).toFixed(2) : '0.00';
            
            return (
              <div key={block.id} className={`bg-white border border-[#d6d3d1] rounded-xl p-5 shadow-sm transition-all ${isSelected ? 'ring-2 ring-[#5c4033] bg-[#fffaf5]' : ''}`}>
                <div className="flex justify-between items-start mb-2">
                   <div className="flex items-center gap-4">
                      {!isGuest && (
                        <input type="checkbox" checked={isSelected} onChange={() => handleToggleId(block.id)} className="w-5 h-5 rounded border-stone-300 text-[#5c4033]" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                           <span className="text-lg font-black text-[#292524]">#{block.jobNo}</span>
                           <span className="bg-white text-[#78716c] text-[10px] font-bold px-2 py-0.5 rounded border border-[#d6d3d1] uppercase">{block.stockyardLocation}</span>
                        </div>
                        <div className="text-sm font-bold text-[#57534e] mt-0.5 uppercase">{block.company}</div>
                      </div>
                   </div>
                   <div className="text-right">
                      <div className="text-xl font-black text-[#292524] tabular-nums">
                        {block.totalSqFt?.toFixed(2)} <span className="text-xs font-bold text-[#78716c]">ft</span>
                      </div>
                      <div className="text-[10px] font-black text-emerald-600 uppercase">{recovery} ft/T</div>
                   </div>
                </div>

                <div className="grid grid-cols-1 gap-2 border-t border-[#f5f5f4] pt-3 mt-3">
                   <div className="flex justify-between items-center">
                      <div className="text-[9px] font-bold text-[#a8a29e] uppercase tracking-wider">Weight & Material</div>
                      <div className="text-xs font-bold text-[#44403c] uppercase">{block.weight?.toFixed(2)} T | {block.material}</div>
                   </div>
                   <div className="flex justify-between items-center">
                      <div className="text-[9px] font-bold text-[#a8a29e] uppercase tracking-wider">Dimensions</div>
                      <div className="text-xs font-medium text-[#44403c] uppercase">{Math.round(block.slabLength || 0)} x {Math.round(block.slabWidth || 0)}</div>
                   </div>
                </div>

                <div className="flex justify-between items-center mt-5">
                   <button className="bg-white border-2 border-[#5c4033] px-4 py-1.5 rounded-lg text-xs font-black text-[#5c4033] text-center min-w-[70px] shadow-sm">
                      {block.msp || 'MSP'}
                   </button>
                   <div className="flex gap-2">
                      {!isGuest && canEdit && (
                        <>
                           <button onClick={() => { setEditingBlock(block); setEditFormData(block); }} className="w-10 h-10 flex items-center justify-center bg-white border border-[#d6d3d1] text-stone-500 rounded-lg hover:bg-stone-50"><i className="fas fa-pen text-sm"></i></button>
                           <button 
                             onClick={() => { 
                               setSaleFormData({ soldTo: '', billNo: '', soldSqFt: (block.totalSqFt || 0).toFixed(2) });
                               setSaleModalOpen({ open: true, block: block }); 
                             }}
                             className="w-10 h-10 flex items-center justify-center bg-amber-100 border-2 border-amber-400 text-amber-700 rounded-lg"
                           >
                             <i className="fas fa-shopping-cart text-sm"></i>
                           </button>
                           <button onClick={() => handleDelete(block.id, block.jobNo)} className="w-10 h-10 flex items-center justify-center bg-white border border-red-100 text-red-400 rounded-lg hover:bg-red-50"><i className="fas fa-trash-alt text-sm"></i></button>
                        </>
                      )}
                   </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* DESKTOP VIEW (TABLE) */}
        <div className="hidden lg:block bg-white border border-[#d6d3d1] rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#f5f5f4] text-[#78716c] text-[10px] font-bold uppercase border-b">
                <tr>
                  <th className="px-6 py-4 w-12 text-center">{!isGuest && (<input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} className="w-4 h-4 rounded border-stone-300 text-[#5c4033] cursor-pointer" />)}</th>
                  <th className="px-6 py-4">Job & Party</th>
                  <th className="px-6 py-4">Material</th>
                  <th className="px-6 py-4">Dimensions</th>
                  <th className="px-6 py-4 text-center">Weight (T)</th>
                  <th className="px-6 py-4 text-center">Qty (SqFt)</th>
                  <th className="px-6 py-4 text-center">Recovery (ft/T)</th>
                  <th className="px-6 py-4 text-center">MSP</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {yardBlocks.map(block => {
                  const isSelected = selectedIds.has(block.id);
                  const canEdit = checkPermission(activeStaff, block.company);
                  const recovery = (block.totalSqFt && block.weight) ? (block.totalSqFt / block.weight).toFixed(2) : '0.00';
                  
                  return (
                    <tr key={block.id} className={`hover:bg-[#faf9f6] transition-colors ${isSelected ? 'bg-amber-50' : 'bg-white'}`}>
                      <td className="px-6 py-4 text-center">{!isGuest && canEdit && (<input type="checkbox" checked={isSelected} onChange={() => handleToggleId(block.id)} className="w-4 h-4 rounded border-stone-300 text-[#5c4033] cursor-pointer" />)}</td>
                      <td className="px-6 py-4"><div className="font-bold text-sm">#{block.jobNo}</div><div className="text-[10px] font-medium text-[#78716c] uppercase">{block.company}</div></td>
                      <td className="px-6 py-4 text-xs font-bold text-[#57534e]"><div>{block.material}</div><div className="text-[9px] text-[#a8a29e]">{block.minesMarka || '-'}</div></td>
                      <td className="px-6 py-4 text-xs font-mono">{Math.round(block.slabLength || 0)} x {Math.round(block.slabWidth || 0)}</td>
                      <td className="px-6 py-4 text-center font-bold text-sm">{block.weight?.toFixed(2)}</td>
                      <td className="px-6 py-4 text-center"><div className="font-black text-[#5c4033]">{block.totalSqFt?.toFixed(2)}</div><div className="text-[9px] text-[#a8a29e]">{block.slabCount} pcs</div></td>
                      <td className="px-6 py-4 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-black ${Number(recovery) > 250 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-stone-50 text-stone-600 border border-stone-100'}`}>{recovery}</span></td>
                      <td className="px-6 py-4 text-center">
                        <button className="border-2 border-[#5c4033] px-3 py-1 rounded text-xs font-black text-[#5c4033] hover:bg-stone-50 transition-colors shadow-sm">
                          {block.msp || '-'}
                        </button>
                      </td>
                      <td className="px-6 py-4"><span className="px-2 py-1 bg-[#f5f5f4] border border-stone-200 rounded text-[9px] font-bold text-stone-500 uppercase">{block.stockyardLocation}</span></td>
                      <td className="px-6 py-4 text-right">
                        {!isGuest && canEdit && (
                          <div className="flex justify-end gap-1">
                            <button 
                               onClick={() => { 
                                 setSaleFormData({ soldTo: '', billNo: '', soldSqFt: (block.totalSqFt || 0).toFixed(2) });
                                 setSaleModalOpen({ open: true, block: block }); 
                               }}
                               className="text-amber-700 bg-amber-100 border-2 border-amber-400 hover:bg-amber-200 p-2 rounded-lg"
                            ><i className="fas fa-shopping-cart"></i></button>
                            <button onClick={() => { setEditingBlock(block); setEditFormData(block); }} className="text-stone-400 hover:text-[#5c4033] p-2"><i className="fas fa-edit"></i></button>
                            <button onClick={() => handleDelete(block.id, block.jobNo)} className="text-stone-300 hover:text-red-500 p-2"><i className="fas fa-trash-alt"></i></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {saleModalOpen.open && (
        <div className="fixed inset-0 z-[600] bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95">
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                <div>
                   <h3 className="text-2xl font-black text-[#5c4033] uppercase italic">Record Sale</h3>
                   {saleModalOpen.block && (
                     <div className="text-[10px] font-bold text-stone-500 mt-1 uppercase">Job #{saleModalOpen.block.jobNo} &bull; Stock: {saleModalOpen.block.totalSqFt?.toFixed(2)} ft</div>
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
                 {saleModalOpen.block && (
                   <div className="bg-[#fffaf5] p-5 rounded-xl border border-amber-100">
                      <div className="flex justify-between items-center mb-1.5">
                         <label className="block text-[10px] font-bold text-amber-800 uppercase">Quantity to Sell (SqFt)</label>
                         <div className="text-[10px] font-bold text-amber-600">Max: {saleModalOpen.block.totalSqFt?.toFixed(2)}</div>
                      </div>
                      <input 
                        type="number" 
                        step="0.01" 
                        required 
                        max={saleModalOpen.block.totalSqFt}
                        className="w-full bg-white border border-[#d6d3d1] p-4 rounded-xl text-xl font-black text-[#5c4033] focus:border-[#5c4033] outline-none" 
                        value={saleFormData.soldSqFt} 
                        onChange={e => setSaleFormData({...saleFormData, soldSqFt: e.target.value})} 
                      />
                      <div className="mt-2 flex justify-between px-1">
                         <span className="text-[9px] font-bold text-amber-700">Remaining Stock:</span>
                         <span className="text-[9px] font-black text-[#5c4033]">
                           {Number(Number(saleModalOpen.block.totalSqFt || 0) - Number(saleFormData.soldSqFt || 0)).toFixed(2)} ft
                         </span>
                      </div>
                   </div>
                 )}
                 <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setSaleModalOpen({open: false, block: null})} className="flex-1 bg-stone-100 py-4 rounded-xl font-bold uppercase text-xs text-stone-600">Cancel</button>
                    <button type="submit" disabled={isSavingEdit} className="flex-[2] bg-[#5c4033] text-white py-4 rounded-xl font-bold uppercase text-xs shadow-xl active:scale-95 transition-all">
                      {isSavingEdit ? 'Recording...' : (saleModalOpen.block && Number(saleFormData.soldSqFt) < (saleModalOpen.block.totalSqFt || 0) ? 'Partial Sale' : 'Complete Sale')}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {editingBlock && (
        <div className="fixed inset-0 z-[600] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-8 shadow-2xl">
             <div className="flex justify-between items-center mb-6 border-b pb-4"><h3 className="text-xl font-bold text-[#292524]">Update Yard Registry</h3><button onClick={() => setEditingBlock(null)}><i className="fas fa-times text-[#a8a29e]"></i></button></div>
             <form onSubmit={handleSaveEdit} className="grid grid-cols-2 gap-6">
                <div className="col-span-2"><label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Job No</label><input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.jobNo || ''} onChange={e => setEditFormData({...editFormData, jobNo: e.target.value})} /></div>
                <div><label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Material</label><input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.material || ''} onChange={e => setEditFormData({...editFormData, material: e.target.value})} /></div>
                <div><label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Marka</label><input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.minesMarka || ''} onChange={e => setEditFormData({...editFormData, minesMarka: e.target.value})} /></div>
                <div><label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Weight (T)</label><input type="number" step="0.01" className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.weight || 0} onChange={e => setEditFormData({...editFormData, weight: Number(e.target.value)})} /></div>
                <div><label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">MSP (Price)</label><input className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-black text-amber-800" value={editFormData.msp || ''} onChange={e => setEditFormData({...editFormData, msp: e.target.value})} /></div>
                <div><label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Slab Size</label><div className="flex gap-2"><input type="number" step="0.01" className="w-1/2 bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm" placeholder="L" value={editFormData.slabLength || 0} onChange={e => setEditFormData({...editFormData, slabLength: Number(e.target.value)})} /><input type="number" step="0.01" className="w-1/2 bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm" placeholder="W" value={editFormData.slabWidth || 0} onChange={e => setEditFormData({...editFormData, slabWidth: Number(e.target.value)})} /></div></div>
                <div><label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Slab Count</label><input type="number" className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.slabCount || 0} onChange={e => setEditFormData({...editFormData, slabCount: Number(e.target.value)})} /></div>
                <div><label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Total SqFt</label><input type="number" step="0.01" className="w-full bg-[#faf9f6] border border-[#d6d3d1] p-3 rounded-lg text-sm font-bold" value={editFormData.totalSqFt || 0} onChange={e => setEditFormData({...editFormData, totalSqFt: Number(e.target.value)})} /></div>
                <div className="col-span-2 pt-4 flex gap-3"><button type="button" onClick={() => setEditingBlock(null)} className="flex-1 border py-4 rounded-xl font-bold text-xs uppercase">Cancel</button><button type="submit" disabled={isSavingEdit} className="flex-[2] bg-[#5c4033] text-white py-4 rounded-xl font-bold text-xs uppercase shadow-xl">{isSavingEdit ? 'Syncing...' : 'Update Records'}</button></div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};
