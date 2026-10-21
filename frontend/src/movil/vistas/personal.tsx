// Pantallas del personal de la agencia (admin, operador, consulta) en el celular.
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { CircleCheck, Package, Play, Plus, RotateCw, Search, Sparkles, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Insignia, MensajeError, Selector } from "@/components/comunes";
import { Mapa } from "@/components/Mapa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, mensaje } from "@/lib/api";
import { COLOR_PRIORIDAD, PRIORIDADES, fmt, indexar } from "@/lib/formato";
import type {
  Asignacion,
  Camion,
  Conductor,
  Criterio,
  Envio,
  Panel,
  Posicion,
  ResultadoModelo,
  Tramo,
  Ubicacion,
} from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { BarraAccion, BotonRecargar, Contenido, Dato, Encabezado, Tarjeta, Vacio, useCarga } from "@/movil/componentes";

const SIN_TRAMOS: Tramo[] = [];

async function cargarOperacion() {
  const [asignaciones, envios, camiones, conductores, ubicaciones] = await Promise.all([
    api<Asignacion[]>("/asignaciones"),
    api<Envio[]>("/envios"),
    api<Camion[]>("/camiones"),
    api<Conductor[]>("/conductores"),
    api<Ubicacion[]>("/ubicaciones"),
  ]);
  return { asignaciones, envios, camiones, conductores, ubicaciones };
}

function Tarjetita({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota: string }) {
  return (
    <Tarjeta className="p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{etiqueta}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{valor}</p>
      <p className="text-[11px] text-green-600 dark:text-green-400">{nota}</p>
    </Tarjeta>
  );
}

// ---------- Inicio ----------

export function PersonalInicio({ puedeEjecutar, ir }: { puedeEjecutar: boolean; ir: (ruta: string) => void }) {
  const cargar = useCallback(async () => {
    const [panel, operacion] = await Promise.all([api<Panel>("/panel"), cargarOperacion()]);
    return { panel, ...operacion };
  }, []);
  const { datos, error, cargando, recargar } = useCarga(cargar);
  const [criterio, setCriterio] = useState<Criterio>("distancia");
  const [resultado, setResultado] = useState<ResultadoModelo | null>(null);
  const [ejecutando, setEjecutando] = useState(false);

  async function ejecutarModelo() {
    setEjecutando(true);
    try {
      const r = await api<ResultadoModelo>(`/asignaciones/automatica?criterio=${criterio}`, { metodo: "POST" });
      setResultado(r);
      toast.success(r.mensaje);
      await recargar();
    } catch (err) {
      toast.error(mensaje(err));
    } finally {
      setEjecutando(false);
    }
  }

  const envioPor = datos ? indexar(datos.envios) : new Map<number, Envio>();
  const camionPor = datos ? indexar(datos.camiones) : new Map<number, Camion>();

  return (
    <>
      <Encabezado titulo="Inicio" subtitulo="Resumen de la operación" accion={<BotonRecargar cargando={cargando} onClick={recargar} />} />
      <Contenido>
        {error && <MensajeError texto={error} />}
        {datos && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Tarjetita etiqueta="Envíos pendientes" valor={fmt.num(datos.panel.envios.pendiente ?? 0)} nota="esperando camión" />
              <Tarjetita etiqueta="Camiones libres" valor={fmt.num(datos.panel.camiones.disponible ?? 0)} nota={`de ${datos.camiones.length}`} />
              <Tarjetita etiqueta="Km planificados" valor={fmt.km(datos.panel.km_planificados)} nota="viajes activos" />
              <Tarjetita etiqueta="Costo estimado" valor={fmt.dinero(datos.panel.costo_planificado)} nota="diésel + casetas" />
            </div>

            {puedeEjecutar && (
              <Tarjeta titulo="Modelo de asignación">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Asigna cada envío pendiente al camión más conveniente con la ruta óptima.
                </p>
                <div className="mt-3 flex gap-2">
                  <Selector value={criterio} onChange={e => setCriterio(e.target.value as Criterio)} className="h-10 flex-1">
                    <option value="distancia">Por distancia</option>
                    <option value="tiempo">Por tiempo</option>
                  </Selector>
                  <Button
                    onClick={ejecutarModelo}
                    disabled={ejecutando || !(datos.panel.envios.pendiente ?? 0)}
                    className="h-10 bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Sparkles /> Ejecutar
                  </Button>
                </div>
                {resultado && (
                  <div className="mt-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 p-3 text-sm">
                    <p className="font-medium">{resultado.mensaje}</p>
                    {resultado.no_asignados.map(n => (
                      <p key={n.envio_id} className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        {n.codigo}: {n.motivo}
                      </p>
                    ))}
                  </div>
                )}
              </Tarjeta>
            )}

            <Tarjeta titulo="Últimas asignaciones">
              {datos.asignaciones.length === 0 && <p className="text-sm text-gray-500">Todavía no hay asignaciones.</p>}
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {datos.asignaciones.slice(0, 5).map(a => (
                  <button key={a.id} onClick={() => ir(`asignaciones/${a.id}`)} className="flex w-full items-center justify-between gap-2 py-2.5 text-left">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {envioPor.get(a.envio_id)?.codigo} · {camionPor.get(a.camion_id)?.placa}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {fmt.km(a.distancia_total_km)} · {fmt.dinero(a.costo_estimado)}
                      </p>
                    </div>
                    <Insignia estado={a.estado} />
                  </button>
                ))}
              </div>
            </Tarjeta>
          </>
        )}
      </Contenido>
    </>
  );
}

