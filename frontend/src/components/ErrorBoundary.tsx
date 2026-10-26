import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card } from './ui/Card';
import { ErrorState } from './ui/ErrorState';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** When this value changes (e.g. the route), a caught error is cleared. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render errors so a crash never leaves a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Real error reporting can be plugged in here later.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto w-full max-w-xl px-md py-2xl">
        <Card variant="dense">
          <ErrorState
            title="Something went wrong"
            description="This part of the page failed to load. You can try again or go back to the home page."
            onRetry={this.reset}
            action={
              <a
                href="/"
                className="inline-flex h-11 items-center rounded-full px-5 text-sm font-medium text-primary-hover hover:bg-primary-soft"
              >
                Go to home
              </a>
            }
          />
        </Card>
      </div>
    );
  }
}
