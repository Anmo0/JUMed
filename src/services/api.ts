
import { Student, AttendanceRecord, Lecture, User, UserRole, Group, Course, AppLoginResult } from '../types';
import { supabase } from './supabaseClient';
import { initialCourses } from './courseData';

// --- Supabase API Implementation ---

/*
-- ================================================================================================
--  SQL SCHEMA UPDATES FOR GROUPS
--  Run these commands in Supabase SQL Editor to enable Group functionality.
-- ================================================================================================

-- 1. Create groups table
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  academic_year TEXT DEFAULT 'السنة الرابعة',
  gender TEXT DEFAULT 'male',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add group columns to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_leader BOOLEAN DEFAULT FALSE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS tag TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS can_manage_attendance BOOLEAN DEFAULT FALSE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT 'السنة الرابعة';
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male';

-- 3. Add columns to lectures table
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT 'السنة الرابعة';
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male';

-- 4. IMPORTANT: Refresh Schema Cache (Run this if you get "Could not find the table" error)
NOTIFY pgrst, 'reload schema';

*/

// --- Local Session Management ---
let currentUserStore: User | null = null;

// --- DB Types Interfaces (للتخلص من any) ---
interface DBStudent {
    id: string;
    name: string;
    university_id: string;
    serial_number: string;
    device_info: string | null;
    batch_id: string;
    is_batch_leader: boolean;
    can_manage_attendance: boolean;
    tag: string | null;
    group_id: string | null;
    groups?: { name: string };
    is_group_leader?: boolean;
    is_leader?: boolean;
}

interface DBAttendanceRecord {
    id: string;
    student_id: string;
    student_name: string;
    timestamp: string;
    location: { latitude: number; longitude: number };
    lecture_id: string;
    is_outside_radius: boolean;
    manual_entry: boolean;
    distance: number;
}

interface DBLecture {
    id: string;
    qr_code: string;
    course_name: string;
    course_id?: string;
    batch_id: string;
    date: string;
    time_slot: string;
    created_at: string;
    location: { latitude: number; longitude: number };
}

interface DBGroup {
    id: string;
    name: string;
    batch_id: string;
}

// --- Helper Mappers ---
const mapToStudent = (s: DBStudent): Student => ({
    id: s.id,
    name: s.name,
    universityId: s.university_id,
    serialNumber: s.serial_number,
    deviceInfo: s.device_info,
    batchId: s.batch_id,
    isBatchLeader: s.is_batch_leader,
    canManageAttendance: s.can_manage_attendance,
    tag: s.tag,
    groupId: s.group_id || undefined,
    groupName: s.groups?.name, 
    isLeader: s.is_group_leader || s.is_leader || false, 
});

const mapToAttendanceRecord = (r: DBAttendanceRecord): AttendanceRecord => ({
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name,
    timestamp: r.timestamp,
    location: r.location,
    lectureId: r.lecture_id,
    isOutsideRadius: r.is_outside_radius,
    manualEntry: r.manual_entry,
    distance: r.distance,
});

const mapToLecture = (l: DBLecture): Lecture => ({
    id: l.id,
    qrCode: l.qr_code,
    courseName: l.course_name,
    courseId: l.course_id,
    batchId: l.batch_id,
    date: l.date,
    timeSlot: l.time_slot,
    createdAt: l.created_at,
    location: l.location,
});

const mapToGroup = (g: DBGroup): Group => ({
    id: g.id,
    name: g.name,
    batchId: g.batch_id
});


// --- Helper Logic for Serial Numbers ---
export const recalculateAllSerialNumbers = async (): Promise<void> => {
    // 1. Fetch all students currently in the database
    const { data: students, error } = await supabase
        .from('students')
        .select('*'); 
        
    if (error || !students) {
        console.error("Failed to fetch students for serial number recalculation:", error);
        return;
    }

    // 2. Group students by branch (batch_id)
    // This ensures that serial numbers are independent for each branch
    const branches: Record<string, any[]> = {};
    students.forEach(s => {
        const branchKey = s.batch_id || 'unknown';
        if (!branches[branchKey]) branches[branchKey] = [];
        branches[branchKey].push(s);
    });

    const allUpdates: any[] = [];

    // 3. For each branch, sort and assign serial numbers
    Object.values(branches).forEach(branchStudents => {
        branchStudents.sort((a, b) => {
            const numA = parseInt(a.university_id.toString().replace(/\D/g, '') || '0');
            const numB = parseInt(b.university_id.toString().replace(/\D/g, '') || '0');
            
            if (numA > 0 && numB > 0 && numA !== numB) {
                return numA - numB;
            }
            
            return a.university_id.toString().localeCompare(b.university_id.toString(), undefined, { numeric: true });
        });

        branchStudents.forEach((s, index) => {
            allUpdates.push({
                ...s,
                serial_number: (index + 1).toString()
            });
        });
    });

    // 4. Perform Bulk Upsert
    if (allUpdates.length > 0) {
        const { error: updateError } = await supabase.from('students').upsert(allUpdates);
        if (updateError) {
            console.error("Failed to update serial numbers:", updateError);
        }
    }
};

// --- Batches Management ---
import { Batch } from '../types';

export const getBatches = async (): Promise<Batch[]> => {
    // جلب الدفعات مع أعداد الطلاب لحل مشكلة اختفاء الأرقام
    const { data, error } = await supabase.from('batches').select('*, students(count)');
    if (error || !data) {
        return [];
    }
    
    return data.map((b: any) => ({
        id: b.id,
        batchName: b.batch_name || 'دفعة بدون اسم',
        currentYear: b.current_year,
        isArchived: b.is_archived,
        studentCount: b.students && b.students.length > 0 ? b.students[0].count : 0
    }));
}

