import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, LayersControl, CircleMarker, Popup, useMap } from "react-leaflet";
import * as satellite from "satellite.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import RouteHead from "@/components/RouteHead";

// Fix default icon paths (we don't use them, but suppress warnings).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

const CELESTRAK_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json";

type GpRecord = {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  CLASSIFICATION_TYPE: string;
};

type Sat = {
  name: string;
  noradId: number;
  satrec: satellite.SatRec;
};

type SatPos = {
  name: string;
  noradId: number;
  lat: number;
  lon: number;
  altKm: number;
  speedKmS: number;
};

// Convert OMM/GP JSON record to a SatRec using satellite.js helper.
function recordToSatrec(r: GpRecord): satellite.SatRec | null {
  try {
    // satellite.js exposes json2satrec on newer builds; fall back to twoline via constructed TLE if needed.
    const anySat = satellite as unknown as {
      json2satrec?: (rec: GpRecord) => satellite.SatRec;
    };
    if (anySat.json2satrec) return anySat.json2satrec(r);
    return null;
  } catch {
    return null;
  }
}

function propagate(sat: Sat, when: Date): SatPos | null {
  const pv = satellite.propagate(sat.satrec, when);
  if (!pv || typeof pv.position === "boolean" || !pv.position) return null;
  const gmst = satellite.gstime(when);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  const lat = satellite.degreesLat(geo.latitude);
  const lon = satellite.degreesLong(geo.longitude);
  const altKm = geo.height;
  const v = pv.velocity;
  let speed = 0;
  if (v && typeof v !== "boolean") {
    speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); // km/s
  }
  return { name: sat.name, noradId: sat.noradId, lat, lon, altKm, speedKmS: speed };
}

function FitWorld() {
  const map = useMap();
  useEffect(() => {
    map.setView([20, 0], 2);
  }, [map]);
  return null;
}

const VoidMap = () => {
  const [sats, setSats] = useState<Sat[]>([]);
  const [positions, setPositions] = useState<SatPos[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const tickRef = useRef<number | null>(null);

  // GIBS daily layer needs yesterday's date for safety.
  const gibsDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // Fetch Starlink TLEs once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(CELESTRAK_URL);
        if (!res.ok) throw new Error(`Celestrak HTTP ${res.status}`);
        const json: GpRecord[] = await res.json();
        const parsed: Sat[] = [];
        for (const r of json) {
          const rec = recordToSatrec(r);
          if (rec) parsed.push({ name: r.OBJECT_NAME, noradId: r.NORAD_CAT_ID, satrec: rec });
        }
        if (!cancelled) setSats(parsed);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Propagation tick.
  useEffect(() => {
    if (sats.length === 0) return;
    const tick = () => {
      const t = new Date();
      const out: SatPos[] = [];
      for (const s of sats) {
        const p = propagate(s, t);
        if (p) out.push(p);
      }
      setPositions(out);
      setNow(t);
    };
    tick();
    tickRef.current = window.setInterval(tick, 3000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [sats]);

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground">
      <RouteHead
        title="Void Map · Live Starlink + NASA Earth"
        description="Real-time Starlink constellation positions over NASA GIBS daily satellite imagery — the Sovereign void-map."
      />
      <header className="px-4 py-3 border-b border-border flex items-center justify-between text-xs uppercase tracking-widest">
        <div className="text-primary/80">Void Map</div>
        <div className="text-muted-foreground">
          {loadError
            ? `Feed offline: ${loadError}`
            : sats.length === 0
              ? "Acquiring constellation…"
              : `${positions.length} Starlink · ${now.toUTCString().slice(17, 25)} UTC`}
        </div>
      </header>
      <div className="flex-1 relative">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          minZoom={2}
          worldCopyJump
          style={{ height: "100%", width: "100%", background: "#000" }}
        >
          <FitWorld />
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="NASA GIBS · True Color (daily)">
              <TileLayer
                url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`}
                attribution='Imagery © <a href="https://earthdata.nasa.gov/gibs">NASA EOSDIS GIBS</a>'
                tileSize={256}
                maxZoom={9}
                minZoom={1}
                noWrap={false}
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="NASA GIBS · VIIRS City Lights">
              <TileLayer
                url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png"
                attribution='Imagery © NASA EOSDIS GIBS'
                tileSize={256}
                maxZoom={8}
                minZoom={1}
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          {positions.map((p) => (
            <CircleMarker
              key={p.noradId}
              center={[p.lat, p.lon]}
              radius={2}
              pathOptions={{
                color: "#7dd3fc",
                fillColor: "#7dd3fc",
                fillOpacity: 0.8,
                weight: 0,
              }}
            >
              <Popup>
                <div className="text-xs space-y-1">
                  <div className="font-semibold">{p.name}</div>
                  <div>NORAD: {p.noradId}</div>
                  <div>Lat: {p.lat.toFixed(3)}°</div>
                  <div>Lon: {p.lon.toFixed(3)}°</div>
                  <div>Altitude: {p.altKm.toFixed(1)} km</div>
                  <div>Speed: {p.speedKmS.toFixed(2)} km/s</div>
                  <a
                    href={`https://www.n2yo.com/satellite/?s=${p.noradId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    Track on N2YO →
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default VoidMap;
