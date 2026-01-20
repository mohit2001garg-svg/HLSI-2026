
import React, { useState, useMemo, useRef } from 'react';
import { db, checkPermission } from '../services/db';
import { Block, BlockStatus, StockyardLocation, StaffMember } from '../types';
import ExcelJS from 'exceljs';

interface Props {
  blocks: Block[];
  onRefresh: () => void;
  isGuest?: boolean;
  activeStaff: StaffMember;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = [2024, 2025, 2026];

export const ReadyStock: React.FC<Props> = ({ blocks, onRefresh, isGuest, activeStaff }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readyBlocks = useMemo(() => {
    return blocks
      .filter(b => b.status === BlockStatus.COMPLETED)
      .filter(b => selectedCompany === 'ALL' ? true : b.company === selectedCompany)
      .filter(b => {
        const dateStr = b.endTime || b.resinEndTime || b.arrivalDate;
        if (!dateStr) return true;
        const date = new Date(dateStr);
        const monthMatch = selectedMonth === 'ALL' ? true : date.getMonth() === parseInt(selectedMonth);
        const yearMatch = selectedYear === 'ALL' ? true : date.getFullYear() === parseInt(selectedYear);
        return monthMatch && yearMatch;
      })
      .filter(b => b.company.toLowerCase().includes(searchTerm.toLowerCase()) || b.material.toLowerCase().includes(searchTerm.toLowerCase()) || b.jobNo.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => new Date(b.endTime || b.resinEndTime || 0).getTime() - new Date(a.endTime || a.resinEndTime || 0).getTime());
  }, [blocks, searchTerm, selectedCompany, selectedMonth, selectedYear]);

  const uniqueCompanies = useMemo(() => Array.from(new Set(blocks.filter(b => b.status === BlockStatus.COMPLETED).map(b => b.company))).sort(), [blocks]);

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
    setIsImporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      const headerRow = worksheet.getRow(1);
      const colMap: Record<string, number> = {};
      headerRow.eachCell((cell, colNumber) => {
        const val = cell.value?.toString().toLowerCase().trim() || '';
        if (val.includes('job') || val === 'no') colMap['jobNo'] = colNumber;
        else if (val.includes('company') || val.includes('party')) colMap['company'] = colNumber;
        else if (val.includes('material')) colMap['material'] = colNumber;
        else if (val.includes('marka')) colMap['minesMarka'] = colNumber;
        else if (val.includes('weight')) colMap['weight'] = colNumber;
        else if (val.includes('slabl')) colMap['slabLength'] = colNumber;
        else if (val.includes('slabw')) colMap['slabWidth'] = colNumber;
        else if (val.includes('pcs') || val.includes('count')) colMap['slabCount'] = colNumber;
        else if (val.includes('sqft') || val.includes('sq ft') || val.includes('area')) colMap['totalSqFt'] = colNumber;
      });

      if (!colMap['jobNo']) throw new Error("Header mapping failed. Job No is required.");

      const newBlocks: Block[] = [];
      const existingJobNos = new Set<string>(blocks.map(b => b.jobNo.toUpperCase()));
      const seenInFile = new Set<string>();

      worksheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber <= 1) return;
        const jobNo = getCellValue(row, colMap['jobNo']).toUpperCase();
        if (!jobNo || existingJobNos.has(jobNo) || seenInFile.has(jobNo)) return;