export const saveBatches = async (batches: Batch[]): Promise<void> => {
    for (const batch of batches) {
        await supabase.from('batches').upsert({ 
            id: batch.id,
            batch_name: batch.batchName, 
            current_year: batch.currentYear, 
            is_archived: batch.isArchived 
        });
    }
}

// دالة جديدة كلياً لإنشاء الدفعات وحل مشكلة المعرفات وحظر المتصفح
export const createBatches = async (newBatches: Omit<Batch, 'id' | 'isArchived'>[]): Promise<MutationResult<Batch[]>> => {
    const payload = newBatches.map(b => ({
        batch_name: b.batchName,
        current_year: b.currentYear,
        is_archived: false
    }));

    const { data, error } = await supabase.from('batches').insert(payload).select();

    if (error) {
        console.error('Supabase createBatches Error:', error);
        return { data: null, error: error.message };
    }

    return {
        data: data.map((b: any) => ({
            id: b.id,
            batchName: b.batch_name,
            currentYear: b.current_year,
            isArchived: b.is_archived,
            studentCount: 0
        })),
        error: null
    };
};

export const promoteBatches = async (): Promise<MutationResult<null>> => {
    const batches = await getBatches();
    
    const batchToArchive = batches.find(b => b.currentYear === 6);
    if (batchToArchive) {
        batchToArchive.isArchived = true;
    }

    batches.forEach(b => {
        if (!b.isArchived && b.currentYear && b.currentYear < 6) {
            b.currentYear += 1;
        }
    });

    await saveBatches(batches);

    let maxNum = 0;
    batches.forEach(b => {
        const match = b.batchName.match(/\d+/);
        if (match) {
            const num = parseInt(match[0]);
            if (num > maxNum) maxNum = num;
        }
    });
    
    const newBatchName = `Med ${maxNum + 1}`;
    // استخدام الدالة الجديدة لإنشاء الدفعات المرقاة
    await createBatches([
        { batchName: `${newBatchName} - طلاب`, currentYear: 2 },
        { batchName: `${newBatchName} - طالبات`, currentYear: 2 }
    ]);

    return { data: null, error: null };
};

export const undoPromotion = async (): Promise<MutationResult<null>> => {
    return { data: null, error: "Undo not fully implemented yet" };
};

export const importStudents = async (batchId: string, studentsToImport: { name: string, universityId: string }[]): Promise<MutationResult<{ imported: number, errors: string[] }>> => {
    // 1. Fetch existing students to check for duplicates
    const { data: existingStudents, error: fetchError } = await supabase.from('students').select('university_id');
    if (fetchError) {
        return { data: null, error: `فشل جلب الطلاب الحاليين: ${fetchError.message}` };
    }

    const existingIds = new Set(existingStudents.map(s => s.university_id.toString()));
    const errors: string[] = [];
    const validStudentsToInsert: any[] = [];

    // 2. Validate and prepare data
    studentsToImport.forEach((student, index) => {
        const rowNum = index + 2; // Assuming row 1 is header
        if (!student.name || !student.universityId) {
            errors.push(`صف ${rowNum}: الاسم أو الرقم الجامعي مفقود.`);
            return;
        }
        
        const uId = normalizeInput(student.universityId.toString());
        if (existingIds.has(uId)) {
            errors.push(`صف ${rowNum}: الرقم الجامعي (${uId}) موجود مسبقاً في النظام.`);
            return;
        }
        
        // Add to existingIds to prevent duplicates within the file itself
        existingIds.add(uId);
        
        validStudentsToInsert.push({
            name: student.name.trim(),
            university_id: uId,
            serial_number: 'temp', // Will be recalculated
            batch_id: batchId,
            can_manage_attendance: false,
            is_batch_leader: false
        });
    });

    if (validStudentsToInsert.length === 0) {
        return { data: { imported: 0, errors }, error: errors.length > 0 ? 'لم يتم استيراد أي طالب بسبب وجود أخطاء.' : 'الملف فارغ.' };
    }

    // 3. Insert valid students
    const { error: insertError } = await supabase.from('students').insert(validStudentsToInsert);
    if (insertError) {
        return { data: null, error: `فشل إدخال الطلاب: ${insertError.message}` };
    }

    // 4. Recalculate serial numbers
    await recalculateAllSerialNumbers();

    return { data: { imported: validStudentsToInsert.length, errors }, error: null };
};

// --- Data Fetching ---

export const getGroups = async (batchId: string): Promise<Group[]> => {
    const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('batch_id', batchId);
    
    if (error) {
        console.error('Supabase getGroups Error:', error.message);
        return [];
    }
    return data ? data.map(mapToGroup) : [];
};

export const getStudents = async (batchId: string): Promise<Student[]> => {
    const { data, error } = await supabase
        .from('students')
        // قمنا بإضافة groups!group_id(name) هنا لجلب اسم المجموعة برمجياً وتحديد العلاقة
        .select('*, groups!group_id(name)') 
        .eq('batch_id', batchId);

    if (error) {
        console.error('Supabase getStudents Error:', error.message);
        return [];
    }

    return data ? data.map(mapToStudent) : [];
};

export const getAttendance = async (): Promise<AttendanceRecord[]> => {
    const { data, error } = await supabase.from('attendance').select('*');
     if (error) {
        console.error('Supabase getAttendance Error:', error.message);
        return [];
    }
    return data ? data.map(mapToAttendanceRecord) : [];
};

