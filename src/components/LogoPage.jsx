import { useState } from "react";
import React from "react";

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-calmBlue font-sans px-6">
      {/* Logo */}
      <img
        src="/logo.png"
        alt="Mindscape Compass Logo"
        className="w-24 h-24 mb-4"
      />

      {/* Title */}
      <h1 className="text-3xl font-bold text-textDark mb-2">
        Mindscape Compass
      </h1>
      <p className="text-lg text-gray-700 mb-8 text-center">
        Select what you’d like to avoid on campus:
      </p>

      {/* Triggers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md mb-8">
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

      {/* Button */}
      <button
        onClick={() => onNext(prefs)}
        className="px-6 py-3 bg-calmGreen hover:bg-green-500 text-white text-lg rounded-lg shadow-lg transition"
      >
        Continue
      </button>
    </div>
  );
}