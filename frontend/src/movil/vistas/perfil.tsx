import { useCallback, useState, type FormEvent } from "react";
import { LogOut, Monitor, Moon } from "lucide-react";
import { toast } from "sonner";
import { Insignia } from "@/components/comunes";
import { Logo } from "@/components/ui/dashboard-with-collapsible-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, iniciarSesion, mensaje, o404 } from "@/lib/api";
import type { MiCamion, Yo } from "@/lib/tipos";
import { Contenido, Encabezado, Tarjeta, useCarga } from "@/movil/componentes";
import { TarjetaCamion } from "@/movil/vistas/conductor";

export function Perfil({
  yo,
  isDark,
  setIsDark,
  onSalir,
}: {
  yo: Yo;
  isDark: boolean;
  setIsDark: (valor: boolean) => void;
  onSalir: () => void;
}) {
  const esConductor = yo.scopes.includes("conductor:viaje");
  const cargarCamion = useCallback(
    () => (esConductor ? o404(api<MiCamion>("/conductor/camion")) : Promise.resolve(null)),
    [esConductor],
  );
  const { datos: camion } = useCarga(cargarCamion);
  const [error, setError] = useState("");

  async function cambiarPassword(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const f = new FormData(form);
    if (f.get("nueva") !== f.get("confirmar")) return setError("Las contraseñas nuevas no coinciden");
    setError("");
    try {
      await api("/auth/yo/password", { metodo: "PUT", datos: { actual: f.get("actual"), nueva: f.get("nueva") } });
      toast.success("Contraseña actualizada");
      form.reset();
    } catch (err) {
      setError(mensaje(err));
    }
  }

  const iniciales = yo.nombre.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
  return (
    <>
      <Encabezado titulo="Perfil" />
      <Contenido>
        <Tarjeta>
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-content-center rounded-full bg-blue-600 text-lg font-semibold text-white">{iniciales}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{yo.nombre}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">@{yo.usuario}</p>
            </div>
            {yo.rol && <Insignia estado={yo.rol} texto={yo.rol} />}
          </div>
        </Tarjeta>

        {camion && <TarjetaCamion camion={camion} />}

        <Tarjeta>
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Moon className="h-4 w-4" /> Modo oscuro
            </span>
            <input type="checkbox" checked={isDark} onChange={e => setIsDark(e.target.checked)} className="size-5 accent-blue-600" />
          </label>
        </Tarjeta>

        <Tarjeta titulo="Cambiar contraseña">
          <form onSubmit={cambiarPassword} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="actual">Contraseña actual</Label>
              <Input id="actual" name="actual" type="password" autoComplete="current-password" required className="h-10" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nueva">Nueva (mínimo 6 caracteres)</Label>
              <Input id="nueva" name="nueva" type="password" autoComplete="new-password" minLength={6} required className="h-10" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmar">Repite la nueva</Label>
              <Input id="confirmar" name="confirmar" type="password" autoComplete="new-password" minLength={6} required className="h-10" />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" variant="outline" className="w-full">Guardar contraseña</Button>
          </form>
        </Tarjeta>

        {!esConductor && (
          <Button asChild variant="outline" className="h-11 w-full">
            <a href="/">
              <Monitor /> Abrir el panel web completo
            </a>
          </Button>
        )}
        <Button variant="outline" onClick={onSalir} className="h-11 w-full text-red-600 dark:text-red-400">
          <LogOut /> Cerrar sesión
        </Button>
      </Contenido>
    </>
  );
}

export function LoginMovil({ onEntrar, aviso }: { onEntrar: () => void; aviso?: string }) {
  const [error, setError] = useState(aviso ?? "");
  const [entrando, setEntrando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    setEntrando(true);
    setError("");
    try {
      await iniciarSesion(String(f.get("usuario")).trim(), String(f.get("password")));
      onEntrar();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 dark:bg-gray-950">
      <div className="bg-gradient-to-br from-blue-500 to-blue-700 px-6 pb-16 pt-[calc(env(safe-area-inset-top)+3rem)] text-white">
        <Logo />
        <h1 className="mt-6 text-2xl font-bold">Agencia de Transporte</h1>
        <p className="mt-1 text-blue-100">Tus viajes y la operación de la flota, en el celular.</p>
      </div>
      <form onSubmit={enviar} className="-mt-8 mx-4 space-y-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="grid gap-2">
          <Label htmlFor="usuario">Usuario</Label>
          <Input
            id="usuario"
            name="usuario"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="h-11"
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" disabled={entrando} className="h-12 w-full bg-blue-600 text-base text-white hover:bg-blue-700">
          {entrando ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
