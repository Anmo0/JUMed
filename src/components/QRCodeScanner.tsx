
import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRCodeScannerProps {
    onScanSuccess: (decodedText: string) => void;
    onClose: () => void;
    qrToMatch: string | null;
    isRamadanMode?: boolean;
}

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({ onScanSuccess, onClose, qrToMatch, isRamadanMode }) => {
    const [message, setMessage] = useState('جاري طلب الوصول للكاميرا...');
    const [isSuccess, setIsSuccess] = useState(false);
    const readerId = "qr-reader";

    useEffect(() => {
        if (!qrToMatch) {
            setMessage("لا يوجد باركود فعال للمسح.");
            return;
        }

        const html5QrCode = new Html5Qrcode(readerId);
        let isScanning = true;

        const qrCodeSuccessCallback = (decodedText: string, decodedResult: any) => {
            if (isScanning && decodedText === qrToMatch) {
                isScanning = false;
                setIsSuccess(true);
                setMessage('تم المسح بنجاح! جاري المعالجة...');
                
                // إضافة تأخير بسيط لإظهار حالة النجاح للمستخدم
                setTimeout(() => {
                    onScanSuccess(decodedText);
                }, 800);
            } else if (decodedText !== qrToMatch) {
                setMessage('عذراً، هذا الباركود غير مطابق للمحاضرة الحالية.');
            }
        };
        
        const qrCodeErrorCallback = (errorMessage: string) => {
            // تجاهل أخطاء البحث عن كود
        };

        const config = { 
            fps: 20, // زيادة عدد الإطارات لرصد أسرع
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                const qrboxSize = Math.floor(minEdge * 0.7);
                return { width: qrboxSize, height: qrboxSize };
            },
            aspectRatio: 1.0
        };

        // محاولة استخدام الكاميرا الخلفية بشكل مفضل
        html5QrCode.start(
            { facingMode: "environment" }, 
            config, 
            qrCodeSuccessCallback, 
            qrCodeErrorCallback
        )
        .then(() => {
            setMessage('وجه الكاميرا نحو الباركود داخل الإطار');
        })
        .catch((err: any) => {
            console.error("Camera error:", err);
            setMessage('تعذر تشغيل الكاميرا. تأكد من إعطاء الصلاحية.');
        });

        return () => {
            if (html5QrCode && html5QrCode.isScanning) {
                 html5QrCode.stop().catch(console.warn);
            }
        };
    }, [qrToMatch, onScanSuccess]);

    return (
        <div className="w-full max-w-md mx-auto p-2">
            <div className={`relative rounded-2xl overflow-hidden border-4 shadow-2xl bg-black aspect-square ${isRamadanMode ? 'border-yellow-500/30' : 'border-slate-700'}`}>
                <div id={readerId} className="w-full h-full"></div>
                
                {/* Overlay Scanning UI */}
                {!isSuccess && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                        <div className={`w-4/5 h-4/5 border-2 border-dashed rounded-xl relative ${isRamadanMode ? 'border-yellow-500/50' : 'border-blue-500/50'}`}>
                            {/* Animated Laser Line */}
                            <div className={`absolute top-0 left-0 w-full h-0.5 shadow-lg animate-[scan_2s_linear_infinite] ${isRamadanMode ? 'bg-yellow-500 shadow-yellow-500/80' : 'bg-blue-500 shadow-blue-500/80'}`}></div>
                            
                            {/* Corner Accents */}
                            <div className={`absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 rounded-tl-lg ${isRamadanMode ? 'border-yellow-500' : 'border-blue-500'}`}></div>
                            <div className={`absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 rounded-tr-lg ${isRamadanMode ? 'border-yellow-500' : 'border-blue-500'}`}></div>
                            <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 rounded-bl-lg ${isRamadanMode ? 'border-yellow-500' : 'border-blue-500'}`}></div>
                            <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 rounded-br-lg ${isRamadanMode ? 'border-yellow-500' : 'border-blue-500'}`}></div>
                        </div>
                    </div>
                )}

                {/* Success Overlay */}
                {isSuccess && (
                    <div className="absolute inset-0 bg-green-500/30 backdrop-blur-[2px] flex items-center justify-center animate-fade-in">
                        <div className="bg-white rounded-full p-4 animate-pop-in">
                            <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                    </div>
                )}
            </div>

            <div className={`mt-6 p-4 rounded-xl text-center transition-colors transform-gpu ${isSuccess ? 'bg-green-900/20 text-green-400' : (isRamadanMode ? 'bg-yellow-900/10 text-yellow-500' : 'bg-slate-800/50 text-gray-300')}`}>
                <p className="text-lg font-bold">{message}</p>
            </div>

            <button 
                onClick={onClose} 
                className={`mt-4 w-full font-bold py-3 px-6 rounded-xl transition-all transform-gpu active:scale-95 ${isRamadanMode ? 'bg-slate-800 text-gray-400 hover:bg-slate-700' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
            >
                إغلاق الكاميرا
            </button>

            <style>{`
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default QRCodeScanner;