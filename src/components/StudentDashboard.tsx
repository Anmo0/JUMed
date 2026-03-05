import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Student, AttendanceRecord, Lecture, Course } from '../types';
import { CameraIcon, MapPinIcon, CheckCircleIcon, AlertTriangleIcon, UsersIcon, ClipboardListIcon, XCircleIcon, EditIcon, TrashIcon, CopyIcon } from './icons';
import Modal from './Modal';
import QRCodeScanner from './QRCodeScanner';
import QRCodeDisplay from './QRCodeDisplay';
import { jsPDF } from 'jspdf';
import AbsenceWarning from './AbsenceWarning'; 
import html2canvas from 'html2canvas';
import { 
    getStudentGroup, 
    assignStudentToGroup, 
    getGroups, 
    updateGroup, 
    createGroup, 
    deleteAllGroups, 
    deleteStudents, 
    importStudents,
    recalculateAllSerialNumbers,
    getLastCourseName
} from '../services/api';

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

interface StudentDashboardProps {
    student: Student;
    allStudents: Student[];
    groups?: Group[]; // 👈 أضف هذا السطر
    attendanceRecords: AttendanceRecord[];
    onRecordAttendance: (location: { latitude: number; longitude: number }) => Promise<{ success: boolean, message: string }>;
    onManualAttendance: (studentId: string, lectureId: string) => void;
    onRemoveAttendance: (studentId: string, lectureId: string) => void;
    onUpdateStudent: (id: string, updates: Partial<Student>) => Promise<void>;
    onUpdateGroupName: (groupId: string, newName: string) => void;
    onAddGroupLocal?: (groupName: string) => void;
    activeLecture: Lecture | null;
    lectures: Lecture[];
    courses: Course[];
    onGenerateQrCode: (lectureData: { date: string, timeSlot: string, courseName: string, courseId?: string, batchId: string, isManual?: boolean }, callbacks: { onSuccess: () => void, onError: (msg: string) => void }) => void;
    onDeleteLecture: (lectureId: string) => void;
    onClearLectureAttendance: (lectureId: string) => void;
    onRepeatPreviousAttendance: (targetLectureId: string) => Promise<{ success: boolean, message: string }>;
    absencePercentageEnabled: boolean;
    isRamadanMode: boolean;
}

const QR_CODE_VALIDITY = 15 * 60 * 1000; // 15 minutes in ms

const TabButton: React.FC<{ 
    isActive: boolean; 
    onClick: () => void; 
    title: string; 
    icon: React.ReactNode;
    isRamadanMode?: boolean;
}> = ({ isActive, onClick, title, icon, isRamadanMode }) => (
    <button
        onClick={onClick}
        className={`flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-300 transform transform-gpu flex-1 sm:flex-none ${
            isActive
                ? (isRamadanMode ? 'bg-yellow-500 text-slate-900 shadow-lg shadow-yellow-500/30 scale-105' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 scale-105')
                : 'text-gray-400 hover:bg-slate-800/80 hover:text-white'
        }`}
    >
        <span className={`${isActive ? (isRamadanMode ? 'text-slate-900' : 'text-white') : 'text-blue-400'}`}>{icon}</span>
        <span>{title}</span>
    </button>
);

