import { useState } from "react";
import LogoPage from "./components/LogoPage";
import ChoicePage from "./components/ChoicePage";
import MindscapePage from "./components/MindscapePage";
import MapPage from "./components/MapPage";

function App() {
  const [page, setPage] = useState("logo"); // logo -> choice -> mindscape/na
  const [triggers, setTriggers] = useState([]); // user-selected triggers
  const [mood, setMood] = useState(null); // "happy" | "neutral" | "stressed"

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      {page === "logo" && (
        <LogoPage onNext={(prefs) => { setTriggers(prefs); setPage("choice"); }} />
      )}
      {page === "choice" && (
        <ChoicePage
          onGoNav={() => setPage("nav")}
          onGoMindscape={() => setPage("mindscape")}
        />
      )}
      {page === "mindscape" && (
        <MindscapePage setMood={setMood} onNext={() => setPage("nav")} />
      )}
      {page === "nav" && <MapPage triggers={triggers} mood={mood} />}
    </div>
  );
}

export default App;