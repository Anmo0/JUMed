import React, { useState, useEffect } from 'react';
import { Student, AttendanceRecord, Lecture, Group, Batch, Course } from '../types';
import Modal from './Modal';
import { UsersIcon, ClipboardListIcon, CalendarIcon, AlertTriangleIcon } from './icons';
import QRCodeDisplay from './QRCodeDisplay';

// --- استيراد المكونات المقسمة (Tabs) ---
import AdminOverviewTab from './admin/AdminOverviewTab';
import AdminCalendarTab from './admin/AdminCalendarTab';
import AdminGroupsTab from './admin/AdminGroupsTab';
import AdminStudentsTab from './admin/AdminStudentsTab';
import AdminAttendanceTab from './admin/AdminAttendanceTab';
import AdminCoursesTab from './admin/AdminCoursesTab';
import AdminBatchesTab from './admin/AdminBatchesTab';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// واجهة الخصائص المطلوبة كما هي لم تتغير
interface AdminDashboardProps {
    students: Student[]; groups: Group[]; attendanceRecords: AttendanceRecord[]; lectures: Lecture[]; batches: Batch[]; setBatches: React.Dispatch<React.SetStateAction<Batch[]>>; courses: Course[]; setCourses: React.Dispatch<React.SetStateAction<Course[]>>; selectedBatchId: string | null; isRamadanMode: boolean; deviceBindingEnabled: boolean; absencePercentageEnabled: boolean; locationRestrictionEnabled: boolean;
    onAddStudent: any; onUpdateStudent: any; onGenerateQrCode: any; onManualAttendance: any; onRemoveAttendance: any; onResetStudentDevice: any; onResetAllDevices: any; onRepeatPreviousAttendance: any; onDeleteLecture: any; onDeleteStudent: any; onUpdateGroupName: any; onAddGroupLocal: any; onDeleteAllGroupsLocal: any; onToggleDeviceBinding: any; onToggleAbsencePercentage: any; onToggleLocationRestriction: any; onClearAllAttendance: any; onClearAllLectures: any; onResetBatch: any; onChangeBatch: any; onRecalculateSerials: any; onRefreshStudents: any; onClearLectureAttendance: any;
}

