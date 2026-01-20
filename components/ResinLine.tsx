
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
  currentBlock: Block | undefined;
  availableBlocks: Block[];
  onRefresh: () => void;
  isLineOccupied: boolean;
  isGuest?: boolean;
  activeStaff: StaffMember;
}> = ({ title, currentBlock, availableBlocks, onRefresh, isLineOccupied, isGuest, activeStaff }) => {
  const [showPowerCutForm, setShowPowerCutForm] = useState(false);
  const [pcStart, setPcStart] = useState('');
  const [pcEnd, setPcEnd] = useState('');
  const [elapsed, setElapsed] = useState<string>('00:00:00');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [treatmentType, setTreatmentType] = useState<ResinTreatmentType>('Resin');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Finish Modal State
  const [finishModalOpen, setFinishModalOpen] = useState(false);

  // Manual Time States
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');

  // Error handling state
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Permission
  const canEditCurrent = currentBlock ? checkPermission(activeStaff, currentBlock.company) : false;

  useEffect(() => {
    let interval: number;
    if (currentBlock?.resinStartTime && !currentBlock.resinEndTime) {
      interval = window.setInterval(() => {
        const start = new Date(currentBlock.resinStartTime!).getTime();
        const now = new Date().getTime();
        const totalDowntimeMs = (currentBlock.resinPowerCuts || []).reduce((acc, pc) => {
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

  // Reset manual end time when finish form opens
  useEffect(() => {
    if (finishModalOpen) {
        // Set default manual end time to now
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setManualEndTime(now.toISOString().slice(0, 16));
    }
  }, [finishModalOpen]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    const match = availableBlocks.find(b => `${b.jobNo} | ${b.company}` === val);
    if (match) setSelectedBlockId(match.id);
    else setSelectedBlockId('');
  };

  const handleError = (err: any) => {
    console.error(err);
    if (err.code === 'PGRST204' || (err.message && (err.message.includes('column') || err.message.includes('resin') || err.message.includes('Find') || err.message.includes('slab')))) {
      setErrorDetails(`DATABASE SCHEMA MISSING: The database does not have the required columns for Resin Line operations.\n\nRun the repair script in Supabase SQL Editor.`);
    } else {
      alert(`Operation Failed: ${err.message || 'Unknown network error'}`);
    }
  };

  const handleLoadBlock = async () => {
    if (isGuest) return;
    if (isLineOccupied) {
      alert("Resin line is currently occupied. Please complete the current block first.");
      return;
    }
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
        status: BlockStatus.RESINING,
        resinStartTime: startTime,
        resinPowerCuts: [],
        resinTreatmentType: treatmentType
      });
      setSelectedBlockId('');
      setSearchQuery('');
      setManualStartTime('');
      onRefresh();
    } catch (err) {
      handleError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndoResin = async () => {
    if (isGuest || !currentBlock || !canEditCurrent) return;
    if (!window.confirm("Remove this block from the Resin Line? It will be returned to the processing queue.")) return;
    setIsSubmitting(true);
    try {
      await db.updateBlock(currentBlock.id, { 
        status: BlockStatus.PROCESSING,
        resinStartTime: null as any,
        resinPowerCuts: [],
        resinTreatmentType: null as any
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

      const updatedCuts = [...(currentBlock.resinPowerCuts || []), newPC];
      await db.updateBlock(currentBlock.id, { resinPowerCuts: updatedCuts });
      
      setShowPowerCutForm(false);
      setPcStart('');
      setPcEnd('');
      onRefresh();
    } catch (err) {
      handleError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinishResin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || !currentBlock || !canEditCurrent) return;
    
    setIsSubmitting(true);
    try {
      const endTime = manualEndTime ? new Date(manualEndTime).toISOString() : new Date().toISOString();
      await db.updateBlock(currentBlock.id, { 
        status: BlockStatus.COMPLETED,
        resinEndTime: endTime,
        processingStage: 'Field'
      });
      onRefresh();
      setFinishModalOpen(false);
      setManualEndTime('');
    } catch (err) {
      handleError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`flex flex-col rounded-2xl border-2 transition-all shadow-sm overflow-hidden relative ${
      currentBlock ? 'bg-white border-[#d6d3d1]' : 'bg-white border-[#d6d3d1]'
    }`}>
      
      {/* Finish Modal */}
      {finishModalOpen && (
        <div className="absolute inset-0 z-40 bg-[#292524]/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#d6d3d1] rounded-3xl w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95 duration-200 text-center">
             <i className="fas fa-check-circle text-cyan-600 text-5xl mb-6"></i>
             <h3 className="text-xl font-semibold text-[#292524] mb-2">Finalize Treatment</h3>
             <p className="text-[#78716c] text-xs font-medium mb-8">Confirm that this block has completed its resin cycle.</p>
             <form onSubmit={handleFinishResin} className="space-y-6">
               <div className="text-left">
                   <label className="block text-xs font-medium text-[#78716c] mb-2">Completion Time</label>
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
        currentBlock ? 'bg-[#f5f5f4] border-[#d6d3d1]' : 'bg-[#faf9f6] border-[#d6d3d1]'
      }`}>
        <h3 className="text-lg lg:text-xl font-bold flex items-center text-[#292524]">
          <i className="fas fa-flask-vial mr-3 lg:mr-4 text-[#a8a29e]"></i> {title}
        </h3>
        {currentBlock && (
          <div className="flex items-center space-x-4">
            <span className="text-[#78716c] text-[10px] font-medium border border-[#d6d3d1] px-2 py-1 rounded">Op: {currentBlock.enteredBy}</span>
            <span className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
              <span className="text-cyan-600 text-[10px] font-medium">Live</span>
            </span>
          </div>
        )}
      </div>

      <div className="p-6 lg:p-10 flex flex-col relative">
        {!currentBlock ? (
          <div className="flex flex-col justify-center max-w-lg mx-auto w-full py-4 lg:py-8">
            <label className="block text-xs font-medium text-[#78716c] mb-4 text-center">Unit initialization</label>
            
            <div className="space-y-6 bg-[#faf9f6] p-6 lg:p-8 rounded-2xl border border-[#d6d3d1] shadow-sm mb-6">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#a8a29e] mb-2 ml-1">Select ready block</label>
                  <input 
                    list="resin-blocks"
                    className="w-full bg-white border border-[#d6d3d1] text-[#292524] rounded-xl px-4 py-4 focus:outline-none focus:border-[#5c4033] font-medium text-sm transition-all placeholder:text-[#d6d3d1] disabled:opacity-50"
                    placeholder="Type to search..."
                    onChange={handleSearchChange}
                    value={searchQuery}
                    disabled={isGuest || isSubmitting}
                  />
                  <datalist id="resin-blocks">
                    {availableBlocks.map(b => (
                      <option key={b.id} value={`${b.jobNo} | ${b.company}`} />
                    ))}
                  </datalist>
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
              </div>

              {!isGuest && (
                <button
                  onClick={handleLoadBlock}
                  disabled={isSubmitting}
                  className="w-full bg-[#5c4033] hover:bg-[#4a3b32] disabled:bg-[#d6d3d1] disabled:text-[#f5f5f4] text-white font-medium py-5 rounded-xl text-xs transition-all active:scale-95 shadow-md mt-2 flex justify-center items-center gap-2"
                >
                  {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : 'Engage Unit & Start Timer'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 flex flex-col max-w-2xl mx-auto w-full">
            <div className="bg-[#faf9f6] p-6 lg:p-10 rounded-2xl lg:rounded-3xl border border-[#d6d3d1] shadow-inner">
              <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-[10px] text-cyan-600 font-medium leading-none">Active treatment</div>
                    <span className="px-3 py-1 bg-cyan-100 text-cyan-800 text-[10px] rounded-full font-medium leading-none">
                      {currentBlock.resinTreatmentType}
                    </span>
                  </div>
                  <div className="text-3xl lg:text-4xl font-bold text-[#292524] leading-none tracking-tight truncate">{currentBlock.company}</div>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="text-[11px] text-[#78716c] font-medium truncate leading-none">{currentBlock.material}</div>
                    <span className="px-2 py-1 bg-white text-[#57534e] text-[10px] rounded font-medium border border-[#d6d3d1] leading-none">#{currentBlock.jobNo}</span>
                  </div>
                </div>
                <div className="text-left md:text-right shrink-0">
                  <div className="text-[10px] text-[#78716c] font-medium mb-2 leading-none">Net treatment time</div>
                  <div className="text-4xl lg:text-6xl font-medium text-[#292524] mono tracking-tight leading-none">{elapsed}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 border-t border-[#d6d3d1] pt-8">
                <div>
                  <div className="text-[10px] text-[#a8a29e] font-medium mb-2">Start timestamp</div>
                  <div className="text-lg lg:text-xl font-mono text-[#57534e] font-medium tracking-tight leading-none">
                    {new Date(currentBlock.resinStartTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#a8a29e] font-medium mb-2">Total downtime</div>
                  <div className="text-lg lg:text-xl font-mono text-amber-600 font-medium tracking-tight leading-none">
                    {(currentBlock.resinPowerCuts || []).reduce((acc, pc) => acc + pc.durationMinutes, 0)} <span className="text-[10px]">MINS</span>
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
                  {(currentBlock.resinPowerCuts || []).map((pc) => (
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
                  title="Restore / Remove Block from Resin Line"
                >
                  {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-undo"></i>}
                </button>
                <button
                  onClick={() => setFinishModalOpen(true)}
                  disabled={isSubmitting || !canEditCurrent}
                  className={`flex-1 bg-[#5c4033] hover:bg-[#4a3b32] text-white font-medium py-5 rounded-2xl lg:rounded-3xl shadow-md transform active:scale-[0.98] transition-all text-sm lg:text-base flex justify-center items-center gap-3 ${!canEditCurrent ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? <i className="fas fa-circle-notch fa-spin"></i> : <><i className="fas fa-check-double"></i> Finish & move to stock</>}
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
    const currentBlock = blocks.find(b => b.status === BlockStatus.RESINING);
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
                  currentBlock={currentBlock}
                  availableBlocks={availableBlocks}
                  onRefresh={onRefresh}
                  isLineOccupied={!!currentBlock}
                  isGuest={isGuest}
                  activeStaff={activeStaff}
               />
           </div>
        </div>
    );
};