export const getLectures = async (): Promise<Lecture[]> => {
    const { data, error } = await supabase.from('lectures').select('*');
    if (error) {
        console.error('Supabase getLectures Error:', error.message);
        return [];
    }
    return data ? data.map(mapToLecture) : [];
};

const USER_STORAGE_KEY = 'anmo_current_user';

export const signIn = async (universityId: string, serialNumber: string): Promise<MutationResult<User>> => {
    // 1. البحث في جدول المديرين أولاً
    const { data: adminData } = await supabase
        .from('admins')
        .select('*')
        .eq('university_id', universityId)
        .eq('serial_number', serialNumber)
        .single();

    if (adminData) {
        const user: User = { 
            id: adminData.id, 
            universityId: adminData.university_id, 
            role: UserRole.Admin, 
            name: adminData.name || 'Admin' 
        };
        localStorage.setItem('currentUser', JSON.stringify(user));
        return { data: user, error: null };
    }

    // 2. إذا لم يكن مديراً، نبحث في جدول الطلاب
    const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('university_id', universityId)
        .eq('serial_number', serialNumber)
        .single();

    if (studentData) {
        const user: User = { 
            id: studentData.id, 
            universityId: studentData.university_id, 
            role: UserRole.Student, 
            name: studentData.name,
            batchId: studentData.batch_id 
        };
        localStorage.setItem('currentUser', JSON.stringify(user));
        return { data: user, error: null };
    }

    return { data: null, error: 'الرقم الجامعي أو كلمة السر غير صحيحة' };
};

export const getCurrentUser = async (): Promise<User | null> => {
    const savedUser = localStorage.getItem('currentUser');
    if (!savedUser) return null;
    
    try {
        const user = JSON.parse(savedUser);
        // التحقق من أن المستخدم لا يزال موجوداً في قاعدة البيانات (اختياري لزيادة الأمان)
        return user;
    } catch {
        return null;
    }
};

// Helper to normalize input (convert Arabic/Persian digits to English, trim)
const normalizeInput = (str: string): string => {
    if (!str) return '';
    return str
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
        .trim();
};

// services/api.ts - استبدال الدالة login بالكامل
export const login = async (universityId: string, serialNumber: string, userType: 'student' | 'admin' = 'student'): Promise<AppLoginResult> => {
    
    const normalizedUniversityId = normalizeInput(universityId);
    const normalizedSerialNumber = normalizeInput(serialNumber);

    // Admin Login
    if (userType === 'admin') {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: normalizedUniversityId,
            password: normalizedSerialNumber
        });

        if (authError) {
            return { success: false, error: 'بيانات دخول المشرف غير صحيحة.' };
        }

        if (authData.user) {
            const { data: roleData } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', authData.user.id)
                .maybeSingle();  // ✅

            if (roleData?.role === 'admin') {
                const user: User = { 
                    id: authData.user.id, 
                    role: UserRole.Admin, 
                    name: authData.user.user_metadata?.name || 'المدير' 
                };
                currentUserStore = user;
                localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
                return { success: true, user };
            } else {
                await supabase.auth.signOut();
                return { success: false, error: 'ليس لديك صلاحيات المشرف.' };
            }
        }

        return { success: false, error: 'بيانات دخول المشرف غير صحيحة.' };
    }

    // Student Login - ✅ محسّن
    try {
        // محاولة البحث باستخدام الأرقام المعالجة
        let query = supabase
            .from('students')
            .select('*')
            .eq('university_id', normalizedUniversityId);

        // التعامل مع الرقم التسلسلي كـ نص أو رقم
        // بما أن serial_number قد يكون نصاً في قاعدة البيانات، نستخدم eq مباشرة
        // ولكن إذا كان هناك اختلاف في النوع، قد نحتاج لمعالجة إضافية.
        // سنفترض هنا أن التخزين متسق (أرقام إنجليزية أو نصوص).
        
        const { data: students, error } = await query;
        
        if (error) {
            console.error('Student login error:', error);
            return { success: false, error: 'حدث خطأ في الاتصال بقاعدة البيانات.' };
        }
        
        // تصفية النتائج يدوياً للتحقق من الرقم التسلسلي بمرونة أكثر
        // (مثلاً: تجاهل الأصفار البادئة إذا كانت موجودة)
        const student = students?.find(s => {
            const dbSerial = normalizeInput(String(s.serial_number || ''));
            return dbSerial === normalizedSerialNumber || 
                   parseInt(dbSerial) === parseInt(normalizedSerialNumber);
        });
        
        if (!student) {
            return { success: false, error: 'البيانات غير صحيحة. يرجى التحقق من الرقم الجامعي والرقم التسلسلي.' };
        }

        const studentData = mapToStudent(student); 
        const deviceInfo = navigator.userAgent;

        const isBindingEnabled = await getDeviceBindingSetting();

        if (isBindingEnabled) {
            if (studentData.deviceInfo && studentData.deviceInfo !== deviceInfo) {
                return { success: false, error: 'هذا الحساب مرتبط بجهاز آخر. يرجى التواصل مع المدير لإلغاء الربط.' };
            }

            if (!studentData.deviceInfo) {
                await supabase
                    .from('students')
                    .update({ device_info: deviceInfo })
                    .eq('id', studentData.id);
            }
        }
        
        const user: User = { 
            id: studentData.id, 
            role: UserRole.Student, 
            name: studentData.name,
            batchId: studentData.batchId
        };
        currentUserStore = user;
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user)); 
        
        return { success: true, user };
    } catch (err: any) {
        console.error('Login error:', err);
        return { success: false, error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' };
    }
};

