import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { User, UserRole } from '../types';

interface SessionState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export function useSession() {
  const [state, setState] = useState<SessionState>({
    user: null,
    isLoading: true,
    error: null
  });

  const checkSession = useCallback(async () => {
    try {
      // 1. التحقق من جلسة المشرف (عبر نظام Supabase Auth)
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (session?.user) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .maybeSingle();

        const user: User = {
          id: session.user.id,
          role: roleData?.role === 'admin' ? UserRole.Admin : UserRole.Student,
          name: session.user.user_metadata?.name || 'إدارة الموقع',
          universityId: session.user.email || '',
          batchId: session.user.user_metadata?.batch_id
        };

        setState({ user, isLoading: false, error: null });
        return;
      }

      // 2. التحقق من جلسة الطالب (المحفوظة محلياً في المتصفح)
      const localUserStr = localStorage.getItem('anmo_current_user');
      if (localUserStr) {
        try {
          const localUser = JSON.parse(localUserStr);
          if (localUser && localUser.role === UserRole.Student) {
            setState({ user: localUser, isLoading: false, error: null });
            return;
          }
        } catch (e) {
          console.error("Error parsing local user", e);
        }
      }

      // 3. إذا لم يكن هناك مشرف ولا طالب
      setState({ user: null, isLoading: false, error: null });
    } catch (error: any) {
      setState({ user: null, isLoading: false, error: error.message });
    }
  }, []);

  useEffect(() => {
    checkSession();

    // الاستماع لتغييرات المشرفين
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // 👇 التعديل الجوهري: إزالة شرط (!session) لكي لا يطرد الطالب عند التحديث
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem('anmo_current_user');
          setState({ user: null, isLoading: false, error: null });
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          checkSession();
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [checkSession]);

  const signOut = useCallback(async () => {
    localStorage.removeItem('anmo_current_user'); // مسح جلسة الطالب
    await supabase.auth.signOut(); // مسح جلسة المشرف
    setState({ user: null, isLoading: false, error: null });
  }, []);

  // إضافة دالة refreshSession لتنشيط الواجهة يدوياً
  return { ...state, signOut, refreshSession: checkSession };
}