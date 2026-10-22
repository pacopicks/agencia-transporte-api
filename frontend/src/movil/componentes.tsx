// Piezas de la app móvil: encabezado, barra de pestañas, tarjetas y utilidades.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, RefreshCw, type LucideIcon } from "lucide-react";
import { mensaje } from "@/lib/api";
import type { Ubicacion } from "@/lib/tipos";
import { cn } from "@/lib/utils";

/** Carga datos al montar la vista y permite recargarlos. `cargar` debe ser estable (useCallback). */
export function useCarga<T>(cargar: () => Promise<T>) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await cargar());
      setError("");
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setCargando(false);
    }
  }, [cargar]);
  useEffect(() => {
    recargar();
  }, [recargar]);
  return { datos, error, cargando, recargar };
}

export function Encabezado({
  titulo,
  subtitulo,
  atras,
  accion,
}: {
  titulo: string;
  subtitulo?: string;
  atras?: boolean;
  accion?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
      {atras && (
        <button
          onClick={() => history.back()}
          aria-label="Regresar"
          className="-ml-2 rounded-lg p-2 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{titulo}</h1>
        {subtitulo && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{subtitulo}</p>}
      </div>
      {accion}
    </header>
  );
}

export function BotonRecargar({ cargando, onClick }: { cargando: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Actualizar"
      className="rounded-lg p-2 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800"
    >
      <RefreshCw className={cn("h-5 w-5", cargando && "animate-spin")} />
    </button>
  );
}

export interface Pestana {
  id: string;
  titulo: string;
  Icon: LucideIcon;
  insignia?: number;
}

export function BarraPestanas({
  pestanas,
  actual,
  onCambiar,
}: {
  pestanas: Pestana[];
  actual: string;
  onCambiar: (id: string) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg">
        {pestanas.map(({ id, titulo, Icon, insignia }) => (
          <button
            key={id}
            onClick={() => onCambiar(id)}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              id === actual ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400",
            )}
          >
            <Icon className="h-5 w-5" />
            {titulo}
            {insignia ? (
              <span className="absolute left-[calc(50%+6px)] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] text-white">
                {insignia}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function Contenido({ children, conBarraAccion }: { children: ReactNode; conBarraAccion?: boolean }) {
  return (
    <main className={cn("mx-auto max-w-lg space-y-4 p-4", conBarraAccion ? "pb-44" : "pb-28")}>{children}</main>
  );
}

export function Tarjeta({ titulo, children, className }: { titulo?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm",
        className,
      )}
    >
      {titulo && <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</h2>}
      {children}
    </section>
  );
}

/** Barra fija sobre las pestañas con la acción principal de la pantalla. */
export function BarraAccion({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+58px)] z-20 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 p-3 backdrop-blur">
      <div className="mx-auto flex max-w-lg gap-2">{children}</div>
    </div>
  );
}

export function Vacio({ Icon, titulo, texto, children }: { Icon: LucideIcon; titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="rounded-2xl bg-blue-50 dark:bg-blue-900/30 p-4">
        <Icon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
      </div>
      <p className="font-semibold text-gray-900 dark:text-gray-100">{titulo}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{texto}</p>
      {children}
    </div>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-950 px-3 py-2">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{etiqueta}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{valor}</p>
    </div>
  );
}

/** Abre la ruta en Google Maps para navegar (sin origen: Google usa la ubicación actual del teléfono). */
export function enlaceGoogleMaps(ubicaciones: Ubicacion[], vacio: number[], carga: number[]) {
  const porId = new Map(ubicaciones.map(u => [u.id, u]));
  const recorrido = [...vacio, ...carga.slice(1)].slice(1); // sin el punto de partida del camión
  const coordenadas = recorrido.flatMap(id => {
    const u = porId.get(id);
    return u ? [`${u.latitud},${u.longitud}`] : [];
  });
  const destino = coordenadas.pop();
  const params = new URLSearchParams({ api: "1", destination: destino ?? "", travelmode: "driving" });
  if (coordenadas.length) params.set("waypoints", coordenadas.join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}
