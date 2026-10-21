// Mapa con Leaflet + OpenStreetMap (necesita internet para el fondo del mapa).
import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Camion, Tramo, Ubicacion } from "@/lib/tipos";
import { cn } from "@/lib/utils";

const COLOR_VACIO = "#d97706";
const COLOR_CARGA = "#2563eb";
const SIN_CAMIONES: Camion[] = [];

export interface RutaMapa {
  vacio: number[]; // camión -> origen del envío (punteado)
  carga: number[]; // origen -> destino (sólido)
}

interface Props {
  ubicaciones: Ubicacion[];
  tramos: Tramo[];
  camiones?: Camion[];
  ruta?: RutaMapa | null;
  className?: string;
}

const punto = (u: Ubicacion): L.LatLngTuple => [u.latitud, u.longitud];
const escapar = (texto: string) => texto.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function Mapa({ ubicaciones, tramos, camiones = SIN_CAMIONES, ruta = null, className }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaRed = useRef<L.LayerGroup | null>(null);
  const capaRuta = useRef<L.LayerGroup | null>(null);

  // Crear el mapa una sola vez
  useEffect(() => {
    const m = L.map(contenedor.current!).setView([22.5, -101.5], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    capaRed.current = L.layerGroup().addTo(m);
    capaRuta.current = L.layerGroup().addTo(m);
    mapa.current = m;
    // Si cambia el tamaño (por ejemplo, al colapsar la barra lateral) Leaflet debe recalcular
    const observador = new ResizeObserver(() => m.invalidateSize());
    observador.observe(contenedor.current!);
    return () => {
      observador.disconnect();
      m.remove();
      mapa.current = null;
    };
  }, []);

  // Red de carreteras, ciudades y camiones
  useEffect(() => {
    const m = mapa.current;
    const capa = capaRed.current;
    if (!m || !capa) return;
    capa.clearLayers();
    const porId = new Map(ubicaciones.map(u => [u.id, u]));
    for (const t of tramos) {
      const a = porId.get(t.origen_id);
      const b = porId.get(t.destino_id);
      if (!a || !b) continue;
      L.polyline([punto(a), punto(b)], {
        color: t.activo ? "#64748b" : "#dc2626",
        weight: t.activo ? 2 : 3,
        opacity: 0.7,
        dashArray: t.activo ? undefined : "6 6",
      })
        .bindTooltip(`${escapar(a.nombre)} – ${escapar(b.nombre)}: ${t.distancia_km} km${t.activo ? "" : " (cerrado)"}`)
        .addTo(capa);
    }
    for (const u of ubicaciones) {
      L.circleMarker(punto(u), { radius: 5, color: "#0f172a", weight: 2, fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip(escapar(u.nombre))
        .addTo(capa);
    }
    const porUbicacion = new Map<number, Camion[]>();
    for (const c of camiones) {
      if (c.ubicacion_id !== null && porId.has(c.ubicacion_id)) {
        porUbicacion.set(c.ubicacion_id, [...(porUbicacion.get(c.ubicacion_id) ?? []), c]);
      }
    }
    for (const [ubicacionId, grupo] of porUbicacion) {
      const icono = L.divIcon({
        className: "marcador-camion",
        html: `<span>${grupo.length > 1 ? `${grupo.length} camiones` : escapar(grupo[0].placa)}</span>`,
        iconSize: undefined,
      });
      L.marker(punto(porId.get(ubicacionId)!), { icon: icono })
        .bindTooltip(grupo.map(c => `${escapar(c.placa)} (${c.estado.replaceAll("_", " ")})`).join("<br>"))
        .addTo(capa);
    }
    if (ubicaciones.length) m.fitBounds(ubicaciones.map(punto), { padding: [24, 24] });
  }, [ubicaciones, tramos, camiones]);

  // Ruta seleccionada
  useEffect(() => {
    const m = mapa.current;
    const capa = capaRuta.current;
    if (!m || !capa) return;
    capa.clearLayers();
    if (!ruta) return;
    const porId = new Map(ubicaciones.map(u => [u.id, u]));
    const puntos = (ids: number[]) => ids.flatMap(id => (porId.has(id) ? [punto(porId.get(id)!)] : []));
    if (ruta.vacio.length > 1) {
      L.polyline(puntos(ruta.vacio), { color: COLOR_VACIO, weight: 5, dashArray: "8 8" })
        .bindTooltip("Viaje en vacío")
        .addTo(capa);
    }
    L.polyline(puntos(ruta.carga), { color: COLOR_CARGA, weight: 6 }).bindTooltip("Viaje con carga").addTo(capa);
    const marcar = (id: number | undefined, texto: string, color: string) => {
      const u = id === undefined ? undefined : porId.get(id);
      if (!u) return;
      L.circleMarker(punto(u), { radius: 8, color, weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip(`${texto}: ${escapar(u.nombre)}`, { permanent: true, direction: "top", offset: [0, -8] })
        .addTo(capa);
    };
    if (ruta.vacio.length > 1) marcar(ruta.vacio[0], "Camión", COLOR_VACIO);
    marcar(ruta.carga[0], "Origen", COLOR_CARGA);
    marcar(ruta.carga.at(-1), "Destino", COLOR_CARGA);
    const todos = puntos([...ruta.vacio, ...ruta.carga]);
    if (todos.length) m.fitBounds(todos, { padding: [48, 48] });
  }, [ruta, ubicaciones]);

  return <div ref={contenedor} className={cn("h-[560px] w-full z-0", className)} />;
}
