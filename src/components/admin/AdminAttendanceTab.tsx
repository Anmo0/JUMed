import React, { useState, useMemo } from 'react';
import { Student, AttendanceRecord, Lecture, Batch } from '../../types';
import { ClipboardListIcon, TrashIcon, CopyIcon, CheckCircleIcon, XCircleIcon, UsersIcon } from '../icons';
import Modal from '../Modal';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Props {
    students: Student[];
    attendanceRecords: AttendanceRecord[];
    lectures: Lecture[];
    selectedBatchId: string | null;
    selectedLectureId: string | null;
    setSelectedLectureId: (id: string | null) => void;
    selectedDateFilter: string;
    setSelectedDateFilter: (date: string) => void;
    activeLecture: Lecture | null;
    currentBatch?: Batch;
    isRamadanMode: boolean;
    onManualAttendance: (sId: string, lId: string) => void;
    onRemoveAttendance: (sId: string, lId: string) => void;
    onClearLectureAttendance: (lId: string) => void;
    onClearAllLectures: () => void;
    onRepeatPreviousAttendance: (lId: string) => Promise<{ success: boolean; message: string; }>;
    onDeleteLecture: (lId: string) => void;
    setActiveTab: (tab: any) => void;
}

const AdminAttendanceTab: React.FC<Props> = (props) => {
    const { students, attendanceRecords, lectures, selectedBatchId, selectedLectureId, setSelectedLectureId, selectedDateFilter, setSelectedDateFilter, activeLecture, currentBatch, isRamadanMode, setActiveTab } = props;
    
    const [attendanceGroupFilter, setAttendanceGroupFilter] = useState<string | 'all'>('all');
    const [isClearAttendanceModalOpen, setClearAttendanceModalOpen] = useState(false);
    const [isDeleteLectureModalOpen, setDeleteLectureModalOpen] = useState(false);
    const [isRepeatModalOpen, setRepeatModalOpen] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    const uniqueDates = useMemo(() => Array.from(new Set(lectures.map(l => l.date))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()), [lectures]);
    const filteredLectures = useMemo(() => lectures.filter(l => l.date === selectedDateFilter), [lectures, selectedDateFilter]);

    const attendanceData = useMemo(() => {
        if (!selectedLectureId) return [];
        const actualLectureId = lectures.find(l => l.qrCode === selectedLectureId || l.id === selectedLectureId)?.id || selectedLectureId;
        const currentAtt = attendanceRecords.filter(rec => rec.lectureId === actualLectureId || rec.lectureId === selectedLectureId);
        const presentSet = new Set(currentAtt.map(r => r.studentId));
        
        let displayStudents = students;
        if (attendanceGroupFilter !== 'all') displayStudents = students.filter(s => s.groupId === attendanceGroupFilter);

        return displayStudents.map(s => {
            const isPresent = presentSet.has(s.id);
            return { 
                ...s, 
                status: isPresent ? 'حاضر' : 'غائب', 
                record: isPresent ? currentAtt.find(r => r.studentId === s.id) : null,
                actualLectureId 
            };
        }).sort((a, b) => Number(a.serialNumber) - Number(b.serialNumber));
    }, [students, attendanceRecords, selectedLectureId, lectures, attendanceGroupFilter]);

    // 💡 ميزة التصدير (PDF) عادت للعمل من هنا بشكل مستقل!
    const handleExportPdf = async () => {
        const selectedLecture = lectures.find(l => l.qrCode === selectedLectureId || l.id === selectedLectureId);
        if (!selectedLecture) return;
        setIsExportingPdf(true);

        try {
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            let yPos = 20;

            const addHeader = (page: number) => {
                pdf.setFontSize(18);
                pdf.text("تقرير الحضور", 105, yPos, { align: 'center' });
                yPos += 10;
                pdf.setFontSize(11);
                pdf.text(`المقرر: ${selectedLecture.courseName} | الدفعة: ${currentBatch?.batchName || ''}`, 105, yPos, { align: 'center' });
                yPos += 6;
                pdf.text(`تاريخ المحاضرة: ${selectedLecture.date} | الوقت: ${selectedLecture.timeSlot}`, 105, yPos, { align: 'center' });
                yPos += 5;
                pdf.line(15, yPos, 195, yPos);
                yPos += 10;
                
                pdf.setFontSize(10);
                pdf.text("الحالة", 30, yPos);
                pdf.text("الاسم", 185, yPos, { align: 'right' });
                pdf.text("#", 195, yPos, { align: 'right' });
                yPos += 5;
                pdf.line(15, yPos, 195, yPos);
                yPos += 8;
            };

            addHeader(1);
            pdf.setFontSize(9);

            attendanceData.forEach((student, index) => {
                if (yPos > 280) {
                    pdf.addPage();
                    yPos = 20;
                    addHeader(pdf.getNumberOfPages());
                }
                const status = student.status === 'حاضر' ? 'Present' : 'Absent';
                pdf.text(status, 30, yPos);
                pdf.text(student.name, 185, yPos, { align: 'right' });
                pdf.text(student.serialNumber, 195, yPos, { align: 'right' });
                
                yPos += 7;
                if ((index + 1) % 5 === 0) pdf.setDrawColor(240); 
            });

            pdf.save(`Report-${selectedLecture.courseName}.pdf`);
        } catch (error) {
            alert("حدث خطأ في التصدير.");
        } finally {
            setIsExportingPdf(false);
        }
    };

    if (!selectedBatchId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <ClipboardListIcon className="w-16 h-16 text-gray-600 opacity-20" />
                <p className="text-gray-400 font-medium">يرجى اختيار دفعة أولاً لعرض سجلات الحضور.</p>
                <button onClick={() => setActiveTab('dashboard')} className="text-blue-400 hover:underline text-sm font-bold">الذهاب لاختيار الدفعة</button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h2 className={`text-2xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>سجلات الحضور</h2>
                {activeLecture && <span className="bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-xs font-bold animate-pulse">مباشر الآن</span>}
            </div>

            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin">
                {uniqueDates.map((dateStr) => {
                    const date = new Date(dateStr);
                    const isSelected = selectedDateFilter === dateStr;
                    return (
                        <button key={dateStr} onClick={() => setSelectedDateFilter(dateStr)} className={`min-w-[85px] p-3 rounded-2xl border flex flex-col items-center transition-all ${isSelected ? 'bg-blue-600 border-blue-500 text-white scale-105' : 'bg-slate-800 border-slate-700 text-gray-400 hover:bg-slate-700'}`}>
                            <span className="text-xs font-bold mb-1">{date.toLocaleDateString('ar-EG', { weekday: 'short' })}</span>
                            <span className="text-lg font-black">{date.getDate()}</span>
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap gap-4 items-center">
                <select value={selectedLectureId || ''} onChange={(e) => setSelectedLectureId(e.target.value)} disabled={!selectedDateFilter} className="flex-1 min-w-[200px] p-3 bg-slate-800 border-slate-700 rounded-2xl text-white">
                    {filteredLectures.length ? filteredLectures.map(l => <option key={l.qrCode} value={l.qrCode}>{l.courseName} | {l.timeSlot}</option>) : <option value="">لا توجد محاضرات</option>}
                </select>
                
                <div className="flex gap-2">
                    <button onClick={() => setClearAttendanceModalOpen(true)} disabled={!selectedLectureId} className="px-4 py-3 bg-red-600/10 text-red-500 rounded-2xl border border-red-500/20 text-xs font-bold disabled:opacity-50">مسح التحضير</button>
                    <button onClick={() => setRepeatModalOpen(true)} disabled={!selectedLectureId} className="p-3 bg-purple-600 text-white rounded-2xl disabled:opacity-50"><CopyIcon className="w-5 h-5"/></button>
                    <button onClick={handleExportPdf} disabled={!selectedLectureId || isExportingPdf} className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-sm font-bold disabled:opacity-50">{isExportingPdf ? 'تصدير...' : 'تصدير PDF'}</button>
                    <button onClick={() => setDeleteLectureModalOpen(true)} disabled={!selectedLectureId} className="p-3 bg-red-600/10 text-red-500 rounded-2xl disabled:opacity-50"><TrashIcon className="w-5 h-5"/></button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-800">
                <table className="w-full text-sm text-right">
                    <thead className="bg-slate-800/80 text-gray-300">
                        <tr><th className="px-6 py-4">الطالب</th><th className="px-6 py-4">الحالة</th><th className="px-6 py-4 text-center">تحكم</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {attendanceData.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-800/40">
                                <td className="px-6 py-4 font-bold text-white">{item.name} <span className="text-gray-500 text-xs block">{item.universityId}</span></td>
                                <td className="px-6 py-4">
                                    {item.status === 'حاضر' ? <span className="text-green-400 bg-green-500/10 px-3 py-1 rounded-full text-xs">حاضر</span> : <span className="text-red-400 bg-red-500/10 px-3 py-1 rounded-full text-xs">غائب</span>}
                                </td>
                                <td className="px-6 py-4 flex justify-center">
                                    {item.status === 'غائب' ? 
                                        <button onClick={() => props.onManualAttendance(item.id, item.actualLectureId)} className="text-green-500 text-xs font-bold flex items-center gap-1"><CheckCircleIcon className="w-4 h-4"/> تحضير</button> : 
                                        <button onClick={() => props.onRemoveAttendance(item.id, item.actualLectureId)} className="text-red-500 text-xs font-bold flex items-center gap-1"><XCircleIcon className="w-4 h-4"/> إلغاء</button>
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modals... */}
            <Modal isOpen={isClearAttendanceModalOpen} onClose={() => setClearAttendanceModalOpen(false)} title="تأكيد مسح التحضير" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <p className="text-white mb-4">مسح حضور جميع الطلاب في هذه المحاضرة؟</p>
                    <button onClick={() => { if(selectedLectureId) props.onClearLectureAttendance(selectedLectureId); setClearAttendanceModalOpen(false); }} className="w-full py-3 bg-red-600 text-white rounded-xl font-bold">نعم، مسح</button>
                </div>
            </Modal>
            
            <Modal isOpen={isDeleteLectureModalOpen} onClose={() => setDeleteLectureModalOpen(false)} title="حذف المحاضرة" isRamadanMode={isRamadanMode}>
                 <div className="text-center p-4">
                    <p className="text-white mb-4">حذف المحاضرة وسجلاتها بالكامل؟</p>
                    <button onClick={() => { if(selectedLectureId) props.onDeleteLecture(selectedLectureId); setDeleteLectureModalOpen(false); }} className="w-full py-3 bg-red-600 text-white rounded-xl font-bold">حذف نهائي</button>
                </div>
            </Modal>

            <Modal isOpen={isRepeatModalOpen} onClose={() => setRepeatModalOpen(false)} title="تكرار الحضور" isRamadanMode={isRamadanMode}>
                 <div className="text-center p-4">
                    <p className="text-white mb-4">نسخ حضور المحاضرة السابقة لنفس المقرر؟</p>
                    <button onClick={() => { if(selectedLectureId) props.onRepeatPreviousAttendance(selectedLectureId); setRepeatModalOpen(false); }} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold">تأكيد التكرار</button>
                </div>
            </Modal>
        </div>
    );
};
export default AdminAttendanceTab;