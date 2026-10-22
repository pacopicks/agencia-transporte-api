import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CircleCheck, Play, RotateCw, Sparkles, Trash2, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Cargando, Insignia, MensajeError, Selector, Tarjeta } from "@/components/comunes";
import { Mapa } from "@/components/Mapa";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, mensaje } from "@/lib/api";
import { fmt, indexar, textoEstado } from "@/lib/formato";
import type { Asignacion, Camion, Conductor, Criterio, Envio, ResultadoModelo, Tramo, Ubicacion } from "@/lib/tipos";

interface Datos {
  asignaciones: Asignacion[];
  envios: Envio[];
  camiones: Camion[];
  conductores: Conductor[];
  ubicaciones: Ubicacion[];
  tramos: Tramo[];
}

// [acción en la API, texto, ícono, ¿solo ícono?, ¿peligrosa?]
type Accion = [string, string, LucideIcon, boolean, boolean];
const INICIAR: Accion = ["iniciar", "Iniciar", Play, false, false];
const COMPLETAR: Accion = ["completar", "Completar", CircleCheck, false, false];
const RECALCULAR: Accion = ["recalcular", "Recalcular ruta", RotateCw, true, false];
const CANCELAR: Accion = ["cancelar", "Cancelar", X, true, true];
const ELIMINAR: Accion = ["eliminar", "Eliminar", Trash2, true, true];
const ACCIONES: Record<string, Accion[]> = {
  planificada: [INICIAR, RECALCULAR, CANCELAR],
  en_curso: [COMPLETAR, CANCELAR],
  completada: [ELIMINAR],
  cancelada: [ELIMINAR],
};

