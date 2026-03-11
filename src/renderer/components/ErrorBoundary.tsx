import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-slate-900 flex flex-col items-center justify-center p-8 gap-6">
          <div className="w-16 h-16 rounded-2xl bg-red-900/30 border border-red-700/40 flex items-center justify-center">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-slate-200 font-semibold text-lg">Something went wrong</p>
            <p className="text-slate-500 text-sm mt-1 max-w-sm">
              An unexpected error occurred. Your session data is safe.
            </p>
            {this.state.error && (
              <p className="text-slate-700 text-xs mt-3 font-mono max-w-sm break-all">
                {this.state.error.message}
              </p>
            )}
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
