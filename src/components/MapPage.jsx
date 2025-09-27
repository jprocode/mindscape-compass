import { useEffect } from "react";
import L from "leaflet";

export default function MapPage({ triggers, mood }) {
  useEffect(() => {
    const map = L.map("map").setView([39.981, -75.155], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // Example routes
    const fastest = [
      [39.981, -75.155],
      [39.982, -75.156],
    ];
    const comfort = [
      [39.981, -75.155],
      [39.9815, -75.154],
    ];

    const fastestLine = L.polyline(fastest, { color: "red" }).addTo(map);
    const comfortLine = L.polyline(comfort, { color: "blue" }).addTo(map);

    // Highlight based on mood/triggers
    if (mood === "stressed" || triggers.includes("Crowds")) {
      comfortLine.setStyle({ weight: 6 });
    } else {
      fastestLine.setStyle({ weight: 6 });
    }

    return () => map.remove();
  }, [triggers, mood]);

  return (
    <div className="p-6 text-center">
      <h2 className="text-2xl font-bold mb-4">🗺️ Campus Navigation</h2>
      <div id="map" className="h-[500px] w-full border rounded-lg"></div>
      <div className="mt-4">
        {mood === "stressed" ? (
          <p>⚡ You seem stressed. Comfort route is recommended.</p>
        ) : (
          <p>✅ You’re good to go! Fastest route is highlighted.</p>
        )}
      </div>
    </div>
  );
}