import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast'; // 👈 استيراد الإشعارات الأنيقة
import { User, Student, Batch, Lecture, AttendanceRecord, Group, Course, UserRole } from '../types';
import { 
  getAttendance, 
  getLectures, 
  getDeviceBindingSetting, 
  getAbsencePercentageSetting, 
  getBatches,
  getLocationRestrictionSetting,
  setLocationRestrictionSetting,
  getStudents,
  getGroups,
  getAbsenceWeightSetting,
  setAbsenceWeightSetting as apiSetAbsenceWeightSetting,
  addStudent as apiAddStudent,
  updateStudent as apiUpdateStudent,
  deleteStudent as apiDeleteStudent,
  createGroup as apiCreateGroup,
  addLecture as apiAddLecture,
  deleteLecture as apiDeleteLecture,
  addAttendanceRecord as apiAddAttendanceRecord,
  removeAttendanceRecord as apiRemoveAttendanceRecord,
  addBulkAttendanceRecords as apiAddBulkAttendanceRecords,
  resetStudentDevice as apiResetStudentDevice,
  resetAllStudentsDevices as apiResetAllStudentsDevices,
  setDeviceBindingSetting as apiSetDeviceBindingSetting,
  setAbsencePercentageSetting as apiSetAbsencePercentageSetting,
  clearAllAttendance as apiClearAllAttendance,
  clearAllLectures as apiClearAllLectures,
  recalculateAllSerialNumbers as apiRecalculateAllSerialNumbers,
  clearLectureAttendance as apiClearLectureAttendance
} from '../services/api';
import { supabase } from '../services/supabaseClient';
import { useSession } from '../hooks/useSession';

const QR_CODE_VALIDITY_MS = 15 * 60 * 1000; 
const MAX_DISTANCE_METERS = 250; 