export const logout = async (): Promise<void> => {
    currentUserStore = null;
    localStorage.removeItem(USER_STORAGE_KEY);
    await supabase.auth.signOut();
};

// --- Mutations with Error Handling ---

type MutationResult<T> = { data: T | null; error: string | null; };

export const createGroup = async (name: string, batchId: string, createdByUserId?: string): Promise<MutationResult<Group>> => {
    const { data, error } = await supabase
        .from('groups')
        .insert({ 
            name, 
            batch_id: batchId,
            created_by: createdByUserId
        })
        .select()
        .single();

    if (error) {
        console.error('Supabase createGroup Error:', error);
        return { data: null, error: `فشل إنشاء المجموعة: ${error.message}` };
    }
    return { data: mapToGroup(data), error: null };
};

export const addStudent = async (studentData: Omit<Student, 'id'>): Promise<MutationResult<Student>> => {
    try {
        const normalizedUniversityId = normalizeInput(studentData.universityId);
        const normalizedSerialNumber = normalizeInput(studentData.serialNumber || 'temp');

        const { data: existingStudent } = await supabase
            .from('students')
            .select('id')
            .eq('university_id', normalizedUniversityId)
            .maybeSingle();  // ✅ maybeSingle
        
        if (existingStudent) {
            return { data: null, error: 'طالب بهذا الرقم الجامعي موجود بالفعل.' };
        }

        const newStudentForDb = {
            name: studentData.name,
            university_id: normalizedUniversityId,
            serial_number: normalizedSerialNumber, 
            tag: studentData.tag,
            is_batch_leader: studentData.isBatchLeader,
            can_manage_attendance: studentData.canManageAttendance,
            batch_id: studentData.batchId,
            device_info: studentData.deviceInfo
        };
        
        const { data: insertedStudent, error } = await supabase
            .from('students')
            .insert(newStudentForDb)
            .select()
            .single();
        
        if (error) {
            console.error('Supabase addStudent Error:', error);
            return { data: null, error: `فشل إضافة الطالب: ${error.message}` };
        }

        return { data: insertedStudent ? mapToStudent(insertedStudent) : null, error: null };
    } catch (err: any) {
        console.error('addStudent error:', err);
        return { data: null, error: `حدث خطأ غير متوقع: ${err.message}` };
    }
};

export const updateStudent = async (id: string, updates: Partial<Student>): Promise<MutationResult<Student>> => {
    try {
        const payload: any = {};
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.universityId !== undefined) payload.university_id = updates.universityId;
        if (updates.serialNumber !== undefined) payload.serial_number = updates.serialNumber;
        
        // 💡 معالجة إزالة المجموعة بشكل صحيح (تحويلها إلى null بدلاً من نص فارغ)
        if (updates.groupId !== undefined) {
            payload.group_id = updates.groupId === '' ? null : updates.groupId;
        }
        
        if (updates.isLeader !== undefined) payload.is_leader = updates.isLeader;
        
        // 💡 هنا كان الخلل! تم تصحيح ربط المتغيرات ليقوم بتحديث العمودين معاً في قاعدة البيانات
        if (updates.isBatchLeader !== undefined) {
            payload.is_batch_leader = updates.isBatchLeader;
            payload.can_manage_attendance = updates.isBatchLeader; 
        }

        if (updates.deviceInfo !== undefined) payload.device_info = updates.deviceInfo;
        if (updates.tag !== undefined) payload.tag = updates.tag;

        // 1. نقوم بتنفيذ التعديل فقط
        const { error: updateError } = await supabase
            .from('students')
            .update(payload)
            .eq('id', id);

        if (updateError) {
            return { data: null, error: `فشل التحديث: ${updateError.message}` };
        }

        // 2. نجلب البيانات الجديدة بأمان
        const { data: fetchedData, error: fetchError } = await supabase
            .from('students')
            .select(`*, groups(name)`)
            .eq('id', id)
            .maybeSingle();

        if (fetchError || !fetchedData) {
            return { data: null, error: 'تم الحفظ، ولكن يرجى تحديث الصفحة لرؤية التغييرات.' };
        }

        return {
            data: {
                id: fetchedData.id,
                name: fetchedData.name,
                universityId: fetchedData.university_id,
                serialNumber: fetchedData.serial_number,
                isLeader: fetchedData.is_leader,
                // 💡 هنا الخلل الثاني! كان يجلب البيانات من العمود الخاطئ، تم تصحيحه للعمود الصحيح
                isBatchLeader: fetchedData.is_batch_leader,
                canManageAttendance: fetchedData.can_manage_attendance,
                groupId: fetchedData.group_id,
                groupName: fetchedData.groups?.name, // جلب اسم المجموعة الجديد
                batchId: fetchedData.batch_id,
                deviceInfo: fetchedData.device_info,
                tag: fetchedData.tag
            },
            error: null
        };
    } catch (err: any) {
        return { data: null, error: `حدث خطأ غير متوقع: ${err.message}` };
    }
};

export const assignStudentToGroup = async (studentId: string, groupId: string, isGroupLeader: boolean = false): Promise<MutationResult<null>> => {
    const { error } = await supabase
        .from('group_members')
        .upsert({
            student_id: studentId,
            group_id: groupId,
            is_group_leader: isGroupLeader
        }, { onConflict: 'student_id' });

    if (error) {
        console.error('Supabase assignStudentToGroup Error:', error);
        return { data: null, error: `فشل تعيين الطالب للمجموعة: ${error.message}` };
    }
    return { data: null, error: null };
};

