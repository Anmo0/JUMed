import React, { useState, useEffect, useMemo } from 'react';
import { Student, AttendanceRecord, Lecture, Group, Batch, Course } from '../types';
import Modal from './Modal';
import { UsersIcon, ClipboardListIcon, CalendarIcon, CheckCircleIcon } from './icons';
import QRCodeDisplay from './QRCodeDisplay';

// --- استيراد المكونات المقسمة (Tabs) ---
import AdminOverviewTab from './admin/AdminOverviewTab';
import AdminCalendarTab from './admin/AdminCalendarTab';
import AdminGroupsTab from './admin/AdminGroupsTab';
import AdminStudentsTab from './admin/AdminStudentsTab';
import AdminAttendanceTab from './admin/AdminAttendanceTab';
import AdminCoursesTab from './admin/AdminCoursesTab';
import AdminBatchesTab from './admin/AdminBatchesTab';

interface AdminDashboardProps {
    students: Student[]; groups: Group[]; attendanceRecords: AttendanceRecord[]; lectures: Lecture[]; batches: Batch[]; setBatches: React.Dispatch<React.SetStateAction<Batch[]>>; courses: Course[]; setCourses: React.Dispatch<React.SetStateAction<Course[]>>; selectedBatchId: string | null; isRamadanMode: boolean; deviceBindingEnabled: boolean; absencePercentageEnabled: boolean; locationRestrictionEnabled: boolean;
    onAddStudent: any; onUpdateStudent: any; onGenerateQrCode: any; onManualAttendance: any; onRemoveAttendance: any; onResetStudentDevice: any; onResetAllDevices: any; onRepeatPreviousAttendance: any; onDeleteLecture: any; onDeleteStudent: any; onUpdateGroupName: any; onAddGroupLocal: any; onDeleteAllGroupsLocal: any; onToggleDeviceBinding: any; onToggleAbsencePercentage: any; onToggleLocationRestriction: any; onClearAllAttendance: any; onClearAllLectures: any; onResetBatch: any; onChangeBatch: any; onRecalculateSerials: any; onRefreshStudents: any; onClearLectureAttendance: any;
}

