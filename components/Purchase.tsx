
import React, { useState, useMemo, useRef } from 'react';
import { db } from '../services/db';
import { Block, BlockStatus, StaffMember } from '../types';
import { exportToExcel } from '../services/utils';
import ExcelJS from 'exceljs';

interface Props {
  blocks: Block[];
  onRefresh: () => void;
  activeStaff: StaffMember;
  isGuest?: boolean;
}

export const Purchase: React.FC<Props> = ({ blocks, onRefresh, activeStaff, isGuest }) => {
  // --- UI STATES ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- TRANSITION MODAL STATE ---
  const [isTransitModalOpen, setIsTransitModalOpen] = useState(false);
  const [transitFormData, setTransitFormData] = useState({
    loadingDate: new Date().toISOString().split('T')[0],
    forwarder: '',
    shipmentGroup: '',
    expectedArrival: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  // --- ARRIVAL & EDIT STATES ---
  const [transferBlock, setTransferBlock] = useState<Block | null>(null);
  const [arrivalDims, setArrivalDims] = useState({ length: '', width: '', height: '', minesMarka: '' });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Block>>({});
  
  const [formData, setFormData] = useState({
    jobNo: '',
    supplier: '',
    material: '',
    country: '',
    weight: '',
  });

  // --- DATA FILTERING & GROUPING ---
  const purchaseBlocks = useMemo(() => 
    blocks
      .filter(b => b.status === BlockStatus.PURCHASED)
      .sort((a, b) => a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true })),
    [blocks]
  );

  const suppliers = useMemo(() => {
    const s = new Set<string>();
    purchaseBlocks.forEach(b => { if (b.supplier) s.add(b.supplier.toUpperCase().trim()); });
    return Array.from(s).sort();
  }, [purchaseBlocks]);

  const filtered = useMemo(() => {
    return purchaseBlocks.filter(b => {
      const sMatch = selectedSupplier === 'ALL' || b.supplier?.toUpperCase() === selectedSupplier;
      const qMatch = b.jobNo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                     b.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     b.supplier?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     b.shipmentGroup?.toLowerCase().includes(searchTerm.toLowerCase());
      return sMatch && qMatch;
    });
  }, [purchaseBlocks, selectedSupplier, searchTerm]);

  const groupedByShipment = useMemo(() => {
    const groups: Record<string, Block[]> = {};
    filtered.forEach(b => {
      const groupName = b.shipmentGroup || 'MINE STOCK';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(b);
    });
    
    // Sort groups so MINE STOCK is first, then alphabetical by shipment name
    return Object.keys(groups).sort((a, b) => {
      if (a === 'MINE STOCK') return -1;
      if (b === 'MINE STOCK') return 1;
      return a.localeCompare(b);
    }).reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {} as Record<string, Block[]>);
  }, [filtered]);

  // --- HELPER UTILS ---
  const getCellValue = (row: any, colNumber?: number): string => {
    if (!colNumber) return '';
    try {
      const cell = (row as any).getCell(colNumber as number);
      const val = cell.value;
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') {
        const vObj = val as any;
        if (vObj && vObj.result !== undefined) return String(vObj.result).trim();
        if (vObj && vObj.text !== undefined) return String(vObj.text).trim();
      }
      return String(val).trim();
    } catch (e) {
      return '';
    }
  };

  const getNumericValue = (row: any, colNumber?: number) => {
    const val = getCellValue(row, colNumber);
    if (!val) return 0;
    const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
    return num || 0;
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isGuest) return;
    setIsSubmitting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const arrayBuffer = await file.arrayBuffer();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];

      const headerRow = worksheet.getRow(1);
      const colMap: Record<string, number> = {};
      headerRow.eachCell((cell, colNumber) => {
        const val = cell.value?.toString().toLowerCase().trim() || '';
        if (val.includes('job') || val === 'no') colMap['jobNo'] = colNumber;
        else if (val.includes('supplier') || val.includes('party')) colMap['supplier'] = colNumber;
        else if (val.includes('material')) colMap['material'] = colNumber;
        else if (val.includes('country') || val.includes('origin')) colMap['country'] = colNumber;
        else if (val.includes('weight') || val.includes('wt') || val.includes('ton')) colMap['weight'] = colNumber;
        else if (val.includes('shipment') || val.includes('group')) colMap['shipmentGroup'] = colNumber;
        else if (val.includes('forwarder')) colMap['forwarder'] = colNumber;
      });

      if (!colMap['jobNo']) throw new Error("Excel must contain at least 'Job No' column.");

      const newBlocks: Block[] = [];
      const existingJobNos = new Set<string>(blocks.map(b => b.jobNo.toUpperCase()));
      const seenInFile = new Set<string>();

      worksheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber <= 1) return;
        
        const getVal = (col: number | undefined): string => {
          if (!col) return '';
          const cell = (row as any).getCell(col as number);
          const val: any = cell.value;
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') {
            const v = val as any;
            if (v.result !== undefined) return String(v.result).trim();
            if (v.text !== undefined) return String(v.text).trim();
          }
          return String(val).trim();
        };

        const jobNoStr: string = String(getVal(colMap['jobNo'])).toUpperCase();
        if (!jobNoStr || existingJobNos.has(jobNoStr) || seenInFile.has(jobNoStr)) return;

        newBlocks.push({
          id: crypto.randomUUID(),
          jobNo: jobNoStr,
          company: 'HI-LINE',
          supplier: getVal(colMap['supplier']).toUpperCase() || 'UNKNOWN',
          material: getVal(colMap['material']).toUpperCase() || 'UNKNOWN',
          country: getVal(colMap['country']).toUpperCase() || '-',
          weight: getNumericValue(row, colMap['weight']),
          status: BlockStatus.PURCHASED,
          arrivalDate: new Date().toISOString().split('T')[0],
          length: 0, width: 0, height: 0,
          isPriority: false,
          powerCuts: [],
          enteredBy: activeStaff,
          preCuttingProcess: 'None',
          minesMarka: '',
          shipmentGroup: getVal(colMap['shipmentGroup']).toUpperCase(),
          forwarder: getVal(colMap['forwarder']).toUpperCase()
        });
        seenInFile.add(jobNoStr);
      });

      if (newBlocks.length > 0) {
        await db.addBlocks(newBlocks);
        await onRefresh();
        alert(`Successfully imported ${newBlocks.length} records.`);
      } else {
        alert("No new records found.");
      }
    } catch (err: any) {
      alert("Import failed: " + err.message);
    } finally {
      setIsSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportExcel = () => {
    const reportData = purchaseBlocks.map(b => ({
      jobNo: b.jobNo,
      supplier: b.supplier,
      material: b.material,
      country: b.country,
      shipment: b.shipmentGroup || '-',
      forwarder: b.forwarder || '-',
      weight: b.weight.toFixed(2),
      status: b.loadingDate ? 'IN TRANSIT' : 'MINE STOCK',
      loadingDate: b.loadingDate || '-',
      expectedArrival: b.expectedArrivalDate || '-'
    }));
    const columns = [
      { header: 'Job No', key: 'jobNo', width: 15 },
      { header: 'Supplier', key: 'supplier', width: 25 },
      { header: 'Material', key: 'material', width: 20 },
      { header: 'Country', key: 'country', width: 15 },
      { header: 'Shipment', key: 'shipment', width: 15 },
      { header: 'Forwarder', key: 'forwarder', width: 20 },
      { header: 'Weight (T)', key: 'weight', width: 12 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Loading Date', key: 'loadingDate', width: 15 },
      { header: 'Expected Arrival', key: 'expectedArrival', width: 15 },
    ];
    exportToExcel(reportData, columns, 'Registry', `Procurement_Report_${new Date().toISOString().split('T')[0]}`);
  };

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) return;
    const isDuplicate = blocks.some(b => b.jobNo.toUpperCase() === formData.jobNo.toUpperCase());
    if (isDuplicate) { alert(`Error: Job No ${formData.jobNo} already exists.`); return; }
    setIsSubmitting(true);
    try {
      const newBlock: Block = {
        id: crypto.randomUUID(),
        jobNo: formData.jobNo.toUpperCase().trim(),
        company: 'HI-LINE',
        supplier: formData.supplier.toUpperCase().trim(),
        material: formData.material.toUpperCase().trim(),
        country: formData.country.toUpperCase().trim(),
        weight: Number(formData.weight),
        status: BlockStatus.PURCHASED,
        arrivalDate: new Date().toISOString().split('T')[0],
        length: 0, width: 0, height: 0,
        isPriority: false, powerCuts: [], enteredBy: activeStaff,
        preCuttingProcess: 'None', minesMarka: ''
      };
      await db.addBlock(newBlock);
      setFormData({ jobNo: '', supplier: '', material: '', country: '', weight: '' });
      setShowAddForm(false);
      onRefresh();
    } catch (err: any) { alert("Failed to add: " + err.message); } finally { setIsSubmitting(false); }
  };

  const handleResetLoading = async (id: string) => {
    if (isGuest) return;
    if (!window.confirm("Move back to Mine Stock?")) return;
    setIsSubmitting(true);
    try { await db.updateBlock(id, { loadingDate: '', forwarder: '', expectedArrivalDate: '', shipmentGroup: '' }); onRefresh(); } 
    catch (err: any) { alert("Update failed: " + err.message); } finally { setIsSubmitting(false); }
  };

  const handleFinalArrival = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferBlock || isGuest) return;
    setIsSubmitting(true);
    try {
      await db.updateBlock(transferBlock.id, {
        status: BlockStatus.GANTRY,
        length: Number(arrivalDims.length),
        width: Number(arrivalDims.width),
        height: Number(arrivalDims.height),
        minesMarka: arrivalDims.minesMarka.toUpperCase().trim(),
        arrivalDate: new Date().toISOString().split('T')[0],
        loadingDate: '', forwarder: '', expectedArrivalDate: '', shipmentGroup: ''
      });
      setTransferBlock(null);
      setArrivalDims({ length: '', width: '', height: '', minesMarka: '' });
      onRefresh();
    } catch (err: any) { alert("Arrival recording failed: " + err.message); } finally { setIsSubmitting(false); }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock || isGuest) return;
    setIsSubmitting(true);
    try {
      await db.updateBlock(editingBlock.id, {
        ...editFormData,
        jobNo: editFormData.jobNo?.toUpperCase().trim(),
        supplier: editFormData.supplier?.toUpperCase().trim(),
        material: editFormData.material?.toUpperCase().trim(),
        country: editFormData.country?.toUpperCase().trim(),
        shipmentGroup: editFormData.shipmentGroup?.toUpperCase().trim(),
        weight: Number(editFormData.weight)
      });
      setIsEditModalOpen(false);
      onRefresh();
    } catch (err: any) { alert("Update failed: " + err.message); } finally { setIsSubmitting(false); }
  };

  const executeBulkTransit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0 || isGuest) return;
    setIsSubmitting(true);
    try {
      const idsArray = Array.from(selectedIds) as string[];
      for (const id of idsArray) {
        await db.updateBlock(id, {
          loadingDate: transitFormData.loadingDate,
          forwarder: transitFormData.forwarder.toUpperCase().trim(),
          shipmentGroup: transitFormData.shipmentGroup.toUpperCase().trim(),
          expectedArrivalDate: transitFormData.expectedArrival
        });
      }
      setSelectedIds(new Set());
      setIsTransitModalOpen(false);
      onRefresh();
    } catch (err: any) { alert("Bulk update failed: " + err.message); } finally { setIsSubmitting(false); }
  };

  const inputStyle = "w-full border border-[#d6d3d1] bg-white rounded-lg p-3 text-sm font-bold text-[#292524] focus:border-[#5c4033] outline-none transition-all placeholder:text-stone-300";
  const labelStyle = "block text-[10px] font-bold text-[#5c4033] mb-1 uppercase tracking-widest";

  return (
    <div className="space-y-8 pb-32 relative">
      <style>{`
        .brown-date-picker::-webkit-calendar-picker-indicator {
          filter: invert(24%) sepia(20%) saturate(1287%) hue-rotate(333deg) brightness(93%) contrast(87%);
          cursor: pointer;
        }
      `}</style>

      {/* --- TOP ACTION BAR --- */}
      <div className="bg-white border border-[#d6d3d1] p-4 lg:p-6 rounded-xl shadow-sm flex flex-col md:flex-row gap-4 items-end">
        <div className="w-full md:w-48">
          <label className={labelStyle}>Party / Supplier</label>
          <select 
            value={selectedSupplier} 
            onChange={e => setSelectedSupplier(e.target.value)}
            className="w-full border border-[#d6d3d1] rounded-lg p-3 text-xs font-bold text-[#292524] focus:border-[#5c4033] outline-none bg-white shadow-sm"
          >
            <option value="ALL">All Sources</option>
            {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex-1 w-full">
          <label className={labelStyle}>Registry Search</label>
          <input 
            type="text" 
            placeholder="Search Job, Material, Country, Shipment..." 
            className={inputStyle}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {!isGuest && (
            <>
              <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" onChange={handleImportExcel} />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all"
              >
                <i className="fas fa-file-import text-blue-600"></i> Import
              </button>
              <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className={`px-6 py-3 rounded-lg font-bold text-xs shadow-md flex items-center gap-2 transition-all ${showAddForm ? 'bg-white border border-[#5c4033] text-[#5c4033]' : 'bg-[#5c4033] text-white'}`}
              >
                <i className={`fas ${showAddForm ? 'fa-times' : 'fa-plus-circle'}`}></i>
                {showAddForm ? 'Cancel' : 'New Entry'}
              </button>
            </>
          )}
          <button onClick={handleExportExcel} className="bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm">
            <i className="fas fa-file-excel text-green-600"></i> Export
          </button>
        </div>
      </div>

      {/* Bulk action buttons */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-24 right-8 z-50 flex gap-2 animate-in slide-in-from-bottom-4">
          <button 
            onClick={() => setIsTransitModalOpen(true)}
            className="bg-amber-500 text-white px-6 py-4 rounded-xl font-bold text-sm shadow-2xl hover:bg-amber-600 animate-pulse flex items-center gap-3"
          >
            <i className="fas fa-ship"></i> MOVE TO TRANSIT ({selectedIds.size})
          </button>
          <button 
            onClick={async () => {
              if(!window.confirm(`Delete ${selectedIds.size} records?`)) return;
              setIsSubmitting(true);
              try { await db.deleteBlocks(Array.from(selectedIds) as string[]); setSelectedIds(new Set()); onRefresh(); } catch(e: any) { alert(e.message); } finally { setIsSubmitting(false); }
            }}
            className="bg-red-500 text-white px-6 py-4 rounded-xl font-bold text-sm shadow-2xl hover:bg-red-600"
          >
            <i className="fas fa-trash"></i>
          </button>
        </div>
      )}

      {/* --- ADD FORM --- */}
      {showAddForm && (
        <div className="bg-white border-2 border-[#5c4033] rounded-2xl p-8 shadow-2xl animate-in slide-in-from-top-4 duration-300 max-w-5xl mx-auto w-full">
           <h3 className="text-lg font-bold text-[#5c4033] uppercase mb-6 pb-2 border-b">Register Purchase</h3>
           <form onSubmit={handleSubmitPurchase} className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div><label className={labelStyle}>Job No</label><input required className={inputStyle} value={formData.jobNo} onChange={e => setFormData({...formData, jobNo: e.target.value})} /></div>
              <div><label className={labelStyle}>Supplier</label><input required className={inputStyle} value={formData.supplier} onChange={e => setFormData({...formData, supplier: e.target.value})} /></div>
              <div><label className={labelStyle}>Material</label><input required className={inputStyle} value={formData.material} onChange={e => setFormData({...formData, material: e.target.value})} /></div>
              <div><label className={labelStyle}>Country</label><input required className={inputStyle} value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} /></div>
              <div><label className={labelStyle}>Weight (T)</label><input required type="number" step="0.01" className={inputStyle} value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} /></div>
              <div className="md:col-span-5 pt-4">
                 <button type="submit" className="w-full bg-[#5c4033] text-white py-4 rounded-xl font-bold shadow-md hover:bg-[#4a3b32] active:scale-95 transition-all">
                    Commit to Mine Stock
                 </button>
              </div>
           </form>
        </div>
      )}

      {/* --- SHIPMENT GROUPS (SINGLE GRID PER SHIPMENT) --- */}
      <div className="space-y-12">
        {/* Fix: Cast Object.entries to resolve 'unknown' type for groupBlocks */}
        {(Object.entries(groupedByShipment) as [string, Block[]][]).map(([shipmentName, groupBlocks]) => {
          const totalWeight = groupBlocks.reduce((acc, b) => acc + (b.weight || 0), 0);
          const isMineStock = shipmentName === 'MINE STOCK';
          const forwarder = groupBlocks[0]?.forwarder;
          const loadingDate = groupBlocks[0]?.loadingDate;
          const expectedArrival = groupBlocks[0]?.expectedArrivalDate;
          const isAllGroupSelected = groupBlocks.every(b => selectedIds.has(b.id));

          return (
            <div key={shipmentName} className="space-y-4 animate-in fade-in duration-500">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-2">
                 <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isMineStock ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}></div>
                    <h3 className="text-lg font-black text-[#5c4033] uppercase tracking-wider">{shipmentName}</h3>
                    <span className="bg-stone-100 text-[#78716c] px-3 py-1 rounded-full text-[10px] font-bold">{groupBlocks.length} Blocks</span>
                 </div>
                 
                 {!isMineStock && (
                   <div className="flex flex-wrap gap-4 bg-white border border-[#d6d3d1] px-6 py-3 rounded-xl shadow-sm text-[10px] font-bold text-[#78716c] uppercase">
                      <div className="flex flex-col"><span className="text-[#a8a29e] mb-0.5">Forwarder</span><span className="text-emerald-700 font-black">{forwarder || '-'}</span></div>
                      <div className="w-px h-6 bg-stone-200 hidden sm:block"></div>
                      <div className="flex flex-col"><span className="text-[#a8a29e] mb-0.5">Loading Date</span><span>{loadingDate || '-'}</span></div>
                      <div className="w-px h-6 bg-stone-200 hidden sm:block"></div>
                      <div className="flex flex-col"><span className="text-[#a8a29e] mb-0.5">Expected ETA</span><span>{expectedArrival || '-'}</span></div>
                      <div className="w-px h-6 bg-stone-200 hidden sm:block"></div>
                      <div className="flex flex-col"><span className="text-[#a8a29e] mb-0.5">Total Weight</span><span className="text-[#5c4033] font-black">{totalWeight.toFixed(2)} T</span></div>
                   </div>
                 )}
                 
                 {isMineStock && (
                    <div className="bg-amber-50 border border-amber-200 px-6 py-3 rounded-xl shadow-sm">
                      <span className="text-[10px] font-bold text-amber-800 uppercase">Mine Inventory &bull; {totalWeight.toFixed(2)} T total</span>
                    </div>
                 )}
              </div>

              <div className="bg-white border border-[#d6d3d1] rounded-2xl overflow-hidden shadow-md">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-[#f5f5f4] text-[#78716c] text-[10px] font-bold uppercase border-b">
                      <tr>
                        <th className="px-6 py-4 w-12 text-center">
                          {!isGuest && (
                            <input 
                              type="checkbox" 
                              checked={isAllGroupSelected} 
                              onChange={() => {
                                const newSet = new Set(selectedIds);
                                if (isAllGroupSelected) {
                                  groupBlocks.forEach(b => newSet.delete(b.id));
                                } else {
                                  groupBlocks.forEach(b => newSet.add(b.id));
                                }
                                setSelectedIds(newSet);
                              }} 
                              className="w-4 h-4 rounded border-stone-300 text-[#5c4033]" 
                            />
                          )}
                        </th>
                        <th className="px-6 py-4">Job No</th>
                        <th className="px-6 py-4">Supplier</th>
                        <th className="px-6 py-4">Material & Country</th>
                        <th className="px-6 py-4 text-center">Weight (T)</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {groupBlocks.map(b => {
                        const isSelected = selectedIds.has(b.id);
                        return (
                          <tr key={b.id} className={`hover:bg-[#faf9f6] transition-colors ${isSelected ? 'bg-amber-50' : 'bg-white'}`}>
                            <td className="px-6 py-4 text-center">
                              {!isGuest && (
                                <input 
                                  type="checkbox" 
                                  checked={isSelected} 
                                  onChange={() => {
                                    const n = new Set(selectedIds);
                                    if(n.has(b.id)) n.delete(b.id);
                                    else n.add(b.id);
                                    setSelectedIds(n);
                                  }} 
                                  className="w-4 h-4 rounded border-stone-300 text-[#5c4033]" 
                                />
                              )}
                            </td>
                            <td className="px-6 py-4 font-black text-sm text-[#292524]">#{b.jobNo}</td>
                            <td className="px-6 py-4 text-xs font-bold text-[#57534e] uppercase">{b.supplier}</td>
                            <td className="px-6 py-4">
                              <div className="text-xs font-bold text-[#44403c]">{b.material}</div>
                              <div className="text-[9px] text-[#a8a29e] font-bold uppercase">{b.country}</div>
                            </td>
                            <td className="px-6 py-4 text-center">
                               <span className="text-sm font-black text-[#5c4033]">{b.weight?.toFixed(2)}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                {!isGuest && (
                                  <>
                                    <button onClick={() => { setEditingBlock(b); setEditFormData(b); setIsEditModalOpen(true); }} className="text-stone-400 hover:text-stone-700 p-2"><i className="fas fa-edit"></i></button>
                                    {!isMineStock && (
                                      <>
                                        <button onClick={() => handleResetLoading(b.id)} className="w-8 h-8 flex items-center justify-center bg-white border border-red-200 text-red-400 rounded-lg hover:bg-red-50" title="Back to Mine Stock"><i className="fas fa-undo"></i></button>
                                        <button onClick={() => setTransferBlock(b)} className="px-4 py-2 bg-[#5c4033] text-white rounded-lg text-[10px] font-bold shadow-sm active:scale-95">Arrive</button>
                                      </>
                                    )}
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
          );
        })}
      </div>

      {/* --- TRANSIT MODAL --- */}
      {isTransitModalOpen && (
        <div className="fixed inset-0 z-[600] bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-xl font-black text-[#5c4033] uppercase border-b pb-4 mb-6">Transition to Logistics</h3>
              <form onSubmit={executeBulkTransit} className="space-y-6">
                 <div>
                    <label className={labelStyle}>Shipment Name / Group (e.g. SHIPMENT 1)</label>
                    <input required type="text" className={inputStyle} value={transitFormData.shipmentGroup} onChange={e => setTransitFormData({...transitFormData, shipmentGroup: e.target.value})} placeholder="Shipment ID" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelStyle}>Loading Date</label><input required type="date" className={`${inputStyle} brown-date-picker`} value={transitFormData.loadingDate} onChange={e => setTransitFormData({...transitFormData, loadingDate: e.target.value})} /></div>
                    <div><label className={labelStyle}>Expected Arrival</label><input required type="date" className={`${inputStyle} brown-date-picker`} value={transitFormData.expectedArrival} onChange={e => setTransitFormData({...transitFormData, expectedArrival: e.target.value})} /></div>
                 </div>
                 <div><label className={labelStyle}>Forwarder / CHA</label><input required type="text" className={inputStyle} value={transitFormData.forwarder} onChange={e => setTransitFormData({...transitFormData, forwarder: e.target.value})} /></div>
                 
                 <div className="flex gap-4 pt-2">
                    <button type="button" onClick={() => setIsTransitModalOpen(false)} className="flex-1 bg-stone-100 text-stone-500 py-4 rounded-xl font-bold uppercase text-xs">Cancel</button>
                    <button type="submit" className="flex-[2] bg-amber-500 text-white py-4 rounded-xl font-bold uppercase text-xs shadow-xl">Apply to {selectedIds.size} Items</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* --- ARRIVAL MODAL --- */}
      {transferBlock && (
        <div className="fixed inset-0 z-[600] bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-xl font-black text-[#5c4033] border-b pb-4 mb-6 uppercase">Factory Arrival: #{transferBlock.jobNo}</h3>
              <form onSubmit={handleFinalArrival} className="space-y-6">
                 <div className="grid grid-cols-3 gap-4">
                    <div><label className={labelStyle}>Length</label><input required type="number" step="0.01" className={inputStyle} value={arrivalDims.length} onChange={e => setArrivalDims({...arrivalDims, length: e.target.value})} /></div>
                    <div><label className={labelStyle}>Width</label><input required type="number" step="0.01" className={inputStyle} value={arrivalDims.width} onChange={e => setArrivalDims({...arrivalDims, width: e.target.value})} /></div>
                    <div><label className={labelStyle}>Height</label><input required type="number" step="0.01" className={inputStyle} value={arrivalDims.height} onChange={e => setArrivalDims({...arrivalDims, height: e.target.value})} /></div>
                 </div>
                 <div><label className={labelStyle}>Mines Marka</label><input type="text" className={inputStyle} value={arrivalDims.minesMarka} onChange={e => setArrivalDims({...arrivalDims, minesMarka: e.target.value})} /></div>
                 <div className="flex gap-4">
                    <button type="button" onClick={() => setTransferBlock(null)} className="flex-1 bg-stone-100 text-stone-500 py-4 rounded-xl font-bold uppercase text-xs">Cancel</button>
                    <button type="submit" className="flex-[2] bg-[#5c4033] text-white py-4 rounded-xl font-bold uppercase text-xs shadow-xl">Confirm Arrival</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* --- EDIT MODAL --- */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[600] bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl w-full max-w-2xl p-8 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-xl font-bold text-[#5c4033] mb-6">Edit Entry</h3>
              <form onSubmit={handleSaveEdit} className="grid grid-cols-2 gap-4">
                 <div><label className={labelStyle}>Job No</label><input className={inputStyle} value={editFormData.jobNo || ''} onChange={e => setEditFormData({...editFormData, jobNo: e.target.value})} /></div>
                 <div><label className={labelStyle}>Supplier</label><input className={inputStyle} value={editFormData.supplier || ''} onChange={e => setEditFormData({...editFormData, supplier: e.target.value})} /></div>
                 <div><label className={labelStyle}>Material</label><input className={inputStyle} value={editFormData.material || ''} onChange={e => setEditFormData({...editFormData, material: e.target.value})} /></div>
                 <div><label className={labelStyle}>Country</label><input className={inputStyle} value={editFormData.country || ''} onChange={e => setEditFormData({...editFormData, country: e.target.value})} /></div>
                 <div><label className={labelStyle}>Weight (T)</label><input type="number" step="0.01" className={inputStyle} value={editFormData.weight || ''} onChange={e => setEditFormData({...editFormData, weight: Number(e.target.value)})} /></div>
                 <div><label className={labelStyle}>Shipment Group</label><input className={inputStyle} value={editFormData.shipmentGroup || ''} onChange={e => setEditFormData({...editFormData, shipmentGroup: e.target.value})} /></div>
                 <div className="col-span-2 flex gap-4 pt-4">
                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 border py-4 rounded-xl font-bold text-xs uppercase">Dismiss</button>
                    <button type="submit" className="flex-[2] bg-[#5c4033] text-white py-4 rounded-xl font-bold text-xs shadow-lg uppercase">Apply Changes</button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};
