// Tablero principal, con el mismo diseño del componente de ejemplo pero con datos reales.
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CircleCheck,
  CircleX,
  DollarSign,
  Package,
  Route,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Cargando, Insignia, MensajeError } from "@/components/comunes";
import { api, mensaje } from "@/lib/api";
import { COLOR_PRIORIDAD, PRIORIDADES, fmt, indexar } from "@/lib/formato";
import type { Asignacion, Camion, Envio, Panel, Ubicacion } from "@/lib/tipos";

type Tono = "blue" | "green" | "purple" | "orange" | "red";

const TONOS: Record<Tono, { fondo: string; texto: string; barra: string }> = {
  blue: { fondo: "bg-blue-50 dark:bg-blue-900/20", texto: "text-blue-600 dark:text-blue-400", barra: "bg-blue-500" },
  green: { fondo: "bg-green-50 dark:bg-green-900/20", texto: "text-green-600 dark:text-green-400", barra: "bg-green-500" },
  purple: { fondo: "bg-purple-50 dark:bg-purple-900/20", texto: "text-purple-600 dark:text-purple-400", barra: "bg-purple-500" },
  orange: { fondo: "bg-orange-50 dark:bg-orange-900/20", texto: "text-orange-600 dark:text-orange-400", barra: "bg-orange-500" },
  red: { fondo: "bg-red-50 dark:bg-red-900/20", texto: "text-red-600 dark:text-red-400", barra: "bg-red-500" },
};

interface Datos {
  panel: Panel;
  asignaciones: Asignacion[];
  envios: Envio[];
  camiones: Camion[];
  ubicaciones: Ubicacion[];
}

interface Evento {
  fecha: string;
  Icon: LucideIcon;
  tono: Tono;
  titulo: string;
  desc: string;
}

