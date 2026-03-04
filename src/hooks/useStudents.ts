// hooks/useStudents.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { Student } from '../types';

export function useStudents(batchId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['students', batchId],
    queryFn: () => batchId ? api.getStudents(batchId) : [],
    enabled: !!batchId,
    staleTime: 5 * 60 * 1000, // 5 دقائق
  });

  const addMutation = useMutation({
    mutationFn: api.addStudent,
    onSuccess: () => {
      // إعادة تحميل الطلاب فقط
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Student> }) =>
      api.updateStudent(id, updates),
    onSuccess: (result) => {
      // تحديث محلي بدون إعادة تحميل
      if (result.data) {
        const updatedStudent = result.data;
        queryClient.setQueryData(['students', batchId], (old: Student[] | undefined) =>
          old?.map(s => s.id === updatedStudent.id ? updatedStudent : s)
        );
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteStudent,
    onSuccess: (_, id) => {
      // حذف محلي
      queryClient.setQueryData(['students', batchId], (old: Student[] | undefined) =>
        old?.filter(s => s.id !== id)
      );
    },
  });

  return {
    students: query.data || [],
    isLoading: query.isLoading,
    addStudent: addMutation.mutate,
    updateStudent: updateMutation.mutate,
    deleteStudent: deleteMutation.mutate,
  };
}