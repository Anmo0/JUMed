import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { UserRole } from './types';
import { login as apiLogin } from './services/api';
import { supabase } from './services/supabaseClient';
import Login from './components/Login';
// 💡 استيراد كسول (Lazy Import): لا تحمل الملف إلا عند الحاجة إليه
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard'));
const StudentDashboard = React.lazy(() => import('./components/StudentDashboard'));
import { LogOutIcon, LogoIcon, AlertTriangleIcon } from './components/icons';
import { useTheme } from './hooks/useTheme';
import { useSession } from './hooks/useSession';
import { AppProvider, useAppState } from './contexts/AppContext';
import ErrorBoundary from './components/ErrorBoundary';

// 💡 مكون التحميل الوهمي (Skeleton) الفخم
const DashboardSkeleton = ({ isRamadanMode }: { isRamadanMode: boolean }) => (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-pulse space-y-8 w-full">
        <div className="flex justify-between items-center mb-8">
            <div className={`h-10 w-1/3 rounded-xl ${isRamadanMode ? 'bg-yellow-500/20' : 'bg-slate-800/80'}`}></div>
            <div className={`h-12 w-64 rounded-[1.25rem] ${isRamadanMode ? 'bg-yellow-500/10' : 'bg-slate-800/50'}`}></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className={`h-28 rounded-3xl ${isRamadanMode ? 'bg-yellow-900/20 border border-yellow-900/30' : 'bg-slate-800/50 border border-slate-700/50'}`}></div>
            ))}
        </div>
        <div className={`h-96 rounded-[2.5rem] mt-8 ${isRamadanMode ? 'bg-yellow-900/10 border border-yellow-900/30' : 'bg-slate-900/40 border border-slate-800'}`}></div>
    </div>
);

