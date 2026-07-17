import RenderForm from './components/RenderForm';
import ProgressBar from './components/ProgressBar';
import LogViewer from './components/LogViewer';
import RenderCapture from './components/RenderCapture';
import './App.css';

function App() {
  return (
    <div className="studio-container">
      <RenderForm />
      <ProgressBar />
      <LogViewer />
      <RenderCapture />
      <div className="credit">📷 @javier.jarart</div>
    </div>
  );
}

export default App;
