"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";

interface Props {
  /** Fallback label shown in the error state. */
  section?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic React error boundary. Wraps a subtree and catches render errors,
 * displaying a friendly fallback with a "Try again" button. Use around
 * sections of the UI that can fail independently (e.g. charts, history
 * panels, result displays).
 */
export class CalcErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[CalcErrorBoundary] ${this.props.section ?? "Unknown"} crashed:`,
      error,
      info.componentStack,
    );
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-border p-2">
          <ErrorState
            title={`${this.props.section ?? "Section"} failed to render`}
            description={this.state.error?.message}
            action={
              <Button variant="outline" size="sm" onClick={this.reset}>
                Try again
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
