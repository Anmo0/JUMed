import * as React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // تحديث الحالة لعرض واجهة بديلة
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // تسجيل الخطأ للتصحيح
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoBack = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-950 text-white" dir="rtl">
          <div className="max-w-lg w-full bg-slate-900/80 backdrop-blur-lg border border-red-500/30 rounded-2xl p-8 shadow-2xl text-center">
            <div className="text-6xl mb-6">⚠️</div>
            <h1 className="text-2xl font-bold text-red-400 mb-4">
              حدث خطأ غير متوقع
            </h1>
            <p className="text-gray-300 mb-6">
              نعتذر عن هذا الخطأ. يمكنك تحديث الصفحة أو العودة للمحاولة مرة أخرى.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="bg-slate-800 rounded-lg p-4 mb-6 text-right overflow-auto max-h-40">
                <p className="text-red-400 text-sm font-mono">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <pre className="text-gray-400 text-xs mt-2 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
            
            <div className="flex gap-4 justify-center">
              <button
                onClick={this.handleGoBack}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors font-medium"
              >
                العودة
              </button>
              <button
                onClick={this.handleReload}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors font-medium"
              >
                تحديث الصفحة
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;