import { Component, type ComponentChildren } from "preact";

interface RuntimeErrorBoundaryProps {
  readonly children: ComponentChildren;
}

interface RuntimeErrorBoundaryState {
  readonly error: Error | null;
}

interface ApplicationErrorProps {
  readonly message: string;
  readonly eyebrow?: string;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("The interface stopped unexpectedly.");
}

export function ApplicationError({ message, eyebrow = "Nexy could not continue" }: ApplicationErrorProps) {
  return (
    <main class="main error-state" role="alert">
      <span class="eyebrow">{eyebrow}</span>
      <h1>Something broke before the fight.</h1>
      <p>{message}</p>
      <button class="secondary-button" type="button" onClick={() => window.location.reload()}>
        Reload application
      </button>
    </main>
  );
}

export class RuntimeErrorBoundary extends Component<RuntimeErrorBoundaryProps, RuntimeErrorBoundaryState> {
  override state: Readonly<RuntimeErrorBoundaryState> = { error: null };

  static override getDerivedStateFromError(error: unknown): RuntimeErrorBoundaryState {
    return { error: asError(error) };
  }

  override render(): ComponentChildren {
    return this.state.error ? <ApplicationError message={this.state.error.message} /> : this.props.children;
  }
}
