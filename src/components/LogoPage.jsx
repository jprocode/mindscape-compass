import { useState } from "react";

const availableTriggers = ["Crowds", "Noise", "Construction", "Bright Lights"];

export default function LogoPage({ onNext }) {
  const [prefs, setPrefs] = useState([]);

  const toggleTrigger = (trigger) => {
    setPrefs((prev) =>
      prev.includes(trigger) ? prev.filter((t) => t !== trigger) : [...prev, trigger]
    );
  };

  return (
    <div className="p-6 text-center">
      <h1 className="text-3xl font-bold mb-4">🧭 Mindscape Compass</h1>
      <p className="mb-4">Select what you’d like to avoid on campus:</p>
      <div className="flex flex-col gap-2 items-center">
        {availableTriggers.map((trigger) => (
          <label key={trigger} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.includes(trigger)}
              onChange={() => toggleTrigger(trigger)}
            />
            {trigger}
          </label>
        ))}
      </div>
      <button
        onClick={() => onNext(prefs)}
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg"
      >
        Continue
      </button>
    </div>
  );
}