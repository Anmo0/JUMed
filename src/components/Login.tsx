import React, { useState } from 'react';
import { AlertTriangleIcon, LogoIcon } from './icons';

interface LoginProps {
    onLogin: (universityId: string, serialNumber: string, userType: 'student' | 'admin') => void;
    error: string | null;
    onDismissError: () => void;
    isRamadanMode: boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin, error, onDismissError, isRamadanMode }) => {
    const [userType, setUserType] = useState<'student' | 'admin'>('student');
    const [universityId, setUniversityId] = useState('');
    const [serialNumber, setSerialNumber] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            // استخدام trim() لتنظيف المدخلات من أي مسافات فارغة بالخطأ
            onLogin(universityId.trim(), serialNumber.trim(), userType);
    };

    return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <div className="w-full max-w-sm">
                <div className="mx-auto mb-6 h-16 w-16 text-blue-400 animate-pop-in">
                    <LogoIcon />
                </div>
                
                <h1 className="text-3xl font-bold text-center text-white mb-2 animate-slide-in-up" style={{ animationDelay: '100ms' }}>تسجيل الدخول</h1>
                <p className="text-center text-gray-300 mb-8 animate-slide-in-up" style={{ animationDelay: '200ms' }}>لنظام الحضور الذكي</p>

                <div className={`backdrop-blur-2xl border rounded-2xl shadow-lg p-6 sm:p-8 animate-slide-in-up transition-all duration-500 transform-gpu ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/85 border-slate-700/60'}`} style={{ animationDelay: '300ms' }}>
                    <div className="flex bg-slate-800/50 rounded-lg p-1 mb-6 border border-slate-700/50">
                        <button
                            type="button"
                            onClick={() => { setUserType('student'); setUniversityId(''); setSerialNumber(''); }}
                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all transform-gpu ${userType === 'student' ? (isRamadanMode ? 'bg-yellow-500 text-slate-900 shadow-md' : 'bg-blue-600 text-white shadow-md') : 'text-gray-400 hover:text-white'}`}
                        >
                            طالب
                        </button>
                        <button
                            type="button"
                            onClick={() => { setUserType('admin'); setUniversityId(''); setSerialNumber(''); }}
                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all transform-gpu ${userType === 'admin' ? (isRamadanMode ? 'bg-yellow-500 text-slate-900 shadow-md' : 'bg-blue-600 text-white shadow-md') : 'text-gray-400 hover:text-white'}`}
                        >
                            مشرف
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="universityId" className={`block text-sm font-medium mb-2 ${isRamadanMode ? 'text-gray-300' : 'text-gray-300'}`}>
                                {userType === 'admin' ? 'البريد الإلكتروني' : 'الرقم الجامعي'}
                            </label>
                            <input
                                type={userType === 'admin' ? 'email' : 'text'}
                                id="universityId"
                                value={universityId}
                                onChange={(e) => setUniversityId(e.target.value)}
                                required
                                className={`w-full px-4 py-2.5 bg-slate-800/50 border rounded-lg shadow-sm focus:outline-none transition-all duration-200 transform-gpu text-white placeholder-gray-400 ${isRamadanMode ? 'border-yellow-500/30 focus:ring-yellow-500 focus:border-yellow-500' : 'border-slate-700 focus:ring-blue-500 focus:border-blue-500'}`}
                                placeholder={userType === 'admin' ? 'admin@example.com' : 'مثال: 2020202020'}
                            />
                        </div>
                        <div>
                             <label htmlFor="serialNumber" className="block text-sm font-medium text-gray-300 mb-2">
                                {userType === 'admin' ? 'كلمة المرور' : 'الرقم التسلسلي'}
                             </label>
                            <input
                                type="password"
                                id="serialNumber"
                                value={serialNumber}
                                onChange={(e) => setSerialNumber(e.target.value)}
                                required
                                className={`w-full px-4 py-2.5 bg-slate-800/50 border rounded-lg shadow-sm focus:outline-none transition-all duration-200 transform-gpu text-white placeholder-gray-400 ${isRamadanMode ? 'border-yellow-500/30 focus:ring-yellow-500 focus:border-yellow-500' : 'border-slate-700 focus:ring-blue-500 focus:border-blue-500'}`}
                                placeholder="••••••••"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center justify-between p-3 bg-red-900/20 text-red-300 border border-red-500/30 shadow-md shadow-red-500/10 animate-fade-in" role="alert">
                                <div className="flex items-center">
                                    <AlertTriangleIcon className="w-5 h-5 me-2 flex-shrink-0" />
                                    <p className="text-sm font-medium">{error}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={onDismissError}
                                    className="ms-2 p-1.5 rounded-full text-red-400 hover:bg-red-900/50 focus:outline-none focus:ring-2 focus:ring-red-400"
                                    aria-label="إغلاق"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        )}

                        <button
                            type="submit"
                            className={`w-full py-3 px-4 font-bold rounded-lg shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all transform transform-gpu hover:-translate-y-1 ${isRamadanMode ? 'ramadan-btn-gold focus:ring-yellow-500' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 focus:ring-indigo-500'}`}
                        >
                            دخول
                        </button>
                    </form>
                </div>
                 <p className="text-center text-xs text-gray-400/80 mt-6 animate-fade-in" style={{ animationDelay: '500ms' }}>
                    نظام الحضور الذكي - الإصدار الحديث
                </p>
            </div>
        </div>
    );
};

export default Login;