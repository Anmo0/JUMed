import React, { useState } from 'react';
import { Course, Batch } from '../../types';
import Modal from '../Modal';
import { EditIcon, TrashIcon } from '../icons';
import { seedCourses, addCourse, updateCourse, deleteCourse, getCourses } from '../../services/api';

interface AdminCoursesTabProps {
    courses: Course[];
    setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
    batches: Batch[];
    selectedBatchId: string | null;
    isRamadanMode: boolean;
}

const AdminCoursesTab: React.FC<AdminCoursesTabProps> = ({
    courses, setCourses, batches, selectedBatchId, isRamadanMode
}) => {
    const [isCourseModalOpen, setCourseModalOpen] = useState(false);
    const [courseFormState, setCourseFormState] = useState({ id: '', name: '', code: '', creditHours: 0, weeks: 0, absenceLimit: 25, absenceWeight: 2.5 });
    const [isSeeding, setIsSeeding] = useState(false);

    const currentBatch = batches.find(b => b.id === selectedBatchId);

    const handleSeedCourses = async () => {
        if (!confirm('هل أنت متأكد من إضافة المقررات الافتراضية لهذه الدفعة؟')) return;
        if (!currentBatch) return;

        setIsSeeding(true);
        try {
            const result = await seedCourses(currentBatch.id);
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

    return (
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
}
export default AdminCoursesTab;