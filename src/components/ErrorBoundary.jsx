import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('FactoryOS crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="loading-spin">
          Something went wrong.
          <div className="loading-hint">
            FactoryOS hit an unexpected error and can't continue. Reload the page to try again — if this keeps happening, let your admin know.
          </div>
          <button className="login-btn" style={{ maxWidth: 200 }} onClick={() => window.location.reload()}>RELOAD</button>
        </div>
      );
    }
    return this.props.children;
  }
}
