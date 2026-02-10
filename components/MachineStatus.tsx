
import React, { useState, useEffect } from 'react';
import { db, checkPermission } from '../services/db';
import { Block, BlockStatus, MachineId, PowerCut, StaffMember } from '../types';
import ExcelJS from 'exceljs';

interface Props {
  blocks: Block[];
  onRefresh: () => void;
  isGuest?: boolean;
  activeStaff: StaffMember;
}

const MachineCard: React.FC<{
  title: string;
  machineId: MachineId;
  currentBlock: Block | undefined;
  availableBlocks: Block[];
  onRefresh: () => void;
  isGuest?: boolean;
  activeStaff: StaffMember;
}> = ({ title, machineId, currentBlock, availableBlocks, onRefresh, isGuest, activeStaff }) => {
  const [showPowerCutForm, setShowPowerCutForm] = useState(false);
  const [showFinishForm, setShowFinishForm] = useState(false);
  const [pcStart, setPcStart] = useState('');
  const [pcEnd, setPcEnd] = useState('');
  const [elapsed, setElapsed] = useState<string>('00:00:00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [selectedThickness, setSelectedThickness] = useState('18mm');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');

  const canEditCurrent = currentBlock ? checkPermission(activeStaff, currentBlock.company) : false;

  useEffect(() => {
    if (!selectedBlockId) setSearchQuery('');
  }, [selectedBlockId]);

  useEffect(() => {
    if (showFinishForm) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setManualEndTime(now.toISOString().slice(0, 16));
    }
  }, [showFinishForm]);

  useEffect(() => {
    let interval: number;
    if (currentBlock?.startTime && !currentBlock.endTime) {
      interval = window.setInterval(() => {
        const start = new Date(currentBlock.startTime!).getTime();
        const now = new Date().getTime();
        const totalDowntimeMs = (currentBlock.powerCuts || []).reduce((acc, pc) => {
          const s = new Date(pc.start).getTime();
          const e = new Date(pc.end).getTime();
          return acc + (e - s);
        }, 0);

        const diff = now - start - totalDowntimeMs;
        if (diff < 0) {
           setElapsed('00:00:00');
           return;
        }
        
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        setElapsed(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }, 1000);
    } else {
      setElapsed('00:00:00');
    }
    return () => clearInterval(interval);
  }, [currentBlock]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    const jobNoMatch = val.match(/^\[NEXT\]\s*#(\S+)|^#(\S+)/);
    const jobNo = jobNoMatch ? (jobNoMatch[1] || jobNoMatch[2]) : val.split(' | ')[0]?.replace('#', '');
    const match = availableBlocks.find(b => 
      `${b.isToBeCut ? '[NEXT] ' : ''}#${b.jobNo} | ${b.company} | ${b.material}` === val ||
      b.jobNo === jobNo
    );
    if (match) setSelectedBlockId(match.id);
    else setSelectedBlockId('');
  };

  const handleStartMachine = async () => {
    if (isGuest) return;
    if (!selectedBlockId) {
      alert("Please select a valid block from the list.");
      return;
    }
    const block = availableBlocks.find(b => b.id === selectedBlockId);
    if (!block) return;
    if (!checkPermission(activeStaff, block.company)) {
      alert("Permission denied.");
      return;
    }
    setIsSubmitting(true);
    try {
      const startTime = manualStartTime ? new Date(manualStartTime).toISOString() : new Date().toISOString();
      await db.updateBlock(selectedBlockId, { 
        status: BlockStatus.CUTTING,
        assignedMachineId: machineId,
        startTime: startTime,
        powerCuts: [],
        thickness: selectedThickness
      });
      setSelectedBlockId('');
      setSearchQuery('');
      setManualStartTime('');
      onRefresh();
    } catch (err: any) {
      alert(`Failed to start machine: ${err.message || 'Check connection'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndoMachine = async () => {
    if (isGuest || !currentBlock || !canEditCurrent) return;
    if (!window.confirm("Remove this block from the machine? It will be returned to the Gantry stock.")) return;
    setIsSubmitting(true);
    try {
      // Explicitly clear machine assignment fields using null
      await db.updateBlock(currentBlock.id, { 
        status: BlockStatus.GANTRY,
        assignedMachineId: null as any,
        startTime: null as any,
        thickness: null as any,
        powerCuts: []
      });
      onRefresh();
    } catch (err: any) {
      alert(`Failed to remove block: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddPowerCut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || !currentBlock || !pcStart || !pcEnd || !canEditCurrent) return;
    setIsSubmitting(true);
    try {
      const start = new Date(pcStart);
      const end = new Date(pcEnd);
      const duration = Math.round((end.getTime() - start.getTime()) / 60000);
      const newPC: PowerCut = {
        id: crypto.randomUUID(),
        start: pcStart,
        end: pcEnd,
        durationMinutes: duration
      };
      const updatedCuts = [...(currentBlock.powerCuts || []), newPC];
      await db.updateBlock(currentBlock.id, { powerCuts: updatedCuts });
      setShowPowerCutForm(false);
      setPcStart('');
      setPcEnd('');
      onRefresh();
    } catch (err) {
      alert("Failed to add power cut record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalizeFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || !currentBlock || !currentBlock.startTime || !canEditCurrent) return;
    setIsSubmitting(true);
    try {
      const endTimestamp = manualEndTime ? new Date(manualEndTime) : new Date();
      const startTimestamp = new Date(currentBlock.startTime);
      const totalDowntimeMs = (currentBlock.powerCuts || []).reduce((acc, pc) => {
        return acc + (new Date(pc.end).getTime() - new Date(pc.start).getTime());
      }, 0);
      const netDurationMinutes = Math.round((endTimestamp.getTime() - startTimestamp.getTime() - totalDowntimeMs) / 60000);

      await db.updateBlock(currentBlock.id, { 
        status: BlockStatus.PROCESSING,
        assignedMachineId: null as any,
        cutByMachine: title,
        endTime: endTimestamp.toISOString(),
        totalCuttingTimeMinutes: netDurationMinutes,
        processingStage: 'Field', 
        processingStartedAt: endTimestamp.toISOString()
      });
      setShowFinishForm(false);
      setManualEndTime('');
      onRefresh();
    } catch (err) {
      alert("Failed to finish block.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`flex flex-col min-h-[500px] rounded-xl border-2 transition-all shadow-sm bg-white ${
      currentBlock ? 'border-amber-200' : 'border-[#d6d3d1]'
    }`}>
      <div className={`px-4 lg:px-6 py-4 flex justify-between items-center border-b rounded-t-lg ${
        currentBlock ? 'bg-amber-50 border-amber-100' : 'bg-[#f5f5f4] border-[#d6d3d1]'
      }`}>
        <h3 className="text-lg font-bold flex items-center text-[#292524]">
          <i className={`fas fa-microchip mr-2 lg:mr-3 ${currentBlock ? 'text-amber-600' : 'text-[#a8a29e]'}`}></i> {title}
        </h3>
        {currentBlock && (
          <div className="flex items-center space-x-4">
            <span className="text-[#78716c] text-[10px] font-medium border border-[#d6d3d1] px-2 py-0.5 rounded">Op: {currentBlock.enteredBy}</span>
            <span className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="text-amber-600 text-[10px] font-medium">Active</span>
            </span>
          </div>
        )}
      </div>

      <div className="p-4 lg:p-6 flex-1 flex flex-col">
        {!currentBlock ? (
          <div className="flex-1 flex flex-col justify-between py-4 space-y-8">
            <div className="space-y-6">
              <label className="block text-xs font-bold text-[#78716c] uppercase tracking-wider">Initialize Machine</label>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-[#a8a29e] mb-1.5 ml-1 uppercase">Select block</label>
                  <input 
                    list={`blocks-${machineId}`} 
                    className="w-full bg-white border border-[#d6d3d1] text-[#292524] rounded-lg px-4 py-3 focus:outline-none focus:border-[#5c4033] font-medium text-sm transition-all placeholder:text-[#d6d3d1] disabled:bg-[#f5f5f4]"
                    placeholder="Type to search..."
                    value={searchQuery}
                    onChange={handleSearchChange}
                    disabled={isGuest || isSubmitting}
                  />
                  <datalist id={`blocks-${machineId}`}>
                    {availableBlocks.map(b => (
                      <option key={b.id} value={`${b.isToBeCut ? '[NEXT] ' : ''}#${b.jobNo} | ${b.company} | ${b.material}`} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#a8a29e] mb-1.5 ml-1 uppercase">Cutting thickness</label>
                  <div className="relative">
                    <select
                      disabled={isGuest || isSubmitting}
                      value={selectedThickness}
                      onChange={(e) => setSelectedThickness(e.target.value)}
                      className="w-full bg-white border border-[#d6d3d1] text-[#292524] rounded-lg px-4 py-3 focus:outline-none focus:border-[#5c4033] font-medium text-sm appearance-none"
                    >
                      <option value="16mm">16mm</option>
                      <option value="18mm">18mm</option>
                      <option value="20mm">20mm</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-[#a8a29e]">
                      <i className="fas fa-chevron-down text-xs"></i>
                    </div>
                  </div>
                </div>

                <div>
                   <label className="block text-[10px] font-bold text-[#a8a29e] mb-1.5 ml-1 uppercase">Start Time (Optional)</label>
                   <input 
                      type="datetime-local" 
                      className="w-full bg-white border border-[#d6d3d1] text-[#292524] rounded-lg px-4 py-3 focus:outline-none focus:border-[#5c4033] font-medium text-sm placeholder:text-[#d6d3d1]"
                      value={manualStartTime}
                      onChange={(e) => setManualStartTime(e.target.value)}
                      disabled={isGuest || isSubmitting}
                   />
                </div>
              </div>
            </div>

            {!isGuest && (
              <button
                onClick={handleStartMachine}
                disabled={isSubmitting}
                className="w-full bg-[#5c4033] hover:bg-[#4a3b32] disabled:bg-[#d6d3d1] disabled:text-[#f5f5f4] text-white font-bold py-4 rounded-lg text-sm transition-all active:scale-[0.98] shadow-md flex justify-center items-center gap-2 mt-4"
              >
                {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : <><i className="fas fa-play mr-1"></i> Start Cutting</>}
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 space-y-5 flex flex-col">
            <div className="bg-[#faf9f6] p-6 rounded-xl border border-[#d6d3d1]">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] rounded font-bold">
                    #{currentBlock.jobNo}
                  </span>
                  <span className="px-2 py-0.5 bg-white text-[#78716c] text-[10px] rounded border border-[#d6d3d1] font-bold">
                    {currentBlock.thickness || 'N/A'}
                  </span>
                </div>
                <div className="text-xl font-bold text-[#292524] leading-tight truncate mb-1">
                  {currentBlock.company}
                </div>
                <div className="flex gap-3 text-xs text-[#78716c] font-medium">
                  <span>{currentBlock.material}</span>
                  <span className="text-[#a8a29e]">&bull;</span>
                  <span>{currentBlock.weight?.toFixed(2)} T</span>
                </div>
              </div>

              <div className="bg-white border border-[#d6d3d1] rounded-lg p-4 text-center mb-5 shadow-sm">
                <div className="text-[10px] text-[#a8a29e] font-bold uppercase mb-1">Running Time</div>
                <div className="text-4xl font-mono font-medium text-[#292524] tabular-nums leading-none">
                  {elapsed}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="text-center">
                  <div className="text-[10px] text-[#a8a29e] font-bold uppercase mb-1">Started</div>
                  <div className="text-xs font-mono text-[#57534e] font-medium">
                    {new Date(currentBlock.startTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="text-center border-l border-[#d6d3d1]">
                  <div className="text-[10px] text-[#a8a29e] font-bold uppercase mb-1">Downtime</div>
                  <div className="text-xs font-mono text-amber-600 font-medium">
                    {(currentBlock.powerCuts || []).reduce((acc, pc) => acc + pc.durationMinutes, 0) || 0} min
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar min-h-[120px]">
               {showPowerCutForm ? (
                 <form onSubmit={handleAddPowerCut} className="bg-white p-4 rounded-lg border border-amber-200 space-y-3 animate-in fade-in zoom-in-95">
                    <div className="flex justify-between items-center border-b border-amber-100 pb-2">
                      <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Add Downtime</span>
                      <button type="button" onClick={() => setShowPowerCutForm(false)} className="text-[#a8a29e] hover:text-[#57534e]"><i className="fas fa-times"></i></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-[#78716c] mb-1 uppercase">Start</label>
                        <input type="datetime-local" required className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded p-2 text-[10px]" value={pcStart} onChange={e => setPcStart(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-[#78716c] mb-1 uppercase">End</label>
                        <input type="datetime-local" required className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded p-2 text-[10px]" value={pcEnd} onChange={e => setPcEnd(e.target.value)} />
                      </div>
                    </div>
                    <button type="submit" disabled={isSubmitting} className="w-full bg-amber-600 text-white text-[10px] font-bold py-2 rounded">
                      {isSubmitting ? 'Saving...' : 'Confirm Downtime'}
                    </button>
                 </form>
               ) : (
                  <>
                     {(currentBlock.powerCuts || []).map((pc) => (
                        <div key={pc.id} className="flex justify-between items-center bg-amber-50 px-4 py-3 rounded-lg border border-amber-100">
                           <span className="text-[10px] font-medium text-amber-700">Power Cut / Maint</span>
                           <span className="text-[10px] font-bold text-[#57534e]">-{pc.durationMinutes}m</span>
                        </div>
                     ))}
                     {!currentBlock.powerCuts?.length && <div className="text-center py-6 text-[10px] text-[#d6d3d1] italic">No interruptions recorded</div>}
                  </>
               )}
            </div>

            <div className="pt-4 border-t border-[#d6d3d1] flex flex-col gap-2">
               {showFinishForm ? (
                  <div className="bg-white p-4 rounded-lg border border-[#d6d3d1] shadow-lg animate-in slide-in-from-bottom-5">
                      <form onSubmit={handleFinalizeFinish}>
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-sm font-bold text-[#292524] uppercase tracking-wide">Finish Block</span>
                          <button type="button" onClick={() => setShowFinishForm(false)} className="text-[#a8a29e]"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="mb-4">
                            <label className="block text-[10px] font-bold text-[#78716c] mb-1.5 uppercase">Completion Time</label>
                            <input 
                              type="datetime-local" 
                              required 
                              className="w-full border border-[#d6d3d1] rounded-lg p-3 text-sm focus:border-[#5c4033] outline-none" 
                              value={manualEndTime} 
                              onChange={e => setManualEndTime(e.target.value)} 
                            />
                        </div>
                        <button type="submit" disabled={isSubmitting} className="w-full bg-[#5c4033] text-white font-bold py-4 rounded-lg text-xs transition-all active:scale-[0.98]">
                          {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : 'Confirm & Move to Processing'}
                        </button>
                      </form>
                  </div>
               ) : (
                  <div className="flex gap-2">
                     {!isGuest && (
                        <button 
                           onClick={handleUndoMachine}
                           disabled={!canEditCurrent || isSubmitting}
                           className={`w-12 bg-white border border-red-200 text-red-400 py-3.5 rounded-lg font-bold text-xs hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center ${!canEditCurrent ? 'opacity-30 cursor-not-allowed' : ''}`}
                           title="Restore / Remove Block from Machine"
                        >
                           {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-undo"></i>}
                        </button>
                     )}
                     {!isGuest && (
                        <button 
                           onClick={() => setShowPowerCutForm(true)}
                           disabled={!canEditCurrent}
                           className={`flex-1 bg-white border border-[#d6d3d1] text-[#78716c] py-3.5 rounded-lg font-bold text-xs hover:bg-[#faf9f6] ${!canEditCurrent ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                           Downtime
                        </button>
                     )}
                     {!isGuest && (
                        <button 
                           onClick={() => setShowFinishForm(true)}
                           disabled={!canEditCurrent}
                           className={`flex-[2] bg-[#5c4033] text-white py-3.5 rounded-lg font-bold text-xs hover:bg-[#4a3b32] shadow-sm ${!canEditCurrent ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                           Finish Job
                        </button>
                     )}
                     {isGuest && (
                        <div className="w-full text-center py-3 bg-[#f5f5f4] rounded-lg border border-[#d6d3d1] text-[10px] text-[#a8a29e]">
                           View Only Mode
                        </div>
                     )}
                  </div>
               )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MachineStatus: React.FC<Props> = ({ blocks, onRefresh, isGuest, activeStaff }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');

  const getBlock = (id: MachineId) => blocks.find(b => b.status === BlockStatus.CUTTING && b.assignedMachineId === id);
  const queue = blocks.filter(b => b.status === BlockStatus.GANTRY);

  const handleExportExcel = async () => {
    if (!exportStart || !exportEnd) {
      alert("Please select a valid date range.");
      return;
    }
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const s = new Date(exportStart);
      const e = new Date(exportEnd);
      e.setHours(23, 59, 59, 999);

      // Sort blocks by finish date (descending, 1-31)
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
          return dA - dB; // Ascending (1 to 31)
        });

      const columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Job No', key: 'jobNo', width: 15 },
        { header: 'Company', key: 'company', width: 25 },
        { header: 'Material', key: 'material', width: 20 },
        { header: 'Marka', key: 'marka', width: 15 },
        { header: 'Thickness', key: 'thickness', width: 12 },
        { header: 'Weight (T)', key: 'weight', width: 12 },
        { header: 'Dimensions', key: 'dim', width: 15 },
        { header: 'Process', key: 'process', width: 20 }
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
          : `${Math.round(b.length || 0)} x ${Math.round(b.height || 0)} x ${Math.round(b.width || 0)}`,
        process: b.cutByMachine || (b.resinEndTime ? 'Resin Plant' : '-')
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

      // Only include specific machine tabs + Master for summary
      setupSheet('Master', filteredBlocks.map(mapBlock));
      setupSheet('Machine 1', filteredBlocks.filter(b => b.cutByMachine === 'Machine 1').map(mapBlock));
      setupSheet('Machine 2', filteredBlocks.filter(b => b.cutByMachine === 'Machine 2').map(mapBlock));
      setupSheet('Thin Wire', filteredBlocks.filter(b => b.cutByMachine === 'Thin Wire Machine').map(mapBlock));

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Detailed_Production_Report_${exportStart}_to_${exportEnd}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (err) {
      alert("Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-[#292524]">
            <i className="fas fa-microchip text-[#a8a29e] mr-3"></i> Production Floor
          </h2>
          <p className="text-[#78716c] text-xs mt-1 font-medium">Live machine telemetry</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowExportModal(true)}
            className="bg-white border border-[#d6d3d1] hover:bg-stone-50 text-[#57534e] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition-all"
          >
            <i className="fas fa-file-excel text-green-600"></i> Detailed Export
          </button>
          
          <div className="bg-white border border-[#d6d3d1] px-6 py-3 rounded-lg flex items-center space-x-4 shadow-sm">
            <div className="text-[#a8a29e]">
              <i className="fas fa-bolt text-lg"></i>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-medium text-[#78716c] leading-none">Active</div>
              <div className="text-xl font-semibold text-[#292524]">
                {blocks.filter(b => b.status === BlockStatus.CUTTING).length} / 3
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        <MachineCard
          title="Machine 1"
          machineId={MachineId.MACHINE_1}
          currentBlock={getBlock(MachineId.MACHINE_1)}
          availableBlocks={queue}
          onRefresh={onRefresh}
          isGuest={isGuest}
          activeStaff={activeStaff}
        />
        <MachineCard
          title="Machine 2"
          machineId={MachineId.MACHINE_2}
          currentBlock={getBlock(MachineId.MACHINE_2)}
          availableBlocks={queue}
          onRefresh={onRefresh}
          isGuest={isGuest}
          activeStaff={activeStaff}
        />
        <MachineCard
          title="Thin Wire Machine"
          machineId={MachineId.THIN_WIRE}
          currentBlock={getBlock(MachineId.THIN_WIRE)}
          availableBlocks={queue}
          onRefresh={onRefresh}
          isGuest={isGuest}
          activeStaff={activeStaff}
        />
      </div>

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
