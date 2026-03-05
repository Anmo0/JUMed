import React, { useState, useMemo } from 'react';
import { Batch } from '../../types';
import Modal from '../Modal';
import { AlertTriangleIcon, TrashIcon } from '../icons';
import { promoteBatches, getBatches, createBatches, saveBatches, deleteBatchData } from '../../services/api';

interface AdminBatchesTabProps {
    batches: Batch[];
    setBatches: React.Dispatch<React.SetStateAction<Batch[]>>;
    selectedBatchId: string | null;
    onChangeBatch: (batchId: string) => void;
    onRefreshStudents: () => Promise<void>;
    isRamadanMode: boolean;
    setActiveTab: (tab: any) => void;
}

const AdminBatchesTab: React.FC<AdminBatchesTabProps> = ({
    batches, setBatches, selectedBatchId, onChangeBatch, onRefreshStudents, isRamadanMode, setActiveTab
}) => {
    const [isPromoteModalOpen, setPromoteModalOpen] = useState(false);
    const [isPromoting, setIsPromoting] = useState(false);
    const [showUndoPromotion, setShowUndoPromotion] = useState(false);
    
    const [isAddBatchModalOpen, setAddBatchModalOpen] = useState(false);
    const [newBatchName, setNewBatchName] = useState('');
    const [newBatchYear, setNewBatchYear] = useState<number>(2);
    
    const [groupActionTarget, setGroupActionTarget] = useState<{ name: string, year: number, isArchived: boolean, male?: Batch, female?: Batch } | null>(null);
    const [isArchiveBatchModalOpen, setArchiveBatchModalOpen] = useState(false);
    const [isDeleteBatchModalOpen, setDeleteBatchModalOpen] = useState(false);

    // تجميع الدفعات لعرضها بشكل منظم
    const groupedBatches = useMemo(() => {
        const groupsMap = new Map<string, { name: string, year: number, isArchived: boolean, male?: Batch, female?: Batch }>();

        batches.forEach(b => {
            const baseName = b.batchName.replace(' - طلاب', '').replace(' - طالبات', '').trim();
            const isMale = b.batchName.includes('طلاب');
            const isFemale = b.batchName.includes('طالبات');

            if (!groupsMap.has(baseName)) {
                groupsMap.set(baseName, { name: baseName, year: b.currentYear, isArchived: b.isArchived });
            }

            const group = groupsMap.get(baseName)!;
            if (isMale) group.male = b;
            if (isFemale) group.female = b;
            if (b.isArchived) group.isArchived = true; 
        });

        return Array.from(groupsMap.values()).sort((a, b) => a.year - b.year);
    }, [batches]);

    const handlePromoteBatches = async () => {
        setIsPromoting(true);
        try {
            const result = await promoteBatches();
            if (result.error) {
                alert(`فشل الترقية: ${result.error}`);
            } else {
                const updatedBatches = await getBatches();
                setBatches(updatedBatches);
                setPromoteModalOpen(false);
                setShowUndoPromotion(true);
                setTimeout(() => setShowUndoPromotion(false), 10000);
                alert('تم ترقية الدفعات بنجاح!');
            }
        } catch (error) {
            console.error(error);
            alert('حدث خطأ غير متوقع');
        } finally {
            setIsPromoting(false);
        }
    };

    const handleUndoPromotion = async () => {
        alert('التراجع غير مدعوم حالياً بشكل كامل.');
    };

    const handleAddBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBatchName.trim()) return;
        
        const maleBatch = { batchName: `${newBatchName.trim()} - طلاب`, currentYear: newBatchYear };
        const femaleBatch = { batchName: `${newBatchName.trim()} - طالبات`, currentYear: newBatchYear };
        
        try {
            const result = await createBatches([maleBatch, femaleBatch]);
            if (result.error || !result.data) {
                alert(`فشل إنشاء الدفعة: ${result.error}`);
            } else {
                setBatches([...batches, ...result.data]);
                setAddBatchModalOpen(false);
                setNewBatchName('');
                setNewBatchYear(2);
            }
        } catch (error) {
            alert('حدث خطأ غير متوقع أثناء إضافة السنة الدراسية');
            console.error(error);
        }
    };

    const handleConfirmArchiveBatch = async () => {
        if (!groupActionTarget) return;
        const updates = [];
        if (groupActionTarget.male) updates.push({ ...groupActionTarget.male, isArchived: !groupActionTarget.isArchived });
        if (groupActionTarget.female) updates.push({ ...groupActionTarget.female, isArchived: !groupActionTarget.isArchived });
        
        try {
            await saveBatches(updates);
            setBatches(prev => prev.map(b => updates.find(u => u.id === b.id) || b));
            setArchiveBatchModalOpen(false);
            setGroupActionTarget(null);
        } catch (error) {
            alert('حدث خطأ أثناء تحديث حالة السنة الدراسية');
        }
    };

    const handleConfirmDeleteBatch = async () => {
        if (!groupActionTarget) return;
        try {
            if (groupActionTarget.male) await deleteBatchData(groupActionTarget.male.id);
            if (groupActionTarget.female) await deleteBatchData(groupActionTarget.female.id);
            
            setBatches(prev => prev.filter(b => b.id !== groupActionTarget.male?.id && b.id !== groupActionTarget.female?.id));
            await onRefreshStudents();
            setDeleteBatchModalOpen(false);
            setGroupActionTarget(null);
            alert('تم حذف الدفعة بشطريها بنجاح');
        } catch (error) {
             alert('حدث خطأ أثناء حذف بيانات الدفعة');
        }
    };

    return (
        <>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6 sm:mb-8">
                <h2 className={`text-xl sm:text-2xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>إدارة السنوات الدراسية (الدفعات)</h2>
                <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
                    {showUndoPromotion && (
                        <button onClick={handleUndoPromotion} className="flex-1 sm:flex-none font-bold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu shadow-lg text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white animate-pulse">تراجع عن الترقية</button>
                    )}
                    <button onClick={() => setPromoteModalOpen(true)} className={`flex-1 sm:flex-none font-bold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu shadow-lg text-xs sm:text-sm ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}>ترقية الدفعات</button>
                    <button onClick={() => setAddBatchModalOpen(true)} className={`flex-1 sm:flex-none font-bold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu shadow-lg text-xs sm:text-sm ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>إضافة سنة دراسية جديدة</button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {groupedBatches.map((group) => (
                    <div key={group.name} className={`backdrop-blur-xl border p-6 rounded-[2rem] transition-all duration-300 transform-gpu ${isRamadanMode ? 'ramadan-card hover:border-yellow-500/40' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'} ${group.isArchived ? 'opacity-60 grayscale' : ''}`}>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className={`text-2xl font-black mb-1 ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>
                                    {group.name}
                                </h3>
                                <span className="text-sm text-gray-400 font-bold bg-slate-900/50 px-3 py-1 rounded-lg">السنة الدراسية: {group.year}</span>
                                {group.isArchived && <span className="mr-2 text-xs bg-gray-500/20 text-gray-400 px-2 py-1 rounded-full border border-gray-500/20">مؤرشفة</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => { setGroupActionTarget(group); setArchiveBatchModalOpen(true); }} className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all transform-gpu ${group.isArchived ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' : 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'}`}>
                                    {group.isArchived ? 'استعادة' : 'أرشفة'}
                                </button>
                                <button onClick={() => { setGroupActionTarget(group); setDeleteBatchModalOpen(true); }} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-all transform-gpu bg-red-500/10 text-red-500 hover:bg-red-500/20">
                                    حذف
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {group.male && (
                                <button 
                                    onClick={() => { onChangeBatch(group.male!.id); setActiveTab('attendance'); }}
                                    className="flex flex-col items-center justify-center p-4 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 rounded-2xl transition-all transform-gpu group/btn"
                                >
                                    <span className="text-blue-400 font-black text-lg mb-1">شعبة الطلاب</span>
                                    <span className="text-gray-400 text-xs font-bold bg-slate-900/50 px-3 py-1 rounded-full">{group.male.studentCount || 0} طالب</span>
                                </button>
                            )}
                            {group.female && (
                                <button 
                                    onClick={() => { onChangeBatch(group.female!.id); setActiveTab('attendance'); }}
                                    className="flex flex-col items-center justify-center p-4 bg-pink-500/10 border border-pink-500/20 hover:bg-pink-500/20 rounded-2xl transition-all transform-gpu group/btn"
                                >
                                    <span className="text-pink-400 font-black text-lg mb-1">شعبة الطالبات</span>
                                    <span className="text-gray-400 text-xs font-bold bg-slate-900/50 px-3 py-1 rounded-full">{group.female.studentCount || 0} طالبة</span>
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* النوافذ المنبثقة الخاصة بالدفعات */}
            <Modal isOpen={isPromoteModalOpen} onClose={() => !isPromoting && setPromoteModalOpen(false)} title="تأكيد ترقية الدفعات" isRamadanMode={isRamadanMode}>
                <div className="space-y-6 text-center">
                    <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white mb-2">هل أنت متأكد من ترقية جميع الدفعات؟</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            سيتم نقل جميع الطلاب إلى السنة الدراسية التالية.<br/>
                            الدفعة السادسة سيتم أرشفتها.<br/>
                            سيتم إنشاء دفعة جديدة للسنة الثانية.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setPromoteModalOpen(false)} disabled={isPromoting} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all transform-gpu disabled:opacity-50">إلغاء</button>
                        <button onClick={handlePromoteBatches} disabled={isPromoting} className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-all transform-gpu shadow-lg shadow-purple-600/20 disabled:opacity-50">
                            {isPromoting ? 'جاري الترقية...' : 'تأكيد الترقية'}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isAddBatchModalOpen} onClose={() => setAddBatchModalOpen(false)} title="إضافة سنة دراسية جديدة" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleAddBatch} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">اسم الدفعة (مثال: Med 25)</label>
                        <input 
                            type="text" 
                            value={newBatchName} 
                            onChange={(e) => setNewBatchName(e.target.value)} 
                            required 
                            className={`w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:outline-none ${isRamadanMode ? 'focus:border-yellow-500' : 'focus:border-blue-500'}`} 
                            placeholder="مثال: Med 25"
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">المستوى الدراسي (السنة)</label>
                        <select 
                            value={newBatchYear} 
                            onChange={(e) => setNewBatchYear(Number(e.target.value))} 
                            className={`w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:outline-none ${isRamadanMode ? 'focus:border-yellow-500' : 'focus:border-blue-500'}`}
                        >
                            <option value={2}>السنة الثانية</option>
                            <option value={3}>السنة الثالثة</option>
                            <option value={4}>السنة الرابعة</option>
                            <option value={5}>السنة الخامسة</option>
                            <option value={6}>السنة السادسة</option>
                        </select>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl mt-2">
                        <p className="text-xs text-blue-400 leading-relaxed font-bold">
                            💡 لتسهيل فرز واستيراد الطلاب، سيقوم النظام تلقائياً بإنشاء شطرين منفصلين لهذه الدفعة (شطر طلاب، وشطر طالبات).
                        </p>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setAddBatchModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all transform-gpu">إلغاء</button>
                        <button type="submit" className={`flex-1 px-6 py-3 font-bold rounded-2xl transition-all transform-gpu shadow-lg ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'}`}>إضافة الدفعة</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isArchiveBatchModalOpen} onClose={() => setArchiveBatchModalOpen(false)} title={groupActionTarget?.isArchived ? "استعادة السنة الدراسية" : "أرشفة السنة الدراسية"} isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <AlertTriangleIcon className={`mx-auto h-16 w-16 mb-4 ${groupActionTarget?.isArchived ? 'text-green-500' : 'text-yellow-500'}`} />
                    <p className="text-gray-300 font-bold">
                        {groupActionTarget?.isArchived 
                            ? `هل أنت متأكد من استعادة السنة الدراسية "${groupActionTarget?.name}" بشطريها؟` 
                            : `هل أنت متأكد من أرشفة السنة الدراسية "${groupActionTarget?.name}" بشطريها؟`}
                    </p>
                    <p className="text-gray-400 text-xs mt-2">
                        {groupActionTarget?.isArchived 
                            ? "ستظهر هذه السنة الدراسية في قائمة الاختيار مرة أخرى." 
                            : "لن تظهر هذه السنة الدراسية في قائمة الاختيار بعد الآن، ولكن سيتم الاحتفاظ ببياناتها."}
                    </p>
                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setArchiveBatchModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">إلغاء</button>
                        <button onClick={handleConfirmArchiveBatch} className={`flex-1 py-3 rounded-2xl text-white font-bold transition-all transform-gpu ${groupActionTarget?.isArchived ? 'bg-green-600' : 'bg-yellow-600'}`}>
                            {groupActionTarget?.isArchived ? 'تأكيد الاستعادة' : 'تأكيد الأرشفة'}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteBatchModalOpen} onClose={() => setDeleteBatchModalOpen(false)} title="حذف الدفعة" isRamadanMode={isRamadanMode}>
                <div className="space-y-4 p-2">
                    <div className="text-center mb-6">
                        <TrashIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                        <p className="text-gray-300 font-bold text-lg">
                            حذف الدفعة "{groupActionTarget?.name}" بشطريها
                        </p>
                        <p className="text-red-400 text-xs mt-2">
                            تحذير: سيتم حذف جميع الطلاب، المجموعات، والمحاضرات المرتبطة بهذه الدفعة نهائياً.
                        </p>
                    </div>

                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setDeleteBatchModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">إلغاء</button>
                        <button onClick={handleConfirmDeleteBatch} className="flex-1 py-3 bg-red-600 hover:bg-red-700 rounded-2xl text-white font-bold transition-all transform-gpu">
                            تأكيد الحذف النهائي
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default AdminBatchesTab;