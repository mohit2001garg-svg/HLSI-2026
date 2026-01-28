
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { BlockStatus, Block, StaffMember } from '../types';
import ExcelJS from 'exceljs';

interface Props {
  onSuccess: () => void;
  activeStaff: StaffMember;
  blocks: Block[];
}

export const BlockArrival: React.FC<Props> = ({ onSuccess, activeStaff, blocks }) => {
  const isGuest = activeStaff === 'GUEST';
  const isAdmin = activeStaff === 'VAIBHAV';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const arrivalInputRefs = useRef<(HTMLElement | null)[]>([]);

  const [formData, setFormData] = useState({
    jobNo: '',
    company: '',
    material: '',
    minesMarka: '',
    length: '',
    width: '',
    height: '',
    weight: '',
    arrivalDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (!isGuest && !isAdmin) { setFormData(prev => ({ ...prev, company: activeStaff })); }
    setTimeout(() => arrivalInputRefs.current[0]?.focus(), 100);
  }, [activeStaff, isGuest, isAdmin]);

  // --- SMART IMPORT LOGIC ---
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
    return isNaN(num) ? 0 : num;
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isGuest) return;
    setIsSubmitting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      const headerRow = worksheet.getRow(1);
      const colMap: Record<string, number> = {};
      
      headerRow.eachCell((cell, colNumber) => {
        const txt = getCellValue(cell);
        const val = txt.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

        if (val.includes('job') || val === 'no') colMap['jobNo'] = colNumber;
        else if (val.includes('company') || val.includes('party')) colMap['company'] = colNumber;
        else if (val.includes('material')) colMap['material'] = colNumber;
        else if (val.includes('marka')) colMap['minesMarka'] = colNumber;
        else if (val.includes('weight') || val.includes('wt') || val.includes('ton')) colMap['weight'] = colNumber;
        else if (val === 'l' || val.includes('length')) colMap['length'] = colNumber;
        else if (val === 'w' || val.includes('width')) colMap['width'] = colNumber;
        else if (val === 'h' || val.includes('height')) colMap['height'] = colNumber;
      });

      if (!colMap['jobNo'] || !colMap['company']) throw new Error("Need Job No and Company columns.");

      const newBlocks: Block[] = [];
      const existingJobNos = new Set(blocks.map(b => b.jobNo.toUpperCase()));
      const seenInFile = new Set<string>();

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 1) return;
        const jobNo = getCellValue(row, colMap['jobNo']).toUpperCase();
        if (!jobNo || existingJobNos.has(jobNo) || seenInFile.has(jobNo)) return;

        newBlocks.push({
          id: crypto.randomUUID(),
          jobNo,
          company: getCellValue(row, colMap['company']).toUpperCase(),
          material: getCellValue(row, colMap['material']).toUpperCase() || 'UNKNOWN',
          minesMarka: getCellValue(row, colMap['minesMarka']).toUpperCase() || '',
          length: getNumericValue(row, colMap['length']),
          width: getNumericValue(row, colMap['width']),
          height: getNumericValue(row, colMap['height']),
          weight: getNumericValue(row, colMap['weight']),
          preCuttingProcess: 'None',
          arrivalDate: new Date().toISOString().split('T')[0],
          status: BlockStatus.GANTRY,
          isPriority: false, powerCuts: [], enteredBy: activeStaff
        });
        seenInFile.add(jobNo);
      });

      if (newBlocks.length > 0) {
        await db.addBlocks(newBlocks);
        onSuccess();
        alert(`Bulk Arrival Complete: Imported ${newBlocks.length} blocks.`);
      } else { 
        alert("No new records found."); 
      }
    } catch (err: any) {
      alert(`Import error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) return;
    setIsSubmitting(true);
    try {
      const isDuplicate = blocks.some(b => b.jobNo === formData.jobNo.toUpperCase());
      if (isDuplicate) { alert("Job Number already exists!"); setIsSubmitting(false); return; }

      const newBlock: Block = {
        id: crypto.randomUUID(),
        jobNo: formData.jobNo.toUpperCase(),
        company: formData.company.toUpperCase(),
        material: formData.material.toUpperCase(),
        minesMarka: formData.minesMarka.toUpperCase(),
        length: Number(formData.length),
        width: Number(formData.width),
        height: Number(formData.height),
        weight: Number(formData.weight),
        arrivalDate: formData.arrivalDate,
        status: BlockStatus.GANTRY,
        isPriority: false,
        preCuttingProcess: 'None',
        powerCuts: [],
        enteredBy: activeStaff
      };

      await db.addBlock(newBlock);
      setFormData({
        jobNo: '', company: isGuest || isAdmin ? '' : activeStaff, material: '', minesMarka: '',
        length: '', width: '', height: '', weight: '', arrivalDate: new Date().toISOString().split('T')[0]
      });
      onSuccess();
      alert("Block Arrived Successfully");
      arrivalInputRefs.current[0]?.focus();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const commonInputStyle = "w-full bg-white border border-[#d6d3d1] text-[#292524] rounded-lg px-4 py-3 focus:outline-none focus:border-[#5c4033] font-medium text-sm transition-all placeholder:text-[#d6d3d1]";
  const labelStyle = "block text-[10px] font-bold text-[#a8a29e] mb-1.5 ml-1 uppercase tracking-wider";

  // Filter blocks for Recent Log: Show only GANTRY status (Factory Arrived), exclude Purchased/Transit
  const recentArrivals = blocks
    .filter(b => b.status === BlockStatus.GANTRY)
    .slice(0, 8);

  return (
    <div className="flex flex-col lg:flex-row gap-8 pb-32">
      <div className="flex-1 bg-white border-2 border-[#5c4033] rounded-2xl p-6 lg:p-8 shadow-2xl relative overflow-hidden">
        <div className="flex justify-between items-center mb-8 border-b border-stone-100 pb-4">
          <h2 className="text-2xl font-black text-[#5c4033] uppercase italic">New Arrival</h2>
          {!isGuest && (
            <div className="flex gap-2">
               <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" onChange={handleImportExcel} />
               <button onClick={() => fileInputRef.current?.click()} className="bg-[#faf9f6] hover:bg-[#f5f5f4] text-[#57534e] px-4 py-2 rounded-lg text-xs font-bold border border-[#d6d3d1] transition-all flex items-center gap-2">
                 <i className="fas fa-file-import text-blue-500"></i> Import Excel
               </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelStyle}>Job Number</label>
              <input ref={el => { arrivalInputRefs.current[0] = el; }} required className={commonInputStyle} placeholder="JOB-001" value={formData.jobNo} onChange={e => setFormData({...formData, jobNo: e.target.value})} disabled={isSubmitting || isGuest} />
            </div>
            <div>
              <label className={labelStyle}>Company / Party</label>
              <input required className={commonInputStyle} placeholder="COMPANY NAME" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} disabled={isSubmitting || isGuest || (!isAdmin && !isGuest)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelStyle}>Material Name</label>
              <input required className={commonInputStyle} placeholder="MARBLE TYPE" value={formData.material} onChange={e => setFormData({...formData, material: e.target.value})} disabled={isSubmitting || isGuest} />
            </div>
            <div>
              <label className={labelStyle}>Mines Marka</label>
              <input className={commonInputStyle} placeholder="OPTIONAL" value={formData.minesMarka} onChange={e => setFormData({...formData, minesMarka: e.target.value})} disabled={isSubmitting || isGuest} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 bg-[#faf9f6] p-4 rounded-xl border border-[#d6d3d1]">
            <div><label className={labelStyle}>Length (In)</label><input type="number" step="0.01" required className={commonInputStyle} placeholder="0.00" value={formData.length} onChange={e => setFormData({...formData, length: e.target.value})} disabled={isSubmitting || isGuest} /></div>
            <div><label className={labelStyle}>Height (In)</label><input type="number" step="0.01" required className={commonInputStyle} placeholder="0.00" value={formData.height} onChange={e => setFormData({...formData, height: e.target.value})} disabled={isSubmitting || isGuest} /></div>
            <div><label className={labelStyle}>Width (In)</label><input type="number" step="0.01" required className={commonInputStyle} placeholder="0.00" value={formData.width} onChange={e => setFormData({...formData, width: e.target.value})} disabled={isSubmitting || isGuest} /></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelStyle}>Weight (Tons)</label>
              <input type="number" step="0.01" required className={commonInputStyle} placeholder="0.00" value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} disabled={isSubmitting || isGuest} />
            </div>
            <div>
              <label className={labelStyle}>Arrival Date</label>
              <input type="date" required className={commonInputStyle} value={formData.arrivalDate} onChange={e => setFormData({...formData, arrivalDate: e.target.value})} disabled={isSubmitting || isGuest} />
            </div>
          </div>

          <button type="submit" disabled={isSubmitting || isGuest} className="w-full bg-[#5c4033] hover:bg-[#4a3b32] disabled:bg-[#d6d3d1] text-white font-black uppercase tracking-widest py-5 rounded-xl shadow-lg transform active:scale-[0.98] transition-all mt-4">
            {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : 'Register Block'}
          </button>
        </form>
      </div>

      <div className="lg:w-80 space-y-4">
        <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-xl">
          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Today's Arrivals</div>
          <div className="text-3xl font-black text-emerald-900">{blocks.filter(b => b.status === BlockStatus.GANTRY && b.arrivalDate === new Date().toISOString().split('T')[0]).length}</div>
        </div>
        
        <div className="bg-white border border-[#d6d3d1] rounded-xl overflow-hidden shadow-sm flex-1">
          <div className="bg-[#f5f5f4] px-4 py-3 border-b border-[#d6d3d1]">
            <h3 className="text-xs font-bold text-[#78716c] uppercase">Recent Log (Factory)</h3>
          </div>
          <div className="divide-y divide-stone-100 max-h-[500px] overflow-y-auto">
            {recentArrivals.map(b => (
              <div key={b.id} className="px-4 py-3 hover:bg-[#faf9f6]">
                <div className="flex justify-between">
                  <span className="font-bold text-xs text-[#292524]">{b.jobNo}</span>
                  <span className="text-[10px] text-[#a8a29e]">{b.arrivalDate}</span>
                </div>
                <div className="text-[10px] text-[#78716c] mt-0.5">{b.company} &bull; {b.weight}T</div>
              </div>
            ))}
            {recentArrivals.length === 0 && (
                <div className="p-4 text-center text-[10px] text-stone-400 italic">No factory arrivals yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
