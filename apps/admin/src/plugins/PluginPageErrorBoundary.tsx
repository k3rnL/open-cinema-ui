import {Alert, Button, Result} from 'antd'
import {Component, type ErrorInfo, type ReactNode} from 'react'

interface State {error: Error | null}

export class PluginPageErrorBoundary extends Component<
  {pluginId: string; children: ReactNode},
  State
> {
  state: State = {error: null}

  static getDerivedStateFromError(error: Error): State {
    return {error}
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Plugin page ${this.props.pluginId} failed`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const correlationId = crypto.randomUUID()
    return (
      <Result
        status="error"
        title="This plugin page could not be displayed"
        subTitle="Core navigation and other plugins are still available."
        extra={(
          <Button onClick={() => this.setState({error: null})}>Try again</Button>
        )}
      >
        <Alert
          type="error"
          showIcon
          message={this.state.error.message}
          description={`Diagnostic reference: ${correlationId}`}
        />
      </Result>
    )
  }
}