// ---------- Asignaciones ----------

export function PersonalAsignaciones({ ir }: { ir: (ruta: string) => void }) {
  const { datos, error, cargando, recargar } = useCarga(cargarOperacion);
  const [soloActivas, setSoloActivas] = useState(true);
  const lista = datos?.asignaciones.filter(a => !soloActivas || a.estado === "planificada" || a.estado === "en_curso") ?? [];
  const envioPor = datos ? indexar(datos.envios) : new Map<number, Envio>();
  const camionPor = datos ? indexar(datos.camiones) : new Map<number, Camion>();
  const ubicacionPor = datos ? indexar(datos.ubicaciones) : new Map<number, Ubicacion>();
  const lugar = (id: number | undefined) => (id === undefined ? "—" : (ubicacionPor.get(id)?.nombre ?? "—"));

  return (
    <>
      <Encabezado titulo="Asignaciones" accion={<BotonRecargar cargando={cargando} onClick={recargar} />} />
      <Contenido>
        <div className="flex gap-2">
          {[
            [true, "Activas"],
            [false, "Todas"],
          ].map(([valor, texto]) => (
            <button
              key={String(texto)}
              onClick={() => setSoloActivas(valor as boolean)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium",
                soloActivas === valor
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300",
              )}
            >
              {texto}
            </button>
          ))}
        </div>
        {error && <MensajeError texto={error} />}
        {datos && lista.length === 0 && (
          <Vacio Icon={Sparkles} titulo="Sin asignaciones" texto="Ejecuta el modelo desde Inicio para asignar los envíos pendientes." />
        )}
        {lista.map(a => {
          const envio = envioPor.get(a.envio_id);
          return (
            <button key={a.id} onClick={() => ir(`asignaciones/${a.id}`)} className="block w-full text-left">
              <Tarjeta className="active:bg-gray-50 dark:active:bg-gray-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">
                    {envio?.codigo} <span className="font-normal text-gray-500">· {camionPor.get(a.camion_id)?.placa}</span>
                  </p>
                  <Insignia estado={a.estado} />
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {lugar(envio?.origen_id)} → {lugar(envio?.destino_id)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {fmt.km(a.distancia_total_km)} · {fmt.tiempo(a.tiempo_estimado_min)} · {fmt.dinero(a.costo_estimado)}
                </p>
              </Tarjeta>
            </button>
          );
        })}
      </Contenido>
    </>
  );
}

