import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Student, AttendanceRecord, Lecture, Group, Batch, Course } from '../types';
import Modal from './Modal';
import { UsersIcon, ClipboardListIcon, EditIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, UnplugIcon, CalendarIcon, CopyIcon, TrashIcon } from './icons';
import { getBatches, promoteBatches, deleteBatchData, createBatches, saveBatches, getStudents, getGroups, getCourses, addCourse, updateCourse, deleteCourse, seedCourses, setLastCourseName, getLastCourseName, updateGroup, deleteAllGroups, deleteStudents, importStudents } from '../services/api';
import QRCodeDisplay from './QRCodeDisplay';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface AdminDashboardProps {
    students: Student[]; groups: Group[]; attendanceRecords: AttendanceRecord[]; lectures: Lecture[]; batches: Batch[];
    setBatches: React.Dispatch<React.SetStateAction<Batch[]>>; onAddStudent: (student: Omit<Student, 'id'>) => void;
    onUpdateStudent: (id: string, updates: Partial<Student>) => void;
    onGenerateQrCode: (details: {date: string, timeSlot: string, courseName: string, courseId?: string, batchId: string, isManual?: boolean}, callbacks: {onSuccess: () => void, onError: (message: string) => void}) => void;
    onManualAttendance: (studentId: string, lectureId: string) => void; onRemoveAttendance: (studentId: string, lectureId: string) => void;
    onResetStudentDevice: (studentId: string) => void; onResetAllDevices: () => void;
    onRepeatPreviousAttendance: (targetLectureId: string) => Promise<{ success: boolean; message: string; }>;
    onDeleteLecture: (lectureId: string) => void; onDeleteStudent: (studentId: string) => void;
    onUpdateGroupName: (groupId: string, newName: string) => void; onAddGroupLocal: (groupName: string) => void;
    onDeleteAllGroupsLocal: () => void; deviceBindingEnabled: boolean; onToggleDeviceBinding: (enabled: boolean) => void;
    absencePercentageEnabled: boolean; onToggleAbsencePercentage: (enabled: boolean) => void;
    onClearAllAttendance: () => void; onClearAllLectures: () => void; isRamadanMode: boolean; selectedBatchId: string | null;
    courses: Course[]; setCourses: React.Dispatch<React.SetStateAction<Course[]>>; onResetBatch: () => void;
    onChangeBatch: (batchId: string) => void; onRecalculateSerials: () => void; onRefreshStudents: () => Promise<void>;
    locationRestrictionEnabled: boolean; onToggleLocationRestriction: (enabled: boolean) => void;
    onClearLectureAttendance: (lectureId: string) => void; onDeleteGroupLocal: any;
}

const formatTimeToArabic = (time24: string) => {
    if (!time24) return ''; const [h, m] = time24.split(':'); let hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'م' : 'ص'; hour = hour % 12 || 12;
    return `${hour.toString().padStart(2, '0')}:${m} ${ampm}`;
};

