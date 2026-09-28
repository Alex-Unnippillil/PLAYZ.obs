// SPDX-License-Identifier: GPL-2.0-or-later
import { Component, type ReactNode } from 'react';
import { Button } from './ui';
/** Deliberately below recording controls: a failed page must not hide Stop. */
export class PageBoundary extends Component<{ children: ReactNode; onBack: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="panel page-failure" role="alert"><h1>This workspace could not open</h1>
      <p>Recording controls remain available above. Returning to Library discards any unsaved page edits, but does not stop native recording.</p>
      <div className="row wrap"><Button onClick={this.props.onBack}>Return to library</Button><Button onClick={() => location.reload()}>Reload interface</Button></div>
    </section>;
  }
}
export function PageLoading() {
  return <div className="page-loading" role="status" aria-live="polite"><strong>Opening workspace…</strong><p>Loading a bundled local screen. Recording controls remain available.</p></div>;
}