function AppContent() {
    useTheme(); 
    const { user: currentUser, isLoading: sessionLoading, error: sessionError, signOut, refreshSession } = useSession();
    const [loginError, setLoginError] = useState<string | null>(null);

    const { 
        selectedBatchId, isLoading, isRamadanMode, selectBatch, batches, students, groups, attendance, lectures, courses,
        deviceBindingEnabled, absencePercentageEnabled, locationRestrictionEnabled,
        filteredStudents, filteredLectures, filteredAttendance, activeLecture, studentCourses, currentBatch,
        setBatches, setCourses, addStudent, updateStudent, updateGroupName, addGroupLocal, deleteAllGroupsLocal,
        generateQrCode, manualAttendance, removeAttendance, resetStudentDevice, resetAllDevices, repeatPreviousAttendance,
        deleteLecture, deleteStudent, toggleDeviceBinding, toggleAbsencePercentage, toggleLocationRestriction,
        clearLectureAttendance, clearAllAttendance, clearAllLectures, recalculateSerials, refreshStudents, recordAttendance, toggleRamadanMode
    } = useAppState();

    if (!supabase) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <div className="bg-slate-900/80 backdrop-blur-lg border border-red-500/30 rounded-2xl p-8 max-w-lg shadow-2xl shadow-red-500/10 text-center animate-fade-in">
                    <AlertTriangleIcon className="mx-auto h-16 w-16 text-red-400" />
                    <h1 className="mt-6 text-2xl font-bold text-white">خطأ في إعدادات الاتصال</h1>
                    <p className="mt-3 text-gray-300">فشل الاتصال بقاعدة البيانات. يرجى مراجعة إعدادات Supabase.</p>
                </div>
            </div>
        );
    }

    const handleLogin = async (universityId: string, serialNumber: string, userType: 'student' | 'admin') => {
        setLoginError(null);
        const result = await apiLogin(universityId, serialNumber, userType);
        
        if (result.success === false) {
            setLoginError(result.error || 'فشل تسجيل الدخول. حدث خطأ غير متوقع.');
            return;
        }

        localStorage.setItem('anmo_current_user', JSON.stringify(result.user));
        
        if (result.user && result.user.role === UserRole.Student && result.user.batchId) {
            selectBatch(result.user.batchId);
        }
        if (refreshSession) refreshSession();
    };

    const handleLogout = async () => {
        await signOut();
        selectBatch(null);
    };

    const handleResetBatch = () => { selectBatch(null); };

    // 💡 استخدام التحميل الوهمي بدلاً من الشاشة البيضاء المملة
    if (isLoading || sessionLoading) {
        return (
            <div className={`min-h-screen flex flex-col transition-colors duration-700 transform-gpu ${isRamadanMode ? 'ramadan-theme' : 'bg-slate-950'}`}>
                <header className={`bg-slate-950/85 backdrop-blur-2xl border-b border-slate-800/50 h-14 sm:h-16 flex justify-between items-center px-4`}>
                     <div className="flex items-center gap-2">
                         <div className="h-6 w-6 rounded-full bg-blue-500/50 animate-pulse"></div>
                         <div className="h-6 w-32 bg-slate-800/80 rounded-lg animate-pulse"></div>
                     </div>
                </header>
                <DashboardSkeleton isRamadanMode={isRamadanMode} />
            </div>
        );
    }

    if (!currentUser) {
        return (
            <div className={`min-h-screen transition-colors duration-700 transform-gpu ${isRamadanMode ? 'ramadan-theme' : 'bg-slate-950'}`}>
                <Login onLogin={handleLogin} error={loginError} onDismissError={() => setLoginError(null)} isRamadanMode={isRamadanMode} />
            </div>
        );
    }

    if (currentUser.role === UserRole.Student && !selectedBatchId) {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-700 transform-gpu ${isRamadanMode ? 'ramadan-theme' : 'bg-slate-950'}`}>
                <div className="w-full max-w-md space-y-8 animate-fade-in">
                    <div className="text-center">
                        <LogoIcon className="w-20 h-20 text-blue-500 mx-auto mb-6" />
                        <h1 className="text-3xl font-black text-white mb-2">إعدادات الحساب</h1>
                        <p className="text-gray-400">يرجى التواصل مع المسؤول لتحديد دفعتك</p>
                    </div>
                    <div className="text-center">
                        <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 transition-colors text-sm font-bold">تسجيل الخروج</button>
                    </div>
                </div>
            </div>
        );
    }

    const safeStudents = filteredStudents || [];
    const safeGroups = groups || [];
    const safeAttendanceRecords = filteredAttendance || [];
    const safeLectures = filteredLectures || [];
    const safeCourses = courses || [];
    const safeStudentCourses = studentCourses || [];

    return (
        <div className={`min-h-screen text-gray-100 transition-colors duration-700 ${isRamadanMode ? 'ramadan-theme' : ''}`}>
            {/* 💡 إعدادات الإشعارات (Toaster) */}
            <Toaster 
                position="top-center" 
                toastOptions={{
                    duration: 4000,
                    style: { 
                        background: isRamadanMode ? '#1a1005' : '#1e293b', 
                        color: isRamadanMode ? '#D4AF37' : '#fff', 
                        border: isRamadanMode ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid #334155',
                        fontWeight: 'bold'
                    },
                    success: {
                        iconTheme: { primary: isRamadanMode ? '#D4AF37' : '#22c55e', secondary: isRamadanMode ? '#1a1005' : '#fff' }
                    }
                }} 
            />

            {currentUser && (
                <header className={`bg-slate-950/85 backdrop-blur-2xl border-b border-slate-800/50 shadow-md sticky top-0 z-40 transition-colors duration-700 transform-gpu ${isRamadanMode ? 'ramadan-header' : ''}`}>
                    <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex justify-between items-center">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="text-lg sm:text-xl font-bold text-blue-400 flex items-center gap-1.5 sm:gap-2">
                                {isRamadanMode && <span className="text-yellow-400 text-xl sm:text-2xl">🌙</span>}
                                <span className="hidden sm:inline">نظام الحضور الذكي</span>
                                <span className="sm:hidden">الحضور</span>
                            </div>
                            {selectedBatchId && (
                                <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-full border border-slate-700/50 text-xs text-gray-400">
                                    <span>{currentBatch?.batchName}</span>
                                    {currentUser.role === UserRole.Admin && (
                                        <button onClick={handleResetBatch} className="ms-2 text-blue-400 hover:text-blue-300 underline">تغيير</button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4">
                           <button onClick={toggleRamadanMode} className={`p-1.5 sm:p-2 rounded-full transition-all transform-gpu ${isRamadanMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-800 text-gray-400 hover:text-yellow-400'}`} title={isRamadanMode ? "إيقاف ثيم رمضان" : "تفعيل ثيم رمضان"}>
                                <span className="text-base sm:text-lg">🌙</span>
                           </button>
                           <span className="text-sm sm:text-base hidden sm:inline">أهلاً, {currentUser.name}</span>
                           <button onClick={handleLogout} className="flex items-center text-gray-400 hover:text-red-400 transition-colors transform-gpu p-1.5 sm:p-2">
                                <LogOutIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="hidden sm:inline ms-2">خروج</span>
                           </button>
                        </div>
                    </div>
                </header>
            )}
            <main>
                {/* 💡 تعليق العرض حتى يتم تحميل اللوحة المطلوبة فقط، وإظهار التحميل الوهمي في الانتظار */}
                <React.Suspense fallback={<DashboardSkeleton isRamadanMode={isRamadanMode} />}>
                    {currentUser.role === UserRole.Admin ? (
                        <AdminDashboard 
                            batches={batches || []} setBatches={setBatches} students={safeStudents} groups={safeGroups}
                            attendanceRecords={safeAttendanceRecords} lectures={safeLectures} courses={safeCourses} setCourses={setCourses}
                            onAddStudent={addStudent} onUpdateStudent={updateStudent} onUpdateGroupName={updateGroupName}
                            onAddGroupLocal={addGroupLocal} onDeleteAllGroupsLocal={deleteAllGroupsLocal}
                            onGenerateQrCode={generateQrCode} onManualAttendance={manualAttendance} onRemoveAttendance={removeAttendance}
                            onResetStudentDevice={resetStudentDevice} onResetAllDevices={resetAllDevices}
                            onRepeatPreviousAttendance={repeatPreviousAttendance} onDeleteLecture={deleteLecture} onDeleteStudent={deleteStudent}
                            deviceBindingEnabled={deviceBindingEnabled} onToggleDeviceBinding={toggleDeviceBinding}
                            absencePercentageEnabled={absencePercentageEnabled} onToggleAbsencePercentage={toggleAbsencePercentage}
                            locationRestrictionEnabled={locationRestrictionEnabled} onToggleLocationRestriction={toggleLocationRestriction}
                            onClearLectureAttendance={clearLectureAttendance} onClearAllAttendance={clearAllAttendance} onClearAllLectures={clearAllLectures}
                            isRamadanMode={isRamadanMode} selectedBatchId={selectedBatchId} onResetBatch={handleResetBatch} onChangeBatch={selectBatch}
                            onRecalculateSerials={recalculateSerials} onRefreshStudents={refreshStudents}
                        />
                    ) : (
                        <StudentDashboard 
                            student={safeStudents.find(s => s.id === currentUser?.id)!}
                            allStudents={safeStudents} attendanceRecords={safeAttendanceRecords}
                            onRecordAttendance={recordAttendance} onManualAttendance={manualAttendance} onRemoveAttendance={removeAttendance}
                            onUpdateStudent={updateStudent} onUpdateGroupName={updateGroupName} onAddGroupLocal={addGroupLocal}
                            activeLecture={activeLecture} lectures={safeLectures} courses={safeStudentCourses}
                            onGenerateQrCode={generateQrCode} onDeleteLecture={deleteLecture}
                            onRepeatPreviousAttendance={repeatPreviousAttendance} onClearLectureAttendance={clearLectureAttendance}
                            absencePercentageEnabled={absencePercentageEnabled} isRamadanMode={isRamadanMode}
                        />
                    )}
                </React.Suspense>
            </main>
        </div>
    );
}

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <AppProvider>
                <AppContent />
            </AppProvider>
        </ErrorBoundary>
    );
};

export default App;