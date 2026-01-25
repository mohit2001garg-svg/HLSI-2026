
import React, { useState, useEffect, useCallback } from 'react';
import { db, supabase } from './services/db';
import { Block, StaffMember, View, Branding, BlockStatus } from './types';
import { BlockArrival } from './components/BlockArrival';
import { GantryQueue } from './components/GantryQueue';
import { MachineStatus } from './components/MachineStatus';
import { ReadyStock } from './components/ReadyStock';
import { Processing } from './components/Processing';
import { Stockyard } from './components/Stockyard';
import { SoldHistory } from './components/SoldHistory';
import { Login } from './components/Login';
import { ResinLine } from './components/ResinLine';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { Purchase } from './components/Purchase';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [activeStaff, setActiveStaff] = useState<StaffMember | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [inventory, setInventory] = useState<Block[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Branding State
  const [branding, setBranding] = useState<Branding>(() => {
    const saved = localStorage.getItem('app_branding');
    return saved ? JSON.parse(saved) : {
      logoUrl: 'asset/logo.png',
      companyName: 'Hi-Line Stone',
      shortName: 'India Pvt Ltd'
    };
  });

  const updateBranding = (newBranding: Branding) => {
    setBranding(newBranding);
    localStorage.setItem('app_branding', JSON.stringify(newBranding));
  };

  const refreshData = useCallback(async () => {
    setIsSyncing(true);
    try {
      const data = await db.fetchInventory();
      setInventory(data);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const savedStaff = sessionStorage.getItem('hi_line_staff');
    if (savedStaff) {
      setActiveStaff(savedStaff as StaffMember);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshData();
    const channel = supabase
      .channel('inventory_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        refreshData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, refreshData]);

  const handleLogin = (staff: StaffMember) => {
    setActiveStaff(staff);
    setIsAuthenticated(true);
    sessionStorage.setItem('hi_line_staff', staff);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setActiveStaff(null);
    sessionStorage.removeItem('hi_line_staff');
  };

  const handleSidebarImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    if (target.src.includes('cdn-icons-png.flaticon.com')) return;

    if (target.src.includes('asset/logo.png')) {
      target.src = 'assets/logo.png';
    } else if (target.src.includes('assets/logo.png')) {
      target.src = 'https://cdn-icons-png.flaticon.com/512/4300/4300058.png';
    } else {
      target.src = 'asset/logo.png';
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} branding={branding} />;
  }

  const isGuest = activeStaff === 'GUEST';

  const renderMenuItem = (id: View, icon: string, label: string) => {
    const isActive = currentView === id;
    return (
      <button
        key={id}
        onClick={() => {
          setCurrentView(id);
          setIsSidebarOpen(false);
        }}
        className={`w-full flex items-center gap-4 px-6 py-3.5 transition-all duration-200 rounded-lg mx-2 max-w-[calc(100%-1rem)] ${
          isActive 
            ? 'bg-[#4a3b32] text-white shadow-sm' 
            : 'text-[#d6d3d1] hover:text-white hover:bg-white/5'
        }`}
      >
        <i className={`fas ${icon} text-sm w-5 text-center ${isActive ? 'text-white' : 'text-[#a8a29e]'}`}></i>
        <span className={`text-sm font-medium ${isActive ? 'text-white' : ''}`}>{label}</span>
      </button>
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden text-[#2c241b] bg-[#faf9f6]">

      {/* Mobile Overlay */}
      {isSidebarOpen && <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in" onClick={() => setIsSidebarOpen(false)} />}

      <aside className={`
        fixed lg:sticky top-0 h-full w-[280px] z-[70] transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        bg-[#352b24] shadow-xl border-r border-[#2c241b] text-white
      `}>
        <div className="flex flex-col h-full overflow-y-auto custom-scrollbar relative">
          {/* Brand Header */}
          <div className="pt-12 pb-10 px-8 flex flex-col items-center border-b border-[#4a3b32] bg-[#352b24]">
            <div className="w-16 h-16 mb-5 relative">
              <img 
                src={branding.logoUrl || 'asset/logo.png'} 
                alt="Logo" 
                className="w-full h-full object-contain filter drop-shadow-md" 
                onError={handleSidebarImageError}
              />
            </div>
            <div className="text-center">
              <h1 className="font-semibold text-lg text-[#f5f5f4] leading-tight">
                {branding.companyName}
              </h1>
              <p className="text-xs text-[#a8a29e] mt-1.5 uppercase tracking-widest">{branding.shortName}</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-8 space-y-10">
            <div>
              <label className="px-10 block text-[10px] font-bold text-[#a8a29e] mb-3 uppercase tracking-[0.2em] opacity-40">Logistics</label>
              <div className="space-y-1">
                {renderMenuItem('dashboard', 'fa-th-large', 'Overview')}
                {renderMenuItem('purchase', 'fa-shopping-cart', 'Purchase')}
                {renderMenuItem('block-arrival', 'fa-truck', 'Arrivals')}
                {renderMenuItem('gantry-stock', 'fa-layer-group', 'Gantry')}
              </div>
            </div>
            
            <div>
              <label className="px-10 block text-[10px] font-bold text-[#a8a29e] mb-3 uppercase tracking-[0.2em] opacity-40">Production</label>
              <div className="space-y-1">
                {renderMenuItem('machine-status', 'fa-microchip', 'Machines')}
                {renderMenuItem('processing', 'fa-arrows-spin', 'Processing')}
                {renderMenuItem('resin-line', 'fa-flask-vial', 'Resin Line')}
              </div>
            </div>

            <div>
              <label className="px-10 block text-[10px] font-bold text-[#a8a29e] mb-3 uppercase tracking-[0.2em] opacity-40">Sales</label>
              <div className="space-y-1">
                {renderMenuItem('ready-stock', 'fa-clipboard-check', 'Ready Stock')}
                {renderMenuItem('stockyard', 'fa-warehouse', 'Stockyard')}
                {renderMenuItem('sold-history', 'fa-file-invoice-dollar', 'Sales Ledger')}
              </div>
            </div>

            {!isGuest && (
              <div>
                <label className="px-10 block text-[10px] font-bold text-[#a8a29e] mb-3 uppercase tracking-[0.2em] opacity-40">Admin</label>
                <div className="space-y-1">
                  {renderMenuItem('settings', 'fa-cog', 'Settings')}
                </div>
              </div>
            )}
          </nav>

          {/* User Footer */}
          <div className="p-6 mt-auto border-t border-[#4a3b32] bg-[#2c241b]">
            <div className="flex items-center justify-between mb-6 px-2">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#4a3b32] text-[#d6d3d1]">
                     <i className="fas fa-user text-sm"></i>
                  </div>
                  <div>
                     <div className="text-[10px] text-[#a8a29e] font-bold uppercase tracking-wider">Operator</div>
                     <div className="text-sm font-semibold text-white">{activeStaff}</div>
                  </div>
               </div>
               {!isGuest && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full ring-4 ring-emerald-500/20"></div>}
            </div>
            <button onClick={handleLogout} className="w-full text-[#a8a29e] hover:text-white hover:bg-[#4a3b32] py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-3 transition-all border border-[#4a3b32]">
              <i className="fas fa-power-off text-sm"></i> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative bg-[#faf9f6]">
        {/* Mobile Header */}
        <div className="lg:hidden px-6 py-4 border-b border-[#d6d3d1] flex items-center justify-between bg-white z-50 sticky top-0 shadow-sm">
          <button onClick={() => setIsSidebarOpen(true)} className="text-[#57534e] text-xl p-2"><i className="fas fa-bars"></i></button>
          <div className="flex flex-col items-center">
             <span className="text-[#292524] font-bold text-base tracking-tight">{branding.companyName}</span>
          </div>
          <div className="w-10 flex items-center justify-center">
             {isSyncing ? <i className="fas fa-sync fa-spin text-stone-400"></i> : <i className="fas fa-circle text-[8px] text-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></i>}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 pb-32 lg:pb-16 min-h-0 scroll-smooth">
          
          {/* Page Header - Restored Premium Industrial Style */}
          <header className="mb-12 flex flex-col lg:flex-row justify-between items-start gap-8">
            <div className="w-full lg:w-auto">
              <p className="text-[#78716c] text-[11px] uppercase font-black tracking-[0.25em] mb-3 opacity-60">
                 Factory Management &bull; Industrial Stock Control
              </p>
              
              <div className="flex items-center gap-6 bg-white px-10 py-7 rounded-[2rem] border border-[#d6d3d1] shadow-xl w-full lg:min-w-[550px]">
                <div className="flex-1 text-center">
                  <div className="text-[11px] text-[#a8a29e] font-black mb-1.5 uppercase tracking-widest">Total Blocks</div>
                  <div className="text-4xl font-black text-[#292524] leading-none tabular-nums">
                    {inventory.filter(b => b.status === BlockStatus.GANTRY).length}
                  </div>
                </div>
                
                <div className="w-px bg-[#d6d3d1] h-12"></div>
                
                <div className="flex-1 text-center">
                  <div className="text-[11px] text-[#a8a29e] font-black mb-1.5 uppercase tracking-widest">Stock Volume</div>
                  <div className="text-4xl font-black text-[#292524] leading-none tabular-nums">
                    {Math.round(inventory
                      .filter(b => b.status === BlockStatus.IN_STOCKYARD)
                      .reduce((acc, b) => acc + (b.totalSqFt || 0), 0)
                      ).toLocaleString()} <span className="text-sm font-black text-[#78716c] ml-1">SQFT</span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <section className="animate-in fade-in slide-in-from-bottom-3 duration-700">
            {currentView === 'dashboard' && <Dashboard blocks={inventory} onViewChange={setCurrentView} />}
            {currentView === 'purchase' && <Purchase blocks={inventory} onRefresh={refreshData} activeStaff={activeStaff!} isGuest={isGuest} />}
            {currentView === 'block-arrival' && <BlockArrival onSuccess={refreshData} activeStaff={activeStaff!} blocks={inventory} />}
            {currentView === 'gantry-stock' && <GantryQueue blocks={inventory} onRefresh={refreshData} isGuest={isGuest} activeStaff={activeStaff!} />}
            {currentView === 'machine-status' && <MachineStatus blocks={inventory} onRefresh={refreshData} isGuest={isGuest} activeStaff={activeStaff!} />}
            {currentView === 'resin-line' && <ResinLine blocks={inventory} onRefresh={refreshData} isGuest={isGuest} activeStaff={activeStaff!} />}
            {currentView === 'processing' && <Processing blocks={inventory} onRefresh={refreshData} isGuest={isGuest} activeStaff={activeStaff!} />}
            {currentView === 'ready-stock' && <ReadyStock blocks={inventory} onRefresh={refreshData} isGuest={isGuest} activeStaff={activeStaff!} />}
            {currentView === 'stockyard' && <Stockyard blocks={inventory} onRefresh={refreshData} activeStaff={activeStaff!} isGuest={isGuest} />}
            {currentView === 'sold-history' && <SoldHistory blocks={inventory} onRefresh={refreshData} isGuest={isGuest} activeStaff={activeStaff!} />}
            {currentView === 'settings' && <Settings branding={branding} onUpdateBranding={updateBranding} isGuest={isGuest} />}
          </section>
        </main>
      </div>
    </div>
  );
};

export default App;
