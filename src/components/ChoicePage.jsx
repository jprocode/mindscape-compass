export default function ChoicePage({ onGoNav, onGoMindscape }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-calmGreen font-sans px-4">
      <h2 className="text-3xl font-bold text-textDark mb-8">What would you like to do?</h2>
      <div className="flex flex-col sm:flex-row gap-6">
        <button
          onClick={onGoNav}
          className="px-8 py-4 bg-calmBlue hover:bg-blue-400 text-textDark text-xl rounded-lg shadow-lg"
        >
          🗺️ Navigation
        </button>
        <button
          onClick={onGoMindscape}
          className="px-8 py-4 bg-calmPurple hover:bg-purple-400 text-textDark text-xl rounded-lg shadow-lg"
        >
          🌌 Mindscape
        </button>
      </div>
    </div>
  );
}