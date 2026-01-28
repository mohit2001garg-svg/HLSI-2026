
import React, { useState, useMemo } from 'react';
import { Block, BlockStatus } from '../types';

interface Props {
  blocks: Block[];
  onViewChange: (view: any) => void;
}

export const Dashboard: React.FC<Props> = ({ blocks, onViewChange }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const stats = useMemo(() => {
    const totalGantryWeight = blocks
      .filter(b => b.status === BlockStatus.GANTRY)
      .reduce((acc, b) => acc + (b.weight || 0), 0);

    const activeCuttingCount = blocks.filter(b => b.status === BlockStatus.CUTTING).length;
    const readyStockCount = blocks.filter(b => b.status === BlockStatus.COMPLETED).length;
    const yardArea = blocks
      .filter(b => b.status === BlockStatus.IN_STOCKYARD)
      .reduce((acc, b) => acc + (b.totalSqFt || 0), 0);

    const soldArea = blocks
      .filter(b => b.status === BlockStatus.SOLD)
      .reduce((acc, b) => acc + (b.totalSqFt || 0), 0);

    const resinQueue = blocks.filter(b => b.status === BlockStatus.PROCESSING && b.isSentToResin).length;

    return {
      totalGantryWeight,
      activeCuttingCount,
      readyStockCount,
      yardArea,
      soldArea,
      resinQueue
    };
  }, [blocks]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return blocks.filter(b => 
      b.jobNo.toLowerCase().includes(term) || 
      b.company.toLowerCase().includes(term) ||
      b.material.toLowerCase().includes(term) ||
      (b.minesMarka && b.minesMarka.toLowerCase().includes(term))
    );
  }, [blocks, searchTerm]);

  const StatCard = ({ icon, label, value, subValue, highlight, onClick }: any) => (
    <button 
      onClick={onClick}
      className={`group bg-white border border-[#d6d3d1] p-6 rounded-xl text-left transition-all duration-300 hover:shadow-lg hover:border-[#a8a29e] relative overflow-hidden`}
    >
      <div className="flex justify-between items-start mb-4">
         <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${highlight ? 'bg-[#5c4033] text-white' : 'bg-[#faf9f6] text-[#78716c]'} group-hover:bg-[#5c4033] group-hover:text-white transition-colors`}>
           <i className={`fas ${icon} text-lg`}></i>
         </div>
         {highlight && (
           <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 border border-amber-100">
             <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
             <span className="text-[10px] font-medium text-amber-700">Active</span>
           </span>
         )}
      </div>
      
      <div>
        <div className="text-xs font-medium text-[#78716c] mb-1">{label}</div>
        <div className="text-2xl lg:text-3xl font-semibold text-[#292524] tracking-tight">
          {value}
        </div>
        <div className="mt-3 pt-3 border-t border-[#e7e5e4] flex items-center gap-2">
          <div className="text-xs font-normal text-[#a8a29e]">
            {subValue || 'Standard operation'}
          </div>
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-8 pb-12">
      
      {/* Global Search Bar */}
      <div className="bg-white p-2 rounded-2xl border border-[#d6d3d1] shadow-sm flex items-center">
         <div className="w-12 h-12 flex items-center justify-center text-[#a8a29e]">
            <i className="fas fa-search text-lg"></i>
         </div>
         <input 
            type="text"
            className="flex-1 h-12 outline-none text-[#292524] font-medium placeholder:text-[#d6d3d1] bg-transparent"
            placeholder="Search Database: Enter Block No, Company, Material..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
         />
         {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="w-12 h-12 flex items-center justify-center text-[#a8a29e] hover:text-[#5c4033] transition-colors">
               <i className="fas fa-times"></i>
            </button>
         )}
      </div>

      {searchTerm ? (
         <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between">
               <h3 className="text-sm font-bold text-[#78716c] uppercase tracking-widest">
                  Search Results ({searchResults.length})
               </h3>
            </div>

            <div className="grid gap-4">
               {searchResults.map(b => (
                  <div key={b.id} className="bg-white border border-[#d6d3d1] p-6 rounded-xl shadow-sm hover:shadow-md transition-all">
                     <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        {/* Identity */}
                        <div className="flex items-start gap-4">
                           <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold border ${
                              b.status === BlockStatus.SOLD ? 'bg-green-50 border-green-200 text-green-700' :
                              b.status === BlockStatus.CUTTING ? 'bg-amber-50 border-amber-200 text-amber-700' :
                              b.status === BlockStatus.PROCESSING ? 'bg-blue-50 border-blue-200 text-blue-700' :
                              'bg-stone-100 border-stone-200 text-stone-500'
                           }`}>
                              {b.status === BlockStatus.CUTTING ? <i className="fas fa-cog fa-spin"></i> : 
                               b.status === BlockStatus.SOLD ? <i className="fas fa-check"></i> :
                               <i className="fas fa-cube"></i>}
                           </div>
                           <div>
                              <div className="flex items-center gap-2">
                                 <h4 className="text-xl font-black text-[#292524] tracking-tight">#{b.jobNo}</h4>
                                 <span className="px-2 py-0.5 bg-[#f5f5f4] text-[#78716c] text-[10px] font-bold uppercase rounded border border-[#e7e5e4]">{b.status}</span>
                              </div>
                              <div className="text-sm font-bold text-[#5c4033] mt-0.5 uppercase">{b.company}</div>
                              <div className="text-xs text-[#a8a29e] mt-1 font-medium">{b.material} {b.minesMarka ? `(${b.minesMarka})` : ''}</div>
                           </div>
                        </div>

                        {/* Details Grid */}
                        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                           <div className="bg-[#faf9f6] p-3 rounded-lg border border-[#e7e5e4]">
                              <div className="text-[9px] font-bold text-[#a8a29e] uppercase mb-1">Weight / Dims</div>
                              <div className="font-semibold text-[#292524]">{b.weight?.toFixed(2)} T</div>
                              <div className="text-[10px] text-[#78716c] font-mono mt-0.5">{Math.round(b.length)}x{Math.round(b.height)}x{Math.round(b.width)}</div>
                           </div>
                           
                           <div className="bg-[#faf9f6] p-3 rounded-lg border border-[#e7e5e4]">
                              <div className="text-[9px] font-bold text-[#a8a29e] uppercase mb-1">Location / Status</div>
                              <div className="font-semibold text-[#292524]">
                                 {b.status === BlockStatus.CUTTING ? b.assignedMachineId :
                                  b.status === BlockStatus.IN_STOCKYARD ? b.stockyardLocation :
                                  b.status === BlockStatus.SOLD ? 'Sold Out' :
                                  b.status === BlockStatus.PROCESSING ? (b.isSentToResin ? 'Resin Queue' : b.processingStage || 'Processing') :
                                  b.status === BlockStatus.PURCHASED ? 'Transit / Mine' :
                                  'Gantry Stock'}
                              </div>
                           </div>

                           <div className="bg-[#faf9f6] p-3 rounded-lg border border-[#e7e5e4]">
                              <div className="text-[9px] font-bold text-[#a8a29e] uppercase mb-1">Output / Area</div>
                              <div className="font-semibold text-[#292524]">{b.totalSqFt ? `${b.totalSqFt.toFixed(2)} sqft` : '-'}</div>
                              <div className="text-[10px] text-[#78716c] mt-0.5">{b.slabCount ? `${b.slabCount} slabs` : '-'}</div>
                           </div>

                           <div className="bg-[#faf9f6] p-3 rounded-lg border border-[#e7e5e4]">
                              <div className="text-[9px] font-bold text-[#a8a29e] uppercase mb-1">Timestamps</div>
                              <div className="font-semibold text-[#292524]">
                                 In: {new Date(b.arrivalDate).toLocaleDateString()}
                              </div>
                              {b.soldAt && (
                                 <div className="text-[10px] text-green-600 font-bold mt-0.5">Sold: {new Date(b.soldAt).toLocaleDateString()}</div>
                              )}
                           </div>
                        </div>
                     </div>
                  </div>
               ))}
               {searchResults.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 bg-white border border-dashed border-[#d6d3d1] rounded-xl text-center">
                     <i className="fas fa-search text-4xl text-[#e7e5e4] mb-4"></i>
                     <p className="text-stone-400 font-medium">No records found matching "{searchTerm}"</p>
                  </div>
               )}
            </div>
         </div>
      ) : (
         <>
            {/* KPI GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               <StatCard 
               icon="fa-layer-group" 
               label="Gantry Stock" 
               value={`${stats.totalGantryWeight.toFixed(2)} T`}
               subValue={`${blocks.filter(b => b.status === BlockStatus.GANTRY).length} Blocks pending`}
               onClick={() => onViewChange('gantry-stock')}
               />
               <StatCard 
               icon="fa-microchip" 
               label="Production Floor" 
               value={stats.activeCuttingCount}
               subValue="Machines online"
               highlight={stats.activeCuttingCount > 0}
               onClick={() => onViewChange('machine-status')}
               />
               <StatCard 
               icon="fa-flask-vial" 
               label="Resin Line" 
               value={stats.resinQueue}
               subValue="Blocks queued"
               highlight={stats.resinQueue > 0}
               onClick={() => onViewChange('resin-line')}
               />
               <StatCard 
               icon="fa-clipboard-check" 
               label="Ready Stock" 
               value={stats.readyStockCount}
               subValue="Awaiting dispatch"
               onClick={() => onViewChange('ready-stock')}
               />
               <StatCard 
               icon="fa-warehouse" 
               label="Stockyard Area" 
               value={`${(stats.yardArea / 1000).toFixed(2)}k`}
               subValue="Total sq.ft. inventory"
               onClick={() => onViewChange('stockyard')}
               />
               <StatCard 
               icon="fa-file-invoice-dollar" 
               label="Sales Ledger" 
               value={`${(stats.soldArea / 1000).toFixed(2)}k`}
               subValue="Total sq.ft. sold"
               onClick={() => onViewChange('sold-history')}
               />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
               {/* RECENT ARRIVALS */}
               <div className="bg-white border border-[#d6d3d1] rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#e7e5e4]">
                  <h3 className="font-semibold text-[#292524] text-sm">Recent Arrivals</h3>
                  <button onClick={() => onViewChange('block-arrival')} className="text-xs text-[#78716c] font-medium hover:text-[#5c4033]">View all</button>
                  </div>
                  
                  <div className="space-y-0">
                  {blocks.filter(b => b.status === BlockStatus.GANTRY).slice(0, 5).map((b, idx) => (
                     <div key={b.id} className="flex items-center justify-between py-4 border-b border-[#e7e5e4] last:border-0 hover:bg-[#faf9f6] px-2 -mx-2 transition-colors rounded">
                     <div className="flex items-center gap-4">
                        <div className="w-8 h-8 flex items-center justify-center rounded bg-[#f5f5f4] text-[#78716c] text-xs font-medium border border-[#e7e5e4]">
                           {idx + 1}
                        </div>
                        <div>
                           <div className="font-semibold text-[#44403c] text-sm">{b.company}</div>
                           <div className="text-xs text-[#a8a29e]">#{b.jobNo}</div>
                        </div>
                     </div>
                     <div className="text-right">
                        <div className="text-sm font-semibold text-[#292524]">{b.weight.toFixed(2)} T</div>
                        <div className="text-xs text-[#78716c]">{b.material}</div>
                     </div>
                     </div>
                  ))}
                  {blocks.filter(b => b.status === BlockStatus.GANTRY).length === 0 && (
                     <div className="py-12 text-center text-xs text-[#a8a29e] italic">No recent activity</div>
                  )}
                  </div>
               </div>

               {/* MACHINE TELEMETRY */}
               <div className="bg-white border border-[#d6d3d1] rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#e7e5e4]">
                  <h3 className="font-semibold text-[#292524] text-sm">Live Production</h3>
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                     <span className="text-xs text-emerald-600 font-medium">System online</span>
                  </div>
                  </div>
                  
                  <div className="space-y-4">
                  {blocks.filter(b => b.status === BlockStatus.CUTTING).map(b => (
                     <div key={b.id} className="bg-[#faf9f6] border border-[#d6d3d1] p-4 flex items-center gap-5 rounded-lg">
                        <div className="w-10 h-10 bg-white border border-[#d6d3d1] flex items-center justify-center text-[#d97706] rounded-full shadow-sm">
                           <i className="fas fa-cog fa-spin"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                           <div className="flex justify-between items-start mb-1">
                              <span className="text-xs font-medium text-[#78716c]">{b.assignedMachineId}</span>
                              <span className="px-2 py-0.5 bg-white border border-[#d6d3d1] text-[#57534e] text-[10px] font-medium rounded">Running</span>
                           </div>
                           <div className="text-sm font-semibold text-[#292524] truncate">{b.company}</div>
                           <div className="text-xs text-[#78716c] font-normal">{b.material} | #{b.jobNo}</div>
                        </div>
                     </div>
                  ))}
                  {blocks.filter(b => b.status === BlockStatus.CUTTING).length === 0 && (
                     <div className="h-full flex flex-col items-center justify-center py-12 border border-dashed border-[#d6d3d1] rounded-lg">
                        <i className="fas fa-pause text-[#d6d3d1] text-2xl mb-2"></i>
                        <div className="text-xs text-[#a8a29e]">All machines idle</div>
                     </div>
                  )}
                  </div>
               </div>
            </div>
         </>
      )}
    </div>
  );
};
