import React, { useState, useEffect } from 'react';
import { Lecture } from '../types';

interface QRCodeDisplayProps {
    activeLecture: Lecture | null;
    onGenerateNew?: () => void;
    title?: string;
    isRamadanMode?: boolean;
}

const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ activeLecture, onGenerateNew, title = "الباركود النشط", isRamadanMode }) => {
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const isValid = activeLecture && timeLeft > 0;
    const isManual = activeLecture?.qrCode.startsWith('manual-'); // 👈 التحقق مما إذا كانت يدوية

    useEffect(() => {
        if (!activeLecture) {
            setTimeLeft(0);
            return;
        }

        const calculateTime = () => {
            const elapsed = Date.now() - new Date(activeLecture.createdAt).getTime();
            const remaining = (15 * 60 * 1000) - elapsed;
            setTimeLeft(remaining > 0 ? remaining : 0);
        };

        calculateTime();
        const timer = setInterval(calculateTime, 1000);
        return () => clearInterval(timer);
    }, [activeLecture]);

    const formatTime = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className={`backdrop-blur-2xl border p-6 sm:p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center text-center transition-all sticky top-24 ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/40 border-slate-800'}`}>
            <h2 className={`text-2xl font-black mb-6 ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>{title}</h2>
            
            {activeLecture ? (
                <div className="w-full">
                    {isManual ? (
                        <div className="flex flex-col items-center justify-center py-10 bg-slate-800/40 rounded-[2rem] border-2 border-dashed border-slate-700 mb-6">
                            <div className="p-4 bg-purple-500/10 rounded-full mb-4">
                                <svg className="w-12 h-12 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">محاضرة يدوية</h3>
                            <p className="text-sm text-gray-400 text-center px-4 leading-relaxed">
                                هذه المحاضرة مخصصة للتحضير اليدوي بالمناداة، ولا تتطلب مسح باركود أو تتبع للموقع.
                            </p>
                        </div>
                    ) : (
                        <div className={`p-4 rounded-[2rem] inline-block mb-6 shadow-xl transition-all ${isValid ? (isRamadanMode ? 'bg-yellow-500/10 shadow-yellow-500/20' : 'bg-white shadow-blue-500/20') : 'bg-slate-800 opacity-50 grayscale'}`}>
                            <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${activeLecture.qrCode}`} 
                                alt="QR Code" 
                                className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl"
                            />
                        </div>
                    )}
                    
                    <div className="space-y-2 mb-8">
                        <p className={`text-lg font-bold ${isRamadanMode ? 'ramadan-text-gold' : 'text-blue-400'}`}>{activeLecture.courseName}</p>
                        <p className="text-sm text-gray-400 font-medium">{activeLecture.date} | {activeLecture.timeSlot}</p>
                        {isValid && (
                            <p className="text-sm font-bold text-gray-300 mt-2 bg-slate-800/50 py-2 rounded-xl border border-slate-700/50">
                                الوقت المتبقي: <span className={isRamadanMode ? 'text-yellow-500' : 'text-blue-400 font-mono'}>{formatTime(timeLeft)}</span>
                            </p>
                        )}
                        {!isValid && <p className="text-sm font-bold text-red-500 mt-2 bg-red-500/10 py-2 rounded-xl border border-red-500/20">انتهى وقت التحضير</p>}
                    </div>
                </div>
            ) : (
                <div className="py-12 w-full bg-slate-800/30 rounded-[2rem] border-2 border-dashed border-slate-700 mb-6">
                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                    </div>
                    <p className="text-gray-400 font-medium">لا توجد محاضرة نشطة حالياً</p>
                </div>
            )}

            {onGenerateNew && (
                <button 
                    onClick={onGenerateNew}
                    className={`w-full py-4 text-white font-black rounded-2xl transition-all shadow-lg active:scale-95 ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/25'}`}
                >
                    + إنشاء محاضرة جديدة
                </button>
            )}
        </div>
    );
};

export default QRCodeDisplay;