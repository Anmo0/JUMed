import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

// 💡 إعداد React Query مع خيارات الكاش (Cache) الافتراضية
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // لا تعيد الجلب كلما بدل المستخدم التبويبات
      staleTime: 5 * 60 * 1000, // احتفظ بالبيانات كـ "طازجة" لمدة 5 دقائق
      retry: 1, // حاول مرة واحدة فقط عند فشل الاتصال لتجنب البطء
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* 💡 تغليف التطبيق بمزود البيانات */}
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);