import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AutoInsuranceLanding from './AutoInsuranceLanding';
import ThankYouPage from './ThankYouPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AutoInsuranceLanding />} />
        <Route path="/success" element={<ThankYouPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;