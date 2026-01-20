
import React, { useMemo } from 'react';
import { Block, BlockStatus } from '../types';

interface Props {
  blocks: Block[];
  onViewChange: (view: any) => void;
}

export const Dashboard: React.FC<Props> = ({ blocks, onViewChange }) => {
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
    </div>
  );
};
