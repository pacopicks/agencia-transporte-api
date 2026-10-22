import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/dashboard-with-collapsible-sidebar";
import { iniciarSesion, mensaje } from "@/lib/api";

export function Login({ onEntrar, aviso }: { onEntrar: () => void; aviso?: string }) {
  const [error, setError] = useState(aviso ?? "");
  const [entrando, setEntrando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setEntrando(true);
    setError("");
    try {
      await iniciarSesion(String(datos.get("usuario")), String(datos.get("password")));
      onEntrar();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 dark:bg-gray-950 p-4">
      <form
        onSubmit={enviar}
        className="grid w-full max-w-sm gap-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">Agencia de Transporte</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Panel de administración</p>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="usuario">Usuario</Label>
          <Input id="usuario" name="usuario" autoComplete="username" required autoFocus />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" disabled={entrando} className="bg-blue-600 hover:bg-blue-700 text-white">
          {entrando ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          ¿Eres conductor?{" "}
          <a href="/movil/" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
            Abre la app móvil
          </a>
        </p>
      </form>
    </div>
  );
}
