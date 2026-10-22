// Administración de API keys: la llave completa solo se muestra una vez, al crearla.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Cargando, Insignia, MensajeError, Tarjeta } from "@/components/comunes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, mensaje } from "@/lib/api";
import { SCOPES, fmt } from "@/lib/formato";
import type { ApiKey } from "@/lib/tipos";

// Una API key no puede administrar usuarios ni actuar como conductor (la API también lo impide)
const SCOPES_PARA_LLAVES = Object.keys(SCOPES).filter(s => s !== "usuarios:admin" && s !== "conductor:viaje");

export function ApiKeys() {
  const [llaves, setLlaves] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState<string | null>(null); // llave recién creada (se muestra una vez)

  const cargar = useCallback(async () => setLlaves(await api<ApiKey[]>("/api-keys")), []);
  useEffect(() => {
    cargar().catch(err => setError(mensaje(err)));
  }, [cargar]);

  if (error) return <MensajeError texto={error} />;
  if (!llaves) return <Cargando />;

  async function cambiarActivo(llave: ApiKey) {
    try {
      await api(`/api-keys/${llave.id}`, {
        metodo: "PUT",
        datos: { nombre: llave.nombre, scopes: llave.scopes, activo: !llave.activo },
      });
      toast.success(llave.activo ? "API key revocada" : "API key reactivada");
      await cargar();
    } catch (err) {
      toast.error(mensaje(err));
    }
  }

  async function eliminar(llave: ApiKey) {
    if (!confirm(`¿Eliminar la API key "${llave.nombre}"? Las apps que la usen dejarán de funcionar.`)) return;
    try {
      await api(`/api-keys/${llave.id}`, { metodo: "DELETE" });
      toast.success("API key eliminada");
      await cargar();
    } catch (err) {
      toast.error(mensaje(err));
    }
  }

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="API keys"
        accion={
          <Button onClick={() => setCreando(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus /> Nueva API key
          </Button>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sirven para que otras aplicaciones (por ejemplo, una app para los conductores) usen la API sin usuario y
          contraseña. Se envían en el encabezado <code className="rounded bg-gray-100 dark:bg-gray-800 px-1">X-API-Key</code>.
          La API solo guarda su hash, así que la llave completa se ve una sola vez.
        </p>
      </Tarjeta>

      <Tarjeta className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Nombre</TableHead>
              <TableHead>Llave</TableHead>
              <TableHead>Permisos (scopes)</TableHead>
              <TableHead>Último uso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {llaves.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                  No hay API keys.
                </TableCell>
              </TableRow>
            )}
            {llaves.map(llave => (
              <TableRow key={llave.id}>
                <TableCell className="pl-6 font-medium">{llave.nombre}</TableCell>
                <TableCell className="font-mono text-xs">{llave.prefijo}…</TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    {llave.scopes.map(s => (
                      <Insignia key={s} texto={s} color="azul" />
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-gray-500">{llave.ultimo_uso ? fmt.haceCuanto(llave.ultimo_uso) : "Nunca"}</TableCell>
                <TableCell>
                  <Insignia texto={llave.activo ? "Activa" : "Revocada"} color={llave.activo ? "verde" : "gris"} />
                </TableCell>
                <TableCell className="pr-6 text-right space-x-1">
                  <Button size="sm" variant="outline" onClick={() => cambiarActivo(llave)}>
                    {llave.activo ? "Revocar" : "Reactivar"}
                  </Button>
                  <Button size="icon-sm" variant="ghost" title="Eliminar" onClick={() => eliminar(llave)} className="text-red-600 dark:text-red-400">
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Tarjeta>

      {creando && (
        <NuevaLlave
          onCerrar={() => setCreando(false)}
          onCreada={async clave => {
            setCreando(false);
            setNueva(clave);
            await cargar();
          }}
        />
      )}

      <Dialog open={nueva !== null} onOpenChange={abierto => !abierto && setNueva(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-600" /> Copia tu API key
            </DialogTitle>
            <DialogDescription>Guárdala en un lugar seguro: por seguridad no se volverá a mostrar.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={nueva ?? ""} className="font-mono text-xs" onFocus={e => e.target.select()} />
            <Button
              variant="outline"
              size="icon"
              title="Copiar"
              onClick={() => navigator.clipboard.writeText(nueva ?? "").then(() => toast.success("Copiada"))}
            >
              <Copy />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNueva(null)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NuevaLlave({ onCerrar, onCreada }: { onCerrar: () => void; onCreada: (clave: string) => void }) {
  const [error, setError] = useState("");

  async function crear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    try {
      const creada = await api<{ clave: string }>("/api-keys", {
        metodo: "POST",
        datos: { nombre: form.get("nombre"), scopes: form.getAll("scopes") },
      });
      onCreada(creada.clave);
    } catch (err) {
      setError(mensaje(err));
    }
  }

  return (
    <Dialog open onOpenChange={abierto => !abierto && onCerrar()}>
      <DialogContent>
        <form onSubmit={crear} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Nueva API key</DialogTitle>
            <DialogDescription>Dale solo los permisos que la aplicación necesita.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="nombre-llave">¿Para qué aplicación es?</Label>
            <Input id="nombre-llave" name="nombre" required placeholder="App de conductores" />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Permisos (scopes)</legend>
            {SCOPES_PARA_LLAVES.map(scope => (
              <label key={scope} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="scopes" value={scope} defaultChecked={scope.endsWith(":leer")} className="mt-0.5 size-4 accent-blue-600" />
                <span>
                  <span className="font-mono text-xs">{scope}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{SCOPES[scope]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {error && <p className="whitespace-pre-line text-sm text-red-600 dark:text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit">Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
