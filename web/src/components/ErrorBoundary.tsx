import { Component, type ReactNode } from 'react'

/** If a screen crashes, show a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.error('[orbit]', e) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#000', color: '#f4f4f5', font: '15px system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', maxWidth: 360 }}>
          <b style={{ fontSize: 20 }}>Something went wrong</b>
          <span style={{ color: '#9a9aa2' }}>This screen hit an error. Your wallet and funds are not affected.</span>
          <button onClick={() => { location.href = '/' }} style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 0, background: '#fff', color: '#000', fontWeight: 800, cursor: 'pointer' }}>Back to the Radar</button>
        </div>
      </div>
    )
  }
}
