
import React, { useEffect, useState } from 'react';
import { Lecture } from '../types';
import { QrCodeIcon } from './icons';

// Add QRCode to the window object for TypeScript
declare global {
    interface Window {
        QRCode: {
            toDataURL: (text: string, options: any, callback: (err: any, url: string) => void) => void;
        };
    }
}


interface QRCodeDisplayProps {
    activeLecture: Lecture | null;
    onGenerateNew?: () => void;
    title?: string;
    isRamadanMode?: boolean;
}

const QR_CODE_VALIDITY_MS = 15 * 60 * 1000; // 15 minutes in ms

const formatTime = (ms: number) => {
    if (ms < 0) ms = 0;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ activeLecture, onGenerateNew, title, isRamadanMode }) => {
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

    // Effect to generate QR code data URL locally
    useEffect(() => {
        if (activeLecture?.qrCode) {
            window.QRCode.toDataURL(
                activeLecture.qrCode,
                {
                    errorCorrectionLevel: 'H',
                    margin: 1,
                    width: 184,
                    color: { dark: '#000000FF', light: '#FFFFFFFF' }
                },
                (err: any, url: string) => {
                    if (err) {
                        console.error('QR Code generation failed:', err);
                        setQrCodeDataUrl(null);
                    } else {
                        setQrCodeDataUrl(url);
                    }
                }
            );
        } else {
            setQrCodeDataUrl(null); // Clear QR if no active lecture
        }
    }, [activeLecture?.qrCode]);


    // Effect for timer logic, runs every second
    useEffect(() => {
        if (!activeLecture?.createdAt) {
            setTimeLeft(null);
            return;
        }

        const calculateTimeLeft = () => {
            const elapsedTime = Date.now() - new Date(activeLecture.createdAt).getTime();
            const remaining = QR_CODE_VALIDITY_MS - elapsedTime;
            setTimeLeft(Math.max(0, remaining));
        };

        calculateTimeLeft();
        const intervalId = setInterval(calculateTimeLeft, 1000);

        return () => clearInterval(intervalId);
    }, [activeLecture]);

    const isExpired = timeLeft !== null && timeLeft <= 0;
    const timePercentage = timeLeft !== null ? Math.max(0, (timeLeft / QR_CODE_VALIDITY_MS) * 100) : 0;
    const circumference = 2 * Math.PI * 55; // Radius of 55
    const strokeDashoffset = circumference - (circumference * timePercentage) / 100;

    const ActiveLectureCard = () => (
        <>
            <div className="relative w-64 h-64 mb-6">
                <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                    <circle
                        className="text-slate-700"
                        strokeWidth="10" stroke="currentColor" fill="transparent"
                        r="55" cx="60" cy="60"
                    />
                    <circle
                        className={`transition-colors duration-500 ${isExpired ? 'text-red-500' : (isRamadanMode ? 'text-yellow-500' : 'text-blue-500')}`}
                        strokeWidth="10" strokeLinecap="round" stroke="currentColor" fill="transparent"
                        r="55" cx="60" cy="60"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center p-4">
                     <div className="p-2 bg-white rounded-md shadow-inner">
                        {qrCodeDataUrl ? (
                             <img
                                src={qrCodeDataUrl}
                                alt="QR Code"
                                width="184"
                                height="184"
                            />
                        ) : (
                             <div className="w-[184px] h-[184px] flex items-center justify-center bg-gray-100 rounded-sm">
                                <span className="text-xs text-gray-500">جاري الإنشاء...</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="text-center w-full px-2">
                <h3 className={`text-xl font-bold truncate ${isRamadanMode ? 'ramadan-text-gold' : 'text-gray-100'}`}>{activeLecture!.courseName}</h3>
                <p className="text-sm text-gray-300">{activeLecture!.date} | {activeLecture!.timeSlot}</p>
                <div className={`mt-4 font-mono text-5xl font-bold transition-colors duration-500 ${isExpired ? 'text-red-500' : (isRamadanMode ? 'text-yellow-500' : 'text-gray-200')}`}>
                    {timeLeft !== null ? formatTime(timeLeft) : '00:00'}
                </div>
                 {isExpired && <p className="text-red-500 font-semibold mt-2">انتهت صلاحية الباركود</p>}
            </div>
            {onGenerateNew && (
                <button 
                    onClick={onGenerateNew} 
                    className={`mt-8 w-full font-semibold px-4 py-3 rounded-lg transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 transform hover:-translate-y-0.5 ${isRamadanMode ? 'ramadan-btn-gold focus:ring-yellow-500' : 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'}`}
                >
                    إنشاء باركود جديد
                </button>
            )}
        </>
    );

    const NoLectureCard = () => (
         <div className="flex flex-col items-center justify-center text-center text-gray-400 p-4 sm:p-8 min-h-[300px] sm:min-h-[500px]">
            <QrCodeIcon className="w-24 h-24 sm:w-32 sm:h-32 mx-auto text-slate-700 mb-4" />
            <h3 className="text-lg sm:text-xl font-semibold text-gray-300">لا يوجد باركود فعال</h3>
            {onGenerateNew ? (
                <>
                    <p className="mt-1 text-xs sm:text-sm max-w-xs">
                        اضغط على الزر أدناه لإنشاء باركود جديد للمحاضرة الحالية.
                    </p>
                    <button 
                        onClick={onGenerateNew} 
                        className={`mt-6 sm:mt-8 w-full font-bold px-4 py-3 rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all animate-pulse-glow text-sm sm:text-base ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'}`}
                    >
                        إنشاء باركود للمحاضرة
                    </button>
                </>
            ) : (
                <p className="mt-1 text-xs sm:text-sm max-w-xs text-gray-500">
                   انتظر حتى يقوم المدير بإنشاء باركود جديد.
                </p>
            )}
        </div>
    );

    return (
        <div className={`backdrop-blur-2xl border rounded-2xl shadow-lg p-4 sm:p-6 h-fit sticky top-20 sm:top-24 flex flex-col items-center animate-slide-in-up transition-all duration-500 ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/85 border-slate-800/50'}`} style={{ animationDelay: '200ms' }}>
            {title && <h2 className={`font-bold text-base sm:text-lg mb-4 w-full text-center border-b pb-2 transition-colors ${isRamadanMode ? 'ramadan-text-gold border-yellow-500/20' : 'text-white border-slate-700'}`}>{title}</h2>}
            <div key={activeLecture ? activeLecture.qrCode : 'no-lecture'} className="w-full flex flex-col items-center animate-pop-in">
                 {activeLecture && !isExpired ? <ActiveLectureCard /> : <NoLectureCard />}
            </div>
        </div>
    );
};

export default QRCodeDisplay;