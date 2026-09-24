// SPDX-License-Identifier: GPL-2.0-or-later
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createLocalClient } from './lib/query';
import App from './App';
import './styles.css';
import './experience.css';
import './workspace.css';
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <main className="fatal"><h1>The interface needs to reload</h1><p>Native recording is managed separately. Reloading this interface does not deliberately stop capture.</p><button onClick={() => location.reload()}>Reload interface</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><QueryClientProvider client={createLocalClient()}><App/></QueryClientProvider></Boundary></React.StrictMode>);
