import React, { useState, useMemo } from 'react';
import { Lecture, AttendanceRecord } from '../../types';
import { CalendarIcon } from '../icons';

interface Props {
    lectures: Lecture[];
    attendanceRecords: AttendanceRecord[];
    selectedBatchId: string | null;
    isRamadanMode: boolean;
    setActiveTab: (tab: any) => void;
}

const AdminCalendarTab: React.FC<Props> = ({ lectures, attendanceRecords, selectedBatchId, isRamadanMode, setActiveTab }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    const lectureDays = useMemo(() => {
        const days = new Set<string>();
        lectures.forEach(l => {
            const d = new Date(l.date);
            days.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        });
        return days;
    }, [lectures]);

    const lecturesOnSelectedDay = useMemo(() => {
        if (!selectedDate) return [];
        const dateStr = selectedDate.toISOString().split('T')[0];
        return lectures.filter(l => l.date === dateStr).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }, [selectedDate, lectures]);

    if (!selectedBatchId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <CalendarIcon className="w-16 h-16 text-gray-600 opacity-20" />
                <p className="text-gray-400 font-medium">يرجى اختيار دفعة أولاً لعرض التقويم.</p>
                <button onClick={() => setActiveTab('dashboard')} className="text-blue-400 hover:underline text-sm font-bold">الذهاب لاختيار الدفعة</button>
            </div>
        );
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = new Date(year, month, 1).getDay();
    const calendarDays = Array.from({ length: startDayOfWeek }, (_, i) => <div key={`pad-${i}`} className="p-2" />);

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
        <div className="p-4 sm:p-6">
            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg></button>
                    <h3 className="text-xl font-bold text-white">{currentDate.toLocaleString('ar-EG', { month: 'long', year: 'numeric' })}</h3>
                    <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
                </div>
                <div className="grid grid-cols-7 gap-2 text-sm text-center text-gray-400">
                    {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map(d => <div key={d} className="font-bold pb-2">{d}</div>)}
                    {calendarDays}
                </div>
            </div>
            {selectedDate && (
                <div className="mt-8 p-4 sm:p-8 border-t border-slate-800 animate-slide-in-up">
                    <h3 className="text-xl font-bold text-white mb-6">محاضرات يوم {selectedDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                    {lecturesOnSelectedDay.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {lecturesOnSelectedDay.map(lecture => (
                                <div key={lecture.qrCode} className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50 flex items-center justify-between">
                                    <div><p className="font-black text-blue-400">{lecture.courseName}</p><p className="text-sm text-gray-400 mt-1">{lecture.timeSlot}</p></div>
                                    <div className="text-right"><p className="text-2xl font-black text-white">{attendanceRecords.filter(rec => rec.lectureId === lecture.qrCode).length}</p><p className="text-[10px] text-gray-500 font-bold">حاضرون</p></div>
                                </div>
                            ))}
                        </div>
                    ) : <div className="text-center py-12 bg-slate-800/30 rounded-3xl text-gray-500 italic">لا توجد سجلات.</div>}
                </div>
            )}
        </div>
    );
};
export default AdminCalendarTab;