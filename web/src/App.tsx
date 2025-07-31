import DiffViewer from './components/DiffViewer'
import PrismThemeManager from './components/PrismThemeManager'
import { WebSocketProvider } from './contexts/WebSocketContext'

function App(): React.ReactElement {
  return (
    <WebSocketProvider>
      <PrismThemeManager />
      <DiffViewer />
    </WebSocketProvider>
  )
}

export default App
