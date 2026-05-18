import React from 'react'

interface ErrorBoundaryProps {
  fallbackTitle?: string
  fallbackMessage?: string
  onReset?: () => void
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Replay crash:', error)
    console.error(errorInfo)
    this.setState({ error, errorInfo })
  }

  handleReset = () => {
    if (this.props.onReset) {
      this.props.onReset()
    }
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <div className="error-title">{this.props.fallbackTitle || 'Something went wrong.'}</div>
          <div className="error-message">{this.props.fallbackMessage || 'This section failed to render safely.'}</div>
          {this.state.error && (
            <div className="error-details">
              <div><strong>{this.state.error.message}</strong></div>
              <pre>{this.state.errorInfo?.componentStack}</pre>
            </div>
          )}
          <button className="error-reset" onClick={this.handleReset}>
            Return to Match List
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