export const getStudentGroup = async (studentId: string): Promise<MutationResult<{groupId: string, groupName: string, isLeader: boolean}>> => {
    const { data, error } = await supabase
        .from('group_members')
        .select(`
            group_id,
            is_group_leader,
            groups (
                id,
                name
            )
        `)
        .eq('student_id', studentId)
        .maybeSingle();

    if (error) {
        console.error('Supabase getStudentGroup Error:', error);
        return { data: null, error: `فشل جلب مجموعة الطالب: ${error.message}` };
    }

    if (!data) {
        return { data: null, error: 'الطالب غير منضم لأي مجموعة.' };
    }

    const group: any = data.groups;
    return { 
        data: { 
            groupId: group.id, 
            groupName: group.name, 
            isLeader: data.is_group_leader 
        }, 
        error: null 
    };
};

export const deleteStudents = async (batchId: string): Promise<MutationResult<null>> => {
    try {
        const { error } = await supabase
            .from('students')
            .delete()
            .eq('batch_id', batchId);

        if (error) throw error;
        return { data: null, error: null };
    } catch (error: any) {
        console.error('Supabase deleteStudents Error:', error);
        return { data: null, error: error.message };
    }
};

export const deleteBatchData = async (batchId: string): Promise<MutationResult<null>> => {
    // بفضل ON DELETE CASCADE، حذف الدفعة سيمسح كل شيء مرتبط بها آلياً في السيرفر
    const { error } = await supabase
        .from('batches')
        .delete()
        .eq('id', batchId);

    if (error) {
        console.error('Supabase deleteBatchData Error:', error.message);
        return { data: null, error: `فشل حذف الدفعة: ${error.message}` };
    }

    return { data: null, error: null };
};

export const deleteStudent = async (studentId: string): Promise<MutationResult<null>> => {
    const { error } = await supabase.from('students').delete().eq('id', studentId);
    if (error) {
        console.error('Supabase deleteStudent Error:', error);
        return { data: null, error: `فشل حذف الطالب: ${error.message}` };
    }
    await recalculateAllSerialNumbers();
    return { data: null, error: null };
};

export const updateGroup = async (groupId: string, name: string): Promise<MutationResult<Group>> => {
    const { data, error } = await supabase.from('groups').update({ name }).eq('id', groupId).select().single();
    if (error) {
        return { data: null, error: `فشل تحديث المجموعة: ${error.message}` };
    }
    return { data: mapToGroup(data), error: null };
};

export const resetStudentDevice = async (studentId: string): Promise<MutationResult<Student>> => {
    const { data, error } = await supabase
        .from('students')
        .update({ device_info: null })
        .eq('id', studentId)
        .select()
        .single();
        
    if (error) {
        console.error('Supabase resetStudentDevice Error:', error);
        return { data: null, error: `فشل إلغاء ربط الجهاز: ${error.message}` };
    }
    return { data: data ? mapToStudent(data) : null, error: null };
}

// FIX: Reset devices for ALL students by adding a dummy filter to satisfy Supabase's safety requirements
export const resetAllStudentsDevices = async (): Promise<MutationResult<null>> => {
    const { error } = await supabase
        .from('students')
        .update({ device_info: null })
        .not('id', 'is', null); // This acts as a WHERE clause for all records
        
    if (error) {
        console.error('Supabase resetAllStudentsDevices Error:', error);
        return { data: null, error: `فشل إلغاء ربط جميع الأجهزة: ${error.message}` };
    }
    return { data: null, error: null };
}

export const addLecture = async (newLecture: Lecture): Promise<MutationResult<Lecture>> => {
    // التحقق من وجود المقرر إذا تم تحديده
    if (newLecture.courseId) {
        const { data: course, error: courseError } = await supabase
            .from('courses')
            .select('id')
            .eq('id', newLecture.courseId)
            .maybeSingle();
        
        if (!course) {
            return { data: null, error: 'المقرر المحدد غير موجود.' };
        }
    }
    
    // التحقق من وجود الدفعة
    if (newLecture.batchId) {
        const { data: batch, error: batchError } = await supabase
            .from('batches')
            .select('id')
            .eq('id', newLecture.batchId)
            .maybeSingle();
        
        if (!batch) {
            return { data: null, error: 'الدفعة المحددة غير موجودة.' };
        }
    }
    
    const lectureForDb = {
        qr_code: newLecture.qrCode,
        course_name: newLecture.courseName,
        course_id: newLecture.courseId,
        batch_id: newLecture.batchId,
        date: newLecture.date,
        time_slot: newLecture.timeSlot,
        location: newLecture.location,
    };
    
    const { data, error } = await supabase
        .from('lectures')
        .insert(lectureForDb)
        .select()
        .single();
    
    if (error) {
        console.error('Supabase addLecture Error:', error);
        return { data: null, error: `فشل إنشاء المحاضرة: ${error.message}` };
    }
    
    return { data: data ? mapToLecture(data) : null, error: null };
};

export const deleteLecture = async (lectureId: string): Promise<MutationResult<null>> => {
    try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lectureId);
        let realLectureId = lectureId;
        if (!isUuid) {
            const { data: lec } = await supabase.from('lectures').select('id').eq('qr_code', lectureId).maybeSingle();
            if (!lec) return { data: null, error: 'المحاضرة غير موجودة.' };
            realLectureId = lec.id;
        }

        // حذف سجلات الحضور أولاً ثم المحاضرة (لتجنب أخطاء الربط)
        const { error: attendanceError } = await supabase.from('attendance').delete().eq('lecture_id', realLectureId);
        if (attendanceError) return { data: null, error: `فشل حذف سجلات الحضور: ${attendanceError.message}` };

        const { error: lectureError } = await supabase.from('lectures').delete().eq('id', realLectureId);
        if (lectureError) return { data: null, error: `فشل حذف المحاضرة: ${lectureError.message}` };

        return { data: null, error: null };
    } catch (err: any) { return { data: null, error: `حدث خطأ: ${err.message}` }; }
};