        newBlocks.push({
          id: crypto.randomUUID(), jobNo,
          company: getCellValue(row, colMap['company']).toUpperCase(),
          material: getCellValue(row, colMap['material']).toUpperCase() || 'UNKNOWN',
          minesMarka: getCellValue(row, colMap['minesMarka']).toUpperCase() || '',
          length: 0, width: 0, height: 0,
          weight: getNumericValue(row, colMap['weight']),
          status: BlockStatus.COMPLETED, arrivalDate: new Date().toISOString().split('T')[0],
          slabLength: getNumericValue(row, colMap['slabLength']),
          slabWidth: getNumericValue(row, colMap['slabWidth']),
          slabCount: getNumericValue(row, colMap['slabCount']),
          totalSqFt: getNumericValue(row, colMap['totalSqFt']),
          isPriority: false, preCuttingProcess: 'None', enteredBy: activeStaff, powerCuts: []
        });
        seenInFile.add(jobNo);
      });

      if (newBlocks.length > 0) { await db.addBlocks(newBlocks); onRefresh(); alert(`Imported ${newBlocks.length} records.`); }
      else { alert("No new records found."); }
    } catch (err: any) { alert(`Import error: ${err.message}`); } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      
      const commonCols = [
        { header: 'Job No', key: 'jobNo', width: 12 },
        { header: 'Company', key: 'company', width: 20 },
        { header: 'Material', key: 'material', width: 20 },
        { header: 'Marka', key: 'marka', width: 15 },
        { header: 'Weight (T)', key: 'weight', width: 12 },
        { header: 'Dimensions', key: 'dims', width: 15 },
        { header: 'Slabs', key: 'slabs', width: 10 },
        { header: 'Total SqFt', key: 'sqft', width: 15 }
      ];

      const addSheetData = (sheetName: string, data: Block[], specificCols: any[]) => {
        const sheet = workbook.addWorksheet(sheetName);
        const finalCols = [...commonCols, ...specificCols];
        sheet.columns = finalCols;
        
        // Header styling
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5C4033' } };
        headerRow.alignment = { horizontal: 'center' };

        data.forEach(b => {
          const rowValues: any = {
            jobNo: b.jobNo,
            company: b.company,
            material: b.material,
            marka: b.minesMarka || '-',
            weight: b.weight?.toFixed(2),
            dims: `${Math.round(b.slabLength || 0)}x${Math.round(b.slabWidth || 0)}`,
            slabs: b.slabCount,
            sqft: b.totalSqFt?.toFixed(2)
          };
          
          // Add specific data
          if (sheetName === 'Master Sheet') {
            rowValues.machine = b.cutByMachine || '-';
            rowValues.preprocess = b.preCuttingProcess || 'None';
            rowValues.resinType = b.resinTreatmentType || '-';
          } else if (sheetName === 'VACCUM') {
            rowValues.preprocess = b.preCuttingProcess || 'None';
          } else if (sheetName === 'RESIN') {
            rowValues.resinType = b.resinTreatmentType || '-';
          } else if (sheetName === 'MACHINES') {
            rowValues.machine = b.cutByMachine || '-';
          }

          sheet.addRow(rowValues);
        });

        // Add border to all cells
        sheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        });
      };

      // 1. MASTER SHEET
      addSheetData('Master Sheet', readyBlocks, [
        { header: 'Machine', key: 'machine', width: 15 },
        { header: 'Pre-Process', key: 'preprocess', width: 15 },
        { header: 'Resin Type', key: 'resinType', width: 15 }
      ]);

      // 2. VACCUM
      const vaccumBlocks = readyBlocks.filter(b => b.preCuttingProcess === 'VACCUM');
      addSheetData('VACCUM', vaccumBlocks, [
        { header: 'Pre-Process', key: 'preprocess', width: 15 }
      ]);

      // 3. RESIN
      const resinBlocks = readyBlocks.filter(b => b.isSentToResin || b.resinStartTime);
      addSheetData('RESIN', resinBlocks, [
        { header: 'Resin Type', key: 'resinType', width: 15 }
      ]);

      // 4. MACHINES
      addSheetData('MACHINES', readyBlocks, [
        { header: 'Machine', key: 'machine', width: 15 }
      ]);

      // Write and Download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Ready_Stock_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);

    } catch (err: any) {
      alert("Export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleTransfer = (id: string, location: StockyardLocation, company: string) => {
    if (isGuest || !checkPermission(activeStaff, company)) return;
    db.updateBlock(id, { 
      status: BlockStatus.IN_STOCKYARD, 
      stockyardLocation: location, 
      transferredToYardAt: new Date().toISOString() 
    });
    setTransferringId(null); 
    onRefresh();
  };

  const locations: StockyardLocation[] = ['Showroom', 'Service Lane', 'Field', 'RP Yard'];

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <h2 className="text-2xl font-semibold text-[#292524]"><i className="fas fa-clipboard-check text-[#a8a29e] mr-3"></i> Ready Stock</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative w-64"><input type="text" placeholder="Search..." className="w-full bg-white border border-[#d6d3d1] rounded-lg px-4 py-3 text-xs pl-10 focus:border-[#5c4033] outline-none shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /><i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e] text-[10px]"></i></div>
          
          <button 
             onClick={handleExportExcel}
             disabled={isExporting || readyBlocks.length === 0}
             className="bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all"
          >
            {isExporting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-excel text-green-600"></i>}
            <span>Export Report</span>
          </button>

          {!isGuest && (
             <>
               <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx" onChange={handleImportExcel} />
               <button 
                  onClick={() => fileInputRef.current?.click()} 
                  disabled={isImporting}
                  className="bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-4 py-3 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all"
               >
                 {isImporting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-import text-blue-600"></i>}
                 <span>Import</span>
               </button>
             </>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#d6d3d1] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f5f5f4] text-[#78716c] font-bold uppercase">
              <tr><th className="px-8 py-5">Job / Company</th><th className="px-8 py-5">Output</th><th className="px-8 py-5 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {readyBlocks.map(block => (
                <tr key={block.id} className="hover:bg-[#faf9f6] transition-colors">
                  <td className="px-8 py-5"><div className="font-bold text-lg">#{block.jobNo} | {block.company}</div><div className="text-[10px] text-[#78716c]">{block.material}</div></td>
                  <td className="px-8 py-5"><div className="font-bold text-[#5c4033]">{block.totalSqFt?.toFixed(2)} ft</div><div className="text-[10px]">{block.slabCount} slabs</div></td>
                  <td className="px-8 py-5 text-right">
                    {!isGuest && (
                      <div className="flex flex-col items-end gap-2">
                        {transferringId === block.id ? (
                           <div className="flex flex-wrap justify-end gap-1 animate-in slide-in-from-right-2">
                             {locations.map(loc => (
                               <button key={loc} onClick={() => handleTransfer(block.id, loc, block.company)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-[10px] font-bold shadow-sm">{loc}</button>
                             ))}
                             <button onClick={() => setTransferringId(null)} className="bg-stone-200 text-stone-600 px-3 py-1.5 rounded text-[10px] font-bold">Cancel</button>
                           </div>
                        ) : (
                          <button onClick={() => setTransferringId(block.id)} className="bg-[#5c4033] text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-[#4a3b32] transition-colors">Transfer to Yard</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {readyBlocks.length === 0 && (
                <tr><td colSpan={3} className="px-8 py-12 text-center text-stone-400 italic">No ready stock available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
