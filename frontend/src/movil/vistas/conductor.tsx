// Pantallas del conductor: viaje actual, historial y detalle de un viaje.
import { useCallback, useMemo, useState } from "react";
import { CircleCheck, ExternalLink, History, MapPin, Navigation, Play, Radio, Truck } from "lucide-react";
import { toast } from "sonner";
import { Insignia, MensajeError } from "@/components/comunes";
import { Mapa } from "@/components/Mapa";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, mensaje, o404 } from "@/lib/api";
import { fmt } from "@/lib/formato";
import type { MiCamion, RutaCamion, Tramo, ViajeResumen } from "@/lib/tipos";
import {
  BarraAccion,
  BotonRecargar,
  Contenido,
  Dato,
  Encabezado,
  Tarjeta,
  Vacio,
  enlaceGoogleMaps,
  useCarga,
} from "@/movil/componentes";
import { gpsDisponible, useCompartirUbicacion } from "@/movil/gps";

const SIN_TRAMOS: Tramo[] = [];

function ResumenViaje({ viaje }: { viaje: RutaCamion }) {
  return (
    <Tarjeta>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">Envío</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{viaje.envio}</p>
          <p className="truncate text-sm text-gray-600 dark:text-gray-300">{viaje.cliente}</p>
        </div>
        <Insignia estado={viaje.estado} />
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-blue-600" /> Recoges en <strong>{viaje.origen}</strong>
        </p>
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-green-600" /> Entregas en <strong>{viaje.destino}</strong>
        </p>
        {viaje.descripcion && (
          <p className="text-gray-500 dark:text-gray-400">
            {viaje.descripcion} · {fmt.kg(viaje.peso_kg)}
          </p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Dato etiqueta="Distancia" valor={fmt.km(viaje.distancia_total_km)} />
        <Dato etiqueta="Tiempo" valor={fmt.tiempo(viaje.tiempo_estimado_min)} />
        <Dato etiqueta="Camión" valor={viaje.placa} />
      </div>
    </Tarjeta>
  );
}

function PasosRuta({ viaje }: { viaje: RutaCamion }) {
  return (
    <Tarjeta titulo="Ruta paso a paso">
      <ol className="space-y-3">
        {viaje.pasos.map((p, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span
              className={`grid size-7 shrink-0 place-content-center rounded-full text-xs font-semibold ${
                p.etapa === "vacio"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p>
                {p.desde} → <strong>{p.hasta}</strong>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {p.etapa === "vacio" ? "Sin carga" : "Con carga"} · {fmt.km(p.distancia_km)} · {fmt.tiempo(p.tiempo_min)}
                {p.peaje > 0 && ` · caseta ${fmt.dinero(p.peaje)}`}
                {!p.abierto && " · ⚠ tramo cerrado"}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Tarjeta>
  );
}

function MapaViaje({ viaje, puntoActual = null }: { viaje: RutaCamion; puntoActual?: [number, number] | null }) {
  const ruta = useMemo(() => ({ vacio: viaje.ruta_vacio, carga: viaje.ruta_carga }), [viaje]);
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
      <Mapa ubicaciones={viaje.ubicaciones} tramos={SIN_TRAMOS} ruta={ruta} puntoActual={puntoActual} className="h-64" />
    </section>
  );
}

// ---------- Mi viaje ----------

export function ConductorViaje() {
  const cargar = useCallback(async () => {
    const [viaje, camion] = await Promise.all([
      o404(api<RutaCamion>("/conductor/viaje")),
      o404(api<MiCamion>("/conductor/camion")),
    ]);
    return { viaje, camion };
  }, []);
  const { datos, error, cargando, recargar } = useCarga(cargar);
  const [compartir, setCompartir] = useState(() => localStorage.getItem("compartir_gps") === "si");
  const [ocupado, setOcupado] = useState(false);
  const [confirmarEntrega, setConfirmarEntrega] = useState(false);
  const viaje = datos?.viaje ?? null;
  const gps = useCompartirUbicacion(compartir && viaje !== null);

  function cambiarCompartir(valor: boolean) {
    setCompartir(valor);
    localStorage.setItem("compartir_gps", valor ? "si" : "no");
  }

  async function accion(tipo: "iniciar" | "entregar") {
    if (!viaje) return;
    setOcupado(true);
    try {
      await api(`/conductor/viajes/${viaje.asignacion_id}/${tipo}`, { metodo: "POST" });
      toast.success(tipo === "iniciar" ? "¡Buen viaje! Ruta iniciada" : "Entrega confirmada. ¡Buen trabajo!");
      if (tipo === "iniciar" && gpsDisponible()) cambiarCompartir(true);
      await recargar();
    } catch (err) {
      toast.error(mensaje(err));
    } finally {
      setOcupado(false);
      setConfirmarEntrega(false);
    }
  }

  return (
    <>
      <Encabezado titulo="Mi viaje" accion={<BotonRecargar cargando={cargando} onClick={recargar} />} />
      <Contenido conBarraAccion={viaje !== null}>
        {error && <MensajeError texto={error} />}
        {datos && !viaje && (
          <>
            <Vacio
              Icon={Navigation}
              titulo="No tienes viajes por ahora"
              texto="Cuando la agencia te asigne un envío, aquí verás la ruta y las indicaciones."
            >
              <Button variant="outline" onClick={recargar}>Actualizar</Button>
            </Vacio>
            {datos.camion && <TarjetaCamion camion={datos.camion} />}
          </>
        )}
        {viaje && (
          <>
            <ResumenViaje viaje={viaje} />
            <MapaViaje viaje={viaje} puntoActual={gps.coords} />
            <Button asChild variant="outline" className="w-full">
              <a href={enlaceGoogleMaps(viaje.ubicaciones, viaje.ruta_vacio, viaje.ruta_carga)} target="_blank" rel="noreferrer">
                <ExternalLink /> Navegar con Google Maps
              </a>
            </Button>
            <Tarjeta>
              <label className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Radio className="h-4 w-4 text-green-600" /> Compartir mi ubicación con la agencia
                </span>
                <input
                  type="checkbox"
                  checked={compartir}
                  onChange={e => cambiarCompartir(e.target.checked)}
                  className="size-5 accent-blue-600"
                />
              </label>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {gps.error
                  ? gps.error
                  : !compartir
                    ? "Apagado. La agencia no ve dónde estás."
                    : gps.ultimoEnvio
                      ? `Enviada ${fmt.haceCuanto(gps.ultimoEnvio.toISOString())} · se actualiza cada 30 s`
                      : "Buscando señal GPS…"}
              </p>
            </Tarjeta>
            <PasosRuta viaje={viaje} />
            <BarraAccion>
              {viaje.estado === "planificada" ? (
                <Button size="lg" className="h-12 flex-1 bg-blue-600 text-base text-white hover:bg-blue-700" disabled={ocupado} onClick={() => accion("iniciar")}>
                  <Play /> Iniciar viaje
                </Button>
              ) : (
                <Button size="lg" className="h-12 flex-1 bg-green-600 text-base text-white hover:bg-green-700" disabled={ocupado} onClick={() => setConfirmarEntrega(true)}>
                  <CircleCheck /> Confirmar entrega
                </Button>
              )}
            </BarraAccion>
          </>
        )}
      </Contenido>

      <Dialog open={confirmarEntrega} onOpenChange={setConfirmarEntrega}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Confirmas la entrega?</DialogTitle>
            <DialogDescription>
              {viaje ? `Envío ${viaje.envio} entregado en ${viaje.destino}. Tu camión quedará disponible ahí.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarEntrega(false)}>Todavía no</Button>
            <Button className="bg-green-600 text-white hover:bg-green-700" disabled={ocupado} onClick={() => accion("entregar")}>
              Sí, ya entregué
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TarjetaCamion({ camion }: { camion: MiCamion }) {
  return (
    <Tarjeta titulo="Mi camión">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/30 p-3">
          <Truck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{camion.placa}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {camion.marca} {camion.modelo} · {fmt.kg(camion.capacidad_kg)}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">En {camion.ubicacion ?? "ubicación desconocida"}</p>
        </div>
        <Insignia estado={camion.estado} />
      </div>
    </Tarjeta>
  );
}

// ---------- Historial ----------

const cargarHistorial = () => api<ViajeResumen[]>("/conductor/viajes");

export function ConductorHistorial({ ir }: { ir: (ruta: string) => void }) {
  const { datos, error, cargando, recargar } = useCarga(cargarHistorial);
  return (
    <>
      <Encabezado titulo="Historial" subtitulo="Tus viajes" accion={<BotonRecargar cargando={cargando} onClick={recargar} />} />
      <Contenido>
        {error && <MensajeError texto={error} />}
        {datos?.length === 0 && (
          <Vacio Icon={History} titulo="Sin viajes todavía" texto="Aquí aparecerán los viajes que hagas." />
        )}
        {datos?.map(v => (
          <button key={v.id} onClick={() => ir(`historial/${v.id}`)} className="block w-full text-left">
            <Tarjeta className="active:bg-gray-50 dark:active:bg-gray-800">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{v.envio}</p>
                <Insignia estado={v.estado} />
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {v.origen} → {v.destino}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {v.cliente} · {fmt.km(v.distancia_total_km)} · {fmt.haceCuanto(v.actualizado_en ?? v.creado_en)}
              </p>
            </Tarjeta>
          </button>
        ))}
      </Contenido>
    </>
  );
}

export function DetalleViaje({ id }: { id: string }) {
  // El id viene de la URL: si no es un viaje propio la API responde 404 (protección BOLA/IDOR)
  const cargar = useCallback(() => api<RutaCamion>(`/conductor/viajes/${encodeURIComponent(id)}`), [id]);
  const { datos: viaje, error } = useCarga(cargar);
  return (
    <>
      <Encabezado titulo={viaje ? `Viaje ${viaje.envio}` : "Viaje"} atras />
      <Contenido>
        {error && <MensajeError texto={error} />}
        {viaje && (
          <>
            <ResumenViaje viaje={viaje} />
            <MapaViaje viaje={viaje} />
            <PasosRuta viaje={viaje} />
          </>
        )}
      </Contenido>
    </>
  );
}
