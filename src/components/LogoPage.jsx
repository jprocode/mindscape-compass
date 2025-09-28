import { useState } from "react";

const availableTriggers = [
  { id: "Crowds", icon: "👥", label: "Avoid crowded areas" },
  { id: "Noise", icon: "🔊", label: "Avoid loud spaces" },
  { id: "Construction", icon: "🚧", label: "Avoid construction zones" },
  { id: "Bright Lights", icon: "💡", label: "Avoid bright lighting" },
];

export default function LogoPage({ onNext }) {
  const [prefs, setPrefs] = useState([]);

  const toggleTrigger = (trigger) => {
    setPrefs((prev) =>
      prev.includes(trigger) ? prev.filter((t) => t !== trigger) : [...prev, trigger]
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-calmBlue font-sans px-4">
      <h1 className="text-4xl font-bold text-textDark mb-6">🧭 Mindscape Compass</h1>
      <p className="text-lg text-textDark mb-6">Select what you’d like to avoid on campus:</p>

      <div className="grid gap-4 w-full max-w-md">
        {availableTriggers.map((t) => (
          <label
            key={t.id}
            className="flex items-center gap-3 bg-white p-3 rounded-lg shadow hover:bg-calmGray cursor-pointer"
          >
            <input
              type="checkbox"
              checked={prefs.includes(t.id)}
              onChange={() => toggleTrigger(t.id)}
              className="w-5 h-5"
            />
            <span className="text-xl">{t.icon}</span>
            <span className="text-textDark">{t.label}</span>
          </label>
        ))}
      </div>

      <button
        onClick={() => onNext(prefs)}
        className="mt-8 px-6 py-3 bg-calmGreen hover:bg-green-500 text-textDark text-lg rounded-lg shadow-lg"
      >
        Continue
      </button>
    </div>
  );
}