const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
    const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('adminActiveTab') || 'dashboard');
    useEffect(() => { sessionStorage.setItem('adminActiveTab', activeTab); }, [activeTab]);

    const [isQrModalOpen, setQrModalOpen] = useState(false);
    const [qrForm, setQrForm] = useState({ date: new Date().toISOString().split('T')[0], startTime: '08:00', endTime: '09:00', lectureName: '', isManual: false });
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [isCreatingQr, setIsCreatingQr] = useState(false);
    
    const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');
    const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);

    const activeLecture = props.lectures.length > 0 ? props.lectures.filter(l => (Date.now() - new Date(l.createdAt).getTime()) < 15 * 60 * 1000).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null : null;
    const currentBatch = props.batches.find(b => b.id === props.selectedBatchId);

    // 💡 استعادة الإحصائيات العلوية الفخمة بالأنيميشن الخاص بها
    const stats = useMemo(() => {
        const total = props.students.length;
        const currentPresent = selectedLectureId ? props.attendanceRecords.filter(r => r.lectureId === selectedLectureId).length : 0;
        const totalGroups = Array.from(new Set(props.students.map(s => s.groupId).filter(Boolean))).length;
        return { total, currentPresent, totalGroups };
    }, [props.students, props.attendanceRecords, selectedLectureId]);

    const TabButton = ({ id, title, icon }: { id: string, title: string, icon: any }) => (
        <button onClick={() => setActiveTab(id)} className={`flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 transform transform-gpu ${activeTab === id ? (props.isRamadanMode ? 'bg-yellow-500 text-slate-900 shadow-lg shadow-yellow-500/30 scale-105' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 scale-105') : 'text-gray-400 hover:bg-slate-800/80 hover:text-white'}`}>
            <span className={`${activeTab === id ? (props.isRamadanMode ? 'text-slate-900' : 'text-white') : 'text-blue-400'}`}>{icon}</span>
            <span>{title}</span>
        </button>
    );

    const StatCard: React.FC<{ title: string, value: string | number, icon: React.ReactNode, colorClass: string }> = ({ title, value, icon, colorClass }) => (
        <div className={`backdrop-blur-xl border p-5 rounded-2xl flex items-center justify-between group transition-all transform-gpu ${props.isRamadanMode ? 'ramadan-card' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}`}>
            <div>
                <p className={`text-sm font-medium mb-1 ${props.isRamadanMode ? 'text-gray-300' : 'text-gray-400'}`}>{title}</p>
                <p className={`text-2xl font-black ${props.isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>{value}</p>
            </div>
            <div className={`p-3 rounded-xl ${props.isRamadanMode ? 'bg-yellow-500/10 text-[#D4AF37]' : colorClass + ' bg-opacity-10'} group-hover:scale-110 transition-transform transform-gpu`}>
                {icon}
            </div>
        </div>
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
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight animate-slide-in-up">لوحة التحكم</h1>
                    <div className="flex items-center gap-2 text-sm text-gray-400 animate-fade-in">
                        <span className={`px-2 py-0.5 rounded-md ${props.isRamadanMode ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-400'}`}>{currentBatch?.batchName || 'اختر دفعة'}</span>
                        <button onClick={props.onResetBatch} className="ms-2 text-xs text-blue-400 hover:text-blue-300 underline">تغيير الدفعة</button>
                    </div>
                </div>
                <div className="bg-slate-900/40 p-1.5 rounded-[1.25rem] flex flex-row overflow-x-auto whitespace-nowrap gap-1 border border-slate-800/60 animate-fade-in custom-scrollbar">
                    <TabButton id="dashboard" title="لوحة التحكم" icon={<UsersIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                    <TabButton id="attendance" title="الحضور" icon={<ClipboardListIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                    <TabButton id="calendar" title="التقويم" icon={<CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                    <TabButton id="students" title="الطلاب" icon={<UsersIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                    <TabButton id="courses" title="المقررات" icon={<ClipboardListIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                    <TabButton id="groups" title="المجموعات" icon={<UsersIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                    <TabButton id="batches" title="الدفعات" icon={<ClipboardListIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                </div>
            </div>

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
                <div className="animate-fade-in">
                    <AdminOverviewTab {...props} setActiveTab={setActiveTab} />
                </div>
            )}

            {/* Stat Cards (Shown outside dashboard) */}
            {activeTab !== 'dashboard' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-in-up" style={{ animationDelay: '100ms' }}>
                    <StatCard title="إجمالي الطلاب" value={stats.total} icon={<UsersIcon className="w-6 h-6 text-blue-400" />} colorClass="bg-blue-500" />
                    <StatCard title="حاضرون حالياً" value={stats.currentPresent} icon={<CheckCircleIcon className="w-6 h-6 text-green-400" />} colorClass="bg-green-500" />
                    <StatCard title="المجموعات النشطة" value={stats.totalGroups} icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>} colorClass="bg-purple-500" />
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex flex-col-reverse lg:grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {activeTab !== 'dashboard' && (
                        <div className={`backdrop-blur-2xl border rounded-[2rem] shadow-2xl overflow-hidden animate-slide-in-up transition-all duration-500 ${props.isRamadanMode ? 'ramadan-card' : 'bg-slate-900/40 border-slate-800'}`} style={{ animationDelay: '200ms' }}>
                            <div key={activeTab} className="animate-fade-in">
                                {/* 💡 استعادة التباعد والترتيب p-4 sm:p-8 */}
                                {activeTab === 'courses' && <div className="p-4 sm:p-8"><AdminCoursesTab courses={props.courses} setCourses={props.setCourses} batches={props.batches} selectedBatchId={props.selectedBatchId} isRamadanMode={props.isRamadanMode}/></div>}
                                {activeTab === 'attendance' && <div className="p-4 sm:p-8"><AdminAttendanceTab {...props} selectedLectureId={selectedLectureId} setSelectedLectureId={setSelectedLectureId} selectedDateFilter={selectedDateFilter} setSelectedDateFilter={setSelectedDateFilter} activeLecture={activeLecture} currentBatch={currentBatch} setActiveTab={setActiveTab} /></div>}
                                {activeTab === 'calendar' && <div className="p-4 sm:p-8"><AdminCalendarTab lectures={props.lectures} attendanceRecords={props.attendanceRecords} selectedBatchId={props.selectedBatchId} isRamadanMode={props.isRamadanMode} setActiveTab={setActiveTab}/></div>}
                                {activeTab === 'students' && <div className="p-4 sm:p-8"><AdminStudentsTab {...props} currentBatch={currentBatch} setActiveTab={setActiveTab}/></div>}
                                {activeTab === 'groups' && <div className="p-4 sm:p-8"><AdminGroupsTab {...props} setActiveTab={setActiveTab}/></div>}
                                {activeTab === 'batches' && <div className="p-4 sm:p-8"><AdminBatchesTab batches={props.batches} setBatches={props.setBatches} selectedBatchId={props.selectedBatchId} onChangeBatch={props.onChangeBatch} onRefreshStudents={props.onRefreshStudents} isRamadanMode={props.isRamadanMode} setActiveTab={setActiveTab}/></div>}
                            </div>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-1">
                    <QRCodeDisplay activeLecture={activeLecture} onGenerateNew={() => setQrModalOpen(true)} title="مسح الحضور" isRamadanMode={props.isRamadanMode} />
                </div>
            </div>

            <Modal isOpen={isQrModalOpen} onClose={() => setQrModalOpen(false)} title="إنشاء محاضرة" isRamadanMode={props.isRamadanMode}>
                <form onSubmit={handleQrFormSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">المقرر</label>
                        <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} required className="w-full p-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500">
                            <option value="">اختر المقرر</option>
                            {props.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">اسم المحاضرة (اختياري)</label>
                        <input type="text" value={qrForm.lectureName} onChange={e => setQrForm(p => ({...p, lectureName: e.target.value}))} placeholder="مثال: محاضرة 1" className="w-full p-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500"/>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">التاريخ</label>
                        <input type="date" value={qrForm.date} onChange={e => setQrForm(p => ({...p, date: e.target.value}))} required className="w-full p-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500"/>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 px-1">وقت البداية</label>
                            <input type="time" value={qrForm.startTime} onChange={e => setQrForm(p => ({...p, startTime: e.target.value}))} required className="w-full p-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white text-center font-bold font-mono focus:border-blue-500"/>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 px-1">وقت النهاية</label>
                            <input type="time" value={qrForm.endTime} onChange={e => setQrForm(p => ({...p, endTime: e.target.value}))} required className="w-full p-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white text-center font-bold font-mono focus:border-blue-500"/>
                        </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                        <button type="submit" name="qrBtn" disabled={isCreatingQr || !selectedCourseId} className="flex-1 py-3.5 bg-green-600 font-bold text-white rounded-2xl shadow-lg shadow-green-600/20 disabled:opacity-50">بالباركود</button>
                        <button type="submit" name="manualBtn" disabled={isCreatingQr || !selectedCourseId} className="flex-1 py-3.5 bg-purple-600 font-bold text-white rounded-2xl shadow-lg shadow-purple-600/20 disabled:opacity-50">يدوية</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
export default AdminDashboard;