function getDistance(
    loc1: { latitude: number; longitude: number },
    loc2: { latitude: number; longitude: number }
): number {
    const R = 6371e3; 
    const φ1 = loc1.latitude * Math.PI / 180;
    const φ2 = loc2.latitude * Math.PI / 180;
    const Δφ = (loc2.latitude - loc1.latitude) * Math.PI / 180;
    const Δλ = (loc2.longitude - loc1.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; 
}

interface AppState {
  batches: Batch[];
  students: Student[];
  groups: Group[];
  lectures: Lecture[];
  attendance: AttendanceRecord[];
  courses: Course[];

  absenceWeight: number;
  deviceBindingEnabled: boolean;
  absencePercentageEnabled: boolean;
  locationRestrictionEnabled: boolean;
  isRamadanMode: boolean;
  
  selectedBatchId: string | null;
  isLoading: boolean;
}

interface AppContextType extends AppState {
  selectBatch: (batchId: string | null) => void;
  refreshStudents: () => Promise<void>;
  refreshBatches: () => Promise<void>;
  toggleRamadanMode: () => void;
  
  updateAbsenceWeight: (weight: number) => Promise<void>;
  addStudent: (data: Omit<Student, 'id'>) => Promise<void>;
  updateStudent: (id: string, updates: Partial<Student>) => Promise<void>;
  deleteStudent: (id: string) => Promise<void>;
  updateGroupName: (groupId: string, newName: string) => void;
  addGroupLocal: (groupName: string) => Promise<void>;
  deleteAllGroupsLocal: () => void;
  
  generateQrCode: (
    details: { date: string, timeSlot: string, courseName: string, courseId?: string, batchId: string },
    callbacks: { onSuccess: () => void, onError: (message: string) => void }
  ) => void;
  deleteLecture: (lectureId: string) => Promise<void>;
  
  manualAttendance: (studentId: string, lectureId: string) => Promise<void>;
  removeAttendance: (studentId: string, lectureId: string) => Promise<void>;
  recordAttendance: (location: { latitude: number; longitude: number }) => Promise<{ success: boolean, message: string }>;
  repeatPreviousAttendance: (targetLectureId: string) => Promise<{ success: boolean, message: string }>;
  
  resetStudentDevice: (studentId: string) => Promise<void>;
  resetAllDevices: () => Promise<void>;
  toggleDeviceBinding: (enabled: boolean) => Promise<void>;
  toggleAbsencePercentage: (enabled: boolean) => Promise<void>;
  toggleLocationRestriction: (enabled: boolean) => Promise<void>;
  clearLectureAttendance: (lectureId: string) => Promise<void>;
  clearAllAttendance: () => Promise<void>;
  clearAllLectures: () => Promise<void>;
  recalculateSerials: () => Promise<void>;
  
  filteredStudents: Student[];
  filteredLectures: Lecture[];
  filteredAttendance: AttendanceRecord[];
  activeLecture: Lecture | null;
  studentCourses: Course[];
  currentBatch: Batch | undefined;
  setBatches: React.Dispatch<React.SetStateAction<Batch[]>>;
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const pendingAttendance = React.useRef<AttendanceRecord[]>([]);
  
  const [state, setState] = useState<AppState>({
    batches: [],
    students: [],
    groups: [],
    lectures: [],
    attendance: [],
    courses: [],
    absenceWeight: 2.5,
    deviceBindingEnabled: true,
    absencePercentageEnabled: true,
    locationRestrictionEnabled: false,
    isRamadanMode: typeof window !== 'undefined' ? localStorage.getItem('ramadanMode') === 'true' : false,
    selectedBatchId: typeof window !== 'undefined' ? localStorage.getItem('selectedBatchId') : null,
    isLoading: true,
  });

  const updateState = useCallback((updates: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => {
      setState(prev => {
          const newValues = typeof updates === 'function' ? updates(prev) : updates;
          return { ...prev, ...newValues };
      });
    }, []);

  // 💡 نظام المزامنة الذكي (وضع عدم الاتصال)
  useEffect(() => {
    const syncOfflineData = async () => {
        const offlineData = localStorage.getItem('anmo_offline_attendance');
        if (offlineData) {
            try {
                const records: Omit<AttendanceRecord, 'id'>[] = JSON.parse(offlineData);
                if (records.length > 0) {
                    toast.loading('عاد الاتصال! جاري مزامنة سجلات الحضور...', { id: 'sync' });
                    
                    const result = await apiAddBulkAttendanceRecords(records);
                    
                    if (!result.error) {
                        localStorage.removeItem('anmo_offline_attendance');
                        toast.success('تمت مزامنة البيانات بنجاح!', { id: 'sync' });
                        // سحب البيانات من السيرفر للحصول على المعرفات الحقيقية
                        const updatedAttendance = await getAttendance();
                        updateState({ attendance: updatedAttendance });
                    } else {
                        toast.error('فشلت المزامنة، سنحاول لاحقاً.', { id: 'sync' });
                    }
                }
            } catch (e) {
                localStorage.removeItem('anmo_offline_attendance');
            }
        }
    };

    window.addEventListener('online', syncOfflineData);
    if (navigator.onLine) syncOfflineData();

    return () => window.removeEventListener('online', syncOfflineData);
  }, [updateState]);

  // Load initial global data
  useEffect(() => {
    const loadInitialData = async () => {
      updateState({ isLoading: true });
      try {
        const [attendanceList, lectureList, bindingEnabled, percentageEnabled, batchList, weightSetting] = await Promise.all([
          getAttendance(),
          getLectures(),
          getDeviceBindingSetting(),
          getAbsencePercentageSetting(),
          getBatches(),
          getAbsenceWeightSetting()
        ]);

        let locationEnabled = false;
        try {
            if (getLocationRestrictionSetting) {
                locationEnabled = await getLocationRestrictionSetting();
            }
        } catch (e: any) {
            console.error('Error fetching location restriction setting:', e?.message || String(e));
        }
        
        updateState({
          attendance: attendanceList,
          lectures: lectureList,
          absenceWeight: weightSetting,
          deviceBindingEnabled: bindingEnabled,
          absencePercentageEnabled: percentageEnabled,
          locationRestrictionEnabled: locationEnabled,
          batches: batchList,
          isLoading: false,
        });
      } catch (error: any) {
        console.error('Failed to load initial data:', error?.message || String(error));
        updateState({ isLoading: false });
      }
    };
    
    loadInitialData();
  }, [updateState]);

  // Load batch specific data
  useEffect(() => {
    const loadBatchData = async () => {
      if (!state.selectedBatchId) {
        updateState({ students: [], groups: [], courses: [] });
        return;
      }

      try {
        const [studentList, groupList] = await Promise.all([
          getStudents(state.selectedBatchId),
          getGroups(state.selectedBatchId)
        ]);

        const { data: batchData } = await supabase
            .from('batches')
            .select('current_year')
            .eq('id', state.selectedBatchId)
            .single();

        let query = supabase.from('courses').select('*');
        if (batchData?.current_year) {
            query = query.eq('academic_year', batchData.current_year);
        }
        
        const { data: coursesData } = await query;
        
        const formattedCourses = (coursesData || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            code: c.course_code || c.code,
            academicYear: c.academic_year,
            creditHours: c.credit_hours,
            weeks: c.weeks,
            absenceLimit: c.absence_limit || 25,
            absenceWeight: c.absence_weight ?? 2.5,
            createdAt: c.created_at
        }));

        updateState({ 
            students: studentList, 
            groups: groupList, 
            courses: formattedCourses 
        });
      } catch (error: any) {
        console.error('Failed to load batch data:', error?.message || String(error));
      }
    };
    
    loadBatchData();
  }, [state.selectedBatchId, updateState]);

  // Realtime attendance updates
  useEffect(() => {
    if (!state.selectedBatchId) return;
    
    const channel = supabase
        .channel('attendance-changes')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'attendance' },
            (payload) => {
                const newRecord = {
                    id: payload.new.id,
                    studentId: payload.new.student_id,
                    studentName: payload.new.student_name,
                    timestamp: payload.new.timestamp,
                    location: payload.new.location,
                    lectureId: payload.new.lecture_id,
                    isOutsideRadius: payload.new.is_outside_radius,
                    manualEntry: payload.new.manual_entry,
                    distance: payload.new.distance,
                };
                pendingAttendance.current.push(newRecord);
            }
        )
        .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'attendance' },
            (payload) => {
                updateState(prev => ({
                    ...prev,
                    attendance: prev.attendance.filter(a => a.id !== payload.old.id)
                }));
            }
        )
        .subscribe();

    const flushInterval = setInterval(() => {
        if (pendingAttendance.current.length > 0) {
            const batch = [...pendingAttendance.current];
            pendingAttendance.current = [];

            updateState(prev => {
                const attendance = prev.attendance || [];
                const existingIds = new Set(attendance.map(a => a.id));
                const uniqueNewRecords = batch.filter(record => !existingIds.has(record.id));
                
                if (uniqueNewRecords.length === 0) return prev;
                return { ...prev, attendance: [...attendance, ...uniqueNewRecords] };
            });
        }
    }, 3000);
    
    return () => {
        supabase.removeChannel(channel);
        clearInterval(flushInterval);
    };
  }, [state.selectedBatchId, updateState]);

  const filteredStudents = useMemo(() => {
      const students = state.students || [];
      if (!state.selectedBatchId) return students;
      return [...students].sort((a, b) => Number(a.serialNumber || 0) - Number(b.serialNumber || 0));
  }, [state.students, state.selectedBatchId]);

  const filteredLectures = useMemo(() => {
      const lectures = state.lectures || []; 
      if (!state.selectedBatchId) return lectures;
      return lectures.filter(l => l.batchId === state.selectedBatchId);
  }, [state.lectures, state.selectedBatchId]);

  const filteredAttendance = useMemo(() => {
      const lectures = filteredLectures || [];
      const attendance = state.attendance || [];
      const lectureIds = new Set(lectures.map(l => l.id || l.qrCode));
      return attendance.filter(a => lectureIds.has(a.lectureId));
  }, [state.attendance, filteredLectures]);

  const validLectures = useMemo(() => {
      const lectures = state.lectures || []; 
      return lectures
          .filter(l => (Date.now() - new Date(l.createdAt).getTime()) < QR_CODE_VALIDITY_MS)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [state.lectures]);
  
  const activeLecture = validLectures.length > 0 ? validLectures[0] : null;
  const currentBatch = (state.batches || []).find(b => b.id === state.selectedBatchId);
  const studentCourses = state.courses || [];

  const selectBatch = useCallback((batchId: string | null) => {
    updateState({ selectedBatchId: batchId });
    if (batchId) {
      localStorage.setItem('selectedBatchId', batchId);
    } else {
      localStorage.removeItem('selectedBatchId');
    }
  }, [updateState]);

  const refreshStudents = useCallback(async () => {
    if (!state.selectedBatchId) return;
    const students = await getStudents(state.selectedBatchId);
    updateState({ students });
  }, [state.selectedBatchId, updateState]);

  const refreshBatches = useCallback(async () => {
    const batches = await getBatches();
    updateState({ batches });
  }, [updateState]);

  const toggleRamadanMode = useCallback(() => {
    updateState(prev => {
        const newValue = !prev.isRamadanMode;
        localStorage.setItem('ramadanMode', String(newValue));
        return { ...prev, isRamadanMode: newValue };
    });
  }, [updateState]);

  const addStudent = useCallback(async (data: Omit<Student, 'id'>) => {
    if (!state.selectedBatchId) {
        toast.error('يرجى اختيار الدفعة أولاً');
        return;
    }
    const payload = { ...data, batchId: state.selectedBatchId };
    const { data: newStudent, error } = await apiAddStudent(payload);
    if (error) {
        toast.error(error);
        return;
    }
    if (newStudent) {
      updateState(prev => ({ students: [...(prev.students || []), newStudent] }));
      toast.success('تمت إضافة الطالب بنجاح');
    }
  }, [state.selectedBatchId, updateState]);

  const updateStudent = useCallback(async (id: string, updates: Partial<Student>) => {
    const { data: updatedStudent, error } = await apiUpdateStudent(id, updates);
    if (error) {
        toast.error(error);
        return;
    }
    if (updatedStudent) {
      updateState(prev => ({
        students: (prev.students || []).map(s => s.id === id ? { ...s, ...updatedStudent } : s)
      }));
      toast.success('تم تحديث بيانات الطالب');
    }
  }, [updateState]);

  const deleteStudent = useCallback(async (id: string) => {
    const { error } = await apiDeleteStudent(id);
    if (error) {
        toast.error(error);
        return;
    }
    updateState(prev => ({
      students: (prev.students || []).filter(s => s.id !== id),
      attendance: (prev.attendance || []).filter(a => a.studentId !== id),
    }));
    toast.success('تم حذف الطالب بنجاح');
  }, [updateState]);

  const updateGroupName = useCallback((groupId: string, newName: string) => {
    updateState(prev => ({
        students: (prev.students || []).map(s => s.groupId === groupId ? { ...s, groupName: newName } : s),
        groups: (prev.groups || []).map(g => g.id === groupId ? { ...g, name: newName } : g)
    }));
  }, [updateState]);

  const addGroupLocal = useCallback(async (groupName: string) => {
    if (!state.selectedBatchId || !user) return;
    const { data, error } = await apiCreateGroup(groupName, state.selectedBatchId, user.id);
    if (error) {
        toast.error(error);
    } else if (data) {
        updateState(prev => ({ groups: [...(prev.groups || []), data] }));
        toast.success(`تم إنشاء مجموعة "${groupName}"`);
    }
  }, [state.selectedBatchId, user, updateState]);

  const deleteAllGroupsLocal = useCallback(() => {
    updateState(prev => ({
        groups: [],
        students: (prev.students || []).map(s => ({ ...s, groupId: undefined, groupName: undefined, isLeader: false }))
    }));
  }, [updateState]);

  const generateQrCode = useCallback((
    details: { date: string, timeSlot: string, courseName: string, courseId?: string, batchId: string },
    callbacks: { onSuccess: () => void, onError: (message: string) => void }
  ) => {
    let activeUserId = user?.id;
    let activeUserRole = user?.role;
    const localUserStr = localStorage.getItem('anmo_current_user');
    
    if (localUserStr) {
        try {
            const localUser = JSON.parse(localUserStr);
            activeUserId = localUser.id;
            activeUserRole = localUser.role;
        } catch (e) {}
    }

    const student = state.students.find(s => s.id === activeUserId);
    const isLeader = student?.isBatchLeader || student?.canManageAttendance;

    if (activeUserRole !== UserRole.Admin && !isLeader) {
        callbacks.onError('ليس لديك صلاحية إنشاء محاضرة.');
        return;
    }

    if (!details.batchId) {
        callbacks.onError('يرجى اختيار الدفعة أولاً.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const newLectureData: Omit<Lecture, 'id'> = {
                qrCode: `lecture-${details.courseName}-${details.date}-${details.timeSlot}-${Date.now()}`,
                courseName: details.courseName,
                courseId: details.courseId,
                batchId: details.batchId,
                date: details.date,
                timeSlot: details.timeSlot,
                createdAt: new Date().toISOString(),
                location: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                },
            };
            
            const { data: newLecture, error } = await apiAddLecture(newLectureData as Lecture);
            if (error) {
                callbacks.onError(error);
            } else if (newLecture) {
                updateState(prev => ({ lectures: [...prev.lectures, newLecture] }));
                callbacks.onSuccess();
                toast.success('تم إنشاء المحاضرة بنجاح!');
            } else {
                callbacks.onError("فشل حفظ المحاضرة في قاعدة البيانات.");
            }
        },
        (error: GeolocationPositionError) => {
            callbacks.onError('فشل في تحديد موقعك. لا يمكن إنشاء باركود بدونه.');
        },
        { enableHighAccuracy: true }
    );
  }, [state.students, user, updateState]);

  const deleteLecture = useCallback(async (lectureId: string) => {
      const { error } = await apiDeleteLecture(lectureId);
      if (error) {
          toast.error(error);
      } else {
          updateState(prev => ({
              lectures: (prev.lectures || []).filter(l => l.id !== lectureId && l.qrCode !== lectureId),
              attendance: (prev.attendance || []).filter(a => a.lectureId !== lectureId && a.lectureId !== lectureId)
          }));
          toast.success('تم حذف المحاضرة بنجاح');
      }
  }, [updateState]);

  const clearLectureAttendance = useCallback(async (lectureIdentifier: string) => {
      const lecture = state.lectures.find(l => l.id === lectureIdentifier || l.qrCode === lectureIdentifier);
      const actualId = lecture?.id || lectureIdentifier;
      const actualQr = lecture?.qrCode || lectureIdentifier;

      const { error } = await apiClearLectureAttendance(lectureIdentifier);
      
      if (error) {
          toast.error(error);
      } else {
          updateState(prev => ({
              attendance: (prev.attendance || []).filter(a => a.lectureId !== actualId && a.lectureId !== actualQr)
          }));
          toast.success('تم مسح تحضير هذه المحاضرة بنجاح.');
      }
  }, [state.lectures, updateState]);

  // 💡 التحضير اليدوي مع دعم وضع عدم الاتصال
  const manualAttendance = useCallback(async (studentId: string, lectureId: string) => {
      const student = filteredStudents.find(s => s.id === studentId);
      const lecture = filteredLectures.find(l => l.id === lectureId || l.qrCode === lectureId);
      if (!student || !lecture) return;

      const newRecordData: Omit<AttendanceRecord, 'id'> = {
          studentId,
          studentName: student.name,
          timestamp: new Date().toISOString(),
          location: lecture.location,
          lectureId: lecture.id || lectureId,
          isOutsideRadius: false,
          manualEntry: true,
          distance: 0,
      };

      if (!navigator.onLine) {
          const offlineQueue = JSON.parse(localStorage.getItem('anmo_offline_attendance') || '[]');
          offlineQueue.push(newRecordData);
          localStorage.setItem('anmo_offline_attendance', JSON.stringify(offlineQueue));
          
          const fakeRecord = { ...newRecordData, id: `temp-${Date.now()}` };
          updateState(prev => ({ attendance: [...(prev.attendance || []), fakeRecord as AttendanceRecord] }));
          toast.success(`تم تحضير ${student.name} محلياً (لا يوجد اتصال)`);
          return;
      }

      const { data: newRecord, error } = await apiAddAttendanceRecord(newRecordData);
      if (error) {
          toast.error(error);
      } else if (newRecord) {
          updateState(prev => ({ attendance: [...(prev.attendance || []), newRecord] }));
          toast.success(`تم تحضير ${student.name} يدوياً`);
      }
  }, [filteredStudents, filteredLectures, updateState]);

  const removeAttendance = useCallback(async (studentId: string, lectureId: string) => {
    const { error } = await apiRemoveAttendanceRecord(studentId, lectureId);
    if (!error) {
        updateState(prev => ({
            attendance: (prev.attendance || []).filter(rec => !(rec.studentId === studentId && rec.lectureId === lectureId))
        }));
    }
  }, [updateState]);

  // 💡 مسح الباركود مع دعم وضع عدم الاتصال
  const recordAttendance = useCallback(async (location: { latitude: number; longitude: number }): Promise<{ success: boolean, message: string }> => {
      let activeUserId = user?.id;
      const localUserStr = localStorage.getItem('anmo_current_user');
      if (localUserStr) {
          try { activeUserId = JSON.parse(localUserStr).id; } catch (e) {}
      }

      if (!activeUserId) return { success: false, message: "غير مسجل الدخول" };
      
      const student = state.students.find(s => s.id === activeUserId);
      if (!student) return { success: false, message: "لم يتم العثور على بيانات الطالب." };
      if (!activeLecture) return { success: false, message: "لا توجد محاضرة نشطة." };

      const lectureIdentifier = activeLecture.id || activeLecture.qrCode;
      const distance = getDistance(location, activeLecture.location);
      
      const isOutsideRadius = state.locationRestrictionEnabled ? distance > MAX_DISTANCE_METERS : false;

      if (state.attendance.some(rec => rec.studentId === activeUserId && rec.lectureId === lectureIdentifier)) {
          return { success: true, message: "لقد سجلت حضورك بالفعل لهذه المحاضرة." };
      }
      
      const newRecordData: Omit<AttendanceRecord, 'id'> = {
          studentId: activeUserId,
          studentName: student.name,
          timestamp: new Date().toISOString(),
          location: location,
          lectureId: lectureIdentifier,
          isOutsideRadius: isOutsideRadius,
          distance: Math.round(distance),
      };

      if (!navigator.onLine) {
          const offlineQueue = JSON.parse(localStorage.getItem('anmo_offline_attendance') || '[]');
          offlineQueue.push(newRecordData);
          localStorage.setItem('anmo_offline_attendance', JSON.stringify(offlineQueue));
          
          const fakeRecord = { ...newRecordData, id: `temp-${Date.now()}` };
          updateState(prev => ({ attendance: [...prev.attendance, fakeRecord as AttendanceRecord] }));
          return { success: true, message: "تم تسجيل حضورك محلياً لعدم وجود اتصال. ستتم المزامنة لاحقاً." };
      }
      
      const { data: newRecord, error } = await apiAddAttendanceRecord(newRecordData);

      if (error) return { success: false, message: error };

      if (newRecord) {
          updateState(prev => ({ attendance: [...prev.attendance, newRecord] }));
          return { success: true, message: "تم تسجيل حضورك بنجاح!" };
      }
      
      return { success: false, message: "فشل تسجيل الحضور." };
  }, [user, state.students, activeLecture, state.attendance, state.locationRestrictionEnabled, updateState]);

  const repeatPreviousAttendance = useCallback(async (targetLectureId: string) => {
      try {
          const currentLecture = state.lectures.find(l => l.id === targetLectureId || l.qrCode === targetLectureId);
          if (!currentLecture) return { success: false, message: 'المحاضرة الحالية غير موجودة.' };

          const previousLectures = state.lectures
              .filter(l => 
                  l.batchId === currentLecture.batchId &&
                  (l.courseId === currentLecture.courseId || (l.courseName === currentLecture.courseName)) && 
                  l.id !== currentLecture.id && 
                  new Date(l.createdAt) < new Date(currentLecture.createdAt)
              )
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          if (previousLectures.length === 0) return { success: false, message: 'لا توجد محاضرات سابقة مسجلة لهذا المقرر.' };

          const prevLecture = previousLectures[0];
          const prevAttendance = state.attendance.filter(a => a.lectureId === prevLecture.id || a.lectureId === prevLecture.qrCode);

          if (prevAttendance.length === 0) return { success: false, message: 'المحاضرة السابقة لا تحتوي على غياب أو حضور لنسخه.' };

          const existingCurrentStudentIds = new Set(state.attendance.filter(a => a.lectureId === currentLecture.id || a.lectureId === currentLecture.qrCode).map(a => a.studentId));

          const newRecords = prevAttendance
              .filter(a => !existingCurrentStudentIds.has(a.studentId))
              .map(a => ({
                  studentId: a.studentId,
                  studentName: a.studentName,
                  timestamp: new Date().toISOString(),
                  location: currentLecture.location,
                  lectureId: currentLecture.id || currentLecture.qrCode,
                  isOutsideRadius: false,
                  manualEntry: true,
                  distance: 0
              }));

          if (newRecords.length === 0) return { success: true, message: 'جميع الطلاب (الذين حضروا المحاضرة السابقة) مسجلون بالفعل هنا.' };

          const result = await apiAddBulkAttendanceRecords(newRecords);
          if (result.error) return { success: false, message: `خطأ من السيرفر: ${result.error}` };

          if (result.data) {
              updateState(prev => ({ attendance: [...(prev.attendance || []), ...result.data] }));
          }
          toast.success(`تم بنجاح تكرار حضور ${newRecords.length} طالب!`);
          return { success: true, message: `تم التكرار بنجاح` };
      } catch (err: any) {
          return { success: false, message: `حدث خطأ في النظام: ${err.message}` };
      }
  }, [state.lectures, state.attendance, updateState]);

  const resetStudentDevice = useCallback(async (studentId: string) => {
    const { data: updatedStudent, error } = await apiResetStudentDevice(studentId);
    if (!error && updatedStudent) {
        updateState(prev => ({
            students: (prev.students || []).map(s => s.id === studentId ? updatedStudent : s)
        }));
        toast.success('تم إلغاء ربط جهاز الطالب');
    }
  }, [updateState]);

  const resetAllDevices = useCallback(async () => {
    const { error } = await apiResetAllStudentsDevices();
    if (error) {
        toast.error(error);
    } else {
        updateState(prev => ({
            students: (prev.students || []).map(s => ({ ...s, deviceInfo: undefined }))
        }));
        toast.success('تم إلغاء ربط جميع الأجهزة بنجاح.');
    }
  }, [updateState]);

  const toggleDeviceBinding = useCallback(async (enabled: boolean) => {
    await apiSetDeviceBindingSetting(enabled);
    updateState({ deviceBindingEnabled: enabled });
    toast.success(enabled ? 'تم تفعيل ربط الأجهزة' : 'تم تعطيل ربط الأجهزة');
  }, [updateState]);

  const toggleAbsencePercentage = useCallback(async (enabled: boolean) => {
    await apiSetAbsencePercentageSetting(enabled);
    updateState({ absencePercentageEnabled: enabled });
    toast.success(enabled ? 'تم تفعيل نسبة الغياب' : 'تم تعطيل نسبة الغياب');
  }, [updateState]);

  const updateAbsenceWeight = useCallback(async (weight: number) => {
      await apiSetAbsenceWeightSetting(weight);
      updateState({ absenceWeight: weight });
    }, [updateState]);

  const clearAllAttendance = useCallback(async () => {
    const { error } = await apiClearAllAttendance();
    if (error) {
        toast.error(error);
    } else {
        updateState({ attendance: [] });
        toast.success('تم مسح جميع سجلات الحضور بنجاح.');
    }
  }, [updateState]);

  const clearAllLectures = useCallback(async () => {
    const { error } = await apiClearAllLectures();
    if (error) {
        toast.error(error);
    } else {
        updateState({ attendance: [], lectures: [] });
        toast.success('تم مسح جميع المحاضرات والسجلات بنجاح.');
    }
  }, [updateState]);

  const recalculateSerials = useCallback(async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في إعادة احتساب الأرقام التسلسلية لجميع الطلاب؟ سيتم ترتيبهم حسب الرقم الجامعي.')) return;
    toast.loading('جاري التحديث...', { id: 'serial' });
    await apiRecalculateAllSerialNumbers();
    if (state.selectedBatchId) {
        const updatedStudents = await getStudents(state.selectedBatchId);
        updateState({ students: updatedStudents });
    }
    toast.success('تم تحديث الأرقام التسلسلية بنجاح.', { id: 'serial' });
  }, [state.selectedBatchId, updateState]);

  const setBatches = useCallback((action: React.SetStateAction<Batch[]>) => {
      updateState(prev => ({ batches: typeof action === 'function' ? action(prev.batches || []) : action }));
  }, [updateState]);

  const setCourses = useCallback((action: React.SetStateAction<Course[]>) => {
      updateState(prev => ({ courses: typeof action === 'function' ? action(prev.courses || []) : action }));
  }, [updateState]);

  const toggleLocationRestriction = useCallback(async (enabled: boolean) => {
    await setLocationRestrictionSetting(enabled);
    updateState({ locationRestrictionEnabled: enabled });
    toast.success(enabled ? 'تم تفعيل قيود الموقع' : 'تم تعطيل قيود الموقع');
  }, [updateState]);

  const value: AppContextType = {
    ...state,
    selectBatch,
    refreshStudents,
    refreshBatches,
    toggleRamadanMode,
    addStudent,
    updateStudent,
    deleteStudent,
    updateGroupName,
    addGroupLocal,
    deleteAllGroupsLocal,
    generateQrCode,
    deleteLecture,
    manualAttendance,
    removeAttendance,
    recordAttendance,
    repeatPreviousAttendance,
    resetStudentDevice,
    resetAllDevices,
    updateAbsenceWeight,
    toggleDeviceBinding,
    toggleAbsencePercentage,
    toggleLocationRestriction,
    clearLectureAttendance,
    clearAllAttendance,
    clearAllLectures,
    recalculateSerials,
    filteredStudents,
    filteredLectures,
    filteredAttendance,
    activeLecture,
    studentCourses,
    currentBatch,
    setBatches,
    setCourses,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppState must be used within AppProvider');
  }
  return context;
}