const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
    // 💡 الذاكرة لتذكر آخر تبويبة
    const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('adminActiveTab') || 'dashboard');
    useEffect(() => { sessionStorage.setItem('adminActiveTab', activeTab); }, [activeTab]);

    // حالات QR
    const [isQrModalOpen, setQrModalOpen] = useState(false);
    const [qrForm, setQrForm] = useState({ date: new Date().toISOString().split('T')[0], startTime: '08:00', endTime: '09:00', lectureName: '', isManual: false });
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [isCreatingQr, setIsCreatingQr] = useState(false);
    
    // حالات الحضور المشتركة
    const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');
    const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    const activeLecture = props.lectures.length > 0 ? props.lectures.filter(l => (Date.now() - new Date(l.createdAt).getTime()) < 15 * 60 * 1000).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null : null;
    const currentBatch = props.batches.find(b => b.id === props.selectedBatchId);

    const TabButton = ({ id, title, icon }: { id: string, title: string, icon: any }) => (
        <button onClick={() => setActiveTab(id)} className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === id ? (props.isRamadanMode ? 'bg-yellow-500 text-slate-900 scale-105' : 'bg-blue-600 text-white scale-105') : 'text-gray-400 hover:text-white'}`}>
            <span>{icon}</span>{title}
        </button>
    );

    const handleQrFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const isManualMode = (e.nativeEvent as any).submitter?.name === 'manualBtn';
        const course = props.courses.find(c => c.id === selectedCourseId);
        if (!props.selectedBatchId || !course) return;
        setIsCreatingQr(true);
        const name = qrForm.lectureName || `${course.name} - محاضرة ${props.lectures.length + 1}`;
        
        props.onGenerateQrCode({ ...qrForm, courseName: name, courseId: course.id, batchId: props.selectedBatchId, isManual: isManualMode }, {
            onSuccess: () => { setQrModalOpen(false); setIsCreatingQr(false); setSelectedDateFilter(qrForm.date); setSelectedLectureId(null); setActiveTab('attendance'); },
            onError: () => setIsCreatingQr(false)
        });
    };

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
            {/* Header Tabs */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white">لوحة التحكم</h1>
                    <div className="flex gap-2 text-sm text-gray-400 mt-2">
                        <span className="bg-blue-500/10 text-blue-400 px-2 rounded">{currentBatch?.batchName || 'اختر دفعة'}</span>
                        <button onClick={props.onResetBatch} className="text-blue-400 underline text-xs">تغيير</button>
                    </div>
                </div>
                <div className="flex overflow-x-auto bg-slate-900/40 p-1.5 rounded-2xl gap-1 border border-slate-800 scrollbar-thin">
                    <TabButton id="dashboard" title="لوحة التحكم" icon={<UsersIcon className="w-4 h-4"/>} />
                    <TabButton id="attendance" title="الحضور" icon={<ClipboardListIcon className="w-4 h-4"/>} />
                    <TabButton id="calendar" title="التقويم" icon={<CalendarIcon className="w-4 h-4"/>} />
                    <TabButton id="students" title="الطلاب" icon={<UsersIcon className="w-4 h-4"/>} />
                    <TabButton id="groups" title="المجموعات" icon={<UsersIcon className="w-4 h-4"/>} />
                    <TabButton id="courses" title="المقررات" icon={<ClipboardListIcon className="w-4 h-4"/>} />
                    <TabButton id="batches" title="الدفعات" icon={<ClipboardListIcon className="w-4 h-4"/>} />
                </div>
            </div>

            {/* Layout: Main Content + Sidebar (QR) */}
            <div className="flex flex-col-reverse lg:grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <div className="backdrop-blur-xl border border-slate-800 bg-slate-900/40 rounded-[2rem] shadow-2xl overflow-hidden">
                        {activeTab === 'dashboard' && <AdminOverviewTab {...props} setActiveTab={setActiveTab} />}
                        {activeTab === 'attendance' && <AdminAttendanceTab {...props} selectedLectureId={selectedLectureId} setSelectedLectureId={setSelectedLectureId} selectedDateFilter={selectedDateFilter} setSelectedDateFilter={setSelectedDateFilter} activeLecture={activeLecture} setActiveTab={setActiveTab} handleExportPdf={() => alert("سيتم تصدير PDF قريباً")} isExportingPdf={isExportingPdf}/>}
                        {activeTab === 'calendar' && <AdminCalendarTab lectures={props.lectures} attendanceRecords={props.attendanceRecords} selectedBatchId={props.selectedBatchId} isRamadanMode={props.isRamadanMode} setActiveTab={setActiveTab}/>}
                        {activeTab === 'students' && <AdminStudentsTab {...props} currentBatch={currentBatch} setActiveTab={setActiveTab}/>}
                        {activeTab === 'groups' && <AdminGroupsTab {...props} setActiveTab={setActiveTab}/>}
                        {activeTab === 'courses' && <AdminCoursesTab courses={props.courses} setCourses={props.setCourses} batches={props.batches} selectedBatchId={props.selectedBatchId} isRamadanMode={props.isRamadanMode}/>}
                        {activeTab === 'batches' && <AdminBatchesTab batches={props.batches} setBatches={props.setBatches} selectedBatchId={props.selectedBatchId} onChangeBatch={props.onChangeBatch} onRefreshStudents={props.onRefreshStudents} isRamadanMode={props.isRamadanMode} setActiveTab={setActiveTab}/>}
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <QRCodeDisplay activeLecture={activeLecture} onGenerateNew={() => setQrModalOpen(true)} isRamadanMode={props.isRamadanMode} />
                </div>
            </div>

            {/* QR Generate Modal */}
            <Modal isOpen={isQrModalOpen} onClose={() => setQrModalOpen(false)} title="إنشاء محاضرة" isRamadanMode={props.isRamadanMode}>
                <form onSubmit={handleQrFormSubmit} className="space-y-4">
                    <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} required className="w-full p-3 bg-slate-800 text-white rounded-xl">
                        <option value="">اختر المقرر</option>
                        {props.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input type="text" value={qrForm.lectureName} onChange={e => setQrForm(p => ({...p, lectureName: e.target.value}))} placeholder="اسم المحاضرة (اختياري)" className="w-full p-3 bg-slate-800 text-white rounded-xl"/>
                    <input type="date" value={qrForm.date} onChange={e => setQrForm(p => ({...p, date: e.target.value}))} required className="w-full p-3 bg-slate-800 text-white rounded-xl"/>
                    <div className="grid grid-cols-2 gap-2">
                        <input type="time" value={qrForm.startTime} onChange={e => setQrForm(p => ({...p, startTime: e.target.value}))} required className="w-full p-3 bg-slate-800 text-white rounded-xl"/>
                        <input type="time" value={qrForm.endTime} onChange={e => setQrForm(p => ({...p, endTime: e.target.value}))} required className="w-full p-3 bg-slate-800 text-white rounded-xl"/>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" name="qrBtn" disabled={isCreatingQr} className="flex-1 py-3 bg-green-600 text-white rounded-xl">بالباركود</button>
                        <button type="submit" name="manualBtn" disabled={isCreatingQr} className="flex-1 py-3 bg-purple-600 text-white rounded-xl">يدوية</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
export default AdminDashboard;