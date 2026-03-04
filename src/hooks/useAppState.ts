// hooks/useAppState.ts
import { useState, useEffect } from 'react';

// للبيانات غير الحساسة مثل اختيار الدفعة
export function useAppState() {
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(() => {
    // استخدام sessionStorage بدلاً من localStorage
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('selectedBatchId');
    }
    return null;
  });

  const selectBatch = (batchId: string | null) => {
    setSelectedBatchId(batchId);
    if (batchId) {
      sessionStorage.setItem('selectedBatchId', batchId);
    } else {
      sessionStorage.removeItem('selectedBatchId');
    }
  };

  return { selectedBatchId, selectBatch };
}