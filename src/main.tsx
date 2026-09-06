
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeFirestorePersistence } from './integration/persistence/firestorePersistence';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

async function bootstrap() {
  await initializeFirestorePersistence();
  root.render(
    <App />
  );
}

void bootstrap();
