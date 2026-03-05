import React, { useState, useEffect, useMemo } from 'react';
import { Student, AttendanceRecord, Lecture, Group, Batch, Course } from '../types';
import Modal from './Modal';
import { UsersIcon, ClipboardListIcon, EditIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, UnplugIcon, CalendarIcon, CopyIcon, TrashIcon } from './icons';
import { 
    getBatches, 
    promoteBatches, 
    deleteBatchData, 
    createBatches, 
    saveBatches,
    getStudents,
    getGroups,
    getCourses,
    addCourse,
    updateCourse,
    deleteCourse,
    seedCourses,
    setLastCourseName,
    getLastCourseName,
    updateGroup,
    deleteAllGroups,
    deleteStudents,
    importStudents
} from '../services/api';
import QRCodeDisplay from './QRCodeDisplay';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useAutoAnimate } from '@formkit/auto-animate/react';

interface AdminDashboardProps {
    students: Student[];
    groups: Group[];
    attendanceRecords: AttendanceRecord[];
    lectures: Lecture[];
    batches: Batch[];
    setBatches: React.Dispatch<React.SetStateAction<Batch[]>>;
    onAddStudent: (student: Omit<Student, 'id'>) => void;
    onUpdateStudent: (id: string, updates: Partial<Student>) => void;
    onGenerateQrCode: (details: {date: string, timeSlot: string, courseName: string, courseId?: string, batchId: string, isManual?: boolean}, callbacks: {onSuccess: () => void, onError: (message: string) => void}) => void;
    onManualAttendance: (studentId: string, lectureId: string) => void;
    onRemoveAttendance: (studentId: string, lectureId: string) => void;
    onResetStudentDevice: (studentId: string) => void;
    onResetAllDevices: () => void;
    onRepeatPreviousAttendance: (targetLectureId: string) => Promise<{ success: boolean; message: string; }>;
    onDeleteLecture: (lectureId: string) => void;
    onDeleteStudent: (studentId: string) => void;
    onUpdateGroupName: (groupId: string, newName: string) => void;
    onAddGroupLocal: (groupName: string) => void;
    onDeleteAllGroupsLocal: () => void;
    deviceBindingEnabled: boolean;
    onToggleDeviceBinding: (enabled: boolean) => void;
    absencePercentageEnabled: boolean;
    onToggleAbsencePercentage: (enabled: boolean) => void;
    onClearAllAttendance: () => void;
    onClearAllLectures: () => void;
    isRamadanMode: boolean;
    selectedBatchId: string | null;
    courses: Course[];
    setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
    onResetBatch: () => void;
    onChangeBatch: (batchId: string) => void;
    onRecalculateSerials: () => void;
    onRefreshStudents: () => Promise<void>;
    locationRestrictionEnabled: boolean; 
    onToggleLocationRestriction: (enabled: boolean) => void; 
    onClearLectureAttendance: (lectureId: string) => void;
    onDeleteGroupLocal: any;
}

const formatTimeToArabic = (time24: string) => {
    if (!time24) return '';
    const [hourString, minute] = time24.split(':');
    let hour = parseInt(hourString, 10);
    const ampm = hour >= 12 ? 'م' : 'ص';
    hour = hour % 12;
    hour = hour ? hour : 12; // تحويل الصفر إلى 12
    const paddedHour = hour.toString().padStart(2, '0');
    return `${paddedHour}:${minute} ${ampm}`;
};