export function Inicio({ ir }: { ir: (vista: string) => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<Panel>("/panel"),
      api<Asignacion[]>("/asignaciones"),
      api<Envio[]>("/envios"),
      api<Camion[]>("/camiones"),
      api<Ubicacion[]>("/ubicaciones"),
    ])
      .then(([panel, asignaciones, envios, camiones, ubicaciones]) =>
        setDatos({ panel, asignaciones, envios, camiones, ubicaciones }),
      )
      .catch(err => setError(mensaje(err)));
  }, []);

  if (error) return <MensajeError texto={error} />;
  if (!datos) return <Cargando />;

  const { panel, asignaciones, envios, camiones, ubicaciones } = datos;
  const lugar = (id: number | null) => (id === null ? "—" : (indexar(ubicaciones).get(id)?.nombre ?? "—"));
  const envioPor = indexar(envios);
  const camionPor = indexar(camiones);
  const pendientes = envios.filter(e => e.estado === "pendiente");
  const enProceso = (panel.envios.asignado ?? 0) + (panel.envios.en_transito ?? 0);
  const activas = asignaciones.filter(a => a.estado === "planificada" || a.estado === "en_curso");
  const ocupados = camiones.filter(c => c.estado === "asignado" || c.estado === "en_ruta").length;
  const entregados = panel.envios.entregado ?? 0;
  const conViaje = asignaciones.filter(a => a.estado !== "cancelada");
  const kmVacio = conViaje.reduce((s, a) => s + a.distancia_vacio_km, 0);
  const kmTotal = conViaje.reduce((s, a) => s + a.distancia_total_km, 0);
  const porcentaje = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

  const tarjetas: { titulo: string; valor: string; nota: string; Icon: LucideIcon; tono: Tono; destino: string }[] = [
    { titulo: "Envíos pendientes", valor: fmt.num(pendientes.length), nota: `${enProceso} en proceso`, Icon: Package, tono: "blue", destino: "envios" },
    { titulo: "Camiones disponibles", valor: fmt.num(panel.camiones.disponible ?? 0), nota: `de ${camiones.length} en la flota`, Icon: Truck, tono: "green", destino: "camiones" },
    { titulo: "Km planificados", valor: fmt.km(panel.km_planificados), nota: `${activas.length} asignaciones activas`, Icon: Route, tono: "purple", destino: "asignaciones" },
    { titulo: "Costo estimado", valor: fmt.dinero(panel.costo_planificado), nota: "diésel + casetas", Icon: DollarSign, tono: "orange", destino: "asignaciones" },
  ];

  const eventos: Evento[] = [
    ...asignaciones.map((a): Evento => {
      const e = envioPor.get(a.envio_id);
      const placa = camionPor.get(a.camion_id)?.placa ?? "";
      const codigo = e?.codigo ?? `#${a.envio_id}`;
      const fecha = a.actualizado_en ?? a.creado_en;
      const destino = lugar(e?.destino_id ?? null);
      switch (a.estado) {
        case "en_curso":
          return { fecha, Icon: Truck, tono: "purple", titulo: `${codigo} va en camino`, desc: `Camión ${placa} rumbo a ${destino}` };
        case "completada":
          return { fecha, Icon: CircleCheck, tono: "green", titulo: `${codigo} entregado`, desc: `En ${destino} por el camión ${placa}` };
        case "cancelada":
          return { fecha, Icon: CircleX, tono: "red", titulo: `Asignación de ${codigo} cancelada`, desc: "El envío regresó a pendientes" };
        default:
          return {
            fecha, Icon: Route, tono: "blue", titulo: `${codigo} asignado al camión ${placa}`,
            desc: `${lugar(e?.origen_id ?? null)} → ${destino} · ${fmt.km(a.distancia_total_km)}`,
          };
      }
    }),
    ...pendientes.map((e): Evento => ({
      fecha: e.creado_en, Icon: Package, tono: "orange", titulo: `Nuevo envío ${e.codigo}`,
      desc: `${e.cliente} · ${fmt.kg(e.peso_kg)}`,
    })),
  ]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 6);

  const estadisticas: { titulo: string; valor: number; tono: Tono; ayuda: string }[] = [
    { titulo: "Uso de la flota", valor: porcentaje(ocupados, camiones.length), tono: "blue", ayuda: `${ocupados} de ${camiones.length} camiones trabajando` },
    { titulo: "Envíos entregados", valor: porcentaje(entregados, envios.length), tono: "green", ayuda: `${entregados} de ${envios.length} envíos` },
    { titulo: "Km recorridos en vacío", valor: porcentaje(kmVacio, kmTotal), tono: "orange", ayuda: "Menos es mejor: el modelo lo minimiza" },
  ];

  const urgentes = [...pendientes].sort((a, b) => b.prioridad - a.prioridad || a.id - b.id).slice(0, 5);

  return (
    <>
      {/* Tarjetas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {tarjetas.map(({ titulo, valor, nota, Icon, tono, destino }) => (
          <button
            key={titulo}
            onClick={() => ir(destino)}
            className="text-left p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${TONOS[tono].fondo}`}>
                <Icon className={`h-5 w-5 ${TONOS[tono].texto}`} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </div>
            <h3 className="font-medium text-gray-600 dark:text-gray-400 mb-1">{titulo}</h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{valor}</p>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">{nota}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Actividad reciente */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Actividad reciente</h3>
              <button
                onClick={() => ir("asignaciones")}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                Ver todo
              </button>
            </div>
            <div className="space-y-4">
              {eventos.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay actividad.</p>
              )}
              {eventos.map((evento, i) => (
                <div
                  key={i}
                  className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className={`p-2 rounded-lg ${TONOS[evento.tono].fondo}`}>
                    <evento.Icon className={`h-4 w-4 ${TONOS[evento.tono].texto}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{evento.titulo}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{evento.desc}</p>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {fmt.haceCuanto(evento.fecha)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Estadísticas rápidas */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Estadísticas rápidas</h3>
            <div className="space-y-4">
              {estadisticas.map(({ titulo, valor, tono, ayuda }) => (
                <div key={titulo} title={ayuda}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{titulo}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{valor}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className={`${TONOS[tono].barra} h-2 rounded-full`} style={{ width: `${valor}%` }}></div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{ayuda}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Envíos por atender */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Pendientes por atender</h3>
            <div className="space-y-3">
              {urgentes.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Todos los envíos ya tienen camión.</p>
              )}
              {urgentes.map(e => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{e.codigo}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {lugar(e.origen_id)} → {lugar(e.destino_id)} · {fmt.kg(e.peso_kg)}
                    </p>
                  </div>
                  <Insignia texto={PRIORIDADES[e.prioridad]} color={COLOR_PRIORIDAD[e.prioridad]} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