const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
    const { students, groups, attendanceRecords, lectures, batches, setBatches, onAddStudent, onUpdateStudent, onUpdateGroupName, onAddGroupLocal, onDeleteAllGroupsLocal, onDeleteGroupLocal, onGenerateQrCode, onManualAttendance, onRemoveAttendance, onResetStudentDevice, onResetAllDevices, onRepeatPreviousAttendance, onDeleteLecture, onDeleteStudent, deviceBindingEnabled, onToggleDeviceBinding, absencePercentageEnabled, onToggleAbsencePercentage, onClearAllAttendance, onClearAllLectures, isRamadanMode, selectedBatchId, courses, setCourses, onResetBatch, onChangeBatch, onRecalculateSerials, onRefreshStudents, locationRestrictionEnabled, onToggleLocationRestriction, onClearLectureAttendance } = props;

    const currentBatch = useMemo(() => batches.find(b => b.id === selectedBatchId), [batches, selectedBatchId]);

    const groupedBatches = useMemo(() => {
        const groupsMap = new Map<string, { name: string, year: number, isArchived: boolean, male?: Batch, female?: Batch }>();
        batches.forEach(b => {
            const baseName = b.batchName.replace(' - طلاب', '').replace(' - طالبات', '').trim();
            const isMale = b.batchName.includes('طلاب'); const isFemale = b.batchName.includes('طالبات');
            if (!groupsMap.has(baseName)) groupsMap.set(baseName, { name: baseName, year: b.currentYear, isArchived: b.isArchived });
            const group = groupsMap.get(baseName)!;
            if (isMale) group.male = b; if (isFemale) group.female = b;
            if (b.isArchived) group.isArchived = true;
        });
        return Array.from(groupsMap.values()).sort((a, b) => a.year - b.year);
    }, [batches]);

    const TabButton: React.FC<{ isActive: boolean; onClick: () => void; title: string; icon: React.ReactNode }> = ({ isActive, onClick, title, icon }) => (
        <button onClick={onClick} className={`flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 transform transform-gpu ${isActive ? (isRamadanMode ? 'bg-yellow-500 text-slate-900 shadow-lg shadow-yellow-500/30 scale-105' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 scale-105') : 'text-gray-400 hover:bg-slate-800/80 hover:text-white'}`}>
            <span className={`${isActive ? (isRamadanMode ? 'text-slate-900' : 'text-white') : 'text-blue-400'}`}>{icon}</span><span>{title}</span>
        </button>
    );

    const StatCard: React.FC<{ title: string, value: string | number, icon: React.ReactNode, colorClass: string }> = ({ title, value, icon, colorClass }) => (
        <div className={`backdrop-blur-xl border p-5 rounded-2xl flex items-center justify-between group transition-all transform-gpu ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}`}>
            <div><p className={`text-sm font-medium mb-1 ${isRamadanMode ? 'text-gray-300' : 'text-gray-400'}`}>{title}</p><p className={`text-2xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>{value}</p></div>
            <div className={`p-3 rounded-xl ${isRamadanMode ? 'bg-yellow-500/10 text-[#D4AF37]' : colorClass + ' bg-opacity-10'} group-hover:scale-110 transition-transform transform-gpu`}>{icon}</div>
        </div>
    );

    const [activeTab, setActiveTab] = useState<'attendance' | 'students' | 'calendar' | 'groups' | 'batches' | 'courses' | 'dashboard'>(() => (sessionStorage.getItem('adminActiveTab') as any) || 'dashboard');
    useEffect(() => { sessionStorage.setItem('adminActiveTab', activeTab); }, [activeTab]);

    const [isPromoteModalOpen, setPromoteModalOpen] = useState(false);
    const [isPromoting, setIsPromoting] = useState(false);
    const [showUndoPromotion, setShowUndoPromotion] = useState(false);
    const [attendanceGroupFilter, setAttendanceGroupFilter] = useState<string | 'all'>('all');

    const handlePromoteBatches = async () => {
        setIsPromoting(true);
        try {
            const result = await promoteBatches();
            if (result.error) toast.error(`فشل الترقية: ${result.error}`);
            else {
                const updatedBatches = await getBatches();
                setBatches(updatedBatches); setPromoteModalOpen(false); setShowUndoPromotion(true);
                setTimeout(() => setShowUndoPromotion(false), 10000); toast.success('تم ترقية الدفعات بنجاح!');
            }
        } catch (error) { toast.error('حدث خطأ غير متوقع'); } finally { setIsPromoting(false); }
    };

    const handleUndoPromotion = async () => { toast.error('التراجع غير مدعوم حالياً بشكل كامل.'); };

    const [isSeeding, setIsSeeding] = useState(false);
    const [isSeedModalOpen, setSeedModalOpen] = useState(false);
    const handleSeedCourses = async () => {
        const batch = batches.find(b => b.id === selectedBatchId);
        if (!batch) return;
        setIsSeeding(true);
        try {
            const result = await seedCourses(batch.id);
            if (result.error) toast.error(`فشل إضافة المقررات: ${result.error}`);
            else {
                toast.success('تم إضافة المقررات بنجاح!');
                const updatedCourses = await getCourses(selectedBatchId!);
                if (updatedCourses.data) setCourses(updatedCourses.data);
                setSeedModalOpen(false);
            }
        } catch (error) { toast.error('حدث خطأ غير متوقع'); } finally { setIsSeeding(false); }
    };

    const [isStudentModalOpen, setStudentModalOpen] = useState(false);
    const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
    const [isCourseModalOpen, setCourseModalOpen] = useState(false);
    const [courseToDelete, setCourseToDelete] = useState<string | null>(null);
    const [courseFormState, setCourseFormState] = useState({ id: '', name: '', code: '', creditHours: 0, weeks: 0, absenceLimit: 25, absenceWeight: 2.5 });
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [formState, setFormState] = useState({ name: '', universityId: '', serialNumber: '', isBatchLeader: false, isLeader: false, groupId: '', batchId: selectedBatchId });
    const [isQrModalOpen, setQrModalOpen] = useState(false);
    const [qrForm, setQrForm] = useState({ date: new Date().toISOString().split('T')[0], startTime: '08:00', endTime: '09:00', lectureName: '', isManual: false });
    
    const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');
    const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);
    const [isCreatingQr, setIsCreatingQr] = useState(false);
    const [qrError, setQrError] = useState<string | null>(null);
    const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
    const [isResetModalOpen, setResetModalOpen] = useState(false);
    const [isResetAllModalOpen, setResetAllModalOpen] = useState(false);
    const [studentToReset, setStudentToReset] = useState<Student | null>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [isRepeatModalOpen, setRepeatModalOpen] = useState(false);
    const [repeatStatus, setRepeatStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [isRepeating, setIsRepeating] = useState(false);
    const [isDeleteLectureModalOpen, setDeleteLectureModalOpen] = useState(false);
    const [isDeleteStudentModalOpen, setDeleteStudentModalOpen] = useState(false);
    const [isClearAttendanceModalOpen, setClearAttendanceModalOpen] = useState(false);
    const [isClearLecturesModalOpen, setClearLecturesModalOpen] = useState(false);
    const [isDeleteAllGroupsModalOpen, setDeleteAllGroupsModalOpen] = useState(false);
    const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
    
    const [isGroupModalOpen, setGroupModalOpen] = useState(false);
    const [isEditGroupModalOpen, setEditGroupModalOpen] = useState(false);
    const [groupToEdit, setGroupToEdit] = useState<Group | null>(null);
    const [groupName, setGroupName] = useState('');
    const [selectedGroupStudentIds, setSelectedGroupStudentIds] = useState<Set<string>>(new Set());
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    useEffect(() => { const handler = setTimeout(() => { setDebouncedSearchQuery(studentSearchQuery); }, 300); return () => clearTimeout(handler); }, [studentSearchQuery]);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isAddBatchModalOpen, setAddBatchModalOpen] = useState(false);
    const [newBatchName, setNewBatchName] = useState('');
    const [newBatchYear, setNewBatchYear] = useState<number>(2);
    
    const [groupActionTarget, setGroupActionTarget] = useState<{ name: string, year: number, isArchived: boolean, male?: Batch, female?: Batch } | null>(null);
    const [isArchiveBatchModalOpen, setArchiveBatchModalOpen] = useState(false);
    const [isDeleteBatchModalOpen, setDeleteBatchModalOpen] = useState(false);
    const [isImportModalOpen, setImportModalOpen] = useState(false);
    const [isDeleteStudentsModalOpen, setDeleteStudentsModalOpen] = useState(false);
    const [isDeletingStudents, setIsDeletingStudents] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ imported: number, errors: string[] } | null>(null);

    const activeLecture = lectures.length > 0 ? lectures.filter(l => (Date.now() - new Date(l.createdAt).getTime()) < 15 * 60 * 1000).sort((a: Lecture, b: Lecture) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null : null;

    const stats = useMemo(() => {
        const total = students.length;
        const currentPresent = selectedLectureId ? attendanceRecords.filter(r => r.lectureId === selectedLectureId).length : 0;
        const totalGroups = Array.from(new Set(students.map(s => s.groupId).filter(Boolean))).length;
        return { total, currentPresent, totalGroups };
    }, [students, attendanceRecords, selectedLectureId]);

    const batchStats = useMemo(() => {
        let totalAbsenceRate = 0; let studentCount = students.length;
        if (studentCount > 0 && lectures.length > 0) {
            const presentMap = new Set(); attendanceRecords.forEach(r => presentMap.add(`${r.studentId}-${r.lectureId}`));
            let totalStudentAbsence = 0;
            students.forEach(student => {
                let studentAbsence = 0;
                lectures.forEach(lecture => {
                    const course = courses.find(c => c.id === lecture.courseId);
                    const weight = course?.absenceWeight ?? 2.5; 
                    if (!presentMap.has(`${student.id}-${lecture.id}`)) studentAbsence += weight;
                });
                totalStudentAbsence += studentAbsence;
            });
            totalAbsenceRate = totalStudentAbsence / studentCount;
        }
        return { studentCount, absenceRate: totalAbsenceRate.toFixed(1) };
    }, [students, lectures, attendanceRecords, courses]);

    useEffect(() => {
        if (courses.length > 0 && !selectedCourseId) {
            const savedCourseId = localStorage.getItem('lastSelectedCourseId');
            if (savedCourseId && courses.some(c => c.id === savedCourseId)) setSelectedCourseId(savedCourseId);
            else setSelectedCourseId(courses[0].id);
        }
    }, [courses, selectedCourseId]);

    useEffect(() => { if (selectedCourseId) localStorage.setItem('lastSelectedCourseId', selectedCourseId); }, [selectedCourseId]);

    const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newStart = e.target.value; const [h, m] = newStart.split(':');
        let endH = (parseInt(h, 10) + 1).toString().padStart(2, '0'); if (endH === '24') endH = '00';
        setQrForm(p => ({ ...p, startTime: newStart, endTime: `${endH}:${m}` }));
    };

    const handleQrFormSubmit = (e: React.FormEvent) => {
        e.preventDefault(); const isManualMode = (e.nativeEvent as any).submitter?.name === 'manualBtn';
        if (!selectedBatchId) { toast.error('الرجاء اختيار الدفعة أولاً'); return; }
        const selectedCourse = courses.find(c => c.id === selectedCourseId);
        if (!selectedCourse) { toast.error('الرجاء اختيار المقرر أولاً'); return; }
        setIsCreatingQr(true); setQrError(null);
        let finalLectureName = qrForm.lectureName.trim() || `${selectedCourse.name} - محاضرة ${lectures.filter(l => l.courseId === selectedCourse.id).length + 1}`;
        onGenerateQrCode({ date: qrForm.date, timeSlot: `${formatTimeToArabic(qrForm.startTime)} - ${formatTimeToArabic(qrForm.endTime)}`, courseName: finalLectureName, courseId: selectedCourse.id, batchId: selectedBatchId, isManual: isManualMode }, {
            onSuccess: () => { setLastCourseName(finalLectureName); setQrModalOpen(false); setIsCreatingQr(false); setQrForm(p => ({ ...p, lectureName: '' })); setSelectedDateFilter(qrForm.date); setSelectedLectureId(null); setActiveTab('attendance'); },
            onError: (message: string) => { setIsCreatingQr(false); setQrError(message); toast.error(message); }
        });
    };

    const handleAddBatch = async (e: React.FormEvent) => {
        e.preventDefault(); if (!newBatchName.trim()) return;
        const maleBatch = { batchName: `${newBatchName.trim()} - طلاب`, currentYear: newBatchYear };
        const femaleBatch = { batchName: `${newBatchName.trim()} - طالبات`, currentYear: newBatchYear };
        try {
            const result = await createBatches([maleBatch, femaleBatch]);
            if (result.error || !result.data) toast.error(`فشل إنشاء الدفعة: ${result.error}`);
            else { setBatches([...batches, ...result.data]); setAddBatchModalOpen(false); setNewBatchName(''); setNewBatchYear(2); toast.success('تمت الإضافة بنجاح'); }
        } catch (error) { toast.error('حدث خطأ غير متوقع'); }
    };

    const handleAddCourse = async (e: React.FormEvent) => {
        e.preventDefault(); if (!courseFormState.name || !currentBatch) return;
        if (courseFormState.id) {
            const result = await updateCourse(courseFormState.id, { name: courseFormState.name, code: courseFormState.code, creditHours: Number(courseFormState.creditHours), weeks: Number(courseFormState.weeks), absenceLimit: Number(courseFormState.absenceLimit), absenceWeight: Number(courseFormState.absenceWeight) });
            if (result.data) { setCourses(courses.map(c => c.id === courseFormState.id ? result.data! : c)); setCourseModalOpen(false); toast.success('تم تحديث المقرر بنجاح'); } 
            else toast.error('فشل التحديث: ' + result.error);
        } else {
            const result = await addCourse({ name: courseFormState.name, code: courseFormState.code, academicYear: currentBatch.currentYear, creditHours: Number(courseFormState.creditHours), weeks: Number(courseFormState.weeks), absenceLimit: Number(courseFormState.absenceLimit), absenceWeight: Number(courseFormState.absenceWeight) });
            if (result.data) { setCourses([...courses, result.data]); setCourseModalOpen(false); toast.success('تم إضافة المقرر بنجاح'); } 
            else toast.error('فشل الإضافة: ' + result.error);
        }
    };

    const handleDeleteCourse = async () => {
        if (!courseToDelete) return;
        const result = await deleteCourse(courseToDelete);
        if (!result.error) { setCourses(courses.filter(c => c.id !== courseToDelete)); toast.success('تم حذف المقرر بنجاح'); } 
        else toast.error('فشل الحذف: ' + result.error);
        setCourseToDelete(null);
    };

    const renderDashboardTab = () => (
        <div className="space-y-6">
            {!selectedBatchId ? (
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
                                        {group.male && <button onClick={() => { onChangeBatch(group.male!.id); setActiveTab('attendance'); }} className="flex-1 flex flex-col items-center justify-center bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 py-3 rounded-xl transition-all border border-blue-500/20"><span className="font-black mb-1">الطلاب</span><span className="text-[10px] text-gray-400 bg-slate-900/50 px-2 py-0.5 rounded-full">{group.male.studentCount || 0} طالب</span></button>}
                                        {group.female && <button onClick={() => { onChangeBatch(group.female!.id); setActiveTab('attendance'); }} className="flex-1 flex flex-col items-center justify-center bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 py-3 rounded-xl transition-all border border-pink-500/20"><span className="font-black mb-1">الطالبات</span><span className="text-[10px] text-gray-400 bg-slate-900/50 px-2 py-0.5 rounded-full">{group.female.studentCount || 0} طالبة</span></button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
                        <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50"><div className="flex items-center gap-4 mb-2"><div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500"><UsersIcon className="w-6 h-6" /></div><div><p className="text-gray-400 text-xs font-bold">الطلاب</p><p className="text-2xl font-black text-white">{students.length}</p></div></div></div>
                        <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50"><div className="flex items-center gap-4 mb-2"><div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500"><ClipboardListIcon className="w-6 h-6" /></div><div><p className="text-gray-400 text-xs font-bold">المحاضرات</p><p className="text-2xl font-black text-white">{lectures.length}</p></div></div></div>
                        <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50"><div className="flex items-center gap-4 mb-2"><div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500"><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div><div><p className="text-gray-400 text-xs font-bold">المقررات</p><p className="text-2xl font-black text-white">{courses.length}</p></div></div></div>
                        <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50"><div className="flex items-center gap-4 mb-2"><div className="p-3 rounded-2xl bg-red-500/10 text-red-500"><AlertTriangleIcon className="w-6 h-6" /></div><div><p className="text-gray-400 text-xs font-bold">متوسط الغياب</p><p className="text-2xl font-black text-white">{batchStats?.absenceRate || 0}%</p></div></div></div>
                    </div>
                    <div className="bg-slate-800/50 rounded-3xl border border-slate-700/50 p-6 animate-fade-in">
                        <h3 className="text-xl font-bold text-white mb-6">نظرة عامة على الدفعات</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {batches.map(batch => (
                                <div key={batch.id} onClick={() => onChangeBatch(batch.id)} className={`cursor-pointer bg-slate-900/50 border p-4 rounded-2xl flex flex-col gap-2 transition-all ${batch.id === selectedBatchId ? 'border-blue-500/50 shadow-lg' : 'border-slate-700 hover:border-slate-500'}`}>
                                    <div className="flex justify-between items-center"><p className="font-bold text-white text-lg">{batch.batchName}</p><span className={`text-[10px] px-2 py-1 rounded-full border ${batch.isArchived ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>{batch.isArchived ? 'مؤرشف' : 'نشط'}</span></div>
                                    <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-slate-800"><span>عدد الطلاب:</span><span className="font-mono font-bold">{batch.id === selectedBatchId ? batchStats?.studentCount : batch.studentCount || '--'}</span></div>
                                    <div className="flex items-center justify-between text-xs text-gray-400"><span>متوسط الغياب:</span><span className="font-mono font-bold">{batch.id === selectedBatchId ? (batchStats?.absenceRate || 0) + '%' : '--'}</span></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    const renderCoursesTab = () => (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h2 className="text-xl font-bold text-white">إدارة المقررات</h2>
                <div className="flex gap-2">
                    <button onClick={() => setSeedModalOpen(true)} className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}>إضافة المقررات الافتراضية</button>
                    <button onClick={() => { setCourseFormState({ id: '', name: '', code: '', creditHours: 0, weeks: 0, absenceLimit: 25, absenceWeight: 2.5 }); setCourseModalOpen(true); }} className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>إضافة مقرر جديد</button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {courses.map(course => (
                    <div key={course.id} className="bg-slate-800/50 border border-slate-700 p-6 rounded-3xl relative group hover:border-slate-600 transition-all">
                        <div className="absolute top-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setCourseFormState({ id: course.id, name: course.name, code: course.code || '', creditHours: course.creditHours || 0, weeks: course.weeks || 0, absenceLimit: course.absenceLimit || 25, absenceWeight: course.absenceWeight || 2.5 }); setCourseModalOpen(true); }} className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl"><EditIcon className="w-4 h-4" /></button>
                            <button onClick={() => setCourseToDelete(course.id)} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl"><TrashIcon className="w-4 h-4" /></button>
                        </div>
                        <div className="mb-4"><div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-3"><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div><h3 className="font-bold text-white text-xl mb-1">{course.name}</h3><p className="text-sm text-gray-400 font-mono">{course.code || 'بدون رمز'}</p></div>
                        <div className="flex flex-col gap-2 text-xs text-gray-400 bg-slate-900/50 p-3 rounded-2xl w-full"><div className="flex justify-between"><span>الساعات المعتمدة:</span><span className="text-blue-400 font-bold">{course.creditHours || '--'}</span></div><div className="flex justify-between"><span>الأسابيع:</span><span className="text-purple-400 font-bold">{course.weeks || '--'}</span></div><div className="flex justify-between border-t border-slate-800 pt-2 mt-1"><span>نسبة الحرمان:</span><span className="text-red-400 font-bold">{course.absenceLimit || 25}%</span></div></div>
                    </div>
                ))}
                {courses.length === 0 && <div className="col-span-full text-center py-16 bg-slate-800/30 rounded-3xl border border-slate-800 border-dashed"><p className="text-gray-400 font-bold text-lg">لا توجد مقررات مضافة</p></div>}
            </div>
        </div>
    );

    const sortedStudents = useMemo(() => [...students].sort((a, b) => (Number(a.serialNumber) || 0) - (Number(b.serialNumber) || 0)), [students]);
    const uniqueLectureDates = useMemo(() => Array.from(new Set(lectures.map(l => l.date))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()), [lectures]);
    const filteredLectures = useMemo(() => lectures.filter(l => l.date === selectedDateFilter).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [lectures, selectedDateFilter]);

    useEffect(() => { if (!selectedDateFilter && uniqueLectureDates.length > 0) setSelectedDateFilter(uniqueLectureDates[0]); }, [uniqueLectureDates, selectedDateFilter]);
    useEffect(() => { if (filteredLectures.length > 0) { if (!filteredLectures.find(l => l.qrCode === selectedLectureId)) setSelectedLectureId(filteredLectures[0].qrCode); } else if (selectedDateFilter) setSelectedLectureId(null); }, [filteredLectures, selectedLectureId, selectedDateFilter]);
    useEffect(() => { getLastCourseName().then(name => { if (name) setQrForm(prev => ({ ...prev, courseName: name })); }); }, []);

    const handleOpenModal = (student: Student | null = null) => {
        setCurrentStudent(student);
        setFormState(student ? { name: student.name, universityId: student.universityId, serialNumber: student.serialNumber, isBatchLeader: student.isBatchLeader || false, isLeader: student.isLeader || false, groupId: student.groupId || '', batchId: student.batchId || selectedBatchId } : { name: '', universityId: '', serialNumber: '', isBatchLeader: false, isLeader: false, groupId: '', batchId: selectedBatchId });
        setStudentModalOpen(true);
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const payload = { name: formState.name, universityId: formState.universityId, isBatchLeader: formState.isBatchLeader, isLeader: formState.isLeader, groupId: formState.groupId, batchId: formState.batchId, serialNumber: formState.serialNumber };
        if (currentStudent) onUpdateStudent(currentStudent.id, payload); else onAddStudent(payload);
        setStudentModalOpen(false);
    };

    const handleAddGroup = (e: React.FormEvent) => { e.preventDefault(); if (groupName.trim()) { onAddGroupLocal(groupName.trim()); setGroupModalOpen(false); setGroupName(''); } };
    const handleOpenQrModal = () => { setQrError(null); setIsCreatingQr(false); setQrModalOpen(true); };
    const handleGenerateNewClick = () => { if (activeLecture) setConfirmModalOpen(true); else handleOpenQrModal(); };
    const handleConfirmGenerateNew = () => { setConfirmModalOpen(false); handleOpenQrModal(); };
    const handleConfirmDeleteLecture = () => { if (selectedLectureId) { onDeleteLecture(selectedLectureId); setDeleteLectureModalOpen(false); } };
    const handleConfirmDeleteStudent = () => { if (studentToDelete) { onDeleteStudent(studentToDelete.id); setDeleteStudentModalOpen(false); setStudentToDelete(null); } };
    const handleConfirmClearAttendance = () => { onClearAllAttendance(); setClearAttendanceModalOpen(false); };
    const handleConfirmClearLectures = () => { onClearAllLectures(); setClearLecturesModalOpen(false); };
    
    const handleConfirmDeleteAllGroups = async () => {
        const { error } = await deleteAllGroups();
        if (error) toast.error(error); else { onDeleteAllGroupsLocal(); toast.success('تم مسح جميع المجموعات بنجاح.'); }
        setDeleteAllGroupsModalOpen(false);
    };

    const handleConfirmArchiveBatch = async () => {
        if (!groupActionTarget) return;
        const updates = [];
        if (groupActionTarget.male) updates.push({ ...groupActionTarget.male, isArchived: !groupActionTarget.isArchived });
        if (groupActionTarget.female) updates.push({ ...groupActionTarget.female, isArchived: !groupActionTarget.isArchived });
        try { await saveBatches(updates); setBatches(prev => prev.map(b => updates.find(u => u.id === b.id) || b)); setArchiveBatchModalOpen(false); setGroupActionTarget(null); toast.success('تم تحديث الحالة بنجاح'); } 
        catch (error) { toast.error('حدث خطأ أثناء التحديث'); }
    };

    const handleConfirmDeleteBatch = async () => {
        if (!groupActionTarget) return;
        try {
            if (groupActionTarget.male) await deleteBatchData(groupActionTarget.male.id);
            if (groupActionTarget.female) await deleteBatchData(groupActionTarget.female.id);
            setBatches(prev => prev.filter(b => b.id !== groupActionTarget.male?.id && b.id !== groupActionTarget.female?.id));
            await onRefreshStudents(); setDeleteBatchModalOpen(false); setGroupActionTarget(null); toast.success('تم حذف الدفعة بنجاح');
        } catch (error) { toast.error('حدث خطأ أثناء החذف'); }
    };

    const handleImportStudents = async (e: React.FormEvent) => {
        e.preventDefault(); if (!importFile || !selectedBatchId) return;
        setIsImporting(true); setImportResult(null);
        try {
            let parsedStudents: { name: string, universityId: string }[] = [];
            if (importFile.name.endsWith('.csv')) {
                const text = await importFile.text();
                parsedStudents = await new Promise((resolve) => Papa.parse(text, { header: true, skipEmptyLines: true, complete: (results) => resolve(results.data.map((row: any) => ({ name: row['الاسم'] || row['name'] || '', universityId: String(row['الرقم الجامعي'] || row['university_id'] || '').trim() })).filter(s => s.name && s.universityId)) }));
            } else if (importFile.name.endsWith('.xlsx') || importFile.name.endsWith('.xls')) {
                const data = await importFile.arrayBuffer(); const workbook = XLSX.read(data);
                const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                parsedStudents = json.map((row: any) => ({ name: row['الاسم'] || row['name'] || '', universityId: String(row['الرقم الجامعي'] || row['university_id'] || '').trim() })).filter(s => s.name && s.universityId);
            }
            if (parsedStudents.length === 0) { toast.error('لم يتم العثور على بيانات صحيحة.'); setIsImporting(false); return; }
            const result = await importStudents(selectedBatchId, parsedStudents);
            if (!result.error && result.data) { setImportResult(result.data); if (result.data.imported > 0) await onRefreshStudents(); } 
            else toast.error(result.error || 'خطأ أثناء الاستيراد');
        } catch (error) { toast.error('حدث خطأ غير متوقع'); } finally { setIsImporting(false); }
    };
    
    const attendanceData = useMemo(() => {
        if (!selectedLectureId) return [];
        const actualLectureId = lectures.find(l => l.qrCode === selectedLectureId || l.id === selectedLectureId)?.id || selectedLectureId;
        const currentAttendance = attendanceRecords.filter(rec => rec.lectureId === actualLectureId || rec.lectureId === selectedLectureId);
        const presentStudentIds = new Set(currentAttendance.map(rec => rec.studentId));
        const groupsWithAnyPresence = new Set<string>();
        students.forEach(s => { if (s.groupId && presentStudentIds.has(s.id)) groupsWithAnyPresence.add(s.groupId); });
        let displayStudents = attendanceGroupFilter !== 'all' ? students.filter(s => s.groupId === attendanceGroupFilter) : students;
        return displayStudents.map(student => ({
            ...student, status: presentStudentIds.has(student.id) ? 'حاضر' : 'غائب', record: presentStudentIds.has(student.id) ? currentAttendance.find(r => r.studentId === student.id) : null, isGroupActive: student.groupId ? groupsWithAnyPresence.has(student.groupId) : false, actualLectureId
        })).sort((a, b) => (Number(a.serialNumber) || 0) - (Number(b.serialNumber) || 0));
    }, [students, attendanceRecords, selectedLectureId, lectures, attendanceGroupFilter]);

    const handleExportPdf = async () => {
        const selectedLecture = lectures.find(l => l.qrCode === selectedLectureId);
        if (!selectedLecture) return;
        setIsExportingPdf(true);
        if (attendanceData.length >= 200) {
            try {
                const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' }); let yPos = 20;
                const addHeader = () => { pdf.setFontSize(18); pdf.text("تقرير الحضور", 105, yPos, { align: 'center' }); yPos += 10; pdf.setFontSize(11); pdf.text(`المقرر: ${selectedLecture.courseName}`, 105, yPos, { align: 'center' }); yPos += 15; };
                addHeader(); pdf.setFontSize(9);
                attendanceData.forEach((student) => {
                    if (yPos > 280) { pdf.addPage(); yPos = 20; addHeader(); }
                    pdf.text(student.status === 'حاضر' ? 'Present' : 'Absent', 30, yPos); pdf.text(student.name, 185, yPos, { align: 'right' }); yPos += 7;
                });
                pdf.save(`Report-${selectedLecture.courseName}.pdf`);
            } catch (error) { toast.error("حدث خطأ في التصدير الخفيف."); } finally { setIsExportingPdf(false); }
        } else {
            try {
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const container = document.createElement('div'); container.style.cssText = "position:fixed;top:0;left:-9999px;width:794px;padding:40px;background:white;direction:rtl;font-family:sans-serif;";
                let html = `<h1 style="text-align:center;">تقرير الحضور: ${selectedLecture.courseName}</h1><table width="100%" border="1" style="border-collapse:collapse;"><tr><th>الرقم</th><th>الاسم</th><th>المجموعة</th><th>الحالة</th></tr>`;
                attendanceData.slice(0, 50).forEach(s => { html += `<tr><td>${s.serialNumber}</td><td>${s.name}</td><td>${s.groupName || '-'}</td><td>${s.status}</td></tr>`; });
                html += `</table>`; container.innerHTML = html; document.body.appendChild(container);
                const canvas = await html2canvas(container, { scale: 1.2, logging: false });
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', 0, 0, 210, (canvas.height * 210) / canvas.width);
                document.body.removeChild(container); pdf.save(`Report-${selectedLecture.date}.pdf`);
            } catch (error) { toast.error("حدث خطأ أثناء إنشاء ملف PDF."); } finally { setIsExportingPdf(false); }
        }
    };
    
    const handleConfirmRepeat = async () => {
        if (!selectedLectureId) return; setIsRepeating(true);
        try { const result = await onRepeatPreviousAttendance(selectedLectureId); toast[result.success ? 'success' : 'error'](result.message); } 
        catch (error) { toast.error('حدث خطأ غير متوقع'); } finally { setIsRepeating(false); setRepeatModalOpen(false); }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
                <div className="flex flex-col gap-1"><h1 className="text-3xl sm:text-4xl font-black text-white">لوحة التحكم</h1><div className="flex items-center gap-2"><span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400">{currentBatch?.batchName}</span><button onClick={onResetBatch} className="text-xs text-blue-400 hover:text-blue-300 underline">تغيير الدفعة</button></div></div>
                <div className="bg-slate-900/40 p-1.5 rounded-[1.25rem] flex flex-row overflow-x-auto whitespace-nowrap gap-1 border border-slate-800/60 custom-scrollbar">
                    <TabButton isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} title="لوحة التحكم" icon={<UsersIcon className="w-4 h-4"/>} />
                    <TabButton isActive={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} title="الحضور" icon={<ClipboardListIcon className="w-4 h-4"/>} />
                    <TabButton isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} title="التقويم" icon={<CalendarIcon className="w-4 h-4"/>} />
                    <TabButton isActive={activeTab === 'students'} onClick={() => setActiveTab('students')} title="الطلاب" icon={<UsersIcon className="w-4 h-4"/>} />
                    <TabButton isActive={activeTab === 'courses'} onClick={() => setActiveTab('courses')} title="المقررات" icon={<EditIcon className="w-4 h-4"/>} />
                    <TabButton isActive={activeTab === 'groups'} onClick={() => setActiveTab('groups')} title="المجموعات" icon={<UsersIcon className="w-4 h-4"/>} />
                    <TabButton isActive={activeTab === 'batches'} onClick={() => setActiveTab('batches')} title="الدفعات" icon={<ClipboardListIcon className="w-4 h-4"/>} />
                </div>
            </div>

            {activeTab === 'dashboard' && renderDashboardTab()}
            
            {activeTab !== 'dashboard' && (
                <div className="flex flex-col-reverse lg:grid lg:grid-cols-3 gap-8 mt-8">
                    <div className="lg:col-span-2 space-y-8">
                        <div className={`backdrop-blur-2xl border rounded-[2rem] shadow-2xl overflow-hidden p-6 sm:p-8 ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/40 border-slate-800'}`}>
                            
                            {activeTab === 'courses' && renderCoursesTab()}

                            {activeTab === 'attendance' && (
                                <div className="space-y-6">
                                    <div className="flex flex-wrap justify-between items-center gap-4"><h2 className="text-2xl font-black text-white">سجلات الحضور</h2></div>
                                    <div className="flex flex-wrap gap-4">
                                        <select value={selectedDateFilter} onChange={(e) => setSelectedDateFilter(e.target.value)} className="w-full sm:w-auto bg-slate-800 border-2 border-slate-700 text-white rounded-2xl px-4 py-3">{uniqueLectureDates.map(d => <option key={d} value={d}>{d}</option>)}</select>
                                        <select value={selectedLectureId || ''} onChange={(e) => setSelectedLectureId(e.target.value)} className="w-full sm:w-auto bg-slate-800 border-2 border-slate-700 text-white rounded-2xl px-4 py-3">{filteredLectures.map(l => <option key={l.qrCode} value={l.qrCode}>{l.courseName}</option>)}</select>
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                        <button onClick={() => setClearAttendanceModalOpen(true)} disabled={!selectedLectureId} className="px-4 py-2 bg-red-600/10 text-red-500 rounded-xl font-bold disabled:opacity-50">مسح التحضير</button>
                                        <button onClick={handleExportPdf} disabled={!selectedLectureId || isExportingPdf} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50">تصدير PDF</button>
                                    </div>
                                    <div className="overflow-x-auto rounded-3xl border border-slate-800 mt-6">
                                        <table className="w-full text-right text-sm text-white">
                                            <thead className="bg-slate-800"><tr><th className="px-6 py-4">#</th><th className="px-6 py-4">الطالب</th><th className="px-6 py-4">المجموعة</th><th className="px-6 py-4">الحالة</th><th className="px-6 py-4">تحكم</th></tr></thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {attendanceData.map(item => (
                                                    <tr key={item.id} className="hover:bg-slate-800/50">
                                                        <td className="px-6 py-4 font-mono text-gray-400">{item.serialNumber}</td><td className="px-6 py-4 font-bold">{item.name}</td><td className="px-6 py-4">{item.groupName || '-'}</td><td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-bold ${item.status==='حاضر'?'bg-green-900/30 text-green-400':'bg-red-900/30 text-red-400'}`}>{item.status}</span></td>
                                                        <td className="px-6 py-4">{item.status === 'غائب' ? <button onClick={() => onManualAttendance(item.id, item.actualLectureId)} className="text-green-500 font-bold">تحضير</button> : <button onClick={() => onRemoveAttendance(item.id, item.actualLectureId)} className="text-red-500 font-bold">إلغاء</button>}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'students' && (
                                <div className="space-y-6">
                                    <div className="flex flex-wrap justify-between items-center gap-4"><h2 className="text-2xl font-black text-white">إدارة الطلاب</h2>
                                        <div className="flex gap-2">
                                            <button onClick={() => setImportModalOpen(true)} className="px-4 py-2 bg-green-600/20 text-green-500 rounded-xl font-bold">استيراد</button>
                                            <button onClick={() => handleOpenModal()} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">إضافة طالب</button>
                                        </div>
                                    </div>
                                    <table className="w-full text-sm text-right text-white border border-slate-800 rounded-3xl overflow-hidden">
                                        <thead className="bg-slate-800"><tr><th className="p-4">الاسم</th><th className="p-4">الرقم</th><th className="p-4">#</th><th className="p-4">المجموعة</th><th className="p-4">أدوات</th></tr></thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {sortedStudents.map(student => (
                                                <tr key={student.id} className="hover:bg-slate-800/40"><td className="p-4">{student.name}</td><td className="p-4">{student.universityId}</td><td className="p-4 text-blue-400">{student.serialNumber}</td><td className="p-4">{student.groupName || '-'}</td><td className="p-4 flex gap-2"><button onClick={() => handleOpenModal(student)} className="text-blue-400">تعديل</button><button onClick={() => { setStudentToDelete(student); setDeleteStudentModalOpen(true); }} className="text-red-500">حذف</button></td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'groups' && (
                                <div className="space-y-6">
                                    <div className="flex flex-wrap justify-between items-center gap-4"><h2 className="text-2xl font-black text-white">إدارة المجموعات</h2>
                                        <div className="flex gap-2"><button onClick={() => setDeleteAllGroupsModalOpen(true)} className="px-4 py-2 bg-red-600/10 text-red-500 rounded-xl font-bold">حذف الجميع</button><button onClick={() => setGroupModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">جديد</button></div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {groups.map(group => {
                                            // 💡 ترتيب الطلاب داخل كل مجموعة تصاعدياً حسب الرقم التسلسلي
                                            const members = students.filter(s => s.groupId === group.id).sort((a, b) => (Number(a.serialNumber) || 0) - (Number(b.serialNumber) || 0));
                                            return (
                                                <div key={group.id} className="border border-slate-700 p-6 rounded-3xl bg-slate-800/40">
                                                    <div className="flex justify-between mb-4"><h3 className="text-xl font-bold text-white">{group.name}</h3>
                                                        <div className="flex gap-2"><button onClick={() => { setGroupToEdit(group); setGroupName(group.name); setSelectedGroupStudentIds(new Set(members.map(s => s.id))); setEditGroupModalOpen(true); }} className="text-blue-400"><EditIcon className="w-5 h-5"/></button><button onClick={() => onDeleteGroupLocal(group.id)} className="text-red-500"><TrashIcon className="w-5 h-5"/></button></div>
                                                    </div>
                                                    <div className="text-gray-400 text-sm">{members.length} طلاب</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'batches' && (
                                <div className="space-y-6">
                                    <div className="flex flex-wrap justify-between items-center gap-4"><h2 className="text-2xl font-black text-white">إدارة الدفعات</h2>
                                        <div className="flex gap-2"><button onClick={() => setPromoteModalOpen(true)} className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold">ترقية الدفعات</button><button onClick={() => setAddBatchModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">إضافة سنة</button></div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {groupedBatches.map(group => (
                                            <div key={group.name} className="border border-slate-700 p-6 rounded-3xl bg-slate-800/40">
                                                <div className="flex justify-between mb-4"><h3 className="text-xl font-bold text-white">{group.name}</h3>
                                                    <div className="flex gap-2"><button onClick={() => { setGroupActionTarget(group); setArchiveBatchModalOpen(true); }} className="text-yellow-500 font-bold">{group.isArchived ? 'استعادة' : 'أرشفة'}</button><button onClick={() => { setGroupActionTarget(group); setDeleteBatchModalOpen(true); }} className="text-red-500 font-bold">حذف</button></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="lg:col-span-1"><QRCodeDisplay activeLecture={activeLecture} onGenerateNew={handleGenerateNewClick} title="مسح الحضور" isRamadanMode={isRamadanMode} /></div>
                </div>
            )}

            {/* جميع النوافذ المنبثقة */}
            <Modal isOpen={isQrModalOpen} onClose={() => setQrModalOpen(false)} title="إنشاء باركود" isRamadanMode={isRamadanMode}><form onSubmit={handleQrFormSubmit} className="space-y-4"><select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} className="w-full p-3 bg-slate-800 text-white rounded-xl"><option value="">اختر المقرر</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="submit" className="w-full py-3 bg-green-600 text-white rounded-xl">إنشاء</button></form></Modal>
            <Modal isOpen={isStudentModalOpen} onClose={() => setStudentModalOpen(false)} title="إدارة الطالب" isRamadanMode={isRamadanMode}><form onSubmit={handleFormSubmit} className="space-y-4"><input type="text" value={formState.name} onChange={(e) => setFormState({...formState, name: e.target.value})} className="w-full p-3 bg-slate-800 text-white rounded-xl" placeholder="الاسم"/><input type="text" value={formState.universityId} onChange={(e) => setFormState({...formState, universityId: e.target.value})} className="w-full p-3 bg-slate-800 text-white rounded-xl" placeholder="الرقم الجامعي"/><button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl">حفظ</button></form></Modal>
            <Modal isOpen={isDeleteStudentModalOpen} onClose={() => setDeleteStudentModalOpen(false)} title="حذف" isRamadanMode={isRamadanMode}><div className="p-4 text-center"><p className="text-white mb-4">تأكيد الحذف؟</p><button onClick={handleConfirmDeleteStudent} className="w-full py-3 bg-red-600 text-white rounded-xl">حذف</button></div></Modal>
            <Modal isOpen={isClearAttendanceModalOpen} onClose={() => setClearAttendanceModalOpen(false)} title="مسح" isRamadanMode={isRamadanMode}><div className="p-4 text-center"><p className="text-white mb-4">مسح التحضير؟</p><button onClick={handleConfirmClearAttendance} className="w-full py-3 bg-red-600 text-white rounded-xl">تأكيد</button></div></Modal>
            <Modal isOpen={isDeleteLectureModalOpen} onClose={() => setDeleteLectureModalOpen(false)} title="حذف" isRamadanMode={isRamadanMode}><div className="p-4 text-center"><p className="text-white mb-4">حذف المحاضرة؟</p><button onClick={handleConfirmDeleteLecture} className="w-full py-3 bg-red-600 text-white rounded-xl">حذف</button></div></Modal>
            <Modal isOpen={isGroupModalOpen} onClose={() => setGroupModalOpen(false)} title="مجموعة جديدة" isRamadanMode={isRamadanMode}><form onSubmit={handleAddGroup} className="space-y-4"><input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full p-3 bg-slate-800 text-white rounded-xl" placeholder="الاسم"/><button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl">إنشاء</button></form></Modal>
            
            {/* مودال التعديل الفخم بدون Alert */}
            <Modal isOpen={isEditGroupModalOpen} onClose={() => setEditGroupModalOpen(false)} title="تعديل المجموعة" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleEditGroup} className="space-y-4">
                    <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} required className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white" placeholder="اسم المجموعة" />
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                        {students.map(student => (
                            <div key={student.id} onClick={() => { const next = new Set(selectedGroupStudentIds); if(next.has(student.id)) next.delete(student.id); else next.add(student.id); setSelectedGroupStudentIds(next); }} className={`flex justify-between p-3 rounded-xl cursor-pointer border ${selectedGroupStudentIds.has(student.id) ? 'bg-blue-600/20 border-blue-500' : 'bg-slate-800/40 border-slate-700'}`}>
                                <span className="text-white text-sm font-bold">{student.name}</span>
                                {selectedGroupStudentIds.has(student.id) && <CheckCircleIcon className="w-5 h-5 text-blue-400" />}
                            </div>
                        ))}
                    </div>
                    <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-2xl">حفظ التعديلات</button>
                </form>
            </Modal>

            <Modal isOpen={isDeleteAllGroupsModalOpen} onClose={() => setDeleteAllGroupsModalOpen(false)} title="حذف الجميع" isRamadanMode={isRamadanMode}><div className="p-4 text-center"><p className="text-white mb-4">مسح كل المجموعات؟</p><button onClick={handleConfirmDeleteAllGroups} className="w-full py-3 bg-red-600 text-white rounded-xl">تأكيد</button></div></Modal>
            <Modal isOpen={isAddBatchModalOpen} onClose={() => setAddBatchModalOpen(false)} title="إضافة دفعة" isRamadanMode={isRamadanMode}><form onSubmit={handleAddBatch} className="space-y-4"><input type="text" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} className="w-full p-3 bg-slate-800 text-white rounded-xl" placeholder="الاسم"/><button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl">إضافة</button></form></Modal>
            <Modal isOpen={isArchiveBatchModalOpen} onClose={() => setArchiveBatchModalOpen(false)} title="أرشفة" isRamadanMode={isRamadanMode}><div className="p-4 text-center"><p className="text-white mb-4">تأكيد الأرشفة؟</p><button onClick={handleConfirmArchiveBatch} className="w-full py-3 bg-yellow-600 text-white rounded-xl">تأكيد</button></div></Modal>
            <Modal isOpen={isDeleteBatchModalOpen} onClose={() => setDeleteBatchModalOpen(false)} title="حذف دفعة" isRamadanMode={isRamadanMode}><div className="p-4 text-center"><p className="text-white mb-4">حذف الدفعة نهائياً؟</p><button onClick={handleConfirmDeleteBatch} className="w-full py-3 bg-red-600 text-white rounded-xl">حذف</button></div></Modal>
            <Modal isOpen={isPromoteModalOpen} onClose={() => setPromoteModalOpen(false)} title="ترقية" isRamadanMode={isRamadanMode}><div className="p-4 text-center"><p className="text-white mb-4">ترقية جميع الدفعات؟</p><button onClick={handlePromoteBatches} disabled={isPromoting} className="w-full py-3 bg-purple-600 text-white rounded-xl">{isPromoting?'جاري...':'تأكيد'}</button></div></Modal>
            
            {/* مودال المقررات لتعويض الـ Confirm */}
            <Modal isOpen={isSeedModalOpen} onClose={() => setSeedModalOpen(false)} title="إضافة مقررات" isRamadanMode={isRamadanMode}><div className="p-4 text-center"><p className="text-white mb-4">إضافة المقررات الافتراضية؟</p><button onClick={handleSeedCourses} disabled={isSeeding} className="w-full py-3 bg-purple-600 text-white rounded-xl">{isSeeding?'جاري...':'تأكيد'}</button></div></Modal>
            <Modal isOpen={isCourseModalOpen} onClose={() => setCourseModalOpen(false)} title="المقرر" isRamadanMode={isRamadanMode}><form onSubmit={handleAddCourse} className="space-y-4"><input type="text" value={courseFormState.name} onChange={(e) => setCourseFormState({...courseFormState, name: e.target.value})} className="w-full p-3 bg-slate-800 text-white rounded-xl" placeholder="الاسم"/><button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl">حفظ</button></form></Modal>
            <Modal isOpen={courseToDelete !== null} onClose={() => setCourseToDelete(null)} title="حذف" isRamadanMode={isRamadanMode}><div className="p-4 text-center"><p className="text-white mb-4">تأكيد حذف المقرر؟</p><button onClick={handleDeleteCourse} className="w-full py-3 bg-red-600 text-white rounded-xl">حذف</button></div></Modal>
            <Modal isOpen={isImportModalOpen} onClose={() => setImportModalOpen(false)} title="استيراد" isRamadanMode={isRamadanMode}><form onSubmit={handleImportStudents} className="space-y-4"><input type="file" accept=".csv,.xlsx" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="w-full p-3 bg-slate-800 text-white rounded-xl"/><button type="submit" disabled={isImporting} className="w-full py-3 bg-blue-600 text-white rounded-xl">استيراد</button></form></Modal>
        </div>
    );
};

export default AdminDashboard;