const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
    const { 
        students, groups, attendanceRecords, lectures, batches, setBatches, onAddStudent, onUpdateStudent, onUpdateGroupName,
        onAddGroupLocal, onDeleteAllGroupsLocal,
        onGenerateQrCode, onManualAttendance, onRemoveAttendance, onResetStudentDevice,
        onResetAllDevices, onRepeatPreviousAttendance, onDeleteLecture, onDeleteStudent,
        deviceBindingEnabled, onToggleDeviceBinding, absencePercentageEnabled, onToggleAbsencePercentage, onClearAllAttendance, onClearAllLectures, isRamadanMode,
        selectedBatchId, courses, setCourses, onResetBatch, onChangeBatch, onRecalculateSerials, onRefreshStudents, 
        locationRestrictionEnabled, onToggleLocationRestriction,
        onClearLectureAttendance
    } = props;

    const currentBatch = useMemo(() => batches.find(b => b.id === selectedBatchId), [batches, selectedBatchId]);

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

    const TabButton: React.FC<{ isActive: boolean; onClick: () => void; title: string; icon: React.ReactNode }> = ({ isActive, onClick, title, icon }) => (
        <button
            onClick={onClick}
            className={`flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 transform transform-gpu ${
                isActive
                    ? (isRamadanMode ? 'bg-yellow-500 text-slate-900 shadow-lg shadow-yellow-500/30 scale-105' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 scale-105')
                    : 'text-gray-400 hover:bg-slate-800/80 hover:text-white'
            }`}
        >
            <span className={`${isActive ? (isRamadanMode ? 'text-slate-900' : 'text-white') : 'text-blue-400'}`}>{icon}</span>
            <span>{title}</span>
        </button>
    );

    const StatCard: React.FC<{ title: string, value: string | number, icon: React.ReactNode, colorClass: string }> = ({ title, value, icon, colorClass }) => (
        <div className={`backdrop-blur-xl border p-5 rounded-2xl flex items-center justify-between group transition-all transform-gpu ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'}`}>
            <div>
                <p className={`text-sm font-medium mb-1 ${isRamadanMode ? 'text-gray-300' : 'text-gray-400'}`}>{title}</p>
                <p className={`text-2xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>{value}</p>
            </div>
            <div className={`p-3 rounded-xl ${isRamadanMode ? 'bg-yellow-500/10 text-[#D4AF37]' : colorClass + ' bg-opacity-10'} group-hover:scale-110 transition-transform transform-gpu`}>
                {icon}
            </div>
        </div>
    );

    const [activeTab, setActiveTab] = useState<'attendance' | 'students' | 'calendar' | 'groups' | 'batches' | 'courses' | 'dashboard'>(() => {
        return (sessionStorage.getItem('adminActiveTab') as any) || 'dashboard';
    });

    useEffect(() => {
        sessionStorage.setItem('adminActiveTab', activeTab);
    }, [activeTab]);

    const [animationParent] = useAutoAnimate();
    const [isPromoteModalOpen, setPromoteModalOpen] = useState(false);
    const [isPromoting, setIsPromoting] = useState(false);
    const [showUndoPromotion, setShowUndoPromotion] = useState(false);
    const [attendanceGroupFilter, setAttendanceGroupFilter] = useState<string | 'all'>('all');

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
    
    const [isSeeding, setIsSeeding] = useState(false);
    const handleSeedCourses = async () => {
        if (!confirm('هل أنت متأكد من إضافة المقررات الافتراضية لهذه الدفعة؟')) return;
        const batch = batches.find(b => b.id === selectedBatchId);
        if (!batch) return;

        setIsSeeding(true);
        try {
            const result = await seedCourses(batch.id);
            if (result.error) {
                alert(`فشل إضافة المقررات: ${result.error}`);
            } else {
                alert('تم إضافة المقررات بنجاح!');
                const updatedCourses = await getCourses(selectedBatchId!);
                if (updatedCourses.data) setCourses(updatedCourses.data);
            }
        } catch (error) {
            console.error(error);
            alert('حدث خطأ غير متوقع');
        } finally {
            setIsSeeding(false);
        }
    };

    const [isStudentModalOpen, setStudentModalOpen] = useState(false);
    const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
    const [isCourseModalOpen, setCourseModalOpen] = useState(false);
    const [courseFormState, setCourseFormState] = useState({ id: '', name: '', code: '', creditHours: 0, weeks: 0, absenceLimit: 25, absenceWeight: 2.5 });
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [formState, setFormState] = useState({ 
        name: '', 
        universityId: '', 
        serialNumber: '', 
        isBatchLeader: false,
        isLeader: false,
        groupId: '',
        batchId: selectedBatchId
    });
    const [isQrModalOpen, setQrModalOpen] = useState(false);
    const [qrForm, setQrForm] = useState({ 
        date: new Date().toISOString().split('T')[0], 
        startTime: '08:00', 
        endTime: '09:00', 
        lectureName: '',
        isManual: false // 👈 الحقل الجديد
    });
    
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

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(studentSearchQuery);
        }, 300);
        return () => clearTimeout(handler);
    }, [studentSearchQuery]);
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
        let totalAbsenceRate = 0;
        let studentCount = students.length;

        if (studentCount > 0 && lectures.length > 0) {
            const presentMap = new Set();
            attendanceRecords.forEach(r => {
                presentMap.add(`${r.studentId}-${r.lectureId}`);
            });

            let totalStudentAbsence = 0;

            students.forEach(student => {
                let studentAbsence = 0;
                lectures.forEach(lecture => {
                    const course = courses.find(c => c.id === lecture.courseId);
                    const weight = course?.absenceWeight ?? 2.5; 
                    if (!presentMap.has(`${student.id}-${lecture.id}`)) {
                        studentAbsence += weight;
                    }
                });
                totalStudentAbsence += studentAbsence;
            });

            totalAbsenceRate = totalStudentAbsence / studentCount;
        }

        return {
            studentCount,
            absenceRate: totalAbsenceRate.toFixed(1)
        };
    }, [students, lectures, attendanceRecords, courses]);

    // 💡 جلب آخر مقرر تم اختياره، وحفظ أي تغيير جديد
    useEffect(() => {
        if (courses.length > 0 && !selectedCourseId) {
            const savedCourseId = localStorage.getItem('lastSelectedCourseId');
            const isValidSavedCourse = courses.some(c => c.id === savedCourseId);
            
            if (savedCourseId && isValidSavedCourse) {
                setSelectedCourseId(savedCourseId);
            } else {
                setSelectedCourseId(courses[0].id);
            }
        }
    }, [courses, selectedCourseId]);

    useEffect(() => {
        if (selectedCourseId) {
            localStorage.setItem('lastSelectedCourseId', selectedCourseId);
        }
    }, [selectedCourseId]);

    const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newStart = e.target.value;
        const [h, m] = newStart.split(':');
        let endH = (parseInt(h, 10) + 1).toString().padStart(2, '0');
        if (endH === '24') endH = '00';
        setQrForm(p => ({ ...p, startTime: newStart, endTime: `${endH}:${m}` }));
    };

    const handleQrFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // 💡 قراءة أي زر تم الضغط عليه للتو
        const isManualMode = (e.nativeEvent as any).submitter?.name === 'manualBtn';

        if (!selectedBatchId) {
            toast.error('الرجاء اختيار الدفعة أولاً');
            return;
        }

        const selectedCourse = courses.find(c => c.id === selectedCourseId);
        if (!selectedCourse) {
            toast.error('الرجاء اختيار المقرر أولاً');
            return;
        }

        setIsCreatingQr(true);
        setQrError(null);

        let finalLectureName = qrForm.lectureName.trim();
        if (!finalLectureName) {
            const lectureCount = lectures.filter(l => l.courseId === selectedCourse.id).length + 1;
            finalLectureName = `${selectedCourse.name} - محاضرة ${lectureCount}`;
        }

        const details = {
            date: qrForm.date,
            timeSlot: `${formatTimeToArabic(qrForm.startTime)} - ${formatTimeToArabic(qrForm.endTime)}`,
            courseName: finalLectureName,
            courseId: selectedCourse.id,
            batchId: selectedBatchId,
            isManual: isManualMode // 👈 نمرر القيمة هنا مباشرة
        };

        onGenerateQrCode(details, {
            onSuccess: () => {
                setLastCourseName(finalLectureName);
                setQrModalOpen(false);
                setIsCreatingQr(false);
                setQrForm(p => ({ ...p, lectureName: '' }));
                
                // 💡 التعديلات الجديدة للانتقال التلقائي:
                setSelectedDateFilter(qrForm.date); // التبديل لتاريخ المحاضرة الجديدة
                setSelectedLectureId(null); // تصفير الاختيار يجبر النظام على التقاط أحدث محاضرة تلقائياً
                setActiveTab('attendance'); // فتح تبويب الحضور فوراً
            },
            onError: (message: string) => {
                setIsCreatingQr(false);
                setQrError(message);
                toast.error(message);
            }
        });
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

    const handleAddCourse = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!courseFormState.name || !currentBatch) return;

        if (courseFormState.id) {
            const result = await updateCourse(courseFormState.id, {
                name: courseFormState.name,
                code: courseFormState.code,
                creditHours: Number(courseFormState.creditHours),
                weeks: Number(courseFormState.weeks),
                absenceLimit: Number(courseFormState.absenceLimit),
                absenceWeight: Number(courseFormState.absenceWeight)
            });

            if (result.data) {
                setCourses(courses.map(c => c.id === courseFormState.id ? result.data! : c));
                setCourseModalOpen(false);
            } else {
                alert('فشل تحديث المقرر: ' + result.error);
            }
        } else {
            const result = await addCourse({
                name: courseFormState.name,
                code: courseFormState.code,
                academicYear: currentBatch.currentYear,
                creditHours: Number(courseFormState.creditHours),
                weeks: Number(courseFormState.weeks),
                absenceLimit: Number(courseFormState.absenceLimit),
                absenceWeight: Number(courseFormState.absenceWeight)
            });

            if (result.data) {
                setCourses([...courses, result.data]);
                setCourseModalOpen(false);
            } else {
                alert('فشل إضافة المقرر: ' + result.error);
            }
        }
    };

    const handleDeleteCourse = async (courseId: string) => {
        if (confirm('هل أنت متأكد من حذف هذا المقرر؟ سيتم حذف جميع المحاضرات المرتبطة به.')) {
            const result = await deleteCourse(courseId);
            if (!result.error) {
                setCourses(courses.filter(c => c.id !== courseId));
            } else {
                alert('فشل حذف المقرر: ' + result.error);
            }
        }
    };

    const renderDashboardTab = () => {
        return (
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
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
                            <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
                                        <UsersIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-bold">إجمالي الطلاب (الحالي)</p>
                                        <p className="text-2xl font-black text-white">{students.length}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500">
                                        <ClipboardListIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-bold">المحاضرات (الحالي)</p>
                                        <p className="text-2xl font-black text-white">{lectures.length}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-bold">المقررات (الحالي)</p>
                                        <p className="text-2xl font-black text-white">{courses.length}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 rounded-2xl bg-red-500/10 text-red-500">
                                        <AlertTriangleIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-xs font-bold">متوسط الغياب (الحالي)</p>
                                        <p className="text-2xl font-black text-white">{batchStats?.absenceRate || 0}%</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-800/50 rounded-3xl border border-slate-700/50 p-6 animate-fade-in">
                            <h3 className="text-xl font-bold text-white mb-6">نظرة عامة على الدفعات</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {batches.map(batch => (
                                    <div key={batch.id} onClick={() => onChangeBatch(batch.id)} className={`cursor-pointer bg-slate-900/50 border p-4 rounded-2xl flex flex-col gap-2 transition-all transform-gpu ${batch.id === selectedBatchId ? 'border-blue-500/50 shadow-lg shadow-blue-500/10' : 'border-slate-700 hover:border-slate-500'}`}>
                                        <div className="flex justify-between items-center">
                                            <p className="font-bold text-white text-lg">{batch.batchName}</p>
                                            <span className={`text-[10px] px-2 py-1 rounded-full border ${batch.isArchived ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                                                {batch.isArchived ? 'مؤرشف' : 'نشط'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-slate-800">
                                            <span>عدد الطلاب:</span>
                                            <span className="font-mono font-bold text-gray-300">
                                                {batch.id === selectedBatchId ? batchStats?.studentCount : batch.studentCount || '--'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-gray-400">
                                            <span>متوسط الغياب:</span>
                                            <span className="font-mono font-bold text-gray-300">
                                                {batch.id === selectedBatchId ? (batchStats?.absenceRate || 0) + '%' : '--'}
                                            </span>
                                        </div>
                                        {batch.id === selectedBatchId && (
                                            <div className="mt-2 text-center">
                                                <span className="text-[10px] text-blue-400 font-bold">أنت تشاهد هذه الدفعة الآن</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    };

    const renderCoursesTab = () => (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h2 className="text-xl font-bold text-white">إدارة المقررات</h2>
                <div className="flex gap-2">
                    <button 
                        onClick={handleSeedCourses}
                        disabled={isSeeding}
                        className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all transform-gpu shadow-lg ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20'} disabled:opacity-50`}
                    >
                        {isSeeding ? 'جاري الإضافة...' : 'إضافة المقررات الافتراضية'}
                    </button>
                    <button 
                        onClick={() => {
                            setCourseFormState({ id: '', name: '', code: '', creditHours: 0, weeks: 0, absenceLimit: 25, absenceWeight: 2.5 });
                            setCourseModalOpen(true);
                        }}
                        className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all transform-gpu shadow-lg ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'}`}
                    >
                        إضافة مقرر جديد
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {courses.map(course => (
                    <div key={course.id} className="bg-slate-800/50 border border-slate-700 p-6 rounded-3xl relative group hover:border-slate-600 transition-all transform-gpu">
                        <div className="absolute top-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={() => {
                                    setCourseFormState({
                                        id: course.id, 
                                        name: course.name, 
                                        code: course.code || '', 
                                        creditHours: course.creditHours || 0, 
                                        weeks: course.weeks || 0, 
                                        absenceLimit: course.absenceLimit || 25,
                                        absenceWeight: course.absenceWeight || 2.5
                                    });
                                    setCourseModalOpen(true);
                                }}
                                className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl transition-colors transform-gpu"
                                title="تعديل المقرر"
                            >
                                <EditIcon className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => handleDeleteCourse(course.id)}
                                className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-colors transform-gpu"
                                title="حذف المقرر"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-3">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                            </div>
                            <h3 className="font-bold text-white text-xl mb-1">{course.name}</h3>
                            <p className="text-sm text-gray-400 font-mono">{course.code || 'بدون رمز'}</p>
                        </div>
                        <div className="flex flex-col gap-2 text-xs text-gray-400 bg-slate-900/50 p-3 rounded-2xl w-full">
                            <div className="flex justify-between items-center">
                                <span>الساعات المعتمدة:</span>
                                <span className="text-blue-400 font-bold">{course.creditHours || '--'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span>الأسابيع:</span>
                                <span className="text-purple-400 font-bold">{course.weeks || '--'}</span>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-800 pt-2 mt-1">
                                <span>حد الحرمان المسموح:</span>
                                <span className="text-red-400 font-bold">{course.absenceLimit || 25}%</span>
                            </div>
                            <div className="flex justify-between items-center mt-1">
                                <span>ثقل الغياب (للمحاضرة):</span>
                                <span className="text-yellow-400 font-bold">{course.absenceWeight || 2.5}%</span>
                            </div>
                        </div>
                    </div>
                ))}
                {courses.length === 0 && (
                    <div className="col-span-full text-center py-16 bg-slate-800/30 rounded-3xl border border-slate-800 border-dashed">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 mx-auto text-slate-600 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                        <p className="text-gray-400 font-bold text-lg">لا توجد مقررات مضافة</p>
                        <p className="text-gray-500 text-sm mt-2">قم بإضافة مقررات لهذه الدفعة للبدء في إنشاء المحاضرات.</p>
                        <button 
                            onClick={() => {
                                setCourseFormState({ id: '', name: '', code: '', creditHours: 0, weeks: 0, absenceLimit: 25, absenceWeight: 2.5 });
                                setCourseModalOpen(true);
                            }}
                            className="mt-6 px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold transition-colors"
                        >
                            إضافة مقرر
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    const sortedStudents = useMemo(() => {
        return [...students].sort((a, b) => Number(a.serialNumber) - Number(b.serialNumber));
    }, [students]);

    const uniqueLectureDates = useMemo(() => {
        const dates = Array.from(new Set(lectures.map(l => l.date)));
        return dates.sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime());
    }, [lectures]);

    const filteredLectures = useMemo(() => {
        if (!selectedDateFilter) return [];
        return lectures
            .filter(l => l.date === selectedDateFilter)
            .sort((a: Lecture, b: Lecture) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [lectures, selectedDateFilter]);

    useEffect(() => {
        if (!selectedDateFilter && uniqueLectureDates.length > 0) {
            setSelectedDateFilter(uniqueLectureDates[0]);
        }
    }, [uniqueLectureDates, selectedDateFilter]);

    useEffect(() => {
        if (filteredLectures.length > 0) {
            const currentExists = filteredLectures.find(l => l.qrCode === selectedLectureId);
            if (!currentExists) {
                setSelectedLectureId(filteredLectures[0].qrCode);
            }
        } else if (selectedDateFilter) {
            setSelectedLectureId(null);
        }
    }, [filteredLectures, selectedLectureId, selectedDateFilter]);
    
    useEffect(() => {
        getLastCourseName().then(name => {
            if (name) {
                setQrForm(prev => ({ ...prev, courseName: name }));
            }
        });
    }, []);

    const handleDateFilterChange = (date: string) => {
        setSelectedDateFilter(date);
    };

    const handleOpenModal = (student: Student | null = null) => {
        setCurrentStudent(student);
        setFormState(student ? { 
            name: student.name, 
            universityId: student.universityId, 
            serialNumber: student.serialNumber,
            isBatchLeader: student.isBatchLeader || false,
            isLeader: student.isLeader || false,
            groupId: student.groupId || '',
            batchId: student.batchId || selectedBatchId
        } : { 
            name: '', 
            universityId: '', 
            serialNumber: '',
            isBatchLeader: false,
            isLeader: false,
            groupId: '',
            batchId: selectedBatchId
        });
        setStudentModalOpen(true);
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            name: formState.name,
            universityId: formState.universityId,
            isBatchLeader: formState.isBatchLeader,
            isLeader: formState.isLeader,
            groupId: formState.groupId,
            batchId: formState.batchId,
            serialNumber: formState.serialNumber
        };

        if (currentStudent) {
            onUpdateStudent(currentStudent.id, payload);
        } else {
            onAddStudent(payload);
        }
        setStudentModalOpen(false);
    };

    const handleAddGroup = (e: React.FormEvent) => {
        e.preventDefault();
        if (groupName.trim()) {
            onAddGroupLocal(groupName.trim());
            setGroupModalOpen(false);
            setGroupName('');
        }
    };

    const handleEditGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!groupToEdit) return;
        try {
            const { data, error } = await updateGroup(groupToEdit.id, groupName);
            if (error) {
                alert(error);
                return;
            }
            
            const currentMemberIds = new Set(students.filter(s => s.groupId === groupToEdit.id).map(s => s.id));
            const toAdd = Array.from(selectedGroupStudentIds).filter(id => !currentMemberIds.has(id));
            const toRemove = Array.from(currentMemberIds).filter(id => !selectedGroupStudentIds.has(id));
            
            await Promise.all([
                ...toAdd.map(id => {
                    const s = students.find(st => st.id === id);
                    if (s) return onUpdateStudent(s.id, { groupId: groupToEdit.id });
                    return Promise.resolve();
                }),
                ...toRemove.map(id => {
                    const s = students.find(st => st.id === id);
                    if (s) return onUpdateStudent(s.id, { groupId: '' });
                    return Promise.resolve();
                })
            ]);

            if (data) {
                onUpdateGroupName(data.id, data.name);
                setEditGroupModalOpen(false);
                setGroupName('');
                setGroupToEdit(null);
                setSelectedGroupStudentIds(new Set());
            }
        } catch (err) {
            alert('حدث خطأ أثناء تحديث المجموعة والطلاب');
        }
    };

    const handleOpenEditGroupModal = (group: Group) => {
        setGroupToEdit(group);
        setGroupName(group.name);
        const memberIds = students.filter(s => s.groupId === group.id).map(s => s.id);
        setSelectedGroupStudentIds(new Set(memberIds));
        setStudentSearchQuery('');
        setEditGroupModalOpen(true);
    };

    const handleOpenQrModal = () => {
        setQrError(null);
        setIsCreatingQr(false);
        setQrModalOpen(true);
    };
    
    const handleGenerateNewClick = () => {
        if (activeLecture) {
            setConfirmModalOpen(true);
        } else {
            handleOpenQrModal();
        }
    };

    const handleConfirmGenerateNew = () => {
        setConfirmModalOpen(false);
        handleOpenQrModal();
    };

    const handleOpenResetModal = (student: Student) => {
        setStudentToReset(student);
        setResetModalOpen(true);
    };

    const handleConfirmReset = () => {
        if (studentToReset) {
            onResetStudentDevice(studentToReset.id);
        }
        setResetModalOpen(false);
        setStudentToReset(null);
    };

    const handleConfirmResetAll = () => {
        onResetAllDevices();
        setResetAllModalOpen(false);
    };

    const handleConfirmDeleteLecture = () => {
        if (selectedLectureId) {
            onDeleteLecture(selectedLectureId);
            setDeleteLectureModalOpen(false);
        }
    };

    const handleOpenDeleteStudentModal = (student: Student) => {
        setStudentToDelete(student);
        setDeleteStudentModalOpen(true);
    };

    const handleConfirmDeleteStudent = () => {
        if (studentToDelete) {
            onDeleteStudent(studentToDelete.id);
            setDeleteStudentModalOpen(false);
            setStudentToDelete(null);
        }
    };

    const handleConfirmClearAttendance = () => {
        onClearAllAttendance();
        setClearAttendanceModalOpen(false);
    };

    const handleConfirmClearLectures = () => {
        onClearAllLectures();
        setClearLecturesModalOpen(false);
    };

    const handleConfirmDeleteAllGroups = async () => {
        const { error } = await deleteAllGroups();
        if (error) {
            alert(error);
        } else {
            onDeleteAllGroupsLocal();
            alert('تم مسح جميع المجموعات بنجاح.');
        }
        setDeleteAllGroupsModalOpen(false);
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

    const handleConfirmDeleteStudents = async () => {
        setIsDeletingStudents(true);
        try {
            if(!selectedBatchId) return;
            const result = await deleteStudents(selectedBatchId);
            if (result.error) {
                alert('حدث خطأ أثناء حذف الطلاب: ' + result.error);
            } else {
                setDeleteStudentsModalOpen(false);
                if (onRefreshStudents) await onRefreshStudents();
            }
        } catch (error) {
            console.error(error);
            alert('حدث خطأ غير متوقع');
        } finally {
            setIsDeletingStudents(false);
        }
    };

    const handleImportStudents = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importFile || !selectedBatchId) return;

        setIsImporting(true);
        setImportResult(null);

        try {
            let parsedStudents: { name: string, universityId: string }[] = [];

            if (importFile.name.endsWith('.csv')) {
                const text = await importFile.text();
                parsedStudents = await new Promise<{ name: string, universityId: string }[]>((resolve) => {
                    Papa.parse(text, {
                        header: true,
                        skipEmptyLines: true,
                        complete: (results) => {
                            const students = results.data.map((row: any) => ({
                                name: row['الاسم'] || row['name'] || '',
                                universityId: String(row['الرقم الجامعي'] || row['university_id'] || '').trim()
                            })).filter(s => s.name && s.universityId);
                            resolve(students);
                        }
                    });
                });
            } else if (importFile.name.endsWith('.xlsx') || importFile.name.endsWith('.xls')) {
                const data = await importFile.arrayBuffer();
                const workbook = XLSX.read(data);
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                
                parsedStudents = json.map((row: any) => ({
                    name: row['الاسم'] || row['name'] || '',
                    universityId: String(row['الرقم الجامعي'] || row['university_id'] || '').trim()
                })).filter(s => s.name && s.universityId);
            } else {
                alert('صيغة الملف غير مدعومة. يرجى استخدام ملفات CSV أو Excel.');
                setIsImporting(false);
                return;
            }

            if (parsedStudents.length === 0) {
                alert('لم يتم العثور على بيانات صحيحة في الملف. تأكد من وجود أعمدة "الاسم" أو "name" و "الرقم الجامعي" أو "university_id".');
                setIsImporting(false);
                return;
            }

            const result = await importStudents(selectedBatchId, parsedStudents);
            if (!result.error && result.data) {
                setImportResult(result.data);
                if (result.data.imported > 0) {
                    await onRefreshStudents();
                }
            } else {
                alert(result.error || 'حدث خطأ أثناء الاستيراد');
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('حدث خطأ غير متوقع أثناء قراءة الملف.');
        } finally {
            setIsImporting(false);
        }
    };
    
    const attendanceData = useMemo(() => {
        if (!selectedLectureId) return [];
        const selectedLecture = lectures.find(l => l.qrCode === selectedLectureId || l.id === selectedLectureId);
        const actualLectureId = selectedLecture?.id || selectedLectureId;
        const currentAttendance = attendanceRecords.filter(rec => rec.lectureId === actualLectureId || rec.lectureId === selectedLectureId);
        const presentStudentIds = new Set(currentAttendance.map(rec => rec.studentId));
        const groupsWithAnyPresence = new Set<string>();
        students.forEach(s => { if (s.groupId && presentStudentIds.has(s.id)) groupsWithAnyPresence.add(s.groupId); });

        // 💡 تطبيق الفلتر الخاص بعرض مجموعة محددة للأدمن
        let displayStudents = students;
        if (attendanceGroupFilter !== 'all') {
            displayStudents = students.filter(s => s.groupId === attendanceGroupFilter);
        }

        return displayStudents.map(student => {
            const isPresent = presentStudentIds.has(student.id);
            const record = isPresent ? currentAttendance.find(r => r.studentId === student.id) : null;
            const status = isPresent ? 'حاضر' : 'غائب';
            const isGroupActive = student.groupId ? groupsWithAnyPresence.has(student.groupId) : false;
            return { ...student, status, record, isGroupActive, actualLectureId };
        }).sort((a, b) => Number(a.serialNumber) - Number(b.serialNumber));
    }, [students, attendanceRecords, selectedLectureId, lectures, attendanceGroupFilter]);

    const handleExportPdf = async () => {
        const selectedLecture = lectures.find(l => l.qrCode === selectedLectureId);
        if (!selectedLecture) return;

        setIsExportingPdf(true);

        const isLightMode = attendanceData.length >= 200;

        if (isLightMode) {
            try {
                const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
                let yPos = 20;

                const addHeader = (page: number) => {
                    pdf.setFontSize(18);
                    pdf.text("تقرير الحضور - (وضع الأعداد الكبيرة)", 105, yPos, { align: 'center' });
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
                    pdf.text("المجموعة", 60, yPos);
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
                    pdf.text(student.groupName || '-', 60, yPos);
                    pdf.text(student.name, 185, yPos, { align: 'right' });
                    pdf.text(student.serialNumber, 195, yPos, { align: 'right' });
                    
                    yPos += 7;
                    if ((index + 1) % 5 === 0) pdf.setDrawColor(240); 
                });

                pdf.save(`Report-${selectedLecture.courseName}-Large.pdf`);
            } catch (error) {
                console.error("Light Export Error:", error);
                alert("حدث خطأ في التصدير الخفيف.");
            } finally {
                setIsExportingPdf(false);
            }
        } else {
            const styles = {
                container: "width: 794px; padding: 40px; background-color: white; direction: rtl; font-family: 'Tajawal', 'Amiri', sans-serif; color: #1e293b; box-sizing: border-box;",
                headerContainer: "display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px;",
                headerTextRight: "text-align: right;",
                headerTitle: "font-size: 28px; font-weight: bold; color: #0f172a; margin: 0 0 5px 0;",
                headerSubtitle: "font-size: 16px; color: #64748b; margin: 0;",
                headerTextLeft: "text-align: left;",
                printDate: "font-size: 12px; color: #94a3b8; margin: 0;",
                infoCard: "display: flex; justify-content: space-between; background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;",
                infoItem: "display: flex; flex-direction: column; border-left: 1px solid #cbd5e1; padding-left: 15px;",
                infoItemLast: "display: flex; flex-direction: column;",
                infoLabel: "font-size: 12px; color: #64748b; margin-bottom: 4px;",
                infoValue: "font-size: 14px; font-weight: bold; color: #0f172a;",
                table: "width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;",
                th: "background-color: #f1f5f9; color: #334155; padding: 12px 8px; text-align: right; border-bottom: 2px solid #cbd5e1; font-weight: bold;",
                td: "padding: 12px 8px; border-bottom: 1px solid #e2e8f0; color: #1e293b;",
                statusPresent: "background-color: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 9999px; font-size: 12px; font-weight: bold; display: inline-block;",
                statusAbsent: "background-color: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 9999px; font-size: 12px; font-weight: bold; display: inline-block;",
                footer: "text-align: center; color: #94a3b8; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: auto;"
            };

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const imgWidth = 210; 
            
            let remainingStudents = [...attendanceData];
            let pageNum = 1;
            
            const attendanceCount = attendanceData.filter(s => s.status === 'حاضر').length;

            try {
                while (remainingStudents.length > 0) {
                    const rowsPerPage = pageNum === 1 ? 10 : 18;
                    const pageBatch = remainingStudents.slice(0, rowsPerPage);
                    remainingStudents = remainingStudents.slice(rowsPerPage);

                    const container = document.createElement('div');
                    container.style.position = 'fixed';
                    container.style.top = '0';
                    container.style.left = '-9999px';
                    container.style.zIndex = '-9999';
                    container.style.cssText += styles.container;

                    let htmlContent = `<div>`;

                    if (pageNum === 1) {
                        htmlContent += `
                            <div style="${styles.headerContainer}">
                                <div style="${styles.headerTextRight}">
                                    <h1 style="${styles.headerTitle}">تقرير الحضور</h1>
                                    <p style="${styles.headerSubtitle}">${currentBatch?.batchName || ''}</p>
                                </div>
                                <div style="${styles.headerTextLeft}">
                                    <p style="${styles.printDate}">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                </div>
                            </div>

                            <div style="${styles.infoCard}">
                                <div style="${styles.infoItem}">
                                    <span style="${styles.infoLabel}">المقرر</span>
                                    <span style="${styles.infoValue}">${selectedLecture.courseName}</span>
                                </div>
                                <div style="${styles.infoItem}">
                                    <span style="${styles.infoLabel}">تاريخ المحاضرة</span>
                                    <span style="${styles.infoValue}">${selectedLecture.date}</span>
                                </div>
                                <div style="${styles.infoItem}">
                                    <span style="${styles.infoLabel}">التوقيت</span>
                                    <span style="${styles.infoValue}">${selectedLecture.timeSlot}</span>
                                </div>
                                <div style="${styles.infoItemLast}">
                                    <span style="${styles.infoLabel}">إحصائية الحضور</span>
                                    <span style="${styles.infoValue}" style="color: #2563eb;">${attendanceCount} / ${attendanceData.length}</span>
                                </div>
                            </div>
                        `;
                    } else {
                        htmlContent += `<div style="height: 20px;"></div>`;
                    }

                    htmlContent += `
                        <table style="${styles.table}">
                            <thead>
                                <tr>
                                    <th style="${styles.th}">#</th>
                                    <th style="${styles.th}">الرقم الجامعي</th>
                                    <th style="${styles.th}">اسم الطالب</th>
                                    <th style="${styles.th}">المجموعة</th>
                                    <th style="${styles.th}">الحالة</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;

                    pageBatch.forEach((student) => {
                        const isAbsent = student.status === 'غائب';
                        const globalIndex = attendanceData.indexOf(student);
                        const rowBg = globalIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                        const finalBg = isAbsent ? '#fff1f2' : rowBg; 
                        
                        let displayStatus = student.status;
                        let badgeStyle = styles.statusAbsent;
                        
                        if (student.status === 'حاضر') {
                             displayStatus = 'حاضر';
                             badgeStyle = styles.statusPresent;
                        }
                        
                        let statusBadge = `<span style="${badgeStyle}">${displayStatus}</span>`;
                        
                        if (student.record?.isOutsideRadius) {
                            statusBadge += `<div style="font-size: 10px; color: #d97706; margin-top: 2px;">(تنبيه: خارج النطاق)</div>`;
                        }

                        htmlContent += `
                            <tr style="background-color: ${finalBg};">
                                <td style="${styles.td}">${student.serialNumber}</td>
                                <td style="${styles.td} font-family: 'Tajawal', sans-serif;">${student.universityId}</td>
                                <td style="${styles.td} text-align: right; padding-right: 20px;">${student.name}</td>
                                <td style="${styles.td}">${student.groupName || '-'}</td>
                                <td style="${styles.td}">${statusBadge}</td>
                            </tr>
                        `;
                    });

                    htmlContent += `
                            </tbody>
                        </table>
                    `;

                    htmlContent += `
                        <div style="${styles.footer}">
                            تم إنشاء هذا التقرير آلياً. - صفحة ${pageNum}
                        </div>
                    </div>`; 

                    container.innerHTML = htmlContent;
                    document.body.appendChild(container);

                    const canvas = await html2canvas(container, { 
                        scale: 1.2, 
                        useCORS: true,
                        logging: false,
                        ignoreElements: (element: any) => element.id === 'root',
                        onclone: (clonedDoc: any) => {
                            const links = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
                            links.forEach((link: any) => {
                                if (!link.href.includes('fonts.googleapis.com')) {
                                    link.remove();
                                }
                            });
                            const styles = clonedDoc.querySelectorAll('style');
                            styles.forEach((style: any) => style.remove());
                        }
                    });
                    
                    const imgData = canvas.toDataURL('image/jpeg', 0.8);
                    const imgProps = pdf.getImageProperties(imgData);
                    const pdfImgHeight = (imgProps.height * imgWidth) / imgProps.width;

                    if (pageNum > 1) {
                        pdf.addPage();
                    }

                    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, pdfImgHeight, undefined, 'FAST');
                    document.body.removeChild(container);
                    
                    pageNum++;
                }

                pdf.save(`attendance-${selectedLecture.courseName}-${selectedLecture.date}.pdf`);

            } catch (error) {
                console.error("Failed to generate PDF:", error);
                alert("حدث خطأ أثناء إنشاء ملف PDF.");
            } finally {
                setIsExportingPdf(false);
            }
        }
    };
    
    const handleConfirmRepeat = async () => {
        if (!selectedLectureId) return;
        setIsRepeating(true);
        setRepeatStatus(null);
        try {
            const result = await onRepeatPreviousAttendance(selectedLectureId);
            setRepeatStatus({
                type: result.success ? 'success' : 'error',
                message: result.message
            });
            setTimeout(() => { 
                setRepeatModalOpen(false); 
                setRepeatStatus(null); 
            }, 3000);
        } catch (error) {
            setRepeatStatus({ type: 'error', message: 'حدث خطأ غير متوقع' });
        } finally {
            setIsRepeating(false);
        }
    };

    const getStatusChip = (status: string, record?: AttendanceRecord | null) => {
        if (status === 'غائب') {
             return <span className={`px-3 py-1 text-xs font-bold rounded-full border ${isRamadanMode ? 'bg-red-900/10 text-red-500 border-red-900/20' : 'bg-red-900/30 text-red-400 border-red-800/50'}`}>غائب</span>;
        }

        return (
            <div className="flex items-center gap-2">
                <span className={`px-3 py-1 text-xs font-bold rounded-full border ${isRamadanMode ? 'ramadan-badge-gold' : 'bg-green-900/30 text-green-400 border-green-800/50'}`}>حاضر</span>
                {record?.isOutsideRadius && (
                    <div className="group relative">
                        <span className={`flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${isRamadanMode ? 'bg-yellow-900/10 text-yellow-500 border-yellow-700/50' : 'bg-yellow-900/30 text-yellow-500 border-yellow-700/50'}`}>
                            <AlertTriangleIcon className="w-3 h-3 me-1" />
                            بعيد
                        </span>
                    </div>
                )}
            </div>
        );
    };

    const getGroupBadge = (groupName: string | undefined, isGroupActive: boolean) => {
        if (!groupName) return '-';
        return (
            <span className={`px-2 py-1 text-[10px] font-black rounded-lg border shadow-sm transition-colors ${
                isRamadanMode 
                    ? 'ramadan-badge-gold'
                    : (isGroupActive ? 'bg-green-500/10 text-green-500 border-green-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30')
            }`}>
                {groupName}
            </span>
        );
    };

    const lectureDays = useMemo(() => {
        const days = new Set<string>();
        lectures.forEach(lecture => {
            const lectureDate = new Date(lecture.date);
            const dateString = `${lectureDate.getFullYear()}-${String(lectureDate.getMonth() + 1).padStart(2, '0')}-${String(lectureDate.getDate()).padStart(2, '0')}`;
            days.add(dateString);
        });
        return days;
    }, [lectures]);
    
    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const startDayOfWeek = firstDayOfMonth.getDay(); 
        const weekDays = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
    
        const calendarDays = [];
        for (let i = 0; i < startDayOfWeek; i++) {
            calendarDays.push(<div key={`pad-start-${i}`} className="p-2"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const fullDate = new Date(year, month, day);
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasLectures = lectureDays.has(dateString);
            const isSelected = selectedDate?.toDateString() === fullDate.toDateString();
            
            calendarDays.push(
                <div key={day} onClick={() => setSelectedDate(fullDate)} className={`w-8 h-8 sm:w-10 sm:h-10 mx-auto flex items-center justify-center rounded-full cursor-pointer transition-colors relative ${isSelected ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/30' : 'hover:bg-slate-700/50 text-gray-300'}`}>
                    {day}
                    {hasLectures && <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-400'}`}></span>}
                </div>
            );
        }
    
        return (
            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <h3 className="text-xl font-bold text-white">
                        {currentDate.toLocaleString('ar-EG', { month: 'long', year: 'numeric' })}
                    </h3>
                    <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-2 text-sm text-center text-gray-400">
                    {weekDays.map(day => <div key={day} className="font-bold pb-2">{day}</div>)}
                    {calendarDays}
                </div>
            </div>
        );
    };

    const lecturesOnSelectedDay = useMemo(() => {
        if (!selectedDate) return [];
        const dateStr = selectedDate.toISOString().split('T')[0];
        return [...lectures]
            .filter(l => l.date === dateStr)
            .sort((a: Lecture, b: Lecture) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }, [selectedDate, lectures]);

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight animate-slide-in-up">لوحة التحكم</h1>
                    <div className="flex items-center gap-2 text-sm text-gray-400 animate-fade-in">
                        <span className={`px-2 py-0.5 rounded-md ${isRamadanMode ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-400'}`}>{currentBatch?.batchName}</span>
                        <button onClick={onResetBatch} className="ms-2 text-xs text-blue-400 hover:text-blue-300 underline">تغيير الدفعة</button>
                    </div>
                </div>
                <div className="bg-slate-900/40 p-1.5 rounded-[1.25rem] flex flex-row overflow-x-auto whitespace-nowrap gap-1 border border-slate-800/60 animate-fade-in custom-scrollbar">
                    <TabButton isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} title="لوحة التحكم" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>} />
                    <TabButton isActive={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} title="الحضور" icon={<ClipboardListIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                    <TabButton isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} title="التقويم" icon={<CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                    <TabButton isActive={activeTab === 'students'} onClick={() => setActiveTab('students')} title="الطلاب" icon={<UsersIcon className="w-4 h-4 sm:w-5 sm:h-5"/>} />
                    <TabButton isActive={activeTab === 'courses'} onClick={() => setActiveTab('courses')} title="المقررات" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>} />
                    <TabButton isActive={activeTab === 'groups'} onClick={() => setActiveTab('groups')} title="المجموعات" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>} />
                    <TabButton isActive={activeTab === 'batches'} onClick={() => setActiveTab('batches')} title="الدفعات" icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h7"></path></svg>} />
                </div>
            </div>

            {activeTab === 'dashboard' && (
                <div className="animate-fade-in">
                    {renderDashboardTab()}
                </div>
            )}

            {activeTab !== 'dashboard' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-in-up" style={{ animationDelay: '100ms' }}>
                    <StatCard title="إجمالي الطلاب" value={stats.total} icon={<UsersIcon className="w-6 h-6 text-blue-400" />} colorClass="bg-blue-500" />
                    <StatCard title="حاضرون حالياً" value={stats.currentPresent} icon={<CheckCircleIcon className="w-6 h-6 text-green-400" />} colorClass="bg-green-500" />
                    <StatCard title="المجموعات النشطة" value={stats.totalGroups} icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>} colorClass="bg-purple-500" />
                </div>
            )}

            <div className="flex flex-col-reverse lg:grid lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <div className={`backdrop-blur-2xl border rounded-[2rem] shadow-2xl overflow-hidden animate-slide-in-up transition-all duration-500 ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/40 border-slate-800'}`} style={{ animationDelay: '200ms' }}>
                            <div key={activeTab} className="animate-fade-in">
                                {activeTab === 'courses' && (
                                    <div className="p-4 sm:p-8">
                                        {renderCoursesTab()}
                                    </div>
                                )}
                                {activeTab === 'attendance' && (
                                    <div className="p-4 sm:p-8">
                                        {!selectedBatchId ? (
                                            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                                                <ClipboardListIcon className="w-16 h-16 text-gray-600 opacity-20" />
                                                <p className="text-gray-400 font-medium">يرجى اختيار دفعة أولاً لعرض سجلات الحضور.</p>
                                                <button 
                                                    onClick={() => setActiveTab('dashboard')}
                                                    className="text-blue-400 hover:underline text-sm font-bold"
                                                >
                                                    الذهاب لاختيار الدفعة
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="mb-8">
                                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                                                        <h2 className={`text-2xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>سجلات الحضور</h2>
                                                        {activeLecture && (
                                                            <span className="flex items-center gap-2 text-[10px] font-black text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full border border-green-500/20">
                                                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> مباشر
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    {/* 💡 شريط يظهر عندما يكون الأدمن يستعرض مجموعة محددة */}
                                                    {attendanceGroupFilter !== 'all' && (
                                                        <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20 p-4 rounded-2xl mb-6">
                                                            <div className="flex items-center gap-3">
                                                                <UsersIcon className="w-5 h-5 text-purple-400" />
                                                                <span className="font-bold text-purple-300 text-sm">أنت الآن تستعرض سجل حضور مجموعة محددة فقط.</span>
                                                            </div>
                                                            <button onClick={() => setAttendanceGroupFilter('all')} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all transform-gpu">
                                                                عرض كل الطلاب
                                                            </button>
                                                        </div>
                                                    )}
                                        
                                                    <div className="flex gap-3 overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                                                        {uniqueLectureDates.length > 0 ? uniqueLectureDates.map((dateStr) => {
                                                            const date = new Date(dateStr);
                                                            const isSelected = selectedDateFilter === dateStr;
                                                            return (
                                                                <button
                                                                    key={dateStr}
                                                                    onClick={() => handleDateFilterChange(dateStr)}
                                                                    className={`flex flex-col items-center justify-center min-w-[85px] p-4 rounded-2xl border transition-all duration-300 transform-gpu ${
                                                                        isSelected 
                                                                            ? (isRamadanMode ? 'bg-yellow-600 border-yellow-500 text-white shadow-xl shadow-yellow-600/20 scale-105' : 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-600/20 scale-105')
                                                                            : 'bg-slate-800/40 border-slate-800 text-gray-400 hover:bg-slate-700/60 hover:border-slate-700'
                                                                    }`}
                                                                >
                                                                    <span className="text-xs font-bold opacity-70 mb-1">{date.toLocaleDateString('ar-EG', { weekday: 'short' })}</span>
                                                                    <span className="text-xl font-black">{date.getDate()}</span>
                                                                    <span className="text-[10px] uppercase tracking-tighter mt-1">{date.toLocaleDateString('ar-EG', { month: 'short' })}</span>
                                                                </button>
                                                            );
                                                        }) : (
                                                            <div className="text-gray-500 text-sm py-4 italic">لا توجد محاضرات مسجلة بعد.</div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap justify-between items-center gap-4 mb-6 sm:mb-8">
                                                    <div className="w-full sm:w-72">
                                                        <select 
                                                            value={selectedLectureId || ''}
                                                            onChange={(e) => setSelectedLectureId(e.target.value)}
                                                            className="block w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-xs sm:text-sm bg-slate-800/50 border-slate-700 text-white transition-all disabled:opacity-50"
                                                            disabled={!selectedDateFilter || filteredLectures.length === 0}
                                                        >
                                                            {filteredLectures.length === 0 ? (
                                                                <option value="">لا توجد محاضرات في هذا اليوم</option>
                                                            ) : (
                                                                filteredLectures.map(lecture => (
                                                                    <option key={lecture.qrCode} value={lecture.qrCode}>
                                                                        {lecture.courseName} | {lecture.timeSlot}
                                                                    </option>
                                                                ))
                                                            )}
                                                        </select>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                                                        <button 
                                                            onClick={() => setClearAttendanceModalOpen(true)}
                                                            disabled={!selectedLectureId}
                                                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu active:scale-90 border disabled:opacity-50 disabled:cursor-not-allowed ${
                                                                isRamadanMode 
                                                                    ? 'bg-red-600/10 border-red-500/20 text-red-400 hover:bg-red-600 hover:text-white' 
                                                                    : 'bg-red-600/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white'
                                                            }`}
                                                            title="تصفير / مسح التحضير"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                                                <path d="M3 3v5h5" />
                                                                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                                                                <path d="M16 21v-5h5" />
                                                            </svg>
                                                            <span className="text-xs sm:text-sm font-bold hidden sm:inline">مسح التحضير</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => setClearLecturesModalOpen(true)}
                                                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu active:scale-90 border ${
                                                                isRamadanMode 
                                                                    ? 'bg-red-600/10 border-red-500/20 text-red-400 hover:bg-red-600 hover:text-white' 
                                                                    : 'bg-red-600/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white'
                                                            }`}
                                                            title="مسح جميع المحاضرات والسجلات نهائياً"
                                                        >
                                                            <TrashIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                                            <span className="text-xs sm:text-sm font-bold hidden sm:inline">مسح المحاضرات</span>
                                                        </button>
                                                        <button onClick={() => setRepeatModalOpen(true)} disabled={!selectedLectureId} className="flex-1 sm:flex-none flex items-center justify-center p-2.5 sm:p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl sm:rounded-2xl transition-all transform-gpu active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed" title="تكرار الحضور">
                                                            <CopyIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                                        </button>
                                                        <button onClick={handleExportPdf} disabled={!selectedLectureId || isExportingPdf} className={`flex-[2] sm:flex-none font-bold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'}`}>
                                                            {isExportingPdf ? 'جاري التصدير...' : 'تصدير PDF'}
                                                        </button>
                                                        <button 
                                                            onClick={() => setDeleteLectureModalOpen(true)} 
                                                            disabled={!selectedLectureId} 
                                                            className="flex-1 sm:flex-none flex items-center justify-center p-2.5 sm:p-3 bg-red-600/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-xl sm:rounded-2xl transition-all transform-gpu active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            title="حذف المحاضرة نهائياً"
                                                        >
                                                            <TrashIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="block sm:hidden space-y-4">
                                                    {attendanceData.length > 0 ? attendanceData.map((item) => (
                                                        <div key={item.id} className="bg-slate-800/30 border border-slate-700/50 p-4 rounded-2xl flex flex-col gap-3 transition-all transform-gpu">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="bg-slate-700/50 text-gray-300 font-mono text-xs font-black px-2 py-1 rounded-lg border border-slate-600/50 shadow-sm">
                                                                            #{item.serialNumber}
                                                                        </span>
                                                                        <p className="text-white font-bold text-lg">{item.name}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <p className="text-gray-400 text-xs font-mono">ID: {item.universityId}</p>
                                                                        {getGroupBadge(item.groupName, item.isGroupActive)}
                                                                    </div>
                                                                </div>
                                                                {getStatusChip(item.status, item.record)}
                                                            </div>
                                                            <div className="flex justify-between items-center pt-2 border-t border-slate-700/30">
                                                                <span className="text-xs text-gray-500">{item.isLeader ? '(قائد المجموعة)' : ''}</span>
                                                                {item.status === 'غائب' ? (
                                                                    <button onClick={() => onManualAttendance(item.id, item.actualLectureId)} className="text-green-500 font-black text-sm flex items-center gap-1 transition-all transform-gpu">
                                                                        <CheckCircleIcon className="w-4 h-4"/> تحضير
                                                                    </button>
                                                                ) : (
                                                                    <button onClick={() => onRemoveAttendance(item.id, item.actualLectureId)} className="text-red-500 font-black text-sm flex items-center gap-1 transition-all transform-gpu">
                                                                        <XCircleIcon className="w-4 h-4"/> إلغاء
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )) : (
                                                        <div className="text-center py-12 text-gray-500 italic">لا توجد سجلات.</div>
                                                    )}
                                                </div>

                                                <div className="hidden sm:block overflow-hidden rounded-3xl border border-slate-800">
                                                    <table className="w-full text-sm text-right">
                                                        <thead className="text-xs uppercase bg-slate-800/80 text-gray-300">
                                                            <tr>
                                                                <th className="px-6 py-4">#</th>
                                                                <th className="px-6 py-4">اسم الطالب</th>
                                                                <th className="px-6 py-4">المجموعة</th>
                                                                <th className="px-6 py-4">الحالة</th>
                                                                <th className="px-6 py-4">تحكم</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-800 bg-slate-900/20">
                                                            {attendanceData.length > 0 ? attendanceData.map((item) => (
                                                                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors transform-gpu">
                                                                    <td className="px-6 py-4 font-mono text-gray-500">{item.serialNumber}</td>
                                                                    <td className="px-6 py-4 font-bold text-white">
                                                                        {item.name}
                                                                        {item.isLeader && <span className="mr-2 text-[8px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">قائد</span>}
                                                                    </td>
                                                                    <td className="px-6 py-4">{getGroupBadge(item.groupName, item.isGroupActive)}</td>
                                                                    <td className="px-6 py-4">{getStatusChip(item.status, item.record)}</td>
                                                                    <td className="px-6 py-4">
                                                                        {item.status === 'غائب' ? (
                                                                            <button onClick={() => onManualAttendance(item.id, item.actualLectureId)} className="text-green-500 hover:underline font-bold text-xs flex items-center gap-1 transition-all transform-gpu">
                                                                                <CheckCircleIcon className="w-4 h-4"/> تحضير
                                                                            </button>
                                                                        ) : (
                                                                            <button onClick={() => onRemoveAttendance(item.id, item.actualLectureId)} className="text-red-500 hover:underline font-bold text-xs flex items-center gap-1 transition-all transform-gpu">
                                                                                <XCircleIcon className="w-4 h-4"/> إلغاء
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            )) : (
                                                                <tr><td colSpan={5} className="text-center py-12 text-gray-500 italic">بانتظار تحديد محاضرة لعرض البيانات...</td></tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            {activeTab === 'calendar' && (
                                <div className="p-4 sm:p-6">
                                    {!selectedBatchId ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                                            <CalendarIcon className="w-16 h-16 text-gray-600 opacity-20" />
                                            <p className="text-gray-400 font-medium">يرجى اختيار دفعة أولاً لعرض التقويم.</p>
                                            <button 
                                                onClick={() => setActiveTab('dashboard')}
                                                className="text-blue-400 hover:underline text-sm font-bold"
                                            >
                                                الذهاب لاختيار الدفعة
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {renderCalendar()}
                                            {selectedDate && (
                                                <div className="mt-8 p-4 sm:p-8 border-t border-slate-800 animate-slide-in-up">
                                                    <h3 className="text-xl font-bold text-white mb-6">محاضرات يوم {selectedDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                                                    {lecturesOnSelectedDay.length > 0 ? (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {lecturesOnSelectedDay.map(lecture => {
                                                                const count = attendanceRecords.filter(rec => rec.lectureId === lecture.qrCode).length;
                                                                return (
                                                                    <div key={lecture.qrCode} className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50 flex items-center justify-between">
                                                                        <div>
                                                                            <p className="font-black text-blue-400">{lecture.courseName}</p>
                                                                            <p className="text-sm text-gray-400 mt-1">{lecture.timeSlot}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-2xl font-black text-white">{count}</p>
                                                                            <p className="text-[10px] text-gray-500 font-bold">حاضرون</p>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="text-center py-12 bg-slate-800/30 rounded-3xl text-gray-500 italic">لا توجد سجلات لهذا اليوم.</div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                                {activeTab === 'students' && (
                                    <div className="p-4 sm:p-8">
                                        {!selectedBatchId ? (
                                            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                                                <UsersIcon className="w-16 h-16 text-gray-600 opacity-20" />
                                                <p className="text-gray-400 font-medium">يرجى اختيار دفعة أولاً لعرض قائمة الطلاب.</p>
                                                <button 
                                                    onClick={() => setActiveTab('dashboard')}
                                                    className="text-blue-400 hover:underline text-sm font-bold"
                                                >
                                                    الذهاب لاختيار الدفعة
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap justify-between items-center gap-4 mb-6 sm:mb-8">
                                                    <h2 className={`text-xl sm:text-2xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>إدارة الطلاب</h2>
                                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                                                        <button 
                                                            onClick={() => onToggleAbsencePercentage(!absencePercentageEnabled)} 
                                                            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all transform-gpu border ${
                                                                absencePercentageEnabled 
                                                                    ? 'bg-blue-600/10 border-blue-500/30 text-blue-500 hover:bg-blue-600 hover:text-white' 
                                                                    : 'bg-slate-800 border-slate-700 text-gray-400 hover:bg-slate-700 hover:text-white'
                                                            }`}
                                                            title={absencePercentageEnabled ? "نسبة الغياب مفعلة للطلاب" : "نسبة الغياب معطلة للطلاب"}
                                                        >
                                                            {absencePercentageEnabled ? "نسبة الغياب: مفعلة" : "نسبة الغياب: معطلة"}
                                                        </button>
                                                        <button 
                                                            onClick={() => onToggleDeviceBinding(!deviceBindingEnabled)} 
                                                            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all transform-gpu border ${
                                                                deviceBindingEnabled 
                                                                    ? 'bg-green-600/10 border-green-500/30 text-green-500 hover:bg-green-600 hover:text-white' 
                                                                    : 'bg-slate-800 border-slate-700 text-gray-400 hover:bg-slate-700 hover:text-white'
                                                            }`}
                                                            title={deviceBindingEnabled ? "خاصية ربط الجهاز مفعلة" : "خاصية ربط الجهاز معطلة"}
                                                        >
                                                            {deviceBindingEnabled ? "ربط الأجهزة: مفعل" : "ربط الأجهزة: معطل"}
                                                        </button>
                                                        <button 
                                                            onClick={() => onToggleLocationRestriction(!locationRestrictionEnabled)} 
                                                            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all transform-gpu border ${
                                                                locationRestrictionEnabled 
                                                                    ? 'bg-red-600/10 border-red-500/30 text-red-500 hover:bg-red-600 hover:text-white' 
                                                                    : 'bg-slate-800 border-slate-700 text-gray-400 hover:bg-slate-700 hover:text-white'
                                                            }`}
                                                            title={locationRestrictionEnabled ? "التحقق من الموقع مفعل" : "التحقق من الموقع معطل"}
                                                        >
                                                            {locationRestrictionEnabled ? "التحقق من الموقع: مفعل" : "التحقق من الموقع: معطل"}
                                                        </button>
                                                        <button onClick={() => setResetAllModalOpen(true)} className="flex-1 sm:flex-none flex items-center justify-center p-2.5 sm:p-3 bg-red-600/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-xl sm:rounded-2xl transition-all transform-gpu" title="إلغاء ربط أجهزة الجميع">
                                                            <UnplugIcon className="w-4 h-4 sm:w-5 sm:h-5"/>
                                                        </button>
                                                        <button 
                                                            onClick={onRecalculateSerials} 
                                                            className="flex-1 sm:flex-none flex items-center justify-center p-2.5 sm:p-3 bg-indigo-600/10 border border-indigo-500/20 text-indigo-500 hover:bg-indigo-500 hover:text-white rounded-xl sm:rounded-2xl transition-all transform-gpu" 
                                                            title="تحديث الأرقام التسلسلية لجميع الطلاب"
                                                        >
                                                            <ClipboardListIcon className="w-4 h-4 sm:w-5 sm:h-5"/>
                                                        </button>
                                                        <button onClick={() => setDeleteStudentsModalOpen(true)} className={`flex-[2] sm:flex-none font-bold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu shadow-lg text-xs sm:text-sm ${isRamadanMode ? 'bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white' : 'bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white'}`}>حذف الطلاب</button>
                                                        <button onClick={() => setImportModalOpen(true)} className={`flex-[2] sm:flex-none font-bold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu shadow-lg text-xs sm:text-sm ${isRamadanMode ? 'bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600 hover:text-white' : 'bg-green-600/20 text-green-500 hover:bg-green-600 hover:text-white'}`}>استيراد طلاب</button>
                                                        <button onClick={() => handleOpenModal()} className={`flex-[2] sm:flex-none font-bold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu shadow-lg text-xs sm:text-sm ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'}`}>إضافة طالب</button>
                                                    </div>
                                                </div>

                                    <div className="block sm:hidden space-y-4">
                                        {sortedStudents.map((student) => (
                                            <div key={student.id} className="bg-slate-800/30 border border-slate-700/50 p-4 rounded-2xl">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <p className="text-white font-bold">{student.name}</p>
                                                        <p className="text-gray-400 text-xs">الرقم: {student.universityId}</p>
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-blue-400 text-xs font-bold">كلمة السر: {student.serialNumber}</p>
                                                        <div className="flex flex-col items-end gap-1 mt-1">
                                                            {student.isLeader && <span className="inline-block text-[8px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 font-black">رئيس مجموعة</span>}
                                                            {student.canManageAttendance && <span className="inline-block text-[8px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20 font-black">رئيس دفعة</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center pt-3 border-t border-slate-700/30">
                                                    <div className="flex gap-2">
                                                        {student.deviceInfo ? 
                                                            <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-1 rounded-full border border-green-500/10">مرتبط</span> : 
                                                            <span className="text-[10px] bg-slate-800 text-gray-500 px-2 py-1 rounded-full">متاح</span>
                                                        }
                                                        <span className="text-[10px] text-gray-400 py-1">المجموعة: {student.groupName || '-'}</span>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => handleOpenModal(student)} className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all transform-gpu"><EditIcon className="w-5 h-5"/></button>
                                                        <button 
                                                            onClick={() => handleOpenResetModal(student)} 
                                                            disabled={!student.deviceInfo}
                                                            className="p-2 text-orange-400 hover:bg-orange-500/10 rounded-xl transition-all transform-gpu disabled:opacity-20"
                                                        ><UnplugIcon className="w-5 h-5"/></button>
                                                        <button onClick={() => handleOpenDeleteStudentModal(student)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-all transform-gpu"><TrashIcon className="w-5 h-5"/></button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="hidden sm:block overflow-x-auto rounded-3xl border border-slate-800">
                                        <table className="w-full text-sm text-right">
                                            <thead className="bg-slate-800/80 text-gray-300">
                                                <tr>
                                                    <th className="px-6 py-4">اسم الطالب</th>
                                                    <th className="px-6 py-4">الرقم الجامعي</th>
                                                    <th className="px-6 py-4">كلمة السر</th>
                                                    <th className="px-6 py-4">المجموعة</th>
                                                    <th className="px-6 py-4">الجهاز</th>
                                                    <th className="px-6 py-4 text-center">أدوات</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {sortedStudents.map((student) => (
                                                    <tr key={student.id} className="hover:bg-slate-800/40">
                                                        <td className="px-6 py-4 font-bold text-white">
                                                            {student.name}
                                                            <div className="flex gap-1 mt-1">
                                                                {student.isLeader && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">رئيس مجموعة</span>}
                                                                {student.isBatchLeader && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/20">رئيس دفعة</span>}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 font-mono text-gray-400">{student.universityId}</td>
                                                        <td className="px-6 py-4 font-mono text-blue-400 font-bold">{student.serialNumber}</td>
                                                        <td className="px-6 py-4">{student.groupName || '-'}</td>
                                                        <td className="px-6 py-4">
                                                            {student.deviceInfo ? 
                                                                <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-1 rounded-full border border-green-500/10">مرتبط</span> : 
                                                                <span className="text-[10px] bg-slate-800 text-gray-500 px-2 py-1 rounded-full">متاح</span>
                                                            }
                                                        </td>
                                                        <td className="px-6 py-4 flex justify-center gap-3">
                                                            <button onClick={() => handleOpenModal(student)} className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all transform-gpu"><EditIcon className="w-5 h-5"/></button>
                                                            <button 
                                                                onClick={() => handleOpenResetModal(student)} 
                                                                disabled={!student.deviceInfo}
                                                                className="p-2 text-orange-400 hover:bg-orange-500/10 rounded-lg transition-all transform-gpu disabled:opacity-20"
                                                            ><UnplugIcon className="w-5 h-5"/></button>
                                                            <button onClick={() => handleOpenDeleteStudentModal(student)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-all transform-gpu"><TrashIcon className="w-5 h-5"/></button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'groups' && (
                                    <div className="p-4 sm:p-8">
                                        {!selectedBatchId ? (
                                            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-gray-600 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                                <p className="text-gray-400 font-medium">يرجى اختيار دفعة أولاً لعرض المجموعات.</p>
                                                <button 
                                                    onClick={() => setActiveTab('dashboard')}
                                                    className="text-blue-400 hover:underline text-sm font-bold"
                                                >
                                                    الذهاب لاختيار الدفعة
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap justify-between items-center gap-4 mb-6 sm:mb-8">
                                            <h2 className={`text-xl sm:text-2xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>إدارة المجموعات</h2>
                                            <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
                                                <button onClick={() => setDeleteAllGroupsModalOpen(true)} className={`flex-1 sm:flex-none font-bold px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu shadow-lg bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/20 text-xs sm:text-sm`}>حذف الجميع</button>
                                                <button onClick={() => setGroupModalOpen(true)} className={`flex-1 sm:flex-none font-bold px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition-all transform-gpu shadow-lg text-xs sm:text-sm ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>جديد</button>
                                            </div>
                                        </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {groups.map((group) => {
                                            const members = students.filter(s => s.groupId === group.id);
                                            const leader = members.find(s => s.isLeader);
                                            return (
                                                <div key={group.id} className={`backdrop-blur-xl border p-6 rounded-[2rem] transition-all duration-300 transform-gpu group ${isRamadanMode ? 'ramadan-card hover:border-yellow-500/40' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'}`}>
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <h3 className={`text-xl font-black mb-1 ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>{group.name}</h3>
                                                            <button onClick={() => handleOpenEditGroupModal(group)} className={`flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg transition-all transform-gpu ${isRamadanMode ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20' : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'}`}>
                                                                <EditIcon className="w-3 h-3" />
                                                                <span>تعديل</span>
                                                            </button>
                                                        </div>
                                                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${isRamadanMode ? 'ramadan-badge-gold' : 'bg-blue-500/10 text-blue-400'}`}>{members.length} طلاب</span>
                                                    </div>
                                                    <div className="space-y-2 mt-4">
                                                        {/* 💡 الزر الجديد للانتقال للتحضير وعرض هذه المجموعة فقط */}
                                                        <button 
                                                            onClick={() => { 
                                                                if(selectedBatchId) { 
                                                                    onChangeBatch(selectedBatchId); 
                                                                    setAttendanceGroupFilter(group.id); // تعيين الفلتر برقم المجموعة
                                                                    setActiveTab('attendance'); // الانتقال للتحضير
                                                                } 
                                                            }}
                                                            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors p-3 rounded-xl border border-purple-500/20"
                                                        >
                                                            <ClipboardListIcon className="w-4 h-4" />
                                                            استعراض تحضير المجموعة
                                                        </button>
                                                    </div>
                                                    <div className="mt-6 flex -space-x-2 rtl:space-x-reverse">
                                                        {members.slice(0, 5).map(m => (
                                                            <div key={m.id} className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-xs font-bold text-white" title={m.name}>{m.name[0]}</div>
                                                        ))}
                                                        {members.length > 5 && <div className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[10px] text-gray-400">+{members.length - 5}</div>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                            </>
                                        )}
                                    </div>
                                )}
                                
                            {activeTab === 'batches' && (
                                <div className="p-4 sm:p-8">
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
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <QRCodeDisplay activeLecture={activeLecture} onGenerateNew={handleGenerateNewClick} title="مسح الحضور" isRamadanMode={isRamadanMode} />
                </div>
            </div>

            {/* جميع النوافذ المنبثقة (Modals) هنا */}
            <Modal isOpen={isPromoteModalOpen} onClose={() => !isPromoting && setPromoteModalOpen(false)} title="تأكيد ترقية الدفعات" isRamadanMode={isRamadanMode}>
                <div className="space-y-6 text-center">
                    <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white mb-2">هل أنت متأكد من ترقية جميع الدفعات؟</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            سيتم نقل جميع الطلاب إلى السنة الدراسية التالية.<br/>
                            الدفعة السادسة (Med 21) سيتم أرشفتها.<br/>
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

            <Modal isOpen={isStudentModalOpen} onClose={() => setStudentModalOpen(false)} title={currentStudent ? 'تعديل طالب' : 'طالب جديد'} isRamadanMode={isRamadanMode}>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <input type="text" name="name" value={formState.name} onChange={(e) => setFormState(p => ({...p, name: e.target.value}))} required className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" placeholder="اسم الطالب بالكامل"/>
                    <input type="text" name="universityId" value={formState.universityId} onChange={(e) => setFormState(p => ({...p, universityId: e.target.value}))} required className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none" placeholder="الرقم الجامعي"/>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">المجموعة</label>
                        <select value={formState.groupId} onChange={(e) => setFormState(p => ({...p, groupId: e.target.value}))} className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none">
                            <option value="">بدون مجموعة</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                        <input id="isLeader" type="checkbox" checked={formState.isLeader} onChange={(e) => setFormState(p => ({...p, isLeader: e.target.checked}))} className="w-5 h-5 rounded-lg border-slate-600 bg-slate-700 text-blue-500 focus:ring-0"/>
                        <label htmlFor="isLeader" className="text-sm font-bold text-gray-300">رئيس مجموعة (صلاحية تحضير الزملاء)</label>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                        <input id="isBatchLeader" type="checkbox" checked={formState.isBatchLeader} onChange={(e) => setFormState(p => ({...p, isBatchLeader: e.target.checked}))} className="w-5 h-5 rounded-lg border-slate-600 bg-slate-700 text-purple-500 focus:ring-0"/>
                        <label htmlFor="isBatchLeader" className="text-sm font-bold text-gray-300">رئيس دفعة (صلاحية إنشاء مجموعات ومحاضرات)</label>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setStudentModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all transform-gpu">إلغاء</button>
                        <button type="submit" className="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all transform-gpu shadow-lg shadow-blue-600/20">{currentStudent ? 'حفظ' : 'إضافة'}</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isQrModalOpen} onClose={() => !isCreatingQr && setQrModalOpen(false)} title="إنشاء باركود" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleQrFormSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">المقرر</label>
                        <select 
                            value={selectedCourseId} 
                            onChange={(e) => setSelectedCourseId(e.target.value)} 
                            required 
                            disabled={isCreatingQr} 
                            className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                        >
                            <option value="">اختر المقرر</option>
                            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {courses.length === 0 && <p className="text-xs text-red-400">لا توجد مقررات. يرجى إضافة مقرر أولاً من تبويب المقررات.</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">اسم المحاضرة (اختياري)</label>
                        <input 
                            type="text" 
                            value={qrForm.lectureName} 
                            onChange={(e) => setQrForm(p => ({...p, lectureName: e.target.value}))} 
                            disabled={isCreatingQr} 
                            placeholder="مثال: محاضرة 1 - مقدمة"
                            className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                        />
                        <p className="text-[10px] text-gray-500 px-1">إذا تركته فارغاً، سيتم تسميتها تلقائياً (مثال: اسم المقرر - محاضرة 1)</p>
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">التاريخ</label>
                        <input 
                            type="date" 
                            value={qrForm.date} 
                            onChange={(e) => setQrForm(p => ({...p, date: e.target.value}))} 
                            required 
                            disabled={isCreatingQr} 
                            className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 px-1">وقت البداية</label>
                            <input 
                                type="time" 
                                value={qrForm.startTime} 
                                onChange={handleStartTimeChange} 
                                required 
                                disabled={isCreatingQr} 
                                className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50 appearance-none text-center font-bold font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 px-1">وقت النهاية</label>
                            <input 
                                type="time" 
                                value={qrForm.endTime} 
                                onChange={(e) => setQrForm(p => ({...p, endTime: e.target.value}))} 
                                required 
                                disabled={isCreatingQr} 
                                className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50 appearance-none text-center font-bold font-mono"
                            />
                        </div>
                    </div>

                    {/* 💡 زرين منفصلين ومصممين بشكل فخم */}
                    <div className="flex flex-col gap-3 pt-4 border-t border-slate-700/50 mt-2">
                        <button 
                            type="submit" 
                            name="qrBtn"
                            disabled={isCreatingQr || !selectedCourseId} 
                            className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-black rounded-2xl transition-all transform-gpu shadow-lg shadow-green-600/20 disabled:opacity-50"
                        >
                            {isCreatingQr ? 'جاري الإنشاء...' : 'بدء رصد الحضور بالباركود'}
                        </button>
                        <button 
                            type="submit" 
                            name="manualBtn"
                            disabled={isCreatingQr || !selectedCourseId} 
                            className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-2xl transition-all transform-gpu shadow-lg shadow-purple-600/20 disabled:opacity-50"
                        >
                            {isCreatingQr ? 'جاري الإنشاء...' : 'بدء رصد الحضور'}
                        </button>
                    </div>
                </form>
            </Modal>

             <Modal isOpen={isConfirmModalOpen} onClose={() => setConfirmModalOpen(false)} title="تنبيه" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <AlertTriangleIcon className="mx-auto h-16 w-16 text-yellow-500 mb-4" />
                    <p className="text-gray-300 font-bold">يوجد باركود فعال حالياً. إنشاء باركود جديد سيعطل القديم فوراً.</p>
                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setConfirmModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">تراجع</button>
                        <button onClick={handleConfirmGenerateNew} className="flex-1 py-3 bg-red-600 rounded-2xl text-white font-bold transition-all transform-gpu">استمرار</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isResetAllModalOpen} onClose={() => setResetAllModalOpen(false)} title="تنبيه خطير" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <UnplugIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                    <p className="text-gray-300 font-bold">هل أنت متأكد من إلغاء ربط أجهزة جميع الطلاب؟</p>
                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setResetAllModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">إلغاء</button>
                        <button onClick={handleConfirmResetAll} className="flex-1 py-3 bg-red-600 rounded-2xl text-white font-bold transition-all transform-gpu">نعم، تنفيذ</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteLectureModalOpen} onClose={() => setDeleteLectureModalOpen(false)} title="حذف" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <TrashIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                    <p className="text-gray-300 font-bold">سيتم حذف المحاضرة وجميع سجلات حضور الطلاب المرتبطة بها نهائياً.</p>
                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setDeleteLectureModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">تراجع</button>
                        <button onClick={handleConfirmDeleteLecture} className="flex-1 py-3 bg-red-600 rounded-2xl text-white font-bold transition-all transform-gpu">حذف نهائي</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteStudentModalOpen} onClose={() => setDeleteStudentModalOpen(false)} title="حذف طالب" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <TrashIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                    <p className="text-gray-300 font-bold">هل أنت متأكد من حذف الطالب "{studentToDelete?.name}"؟</p>
                    <p className="text-red-400 text-xs mt-2">سيتم حذف جميع سجلات حضوره أيضاً.</p>
                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setDeleteStudentModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">إلغاء</button>
                        <button onClick={handleConfirmDeleteStudent} className="flex-1 py-3 bg-red-600 rounded-2xl text-white font-bold transition-all transform-gpu">تأكيد الحذف</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isGroupModalOpen} onClose={() => setGroupModalOpen(false)} title="إضافة مجموعة جديدة" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleAddGroup} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">اسم المجموعة</label>
                        <input 
                            type="text" 
                            value={groupName} 
                            onChange={(e) => setGroupName(e.target.value)} 
                            required 
                            className={`w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:outline-none ${isRamadanMode ? 'focus:border-yellow-500' : 'focus:border-blue-500'}`} 
                            placeholder="مثال: مجموعة أ"
                        />
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setGroupModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all transform-gpu">إلغاء</button>
                        <button type="submit" className={`flex-1 px-6 py-3 font-bold rounded-2xl transition-all transform-gpu shadow-lg ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'}`}>إضافة</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isEditGroupModalOpen} onClose={() => setEditGroupModalOpen(false)} title="تعديل المجموعة" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleEditGroup} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">اسم المجموعة</label>
                        <input 
                            type="text" 
                            value={groupName} 
                            onChange={(e) => setGroupName(e.target.value)} 
                            required 
                            className={`w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:outline-none ${isRamadanMode ? 'focus:border-yellow-500' : 'focus:border-blue-500'}`} 
                            placeholder="اسم المجموعة"
                        />
                    </div>

                    <div className="space-y-2 mt-6">
                        <label className="text-xs font-bold text-gray-400 px-1">إدارة أعضاء المجموعة</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={studentSearchQuery} 
                                onChange={(e) => setStudentSearchQuery(e.target.value)}
                                className="w-full px-4 py-2 text-sm border-2 rounded-xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none mb-3"
                                placeholder="بحث عن طالب بالاسم أو الرقم الجامعي..."
                            />
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                            {students
                                .filter(s => 
                                    s.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) || 
                                    s.universityId.includes(debouncedSearchQuery)
                                )
                                .map(student => {
                                    const isSelected = selectedGroupStudentIds.has(student.id);
                                    const isInOtherGroup = student.groupId && student.groupId !== groupToEdit?.id;
                                    
                                    return (
                                        <div 
                                            key={student.id} 
                                            onClick={() => {
                                                const next = new Set(selectedGroupStudentIds);
                                                if (isSelected) next.delete(student.id);
                                                else next.add(student.id);
                                                setSelectedGroupStudentIds(next);
                                            }}
                                            className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all transform-gpu border ${
                                                isSelected 
                                                    ? 'bg-blue-600/20 border-blue-500/50 text-white' 
                                                    : 'bg-slate-800/40 border-slate-700/50 text-gray-400 hover:border-slate-600'
                                            }`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold">{student.name}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] opacity-60 font-mono">{student.universityId}</span>
                                                    {isInOtherGroup && (
                                                        <span className="text-[8px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded-full border border-yellow-500/20">
                                                            في مجموعة أخرى
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {isSelected ? (
                                                <CheckCircleIcon className="w-5 h-5 text-blue-400" />
                                            ) : (
                                                <div className="w-5 h-5 rounded-full border-2 border-slate-700"></div>
                                            )}
                                        </div>
                                    );
                                })
                            }
                            {students.length === 0 && (
                                <div className="text-center py-8 text-gray-500 italic text-sm">
                                    لا يوجد طلاب مسجلين.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-6 flex gap-3">
                        <button type="button" onClick={() => setEditGroupModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all transform-gpu">إلغاء</button>
                        <button type="submit" className="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all transform-gpu shadow-lg shadow-blue-600/20">حفظ التعديلات</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isClearAttendanceModalOpen} onClose={() => setClearAttendanceModalOpen(false)} title="مسح التحضير" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <TrashIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                    <p className="text-gray-300 font-bold">هل أنت متأكد من مسح جميع سجلات حضور الطلاب <span className="text-red-400">لهذه المحاضرة فقط</span>؟</p>
                    <p className="text-gray-500 text-xs mt-2">المحاضرة ستبقى موجودة، ولكن سيتم تصفير التحضير.</p>
                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setClearAttendanceModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">إلغاء</button>
                        <button 
                            onClick={() => { 
                                if(selectedLectureId) onClearLectureAttendance(selectedLectureId); 
                                setClearAttendanceModalOpen(false); 
                            }} 
                            className="flex-1 py-3 bg-red-600 rounded-2xl text-white font-bold transition-all transform-gpu"
                        >
                            تأكيد المسح
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isClearLecturesModalOpen} onClose={() => setClearLecturesModalOpen(false)} title="مسح جميع المحاضرات" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <TrashIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                    <p className="text-gray-300 font-bold">هل أنت متأكد من مسح جميع المحاضرات وسجلات الحضور نهائياً؟</p>
                    <p className="text-red-400 text-xs mt-2">سيتم تصفير النظام بالكامل (باستثناء الطلاب والمجموعات).</p>
                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setClearLecturesModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">إلغاء</button>
                        <button onClick={handleConfirmClearLectures} className="flex-1 py-3 bg-red-600 rounded-2xl text-white font-bold transition-all transform-gpu">تأكيد المسح الشامل</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isRepeatModalOpen} onClose={() => !isRepeating && setRepeatModalOpen(false)} title="تكرار الحضور السابق" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <CopyIcon className="mx-auto h-16 w-16 text-purple-500 mb-4" />
                    <p className="text-gray-300 font-bold mb-4">سيتم نسخ حضور المحاضرة السابقة لنفس المقرر وإضافته لهذه المحاضرة.</p>
                    {repeatStatus && (
                        <div className={`p-3 rounded-xl mb-4 font-bold ${repeatStatus.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {repeatStatus.message}
                        </div>
                    )}
                    <div className="flex gap-3">
                        <button onClick={() => setRepeatModalOpen(false)} disabled={isRepeating} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu disabled:opacity-50">إلغاء</button>
                        <button onClick={handleConfirmRepeat} disabled={isRepeating} className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 rounded-2xl text-white font-bold transition-all transform-gpu disabled:opacity-50">
                            {isRepeating ? 'جاري التكرار...' : 'تأكيد التكرار'}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteAllGroupsModalOpen} onClose={() => setDeleteAllGroupsModalOpen(false)} title="حذف جميع المجموعات" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <TrashIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                    <p className="text-gray-300 font-bold">هل أنت متأكد من حذف جميع المجموعات نهائياً؟</p>
                    <p className="text-red-400 text-xs mt-2">سيتم إزالة جميع الطلاب من مجموعاتهم.</p>
                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setDeleteAllGroupsModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">إلغاء</button>
                        <button onClick={handleConfirmDeleteAllGroups} className="flex-1 py-3 bg-red-600 rounded-2xl text-white font-bold transition-all transform-gpu">تأكيد الحذف</button>
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

            <Modal isOpen={isImportModalOpen} onClose={() => { setImportModalOpen(false); setImportFile(null); setImportResult(null); }} title="استيراد طلاب" isRamadanMode={isRamadanMode}>
                <div className="space-y-4">
                    {!importResult ? (
                        <form onSubmit={handleImportStudents} className="space-y-4">
                            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700 text-sm text-gray-300">
                                <p className="font-bold mb-2">تعليمات الاستيراد:</p>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>يجب أن يحتوي الملف (CSV أو Excel) على عمودين على الأقل:</li>
                                    <li>عمود باسم <strong>الاسم</strong> أو <strong>name</strong></li>
                                    <li>عمود باسم <strong>الرقم الجامعي</strong> أو <strong>university_id</strong></li>
                                    <li>سيتم استيراد الطلاب إلى: <strong>{currentBatch?.batchName}</strong></li>
                                </ul>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 px-1">اختر ملف (CSV, XLSX)</label>
                                <input 
                                    type="file" 
                                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                    className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                                />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => { setImportModalOpen(false); setImportFile(null); }} className="flex-1 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all transform-gpu">إلغاء</button>
                                <button type="submit" disabled={!importFile || isImporting} className={`flex-1 px-6 py-3 font-bold rounded-2xl transition-all transform-gpu shadow-lg disabled:opacity-50 ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'}`}>
                                    {isImporting ? 'جاري الاستيراد...' : 'بدء الاستيراد'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700 text-center">
                                <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-2" />
                                <h3 className="text-xl font-bold text-white mb-1">اكتمل الاستيراد</h3>
                                <p className="text-green-400 font-bold text-lg">تم استيراد {importResult.imported} طالب بنجاح</p>
                            </div>
                            
                            {importResult.errors.length > 0 && (
                                <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20">
                                    <h4 className="text-red-400 font-bold mb-2 flex items-center gap-2">
                                        <AlertTriangleIcon className="w-5 h-5" />
                                        أخطاء لم يتم استيرادها ({importResult.errors.length}):
                                    </h4>
                                    <div className="max-h-40 overflow-y-auto space-y-1 text-xs text-red-300">
                                        {importResult.errors.map((err, i) => (
                                            <p key={i}>• {err}</p>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            <div className="pt-4">
                                <button type="button" onClick={() => { setImportModalOpen(false); setImportFile(null); setImportResult(null); }} className="w-full px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all transform-gpu">إغلاق</button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <Modal isOpen={isDeleteStudentsModalOpen} onClose={() => setDeleteStudentsModalOpen(false)} title="حذف الطلاب" isRamadanMode={isRamadanMode}>
                <div className="space-y-4 p-2">
                    <div className="text-center mb-6">
                        <TrashIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                        <p className="text-gray-300 font-bold text-lg">
                            هل أنت متأكد من حذف جميع الطلاب في {currentBatch?.batchName}؟
                        </p>
                        <p className="text-red-400 text-xs mt-2">
                            تحذير: سيتم حذف سجلات الحضور المرتبطة بهؤلاء الطلاب أيضاً. لا يمكن التراجع عن هذا الإجراء.
                        </p>
                    </div>

                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setDeleteStudentsModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">إلغاء</button>
                        <button onClick={handleConfirmDeleteStudents} disabled={isDeletingStudents} className="flex-1 py-3 bg-red-600 hover:bg-red-700 rounded-2xl text-white font-bold transition-all transform-gpu disabled:opacity-50">
                            {isDeletingStudents ? 'جاري الحذف...' : 'تأكيد الحذف'}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isCourseModalOpen} onClose={() => setCourseModalOpen(false)} title={courseFormState.id ? "تعديل المقرر" : "إضافة مقرر جديد"} isRamadanMode={isRamadanMode}>
                <form onSubmit={handleAddCourse} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">اسم المقرر</label>
                        <input 
                            type="text" 
                            value={courseFormState.name} 
                            onChange={(e) => setCourseFormState(p => ({...p, name: e.target.value}))} 
                            required 
                            className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none" 
                            placeholder="مثال: علم الأمراض"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">رمز المقرر (اختياري)</label>
                        <input 
                            type="text" 
                            value={courseFormState.code} 
                            onChange={(e) => setCourseFormState(p => ({...p, code: e.target.value}))} 
                            className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none" 
                            placeholder="مثال: PATH101"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 px-1">الساعات المعتمدة</label>
                            <input 
                                type="number" 
                                value={courseFormState.creditHours} 
                                onChange={(e) => setCourseFormState(p => ({...p, creditHours: Number(e.target.value)}))} 
                                required 
                                className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none" 
                                placeholder="3"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 px-1">عدد الأسابيع</label>
                            <input 
                                type="number" 
                                value={courseFormState.weeks} 
                                onChange={(e) => setCourseFormState(p => ({...p, weeks: Number(e.target.value)}))} 
                                required 
                                className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none" 
                                placeholder="7"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 px-1">نسبة الحرمان (الغياب المئوية)</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    value={courseFormState.absenceLimit} 
                                    onChange={(e) => setCourseFormState(p => ({...p, absenceLimit: Number(e.target.value)}))} 
                                    required 
                                    min="0" 
                                    max="100" 
                                    className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-red-500 focus:outline-none" 
                                    placeholder="25"
                                />
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">%</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 px-1">ثقل الغياب (للمحاضرة الواحدة)</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    step="0.1" 
                                    value={courseFormState.absenceWeight} 
                                    onChange={(e) => setCourseFormState(p => ({...p, absenceWeight: Number(e.target.value)}))} 
                                    required 
                                    min="0" 
                                    max="100" 
                                    className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-yellow-500 focus:outline-none" 
                                    placeholder="2.5"
                                />
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">%</span>
                            </div>
                        </div>
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setCourseModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all transform-gpu">إلغاء</button>
                        <button type="submit" className={`flex-1 px-6 py-3 font-bold rounded-2xl transition-all transform-gpu shadow-lg ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'}`}>
                            {courseFormState.id ? 'حفظ التعديلات' : 'إضافة'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default AdminDashboard;