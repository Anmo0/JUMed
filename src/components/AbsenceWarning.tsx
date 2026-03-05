import React, { useMemo } from 'react';
import { AlertTriangleIcon } from './icons';
import { Course, Lecture, AttendanceRecord } from '../types';

interface Props {
    courses: Course[];
    lectures: Lecture[];
    attendanceRecords: AttendanceRecord[];
    studentId: string;
    isRamadanMode: boolean;
}

const AbsenceWarning: React.FC<Props> = ({ courses, lectures, attendanceRecords, studentId, isRamadanMode }) => {
    const warnings = useMemo(() => {
        const result: { courseName: string, percentage: number, limit: number, status: 'info' | 'warning' | 'banned' }[] = [];
        
        const attendedLectureIds = new Set(
            attendanceRecords.filter(r => r.studentId === studentId).map(rec => rec.lectureId)
        );

        courses.forEach(course => {
            const limit = course.absenceLimit || 25; 
            const weight = course.absenceWeight || 2.5;
            
            const courseLectures = lectures.filter(l => l.courseId === course.id);
            
            let missedCount = 0;
            courseLectures.forEach(lecture => {
                if (!attendedLectureIds.has(lecture.qrCode) && !attendedLectureIds.has(lecture.id)) {
                    missedCount++;
                }
            });

            const absencePercentage = missedCount * weight;
            
            if (absencePercentage >= limit) {
                result.push({ courseName: course.name, percentage: absencePercentage, limit, status: 'banned' });
            } else if (absencePercentage >= (limit * 0.8)) {
                result.push({ courseName: course.name, percentage: absencePercentage, limit, status: 'warning' });
            } else if (absencePercentage > 0) {
                // 💡 إضافة الحالة الزرقاء لتظهر من أول غياب
                result.push({ courseName: course.name, percentage: absencePercentage, limit, status: 'info' });
            }
        });
        
        return result;
    }, [courses, lectures, attendanceRecords, studentId]);

    if (warnings.length === 0) return null;

    return (
        <div className="mb-6 space-y-4 animate-slide-in-up">
            {warnings.map((warn, idx) => {
                if (warn.status === 'banned') {
                    return (
                        <div key={idx} className={`flex items-center p-4 sm:p-5 border-2 rounded-[1.5rem] shadow-xl transition-all transform-gpu ${isRamadanMode ? 'bg-red-950/40 border-red-500/50' : 'bg-red-900/20 border-red-500/30'}`}>
                            <div className="p-3 rounded-full me-4 shadow-lg bg-red-500/20 text-red-500 animate-pulse">
                                <AlertTriangleIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                            </div>
                            <div>
                                <h4 className="font-black text-lg sm:text-xl text-red-400">تجاوزت حد الغياب (حرمان)!</h4>
                                <p className="text-xs sm:text-sm mt-1 leading-relaxed font-medium text-red-200/80">
                                    لقد تجاوزت الحد المسموح للغياب في مقرر "{warn.courseName}". نسبتك الحالية هي {warn.percentage.toFixed(1)}%.
                                </p>
                            </div>
                        </div>
                    );
                } else if (warn.status === 'warning') {
                    return (
                        <div key={idx} className={`flex items-center p-4 sm:p-5 border-2 rounded-[1.5rem] shadow-xl transition-all transform-gpu ${isRamadanMode ? 'bg-orange-950/40 border-orange-500/50' : 'bg-orange-900/20 border-orange-500/30'}`}>
                            <div className="p-3 rounded-full me-4 shadow-lg bg-orange-500/20 text-orange-500 animate-pulse">
                                <AlertTriangleIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                            </div>
                            <div>
                                <h4 className="font-black text-lg sm:text-xl text-orange-400">تنبيه خطر الحرمان!</h4>
                                <p className="text-xs sm:text-sm mt-1 leading-relaxed font-medium text-orange-200/80">
                                    نسبة غيابك في مقرر "{warn.courseName}" وصلت إلى {warn.percentage.toFixed(1)}% (الحد الأقصى {warn.limit}%). احرص على الحضور.
                                </p>
                            </div>
                        </div>
                    );
                } else {
                    return (
                        <div key={idx} className={`flex items-center p-4 sm:p-5 border-2 rounded-[1.5rem] shadow-sm transition-all transform-gpu ${isRamadanMode ? 'bg-blue-950/30 border-blue-500/30' : 'bg-blue-900/10 border-blue-500/20'}`}>
                            <div className="p-3 rounded-full me-4 bg-blue-500/20 text-blue-400">
                                <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </div>
                            <div>
                                <h4 className="font-black text-lg sm:text-xl text-blue-400">تنبيه: تم تسجيل غياب</h4>
                                <p className="text-xs sm:text-sm mt-1 leading-relaxed font-medium text-blue-200/80">
                                    لديك غياب مسجل في مقرر "{warn.courseName}". نسبتك الحالية هي {warn.percentage.toFixed(1)}% من أصل الحد المسموح {warn.limit}%.
                                </p>
                            </div>
                        </div>
                    );
                }
            })}
        </div>
    );
};

export default AbsenceWarning;