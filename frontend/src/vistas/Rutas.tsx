import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Calculator } from "lucide-react";
import { Cargando, MensajeError, Selector, Tarjeta } from "@/components/comunes";
import { Mapa } from "@/components/Mapa";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, mensaje } from "@/lib/api";
import { fmt } from "@/lib/formato";
import type { Camion, Criterio, Posicion, RutaOptima, Tramo, Ubicacion } from "@/lib/tipos";

interface Datos {
  ubicaciones: Ubicacion[];
  tramos: Tramo[];
  camiones: Camion[];
  posiciones: Posicion[];
}

export function Rutas({ ir }: { ir: (vista: string) => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [ruta, setRuta] = useState<RutaOptima | null>(null);
  const [errorRuta, setErrorRuta] = useState("");
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    Promise.all([
      api<Ubicacion[]>("/ubicaciones"),
      api<Tramo[]>("/tramos"),
      api<Camion[]>("/camiones"),
      api<Posicion[]>("/posiciones"),
    ])
      .then(([ubicaciones, tramos, camiones, posiciones]) => setDatos({ ubicaciones, tramos, camiones, posiciones }))
      .catch(err => setError(mensaje(err)));
  }, []);

  const rutaMapa = useMemo(() => (ruta ? { vacio: [], carga: ruta.nodos } : null), [ruta]);

  if (error) return <MensajeError texto={error} />;
  if (!datos) return <Cargando />;

  async function calcular(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    const params = new URLSearchParams({
      origen_id: String(form.get("origen")),
      destino_id: String(form.get("destino")),
      criterio: String(form.get("criterio")) as Criterio,
    });
    setCalculando(true);
    setErrorRuta("");
    try {
      setRuta(await api<RutaOptima>(`/rutas/optima?${params}`));
    } catch (err) {
      setRuta(null);
      setErrorRuta(mensaje(err));
    } finally {
      setCalculando(false);
    }
  }

  const { ubicaciones, tramos, camiones, posiciones } = datos;
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
      <Tarjeta titulo="Calcular ruta óptima">
        <form onSubmit={calcular} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="origen">Origen</Label>
            <Selector id="origen" name="origen" defaultValue={ubicaciones[0]?.id}>
              {ubicaciones.map(u => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </Selector>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="destino">Destino</Label>
            <Selector id="destino" name="destino" defaultValue={ubicaciones.at(-1)?.id}>
              {ubicaciones.map(u => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </Selector>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="criterio">Optimizar por</Label>
            <Selector id="criterio" name="criterio" defaultValue="distancia">
              <option value="distancia">Menor distancia</option>
              <option value="tiempo">Menor tiempo</option>
            </Selector>
          </div>
          <Button type="submit" disabled={calculando} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Calculator /> {calculando ? "Calculando…" : "Calcular con Dijkstra"}
          </Button>
        </form>

        {errorRuta && <div className="mt-4"><MensajeError texto={errorRuta} /></div>}
        {ruta && (
          <div className="mt-6">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Distancia", fmt.km(ruta.distancia_km)],
                ["Tiempo", fmt.tiempo(ruta.tiempo_min)],
                ["Casetas", fmt.dinero(ruta.peaje)],
              ].map(([titulo, valor]) => (
                <div key={titulo} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{titulo}</p>
                  <p className="text-sm font-semibold">{valor}</p>
                </div>
              ))}
            </div>
            <ol className="mt-4 space-y-2">
              {ruta.pasos.map((p, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="grid size-6 shrink-0 place-content-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    {i + 1}
                  </span>
                  <div>
                    {p.desde} → <strong>{p.hasta}</strong>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {fmt.km(p.distancia_km)} · {fmt.tiempo(p.tiempo_min)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          Prueba: cierra un tramo en{" "}
          <button onClick={() => ir("tramos")} className="text-blue-600 dark:text-blue-400 hover:underline">
            Tramos
          </button>{" "}
          (desmarca “Abierto”) y vuelve a calcular. Dijkstra buscará otro camino.
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Los puntos verdes son la última ubicación GPS que mandó la app móvil de cada conductor.
        </p>
      </Tarjeta>
      <Tarjeta className="p-0 overflow-hidden">
        <Mapa
          ubicaciones={ubicaciones}
          tramos={tramos}
          camiones={camiones}
          posiciones={posiciones}
          ruta={rutaMapa}
          className="h-[620px]"
        />
      </Tarjeta>
    </div>
  );
}