export function PersonalDetalleAsignacion({ id, puedeEscribir }: { id: string; puedeEscribir: boolean }) {
  const cargar = useCallback(async () => {
    const [asignacion, operacion] = await Promise.all([
      api<Asignacion>(`/asignaciones/${encodeURIComponent(id)}`),
      cargarOperacion(),
    ]);
    return { asignacion, ...operacion };
  }, [id]);
  const { datos, error, recargar } = useCarga(cargar);
  const [ocupado, setOcupado] = useState(false);
  const ruta = useMemo(
    () => (datos ? { vacio: datos.asignacion.ruta_vacio, carga: datos.asignacion.ruta_carga } : null),
    [datos],
  );

  async function accion(nombre: string, texto: string) {
    if (nombre === "cancelar" && !confirm("¿Cancelar esta asignación? El envío regresa a pendientes.")) return;
    setOcupado(true);
    try {
      await api(`/asignaciones/${id}/${nombre}`, { metodo: "POST" });
      toast.success(texto);
      await recargar();
    } catch (err) {
      toast.error(mensaje(err));
    } finally {
      setOcupado(false);
    }
  }

  const a = datos?.asignacion;
  const envio = a && datos ? datos.envios.find(e => e.id === a.envio_id) : undefined;
  const camion = a && datos ? datos.camiones.find(c => c.id === a.camion_id) : undefined;
  const conductor = a && datos ? datos.conductores.find(c => c.id === a.conductor_id) : undefined;
  const lugar = (ubicacionId: number) => datos?.ubicaciones.find(u => u.id === ubicacionId)?.nombre ?? "—";
  const activa = a?.estado === "planificada" || a?.estado === "en_curso";

  return (
    <>
      <Encabezado titulo={envio ? `Asignación ${envio.codigo}` : "Asignación"} atras />
      <Contenido conBarraAccion={puedeEscribir && activa}>
        {error && <MensajeError texto={error} />}
        {a && datos && ruta && (
          <>
            <Tarjeta>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-bold">{envio?.codigo}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{envio?.cliente}</p>
                </div>
                <Insignia estado={a.estado} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Dato etiqueta="Camión" valor={camion?.placa ?? "—"} />
                <Dato etiqueta="Conductor" valor={conductor?.nombre ?? "—"} />
                <Dato etiqueta="Distancia" valor={fmt.km(a.distancia_total_km)} />
                <Dato etiqueta="Costo" valor={fmt.dinero(a.costo_estimado)} />
              </div>
              <p className="mt-3 text-sm">
                <span className="text-amber-600">En vacío:</span>{" "}
                {a.ruta_vacio.length > 1 ? a.ruta_vacio.map(lugar).join(" → ") : "ya está en el origen"}
              </p>
              <p className="mt-1 text-sm">
                <span className="text-blue-600">Con carga:</span> {a.ruta_carga.map(lugar).join(" → ")}
              </p>
            </Tarjeta>
            <section className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <Mapa ubicaciones={datos.ubicaciones} tramos={SIN_TRAMOS} ruta={ruta} className="h-72" />
            </section>
            {puedeEscribir && activa && (
              <BarraAccion>
                {a.estado === "planificada" ? (
                  <>
                    <Button className="h-11 flex-1 bg-blue-600 text-white hover:bg-blue-700" disabled={ocupado} onClick={() => accion("iniciar", "Viaje iniciado")}>
                      <Play /> Iniciar
                    </Button>
                    <Button variant="outline" className="h-11" disabled={ocupado} onClick={() => accion("recalcular", "Ruta recalculada")} aria-label="Recalcular ruta">
                      <RotateCw />
                    </Button>
                  </>
                ) : (
                  <Button className="h-11 flex-1 bg-green-600 text-white hover:bg-green-700" disabled={ocupado} onClick={() => accion("completar", "Entrega registrada")}>
                    <CircleCheck /> Completar
                  </Button>
                )}
                <Button variant="outline" className="h-11 text-red-600" disabled={ocupado} onClick={() => accion("cancelar", "Asignación cancelada")} aria-label="Cancelar">
                  <X />
                </Button>
              </BarraAccion>
            )}
          </>
        )}
      </Contenido>
    </>
  );
}

// ---------- Envíos ----------

const cargarEnvios = async () => {
  const [envios, ubicaciones] = await Promise.all([api<Envio[]>("/envios"), api<Ubicacion[]>("/ubicaciones")]);
  return { envios, ubicaciones };
};

