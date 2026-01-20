
import React, { useState, useRef, useEffect } from 'react';
import { Branding } from '../types';
import { db } from '../services/db';

interface Props {
  branding: Branding;
  onUpdateBranding: (branding: Branding) => void;
  isGuest?: boolean;
}

export const Settings: React.FC<Props> = ({ branding, onUpdateBranding, isGuest }) => {
  const [formData, setFormData] = useState<Branding>(branding);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Operator Management States
  const [staffList, setStaffList] = useState<string[]>([]);
  const [isStaffLoading, setIsStaffLoading] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [changePinTarget, setChangePinTarget] = useState<string | null>(null);
  const [newPinValue, setNewPinValue] = useState('');
  const [isUpdatingStaff, setIsUpdatingStaff] = useState(false);

  useEffect(() => {
    loadStaff();
  }, []);

  const loadStaff = async () => {
    setIsStaffLoading(true);
    const list = await db.fetchStaffList();
    setStaffList(list.filter(name => name !== 'GUEST'));
    setIsStaffLoading(false);
  };

  const handleSubmitBranding = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) return;
    onUpdateBranding(formData);
    alert("Branding updated successfully!");
  };

  const handleResetLogo = () => {
    if (isGuest) return;
    const defaultBranding = { ...formData, logoUrl: `asset/logo.png?t=${new Date().getTime()}` };
    setFormData(defaultBranding);
    onUpdateBranding(defaultBranding);
    alert("Logo reset to default file (asset/logo.png)");
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) {
        alert("File is too large! Please use a logo smaller than 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, logoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || !newStaffName || newStaffPin.length !== 4) return;
    setIsUpdatingStaff(true);
    try {
      await db.addStaff(newStaffName, newStaffPin);
      setNewStaffName('');
      setNewStaffPin('');
      await loadStaff();
      alert("New operator added successfully.");
    } catch (err: any) {
      alert("Failed to add operator: " + err.message);
    } finally {
      setIsUpdatingStaff(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest || !changePinTarget || newPinValue.length !== 4) return;
    setIsUpdatingStaff(true);
    try {
      await db.updateStaffPin(changePinTarget, newPinValue);
      setChangePinTarget(null);
      setNewPinValue('');
      alert(`PIN for ${changePinTarget} updated successfully.`);
    } catch (err: any) {
      alert("Failed to update PIN: " + err.message);
    } finally {
      setIsUpdatingStaff(false);
    }
  };

  const handleDeleteStaff = async (name: string) => {
    if (isGuest) return;
    if (name === 'VAIBHAV') {
      alert("System Administrator cannot be deleted.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete operator ${name}?`)) return;
    setIsUpdatingStaff(true);
    try {
      await db.deleteStaff(name);
      await loadStaff();
    } catch (err: any) {
      alert("Failed to delete operator: " + err.message);
    } finally {
      setIsUpdatingStaff(false);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
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

  const sectionTitleClass = "text-xl font-semibold text-[#292524] tracking-tight mb-6 flex items-center gap-3";
  const cardClass = "bg-white border border-[#d6d3d1] rounded-2xl p-8 shadow-sm transition-all";
  const inputLabelClass = "block text-[10px] font-medium text-[#78716c] ml-1 mb-1.5 uppercase tracking-wider";
  const textInputClass = "w-full bg-[#faf9f6] border border-[#d6d3d1] rounded-lg px-4 py-3 text-[#292524] font-medium focus:border-[#5c4033] focus:ring-1 focus:ring-[#5c4033] outline-none transition-all placeholder:text-stone-300";

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-32">
      
      {/* --- HEADER --- */}
      <div className="flex items-center gap-6">
        <div className="w-16 h-16 bg-white border border-[#d6d3d1] rounded-xl flex items-center justify-center text-[#5c4033] shadow-sm">
          <i className="fas fa-cog text-3xl"></i>
        </div>
        <div>
          <h2 className="text-3xl font-semibold text-[#292524] tracking-tighter">Admin Control Center</h2>
          <p className="text-xs text-[#78716c] font-medium">Manage global branding and operator credentials</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* --- BRANDING SECTION --- */}
        <div className={cardClass}>
          <h3 className={sectionTitleClass}>
            <i className="fas fa-paint-brush text-[#a8a29e] text-sm"></i> Global Branding
          </h3>
          <form onSubmit={handleSubmitBranding} className="space-y-6">
            <div>
              <label className={inputLabelClass}>Company Name</label>
              <input 
                disabled={isGuest}
                type="text" 
                className={textInputClass}
                value={formData.companyName}
                onChange={e => setFormData({...formData, companyName: e.target.value})}
              />
            </div>
            <div>
              <label className={inputLabelClass}>Subtitle / Short Name</label>
              <input 
                disabled={isGuest}
                type="text" 
                className={textInputClass}
                value={formData.shortName}
                onChange={e => setFormData({...formData, shortName: e.target.value})}
              />
            </div>
            <div>
              <label className={inputLabelClass}>Corporate Logo</label>
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGuest}
                  className="flex-1 bg-[#f5f5f4] hover:bg-stone-200 text-[#57534e] border border-[#d6d3d1] rounded-lg px-4 py-3 flex items-center justify-center gap-2 transition-all font-medium text-xs disabled:opacity-50"
                >
                  <i className="fas fa-upload"></i> Upload
                </button>
                <button 
                  type="button"
                  onClick={handleResetLogo}
                  disabled={isGuest}
                  className="w-12 bg-[#f5f5f4] hover:bg-red-50 text-[#78716c] hover:text-red-600 border border-[#d6d3d1] rounded-lg flex items-center justify-center transition-all disabled:opacity-50"
                  title="Reset to default"
                >
                  <i className="fas fa-undo"></i>
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </div>

            <div className="mt-4 p-4 bg-[#faf9f6] rounded-xl border border-[#d6d3d1] border-dashed flex flex-col items-center">
              <span className={inputLabelClass}>Preview</span>
              <div className="w-20 h-20 bg-white border border-[#d6d3d1] rounded-lg p-2 mb-3">
                <img src={formData.logoUrl || 'asset/logo.png'} className="w-full h-full object-contain" onError={handleImageError} alt="Preview" />
              </div>
              <div className="text-center">
                <div className="font-bold text-sm text-[#292524]">{formData.companyName}</div>
                <div className="text-[10px] text-[#78716c]">{formData.shortName}</div>
              </div>
            </div>

            {!isGuest && (
              <button type="submit" className="w-full bg-[#5c4033] hover:bg-[#4a3b32] text-white font-bold py-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-[0.98]">
                Update Identity
              </button>
            )}
          </form>
        </div>

        {/* --- OPERATOR MANAGEMENT SECTION --- */}
        <div className={cardClass}>
          <h3 className={sectionTitleClass}>
            <i className="fas fa-users-cog text-[#a8a29e] text-sm"></i> Operator Management
          </h3>

          {/* Add New Operator Form */}
          <div className="mb-8 p-6 bg-[#faf9f6] border border-[#d6d3d1] rounded-xl">
             <h4 className="text-xs font-bold text-[#5c4033] uppercase mb-4 tracking-widest flex items-center gap-2">
               <i className="fas fa-plus-circle"></i> Add New Operator
             </h4>
             <form onSubmit={handleAddStaff} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={inputLabelClass}>Full Name</label>
                  <input 
                    required 
                    disabled={isGuest || isUpdatingStaff}
                    type="text" 
                    placeholder="OPERATOR NAME"
                    className={textInputClass}
                    value={newStaffName}
                    onChange={e => setNewStaffName(e.target.value.toUpperCase())}
                  />
                </div>
                <div>
                  <label className={inputLabelClass}>4-Digit PIN</label>
                  <input 
                    required 
                    disabled={isGuest || isUpdatingStaff}
                    type="password" 
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    className={`${textInputClass} text-center font-black tracking-widest`}
                    value={newStaffPin}
                    onChange={e => setNewStaffPin(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div className="md:col-span-2 pt-2">
                   <button 
                    disabled={isGuest || isUpdatingStaff || newStaffPin.length !== 4}
                    type="submit" 
                    className="w-full bg-stone-100 hover:bg-stone-200 text-[#5c4033] font-bold py-3 rounded-lg text-[10px] uppercase tracking-widest border border-[#d6d3d1] transition-all"
                   >
                     {isUpdatingStaff ? <i className="fas fa-spinner fa-spin"></i> : 'Register Operator'}
                   </button>
                </div>
             </form>
          </div>

          {/* Staff List */}
          <div className="space-y-3">
             <h4 className="text-xs font-bold text-[#5c4033] uppercase mb-2 tracking-widest">Registered Personnel</h4>
             {isStaffLoading ? (
               <div className="py-8 text-center"><i className="fas fa-circle-notch fa-spin text-[#d6d3d1] text-xl"></i></div>
             ) : (
               <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                 {staffList.map(name => (
                   <div key={name} className="flex items-center justify-between p-4 bg-white border border-[#d6d3d1] rounded-xl hover:shadow-md transition-shadow">
                     <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#f5f5f4] flex items-center justify-center text-[#a8a29e] border border-[#d6d3d1]">
                          <i className="fas fa-user text-xs"></i>
                        </div>
                        <span className="font-bold text-sm text-[#292524]">{name}</span>
                     </div>
                     <div className="flex gap-2">
                        <button 
                          onClick={() => setChangePinTarget(changePinTarget === name ? null : name)}
                          className="px-3 py-1.5 rounded text-[10px] font-bold bg-white border border-[#d6d3d1] text-[#78716c] hover:bg-stone-50"
                        >
                          {changePinTarget === name ? 'Cancel' : 'Change PIN'}
                        </button>
                        {name !== 'VAIBHAV' && (
                           <button 
                             onClick={() => handleDeleteStaff(name)}
                             className="w-8 h-8 flex items-center justify-center rounded bg-white border border-red-100 text-red-400 hover:bg-red-50"
                           >
                             <i className="fas fa-trash-alt text-xs"></i>
                           </button>
                        )}
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>
      </div>

      {/* --- PIN CHANGE MODAL --- */}
      {changePinTarget && (
        <div className="fixed inset-0 z-[1000] bg-[#292524]/60 backdrop-blur-sm flex items-center justify-center p-6">
           <div className="bg-white rounded-2xl w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="font-bold text-lg text-[#292524]">Update Operator PIN</h3>
                 <button onClick={() => setChangePinTarget(null)} className="text-[#a8a29e] hover:text-[#292524]"><i className="fas fa-times"></i></button>
              </div>
              <div className="text-center mb-8">
                 <div className="text-xs text-[#78716c] mb-1">SETTING NEW PIN FOR</div>
                 <div className="text-xl font-black text-[#5c4033] tracking-wider">{changePinTarget}</div>
              </div>
              <form onSubmit={handleChangePin} className="space-y-6">
                 <div>
                    <label className={inputLabelClass}>New 4-Digit Security Code</label>
                    <input 
                      required 
                      autoFocus
                      type="password" 
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="••••"
                      className="w-full text-center text-4xl bg-[#faf9f6] border border-[#d6d3d1] rounded-xl py-4 font-black tracking-[1em] focus:border-[#5c4033] focus:ring-1 focus:ring-[#5c4033] outline-none transition-all"
                      value={newPinValue}
                      onChange={e => setNewPinValue(e.target.value.replace(/\D/g, ''))}
                    />
                 </div>
                 <div className="flex gap-3">
                    <button type="button" onClick={() => setChangePinTarget(null)} className="flex-1 py-4 font-bold text-xs uppercase tracking-widest text-[#78716c] bg-stone-50 rounded-xl">Dismiss</button>
                    <button 
                      disabled={isUpdatingStaff || newPinValue.length !== 4} 
                      type="submit" 
                      className="flex-[2] bg-[#5c4033] text-white py-4 font-bold text-xs uppercase tracking-widest rounded-xl shadow-xl active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isUpdatingStaff ? <i className="fas fa-spinner fa-spin"></i> : 'Update PIN'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};
