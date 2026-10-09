import { Component } from "react";

// Catches render errors so a crash in one screen shows a message instead of
// unmounting the entire app (blank page).
class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("UI crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.silent) return null;
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center bg-wa-bg min-h-screen">
        <p className="text-wa-text font-medium">Something went wrong on this screen.</p>
        <div className="flex gap-2">
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 rounded-lg bg-[#00A884] text-white text-sm"
          >
            Try again
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="px-4 py-2 rounded-lg bg-white/10 text-wa-text text-sm"
          >
            Go to chats
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
