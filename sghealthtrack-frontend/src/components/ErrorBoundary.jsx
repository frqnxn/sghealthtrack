// Error Boundary — catches React render errors and shows fallback instead of white page
import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const error = this.state.error;
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            background: "#f8fafa",
            color: "#1a2e35",
          }}
        >
          <h1 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "#64748b", maxWidth: 480, textAlign: "center" }}>
            The app encountered an error. Please refresh the page or try again.
          </p>
          <pre
            style={{
              margin: "0 0 20px",
              padding: 16,
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              fontSize: 12,
              overflow: "auto",
              maxWidth: "100%",
              maxHeight: 200,
              textAlign: "left",
            }}
          >
            {error?.message || String(error)}
          </pre>
          <a
            href="/"
            style={{
              padding: "10px 20px",
              background: "#0db4aa",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Go to Login
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
