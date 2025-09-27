import { useEffect } from "react";

export default function MindscapePage({ setMood, onNext }) {
  useEffect(() => {
    // TODO: Replace with Mediapipe facial detection
    // Placeholder logic: auto-sets mood to "stressed" after 2s
    setTimeout(() => {
      setMood("stressed");
    }, 2000);
  }, [setMood]);

  return (
    <div className="p-6 text-center">
      <h2 className="text-2xl font-bold mb-4">🌌 Mindscape</h2>
      <p>Detecting your mood...</p>
      <div className="mt-4 border rounded-lg h-64 flex items-center justify-center bg-gray-200">
        {/* TODO: Three.js scene here */}
        <p>[3D Mood Visualization Placeholder]</p>
      </div>
      <button
        onClick={onNext}
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg"
      >
        Continue to Navigation
      </button>
    </div>
  );
}