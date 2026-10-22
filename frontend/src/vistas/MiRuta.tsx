// Vista para usuarios con rol "conductor": solo ven la ruta de SU camión (GET /api/rutas/mi-ruta).
import { useEffect, useMemo, useState } from "react";
import { Cargando, Insignia, MensajeError, Tarjeta } from "@/components/comunes";
import { Mapa } from "@/components/Mapa";
import { api, mensaje } from "@/lib/api";
import { fmt } from "@/lib/formato";
import type { RutaCamion, Tramo } from "@/lib/tipos";

const SIN_TRAMOS: Tramo[] = [];

export function MiRuta() {
  const [ruta, setRuta] = useState<RutaCamion | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<RutaCamion>("/rutas/mi-ruta").then(setRuta).catch(err => setError(mensaje(err)));
  }, []);

  const rutaMapa = useMemo(() => (ruta ? { vacio: ruta.ruta_vacio, carga: ruta.ruta_carga } : null), [ruta]);

  if (error) return <MensajeError texto={error} />;
  if (!ruta) return <Cargando />;

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] items-start">
      <Tarjeta titulo={`Camión ${ruta.placa}`} accion={<Insignia estado={ruta.estado} />}>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envío <strong>{ruta.envio}</strong> · {fmt.km(ruta.distancia_total_km)} · {fmt.tiempo(ruta.tiempo_estimado_min)}
        </p>
        <ol className="mt-4 space-y-3">
          {ruta.pasos.map((p, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span
                className={`grid size-6 shrink-0 place-content-center rounded-full text-xs font-semibold ${
                  p.etapa === "vacio"
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                }`}
              >
                {i + 1}
              </span>
              <div>
                {p.desde} → <strong>{p.hasta}</strong>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {p.etapa === "vacio" ? "Sin carga" : "Con carga"} · {fmt.km(p.distancia_km)} · {fmt.tiempo(p.tiempo_min)}
                  {!p.abierto && " · ⚠ tramo cerrado"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Tarjeta>
      <Tarjeta className="p-0 overflow-hidden">
        <Mapa ubicaciones={ruta.ubicaciones} tramos={SIN_TRAMOS} ruta={rutaMapa} />
      </Tarjeta>
    </div>
  );
}