export const clearLectureAttendance = async (lectureIdentifier: string): Promise<MutationResult<null>> => {
    try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lectureIdentifier);
        let realLectureId = lectureIdentifier;

        if (!isUuid) {
            const { data: lec } = await supabase.from('lectures').select('id').eq('qr_code', lectureIdentifier).maybeSingle();
            if (!lec) return { data: null, error: 'المحاضرة غير موجودة.' };
            realLectureId = lec.id;
        }

        // 1. المحاولة الأساسية: مسح السجلات المرتبطة بالمعرف الرقمي (UUID)
        const { error } = await supabase.from('attendance').delete().eq('lecture_id', realLectureId);
        
        if (error) {
            // 2. المحاولة الاحتياطية: مسح السجلات القديمة المرتبطة بنص الباركود
            await supabase.from('attendance').delete().eq('lecture_id', lectureIdentifier);
        }

        return { data: null, error: null };
    } catch (err: any) { 
        return { data: null, error: `حدث خطأ: ${err.message}` }; 
    }
};

export const clearAllAttendance = async (): Promise<MutationResult<null>> => {
    const { error } = await supabase.from('attendance').delete().not('id', 'is', null);
    if (error) return { data: null, error: `فشل مسح جميع سجلات الحضور: ${error.message}` };
    return { data: null, error: null };
};

// تحديث الدالة لتكون محصورة بدفعة ومقرر معين
export const clearBatchLectures = async (batchId: string, courseId?: string): Promise<MutationResult<null>> => {
    // 1. جلب معرفات المحاضرات المطلوب حذفها فقط
    let query = supabase.from('lectures').select('id').eq('batch_id', batchId);
    if (courseId) query = query.eq('course_id', courseId);
    
    const { data: lecturesToDelete, error: fetchError } = await query;
    if (fetchError) return { data: null, error: fetchError.message };
    if (!lecturesToDelete || lecturesToDelete.length === 0) return { data: null, error: null };
    
    const ids = lecturesToDelete.map(l => l.id);
    
    // 2. حذف سجلات الحضور لهذه المحاضرات أولاً
    const { error: attError } = await supabase.from('attendance').delete().in('lecture_id', ids);
    if (attError) return { data: null, error: attError.message };
    
    // 3. حذف المحاضرات نفسها
    const { error: lecError } = await supabase.from('lectures').delete().in('id', ids);
    if (lecError) return { data: null, error: lecError.message };
    
    return { data: null, error: null };
};

export const deleteAllGroups = async (): Promise<MutationResult<null>> => {
    // 💡 تجريد جميع الطلاب من مناصب القيادة وفك ارتباطهم بالمجموعات
    await supabase.from('students').update({ group_id: null, group_name: null, is_leader: false }).not('group_id', 'is', null);
    const { error } = await supabase.from('groups').delete().not('id', 'is', null);
    if (error) return { data: null, error: `فشل مسح المجموعات: ${error.message}` };
    return { data: null, error: null };
};

export const deleteGroup = async (groupId: string): Promise<MutationResult<null>> => {
    // 💡 تجريد طلاب هذه المجموعة المحددة من القيادة وفك ارتباطهم
    await supabase.from('students').update({ group_id: null, group_name: null, is_leader: false }).eq('group_id', groupId);
    const { error } = await supabase.from('groups').delete().eq('id', groupId);
    if (error) return { data: null, error: `فشل حذف المجموعة: ${error.message}` };
    return { data: null, error: null };
};

export const addAttendanceRecord = async (newRecord: Omit<AttendanceRecord, 'id'>): Promise<MutationResult<AttendanceRecord>> => {
    try {
        const { data: lecture } = await supabase.from('lectures').select('id').or(`id.eq.${newRecord.lectureId},qr_code.eq.${newRecord.lectureId}`).maybeSingle();
        const lectureIdToUse = lecture?.id || newRecord.lectureId;

        const recordForDb = {
            student_id: newRecord.studentId,
            student_name: newRecord.studentName,
            timestamp: newRecord.timestamp,
            location: newRecord.location,
            lecture_id: lectureIdToUse,
            is_outside_radius: newRecord.isOutsideRadius,
            manual_entry: newRecord.manualEntry ?? false,
            distance: newRecord.distance,
        };
        
        const { data, error } = await supabase.from('attendance').insert(recordForDb).select().maybeSingle();
        if (error) return { data: null, error: `فشل تسجيل الحضور: ${error.message}` };
        return { data: data ? mapToAttendanceRecord(data) : null, error: null };
    } catch (err: any) { return { data: null, error: `حدث خطأ: ${err.message}` }; }
};

