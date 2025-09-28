import { useEffect } from "react";
import L from "leaflet";

export default function MapPage({ triggers, mood }) {
  useEffect(() => {
    const map = L.map("map").setView([39.981, -75.155], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const fastest = [[39.981, -75.155], [39.982, -75.156]];
    const comfort = [[39.981, -75.155], [39.9815, -75.154]];

    const fastestLine = L.polyline(fastest, { color: "red" }).addTo(map);
    const comfortLine = L.polyline(comfort, { color: "blue" }).addTo(map);

    if (mood === "stressed" || triggers.includes("Crowds")) {
      comfortLine.setStyle({ weight: 6 });
    } else {
      fastestLine.setStyle({ weight: 6 });
    }

    return () => map.remove();
  }, [triggers, mood]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-calmGray font-sans px-4">
      <h2 className="text-3xl font-bold text-textDark mb-4">🗺️ Campus Navigation</h2>
      <div id="map" className="h-[500px] w-full max-w-3xl border rounded-lg shadow-md"></div>
      <div className="mt-4 text-lg text-textDark">
        {mood === "stressed" ? (
          <p>⚡ You seem stressed. Comfort route is recommended.</p>
        ) : (
          <p>✅ You’re good to go! Fastest route is highlighted.</p>
        )}
      </div>
    </div>
  );
}