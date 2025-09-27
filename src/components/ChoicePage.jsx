export default function ChoicePage({ onGoNav, onGoMindscape }) {
  return (
    <div className="text-center p-6">
      <h2 className="text-2xl font-bold mb-6">What would you like to do?</h2>
      <div className="flex gap-4 justify-center">
        <button
          onClick={onGoNav}
          className="px-4 py-2 bg-green-600 text-white rounded-lg"
        >
          🗺️ Go to Navigation
        </button>
        <button
          onClick={onGoMindscape}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg"
        >
          🌌 Mindscape: Check Your Mood
        </button>
      </div>
    </div>
  );
}