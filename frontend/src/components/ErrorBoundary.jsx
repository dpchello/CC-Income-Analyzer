import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '24px 32px',
          fontFamily: 'var(--mono, monospace)',
          color: '#b8502e',
          background: '#fff',
          minHeight: '100vh',
        }}>
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>Render crash</h1>
          <pre style={{
            background: '#f6f4ee', padding: 12, borderRadius: 4,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12,
          }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          {this.state.info?.componentStack && (
            <pre style={{
              background: '#f6f4ee', padding: 12, borderRadius: 4, marginTop: 12,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11,
              color: '#555',
            }}>
              {this.state.info.componentStack}
            </pre>
          )}
          <button
            onClick={() => { localStorage.removeItem('harvest-token'); localStorage.removeItem('harvest.route'); location.reload() }}
            style={{ marginTop: 16, padding: '8px 14px', cursor: 'pointer' }}
          >
            Clear session + reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
