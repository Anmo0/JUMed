import React from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    isRamadanMode?: boolean;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, isRamadanMode }) => {
    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center sm:p-4 transition-opacity transform-gpu" 
            onClick={onClose}
        >
            <div 
                className={`backdrop-blur-2xl border shadow-2xl w-full max-w-md transform transform-gpu transition-all duration-500 
                max-sm:fixed max-sm:bottom-0 max-sm:m-0 max-sm:rounded-t-3xl max-sm:rounded-b-none max-sm:border-b-0
                sm:rounded-2xl sm:m-4
                ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/90 border-slate-800/50'}`} 
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'modal-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' }}
            >
                <div className={`flex justify-between items-center border-b p-4 sm:p-5 transition-colors transform-gpu ${isRamadanMode ? 'border-yellow-500/20' : 'border-slate-800/80'}`}>
                    <h3 className={`text-lg font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>{title}</h3>
                    <button onClick={onClose} className={`rounded-full p-1 transition-colors transform-gpu ${isRamadanMode ? 'text-yellow-500/60 hover:text-yellow-500' : 'text-gray-400 hover:text-gray-200'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="p-4 sm:p-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;