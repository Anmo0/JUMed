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
        const result: { courseName: string, percentage: number, limit: number }[] = [];
        
        const attendedLectureIds = new Set(
            attendanceRecords.filter(r => r.studentId === studentId).map(rec => rec.lectureId)
        );

        courses.forEach(course => {
            const limit = course.absenceLimit || 25; 
            const weight = course.absenceWeight || 2.5;
            
            // جلب جميع المحاضرات المنتهية لهذا المقرر فقط
            const courseLectures = lectures.filter(l => l.courseId === course.id && (Date.now() - new Date(l.createdAt).getTime() > 15 * 60 * 1000));
            
            let missedCount = 0;
            courseLectures.forEach(lecture => {
                if (!attendedLectureIds.has(lecture.qrCode) && !attendedLectureIds.has(lecture.id)) {
                    missedCount++;
                }
            });

            const absencePercentage = missedCount * weight;
            
            // إذا تجاوز الغياب 80% من الحد المسموح، أو وصل للحرمان
            if (absencePercentage >= (limit * 0.8) && absencePercentage < limit) {
                result.push({ courseName: course.name, percentage: absencePercentage, limit });
            } else if (absencePercentage >= limit) {
                result.push({ courseName: course.name, percentage: absencePercentage, limit }); 
            }
        });
        
        return result;
    }, [courses, lectures, attendanceRecords, studentId]);

    if (warnings.length === 0) return null;

    return (
        <div className="mb-6 space-y-4 animate-slide-in-up">
            {warnings.map((warn, idx) => {
                const isBanned = warn.percentage >= warn.limit;
                return (
                    <div key={idx} className={`flex items-center p-4 sm:p-5 border-2 rounded-[1.5rem] shadow-xl transition-all ${
                        isBanned 
                            ? (isRamadanMode ? 'bg-red-950/40 border-red-500/50' : 'bg-red-900/20 border-red-500/30')
                            : (isRamadanMode ? 'bg-orange-950/40 border-orange-500/50' : 'bg-orange-900/20 border-orange-500/30')
                    }`}>
                        <div className={`p-3 rounded-full me-4 shadow-lg ${isBanned ? 'bg-red-500/20 text-red-500' : 'bg-orange-500/20 text-orange-500 animate-pulse'}`}>
                            <AlertTriangleIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                        </div>
                        <div>
                            <h4 className={`font-black text-lg sm:text-xl ${isBanned ? 'text-red-400' : 'text-orange-400'}`}>
                                {isBanned ? 'تجاوزت حد الغياب (حرمان)!' : 'تنبيه خطر الحرمان!'}
                            </h4>
                            <p className={`text-xs sm:text-sm mt-1 leading-relaxed font-medium ${isBanned ? 'text-red-200/80' : 'text-orange-200/80'}`}>
                                {isBanned 
                                    ? `لقد تجاوزت الحد المسموح للغياب في مقرر "${warn.courseName}". نسبتك الحالية هي ${warn.percentage.toFixed(1)}%.`
                                    : `نسبة غيابك في مقرر "${warn.courseName}" وصلت إلى ${warn.percentage.toFixed(1)}% (الحد الأقصى ${warn.limit}%). احرص على الحضور لتجنب الحرمان.`
                                }
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default AbsenceWarning;