export const addGroupAttendance = async (leaderId: string, groupId: string, lectureId: string, location: { latitude: number; longitude: number }, isOutsideRadius: boolean, distance: number): Promise<MutationResult<{count: number}>> => {
    const { data: groupMembers, error: membersError } = await supabase.from('students').select('*').eq('group_id', groupId);
    if (membersError || !groupMembers || groupMembers.length === 0) return { data: null, error: membersError ? membersError.message : 'لم يتم العثور على أعضاء في المجموعة.' };

    const { data: existingAttendance } = await supabase.from('attendance').select('student_id').eq('lecture_id', lectureId);
    const existingStudentIds = new Set(existingAttendance?.map((a: any) => a.student_id));

    const newRecords = groupMembers.filter((member: any) => !existingStudentIds.has(member.id)).map((member: any) => ({
        student_id: member.id, student_name: member.name, timestamp: new Date().toISOString(), location: location, lecture_id: lectureId, is_outside_radius: isOutsideRadius, manual_entry: false, distance: distance
    }));

    if (newRecords.length === 0) return { data: { count: 0 }, error: null };
    const { error: insertError } = await supabase.from('attendance').insert(newRecords);
    if (insertError) return { data: null, error: insertError.message };
    return { data: { count: newRecords.length }, error: null };
};

export const addBulkAttendanceRecords = async (newRecords: Omit<AttendanceRecord, 'id'>[]): Promise<MutationResult<AttendanceRecord[]>> => {
    try {
        if (newRecords.length === 0) return { data: [], error: null };
        
        // جلب المعرف الرقمي الفعلي للمحاضرة لكي لا يرفضه السيرفر
        let realLectureId = newRecords[0].lectureId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(realLectureId);
        if (!isUuid) {
            const { data: lec } = await supabase.from('lectures').select('id').eq('qr_code', realLectureId).maybeSingle();
            if (lec) realLectureId = lec.id;
        }

        const recordsForDb = newRecords.map(record => ({
            student_id: record.studentId,
            student_name: record.studentName,
            timestamp: record.timestamp,
            location: record.location,
            lecture_id: realLectureId, // إرسال المعرف الرقمي
            is_outside_radius: record.isOutsideRadius,
            manual_entry: record.manualEntry ?? false,
            distance: record.distance,
        }));
        
        const { data, error } = await supabase.from('attendance').insert(recordsForDb).select();
        if (error) return { data: null, error: `فشل إضافة السجلات: ${error.message}` };
        return { data: data ? data.map(mapToAttendanceRecord) : null, error: null };
    } catch (err: any) { return { data: null, error: `حدث خطأ: ${err.message}` }; }
};

export const removeAttendanceRecord = async (studentId: string, lectureId: string): Promise<MutationResult<null>> => {
    const { error } = await supabase.from('attendance').delete().match({ student_id: studentId, lecture_id: lectureId });
    if (error) return { data: null, error: `فشل إزالة الحضور: ${error.message}` };
    return { data: null, error: null };
};

// --- Courses ---

export const seedCourses = async (batchId: string): Promise<MutationResult<null>> => {
    const { data: batch, error: batchError } = await supabase.from('batches').select('current_year').eq('id', batchId).maybeSingle();
    if (batchError || !batch) return { data: null, error: `لم يتم العثور على الدفعة في قاعدة البيانات.` };

    const yearLevelMap: { [key: number]: string } = { 2: 'السنة الثانية', 3: 'السنة الثالثة', 4: 'السنة الرابعة', 5: 'السنة الخامسة', 6: 'السنة السادسة' };
    const targetYearLevelString = yearLevelMap[batch.current_year];
    if (!targetYearLevelString) return { data: null, error: `المستوى الدراسي ${batch.current_year} غير مدعوم لإضافة المقررات تلقائياً.` };

    const coursesToAdd = initialCourses.filter(c => c.yearLevel === targetYearLevelString);
    if (coursesToAdd.length === 0) return { data: null, error: `لا توجد مقررات معرفة مسبقاً لـ ${targetYearLevelString}.` };

    const newCoursesToInsert = [];
    for (const course of coursesToAdd) {
        const { data: existing } = await supabase.from('courses').select('id').eq('course_code', course.code).eq('academic_year', batch.current_year).maybeSingle();
        if (!existing) {
            newCoursesToInsert.push({
                name: course.name, course_code: course.code, academic_year: batch.current_year,
                credit_hours: course.creditHours, weeks: course.weeks,
                absence_limit: 25, absence_weight: 2.5 // 👈 إضافة الوزن الافتراضي
            });
        }
    }

    if (newCoursesToInsert.length > 0) {
        const { error: insertError } = await supabase.from('courses').insert(newCoursesToInsert);
        if (insertError) return { data: null, error: `فشل إدخال المقررات: ${insertError.message}` };
    }
    return { data: null, error: null };
};

export const getCourses = async (yearLevel: string | number): Promise<MutationResult<Course[]>> => {
    let targetYear: number;
    if (typeof yearLevel === 'string') {
        const yearLevelMap: { [key: string]: number } = { 'السنة الثانية': 2, 'السنة الثالثة': 3, 'السنة الرابعة': 4, 'السنة الخامسة': 5, 'السنة السادسة': 6 };
        targetYear = yearLevelMap[yearLevel] || parseInt(yearLevel) || 0;
    } else {
        targetYear = yearLevel;
    }

    const { data, error } = await supabase.from('courses').select('*').eq('academic_year', targetYear);
    if (error) return { data: null, error: error.message };

    return {
        data: data.map((c: any) => ({
            id: c.id, name: c.name, code: c.course_code || c.code, academicYear: c.academic_year, 
            creditHours: c.credit_hours, weeks: c.weeks, 
            absenceLimit: c.absence_limit,
            absenceWeight: c.absence_weight || 2.5, // 👈 الجلب الجديد
            createdAt: c.created_at
        })), error: null
    };
};

