import React, { useMemo } from 'react';
import { Batch, Student, Lecture, Course, AttendanceRecord } from '../../types';
import { UsersIcon, ClipboardListIcon, AlertTriangleIcon } from '../icons';

interface Props {
    batches: Batch[];
    students: Student[];
    lectures: Lecture[];
    courses: Course[];
    attendanceRecords: AttendanceRecord[];
    selectedBatchId: string | null;
    onChangeBatch: (id: string) => void;
    setActiveTab: (tab: any) => void;
    isRamadanMode: boolean;
}

const AdminOverviewTab: React.FC<Props> = ({ batches, students, lectures, courses, attendanceRecords, selectedBatchId, onChangeBatch, setActiveTab, isRamadanMode }) => {
    const groupedBatches = useMemo(() => {
        const groupsMap = new Map<string, { name: string, year: number, isArchived: boolean, male?: Batch, female?: Batch }>();
        batches.forEach(b => {
            const baseName = b.batchName.replace(' - طلاب', '').replace(' - طالبات', '').trim();
            if (!groupsMap.has(baseName)) groupsMap.set(baseName, { name: baseName, year: b.currentYear, isArchived: b.isArchived });
            const group = groupsMap.get(baseName)!;
            if (b.batchName.includes('طلاب')) group.male = b;
            if (b.batchName.includes('طالبات')) group.female = b;
        });
        return Array.from(groupsMap.values()).sort((a, b) => a.year - b.year);
    }, [batches]);

    const batchStats = useMemo(() => {
        let totalAbsenceRate = 0;
        const studentCount = students.length;
        if (studentCount > 0 && lectures.length > 0) {
            const presentMap = new Set(attendanceRecords.map(r => `${r.studentId}-${r.lectureId}`));
            let totalStudentAbsence = 0;
            students.forEach(student => {
                let studentAbsence = 0;
                lectures.forEach(lecture => {
                    const weight = courses.find(c => c.id === lecture.courseId)?.absenceWeight ?? 2.5; 
                    if (!presentMap.has(`${student.id}-${lecture.id}`)) studentAbsence += weight;
                });
                totalStudentAbsence += studentAbsence;
            });
            totalAbsenceRate = totalStudentAbsence / studentCount;
        }
        return { studentCount, absenceRate: totalAbsenceRate.toFixed(1) };
    }, [students, lectures, attendanceRecords, courses]);

    if (!selectedBatchId) {
        return (
            <div className={`backdrop-blur-2xl border rounded-[2.5rem] p-8 text-center space-y-6 animate-fade-in ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/60 border-slate-800'}`}>
                <div className="max-w-2xl mx-auto">
                    <UsersIcon className="w-16 h-16 text-blue-500 mx-auto mb-4 opacity-50" />
                    <h2 className="text-2xl font-bold text-white mb-2">مرحباً بك في لوحة التحكم</h2>
                    <p className="text-gray-400 mb-8">يرجى اختيار الدفعة والشعبة التي ترغب في إدارتها للبدء.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                        {groupedBatches.filter(g => !g.isArchived).map(group => (
                            <div key={group.name} className="p-5 bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700 rounded-2xl transition-all shadow-lg">
                                <div className="flex justify-between items-center mb-4 border-b border-slate-700/50 pb-3">
                                    <h3 className="font-black text-white text-xl">{group.name}</h3>
                                    <span className="text-xs text-blue-400 font-bold bg-blue-500/10 px-3 py-1 rounded-full">السنة {group.year}</span>
                                </div>
                                <div className="flex gap-3">
                                    {group.male && (
                                        <button onClick={() => { onChangeBatch(group.male!.id); setActiveTab('attendance'); }} className="flex-1 flex flex-col items-center justify-center bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 py-3 rounded-xl transition-all transform-gpu border border-blue-500/20 group/btn">
                                            <span className="font-black mb-1">الطلاب</span>
                                            <span className="text-[10px] text-gray-400 bg-slate-900/50 px-2 py-0.5 rounded-full">{group.male.studentCount || 0} طالب</span>
                                        </button>
                                    )}
                                    {group.female && (
                                        <button onClick={() => { onChangeBatch(group.female!.id); setActiveTab('attendance'); }} className="flex-1 flex flex-col items-center justify-center bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 py-3 rounded-xl transition-all transform-gpu border border-pink-500/20 group/btn">
                                            <span className="font-black mb-1">الطالبات</span>
                                            <span className="text-[10px] text-gray-400 bg-slate-900/50 px-2 py-0.5 rounded-full">{group.female.studentCount || 0} طالبة</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
                <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500"><UsersIcon className="w-6 h-6" /></div>
                        <div><p className="text-gray-400 text-xs font-bold">الطلاب (الحالي)</p><p className="text-2xl font-black text-white">{students.length}</p></div>
                    </div>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500"><ClipboardListIcon className="w-6 h-6" /></div>
                        <div><p className="text-gray-400 text-xs font-bold">المحاضرات (الحالي)</p><p className="text-2xl font-black text-white">{lectures.length}</p></div>
                    </div>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                        </div>
                        <div><p className="text-gray-400 text-xs font-bold">المقررات (الحالي)</p><p className="text-2xl font-black text-white">{courses.length}</p></div>
                    </div>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 rounded-2xl bg-red-500/10 text-red-500"><AlertTriangleIcon className="w-6 h-6" /></div>
                        <div><p className="text-gray-400 text-xs font-bold">متوسط الغياب</p><p className="text-2xl font-black text-white">{batchStats.absenceRate}%</p></div>
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-3xl border border-slate-700/50 p-6 animate-fade-in mt-6">
                <h3 className="text-xl font-bold text-white mb-6">نظرة عامة على الدفعات</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {batches.map(batch => (
                        <div key={batch.id} onClick={() => onChangeBatch(batch.id)} className={`cursor-pointer bg-slate-900/50 border p-4 rounded-2xl flex flex-col gap-2 transition-all transform-gpu ${batch.id === selectedBatchId ? 'border-blue-500/50 shadow-lg shadow-blue-500/10' : 'border-slate-700 hover:border-slate-500'}`}>
                            <div className="flex justify-between items-center">
                                <p className="font-bold text-white text-lg">{batch.batchName}</p>
                                <span className={`text-[10px] px-2 py-1 rounded-full border ${batch.isArchived ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>{batch.isArchived ? 'مؤرشف' : 'نشط'}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-slate-800">
                                <span>عدد الطلاب:</span><span className="font-mono font-bold text-gray-300">{batch.id === selectedBatchId ? batchStats.studentCount : batch.studentCount || '--'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};
export default AdminOverviewTab;