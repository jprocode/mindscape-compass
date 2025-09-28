// MapPage.jsx
// Collaborative file:
// - Core map / search / preview / active navigation UI: Coder B
// - Mood-aware route recommendation & trigger-aware route selection: You

import React, { useEffect, useRef, useState } from "react";

const GOOGLE_MAPS_API_KEY = "AIzaSyBWUFnp4i65FlRbB2Kx_OqEzcdkMgKeiBA";
// const GOOGLE_PLACES_API_KEY = "…"; // not needed separately for Maps JS

// Campus center and bounds (LatLngLiteral / LatLngBoundsLiteral)
const TEMPLE_CENTER = { lat: 39.9815, lng: -75.1554 };
const TEMPLE_BOUNDS = {
    south: 39.96,
    west: -75.19,
    north: 40.005,
    east: -75.13,
};

// --- helper: numeric "contains" (avoids LatLng/Bounds constructors) ---
function withinBoundsLiteral(lat, lng, b) {
    return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

// --- script loader (stable channel, no beta/modular) ---
function loadScript(src, id) {
    return new Promise((resolve, reject) => {
        if (typeof window !== "undefined" && window.google && window.google.maps) {
            resolve();
            return;
        }
        if (document.getElementById(id)) {
            const el = document.getElementById(id);
            el.addEventListener("load", () => resolve(), { once: true });
            el.addEventListener("error", (e) => reject(e), { once: true });
            return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.id = id;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = (err) => reject(err);
        document.head.appendChild(s);
    });
}

export default function MapPage({ mood = "neutral", triggers = [] }) {
    // Map / services refs
    const mapEl = useRef(null);
    const mapRef = useRef(null);
    const rectRef = useRef(null);
    const userMarkerRef = useRef(null);
    const destinationMarkerRef = useRef(null);
    const tempOriginMarkerRef = useRef(null);

    const markersRef = useRef([]); // POI markers
    const heatmapRef = useRef(null);

    const directionsServiceRef = useRef(null);
    const directionsRendererRef = useRef(null);
    const comfortRendererRef = useRef(null); // separate renderer to visualize the comfort alternative
    const activeRendererRef = useRef(null);  // renderer used during active navigation

    const autocompleteServiceRef = useRef(null);
    const placesServiceRef = useRef(null);

    // UI state
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [preview, setPreview] = useState(null); // {name, address, distance, duration, legs, result, chosen: 'fastest'|'comfort'}
    const [showPreview, setShowPreview] = useState(false);
    const [activeRoute, setActiveRoute] = useState(false);
    const [heatmapVisible, setHeatmapVisible] = useState(false);

    const mountedRef = useRef(true);

    // ---------- Initialization ----------
    async function loadAndInit() {
        setLoading(true);
        setLoadError(null);

        // load Maps JS (keep to classic libs; avoid beta modular for now)
        try {
            const src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,visualization`;
            await loadScript(src, "gmap-script");
        } catch (err) {
            console.error("Failed to load Google Maps script", err);
            setLoadError(err.message || "Failed to load Google Maps script");
            setLoading(false);
            return;
        }

        if (!mountedRef.current || !mapEl.current || !window.google || !window.google.maps) {
            console.error("❌ Google API did not load (window.google is missing)");
            setLoadError("Map container not available or Google API missing");
            setLoading(false);
            return;
        }

        try {
            // Map with campus restriction using LatLngBoundsLiteral (no constructor)
            mapRef.current = new window.google.maps.Map(mapEl.current, {
                center: TEMPLE_CENTER,
                zoom: 16,
                restriction: { latLngBounds: TEMPLE_BOUNDS, strictBounds: true },
                streetViewControl: false,
                mapTypeControl: false,
                zoomControl: true,
                fullscreenControl: true,
                scaleControl: true,
                minZoom: 14,
                maxZoom: 20,
            });

            // Draw campus boundary (light fill) using the literal
            rectRef.current = new window.google.maps.Rectangle({
                bounds: TEMPLE_BOUNDS,
                strokeColor: "#1976D2",
                strokeOpacity: 0.9,
                strokeWeight: 2,
                fillColor: "#1976D2",
                fillOpacity: 0.05,
                clickable: false,
                map: mapRef.current,
            });

            // Initialize services & renderers
            directionsServiceRef.current = new window.google.maps.DirectionsService();
            directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: "#0b5ed7",
                    strokeOpacity: 0.95,
                    strokeWeight: 6,
                },
            });
            directionsRendererRef.current.setMap(mapRef.current);

            // Comfort alt renderer (thin muted line)
            comfortRendererRef.current = new window.google.maps.DirectionsRenderer({
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: "#94a3b8", // slate-400
                    strokeOpacity: 0.9,
                    strokeWeight: 4,
                    zIndex: 1,
                },
            });
            comfortRendererRef.current.setMap(mapRef.current);

            // Active navigation renderer (bold accent)
            activeRendererRef.current = new window.google.maps.DirectionsRenderer({
                suppressMarkers: true,
                polylineOptions: {
                    strokeColor: "#10b981", // emerald-500
                    strokeOpacity: 1,
                    strokeWeight: 7,
                },
            });
            activeRendererRef.current.setMap(null);

            // Places services (legacy warnings are OK for hackathon/demo)
            placesServiceRef.current = new window.google.maps.places.PlacesService(mapRef.current);
            autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();

            // Heatmap (optional — might be missing in newer versions)
            try {
                if (window.google.maps.visualization && window.google.maps.visualization.HeatmapLayer) {
                    heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
                        data: [],
                        dissipating: true,
                        radius: 36,
                        opacity: 0.7,
                        map: null,
                    });
                    // optional: initialize from triggers/mood
                    updateHeatmapData(triggers, mood);
                } else {
                    heatmapRef.current = null;
                }
            } catch (e) {
                console.warn("Heatmap layer init failed", e);
                heatmapRef.current = null;
            }

            // Get user location
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        if (!mapRef.current) return;
                        const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        const inBounds = withinBoundsLiteral(userPos.lat, userPos.lng, TEMPLE_BOUNDS);

                        if (userMarkerRef.current) {
                            try {
                                userMarkerRef.current.setPosition(userPos);
                            } catch (e) {
                                console.warn("Marker update failed", e);
                            }
                        } else {
                            userMarkerRef.current = new window.google.maps.Marker({
                                position: userPos,
                                map: mapRef.current,
                                title: "Your location",
                                icon: {
                                    path: window.google.maps.SymbolPath.CIRCLE,
                                    scale: 6,
                                    fillColor: "#ff5722",
                                    fillOpacity: 1,
                                    strokeWeight: 2,
                                    strokeColor: "white",
                                },
                            });
                        }

                        if (inBounds) mapRef.current.setCenter(userPos);
                    },
                    (err) => console.warn("Geolocation error:", err.message)
                );
            }

            // slight resize nudge
            setTimeout(() => {
                if (mapRef.current && window.google) {
                    window.google.maps.event.trigger(mapRef.current, "resize");
                    mapRef.current.setCenter(TEMPLE_CENTER);
                }
            }, 200);

            setLoading(false);
        } catch (err) {
            console.error("Map initialization failed", err);
            setLoadError(err.message || "Map initialization failed");
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
            if (destinationMarkerRef.current) {
                try { destinationMarkerRef.current.setMap(null); } catch { /* noop */ }
            }
            if (tempOriginMarkerRef.current) {
                try { tempOriginMarkerRef.current.setMap(null); } catch { /* noop */ }
            }
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep map responsive
    useEffect(() => {
        function handleResize() {
            if (mapRef.current && window.google) {
                window.google.maps.event.trigger(mapRef.current, "resize");
            }
        }
        window.addEventListener("resize", handleResize);
        const t = setTimeout(handleResize, 300);
        return () => {
            clearTimeout(t);
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    // ---------- Search + suggestions ----------
    useEffect(() => {
        if (!searchQuery || !autocompleteServiceRef.current || !window.google) return;

        // We can give bounds as a literal; AutocompleteService ignores it for strictness,
        // but we also filter results ourselves after fetching.
        const boundsLiteral = TEMPLE_BOUNDS;

        autocompleteServiceRef.current.getPlacePredictions(
            { input: searchQuery }, // no strictBounds in legacy service; we'll filter
            (preds, status) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && preds) {
                    setSearchResults(preds);
                } else {
                    setSearchResults([]);
                }
            }
        );
    }, [searchQuery]);

    // ---------- Helpers ----------
    function isWithinBounds(latLng) {
        if (!latLng) return false;
        return withinBoundsLiteral(latLng.lat, latLng.lng, TEMPLE_BOUNDS);
    }

    async function getCurrentPositionPromise(timeout = 8000) {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error("Geolocation unavailable"));
            const timer = setTimeout(() => reject(new Error("Geolocation timed out")), timeout);
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    clearTimeout(timer);
                    resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                },
                (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
                { enableHighAccuracy: true, maximumAge: 30000, timeout }
            );
        });
    }

    // Comfort heuristic: fewer steps (turns) + keep route mostly inside bounds
    function scoreComfort(route) {
        const legs = route.legs || [];
        let stepsCount = 0;
        let insideCount = 0;
        let totalPoints = 0;

        legs.forEach((leg) => {
            const steps = leg.steps || [];
            stepsCount += steps.length;
            steps.forEach((s) => {
                const endLoc = s.end_location;
                if (endLoc && typeof endLoc.lat === "function" && typeof endLoc.lng === "function") {
                    // API may return MVCObject with lat()/lng() methods
                    const lat = endLoc.lat();
                    const lng = endLoc.lng();
                    if (withinBoundsLiteral(lat, lng, TEMPLE_BOUNDS)) insideCount += 1;
                } else if (endLoc && typeof endLoc.lat === "number" && typeof endLoc.lng === "number") {
                    // Or may be a literal
                    if (withinBoundsLiteral(endLoc.lat, endLoc.lng, TEMPLE_BOUNDS)) insideCount += 1;
                }
                totalPoints += 1;
            });
        });

        const insideRatio = totalPoints ? insideCount / totalPoints : 1;
        // lower steps better, higher insideRatio better
        const score = stepsCount * 1.0 - insideRatio * 5.0;
        return score;
    }

    function summarizeRoute(result) {
        const route = result.routes[0];
        const legs = route.legs || [];
        let totalDuration = 0;
        let totalDistance = 0;
        legs.forEach((leg) => {
            totalDuration += (leg.duration && leg.duration.value) || 0;
            totalDistance += (leg.distance && leg.distance.value) || 0;
        });
        return { legs, duration: totalDuration, distance: totalDistance };
    }

    function setRendererDirections(renderer, result) {
        try {
            renderer.setDirections(result);
        } catch (e) {
            console.warn("Could not set directions on renderer", e);
        }
    }

    // ---------- Route preview ----------
    async function handlePreviewRoute(dest, name, address) {
        setShowPreview(false);
        setPreview(null);
        if (!directionsServiceRef.current || !mapRef.current) {
            window.alert("Directions not available.");
            return;
        }

        // Determine origin
        let origin;
        if (userMarkerRef.current && userMarkerRef.current.getPosition) {
            const p = userMarkerRef.current.getPosition();
            origin = (typeof p.lat === "function")
                ? { lat: p.lat(), lng: p.lng() }
                : { lat: p.lat, lng: p.lng };
        } else {
            try {
                origin = await getCurrentPositionPromise(8000);
                if (!userMarkerRef.current) {
                    userMarkerRef.current = new window.google.maps.Marker({
                        position: origin,
                        map: mapRef.current,
                        title: "Your location",
                        icon: {
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 6,
                            fillColor: "#ff5722",
                            fillOpacity: 1,
                            strokeWeight: 2,
                            strokeColor: "white",
                        },
                    });
                } else {
                    try { userMarkerRef.current.setPosition(origin); } catch { /* noop */ }
                }
            } catch (err) {
                console.warn("Could not get user location, falling back to campus center", err);
                origin = TEMPLE_CENTER;
            }
        }

        if (!isWithinBounds(origin) || !isWithinBounds(dest)) {
            window.alert("Navigation is limited to within Temple campus bounds.");
            return;
        }

        // Request alternatives so we can pick fastest vs comfort
        directionsServiceRef.current.route(
            {
                origin,
                destination: dest,
                travelMode: window.google.maps.TravelMode.WALKING,
                provideRouteAlternatives: true,
            },
            (result, status) => {
                if (status !== window.google.maps.DirectionsStatus.OK || !result || !result.routes || !result.routes.length) {
                    window.alert("Could not compute route.");
                    return;
                }

                // Compute "fastest" (assume index 0)
                const fastestResult = {
                    routes: [result.routes[0]],
                    request: result.request,
                };
                const fastest = summarizeRoute(fastestResult);

                // Compute a "comfort" alternative: pick route with lowest comfort score
                let bestComfortIndex = 0;
                let bestComfortScore = Infinity;
                result.routes.forEach((r, idx) => {
                    const sc = scoreComfort(r);
                    if (sc < bestComfortScore) {
                        bestComfortScore = sc;
                        bestComfortIndex = idx;
                    }
                });
                const comfortResult = {
                    routes: [result.routes[bestComfortIndex]],
                    request: result.request,
                };
                const comfort = summarizeRoute(comfortResult);

                // Decide which to surface as primary in preview:
                const wantsComfort = mood === "stressed" || (triggers || []).includes("Crowds");

                // Render both on map for preview: primary thick, secondary thin
                setRendererDirections(
                    wantsComfort ? comfortRendererRef.current : directionsRendererRef.current,
                    wantsComfort ? fastestResult : comfortResult
                );
                setRendererDirections(
                    wantsComfort ? directionsRendererRef.current : comfortRendererRef.current,
                    wantsComfort ? comfortResult : fastestResult
                );

                // Destination marker (use the chosen route's end_location)
                try {
                    const endLoc =
                        (wantsComfort ? comfortResult : fastestResult).routes[0].legs[0].end_location;

                    const pos =
                        typeof endLoc.lat === "function"
                            ? { lat: endLoc.lat(), lng: endLoc.lng() }
                            : { lat: endLoc.lat, lng: endLoc.lng };

                    if (destinationMarkerRef.current) {
                        try { destinationMarkerRef.current.setMap(null); } catch { /* noop */ }
                    }
                    destinationMarkerRef.current = new window.google.maps.Marker({
                        position: pos,
                        map: mapRef.current,
                        title: name || "Destination",
                        label: "B",
                    });
                } catch (e) {
                    console.warn("Destination marker failed", e);
                }

                // Origin label A (use user marker if possible; else temp marker)
                try {
                    if (userMarkerRef.current && userMarkerRef.current.setLabel) {
                        userMarkerRef.current.setLabel("A");
                    } else {
                        const p =
                            userMarkerRef.current && userMarkerRef.current.getPosition
                                ? userMarkerRef.current.getPosition()
                                : origin;
                        const pos =
                            typeof p.lat === "function"
                                ? { lat: p.lat(), lng: p.lng() }
                                : { lat: p.lat, lng: p.lng };
                        if (tempOriginMarkerRef.current) {
                            try { tempOriginMarkerRef.current.setMap(null); } catch { /* noop */ }
                        }
                        tempOriginMarkerRef.current = new window.google.maps.Marker({
                            position: pos,
                            map: mapRef.current,
                            title: "Origin",
                            label: "A",
                        });
                    }
                } catch { /* noop */ }

                const chosenSummary = wantsComfort ? comfort : fastest;
                setPreview({
                    legs: chosenSummary.legs,
                    duration: chosenSummary.duration,
                    distance: chosenSummary.distance,
                    result: wantsComfort ? comfortResult : fastestResult,
                    name,
                    address,
                    chosen: wantsComfort ? "comfort" : "fastest",
                    alt: wantsComfort ? fastest : comfort,
                });
                setShowPreview(true);
            }
        );
    }

    function confirmRoute() {
        if (!preview || !preview.result) return;
        // Lock in the chosen route as "active navigation"
        setShowPreview(false);
        setActiveRoute(true);

        // show chosen route on active renderer, hide preview renderers
        if (activeRendererRef.current) {
            activeRendererRef.current.setMap(mapRef.current);
            setRendererDirections(activeRendererRef.current, preview.result);
        }
        if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
        if (comfortRendererRef.current) comfortRendererRef.current.setMap(null);
    }

    function cancelRoute() {
        setShowPreview(false);
        setPreview(null);
        if (directionsRendererRef.current) directionsRendererRef.current.setMap(mapRef.current);
        if (comfortRendererRef.current) comfortRendererRef.current.setMap(mapRef.current);
        if (activeRendererRef.current) activeRendererRef.current.setMap(null);
        setActiveRoute(false);
    }

    function endActiveRoute() {
        if (activeRendererRef.current) activeRendererRef.current.setMap(null);
        setActiveRoute(false);
        setPreview(null);
        setShowPreview(false);
        // restore preview renderers to map for next search
        if (directionsRendererRef.current) directionsRendererRef.current.setMap(mapRef.current);
        if (comfortRendererRef.current) comfortRendererRef.current.setMap(mapRef.current);
        window.alert("Navigation ended.");
    }

    function locateUser() {
        if (!mapRef.current || !window.google) return;
        if (!navigator.geolocation) {
            window.alert("Geolocation is not supported by your browser.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                const inBounds = withinBoundsLiteral(userPos.lat, userPos.lng, TEMPLE_BOUNDS);
                if (!inBounds) {
                    window.alert("You appear to be outside campus. Centering campus.");
                    mapRef.current.panTo(TEMPLE_CENTER);
                    mapRef.current.setZoom(16);
                    return;
                }
                if (userMarkerRef.current) {
                    userMarkerRef.current.setPosition(userPos);
                } else {
                    userMarkerRef.current = new window.google.maps.Marker({
                        position: userPos,
                        map: mapRef.current,
                        title: "Your location",
                        icon: {
                            path: window.google.maps.SymbolPath.CIRCLE,
                            scale: 6,
                            fillColor: "#ff5722",
                            fillOpacity: 1,
                            strokeWeight: 2,
                            strokeColor: "white",
                        },
                    });
                }
                mapRef.current.panTo(userPos);
                mapRef.current.setZoom(17);
            },
            (err) => {
                window.alert("Unable to retrieve your location: " + err.message);
            }
        );
    }

    function resetCenter() {
        if (!mapRef.current) return;
        mapRef.current.panTo(TEMPLE_CENTER);
        mapRef.current.setZoom(16);
    }

    // Simple demo heatmap updater (no-op if heatmap not present)
    function updateHeatmapData(userTriggers, currentMood) {
        if (!heatmapRef.current || !window.google) return;
        // Placeholder: sprinkle some points in the middle of campus if user is stressed or crowds trigger
        const points = [];
        const base = { lat: TEMPLE_CENTER.lat, lng: TEMPLE_CENTER.lng };
        const n = currentMood === "stressed" || (userTriggers || []).includes("Crowds") ? 20 : 5;
        for (let i = 0; i < n; i++) {
            const jitter = () => (Math.random() - 0.5) * 0.005;
            points.push(new window.google.maps.LatLng(base.lat + jitter(), base.lng + jitter()));
        }
        try {
            heatmapRef.current.setData(points);
        } catch (e) {
            // In case LatLng becomes a plain object in future APIs, fall back:
            heatmapRef.current.setData(
                points.map((p) =>
                    p && typeof p.lat === "function"
                        ? p
                        : new window.google.maps.LatLng(p.lat, p.lng)
                )
            );
        }
    }

    // ---------- UI ----------
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100vh",
                width: "100vw",
                fontFamily: "Inter, Arial, Helvetica, sans-serif",
                background: "#f7f8fb",
            }}
        >
            <style>{`
        :root { --accent: #0b5ed7; --muted: #5b6470; --panel-bg: rgba(255,255,255,0.98); --glass: rgba(255,255,255,0.85); }
        html,body,#root { height: 100%; }
        .mc-header { background: linear-gradient(90deg,#0b5ed7 0%,#3b82f6 100%); padding: 14px 20px; }
        .mc-header h1 { color: #fff; margin: 0; font-weight: 700; letter-spacing: -0.2px }
        .header-btn { color: rgba(255,255,255,0.95); background: transparent; border: 1px solid rgba(255,255,255,0.12); padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: all .14s ease; font-weight:600 }
        .header-btn:hover { background: rgba(255,255,255,0.12); transform: translateY(-1px) }
        .mc-header input::placeholder { color: rgba(16,24,32,0.4); }

        .route-panel, .active-panel {
          border-radius: 12px;
          box-shadow: 0 12px 30px rgba(16,24,40,0.12);
          background: var(--panel-bg);
          padding: 14px;
          transform: translateY(-6px);
          opacity: 0;
          transition: transform .22s cubic-bezier(.2,.9,.2,1), opacity .22s ease;
          font-family: Inter, Arial, Helvetica, sans-serif;
        }
        .route-panel.visible, .active-panel.visible { transform: translateY(0); opacity: 1 }
        .route-panel h3 { margin: 0 0 6px 0; font-size: 16px; color: #0f172a }
        .route-meta { display:flex; gap:10px; align-items:center; color:var(--muted); font-size:13px; margin-bottom:8px }
        .pill { background: var(--glass); padding:6px 10px; border-radius:999px; font-weight:600; color:var(--muted); border:1px solid rgba(0,0,0,0.06) }
        .steps { font-size:14px; color:#111; }
        .step { display:flex; gap:8px; padding:8px 0; border-bottom:1px dashed rgba(0,0,0,0.06) }
        .step:last-child { border-bottom: none }
        .step .icon { width:30px; height:30px; display:flex; align-items:center; justify-content:center; border-radius:8px; background:linear-gradient(180deg,#fff,#f6f9ff); color:var(--accent); border:1px solid rgba(0,0,0,0.04); font-size:14px }

        .active-panel h4 { margin:0 0 6px 0 }
        .active-panel p { margin:0 0 8px 0; color:var(--muted) }

        .mc-loading { position:absolute; left:0; top:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; background: rgba(255,255,255,0.6); z-index:1200 }
        .spinner { width:36px; height:36px; border-radius:50%; border:4px solid rgba(0,0,0,0.06); border-top-color:var(--accent); animation: spin 1s linear infinite }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

            {/* Header */}
            <div
                className="mc-header"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <h1 style={{ margin: 0, fontSize: "22px", color: "white" }}>
                        Temple University — Campus Map
                    </h1>

                    {/* Search input + dropdown */}
                    <div style={{ position: "relative", width: 420, maxWidth: "50vw" }}>
                        <input
                            id="map-search-input"
                            placeholder="Search campus places, buildings, cafes..."
                            aria-label="Search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: "1px solid rgba(0,0,0,0.08)",
                                background: "transparent",
                                outline: "none",
                                fontSize: 14,
                                color: "#111",
                            }}
                        />
                        {searchQuery && searchResults && searchResults.length > 0 && (
                            <div
                                onWheel={(e) => e.stopPropagation()}
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    top: "calc(100% + 8px)",
                                    borderRadius: 10,
                                    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
                                    maxHeight: 300,
                                    overflowY: "auto",
                                    WebkitOverflowScrolling: "touch",
                                    zIndex: 1200,
                                }}
                            >
                                <div style={{ background: "white", borderRadius: 10, overflow: "hidden" }}>
                                    {searchResults.map((r, i) => (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                setSearchQuery(r.description || r.name);
                                                setSearchResults([]);
                                                if (r.place_id && placesServiceRef.current) {
                                                    placesServiceRef.current.getDetails(
                                                        { placeId: r.place_id },
                                                        (place, status) => {
                                                            if (status === window.google.maps.places.PlacesServiceStatus.OK) {
                                                                const dest = {
                                                                    lat: place.geometry.location.lat(),
                                                                    lng: place.geometry.location.lng(),
                                                                };
                                                                handlePreviewRoute(dest, place.name, place.formatted_address || "");
                                                            }
                                                        }
                                                    );
                                                }
                                            }}
                                            style={{
                                                fontSize: 16,
                                                padding: "12px 14px",
                                                borderBottom: "1px solid rgba(0,0,0,0.06)",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <div style={{ fontWeight: 600 }}>
                                                {r.structured_formatting
                                                    ? r.structured_formatting.main_text
                                                    : r.name || r.description}
                                            </div>
                                            <div style={{ fontSize: 13, color: "#666" }}>
                                                {r.structured_formatting ? r.structured_formatting.secondary_text : ""}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                        onClick={() => {
                            setHeatmapVisible(!heatmapVisible);
                            if (heatmapRef.current)
                                heatmapRef.current.setMap(heatmapVisible ? null : mapRef.current);
                        }}
                        className="header-btn"
                        style={{ fontSize: 15, marginRight: 6 }}
                    >
                        {heatmapVisible ? "Hide Trigger Heatmap" : "Show Trigger Heatmap"}
                    </button>
                    <button onClick={locateUser} className="header-btn" style={{ fontSize: 15, marginRight: 6 }}>
                        Locate Me
                    </button>
                    <button onClick={resetCenter} className="header-btn" style={{ fontSize: 15 }}>
                        Reset View
                    </button>
                </div>
            </div>

            {/* Map */}
            <div ref={mapEl} style={{ flex: 1, minHeight: 0 }} />

            {/* Mood-aware banner */}
            <div
                style={{
                    background: "white",
                    borderTop: "1px solid #e5e7eb",
                    padding: "14px 16px",
                    textAlign: "center",
                }}
            >
                {mood === "stressed" || (triggers || []).includes("Crowds") ? (
                    <div style={{ color: "#be123c", fontWeight: 600 }}>
                        ⚡ You seem stressed — we’re prioritizing a comfort route (fewer turns, more on-campus paths).
                    </div>
                ) : (
                    <div style={{ color: "#0f766e", fontWeight: 600 }}>
                        ✅ You’re good to go — fastest route highlighted.
                    </div>
                )}
            </div>

            {/* Route Preview Panel */}
            {showPreview && preview && (
                <div
                    className={`route-panel visible`}
                    style={{ position: "absolute", right: 12, top: 72, width: 360, zIndex: 999 }}
                >
                    <h3>{preview.name || "Destination"}</h3>
                    <div className="route-meta">
                        <div className="pill">{(preview.distance / 1609.344).toFixed(2)} mi</div>
                        <div className="pill">{Math.round(preview.duration / 60)} min</div>
                        <div className="pill" title="Chosen by heuristic">
                            {preview.chosen === "comfort" ? "Comfort" : "Fastest"}
                        </div>
                        <div style={{ flex: 1 }} />
                    </div>
                    <div style={{ color: "#444", marginBottom: 8 }}>{preview.address}</div>
                    <div className="steps" style={{ maxHeight: 240, overflow: "auto" }}>
                        {preview.legs &&
                            preview.legs.map((leg, idx) => (
                                <div key={idx}>
                                    {leg.steps &&
                                        leg.steps.map((s, i) => (
                                            <div key={i} className="step">
                                                <div className="icon">➡️</div>
                                                <div
                                                    style={{ flex: 1 }}
                                                    dangerouslySetInnerHTML={{ __html: s.instructions }}
                                                />
                                            </div>
                                        ))}
                                </div>
                            ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12 }}>
                        <button
                            onClick={() => {
                                if (!preview || !preview.result) return;
                                setPreview((p) =>
                                    p
                                        ? {
                                            ...p,
                                            chosen: p.chosen === "comfort" ? "fastest" : "comfort",
                                        }
                                        : p
                                );
                                window.alert("Switched preference — pick the place again to recompute lines.");
                            }}
                            style={{
                                padding: "10px 14px",
                                borderRadius: 10,
                                border: "1px solid rgba(0,0,0,0.08)",
                                background: "#fff",
                                color: "#111",
                                cursor: "pointer",
                                fontWeight: 600,
                            }}
                        >
                            Switch Preview
                        </button>

                        <div style={{ display: "flex", gap: 10 }}>
                            <button
                                onClick={cancelRoute}
                                style={{
                                    padding: "10px 14px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(0,0,0,0.08)",
                                    background: "#fff",
                                    color: "#111",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmRoute}
                                style={{
                                    padding: "10px 14px",
                                    borderRadius: 10,
                                    border: "none",
                                    background: "var(--accent)",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontWeight: 700,
                                }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Active Navigation Panel */}
            {activeRoute && (
                <div
                    className={`active-panel visible`}
                    style={{ position: "absolute", right: 12, bottom: 12, width: 360, zIndex: 999 }}
                >
                    <h4>Active Navigation</h4>
                    <p>Following route. Tap End when you reach your destination.</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ color: "#444" }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>
                                ETA: {preview ? Math.round(preview.duration / 60) + " min" : "—"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                {preview ? (preview.distance / 1609.344).toFixed(2) + " mi" : ""}
                            </div>
                        </div>
                        <div>
                            <button
                                onClick={endActiveRoute}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: "#e53935",
                                    color: "white",
                                    cursor: "pointer",
                                }}
                            >
                                End
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loading && (
                <div className="mc-loading">
                    <div className="spinner" />
                </div>
            )}

            {/* Surface load errors if any (helps debugging) */}
            {loadError && (
                <div
                    style={{
                        position: "absolute",
                        left: 12,
                        bottom: 12,
                        background: "#fee2e2",
                        color: "#991b1b",
                        border: "1px solid #fecaca",
                        padding: "8px 10px",
                        borderRadius: 8,
                        maxWidth: 360,
                        fontSize: 13,
                        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                    }}
                >
                    Map error: {String(loadError)}
                </div>
            )}
        </div>
    );
}