export const addCourse = async (course: Omit<Course, 'id'>): Promise<MutationResult<Course>> => {
    const payload = {
        name: course.name, 
        course_code: course.code, 
        academic_year: course.academicYear,
        credit_hours: course.creditHours, 
        weeks: course.weeks, 
        absence_limit: course.absenceLimit,
        absence_weight: course.absenceWeight || 2.5
    };

    // 💡 استخدمنا select() فقط بدون single()
    const { data, error } = await supabase.from('courses').insert(payload).select();

    if (error) return { data: null, error: error.message };
    
    if (!data || data.length === 0) return { data: null, error: 'فشل استرجاع بيانات المقرر بعد الإضافة' };
    const newCourse = data[0]; // 💡 نأخذ العنصر الأول يدوياً لتجنب الخطأ

    return { 
        data: { 
            id: newCourse.id, 
            name: newCourse.name, 
            code: newCourse.course_code || newCourse.code, 
            academicYear: newCourse.academic_year, 
            creditHours: newCourse.credit_hours, 
            weeks: newCourse.weeks, 
            absenceLimit: newCourse.absence_limit, 
            absenceWeight: newCourse.absence_weight, 
            createdAt: newCourse.created_at 
        }, 
        error: null 
    };
};

export const updateCourse = async (id: string, updates: Partial<Course>): Promise<MutationResult<Course>> => {
    try {
        const payload: any = {};
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.code !== undefined) payload.course_code = updates.code;
        if (updates.creditHours !== undefined) payload.credit_hours = updates.creditHours;
        if (updates.weeks !== undefined) payload.weeks = updates.weeks;
        if (updates.absenceLimit !== undefined) payload.absence_limit = updates.absenceLimit;
        if (updates.absenceWeight !== undefined) payload.absence_weight = updates.absenceWeight;

        // 💡 نستخدم select() لإرجاع النتيجة، وإذا رجعت فارغة سنعرف أن هناك حظر!
        const { data, error } = await supabase
            .from('courses')
            .update(payload)
            .eq('id', id)
            .select(); 

        if (error) {
            return { data: null, error: `خطأ من قاعدة البيانات: ${error.message}` };
        }

        if (!data || data.length === 0) {
            // 💡 هنا السر! إذا رجعت مصفوفة فارغة، فهذا يعني أن التعديل تم حظره من Supabase.
            return { data: null, error: 'تم منع التعديل! يرجى التأكد من تشغيل أمر (DISABLE ROW LEVEL SECURITY) في Supabase.' };
        }

        const updatedCourse = data[0];

        return { 
            data: { 
                id: updatedCourse.id, 
                name: updatedCourse.name, 
                code: updatedCourse.course_code || updatedCourse.code, 
                academicYear: updatedCourse.academic_year, 
                creditHours: updatedCourse.credit_hours, 
                weeks: updatedCourse.weeks, 
                absenceLimit: updatedCourse.absence_limit, 
                absenceWeight: updatedCourse.absence_weight, 
                createdAt: updatedCourse.created_at 
            }, 
            error: null 
        };
    } catch (err: any) {
        return { data: null, error: `حدث خطأ غير متوقع: ${err.message}` };
    }
};

export const deleteCourse = async (courseId: string): Promise<MutationResult<null>> => {
    const { error } = await supabase.from('courses').delete().eq('id', courseId);
    if (error) {
        console.error('Supabase deleteCourse Error:', error);
        return { data: null, error: error.message };
    }
    return { data: null, error: null };
};

// --- Settings ---
export const getLastCourseName = async (): Promise<string | null> => {
    const { data, error } = await supabase.from('settings').select('value').eq('key', 'lastCourseName').single();
    if (error || !data) return null;
    return (data as any).value;
}

export const setLastCourseName = async (courseName: string): Promise<void> => {
    await supabase.from('settings').upsert({ key: 'lastCourseName', value: courseName });
}

export const getLocationRestrictionSetting = async (): Promise<boolean> => {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'locationRestrictionEnabled')
            .maybeSingle();
        
        // الافتراضي معطل (false) كما طلبت
        if (error || !data) return false;
        return data.value === 'true';
    } catch {
        return false;
    }
}

export const setLocationRestrictionSetting = async (enabled: boolean): Promise<void> => {
    await supabase.from('settings').upsert({ key: 'locationRestrictionEnabled', value: enabled.toString() });
}

export const getDeviceBindingSetting = async (): Promise<boolean> => {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'deviceBindingEnabled')
            .maybeSingle();  // ✅ مهم!
        
        if (error || !data) return true;  // Default to enabled
        return data.value === 'true';
    } catch {
        return true;  // Default on error
    }
}

export const setDeviceBindingSetting = async (enabled: boolean): Promise<void> => {
    await supabase.from('settings').upsert({ key: 'deviceBindingEnabled', value: enabled.toString() });
}

export const getAbsencePercentageSetting = async (): Promise<boolean> => {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'absencePercentageEnabled')
            .maybeSingle();  // ✅ مهم!
        
        if (error || !data) return true;
        return data.value === 'true';
    } catch {
        return true;
    }
}

export const setAbsencePercentageSetting = async (enabled: boolean): Promise<void> => {
    await supabase.from('settings').upsert({ key: 'absencePercentageEnabled', value: enabled.toString() });
}

export const getAbsenceWeightSetting = async (): Promise<number> => {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'absenceWeight')
            .maybeSingle();
        
        if (error || !data || !data.value) return 2.5; // القيمة الافتراضية
        return parseFloat(data.value);
    } catch {
        return 2.5;
    }
};

export const setAbsenceWeightSetting = async (weight: number): Promise<void> => {
    await supabase.from('settings').upsert({ key: 'absenceWeight', value: weight.toString() });
};