import React, { useState, useEffect } from 'react';
import { Group, Student } from '../../types';
import Modal from '../Modal';
import { EditIcon, TrashIcon, CheckCircleIcon } from '../icons';
import { updateGroup, deleteAllGroups } from '../../services/api';

interface Props {
    groups: Group[];
    students: Student[];
    selectedBatchId: string | null;
    isRamadanMode: boolean;
    onAddGroupLocal: (name: string) => void;
    onUpdateGroupName: (id: string, name: string) => void;
    onDeleteAllGroupsLocal: () => void;
    onUpdateStudent: (id: string, data: Partial<Student>) => void;
    onChangeBatch: (id: string) => void;
    setActiveTab: (tab: any) => void;
}

const AdminGroupsTab: React.FC<Props> = ({ groups, students, selectedBatchId, isRamadanMode, onAddGroupLocal, onUpdateGroupName, onDeleteAllGroupsLocal, onUpdateStudent, onChangeBatch, setActiveTab }) => {
    const [isGroupModalOpen, setGroupModalOpen] = useState(false);
    const [isEditGroupModalOpen, setEditGroupModalOpen] = useState(false);
    const [isDeleteAllGroupsModalOpen, setDeleteAllGroupsModalOpen] = useState(false);
    const [groupToEdit, setGroupToEdit] = useState<Group | null>(null);
    const [groupName, setGroupName] = useState('');
    const [selectedGroupStudentIds, setSelectedGroupStudentIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300); return () => clearTimeout(timer); }, [searchQuery]);

    const handleAddGroup = (e: React.FormEvent) => {
        e.preventDefault();
        if (groupName.trim()) { onAddGroupLocal(groupName.trim()); setGroupModalOpen(false); setGroupName(''); }
    };

    const handleEditGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!groupToEdit) return;
        try {
            const { data, error } = await updateGroup(groupToEdit.id, groupName);
            if (error) return alert(error);
            const currentMemberIds = new Set(students.filter(s => s.groupId === groupToEdit.id).map(s => s.id));
            const toAdd = Array.from(selectedGroupStudentIds).filter(id => !currentMemberIds.has(id));
            const toRemove = Array.from(currentMemberIds).filter(id => !selectedGroupStudentIds.has(id));
            
            await Promise.all([
                ...toAdd.map(id => onUpdateStudent(id, { groupId: groupToEdit.id })),
                ...toRemove.map(id => onUpdateStudent(id, { groupId: '' }))
            ]);
            if (data) { onUpdateGroupName(data.id, data.name); setEditGroupModalOpen(false); setGroupName(''); }
        } catch { alert('خطأ في التحديث'); }
    };

    const handleConfirmDeleteAllGroups = async () => {
        const { error } = await deleteAllGroups();
        if (error) alert(error); else { onDeleteAllGroupsLocal(); alert('تم مسح جميع المجموعات.'); }
        setDeleteAllGroupsModalOpen(false);
    };

    if (!selectedBatchId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <svg className="w-16 h-16 text-gray-600 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                <p className="text-gray-400 font-medium">يرجى اختيار دفعة أولاً لعرض المجموعات.</p>
                <button onClick={() => setActiveTab('dashboard')} className="text-blue-400 hover:underline text-sm font-bold">الذهاب لاختيار الدفعة</button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h2 className={`text-xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>إدارة المجموعات</h2>
                <div className="flex gap-2">
                    <button onClick={() => setDeleteAllGroupsModalOpen(true)} className="px-4 py-2 bg-red-600/10 text-red-500 rounded-xl font-bold text-sm hover:bg-red-600 hover:text-white transition-all transform-gpu border border-red-500/20">حذف الجميع</button>
                    <button onClick={() => { setGroupName(''); setGroupModalOpen(true); }} className={`px-4 py-2 rounded-xl font-bold text-sm transition-all transform-gpu shadow-lg ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>مجموعة جديدة</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {groups.map((group) => {
                    const members = students.filter(s => s.groupId === group.id);
                    return (
                        <div key={group.id} className={`backdrop-blur-xl border p-6 rounded-[2rem] transition-all transform-gpu ${isRamadanMode ? 'ramadan-card' : 'bg-slate-800/40 border-slate-700/50'}`}>
                            <div className="flex justify-between items-start mb-4">
                                <h3 className={`text-xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>{group.name}</h3>
                                <div className="flex gap-2">
                                    <span className="px-3 py-1 text-xs font-bold rounded-full bg-blue-500/10 text-blue-400">{members.length} طلاب</span>
                                    <button onClick={() => { setGroupToEdit(group); setGroupName(group.name); setSelectedGroupStudentIds(new Set(members.map(s => s.id))); setEditGroupModalOpen(true); }} className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg"><EditIcon className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <div className="mt-4 flex -space-x-2 rtl:space-x-reverse">
                                {members.slice(0, 5).map(m => <div key={m.id} className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white border-2 border-slate-900">{m.name[0]}</div>)}
                                {members.length > 5 && <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-gray-400 border-2 border-slate-900">+{members.length - 5}</div>}
                            </div>
                        </div>
                    );
                })}
            </div>

            <Modal isOpen={isGroupModalOpen} onClose={() => setGroupModalOpen(false)} title="مجموعة جديدة" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleAddGroup} className="space-y-4">
                    <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} required className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:outline-none" placeholder="اسم المجموعة"/>
                    <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-2xl">إضافة</button>
                </form>
            </Modal>

            <Modal isOpen={isEditGroupModalOpen} onClose={() => setEditGroupModalOpen(false)} title="تعديل المجموعة" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleEditGroup} className="space-y-4">
                    <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} required className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:outline-none"/>
                    <div className="mt-6">
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-4 py-2 border-2 rounded-xl bg-slate-800 border-slate-700 text-white mb-3" placeholder="بحث..."/>
                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {students.filter(s => s.name.includes(debouncedSearch) || s.universityId.includes(debouncedSearch)).map(student => {
                                const isSelected = selectedGroupStudentIds.has(student.id);
                                return (
                                    <div key={student.id} onClick={() => { const next = new Set(selectedGroupStudentIds); isSelected ? next.delete(student.id) : next.add(student.id); setSelectedGroupStudentIds(next); }} className={`flex justify-between p-3 rounded-xl cursor-pointer border ${isSelected ? 'bg-blue-600/20 border-blue-500/50' : 'bg-slate-800/40 border-slate-700'}`}>
                                        <span className="text-sm font-bold text-white">{student.name}</span>
                                        {isSelected && <CheckCircleIcon className="w-5 h-5 text-blue-400" />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-2xl">حفظ التعديلات</button>
                </form>
            </Modal>
            
            <Modal isOpen={isDeleteAllGroupsModalOpen} onClose={() => setDeleteAllGroupsModalOpen(false)} title="حذف جميع المجموعات" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <TrashIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                    <p className="text-white font-bold">متأكد من مسح جميع المجموعات؟</p>
                    <button onClick={handleConfirmDeleteAllGroups} className="mt-6 w-full py-3 bg-red-600 rounded-2xl text-white font-bold">تأكيد الحذف</button>
                </div>
            </Modal>
        </div>
    );
};
export default AdminGroupsTab;