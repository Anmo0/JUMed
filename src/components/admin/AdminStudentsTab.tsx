import React, { useState, useMemo } from 'react';
import { Student, Group, Batch } from '../../types';
import Modal from '../Modal';
import { EditIcon, TrashIcon, UnplugIcon, ClipboardListIcon, UsersIcon, AlertTriangleIcon, CheckCircleIcon } from '../icons';
import { deleteStudents, importStudents } from '../../services/api';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface Props {
    students: Student[];
    groups: Group[];
    currentBatch?: Batch;
    selectedBatchId: string | null;
    isRamadanMode: boolean;
    absencePercentageEnabled: boolean;
    deviceBindingEnabled: boolean;
    locationRestrictionEnabled: boolean;
    onAddStudent: (s: Omit<Student, 'id'>) => void;
    onUpdateStudent: (id: string, updates: Partial<Student>) => void;
    onDeleteStudent: (id: string) => void;
    onToggleAbsencePercentage: (e: boolean) => void;
    onToggleDeviceBinding: (e: boolean) => void;
    onToggleLocationRestriction: (e: boolean) => void;
    onResetStudentDevice: (id: string) => void;
    onResetAllDevices: () => void;
    onRecalculateSerials: () => void;
    onRefreshStudents: () => Promise<void>;
    setActiveTab: (tab: any) => void;
}

