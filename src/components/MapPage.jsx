// MapPage.jsx
import React, { useEffect, useRef, useState } from 'react';

// API keys (should be moved to .env in production)
const GOOGLE_MAPS_API_KEY = 'AIzaSyBWUFnp4i65FlRbB2Kx_OqEzcdkMgKeiBA';
const GOOGLE_PLACES_API_KEY = 'AIzaSyCQboMUwJ8bD6BM_UUD1Mrip-tzfXpq9l4';

// Temple campus center + bounds
const TEMPLE_CENTER = { lat: 39.9815, lng: -75.1554 };
const TEMPLE_BOUNDS = {
  south: 39.9600,
  west: -75.1900,
  north: 40.0050,
  east: -75.1300
};

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.id = id;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = (err) => reject(err);
    document.head.appendChild(s);
  });
}

// ✅ merged component
export default function MapPage({ mood, triggers }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const rectRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const mountedRef = useRef(true);

  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);

  async function loadAndInit() {
    setLoading(true);
    setLoadError(null);
    try {
      const src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,visualization`;
      await loadScript(src, 'gmap-script');
    } catch (err) {
      console.error('Failed to load Google Maps script', err);
      setLoadError(err.message || 'Failed to load Google Maps script');
      setLoading(false);
      return;
    }

    if (!mountedRef.current || !mapEl.current || !window.google) {
      setLoadError('Map container not available or Google API missing');
      setLoading(false);
      return;
    }

    try {
      const bounds = new window.google.maps.LatLngBounds(
        { lat: TEMPLE_BOUNDS.south, lng: TEMPLE_BOUNDS.west },
        { lat: TEMPLE_BOUNDS.north, lng: TEMPLE_BOUNDS.east }
      );

      mapRef.current = new window.google.maps.Map(mapEl.current, {
        center: TEMPLE_CENTER,
        zoom: 15,
        restriction: { latLngBounds: bounds, strictBounds: false },
        streetViewControl: false,
        mapTypeControl: false,
        zoomControl: true,
      });

      rectRef.current = new window.google.maps.Rectangle({
        bounds: TEMPLE_BOUNDS,
        strokeColor: '#1976D2',
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: '#1976D2',
        fillOpacity: 0.05,
        clickable: false,
        map: mapRef.current
      });

      directionsServiceRef.current = new window.google.maps.DirectionsService();
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        suppressMarkers: true
      });
      directionsRendererRef.current.setMap(mapRef.current);

      // set up places/autocomplete
      const service = new window.google.maps.places.PlacesService(mapRef.current);
      placesServiceRef.current = service;
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();

      setLoading(false);
    } catch (err) {
      console.error('Map initialization failed', err);
      setLoadError(err.message || 'Map initialization failed');
      setLoading(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    loadAndInit();
    return () => {
      mountedRef.current = false;
      if (markersRef.current.length) {
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];
      }
      mapRef.current = null;
    };
  }, []);

  // ✅ react to mood + triggers
  useEffect(() => {
    if (!mapRef.current) return;
    if (mood === "stressed" || (triggers && triggers.includes("Crowds"))) {
      console.log("⚡ Comfort route should be highlighted");
      // later: apply custom DirectionsRenderer styling here
    } else {
      console.log("✅ Fastest route highlighted");
    }
  }, [mood, triggers]);

  // watch searchQuery and fetch suggestions using AutocompleteService
  useEffect(() => {
    if (!searchQuery || !autocompleteServiceRef.current) return;
    const q = searchQuery;
    const bounds = new window.google.maps.LatLngBounds(
      { lat: TEMPLE_BOUNDS.south, lng: TEMPLE_BOUNDS.west },
      { lat: TEMPLE_BOUNDS.north, lng: TEMPLE_BOUNDS.east }
    );
    autocompleteServiceRef.current.getPlacePredictions(
      { input: q, bounds, strictBounds: true },
      (preds, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && preds) {
          setSearchResults(preds);
        } else {
          setSearchResults([]);
        }
      }
    );
  }, [searchQuery]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 font-sans px-4">
      <h2 className="text-3xl font-bold text-gray-800 mb-4">🗺️ Campus Navigation</h2>

      {loadError && <p className="text-red-500">Error: {loadError}</p>}
      {loading && <p>Loading map…</p>}

      <div
        ref={mapEl}
        className="h-[500px] w-full max-w-3xl border rounded-lg shadow-md"
      ></div>

      <div className="mt-4 text-lg text-gray-700">
        {mood === "stressed" ? (
          <p>⚡ You seem stressed. Comfort route is recommended.</p>
        ) : (
          <p>✅ You’re good to go! Fastest route is highlighted.</p>
        )}
      </div>

      <div className="mt-4 w-full max-w-3xl">
        <input
          id="map-search-input"
          placeholder="Search campus places, buildings, cafes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full p-2 border rounded-lg shadow-sm"
        />
        {searchQuery && searchResults && searchResults.length > 0 && (
          <div className="mt-2 bg-white border rounded-lg shadow max-h-48 overflow-y-auto">
            {searchResults.map((r, i) => (
              <div
                key={i}
                className="p-2 hover:bg-gray-100 cursor-pointer"
                onClick={() => {
                  setSearchQuery(r.description || r.name);
                  setSearchResults([]);
                  if (r.place_id && placesServiceRef.current) {
                    placesServiceRef.current.getDetails(
                      { placeId: r.place_id },
                      (place, status) => {
                        if (
                          status === window.google.maps.places.PlacesServiceStatus.OK
                        ) {
                          console.log("Selected place:", place);
                          // TODO: trigger route preview here
                        }
                      }
                    );
                  }
                }}
              >
                <div className="font-semibold">
                  {r.structured_formatting
                    ? r.structured_formatting.main_text
                    : r.name || r.description}
                </div>
                <div className="text-sm text-gray-500">
                  {r.structured_formatting
                    ? r.structured_formatting.secondary_text
                    : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}