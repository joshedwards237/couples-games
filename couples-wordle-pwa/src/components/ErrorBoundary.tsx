import { Component, type ReactNode } from 'react';
import { logError } from '@/lib/errorLog';

interface State {
  err: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: { componentStack?: string }): void {
    void logError(err, {
      source: 'react_error_boundary',
      extra: { componentStack: info.componentStack ?? null }
    });
  }

  reset = () => this.setState({ err: null });

  render(): ReactNode {
    if (!this.state.err) return this.props.children;
    return (
      <div className="min-h-screen bg-background text-textPrimary">
        <div className="mx-auto max-w-xl space-y-4 px-4 py-16">
          <h1 className="font-heading text-2xl font-bold">Something broke.</h1>
          <p className="text-sm text-textSecondary">
            We logged the error. Try reloading — if it keeps happening, long-press the
            refresh icon or use Profile → Check for updates.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              Reload
            </button>
            <button
              onClick={this.reset}
              className="rounded-md border border-white/60 bg-white/70 px-4 py-2 text-sm font-semibold"
            >
              Dismiss
            </button>
          </div>
          <details className="text-xs text-textSecondary">
            <summary>Details</summary>
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-2">
              {this.state.err.name}: {this.state.err.message}
              {this.state.err.stack ? `\n\n${this.state.err.stack}` : ''}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