const AdminStudentsTab: React.FC<Props> = (props) => {
    const { students, groups, currentBatch, selectedBatchId, isRamadanMode, absencePercentageEnabled, deviceBindingEnabled, locationRestrictionEnabled, setActiveTab } = props;
    
    const [isStudentModalOpen, setStudentModalOpen] = useState(false);
    const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
    const [formState, setFormState] = useState({ name: '', universityId: '', serialNumber: '', isBatchLeader: false, isLeader: false, groupId: '', batchId: selectedBatchId });
    const [isResetAllModalOpen, setResetAllModalOpen] = useState(false);
    const [isDeleteStudentsModalOpen, setDeleteStudentsModalOpen] = useState(false);
    const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
    const [isImportModalOpen, setImportModalOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ imported: number, errors: string[] } | null>(null);

    const sortedStudents = useMemo(() => [...students].sort((a, b) => Number(a.serialNumber) - Number(b.serialNumber)), [students]);

    if (!selectedBatchId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <UsersIcon className="w-16 h-16 text-gray-600 opacity-20" />
                <p className="text-gray-400 font-medium">يرجى اختيار دفعة أولاً لعرض قائمة الطلاب.</p>
                <button onClick={() => setActiveTab('dashboard')} className="text-blue-400 hover:underline text-sm font-bold">الذهاب لاختيار الدفعة</button>
            </div>
        );
    }

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const payload = { ...formState, batchId: formState.batchId || selectedBatchId! };
        currentStudent ? props.onUpdateStudent(currentStudent.id, payload) : props.onAddStudent(payload);
        setStudentModalOpen(false);
    };

    const handleImportStudents = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importFile || !selectedBatchId) return;
        setIsImporting(true);
        try {
            let parsed: any[] = [];
            if (importFile.name.endsWith('.csv')) {
                const text = await importFile.text();
                parsed = await new Promise((resolve) => Papa.parse(text, { header: true, complete: (res) => resolve(res.data) }));
            } else {
                const workbook = XLSX.read(await importFile.arrayBuffer());
                parsed = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            }
            const cleanStudents = parsed.map(r => ({ name: r['الاسم'] || r['name'] || '', universityId: String(r['الرقم الجامعي'] || r['university_id'] || '').trim() })).filter(s => s.name && s.universityId);
            const result = await importStudents(selectedBatchId, cleanStudents);
            if (!result.error && result.data) { setImportResult(result.data); if (result.data.imported > 0) props.onRefreshStudents(); }
            else alert(result.error);
        } catch { alert('خطأ في قراءة الملف.'); }
        setIsImporting(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h2 className={`text-xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>إدارة الطلاب</h2>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => props.onToggleAbsencePercentage(!absencePercentageEnabled)} className={`px-3 py-2 text-xs font-bold rounded-xl border ${absencePercentageEnabled ? 'bg-blue-600/10 border-blue-500/30 text-blue-500' : 'bg-slate-800 text-gray-400'}`}>نسبة الغياب: {absencePercentageEnabled ? 'مفعلة' : 'معطلة'}</button>
                    <button onClick={() => props.onToggleDeviceBinding(!deviceBindingEnabled)} className={`px-3 py-2 text-xs font-bold rounded-xl border ${deviceBindingEnabled ? 'bg-green-600/10 border-green-500/30 text-green-500' : 'bg-slate-800 text-gray-400'}`}>ربط الأجهزة: {deviceBindingEnabled ? 'مفعل' : 'معطل'}</button>
                    <button onClick={() => props.onToggleLocationRestriction(!locationRestrictionEnabled)} className={`px-3 py-2 text-xs font-bold rounded-xl border ${locationRestrictionEnabled ? 'bg-red-600/10 border-red-500/30 text-red-500' : 'bg-slate-800 text-gray-400'}`}>الموقع: {locationRestrictionEnabled ? 'مفعل' : 'معطل'}</button>
                    <button onClick={() => setResetAllModalOpen(true)} className="p-2 bg-red-600/10 text-red-500 rounded-xl"><UnplugIcon className="w-5 h-5"/></button>
                    <button onClick={props.onRecalculateSerials} className="p-2 bg-indigo-600/10 text-indigo-500 rounded-xl"><ClipboardListIcon className="w-5 h-5"/></button>
                    <button onClick={() => setDeleteStudentsModalOpen(true)} className="px-4 py-2 bg-red-600/20 text-red-500 rounded-xl font-bold text-xs">حذف الطلاب</button>
                    <button onClick={() => setImportModalOpen(true)} className="px-4 py-2 bg-green-600/20 text-green-500 rounded-xl font-bold text-xs">استيراد</button>
                    <button onClick={() => { setCurrentStudent(null); setFormState({ name: '', universityId: '', serialNumber: '', isBatchLeader: false, isLeader: false, groupId: '', batchId: selectedBatchId }); setStudentModalOpen(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs">إضافة طالب</button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-800 hidden sm:block">
                <table className="w-full text-sm text-right">
                    <thead className="bg-slate-800/80 text-gray-300">
                        <tr><th className="px-6 py-4">الطالب</th><th className="px-6 py-4">الرقم</th><th className="px-6 py-4">المجموعة</th><th className="px-6 py-4">الجهاز</th><th className="px-6 py-4 text-center">أدوات</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {sortedStudents.map(s => (
                            <tr key={s.id} className="hover:bg-slate-800/40">
                                <td className="px-6 py-4 font-bold text-white">{s.name} {s.isBatchLeader && <span className="text-[10px] text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded-full mr-2">ليدر</span>}</td>
                                <td className="px-6 py-4 text-gray-400 font-mono">{s.universityId}</td>
                                <td className="px-6 py-4 text-gray-400">{s.groupName || '-'}</td>
                                <td className="px-6 py-4">{s.deviceInfo ? <span className="text-[10px] text-green-500 bg-green-500/10 px-2 py-1 rounded-full">مرتبط</span> : <span className="text-[10px] text-gray-500 bg-slate-800 px-2 py-1 rounded-full">متاح</span>}</td>
                                <td className="px-6 py-4 flex justify-center gap-2">
                                    <button onClick={() => { setCurrentStudent(s); setFormState({ name: s.name, universityId: s.universityId, serialNumber: s.serialNumber, isBatchLeader: s.isBatchLeader, isLeader: s.isLeader, groupId: s.groupId || '', batchId: s.batchId }); setStudentModalOpen(true); }} className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg"><EditIcon className="w-4 h-4"/></button>
                                    <button onClick={() => props.onResetStudentDevice(s.id)} disabled={!s.deviceInfo} className="p-2 text-orange-400 disabled:opacity-30"><UnplugIcon className="w-4 h-4"/></button>
                                    <button onClick={() => setStudentToDelete(s)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><TrashIcon className="w-4 h-4"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modals: Import, Edit, Delete, etc. */}
            <Modal isOpen={isImportModalOpen} onClose={() => { setImportModalOpen(false); setImportResult(null); }} title="استيراد طلاب" isRamadanMode={isRamadanMode}>
                {!importResult ? (
                    <form onSubmit={handleImportStudents} className="space-y-4">
                        <input type="file" accept=".csv, .xlsx" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="w-full p-2 text-white bg-slate-800 rounded-xl"/>
                        <button type="submit" disabled={isImporting || !importFile} className="w-full py-3 bg-blue-600 text-white rounded-xl">{isImporting ? 'جاري الاستيراد...' : 'بدء الاستيراد'}</button>
                    </form>
                ) : (
                    <div className="text-center p-4">
                        <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-2" />
                        <p className="text-green-400 font-bold mb-4">تم استيراد {importResult.imported} طالب</p>
                        <button onClick={() => setImportModalOpen(false)} className="w-full py-3 bg-slate-800 text-white rounded-xl">إغلاق</button>
                    </div>
                )}
            </Modal>
            
            <Modal isOpen={isStudentModalOpen} onClose={() => setStudentModalOpen(false)} title="بيانات الطالب" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <input type="text" value={formState.name} onChange={e => setFormState(p => ({...p, name: e.target.value}))} className="w-full p-3 bg-slate-800 text-white rounded-xl" placeholder="الاسم" required/>
                    <input type="text" value={formState.universityId} onChange={e => setFormState(p => ({...p, universityId: e.target.value}))} className="w-full p-3 bg-slate-800 text-white rounded-xl" placeholder="الرقم الجامعي" required/>
                    <select value={formState.groupId} onChange={e => setFormState(p => ({...p, groupId: e.target.value}))} className="w-full p-3 bg-slate-800 text-white rounded-xl">
                        <option value="">بدون مجموعة</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl">حفظ</button>
                </form>
            </Modal>

            {studentToDelete && (
                <Modal isOpen={true} onClose={() => setStudentToDelete(null)} title="حذف طالب" isRamadanMode={isRamadanMode}>
                    <div className="text-center p-4">
                        <TrashIcon className="w-12 h-12 text-red-500 mx-auto mb-2" />
                        <p className="text-white font-bold mb-4">حذف "{studentToDelete.name}"؟</p>
                        <button onClick={() => { props.onDeleteStudent(studentToDelete.id); setStudentToDelete(null); }} className="w-full py-3 bg-red-600 text-white rounded-xl">تأكيد الحذف</button>
                    </div>
                </Modal>
            )}
            
            <Modal isOpen={isResetAllModalOpen} onClose={() => setResetAllModalOpen(false)} title="تنبيه" isRamadanMode={isRamadanMode}>
                 <div className="text-center p-4">
                     <p className="text-white mb-4">متأكد من إلغاء ربط أجهزة الجميع؟</p>
                     <button onClick={() => { props.onResetAllDevices(); setResetAllModalOpen(false); }} className="w-full py-3 bg-red-600 text-white rounded-xl">نعم</button>
                 </div>
            </Modal>
        </div>
    );
};
export default AdminStudentsTab;