const StudentDashboard: React.FC<StudentDashboardProps> = ({ 
    student, 
    allStudents,
    groups, // 👈 أضف هذا
    attendanceRecords,
    onRecordAttendance, 
    onManualAttendance,
    onRemoveAttendance,
    onUpdateStudent,
    onUpdateGroupName,
    onAddGroupLocal,
    activeLecture, 
    lectures,
    courses,
    onGenerateQrCode,
    onDeleteLecture,
    onClearLectureAttendance,
    onRepeatPreviousAttendance,
    absencePercentageEnabled,
    isRamadanMode
}) => {
    const [activeTab, setActiveTab] = useState<'personal' | 'group' | 'management'>(() => {
        return (sessionStorage.getItem('studentActiveTab') as any) || 'personal';
    });
    const isBatchAdmin = student?.canManageAttendance || student?.isBatchLeader || false;

    // 💡 حالات إدارة المجموعات لليدر
    const [managementSelectedGroupId, setManagementSelectedGroupId] = useState<string | null>(null);
    const activeGroupId = isBatchAdmin && managementSelectedGroupId ? managementSelectedGroupId : student?.groupId;
    const activeGroup = useMemo(() => groups?.find(g => g.id === activeGroupId) || {name: student?.groupName}, [groups, activeGroupId, student?.groupName]);
    
    useEffect(() => {
        sessionStorage.setItem('studentActiveTab', activeTab);
    }, [activeTab]);
    
    const [isScannerOpen, setScannerOpen] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    
    const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);
    const [isCreateGroupModalOpen, setCreateGroupModalOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [isAddMemberModalOpen, setAddMemberModalOpen] = useState(false);
    const [isEditGroupNameModalOpen, setEditGroupNameModalOpen] = useState(false);
    const [editGroupName, setEditGroupName] = useState('');
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(studentSearchQuery);
        }, 300);
        return () => clearTimeout(handler);
    }, [studentSearchQuery]);
    const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

    // 💡 استخدام منتقي الوقت الجديد
    const [isQrModalOpen, setQrModalOpen] = useState(false);
    const [qrForm, setQrForm] = useState({ 
        date: new Date().toISOString().split('T')[0], 
        startTime: '08:00', 
        endTime: '09:00', 
        lectureName: '',
        isManual: false // 👈 الحقل الجديد
    });
    
    const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newStart = e.target.value;
        const [h, m] = newStart.split(':');
        let endH = (parseInt(h, 10) + 1).toString().padStart(2, '0');
        if (endH === '24') endH = '00';
        setQrForm(p => ({ ...p, startTime: newStart, endTime: `${endH}:${m}` }));
    };

    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [isCreatingQr, setIsCreatingQr] = useState(false);
    const [qrError, setQrError] = useState<string | null>(null);
    const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
    const [isDeleteLectureModalOpen, setDeleteLectureModalOpen] = useState(false);
    const [isClearAttendanceModalOpen, setClearAttendanceModalOpen] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');
    const [managementSelectedLectureId, setManagementSelectedLectureId] = useState<string | null>(null);
    const [isRepeatModalOpen, setRepeatModalOpen] = useState(false);
    const [repeatStatus, setRepeatStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [isRepeating, setIsRepeating] = useState(false);

    const handleConfirmRepeat = async () => {
        if (!managementSelectedLectureId) return;
        setIsRepeating(true);
        setRepeatStatus(null);
        try {
            const result = await onRepeatPreviousAttendance(managementSelectedLectureId);
            setRepeatStatus({ type: result.success ? 'success' : 'error', message: result.message });
            setTimeout(() => { setRepeatModalOpen(false); setRepeatStatus(null); }, 3000);
        } catch (error) {
            setRepeatStatus({ type: 'error', message: 'حدث خطأ غير متوقع' });
        } finally {
            setIsRepeating(false);
        }
    };

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
            const currentExists = filteredLectures.find(l => l.qrCode === managementSelectedLectureId);
            if (!currentExists) {
                setManagementSelectedLectureId(filteredLectures[0].qrCode);
            }
        } else if (selectedDateFilter) {
            setManagementSelectedLectureId(null);
        }
    }, [filteredLectures, managementSelectedLectureId, selectedDateFilter]);

    useEffect(() => {
        getLastCourseName().then(name => {
            if (name) {
                setQrForm(prev => ({ ...prev, courseName: name }));
            }
        });
    }, []);

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

   const handleQrFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // 💡 قراءة أي زر تم الضغط عليه
        const isManualMode = (e.nativeEvent as any).submitter?.name === 'manualBtn';

        setIsCreatingQr(true);
        setQrError(null);

        const selectedCourse = courses.find(c => c.id === selectedCourseId);
        if (!selectedCourse) {
            setIsCreatingQr(false);
            setQrError('الرجاء اختيار المقرر أولاً');
            return;
        }

        let finalLectureName = qrForm.lectureName.trim();
        if (!finalLectureName) {
            const lectureCount = lectures.filter(l => l.courseId === selectedCourse.id).length + 1;
            finalLectureName = `${selectedCourse.name} - محاضرة ${lectureCount}`;
        }

        onGenerateQrCode({ date: qrForm.date, timeSlot: `${formatTimeToArabic(qrForm.startTime)} - ${formatTimeToArabic(qrForm.endTime)}`, courseName: finalLectureName, courseId: selectedCourse.id, batchId: student?.batchId || '', isManual: isManualMode }, {
            onSuccess: () => { setQrModalOpen(false); setIsCreatingQr(false); setSelectedDateFilter(qrForm.date); setManagementSelectedLectureId(null); setActiveTab('management'); },
            onError: (message: string) => { setIsCreatingQr(false); setQrError(message); }
        });
    }

    const handleConfirmDeleteLecture = () => {
        if (managementSelectedLectureId) {
            onDeleteLecture(managementSelectedLectureId);
            setDeleteLectureModalOpen(false);
        }
    };

    const managementAttendanceData = useMemo(() => {
        if (!managementSelectedLectureId) return [];
        
        const actualLecture = lectures.find(l => l.qrCode === managementSelectedLectureId || l.id === managementSelectedLectureId);
        const actualLectureId = actualLecture?.id || managementSelectedLectureId;

        const currentAttendance = attendanceRecords.filter(rec => rec.lectureId === actualLectureId || rec.lectureId === managementSelectedLectureId);
        const presentStudentIds = new Set(currentAttendance.map(rec => rec.studentId));

        return allStudents.map(s => {
            const isPresent = presentStudentIds.has(s.id);
            const record = isPresent ? currentAttendance.find(r => r.studentId === s.id) : null;
            const status = isPresent ? 'حاضر' : 'غائب';
            
            return {
                ...s,
                status,
                record,
                actualLectureId
            };
        }).sort((a, b) => Number(a.serialNumber) - Number(b.serialNumber));

    }, [allStudents, attendanceRecords, managementSelectedLectureId, lectures]);

    const handleGroupExportPdf = async () => {
        const selectedLecture = lectures.find(l => l.qrCode === selectedLectureId);
        if (!selectedLecture || !activeGroup) return;

        setIsExportingPdf(true);
        try {
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '-9999px';
            container.style.background = 'white';
            container.style.padding = '40px';
            container.style.width = '800px';
            container.style.direction = 'rtl';
            
            let html = `
                <div style="text-align:center; margin-bottom: 30px; font-family: sans-serif;">
                    <h1 style="color: #0f172a; margin: 0;">تقرير حضور مجموعة: ${activeGroup.name}</h1>
                    <h3 style="color: #475569; margin: 10px 0;">المقرر: ${selectedLecture.courseName} | التاريخ: ${selectedLecture.date}</h3>
                </div>
                <table style="width:100%; border-collapse: collapse; font-family: sans-serif; font-size: 16px;" border="1">
                    <tr style="background:#f1f5f9; color: #334155;">
                        <th style="padding:15px; text-align:center;">#</th>
                        <th style="padding:15px; text-align:center;">الرقم الجامعي</th>
                        <th style="padding:15px; text-align:right;">اسم الطالب</th>
                        <th style="padding:15px; text-align:center;">الحالة</th>
                    </tr>
            `;

            groupMembers.forEach(member => {
                const actualLectureId = selectedLecture.id || selectedLecture.qrCode;
                const isPresent = attendanceRecords.some(r => r.studentId === member.id && (r.lectureId === actualLectureId || r.lectureId === selectedLectureId));
                const status = isPresent ? 'حاضر' : 'غائب';
                const statusColor = isPresent ? '#166534' : '#991b1b';
                const statusBg = isPresent ? '#dcfce7' : '#fee2e2';

                html += `
                    <tr>
                        <td style="padding:12px; text-align:center; font-weight: bold;">${member.serialNumber}</td>
                        <td style="padding:12px; text-align:center; font-family: monospace;">${member.universityId}</td>
                        <td style="padding:12px; text-align:right; font-weight: bold;">${member.name}</td>
                        <td style="padding:12px; text-align:center;">
                            <span style="background-color: ${statusBg}; color: ${statusColor}; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                                ${status}
                            </span>
                        </td>
                    </tr>
                `;
            });

            html += `</table>`;
            container.innerHTML = html;
            document.body.appendChild(container);

            const canvas = await html2canvas(container, { scale: 1.5 });
            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            pdf.addImage(imgData, 'JPEG', 10, 10, 190, (canvas.height * 190) / canvas.width);
            pdf.save(`Attendance-${activeGroup.name}-${selectedLecture.date}.pdf`);
            document.body.removeChild(container);
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء تصدير الـ PDF");
        } finally {
            setIsExportingPdf(false);
        }
    };


    useEffect(() => {
        if (!activeLecture?.createdAt) {
            setTimeLeft(null);
            return;
        }

        const calculateTimeLeft = () => {
            const elapsedTime = Date.now() - new Date(activeLecture.createdAt).getTime();
            const remaining = QR_CODE_VALIDITY - elapsedTime;
            setTimeLeft(remaining > 0 ? remaining : 0);
        };

        calculateTimeLeft();
        const interval = setInterval(calculateTimeLeft, 1000);

        return () => clearInterval(interval);
    }, [activeLecture]);
    
    useEffect(() => {
        if (activeLecture) {
            setSelectedLectureId(activeLecture.qrCode);
        } else if (!selectedLectureId && lectures.length > 0) {
            const sorted = [...lectures].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setSelectedLectureId(sorted[0].qrCode);
        }
    }, [activeLecture, lectures, selectedLectureId]);

    const missedLectures = useMemo(() => {
        if (!student?.id) return [];
        const attendedLectureIds = new Set(attendanceRecords.filter(r => r.studentId === student.id).map(rec => rec.lectureId));
        return lectures.filter(lecture => {
            // 💡 إزالة شرط الـ 15 دقيقة.. المحاضرة تعتبر غياب فوراً إذا لم يحضر الطالب
            return !attendedLectureIds.has(lecture.qrCode) && !attendedLectureIds.has(lecture.id);
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [lectures, attendanceRecords, student?.id]);

    const groupMembers = useMemo(() => {
        if (!activeGroupId) return [];
        return allStudents.filter(s => s.groupId === activeGroupId).sort((a,b) => a.name.localeCompare(b.name));
    }, [allStudents, activeGroupId]);

    const selectedLectureForGroup = useMemo(() => {
        return lectures.find(l => l.qrCode === selectedLectureId) || null;
    }, [lectures, selectedLectureId]);


    const handleInitiateScan = () => {
        setScanError(null);
        setIsLocating(true);
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setUserLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
                setIsLocating(false);
                setScannerOpen(true);
            },
            (error: GeolocationPositionError) => {
                setIsLocating(false);
                let message = 'فشل في تحديد الموقع.';
                switch(error.code) {
                    case GeolocationPositionError.PERMISSION_DENIED:
                        message = 'تم رفض إذن الوصول للموقع. يجب السماح بذلك قبل مسح الباركود.';
                        break;
                    case GeolocationPositionError.POSITION_UNAVAILABLE:
                        message = 'معلومات الموقع غير متاحة حاليًا.';
                        break;
                    case GeolocationPositionError.TIMEOUT:
                        message = 'انتهت مهلة طلب الموقع.';
                        break;
                    default:
                        message = `حدث خطأ غير متوقع: ${error.message}`;
                        break;
                }
                setScanError(message);
            },
            { enableHighAccuracy: true }
        );
    };

    const handleScanSuccess = useCallback(async () => {
        if (!userLocation) {
            setScanError("حدث خطأ: فقدان بيانات الموقع بعد المسح.");
            setScannerOpen(false);
            return;
        }

        setScanError(null);
        const result = await onRecordAttendance(userLocation);

        if (!result.success) {
            setScanError(result.message);
            alert(result.message);
        }
        setScannerOpen(false);
    }, [onRecordAttendance, userLocation]);

    const formatTime = (ms: number) => {
        if (ms <= 0) return '00:00';
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!student?.id || !student?.batchId || !newGroupName.trim()) return;
        
        const { data: newGroup, error } = await createGroup(newGroupName, student.batchId, student.id);
        if (error || !newGroup) {
            alert(error || 'فشل إنشاء المجموعة');
            return;
        }
        
        // 💡 إشعار الليدر بنجاح الإنشاء وإغلاق النافذة دون الانضمام
        alert('تم إنشاء المجموعة بنجاح! يمكنك إدارتها وربط الطلاب بها من قائمة (تحضير الدفعة).');
        if (onAddGroupLocal) onAddGroupLocal(newGroup.name);
        
        setCreateGroupModalOpen(false);
        setNewGroupName('');
    };

    const handleAddMembers = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeGroupId) return; // 👈 تعديل هنا
        
        for (const memberId of selectedMemberIds) {
            const member = allStudents.find(s => s.id === memberId);
            if (member) {
                onUpdateStudent(member.id, { groupId: activeGroupId }); // 👈 تعديل هنا
            }
        }
        
        setAddMemberModalOpen(false);
        setSelectedMemberIds(new Set());
    };

    const handleUpdateGroupName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeGroupId || !editGroupName.trim()) return; // 👈 تعديل هنا

        const { data: updatedGroup, error } = await updateGroup(activeGroupId, editGroupName); // 👈 تعديل هنا
        if (error || !updatedGroup) {
            alert(error || 'فشل تحديث اسم المجموعة');
            return;
        }

        onUpdateGroupName(activeGroupId, updatedGroup.name); // 👈 تعديل هنا
        setEditGroupNameModalOpen(false);
    };
    
    const hasAttendedCurrentLecture = activeLecture && student?.id && attendanceRecords.some(rec => rec.studentId === student.id && rec.lectureId === activeLecture.qrCode);

    if (!student) {
        if (allStudents.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center p-12 text-center min-h-[60vh] animate-pulse">
                    <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
                    <h2 className="text-xl font-bold text-white mb-2">جاري مزامنة بياناتك...</h2>
                    <p className="text-gray-500 text-sm">يرجى الانتظار لحظات</p>
                </div>
            );
        }
        
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center min-h-[60vh] animate-fade-in">
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full">
                    <AlertTriangleIcon className="w-16 h-16 text-yellow-500 mx-auto mb-6" />
                    <h2 className="text-2xl font-black text-white mb-4">بيانات الطالب غير متوفرة</h2>
                    <p className="text-gray-400 mb-8 leading-relaxed">
                        لم نتمكن من العثور على بياناتك في الدفعة الحالية. يرجى التأكد من اختيار الدفعة الصحيحة أو مراجعة المسؤول.
                    </p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all transform-gpu shadow-lg shadow-blue-600/20"
                    >
                        إعادة تحميل الصفحة
                    </button>
                </div>
            </div>
        );
    }

    const buttonContent = isLocating ? (
        <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span>جاري تحديد الموقع...</span>
        </>
    ) : (
        <>
            <CameraIcon className="w-6 h-6" />
            <span>مسح الباركود</span>
        </>
    );

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in space-y-6">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
                 <div className="w-full sm:w-auto">
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">أهلاً بك، {student.name}</h1>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className={`font-mono text-xs sm:text-sm px-2 sm:px-3 py-1 rounded-lg border ${isRamadanMode ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-slate-800/50 text-gray-400 border-slate-700/50'}`}>ID: {student.universityId}</span>
                        {student.groupName && (
                            <span className={`text-[10px] font-black px-2 sm:px-3 py-1 rounded-full border uppercase tracking-wider ${isRamadanMode ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                                {student.groupName}
                            </span>
                        )}
                        {student.isLeader && (
                            <span className={`text-[10px] font-black px-2 sm:px-3 py-1 rounded-full border uppercase tracking-wider ${isRamadanMode ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`}>
                                رئيس مجموعة
                            </span>
                        )}
                        {(student.canManageAttendance || student.isBatchLeader) && (
                            <span className={`text-[10px] font-black px-2 sm:px-3 py-1 rounded-full border uppercase tracking-wider ${isRamadanMode ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
                                مشرف دفعة
                            </span>
                        )}
                    </div>
                </div>
                
                {(!student.groupId || student.isLeader || student.groupId) && (
                    <div className="bg-slate-900/40 p-1.5 rounded-[1.25rem] border border-slate-800/60 flex flex-row gap-1 w-full sm:w-auto shadow-xl overflow-x-auto custom-scrollbar">
                        <TabButton 
                            isActive={activeTab === 'personal'} 
                            onClick={() => setActiveTab('personal')} 
                            title="حسابي" 
                            icon={<UsersIcon className="w-4 h-4"/>} 
                            isRamadanMode={isRamadanMode}
                        />
                        <TabButton 
                            isActive={activeTab === 'group'} 
                            onClick={() => setActiveTab('group')} 
                            title="تحضير المجموعة" 
                            icon={<ClipboardListIcon className="w-4 h-4"/>} 
                            isRamadanMode={isRamadanMode}
                        />
                        {(student.canManageAttendance || student.isBatchLeader) && (
                            <TabButton 
                                isActive={activeTab === 'management'} 
                                onClick={() => setActiveTab('management')} 
                                title="تحضير الدفعة" 
                                icon={<EditIcon className="w-4 h-4"/>} 
                                isRamadanMode={isRamadanMode}
                            />
                        )}
                    </div>
                )}  
             </div>

            {activeTab === 'personal' && (
                <div className="space-y-6 sm:space-y-8 animate-fade-in">
                    
                    {/* 💡 مكون التنبيه الذكي الجديد للحرمان */}
                    <AbsenceWarning 
                        courses={courses}
                        lectures={lectures}
                        attendanceRecords={attendanceRecords}
                        studentId={student.id}
                        isRamadanMode={isRamadanMode}
                    />

                    <div className={`backdrop-blur-2xl border rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-10 shadow-2xl animate-slide-in-up transition-all duration-500 ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/40 border-slate-800'}`}>
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-6 mb-8 sm:mb-10">
                            <h2 className={`text-xl sm:text-2xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>تسجيل الحضور</h2>
                             {activeLecture && (
                                <div className="flex flex-col items-center bg-slate-800/80 px-6 sm:px-8 py-3 sm:py-4 rounded-2xl sm:rounded-[1.5rem] border-2 border-slate-700/50 shadow-inner w-full sm:w-auto">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">الوقت المتبقي</p>
                                    <div className={`font-mono text-2xl sm:text-3xl font-black ${timeLeft !== null && timeLeft > 0 ? 'text-blue-400' : 'text-red-500'} tracking-tighter`}>
                                        {timeLeft !== null ? formatTime(timeLeft) : '00:00'}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="text-center">
                            {activeLecture ? (
                                hasAttendedCurrentLecture ? (
                                    <div className={`flex flex-col items-center justify-center p-6 sm:p-10 border-2 border-dashed rounded-3xl sm:rounded-[2rem] animate-pop-in ${isRamadanMode ? 'bg-yellow-500/5 border-yellow-500/30' : 'bg-green-500/5 border-green-500/30'}`}>
                                         <div className={`p-4 rounded-full shadow-lg mb-4 sm:mb-6 ${isRamadanMode ? 'bg-yellow-500 shadow-yellow-500/40' : 'bg-green-500 shadow-green-500/40'}`}>
                                            <CheckCircleIcon className="w-10 h-10 sm:w-12 sm:h-12 text-white"/>
                                         </div>
                                        <h2 className={`text-xl sm:text-2xl font-black ${isRamadanMode ? 'text-yellow-500' : 'text-green-400'}`}>تم تسجيل حضورك بنجاح!</h2>
                                        <p className="text-gray-400 mt-2 font-medium text-sm sm:text-base">أنت الآن حاضر في محاضرة <span className="text-white">{activeLecture.courseName}</span>.</p>
                                    </div>
                                ) : (
                                    <div className={`flex flex-col items-center justify-center p-6 sm:p-10 border-2 border-dashed rounded-3xl sm:rounded-[2rem] animate-fade-in ${isRamadanMode ? 'bg-yellow-500/5 border-yellow-500/30' : 'bg-blue-500/5 border-blue-500/30'}`}>
                                        <h2 className={`text-xl sm:text-2xl font-black mb-2 ${isRamadanMode ? 'ramadan-text-gold' : 'text-blue-400'}`}>محاضرة "{activeLecture.courseName}" متاحة</h2>
                                        <p className="text-gray-400 mb-6 sm:mb-8 max-w-sm font-medium text-sm sm:text-base">
                                            قم بمسح الباركود المعروض أمامك الآن لتأكيد تواجدك في القاعة.
                                        </p>
                                        <button
                                            onClick={handleInitiateScan}
                                            disabled={(timeLeft !== null && timeLeft <= 0) || isLocating}
                                            className={`group relative flex items-center justify-center gap-3 w-full max-w-sm px-6 sm:px-8 py-4 sm:py-5 text-white font-black rounded-2xl transition-all transform transform-gpu hover:-translate-y-1 active:scale-95 disabled:bg-slate-800 disabled:shadow-none animate-pulse-glow ${isRamadanMode ? 'bg-yellow-600 shadow-[0_0_30px_rgba(202,138,4,0.3)] hover:shadow-[0_0_40px_rgba(202,138,4,0.5)]' : 'bg-blue-600 shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:shadow-[0_0_40px_rgba(37,99,235,0.5)]'}`}
                                        >
                                            {buttonContent}
                                        </button>
                                        {scanError && <p className="mt-4 text-red-500 font-bold bg-red-500/10 px-4 py-2 rounded-xl text-xs sm:text-sm border border-red-500/20">{scanError}</p>}
                                    </div>
                                )
                            ) : (
                                 <div className="flex flex-col items-center justify-center p-8 sm:p-12 bg-slate-800/20 border-2 border-dashed border-slate-700/50 rounded-3xl sm:rounded-[2rem] animate-fade-in">
                                    <div className="bg-slate-800 p-4 rounded-full mb-4 sm:mb-6">
                                        <AlertTriangleIcon className="w-8 h-8 sm:w-10 sm:h-10 text-gray-500" />
                                    </div>
                                    <h2 className="text-lg sm:text-xl font-bold text-gray-400">لا توجد محاضرة نشطة</h2>
                                    <p className="text-gray-500 mt-1 text-sm sm:text-base">بانتظار قيام الدكتور بتشغيل النظام...</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-12 sm:mt-16 animate-slide-in-up" style={{ animationDelay: '200ms' }}>
                            <h2 className="text-lg sm:text-xl font-black text-white mb-4 sm:mb-6 flex items-center gap-2">
                                <span className="w-1.5 h-5 sm:h-6 bg-blue-500 rounded-full"></span>
                                سجل الحضور الأخير
                            </h2>
                            
                            <div className="space-y-3 sm:space-y-4">
                                {attendanceRecords.filter(r => r.studentId === student.id).length > 0 ? (
                                    [...attendanceRecords].filter(r => r.studentId === student.id).reverse().slice(0, 10).map((record, index) => {
                                        const lectureInfo = lectures.find(l => l.qrCode === record.lectureId || l.id === record.lectureId);
                                        return (
                                            <div key={record.id} className="bg-slate-800/30 border border-slate-700/50 p-3 sm:p-4 rounded-2xl flex justify-between items-center transition-all hover:bg-slate-800/50 animate-slide-in-up" style={{ animationDelay: `${index * 50}ms` }}>
                                                <div>
                                                    <p className="text-white font-bold text-sm sm:text-base">{lectureInfo?.courseName || 'محاضرة محذوفة'}</p>
                                                    <p className="text-gray-500 text-[10px] font-bold mt-0.5">{lectureInfo?.date} | {new Date(record.timestamp).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: 'numeric', hour12: true })}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="flex items-center text-green-400 text-xs font-black">
                                                        <CheckCircleIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 me-1"/> حاضر
                                                    </span>
                                                    {record.isOutsideRadius && (
                                                        <span className="text-[8px] font-black text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">خارج النطاق</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })
                                ) : (
                                    <div className="text-center py-8 sm:py-10 bg-slate-800/10 rounded-2xl text-gray-600 italic text-sm sm:text-base">لا يوجد سجلات حضور حتى الآن.</div>
                                )}
                            </div>
                        </div>

                        <div className="mt-12 sm:mt-16 animate-slide-in-up" style={{ animationDelay: '300ms' }}>
                            <h2 className="text-lg sm:text-xl font-black text-white mb-4 sm:mb-6 flex items-center gap-2">
                                <span className="w-1.5 h-5 sm:h-6 bg-red-500 rounded-full"></span>
                                سجل الغيابات
                            </h2>
                            
                            <div className="bg-red-500/5 border border-red-500/10 rounded-2xl sm:rounded-[1.5rem] p-4 sm:p-6 mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-inner gap-4 sm:gap-0">
                                <div className="flex items-center">
                                    <div className="bg-red-500/10 p-2 sm:p-3 rounded-xl sm:rounded-2xl mr-3 sm:mr-4">
                                        <AlertTriangleIcon className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-red-500 text-base sm:text-lg">إجمالي الغيابات</h3>
                                        <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">عدد المحاضرات التي لم يتم تسجيل حضورك بها.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 self-end sm:self-auto">
                                    <div className="text-center">
                                        <p className="text-[10px] text-red-500/70 font-bold mb-1">العدد</p>
                                        <div className="text-3xl sm:text-4xl font-black text-red-500">{missedLectures.length}</div>
                                    </div>
                                    {absencePercentageEnabled && (
                                        <>
                                            <div className="w-px h-12 bg-red-500/20"></div>
                                            <div className="text-center">
                                                <p className="text-[10px] text-red-500/70 font-bold mb-1">النسبة التقريبية</p>
                                                <div className="text-3xl sm:text-4xl font-black text-red-500">
                                                    {missedLectures.reduce((total, lecture) => {
                                                        const course = courses.find(c => c.id === lecture.courseId);
                                                        return total + (course?.absenceWeight ?? 2.5);
                                                    }, 0).toFixed(1)}%
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3 sm:space-y-4">
                                {missedLectures.length > 0 ? missedLectures.map((lecture, index) => (
                                    <div key={lecture.qrCode} className="bg-red-900/5 border border-red-900/10 p-3 sm:p-4 rounded-2xl flex justify-between items-center animate-slide-in-up" style={{ animationDelay: `${index * 50}ms` }}>
                                        <div>
                                            <p className="text-red-300 font-bold text-sm sm:text-base">{lecture.courseName}</p>
                                            <p className="text-red-900/60 text-[10px] font-bold mt-0.5">{lecture.date} | {lecture.timeSlot}</p>
                                        </div>
                                        <span className="text-red-500 text-[10px] font-black uppercase tracking-widest bg-red-500/10 px-2 sm:px-3 py-1 rounded-full">Missed</span>
                                    </div>
                                )) : (
                                    <div className="text-center py-8 sm:py-10 bg-green-500/5 rounded-2xl text-green-600 font-bold flex flex-col items-center text-sm sm:text-base">
                                        <CheckCircleIcon className="w-8 h-8 sm:w-10 sm:h-10 mb-2" />
                                        <span>سجلك نظيف من الغيابات! استمر هكذا.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'group' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 animate-slide-in-up">
                    <div className="lg:col-span-2 space-y-6">
                        <div className={`backdrop-blur-2xl border rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-10 shadow-2xl transition-all duration-500 ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/40 border-slate-800'}`}>
                            
                            {/* 1. واجهة مشرف الدفعة لعرض جميع المجموعات */}
                            {isBatchAdmin && !managementSelectedGroupId ? (
                                <div className="space-y-6 animate-fade-in">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                        <h2 className={`text-xl sm:text-2xl font-black flex items-center gap-2 ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>
                                            <UsersIcon className="w-6 h-6" /> إدارة مجموعات الدفعة
                                        </h2>
                                        <button onClick={() => setCreateGroupModalOpen(true)} className={`font-bold px-5 py-3 rounded-xl transition-all shadow-lg text-sm flex items-center gap-2 ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                                            <span>+</span> إنشاء مجموعة
                                        </button>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                                        {groups?.map((group) => {
                                            const mCount = allStudents.filter(s => s.groupId === group.id).length;
                                            return (
                                                <div key={group.id} className="p-5 bg-slate-800/40 hover:bg-slate-800/60 rounded-2xl border border-slate-700/50 flex flex-col gap-4 transition-all transform-gpu">
                                                    <div className="flex justify-between items-start">
                                                        <h3 className={`font-bold text-lg ${isRamadanMode ? 'text-yellow-400' : 'text-white'}`}>{group.name}</h3>
                                                        <span className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-lg text-xs font-bold">{mCount} أعضاء</span>
                                                    </div>
                                                    <button onClick={() => setManagementSelectedGroupId(group.id)} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                                                        <EditIcon className="w-4 h-4" /> الدخول وإدارة المجموعة
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {(!groups || groups.length === 0) && (
                                            <div className="col-span-full text-center py-10 bg-slate-800/20 rounded-2xl border border-dashed border-slate-700 text-gray-500">
                                                لا توجد مجموعات في الدفعة حالياً. قم بإنشاء أول مجموعة!
                                            </div>
                                        )}
                                    </div>
                                </div>

                            ) : (!activeGroupId ? (
                                // 2. واجهة الطالب العادي الذي لا يملك مجموعة
                                <div className="text-center py-8 sm:py-10 animate-fade-in">
                                    <UsersIcon className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-gray-500 mb-4" />
                                    <h2 className={`text-xl sm:text-2xl font-black mb-4 ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>لست منضماً لأي مجموعة</h2>
                                    <p className="text-gray-400 mb-6 text-sm sm:text-base">
                                        يرجى التواصل مع رئيس الدفعة لإضافتك إلى مجموعة.
                                    </p>
                                </div>
                            ) : (
                                // 3. واجهة عرض المجموعة المحددة
                                <div className="animate-fade-in">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 mb-6 sm:mb-10">
                                        <div className="flex flex-col items-start gap-2 w-full sm:w-auto">
                                            {isBatchAdmin && (
                                                <button onClick={() => setManagementSelectedGroupId(null)} className="text-blue-400 text-xs font-bold hover:text-blue-300 flex items-center gap-1 mb-2 transition-all">
                                                    &larr; العودة لجميع المجموعات
                                                </button>
                                            )}
                                            <h2 className={`text-xl sm:text-2xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>
                                                {isBatchAdmin ? `مجموعة: ${activeGroup?.name || ''}` : 'إدارة المجموعة'}
                                            </h2>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                            
                                            {/* 💡 زر التصدير: يظهر لليدر الدفعة ولقائد المجموعة بشرط تحديد محاضرة */}
                                            {(student?.isLeader || isBatchAdmin) && selectedLectureId && (
                                                <button onClick={handleGroupExportPdf} disabled={isExportingPdf} className={`flex-1 sm:flex-none text-xs sm:text-sm font-bold px-3 sm:px-4 py-2.5 rounded-xl transition-all transform-gpu shadow-lg disabled:opacity-50 ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20'}`}>
                                                    {isExportingPdf ? 'جاري التصدير...' : 'تصدير PDF للمجموعة'}
                                                </button>
                                            )}

                                            {/* 💡 صلاحيات التعديل والإضافة: تظهر لليدر الدفعة (isBatchAdmin) فقط! */}
                                            {isBatchAdmin && (
                                                <>
                                                    <button onClick={() => { setEditGroupName(activeGroup?.name || ''); setEditGroupNameModalOpen(true); }} className={`flex-1 sm:flex-none text-xs sm:text-sm font-bold px-3 sm:px-4 py-2.5 rounded-xl transition-all transform-gpu ${isRamadanMode ? 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'}`}>
                                                        تعديل الاسم
                                                    </button>
                                                    <button onClick={() => setAddMemberModalOpen(true)} className={`flex-1 sm:flex-none text-xs sm:text-sm font-bold px-3 sm:px-4 py-2.5 rounded-xl transition-all transform-gpu ${isRamadanMode ? 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}>
                                                        إضافة أعضاء
                                                    </button>
                                                </>
                                            )}

                                            {/* 💡 زر المغادرة يظهر فقط إذا كان الشخص عضواً فعلياً في هذه المجموعة */}
                                            {student?.groupId === activeGroupId && (
                                                <button onClick={() => {
                                                    if (confirm('هل أنت متأكد من مغادرة المجموعة؟')) {
                                                        onUpdateStudent(student.id, { groupId: undefined, groupName: undefined, isLeader: false });
                                                    }
                                                }} className={`flex-1 sm:flex-none text-xs sm:text-sm font-bold px-3 sm:px-4 py-2.5 rounded-xl transition-all transform-gpu ${isRamadanMode ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}>
                                                    مغادرة
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {(student?.isLeader || isBatchAdmin) && (
                                        <div className="mb-6 w-full sm:w-64">
                                            <select 
                                                value={selectedLectureId || ''}
                                                onChange={(e) => setSelectedLectureId(e.target.value)}
                                                className="block w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-xs sm:text-sm bg-slate-800 border-slate-700 text-white transition-all"
                                            >
                                                {lectures.length === 0 ? (
                                                    <option value="">لا توجد محاضرات</option>
                                                ) : (
                                                    lectures.map(lecture => (
                                                        <option key={lecture.qrCode} value={lecture.qrCode}>
                                                            {lecture.courseName} | {lecture.date}
                                                        </option>
                                                    ))
                                                )}
                                            </select>
                                        </div>
                                    )}

                                    <div className="space-y-3 sm:space-y-4">
                                        {groupMembers.length > 0 ? groupMembers.map((member, index) => {
                                            const actualLectureId = selectedLectureForGroup?.id || selectedLectureId;
                                            const isPresent = actualLectureId ? attendanceRecords.some(r => r.studentId === member.id && (r.lectureId === actualLectureId || r.lectureId === selectedLectureId)) : false;
                                            
                                            return (
                                                <div key={member.id} className="bg-slate-800/30 border border-slate-700/50 p-4 sm:p-5 rounded-2xl sm:rounded-3xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 animate-slide-in-up" style={{ animationDelay: `${index * 30}ms` }}>
                                                    <div className="flex flex-col w-full sm:w-auto">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="bg-slate-700/50 text-gray-300 font-mono text-[10px] sm:text-xs font-black px-1.5 py-0.5 rounded-md border border-slate-600/50 shadow-sm">
                                                                #{member.serialNumber}
                                                            </span>
                                                            <p className="text-white font-black text-base sm:text-lg">{member.name}</p>
                                                            {member.id === student?.id && <span className="bg-blue-500/20 text-blue-400 text-[8px] font-black px-2 py-0.5 rounded-full border border-blue-500/20">أنت</span>}
                                                            {member.tag && <span className="bg-purple-500/20 text-purple-400 text-[8px] font-black px-2 py-0.5 rounded-full border border-purple-500/20">{member.tag}</span>}
                                                        </div>
                                                        <p className="text-gray-500 font-mono text-[10px] sm:text-xs mt-1">ID: {member.universityId}</p>
                                                    </div>
                                                    
                                                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start w-full sm:w-auto gap-2 sm:gap-3">
                                                        {isPresent ? (
                                                            <span className="px-3 py-1 text-[10px] font-black bg-green-500/10 text-green-400 border border-green-500/20 rounded-full">حاضر</span>
                                                        ) : (
                                                            <span className="px-3 py-1 text-[10px] font-black bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">غائب</span>
                                                        )}

                                                        <div className="flex gap-2">
                                                            {/* 💡 تعديل العلامة وتعيين القائد: لليدر الدفعة (isBatchAdmin) فقط! */}
                                                            {isBatchAdmin && (
                                                                <button onClick={() => {
                                                                    const newTag = prompt('أدخل العلامة للطالب:', member.tag);
                                                                    if (newTag !== null) {
                                                                        onUpdateStudent(member.id, { tag: newTag });
                                                                    }
                                                                }} className="text-purple-500 hover:text-purple-400 font-black text-[10px] flex items-center gap-1 uppercase tracking-wider bg-purple-500/5 px-3 py-1.5 rounded-xl transition-all transform-gpu active:scale-90">
                                                                    <EditIcon className="w-3.5 h-3.5"/> <span className="hidden sm:inline">تعديل العلامة</span>
                                                                </button>
                                                            )}
                                                            
                                                            {isBatchAdmin && member.id !== student?.id && (
                                                                <button onClick={() => {
                                                                    if (confirm(`هل أنت متأكد من ${member.isLeader ? 'إلغاء تعيين' : 'تعيين'} ${member.name} كقائد للمجموعة؟`)) {
                                                                        onUpdateStudent(member.id, { isLeader: !member.isLeader });
                                                                    }
                                                                }} className={`${member.isLeader ? 'text-red-500 hover:text-red-400 bg-red-500/5' : 'text-blue-500 hover:text-blue-400 bg-blue-500/5'} font-black text-[10px] flex items-center gap-1 uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all transform-gpu active:scale-90`}>
                                                                    <UsersIcon className="w-3.5 h-3.5"/> <span className="hidden sm:inline">{member.isLeader ? 'إلغاء القيادة' : 'تعيين كقائد'}</span>
                                                                </button>
                                                            )}
                                                            
                                                            {/* 💡 التحضير والغياب: متاح لليدر الدفعة وقائد المجموعة */}
                                                            {selectedLectureId && (student?.isLeader || isBatchAdmin) && (
                                                                isPresent ? (
                                                                    <button onClick={() => onRemoveAttendance(member.id, actualLectureId as string)} className="text-red-500 hover:text-red-400 font-black text-[10px] flex items-center gap-1 uppercase tracking-wider bg-red-500/5 px-3 py-1.5 rounded-xl transition-all transform-gpu active:scale-90">
                                                                        <XCircleIcon className="w-3.5 h-3.5"/> غياب
                                                                    </button>
                                                                ) : (
                                                                    <button onClick={() => onManualAttendance(member.id, actualLectureId as string)} className="text-green-500 hover:text-green-400 font-black text-[10px] flex items-center gap-1 uppercase tracking-wider bg-green-500/5 px-3 py-1.5 rounded-xl transition-all transform-gpu active:scale-90">
                                                                        <CheckCircleIcon className="w-3.5 h-3.5"/> تحضير
                                                                    </button>
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="text-center py-6 sm:py-8 text-gray-500 text-sm sm:text-base">لا يوجد أعضاء في هذه المجموعة</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="lg:col-span-1">
                        <QRCodeDisplay 
                            activeLecture={selectedLectureForGroup} 
                            onGenerateNew={(isBatchAdmin) ? handleGenerateNewClick : undefined}
                            title={selectedLectureForGroup ? "باركود المجموعة" : "لم يتم تحديد محاضرة"}
                            isRamadanMode={isRamadanMode}
                        />
                    </div>
                </div>
            )}

            {activeTab === 'management' && (student.canManageAttendance || student.isBatchLeader) && (
                <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <div className={`backdrop-blur-xl border p-6 sm:p-8 rounded-[2rem] shadow-xl ${isRamadanMode ? 'ramadan-card' : 'bg-slate-900/40 border-slate-800'}`}>
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                                    <h2 className={`text-xl sm:text-2xl font-black ${isRamadanMode ? 'ramadan-text-gold' : 'text-white'}`}>سجل الحضور العام</h2>
                                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                        <button onClick={() => setCreateGroupModalOpen(true)} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all transform-gpu ${isRamadanMode ? 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'}`}>
                                            <UsersIcon className="w-4 h-4" /> <span className="hidden sm:inline">إنشاء مجموعة</span>
                                        </button>
                                        <button onClick={() => setClearAttendanceModalOpen(true)} disabled={!managementSelectedLectureId} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-red-600/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-600 hover:text-white font-bold text-xs sm:text-sm transition-all transform-gpu disabled:opacity-50">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                                <path d="M3 3v5h5" />
                                                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                                                <path d="M16 21v-5h5" />
                                            </svg>
                                            <span className="hidden sm:inline">مسح التحضير</span>
                                        </button>
                                        <button onClick={() => setRepeatModalOpen(true)} disabled={!managementSelectedLectureId} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all transform-gpu disabled:opacity-50 ${isRamadanMode ? 'bg-purple-500/20 text-purple-500 hover:bg-purple-500/30' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
                                            <CopyIcon className="w-4 h-4" /> <span className="hidden sm:inline">تكرار الحضور</span>
                                        </button>
                                        <button onClick={handleExportPdf} disabled={!managementSelectedLectureId || isExportingPdf} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all transform-gpu disabled:opacity-50 ${isRamadanMode ? 'bg-yellow-500 text-slate-900' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                            {isExportingPdf ? 'جاري التصدير...' : <><span className="hidden sm:inline">تصدير PDF</span><span className="sm:hidden">PDF</span></>}
                                        </button>
                                        <button onClick={() => setDeleteLectureModalOpen(true)} disabled={!managementSelectedLectureId} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-red-600/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-600 hover:text-white font-bold text-xs sm:text-sm transition-all transform-gpu disabled:opacity-50">
                                            <TrashIcon className="w-4 h-4" /> <span className="hidden sm:inline">حذف المحاضرة</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-4 mb-8">
                                    <div className="flex-1 min-w-[150px]">
                                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-2 mr-1">تاريخ اليوم</label>
                                        <select 
                                            value={selectedDateFilter} 
                                            onChange={(e) => setSelectedDateFilter(e.target.value)}
                                            className="w-full bg-slate-800 border-2 border-slate-700 text-white rounded-2xl px-4 py-3 focus:border-blue-500 focus:outline-none transition-all transform-gpu"
                                        >
                                            {uniqueLectureDates.map(date => <option key={date} value={date}>{date}</option>)}
                                            {uniqueLectureDates.length === 0 && <option value="">لا توجد تواريخ</option>}
                                        </select>
                                    </div>
                                    <div className="flex-1 min-w-[200px]">
                                        <label className="block text-[10px] font-black text-gray-500 uppercase mb-2 mr-1">اختر المحاضرة</label>
                                        <select 
                                            value={managementSelectedLectureId || ''} 
                                            onChange={(e) => setManagementSelectedLectureId(e.target.value)}
                                            className="w-full bg-slate-800 border-2 border-slate-700 text-white rounded-2xl px-4 py-3 focus:border-blue-500 focus:outline-none transition-all transform-gpu"
                                        >
                                            {filteredLectures.map(l => <option key={l.qrCode} value={l.qrCode}>{l.courseName} ({l.timeSlot})</option>)}
                                            {filteredLectures.length === 0 && <option value="">لا توجد محاضرات</option>}
                                        </select>
                                    </div>
                                </div>

                                <div className="block sm:hidden space-y-4 mt-6">
                                    {managementAttendanceData.length > 0 ? managementAttendanceData.map((s) => (
                                        <div key={s.id} className="bg-slate-800/30 border border-slate-700/50 p-4 rounded-2xl flex flex-col gap-3 transition-all transform-gpu">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="bg-slate-700/50 text-gray-300 font-mono text-xs font-black px-2 py-1 rounded-lg border border-slate-600/50 shadow-sm">
                                                            #{s.serialNumber}
                                                        </span>
                                                        <p className="text-white font-bold text-lg">{s.name}</p>
                                                    </div>
                                                    <p className="text-gray-400 text-xs font-mono">ID: {s.universityId}</p>
                                                </div>
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                    s.status === 'حاضر' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                                }`}>
                                                    {s.status}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-slate-700/30">
                                                <span className="text-xs text-gray-500">
                                                    {s.record ? new Date(s.record.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </span>
                                                {s.actualLectureId && (
                                                    s.status === 'حاضر' ? (
                                                        <button onClick={() => onRemoveAttendance(s.id, s.actualLectureId as string)} className="text-red-500 font-black text-sm flex items-center gap-1 transition-all transform-gpu">
                                                            <XCircleIcon className="w-4 h-4"/> غياب
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => onManualAttendance(s.id, s.actualLectureId as string)} className="text-green-500 font-black text-sm flex items-center gap-1 transition-all transform-gpu">
                                                            <CheckCircleIcon className="w-4 h-4"/> تحضير
                                                        </button>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="text-center py-12 text-gray-500 italic">لا توجد بيانات لعرضها.</div>
                                    )}
                                </div>

                                <div className="hidden sm:block overflow-x-auto rounded-3xl border border-slate-800 mt-8">
                                    <table className="w-full text-right text-sm">
                                        <thead className="bg-slate-800/80 text-gray-400">
                                            <tr>
                                                <th className="px-6 py-4">#</th>
                                                <th className="px-6 py-4">اسم الطالب</th>
                                                <th className="px-6 py-4">الحالة</th>
                                                <th className="px-6 py-4">تحكم</th>
                                                <th className="px-6 py-4">التوقيت</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {managementAttendanceData.map((s) => (
                                                <tr key={s.id} className="hover:bg-slate-800/40 transition-colors transform-gpu">
                                                    <td className="px-6 py-4 font-mono text-gray-500">{s.serialNumber}</td>
                                                    <td className="px-6 py-4 font-bold text-white">{s.name}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                            s.status === 'حاضر' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                                        }`}>
                                                            {s.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {s.actualLectureId && (
                                                            s.status === 'حاضر' ? (
                                                                <button onClick={() => onRemoveAttendance(s.id, s.actualLectureId as string)} className="text-red-500 hover:text-red-400 font-black text-[10px] flex items-center gap-1 uppercase tracking-wider bg-red-500/5 px-3 py-1.5 rounded-xl transition-all transform-gpu active:scale-90">
                                                                    <XCircleIcon className="w-3.5 h-3.5"/> غياب
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => onManualAttendance(s.id, s.actualLectureId as string)} className="text-green-500 hover:text-green-400 font-black text-[10px] flex items-center gap-1 uppercase tracking-wider bg-green-500/5 px-3 py-1.5 rounded-xl transition-all transform-gpu active:scale-90">
                                                                    <CheckCircleIcon className="w-3.5 h-3.5"/> تحضير
                                                                </button>
                                                            )
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                                                        {s.record ? new Date(s.record.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {managementAttendanceData.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 italic">لا توجد بيانات لعرضها.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-1">
                            <QRCodeDisplay activeLecture={activeLecture} onGenerateNew={handleGenerateNewClick} title="إدارة الحضور" isRamadanMode={isRamadanMode} />
                        </div>
                    </div>
                </div>
            )}

            <Modal isOpen={isScannerOpen && activeLecture !== null} onClose={() => setScannerOpen(false)} title={`مسح: ${activeLecture?.courseName}`} isRamadanMode={isRamadanMode}>
                 {activeLecture && (
                     <QRCodeScanner 
                         onScanSuccess={handleScanSuccess}
                         onClose={() => setScannerOpen(false)}
                         qrToMatch={activeLecture.qrCode}
                         isRamadanMode={isRamadanMode}
                     />
                 )}
            </Modal>

            <Modal isOpen={isCreateGroupModalOpen} onClose={() => setCreateGroupModalOpen(false)} title="إنشاء مجموعة جديدة" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleCreateGroup} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">اسم المجموعة</label>
                        <input 
                            type="text" 
                            value={newGroupName} 
                            onChange={(e) => setNewGroupName(e.target.value)} 
                            required 
                            className={`w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:outline-none ${isRamadanMode ? 'focus:border-yellow-500' : 'focus:border-blue-500'}`} 
                            placeholder="مثال: مجموعة أ"
                        />
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setCreateGroupModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all transform-gpu">إلغاء</button>
                        <button type="submit" disabled={!newGroupName.trim()} className={`flex-1 px-6 py-3 font-bold rounded-2xl transition-all transform-gpu shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'}`}>إنشاء</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isAddMemberModalOpen} onClose={() => setAddMemberModalOpen(false)} title="إضافة أعضاء للمجموعة" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleAddMembers} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">البحث عن طلاب</label>
                        <input 
                            type="text" 
                            value={studentSearchQuery} 
                            onChange={(e) => setStudentSearchQuery(e.target.value)}
                            className="w-full px-4 py-2 text-sm border-2 rounded-xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none mb-3"
                            placeholder="بحث بالاسم أو الرقم الجامعي..."
                        />
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {allStudents
                                .filter(s => s.id !== student.id && !s.groupId && (s.name.includes(debouncedSearchQuery) || s.universityId.includes(debouncedSearchQuery)))
                                .map(s => (
                                    <div key={s.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                        <div>
                                            <p className="text-white font-bold text-sm">{s.name}</p>
                                            <p className="text-gray-500 text-xs">{s.universityId}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newSet = new Set(selectedMemberIds);
                                                if (newSet.has(s.id)) newSet.delete(s.id);
                                                else newSet.add(s.id);
                                                setSelectedMemberIds(newSet);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all transform-gpu ${selectedMemberIds.has(s.id) ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-300 hover:bg-slate-600'}`}
                                        >
                                            {selectedMemberIds.has(s.id) ? 'محدد' : 'تحديد'}
                                        </button>
                                    </div>
                                ))}
                            {allStudents.filter(s => s.id !== student.id && !s.groupId && (s.name.includes(debouncedSearchQuery) || s.universityId.includes(debouncedSearchQuery))).length === 0 && (
                                <div className="text-center py-4 text-gray-500 text-sm">لا يوجد طلاب متاحين للبحث</div>
                            )}
                        </div>
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setAddMemberModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all transform-gpu">إلغاء</button>
                        <button type="submit" disabled={selectedMemberIds.size === 0} className="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all transform-gpu shadow-lg shadow-blue-600/20 disabled:opacity-50">إضافة المحددين ({selectedMemberIds.size})</button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isEditGroupNameModalOpen} onClose={() => setEditGroupNameModalOpen(false)} title="تعديل اسم المجموعة" isRamadanMode={isRamadanMode}>
                <form onSubmit={handleUpdateGroupName} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 px-1">اسم المجموعة الجديد</label>
                        <input 
                            type="text" 
                            value={editGroupName} 
                            onChange={(e) => setEditGroupName(e.target.value)} 
                            required 
                            className={`w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:outline-none ${isRamadanMode ? 'focus:border-yellow-500' : 'focus:border-blue-500'}`} 
                            placeholder="اسم المجموعة"
                        />
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setEditGroupNameModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all transform-gpu">إلغاء</button>
                        <button type="submit" className={`flex-1 px-6 py-3 font-bold rounded-2xl transition-all transform-gpu shadow-lg ${isRamadanMode ? 'ramadan-btn-gold' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'}`}>حفظ</button>
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
                            disabled={isCreatingQr} 
                            className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                        >
                            <option value="">اختر المقرر</option>
                            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {courses.length === 0 && <p className="text-xs text-red-400">لا توجد مقررات مخصصة لسنتك الدراسية.</p>}
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
                        <input type="date" value={qrForm.date} onChange={(e) => setQrForm(p => ({...p, date: e.target.value}))} required disabled={isCreatingQr} className="w-full px-4 py-3 border-2 rounded-2xl bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"/>
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

                    {qrError && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-sm font-bold text-center animate-fade-in">
                            {qrError}
                        </div>
                    )}

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

            <Modal isOpen={isRepeatModalOpen} onClose={() => setRepeatModalOpen(false)} title="تكرار الحضور السابق" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <CopyIcon className="mx-auto h-16 w-16 text-purple-500 mb-4" />
                    <p className="text-gray-300 font-bold mb-4">سيتم نسخ حضور المحاضرة السابقة لنفس المقرر وإضافته لهذه المحاضرة.</p>
                    {repeatStatus && (
                        <div className={`p-3 rounded-xl mb-4 font-bold ${repeatStatus.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {repeatStatus.message}
                        </div>
                    )}
                    <div className="flex gap-3">
                        <button onClick={() => setRepeatModalOpen(false)} disabled={isRepeating} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold disabled:opacity-50 transition-all transform-gpu">إلغاء</button>
                        <button onClick={handleConfirmRepeat} disabled={isRepeating} className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 rounded-2xl text-white font-bold transition-all transform-gpu disabled:opacity-50">
                            {isRepeating ? 'جاري التكرار...' : 'تأكيد التكرار'}
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isClearAttendanceModalOpen} onClose={() => setClearAttendanceModalOpen(false)} title="مسح التحضير" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <TrashIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                    <p className="text-gray-300 font-bold">هل أنت متأكد من مسح جميع سجلات حضور الطلاب <span className="text-red-400">لهذه المحاضرة فقط</span>؟</p>
                    <p className="text-gray-500 text-xs mt-2">المحاضرة ستبقى موجودة، ولكن سيتم تصفير التحضير.</p>
                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setClearAttendanceModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">إلغاء</button>
                        <button onClick={() => { if(managementSelectedLectureId) onClearLectureAttendance(managementSelectedLectureId); setClearAttendanceModalOpen(false); }} className="flex-1 py-3 bg-red-600 rounded-2xl text-white font-bold transition-all transform-gpu">تأكيد المسح</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isDeleteLectureModalOpen} onClose={() => setDeleteLectureModalOpen(false)} title="حذف المحاضرة" isRamadanMode={isRamadanMode}>
                <div className="text-center p-4">
                    <TrashIcon className="mx-auto h-16 w-16 text-red-500 mb-4" />
                    <p className="text-gray-300 font-bold">سيتم حذف المحاضرة وجميع سجلات حضور الطلاب المرتبطة بها نهائياً.</p>
                    <div className="mt-8 flex gap-3">
                        <button onClick={() => setDeleteLectureModalOpen(false)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold transition-all transform-gpu">تراجع</button>
                        <button onClick={handleConfirmDeleteLecture} className="flex-1 py-3 bg-red-600 rounded-2xl text-white font-bold transition-all transform-gpu">حذف نهائي</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default StudentDashboard;