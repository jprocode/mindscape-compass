// MapPage.jsx
import React, { useEffect, useRef, useState } from 'react';

// This component shows a Google Map centered and restricted to the Temple University campus.
// The user provided API keys are embedded per request. To change the API keys later,
// update the constants below or move them into environment variables.

const GOOGLE_MAPS_API_KEY = 'AIzaSyBWUFnp4i65FlRbB2Kx_OqEzcdkMgKeiBA';
const GOOGLE_PLACES_API_KEY = 'AIzaSyCQboMUwJ8bD6BM_UUD1Mrip-tzfXpq9l4';

const TEMPLE_CENTER = { lat: 39.9815, lng: -75.1554 };
// Bounds roughly covering Temple University campus (expanded to allow much more zoom-out)
const TEMPLE_BOUNDS = {
    // expanded further so users can zoom out and see more of the surrounding area
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

export default function MapPage() {
    const mapEl = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const userMarkerRef = useRef(null);
    const rectRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const mountedRef = useRef(true);
    const [activeRoute, setActiveRoute] = useState(false);
    const directionsServiceRef = useRef(null);
    const directionsRendererRef = useRef(null);
    const destinationMarkerRef = useRef(null);
    const tempOriginMarkerRef = useRef(null);
    const heatmapRef = useRef(null);
    const [heatmapVisible, setHeatmapVisible] = useState(false);
    const autocompleteServiceRef = useRef(null);
    const placesServiceRef = useRef(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [preview, setPreview] = useState(null); // {legs, duration, distance, directionsResult}
    const [showPreview, setShowPreview] = useState(false);

    async function loadAndInit() {
        setLoading(true);
        setLoadError(null);
            try {
                // include visualization library for heatmap
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
                zoom: 12,
                restriction: {
                    latLngBounds: bounds,
                    strictBounds: true
                },
                streetViewControl: false,
                mapTypeControl: false,
                zoomControl: true,
                fullscreenControl: true,
                scaleControl: true,
                minZoom: 8,
                maxZoom: 20
            });

            // ensure tiles render after layout
            setTimeout(() => {
                if (mapRef.current && window.google) {
                    window.google.maps.event.trigger(mapRef.current, 'resize');
                    mapRef.current.setCenter(TEMPLE_CENTER);
                }
            }, 200);

            // draw campus boundary rectangle so users can see limits
            rectRef.current = new window.google.maps.Rectangle({
                bounds: { north: TEMPLE_BOUNDS.north, south: TEMPLE_BOUNDS.south, east: TEMPLE_BOUNDS.east, west: TEMPLE_BOUNDS.west },
                strokeColor: '#1976D2',
                strokeOpacity: 0.9,
                strokeWeight: 2,
                fillColor: '#1976D2',
                fillOpacity: 0.05,
                clickable: false,
                map: mapRef.current
            });

            // Do not show a campus center marker by default to avoid confusing users.
            // If needed, we'll fall back to using TEMPLE_CENTER as origin without creating a visible marker.

            // prepare directions services/renderers
            try {
                directionsServiceRef.current = new window.google.maps.DirectionsService();
                // suppress automatic markers so we can control markers (avoid unwanted center marker)
                directionsRendererRef.current = new window.google.maps.DirectionsRenderer({ suppressMarkers: true });
                directionsRendererRef.current.setMap(null);
            } catch (err) {
                console.warn('Directions service not available', err);
            }

            // Places
            try {
                const service = new window.google.maps.places.PlacesService(mapRef.current);
                const request = { location: TEMPLE_CENTER, radius: 500, type: ['university', 'point_of_interest', 'school'] };
                service.nearbySearch(request, (results, status) => {
                    if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
                        results.forEach((place) => {
                            if (!place.geometry || !place.geometry.location) return;
                            const m = new window.google.maps.Marker({ position: place.geometry.location, map: mapRef.current, title: place.name });
                            const info = new window.google.maps.InfoWindow({ content: `<strong>${place.name}</strong>` });
                            m.addListener('click', () => info.open({ anchor: m, map: mapRef.current }));
                            markersRef.current.push(m);
                        });
                    }
                });

            // initialize an empty heatmap layer (data removed). The button remains to trigger heatmap display when data is available.
            try {
                heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
                    data: [],
                    dissipating: true,
                    radius: 40,
                    opacity: 0.7,
                    map: null
                });
            } catch (err) {
                console.warn('Failed to initialize heatmap', err);
            }
            } catch (err) {
                console.warn('Places service not available or failed', err);
            }

            // setup places/autocomplete services for custom search dropdown
            try {
                const service = new window.google.maps.places.PlacesService(mapRef.current);
                placesServiceRef.current = service;
                autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
            } catch (err) {
                console.warn('Places/autocomplete services not available', err);
            }

            // user location: create a single user marker (store in userMarkerRef) to avoid duplicates
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) => {
                    if (!mapRef.current) return;
                    const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    const inBounds = bounds.contains(new window.google.maps.LatLng(userPos.lat, userPos.lng));
                    if (userMarkerRef.current) {
                        // update existing marker position
                        try { userMarkerRef.current.setPosition(userPos); } catch (e) { /* ignore */ }
                    } else {
                        userMarkerRef.current = new window.google.maps.Marker({ position: userPos, map: mapRef.current, title: 'Your location', icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#ff5722', fillOpacity: 1, strokeWeight: 2, strokeColor: 'white' } });
                        // do not push to markersRef to avoid treating this as a place marker; keep separately
                    }
                    if (inBounds) mapRef.current.setCenter(userPos);
                }, (err) => {
                    console.warn('Geolocation error:', err.message);
                });
            }

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

    // keep map responsive and trigger resize when window changes
    useEffect(() => {
        function handleResize() {
            if (mapRef.current && window.google) {
                window.google.maps.event.trigger(mapRef.current, 'resize');
            }
        }
        window.addEventListener('resize', handleResize);
        // also attempt to re-trigger resize shortly after mount in case of layout shifts
        const t = setTimeout(handleResize, 300);
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // watch searchQuery and fetch suggestions using AutocompleteService
    useEffect(() => {
        if (!searchQuery || !autocompleteServiceRef.current) return;
        const q = searchQuery;
        const bounds = new window.google.maps.LatLngBounds(
            { lat: TEMPLE_BOUNDS.south, lng: TEMPLE_BOUNDS.west },
            { lat: TEMPLE_BOUNDS.north, lng: TEMPLE_BOUNDS.east }
        );
        autocompleteServiceRef.current.getPlacePredictions({ input: q, bounds, strictBounds: true }, (preds, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK && preds) {
                setSearchResults(preds);
            } else {
                setSearchResults([]);
            }
        });
    }, [searchQuery]);

    // UX helpers
    function locateUser() {
        if (!mapRef.current || !window.google) return;
        if (!navigator.geolocation) {
            window.alert('Geolocation is not supported by your browser.');
            return;
        }
        navigator.geolocation.getCurrentPosition((pos) => {
            const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const bounds = new window.google.maps.LatLngBounds(
                { lat: TEMPLE_BOUNDS.south, lng: TEMPLE_BOUNDS.west },
                { lat: TEMPLE_BOUNDS.north, lng: TEMPLE_BOUNDS.east }
            );
            const inBounds = bounds.contains(new window.google.maps.LatLng(userPos.lat, userPos.lng));
            if (!inBounds) {
                window.alert('Your location appears to be outside Temple University campus. Showing campus center instead.');
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
                    title: 'Your location',
                    icon: {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: 6,
                        fillColor: '#ff5722',
                        fillOpacity: 1,
                        strokeWeight: 2,
                        strokeColor: 'white'
                    }
                });
            }
            mapRef.current.panTo(userPos);
            mapRef.current.setZoom(17);
        }, (err) => {
            window.alert('Unable to retrieve your location: ' + err.message);
        });
    }

    function resetCenter() {
        if (!mapRef.current) return;
        mapRef.current.panTo(TEMPLE_CENTER);
        mapRef.current.setZoom(16);
    }

    // Helpers for navigation/preview
    function isWithinBounds(latLng) {
        if (!window.google) return false;
        const bounds = new window.google.maps.LatLngBounds(
            { lat: TEMPLE_BOUNDS.south, lng: TEMPLE_BOUNDS.west },
            { lat: TEMPLE_BOUNDS.north, lng: TEMPLE_BOUNDS.east }
        );
        return bounds.contains(new window.google.maps.LatLng(latLng.lat, latLng.lng));
    }

    async function getCurrentPositionPromise(timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('Geolocation unavailable'));
            const timer = setTimeout(() => reject(new Error('Geolocation timed out')), timeout);
            navigator.geolocation.getCurrentPosition((pos) => {
                clearTimeout(timer);
                resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }, (err) => {
                clearTimeout(timer);
                reject(err);
            }, { enableHighAccuracy: true, maximumAge: 30000, timeout });
        });
    }

    async function snapToNearestRoad(point) {
        // Try using Google Roads 'nearestRoads' endpoint (may require Roads API enabled)
        try {
            const url = `https://roads.googleapis.com/v1/nearestRoads?points=${point.lat},${point.lng}&key=${GOOGLE_MAPS_API_KEY}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('roads api error');
            const data = await res.json();
            if (data && data.snappedPoints && data.snappedPoints.length) {
                const loc = data.snappedPoints[0].location;
                return { lat: loc.latitude, lng: loc.longitude };
            }
        } catch (err) {
            // fall back silently
            console.warn('snapToNearestRoad failed', err);
        }
        return point;
    }

    async function handlePreviewRoute(dest, name, address) {
        setShowPreview(false);
        setPreview(null);
        if (!directionsServiceRef.current || !mapRef.current) {
            window.alert('Directions not available.');
            return;
        }

        // Determine origin: prefer existing user marker; otherwise get current position now
        let origin;
        if (userMarkerRef.current && userMarkerRef.current.getPosition) {
            const p = userMarkerRef.current.getPosition();
            origin = { lat: p.lat(), lng: p.lng() };
        } else {
            try {
                const cur = await getCurrentPositionPromise(8000);
                // attempt to snap to nearest road for better routing start
                const snapped = await snapToNearestRoad(cur);
                origin = snapped || cur;
                // create user marker at snapped/original location (don't duplicate in markersRef)
                if (!userMarkerRef.current) {
                    userMarkerRef.current = new window.google.maps.Marker({ position: origin, map: mapRef.current, title: 'Your location', icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#ff5722', fillOpacity: 1, strokeWeight: 2, strokeColor: 'white' } });
                } else {
                    try { userMarkerRef.current.setPosition(origin); } catch (e) {}
                }
            } catch (err) {
                console.warn('Could not get user location at route time, falling back to campus center', err);
                origin = TEMPLE_CENTER;
            }
        }

        // check that both origin and dest are within bounds
        if (!isWithinBounds(origin) || !isWithinBounds(dest)) {
            window.alert('Navigation is allowed only within Temple campus and surrounding bounds.');
            return;
        }

        directionsRendererRef.current.setMap(mapRef.current);
        directionsServiceRef.current.route({ origin, destination: dest, travelMode: window.google.maps.TravelMode.WALKING }, (result, status) => {
            if (status === window.google.maps.DirectionsStatus.OK) {
                // compute duration and distance
                const legs = result.routes[0].legs || [];
                let totalDuration = 0;
                let totalDistance = 0;
                legs.forEach((leg) => {
                    totalDuration += (leg.duration && leg.duration.value) || 0;
                    totalDistance += (leg.distance && leg.distance.value) || 0;
                });
                setPreview({ legs, duration: totalDuration, distance: totalDistance, result, name, address });
                setShowPreview(true);
                directionsRendererRef.current.setDirections(result);

                // cleanup previous markers
                if (destinationMarkerRef.current) {
                    try { destinationMarkerRef.current.setMap(null); } catch (e) {}
                    destinationMarkerRef.current = null;
                }
                if (tempOriginMarkerRef.current) {
                    try { tempOriginMarkerRef.current.setMap(null); } catch (e) {}
                    tempOriginMarkerRef.current = null;
                }

                // create destination marker at end location
                try {
                    const endLoc = result.routes[0].legs[0].end_location;
                    destinationMarkerRef.current = new window.google.maps.Marker({ position: endLoc, map: mapRef.current, title: name || 'Destination', label: 'B' });
                } catch (e) { console.warn('failed to create destination marker', e); }

                // label origin marker as A (if user marker exists) otherwise create a temp origin marker
                try {
                    if (userMarkerRef.current && userMarkerRef.current.setLabel) {
                        userMarkerRef.current.setLabel('A');
                    } else if (userMarkerRef.current && userMarkerRef.current.getPosition && !userMarkerRef.current.getLabel) {
                        // some browsers may not support setLabel; create temporary labeled marker
                        const p = userMarkerRef.current.getPosition ? { lat: userMarkerRef.current.getPosition().lat(), lng: userMarkerRef.current.getPosition().lng() } : origin;
                        tempOriginMarkerRef.current = new window.google.maps.Marker({ position: p, map: mapRef.current, title: 'Origin', label: 'A' });
                    }
                } catch (e) { /* ignore labeling errors */ }

            } else {
                window.alert('Could not compute route: ' + status);
            }
        });
    }

    function confirmRoute() {
        // keep route displayed and enter active navigation mode
        setShowPreview(false);
        setActiveRoute(true);
        // clear search input
        const inp = document.getElementById('map-search-input');
        if (inp) inp.value = '';
        setSearchQuery('');
    }

    function cancelRoute() {
        if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
        setPreview(null);
        setShowPreview(false);
        setActiveRoute(false);
    }

    function endActiveRoute() {
        if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
        setActiveRoute(false);
        setPreview(null);
        setShowPreview(false);
        window.alert('Navigation ended.');
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', fontFamily: 'Inter, Arial, Helvetica, sans-serif', background: '#f7f8fb' }}>
            <style>{`
                :root { --accent: #0b5ed7; --muted: #5b6470; --panel-bg: rgba(255,255,255,0.98); --glass: rgba(255,255,255,0.85); }
                html,body,#root { height: 100%; }
                .mc-header { background: linear-gradient(90deg,#0b5ed7 0%,#3b82f6 100%); padding: 14px 20px; }
                .mc-header h1 { color: #fff; margin: 0; font-weight: 700; letter-spacing: -0.2px }
                .header-btn { color: rgba(255,255,255,0.95); background: transparent; border: 1px solid rgba(255,255,255,0.12); padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: all .14s ease; font-weight:600 }
                .header-btn:hover { background: rgba(255,255,255,0.12); transform: translateY(-1px) }
                .mc-header input::placeholder { color: rgba(16,24,32,0.4); }

                /* Route/preview panels */
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

                /* Active nav */
                .active-panel h4 { margin:0 0 6px 0 }
                .active-panel p { margin:0 0 8px 0; color:var(--muted) }

                /* Loading spinner */
                .mc-loading { position:absolute; left:0; top:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; background: rgba(255,255,255,0.6); z-index:1200 }
                .spinner { width:36px; height:36px; border-radius:50%; border:4px solid rgba(0,0,0,0.06); border-top-color:var(--accent); animation: spin 1s linear infinite }
                @keyframes spin { to { transform: rotate(360deg) } }
            `}</style>
            <div className="mc-header" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h1 style={{ margin: 0, fontSize: '22px', color: 'white' }}>Temple University — Campus Map</h1>
                    <div style={{ position: 'relative', width: 420, maxWidth: '50vw' }}>
                        <input id="map-search-input" placeholder="Search campus places, buildings, cafes..." aria-label="Search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: '#111' }} />
                        {searchQuery && searchResults && searchResults.length > 0 && (
                            <div onWheel={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 8px)', background: 'transparent', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.12)', maxHeight: 300, overflowY: 'auto', WebkitOverflowScrolling: 'touch', zIndex: 1200 }}>
                                <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden' }}>
                                {searchResults.map((r, i) => (
                                    <div key={i} onClick={() => { setSearchQuery(r.description || r.name); setSearchResults([]); if (r.place_id && placesServiceRef.current) { placesServiceRef.current.getDetails({ placeId: r.place_id }, (place, status) => { if (status === window.google.maps.places.PlacesServiceStatus.OK) { const dest = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() }; handlePreviewRoute(dest, place.name, place.formatted_address || ''); } }); } }} style={{ fontSize: 16, padding: '12px 14px', borderBottom: '1px solid rgba(0,0,0,0.06)', cursor: 'pointer' }}>
                                        <div style={{ fontWeight: 600 }}>{r.structured_formatting ? r.structured_formatting.main_text : (r.name || r.description)}</div>
                                        <div style={{ fontSize: 13, color: '#666' }}>{r.structured_formatting ? r.structured_formatting.secondary_text : ''}</div>
                                    </div>
                                ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => { setHeatmapVisible(!heatmapVisible); if (heatmapRef.current) heatmapRef.current.setMap(heatmapVisible ? null : mapRef.current); }} className="header-btn" style={{ fontSize:15, marginRight: 6 }}>{heatmapVisible ? 'Hide Trigger Heatmap' : 'Show Trigger Heatmap'}</button>
                    <button onClick={locateUser} className="header-btn" style={{ fontSize:15, marginRight: 6 }}>Locate Me</button>
                    <button onClick={resetCenter} className="header-btn" style={{ fontSize:15 }}>Reset View</button>
                </div>
            </div>
            <div ref={mapEl} style={{ flex: 1, minHeight: 0 }} />

            {showPreview && preview && (
                <div className={`route-panel visible`} style={{ position: 'absolute', right: 12, top: 72, width: 360, zIndex: 999 }}>
                    <h3>{preview.name || 'Destination'}</h3>
                    <div className="route-meta">
                        <div className="pill">{(preview.distance/1609.344).toFixed(2)} mi</div>
                        <div className="pill">{Math.round(preview.duration/60)} min</div>
                        <div style={{ flex: 1 }} />
                    </div>
                    <div style={{ color: '#444', marginBottom: 8 }}>{preview.address}</div>
                    <div className="steps" style={{ maxHeight: 240, overflow: 'auto' }}>
                        {preview.legs && preview.legs.map((leg, idx) => (
                            <div key={idx}>
                                {leg.steps && leg.steps.map((s, i) => (
                                    <div key={i} className="step">
                                        <div className="icon">➡️</div>
                                        <div style={{ flex: 1 }} dangerouslySetInnerHTML={{ __html: s.instructions }} />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                        <button onClick={cancelRoute} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)', background: '#fff', color: '#111', cursor: 'pointer', fontWeight:600 }}>Cancel</button>
                        <button onClick={confirmRoute} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight:700 }}>Confirm</button>
                    </div>
                </div>
            )}

            {activeRoute && (
                <div className={`active-panel visible`} style={{ position: 'absolute', right: 12, bottom: 12, width: 360, zIndex: 999 }}>
                    <h4>Active Navigation</h4>
                    <p>Following route. Tap End when you reach your destination.</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ color: '#444' }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>ETA: {preview ? Math.round(preview.duration/60) + ' min' : '—'}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{preview ? (preview.distance/1609.344).toFixed(2) + ' mi' : ''}</div>
                        </div>
                        <div>
                            <button onClick={endActiveRoute} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#e53935', color: 'white', cursor: 'pointer' }}>End</button>
                        </div>
                    </div>
                </div>
            )}

            {loading && (
                <div className="mc-loading"><div className="spinner" /></div>
            )}
        </div>
    );
}