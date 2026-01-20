
import React, { useState, useEffect } from 'react';
import { StaffMember, Branding } from '../types';
import { db } from '../services/db';

interface LoginProps {
  onLogin: (staff: StaffMember) => void;
  branding: Branding;
}

export const Login: React.FC<LoginProps> = ({ onLogin, branding }) => {
  const [staffList, setStaffList] = useState<string[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const loadStaff = async () => {
      const list = await db.fetchStaffList();
      setStaffList(list);
      if (list.length > 0) {
        setSelectedStaff(list[0]);
      } else {
        setSelectedStaff('GUEST');
      }
      setIsLoading(false);
    };
    loadStaff();
  }, []);

  const isGuest = selectedStaff === 'GUEST';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) {
      onLogin('GUEST');
      return;
    }
    
    setIsVerifying(true);
    setError(false);
    
    try {
      const isValid = await db.verifyPin(selectedStaff, pin);
      if (isValid) {
        onLogin(selectedStaff as StaffMember);
      } else {
        setError(true);
        setPin('');
        if ('vibrate' in navigator) navigator.vibrate(200);
      }
    } catch (err) {
      console.error("Login verification failed:", err);
      alert("System connection error.");
    } finally {
      setIsVerifying(false);
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#faf9f6]">
        <div className="w-12 h-12 border-4 border-[#d6d3d1] border-t-[#5c4033] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#faf9f6] relative">
      {/* Background Texture */}
      <div className="absolute inset-0 opacity-40 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/marble.png')]"></div>

      <div className="w-full max-w-md relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Card */}
        <div className="bg-white p-10 lg:p-12 shadow-xl border border-[#d6d3d1] rounded-2xl relative overflow-hidden">
          
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 mb-6 p-2 rounded-xl bg-[#faf9f6] border border-[#d6d3d1]">
              <img 
                src={branding.logoUrl || 'asset/logo.png'} 
                alt="Logo" 
                className="w-full h-full object-contain"
                onError={handleImageError}
              />
            </div>
            <h1 className="text-2xl font-semibold text-[#292524] text-center">
              {branding.companyName}
            </h1>
            <p className="mt-2 text-xs text-[#78716c] font-medium">
              {branding.shortName}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-2">
              <label className="block text-xs text-[#78716c] font-medium">Select operator</label>
              <div className="relative">
                <select
                  disabled={isVerifying}
                  value={selectedStaff}
                  onChange={(e) => {
                    setSelectedStaff(e.target.value);
                    setError(false);
                    setPin('');
                  }}
                  className="w-full bg-[#faf9f6] border border-[#d6d3d1] text-[#292524] px-4 py-4 rounded-lg appearance-none focus:outline-none focus:border-[#5c4033] focus:ring-1 focus:ring-[#5c4033] font-medium transition-all"
                >
                  {staffList.length > 0 ? (
                    staffList.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))
                  ) : (
                    <option value="GUEST">GUEST</option>
                  )}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#78716c]">
                  <i className="fas fa-chevron-down text-xs"></i>
                </div>
              </div>
            </div>

            {!isGuest ? (
              <div className="space-y-2 animate-in fade-in duration-300">
                <label className="block text-xs text-[#78716c] font-medium">Security PIN</label>
                <input
                  disabled={isVerifying}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d*"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setPin(val);
                    if (error) setError(false);
                  }}
                  className={`w-full bg-[#faf9f6] border text-center text-3xl focus:outline-none py-3 rounded-lg transition-all ${
                    error 
                    ? 'border-red-300 text-red-600 bg-red-50 animate-shake' 
                    : 'border-[#d6d3d1] text-[#292524] focus:border-[#5c4033] focus:ring-1 focus:ring-[#5c4033]'
                  }`}
                />
              </div>
            ) : (
              <div className="py-4 bg-[#faf9f6] rounded-lg border border-dashed border-[#d6d3d1] flex items-center justify-center gap-2">
                 <i className="fas fa-eye text-[#78716c]"></i>
                 <span className="text-xs text-[#78716c] font-medium">View only mode</span>
              </div>
            )}

            <button
              type="submit"
              disabled={(!isGuest && pin.length < 4) || isVerifying}
              className={`w-full py-4 rounded-lg transition-all text-sm font-medium shadow-md active:scale-[0.98] ${
                isGuest 
                ? 'bg-[#e7e5e4] text-[#57534e] hover:bg-[#d6d3d1]' 
                : 'bg-[#5c4033] text-white hover:bg-[#4a3b32]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="flex items-center justify-center gap-2">
                {isVerifying && <i className="fas fa-circle-notch fa-spin"></i>}
                {isGuest ? 'Enter system' : (isVerifying ? 'Authenticating...' : 'Access terminal')}
              </span>
            </button>
          </form>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-[#a8a29e] font-medium">
            &copy; {new Date().getFullYear()} Factory Management System
          </p>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 0s 2;
        }
      `}</style>
    </div>
  );
};