export function PersonalEnvios({ puedeCrear, ir }: { puedeCrear: boolean; ir: (ruta: string) => void }) {
  const { datos, error, cargando, recargar } = useCarga(cargarEnvios);
  const [filtro, setFiltro] = useState("");
  const lugar = (id: number) => datos?.ubicaciones.find(u => u.id === id)?.nombre ?? "—";
  const busqueda = filtro.trim().toLowerCase();
  const lista = (datos?.envios ?? [])
    .filter(e => !busqueda || `${e.codigo} ${e.cliente} ${lugar(e.origen_id)} ${lugar(e.destino_id)}`.toLowerCase().includes(busqueda))
    .sort((a, b) => Number(b.estado === "pendiente") - Number(a.estado === "pendiente") || b.prioridad - a.prioridad);

  return (
    <>
      <Encabezado titulo="Envíos" accion={<BotonRecargar cargando={cargando} onClick={recargar} />} />
      <Contenido>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar envío, cliente o ciudad…" className="h-10 pl-9" />
        </div>
        {error && <MensajeError texto={error} />}
        {datos && lista.length === 0 && <Vacio Icon={Package} titulo="Sin envíos" texto="No hay envíos que coincidan." />}
        {lista.map(e => (
          <Tarjeta key={e.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{e.codigo}</p>
              <div className="flex gap-1">
                <Insignia texto={PRIORIDADES[e.prioridad]} color={COLOR_PRIORIDAD[e.prioridad]} />
                <Insignia estado={e.estado} />
              </div>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{e.cliente}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {lugar(e.origen_id)} → {lugar(e.destino_id)} · {fmt.kg(e.peso_kg)}
              {e.fecha_limite && ` · antes del ${fmt.fecha(e.fecha_limite)}`}
            </p>
          </Tarjeta>
        ))}
      </Contenido>
      {puedeCrear && (
        <button
          onClick={() => ir("envios/nuevo")}
          aria-label="Nuevo envío"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] right-4 z-20 grid size-14 place-content-center rounded-full bg-blue-600 text-white shadow-lg active:bg-blue-700"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </>
  );
}

const cargarUbicaciones = () => api<Ubicacion[]>("/ubicaciones");

export function PersonalNuevoEnvio() {
  const { datos: ubicaciones, error } = useCarga(cargarUbicaciones);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    setGuardando(true);
    setErrorForm("");
    try {
      await api("/envios", {
        metodo: "POST",
        datos: {
          codigo: `ENV-${String(Date.now()).slice(-5)}`,
          cliente: f.get("cliente"),
          descripcion: f.get("descripcion") || null,
          origen_id: Number(f.get("origen")),
          destino_id: Number(f.get("destino")),
          peso_kg: Number(f.get("peso")),
          prioridad: Number(f.get("prioridad")),
          fecha_limite: f.get("fecha") || null,
        },
      });
      toast.success("Envío registrado");
      history.back();
    } catch (err) {
      setErrorForm(mensaje(err));
    } finally {
      setGuardando(false);
    }
  }

  const opciones = (ubicaciones ?? []).map(u => (
    <option key={u.id} value={u.id}>{u.nombre}</option>
  ));
  return (
    <>
      <Encabezado titulo="Nuevo envío" atras />
      <Contenido>
        {error && <MensajeError texto={error} />}
        <form onSubmit={guardar} className="space-y-4">
          <Tarjeta className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="cliente">Cliente *</Label>
              <Input id="cliente" name="cliente" required className="h-10" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="descripcion">¿Qué se envía?</Label>
              <Input id="descripcion" name="descripcion" className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="origen">Origen *</Label>
                <Selector id="origen" name="origen" required defaultValue="" className="h-10">
                  <option value="" disabled>Elige…</option>
                  {opciones}
                </Selector>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="destino">Destino *</Label>
                <Selector id="destino" name="destino" required defaultValue="" className="h-10">
                  <option value="" disabled>Elige…</option>
                  {opciones}
                </Selector>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="peso">Peso (kg) *</Label>
                <Input id="peso" name="peso" type="number" inputMode="decimal" min={1} step="any" required className="h-10" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prioridad">Prioridad</Label>
                <Selector id="prioridad" name="prioridad" defaultValue="2" className="h-10">
                  {Object.entries(PRIORIDADES).map(([v, t]) => (
                    <option key={v} value={v}>{t}</option>
                  ))}
                </Selector>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fecha">Fecha límite</Label>
              <Input id="fecha" name="fecha" type="date" className="h-10" />
            </div>
          </Tarjeta>
          {errorForm && <MensajeError texto={errorForm} />}
          <Button type="submit" disabled={guardando} className="h-12 w-full bg-blue-600 text-base text-white hover:bg-blue-700">
            {guardando ? "Guardando…" : "Registrar envío"}
          </Button>
        </form>
      </Contenido>
    </>
  );
}

// ---------- Flota ----------

const cargarFlota = async () => {
  const [camiones, conductores, ubicaciones, tramos, posiciones] = await Promise.all([
    api<Camion[]>("/camiones"),
    api<Conductor[]>("/conductores"),
    api<Ubicacion[]>("/ubicaciones"),
    api<Tramo[]>("/tramos"),
    api<Posicion[]>("/posiciones"),
  ]);
  return { camiones, conductores, ubicaciones, tramos, posiciones };
};

export function PersonalFlota() {
  const { datos, error, cargando, recargar } = useCarga(cargarFlota);
  const posicionPor = new Map((datos?.posiciones ?? []).map(p => [p.camion_id, p]));
  return (
    <>
      <Encabezado titulo="Flota" subtitulo="Camiones y ubicación GPS" accion={<BotonRecargar cargando={cargando} onClick={recargar} />} />
      <Contenido>
        {error && <MensajeError texto={error} />}
        {datos && (
          <>
            <section className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <Mapa
                ubicaciones={datos.ubicaciones}
                tramos={datos.tramos}
                camiones={datos.camiones}
                posiciones={datos.posiciones}
                className="h-72"
              />
            </section>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Los puntos verdes son la última ubicación que mandó la app de cada conductor.
            </p>
            {datos.camiones.map(c => {
              const gps = posicionPor.get(c.id);
              return (
                <Tarjeta key={c.id}>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-900/30 p-2.5">
                      <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{c.placa}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {datos.conductores.find(x => x.id === c.conductor_id)?.nombre ?? "Sin conductor"} ·{" "}
                        {datos.ubicaciones.find(u => u.id === c.ubicacion_id)?.nombre ?? "—"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {gps ? `GPS ${fmt.haceCuanto(gps.registrado_en)}` : "Sin GPS reportado"}
                      </p>
                    </div>
                    <Insignia estado={c.estado} />
                  </div>
                </Tarjeta>
              );
            })}
          </>
        )}
      </Contenido>
    </>
  );
}
