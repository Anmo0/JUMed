
export enum UserRole {
    Admin = 'ADMIN',
    Student = 'STUDENT',
}

export interface Batch {
    id: string;
    batchName: string;
    currentYear: number;
    isArchived: boolean;
    studentCount?: number; // إحصائية عدد الطلاب (إضافة جديدة)
}

export interface Group {
    id: string;
    name: string;
    batchId: string;
}

export interface Student {
    id: string;
    name: string;
    universityId: string;
    serialNumber: string;
    deviceInfo?: string | null;
    batchId?: string;
    groupId?: string;       // تمت إضافته
    groupName?: string;     // تمت إضافته
    isLeader?: boolean;     // تمت إضافته
    isBatchLeader?: boolean;
    canManageAttendance?: boolean;
    tag?: string;
}

export interface AttendanceRecord {
    id: string;
    studentId: string;
    studentName: string;
    timestamp: string;
    location: {
        latitude: number;
        longitude: number;
    };
    lectureId: string;
    isOutsideRadius: boolean;
    manualEntry?: boolean;
    distance?: number;
}

export interface User {
    id: string;
    role: UserRole;
    name: string;
    batchId?: string;
    universityId?: string;
}

export type AppLoginResult = 
    | { success: true; user: User }
    | { success: false; error: string };

export interface Course {
    id: string;
    name: string;
    code?: string;
    academicYear: number;
    creditHours?: number;
    weeks?: number;
    absenceLimit?: number;
    absenceWeight?: number; // 👈 أضفنا هذا السطر
    createdAt?: string;
}

// Represents a lecture session - UPDATED to match new schema
export interface Lecture {
    id: string;           // ✅ جديد - UUID
    qrCode: string;       // يبقى للعرض
    courseName: string;
    courseId?: string;
    batchId: string;
    date: string;
    timeSlot: string;
    createdAt: string;
    location: { latitude: number; longitude: number };
}