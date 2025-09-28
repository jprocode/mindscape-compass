import { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";
import LogoPage from "./components/LogoPage";
import ChoicePage from "./components/ChoicePage";
import MindscapePage from "./components/MindscapePage";
import MapPage from "./components/MapPage";

function AppRoutes({ mood, setMood, triggers, setTriggers }) {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LogoPage
            onNext={(prefs) => {
              setTriggers(prefs);
              navigate("/choice");
            }}
          />
        }
      />
      <Route
        path="/choice"
        element={
          <ChoicePage
            onGoNav={() => navigate("/nav")}
            onGoMindscape={() => navigate("/mindscape")}
          />
        }
      />
      <Route
        path="/mindscape"
        element={<MindscapePage setMood={setMood} onNext={() => navigate("/nav")} />}
      />
      <Route
        path="/nav"
        element={<MapPage triggers={triggers} mood={mood} />}
      />
    </Routes>
  );
}

function App() {
  const [triggers, setTriggers] = useState([]);
  const [mood, setMood] = useState(null);

  return (
    <Router>
      <AppRoutes
        mood={mood}
        setMood={setMood}
        triggers={triggers}
        setTriggers={setTriggers}
      />
    </Router>
  );
}

export default App;