export function Asignaciones({ puedeEscribir, onCambio }: { puedeEscribir: boolean; onCambio: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<ResultadoModelo | null>(null);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [filtro, setFiltro] = useState("");
  const [criterio, setCriterio] = useState<Criterio>("distancia");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const [asignaciones, envios, camiones, conductores, ubicaciones, tramos] = await Promise.all([
      api<Asignacion[]>("/asignaciones"),
      api<Envio[]>("/envios"),
      api<Camion[]>("/camiones"),
      api<Conductor[]>("/conductores"),
      api<Ubicacion[]>("/ubicaciones"),
      api<Tramo[]>("/tramos"),
    ]);
    setDatos({ asignaciones, envios, camiones, conductores, ubicaciones, tramos });
  }, []);

  useEffect(() => {
    cargar().catch(err => setError(mensaje(err)));
  }, [cargar]);

  const seleccionada = datos?.asignaciones.find(a => a.id === seleccion) ?? null;
  const rutaMapa = useMemo(
    () => (seleccionada ? { vacio: seleccionada.ruta_vacio, carga: seleccionada.ruta_carga } : null),
    [seleccionada],
  );

  if (error) return <MensajeError texto={error} />;
  if (!datos) return <Cargando />;

  const { asignaciones, envios, camiones, conductores, ubicaciones, tramos } = datos;
  const envioPor = indexar(envios);
  const camionPor = indexar(camiones);
  const conductorPor = indexar(conductores);
  const ubicacionPor = indexar(ubicaciones);
  const lugar = (id: number | null | undefined) => (id == null ? "—" : (ubicacionPor.get(id)?.nombre ?? "—"));
  const pendientes = envios.filter(e => e.estado === "pendiente");
  const listos = camiones.filter(
    c => c.estado === "disponible" && c.conductor_id !== null && conductorPor.get(c.conductor_id)?.activo,
  );
  const filas = asignaciones.filter(a => !filtro || a.estado === filtro);

  async function ejecutar(accion: () => Promise<unknown>, exito: string) {
    setOcupado(true);
    try {
      await accion();
      toast.success(exito);
      await cargar();
      onCambio();
    } catch (err) {
      toast.error(mensaje(err));
    } finally {
      setOcupado(false);
    }
  }

  const correrModelo = () =>
    ejecutar(async () => {
      const r = await api<ResultadoModelo>(`/asignaciones/automatica?criterio=${criterio}`, { metodo: "POST" });
      setResultado(r);
    }, "Modelo ejecutado");

  function asignarManual(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    ejecutar(
      () =>
        api("/asignaciones", {
          metodo: "POST",
          datos: { envio_id: Number(form.get("envio")), camion_id: Number(form.get("camion")), criterio },
        }),
      "Envío asignado",
    );
  }

  function accionFila(a: Asignacion, accion: string, texto: string) {
    if ((accion === "cancelar" || accion === "eliminar") && !confirm(`¿Seguro que quieres ${accion} la asignación #${a.id}?`)) return;
    ejecutar(
      () =>
        accion === "eliminar"
          ? api(`/asignaciones/${a.id}`, { metodo: "DELETE" })
          : api(`/asignaciones/${a.id}/${accion}`, { metodo: "POST" }),
      `Asignación #${a.id}: ${texto.toLowerCase()}`,
    );
    if (accion === "eliminar" && seleccion === a.id) setSeleccion(null);
  }

  return (
    <div className="space-y-6">
      {puedeEscribir && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Tarjeta titulo="Modelo de asignación automática">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Para cada envío pendiente calcula con <strong>Dijkstra</strong> la ruta óptima de cada camión disponible
              (camión → origen → destino), estima el costo (diésel + casetas) y elige la combinación más barata con el{" "}
              <strong>método húngaro</strong>, dando preferencia a los envíos urgentes.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Selector value={criterio} onChange={e => setCriterio(e.target.value as Criterio)} className="w-auto">
                <option value="distancia">Optimizar distancia</option>
                <option value="tiempo">Optimizar tiempo</option>
              </Selector>
              <Button onClick={correrModelo} disabled={ocupado || !pendientes.length} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Sparkles /> Ejecutar modelo
              </Button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {pendientes.length} envíos pendientes · {listos.length} camiones listos
              </span>
            </div>
            {resultado && (
              <div className="mt-4 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-4 text-sm">
                <p>
                  <strong>{resultado.mensaje}</strong> Costo total estimado: <strong>{fmt.dinero(resultado.costo_total)}</strong>
                </p>
                {resultado.asignaciones.length > 0 && (
                  <ul className="mt-2 list-disc pl-5">
                    {resultado.asignaciones.map(a => (
                      <li key={a.id}>
                        {envioPor.get(a.envio_id)?.codigo} → camión {camionPor.get(a.camion_id)?.placa} ·{" "}
                        {fmt.km(a.distancia_total_km)} · {fmt.dinero(a.costo_estimado)}
                      </li>
                    ))}
                  </ul>
                )}
                {resultado.no_asignados.length > 0 && (
                  <>
                    <p className="mt-3 text-gray-600 dark:text-gray-400">Quedaron pendientes:</p>
                    <ul className="mt-1 list-disc pl-5 text-amber-700 dark:text-amber-300">
                      {resultado.no_asignados.map(n => (
                        <li key={n.envio_id}>
                          <strong>{n.codigo}</strong>: {n.motivo}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Asignación manual">
            <p className="text-sm text-gray-600 dark:text-gray-400">Tú eliges el camión y el sistema calcula la ruta óptima.</p>
            <form onSubmit={asignarManual} className="mt-4 grid gap-3">
              <Selector name="envio" required defaultValue="">
                <option value="" disabled>Envío pendiente…</option>
                {pendientes.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.codigo} · {lugar(e.origen_id)} → {lugar(e.destino_id)} · {fmt.kg(e.peso_kg)}
                  </option>
                ))}
              </Selector>
              <Selector name="camion" required defaultValue="">
                <option value="" disabled>Camión disponible…</option>
                {listos.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.placa} · {fmt.kg(c.capacidad_kg)} · en {lugar(c.ubicacion_id)}
                  </option>
                ))}
              </Selector>
              <Button type="submit" variant="outline" disabled={ocupado}>
                <Play /> Asignar
              </Button>
            </form>
          </Tarjeta>
        </div>
      )}

      <Tarjeta
        titulo="Asignaciones"
        accion={
          <Selector value={filtro} onChange={e => setFiltro(e.target.value)} className="w-auto">
            <option value="">Todas</option>
            {["planificada", "en_curso", "completada", "cancelada"].map(e => (
              <option key={e} value={e}>{textoEstado(e)}</option>
            ))}
          </Selector>
        }
        className="p-0 [&>div:first-child]:px-6 [&>div:first-child]:pt-6"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">#</TableHead>
              <TableHead>Envío</TableHead>
              <TableHead>Camión</TableHead>
              <TableHead>Conductor</TableHead>
              <TableHead>Ruta</TableHead>
              <TableHead className="text-right">Distancia</TableHead>
              <TableHead className="text-right">Tiempo</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead>Estado</TableHead>
              {puedeEscribir && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-gray-500">
                  No hay asignaciones. Ejecuta el modelo para crear algunas.
                </TableCell>
              </TableRow>
            )}
            {filas.map(a => {
              const envio = envioPor.get(a.envio_id);
              const tramosRuta = [a.ruta_vacio.length > 1 ? a.ruta_vacio[0] : null, a.ruta_carga[0], a.ruta_carga.at(-1)];
              return (
                <TableRow
                  key={a.id}
                  onClick={() => setSeleccion(a.id)}
                  data-state={seleccion === a.id ? "selected" : undefined}
                  className="cursor-pointer"
                >
                  <TableCell className="pl-6">{a.id}</TableCell>
                  <TableCell>
                    <p className="font-medium">{envio?.codigo}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{envio?.cliente}</p>
                  </TableCell>
                  <TableCell>{camionPor.get(a.camion_id)?.placa}</TableCell>
                  <TableCell>{a.conductor_id ? conductorPor.get(a.conductor_id)?.nombre : "—"}</TableCell>
                  <TableCell className="whitespace-normal min-w-40">
                    {tramosRuta.filter(id => id != null).map(lugar).join(" → ")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.km(a.distancia_total_km)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.tiempo(a.tiempo_estimado_min)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.dinero(a.costo_estimado)}</TableCell>
                  <TableCell><Insignia estado={a.estado} /></TableCell>
                  {puedeEscribir && (
                    <TableCell className="pr-6 text-right space-x-1" onClick={e => e.stopPropagation()}>
                      {ACCIONES[a.estado].map(([accion, texto, Icono, soloIcono, peligrosa]) => (
                        <Button
                          key={accion}
                          size={soloIcono ? "icon-sm" : "sm"}
                          variant={soloIcono ? "ghost" : "outline"}
                          title={texto}
                          disabled={ocupado}
                          onClick={() => accionFila(a, accion, texto)}
                          className={peligrosa ? "text-red-600 hover:text-red-700 dark:text-red-400" : ""}
                        >
                          <Icono /> {!soloIcono && texto}
                        </Button>
                      ))}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <Tarjeta className="p-0 overflow-hidden">
          <Mapa ubicaciones={ubicaciones} tramos={tramos} ruta={rutaMapa} />
        </Tarjeta>
        <Tarjeta titulo="Detalle de la ruta">
          {!seleccionada ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Haz clic en una asignación para verla en el mapa.</p>
          ) : (
            <DetalleRuta
              a={seleccionada}
              envio={envioPor.get(seleccionada.envio_id)}
              placa={camionPor.get(seleccionada.camion_id)?.placa ?? ""}
              conductor={seleccionada.conductor_id ? conductorPor.get(seleccionada.conductor_id)?.nombre : undefined}
              lugar={lugar}
            />
          )}
        </Tarjeta>
      </div>
    </div>
  );
}

function DetalleRuta({
  a,
  envio,
  placa,
  conductor,
  lugar,
}: {
  a: Asignacion;
  envio: Envio | undefined;
  placa: string;
  conductor: string | undefined;
  lugar: (id: number) => string;
}) {
  const nombres = (ids: number[]) => ids.map(lugar).join(" → ");
  const filas: [ReactNode, ReactNode][] = [
    [
      <><span className="inline-block w-5 border-t-4 border-dashed border-amber-600" /> En vacío</>,
      a.ruta_vacio.length > 1 ? <>{nombres(a.ruta_vacio)}<br /><small>{fmt.km(a.distancia_vacio_km)}</small></> : "Ya está en el origen",
    ],
    [
      <><span className="inline-block w-5 border-t-4 border-blue-600" /> Con carga</>,
      <>{nombres(a.ruta_carga)}<br /><small>{fmt.km(a.distancia_carga_km)} · {fmt.kg(envio?.peso_kg ?? 0)}</small></>,
    ],
    ["Conductor", conductor ?? "—"],
    ["Tiempo", fmt.tiempo(a.tiempo_estimado_min)],
    ["Casetas", fmt.dinero(a.peajes)],
    ["Costo total", <strong>{fmt.dinero(a.costo_estimado)}</strong>],
  ];
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{envio?.codigo} · camión {placa}</span>
        <Insignia estado={a.estado} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
        {filas.map(([titulo, valor], i) => (
          <div key={i} className="contents">
            <dt className="flex items-center gap-2 text-gray-500 dark:text-gray-400">{titulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-gray-500 dark:text-gray-400">Optimizado por {a.criterio}.</p>
    </div>
  );
}
