
import React, { useState, useEffect } from 'react';
import { db, checkPermission } from '../services/db';
import { Block, BlockStatus, PowerCut, ResinTreatmentType, StaffMember } from '../types';

interface Props {
  blocks: Block[];
  onRefresh: () => void;
  isGuest?: boolean;
  activeStaff: StaffMember;
}

const ResinLineCard: React.FC<{
  title: string;
  activeBlocks: Block[];
  availableBlocks: Block[];
  onRefresh: () => void;
  isGuest?: boolean;
  activeStaff: StaffMember;
}> = ({ title, activeBlocks, availableBlocks, onRefresh, isGuest, activeStaff }) => {
  const [showPowerCutForm, setShowPowerCutForm] = useState(false);
  const [pcStart, setPcStart] = useState('');
  const [pcEnd, setPcEnd] = useState('');
  const [elapsed, setElapsed] = useState<string>('00:00:00');
  
  // Multi-select for loading
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [treatmentType, setTreatmentType] = useState<ResinTreatmentType>('Resin');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Finish Modal State
  const [finishModalOpen, setFinishModalOpen] = useState(false);

  // Manual Time States
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');

  const isLineOccupied = activeBlocks.length > 0;
  
  // Permission check based on first active block or generic if empty
  const canEditCurrent = activeBlocks.length > 0 
    ? checkPermission(activeStaff, activeBlocks[0].company) 
    : true; // If empty, anyone with general access can start

  useEffect(() => {
    let interval: number;
    // Use the first block to track time (assuming all loaded together)
    const refBlock = activeBlocks[0];
    
    if (refBlock?.resinStartTime && !refBlock.resinEndTime) {
      interval = window.setInterval(() => {
        const start = new Date(refBlock.resinStartTime!).getTime();
        const now = new Date().getTime();
        const totalDowntimeMs = (refBlock.resinPowerCuts || []).reduce((acc, pc) => {
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
  }, [activeBlocks]);

  // Reset manual end time when finish form opens
  useEffect(() => {
    if (finishModalOpen) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setManualEndTime(now.toISOString().slice(0, 16));
    }
  }, [finishModalOpen]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleLoadBlocks = async () => {
    if (isGuest) return;
    if (isLineOccupied) {
      alert("Resin line is currently occupied.");
      return;
    }
    if (selectedIds.size === 0) {
      alert("Please select at least one block.");
      return;
    }

    setIsSubmitting(true);
    try {
      const startTime = manualStartTime ? new Date(manualStartTime).toISOString() : new Date().toISOString();
      const idsArray: string[] = Array.from(selectedIds);
      
      // Update all selected blocks
      await Promise.all(idsArray.map(id => 
        db.updateBlock(id, { 
          status: BlockStatus.RESINING,
          resinStartTime: startTime,
          resinPowerCuts: [],
          resinTreatmentType: treatmentType
        })
      ));

      setSelectedIds(new Set());
      setManualStartTime('');
      onRefresh();
    } catch (err: any) {
      alert(`Operation Failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndoResin = async () => {
    if (isGuest || activeBlocks.length === 0) return;
    if (!window.confirm("Remove ALL blocks from the Resin Line? They will return to processing.")) return;
    setIsSubmitting(true);
    try {
      await Promise.all(activeBlocks.map(b => 
        db.updateBlock(b.id, { 
          status: BlockStatus.PROCESSING,
          resinStartTime: null as any,
          resinPowerCuts: [],
          resinTreatmentType: null as any
        })
      ));
      onRefresh();
    } catch (err: any) {
      alert(`Failed to remove blocks: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddPowerCut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || activeBlocks.length === 0 || !pcStart || !pcEnd) return;

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

      // Add power cut to ALL active blocks to keep them in sync
      await Promise.all(activeBlocks.map(b => {
         const updatedCuts = [...(b.resinPowerCuts || []), newPC];
         return db.updateBlock(b.id, { resinPowerCuts: updatedCuts });
      }));
      
      setShowPowerCutForm(false);
      setPcStart('');
      setPcEnd('');
      onRefresh();
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinishResin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || activeBlocks.length === 0) return;
    
    setIsSubmitting(true);
    try {
      const endTime = manualEndTime ? new Date(manualEndTime).toISOString() : new Date().toISOString();
      
      await Promise.all(activeBlocks.map(b => 
        db.updateBlock(b.id, { 
          status: BlockStatus.COMPLETED,
          resinEndTime: endTime,
          processingStage: 'Field'
        })
      ));

      onRefresh();
      setFinishModalOpen(false);
      setManualEndTime('');
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`flex flex-col rounded-2xl border-2 transition-all shadow-sm overflow-hidden relative bg-white border-[#d6d3d1]`}>
      
      {/* Finish Modal */}
      {finishModalOpen && (
        <div className="absolute inset-0 z-40 bg-[#292524]/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#d6d3d1] rounded-3xl w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95 duration-200 text-center">
             <i className="fas fa-check-circle text-cyan-600 text-5xl mb-6"></i>
             <h3 className="text-xl font-semibold text-[#292524] mb-2">Finalize Treatment</h3>
             <p className="text-[#78716c] text-xs font-medium mb-8">Confirm completion for {activeBlocks.length} blocks.</p>
             <form onSubmit={handleFinishResin} className="space-y-6">
               <div className="text-left">
                   <label className="block text-xs font-medium text-[#78716c] mb-2">End Time (Completion)</label>
                   <input 
                      type="datetime-local" 
                      required 
                      className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl px-4 py-4 text-[#292524] font-medium focus:border-[#5c4033] outline-none" 
                      value={manualEndTime} 
                      onChange={e => setManualEndTime(e.target.value)} 
                   />
               </div>

               <div className="flex gap-4 pt-2">
                 <button type="button" onClick={() => setFinishModalOpen(false)} className="flex-1 bg-white border border-[#d6d3d1] text-[#78716c] py-4 rounded-xl font-medium text-xs">Back</button>
                 <button type="submit" disabled={isSubmitting} className="flex-[2] bg-[#5c4033] text-white py-4 rounded-xl font-medium text-xs hover:bg-[#4a3b32] shadow-xl">{isSubmitting ? <i className="fas fa-spinner fa-spin"></i> : 'Confirm & Complete'}</button>
               </div>
             </form>
          </div>
        </div>
      )}

      <div className={`px-6 lg:px-10 py-4 lg:py-5 flex justify-between items-center border-b ${
        isLineOccupied ? 'bg-[#f5f5f4] border-[#d6d3d1]' : 'bg-[#faf9f6] border-[#d6d3d1]'
      }`}>
        <h3 className="text-lg lg:text-xl font-bold flex items-center text-[#292524]">
          <i className="fas fa-flask-vial mr-3 lg:mr-4 text-[#a8a29e]"></i> {title}
        </h3>
        {isLineOccupied && (
          <div className="flex items-center space-x-4">
            <span className="text-[#78716c] text-[10px] font-medium border border-[#d6d3d1] px-2 py-1 rounded">{activeBlocks.length} Blocks</span>
            <span className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
              <span className="text-cyan-600 text-[10px] font-medium">Live</span>
            </span>
          </div>
        )}
      </div>

      <div className="p-6 lg:p-10 flex flex-col relative">
        {!isLineOccupied ? (
          <div className="flex flex-col justify-center max-w-lg mx-auto w-full py-4 lg:py-8">
            <label className="block text-xs font-medium text-[#78716c] mb-4 text-center">Unit initialization</label>
            
            <div className="space-y-6 bg-[#faf9f6] p-6 lg:p-8 rounded-2xl border border-[#d6d3d1] shadow-sm mb-6">
              
              {/* Block Selector */}
              <div>
                <label className="block text-xs font-medium text-[#a8a29e] mb-2 ml-1">Select blocks for batch</label>
                <div className="bg-white border border-[#d6d3d1] rounded-xl max-h-48 overflow-y-auto custom-scrollbar p-2">
                  {availableBlocks.length === 0 ? (
                    <div className="text-center p-4 text-[10px] text-stone-400 italic">No blocks waiting</div>
                  ) : (
                    availableBlocks.map(b => (
                      <div key={b.id} 
                           onClick={() => !isGuest && toggleSelection(b.id)}
                           className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${selectedIds.has(b.id) ? 'bg-cyan-50 border border-cyan-100' : 'hover:bg-stone-50 border border-transparent'}`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedIds.has(b.id) ? 'bg-cyan-600 border-cyan-600' : 'border-stone-300'}`}>
                          {selectedIds.has(b.id) && <i className="fas fa-check text-white text-[8px]"></i>}
                        </div>
                        <div className="flex-1">
                          <div className="text-xs font-bold text-[#292524]">#{b.jobNo}</div>
                          <div className="text-[10px] text-[#78716c]">{b.company}</div>
                        </div>
                        <div className="text-[10px] font-bold text-[#57534e]">{b.material}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#a8a29e] mb-2 ml-1">Process type</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['Resin', 'GP', 'CC'] as ResinTreatmentType[]).map(type => (
                    <button
                      disabled={isGuest || isSubmitting}
                      key={type}
                      type="button"
                      onClick={() => setTreatmentType(type)}
                      className={`py-3 rounded-lg text-xs font-medium transition-all border disabled:cursor-not-allowed ${
                        treatmentType === type 
                          ? 'bg-cyan-50 border-cyan-200 text-cyan-700 shadow-sm' 
                          : 'bg-white border-[#d6d3d1] text-[#78716c] hover:bg-[#faf9f6]'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                 <label className="block text-xs font-medium text-[#a8a29e] mb-2 ml-1">Start Time (Optional)</label>
                 <input 
                    type="datetime-local" 
                    className="w-full bg-white border border-[#d6d3d1] text-[#292524] rounded-xl px-4 py-4 focus:outline-none focus:border-[#5c4033] font-medium text-sm placeholder:text-[#d6d3d1]"
                    value={manualStartTime}
                    onChange={(e) => setManualStartTime(e.target.value)}
                    disabled={isGuest || isSubmitting}
                 />
              </div>

              {!isGuest && (
                <button
                  onClick={handleLoadBlocks}
                  disabled={isSubmitting || selectedIds.size === 0}
                  className="w-full bg-[#5c4033] hover:bg-[#4a3b32] disabled:bg-[#d6d3d1] disabled:text-[#f5f5f4] text-white font-medium py-5 rounded-xl text-xs transition-all active:scale-95 shadow-md mt-2 flex justify-center items-center gap-2"
                >
                  {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : `Start Batch (${selectedIds.size})`}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 flex flex-col max-w-2xl mx-auto w-full">
            {/* Status Card */}
            <div className="bg-[#faf9f6] p-6 lg:p-10 rounded-2xl lg:rounded-3xl border border-[#d6d3d1] shadow-inner">
              <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-6">
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-[10px] text-cyan-600 font-bold uppercase tracking-wider leading-none">Active Batch</div>
                    <span className="px-3 py-1 bg-cyan-100 text-cyan-800 text-[10px] rounded-full font-bold leading-none border border-cyan-200">
                      {activeBlocks[0].resinTreatmentType}
                    </span>
                  </div>
                  <div className="text-3xl lg:text-5xl font-black text-[#292524] leading-none tracking-tighter mb-4">
                    {activeBlocks.length} Blocks
                  </div>
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                    {activeBlocks.map(b => (
                      <div key={b.id} className="bg-white border border-stone-200 rounded-xl p-3 shadow-sm grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                        <div className="font-black text-sm text-[#292524] truncate">#{b.jobNo}</div>
                        <div className="text-right font-black text-xs text-[#5c4033]">{b.weight?.toFixed(2)} T</div>
                        <div className="text-[10px] text-[#78716c] font-black uppercase truncate">{b.company}</div>
                        <div className="text-right text-[10px] font-bold text-[#a8a29e]">{b.material}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-left md:text-right shrink-0 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-[#d6d3d1]">
                  <div className="text-[10px] text-[#78716c] font-bold uppercase tracking-widest mb-2 leading-none">Treatment duration</div>
                  <div className="text-4xl lg:text-6xl font-medium text-[#292524] mono tracking-tighter leading-none">{elapsed}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 border-t border-[#d6d3d1] pt-8">
                <div>
                  <div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-wider mb-2">Start timestamp</div>
                  <div className="text-lg lg:text-xl font-mono text-[#57534e] font-bold tracking-tight leading-none">
                    {new Date(activeBlocks[0].resinStartTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-wider mb-2">Total downtime</div>
                  <div className="text-lg lg:text-xl font-mono text-amber-600 font-bold tracking-tight leading-none">
                    {(activeBlocks[0].resinPowerCuts || []).reduce((acc, pc) => acc + pc.durationMinutes, 0)} <span className="text-[10px]">MINS</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto space-y-4 pr-2 custom-scrollbar max-h-[220px] min-h-[120px]">
              {showPowerCutForm ? (
                <form onSubmit={handleAddPowerCut} className="bg-white p-6 rounded-2xl border border-amber-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between border-b border-amber-100 pb-3 mb-2">
                    <span className="text-[10px] font-semibold text-amber-600">Add Interruption Log</span>
                    <button type="button" onClick={() => setShowPowerCutForm(false)} className="text-[#a8a29e] hover:text-[#57534e] transition-colors"><i className="fas fa-times"></i></button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-medium text-[#78716c] ml-1">Start</label>
                      <input 
                        type="datetime-local" 
                        required 
                        className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl p-3 text-[11px] text-[#292524] font-medium focus:border-amber-500 outline-none" 
                        value={pcStart}
                        onChange={e => setPcStart(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-medium text-[#78716c] ml-1">End</label>
                      <input 
                        type="datetime-local" 
                        required 
                        className="w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-xl p-3 text-[11px] text-[#292524] font-medium focus:border-amber-500 outline-none" 
                        value={pcEnd}
                        onChange={e => setPcEnd(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={isSubmitting} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium py-4 rounded-xl text-[11px] transition-all shadow-sm">
                    {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : 'Commit log entry'}
                  </button>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-medium text-[#78716c]">Downtime logs</span>
                    {!isGuest && (
                      <button 
                        onClick={() => setShowPowerCutForm(true)}
                        disabled={!canEditCurrent}
                        className={`text-[9px] font-medium text-[#a8a29e] border border-[#d6d3d1] px-3 py-1.5 rounded-lg hover:bg-[#faf9f6] transition-colors ${!canEditCurrent ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        + Add log
                      </button>
                    )}
                  </div>
                  {(activeBlocks[0].resinPowerCuts || []).map((pc) => (
                    <div key={pc.id} className="flex justify-between items-center bg-amber-50 border border-amber-100 px-5 py-4 rounded-xl text-[11px] animate-in slide-in-from-right-2">
                      <span className="text-amber-700 font-medium">System outage</span>
                      <span className="font-semibold text-[#57534e]">-{pc.durationMinutes}m</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!isGuest && !showPowerCutForm && (
              <div className="pt-6 border-t border-[#d6d3d1] flex gap-3">
                <button 
                  onClick={handleUndoResin}
                  disabled={!canEditCurrent || isSubmitting}
                  className={`w-14 bg-white border border-red-200 text-red-400 py-5 rounded-2xl lg:rounded-3xl font-bold shadow-md hover:bg-red-50 transition-colors flex items-center justify-center ${!canEditCurrent ? 'opacity-30 cursor-not-allowed' : ''}`}
                  title="Restore / Remove Blocks from Resin Line"
                >
                  {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-undo"></i>}
                </button>
                <button
                  onClick={() => setFinishModalOpen(true)}
                  disabled={isSubmitting || !canEditCurrent}
                  className={`flex-1 bg-[#5c4033] hover:bg-[#4a3b32] text-white font-medium py-5 rounded-2xl lg:rounded-3xl shadow-md transform active:scale-[0.98] transition-all text-sm lg:text-base flex justify-center items-center gap-3 ${!canEditCurrent ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : <><i className="fas fa-check-double"></i> Finish Batch & Move to Stock</>}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ResinLine: React.FC<Props> = ({ blocks, onRefresh, isGuest, activeStaff }) => {
    // Collect ALL blocks currently in Resin status
    const activeBlocks = blocks.filter(b => b.status === BlockStatus.RESINING);
    const availableBlocks = blocks.filter(b => b.status === BlockStatus.PROCESSING && b.isSentToResin);

    return (
        <div className="space-y-8 pb-20">
           <div className="flex justify-between items-center">
             <div>
               <h2 className="text-2xl font-semibold text-[#292524]">
                 <i className="fas fa-flask-vial text-[#a8a29e] mr-3"></i> Resin Treatment
               </h2>
               <p className="text-[#78716c] text-xs mt-1 font-medium">Line operations & queue</p>
             </div>
             
             <div className="bg-white border border-[#d6d3d1] px-6 py-3 rounded-lg flex items-center space-x-4 shadow-sm">
                <div className="text-[#a8a29e]">
                   <i className="fas fa-list-ol text-lg"></i>
                </div>
                <div className="text-right">
                   <div className="text-[10px] font-medium text-[#78716c] leading-none">Queue</div>
                   <div className="text-xl font-semibold text-[#292524]">{availableBlocks.length}</div>
                </div>
             </div>
           </div>

           <div className="max-w-4xl mx-auto">
               <ResinLineCard 
                  title="Main Resin Line"
                  activeBlocks={activeBlocks}
                  availableBlocks={availableBlocks}
                  onRefresh={onRefresh}
                  isGuest={isGuest}
                  activeStaff={activeStaff}
               />
           </div>
        </div>
    );
};
