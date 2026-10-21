// Comunicación con la API: guarda el token de sesión y lo manda en cada petición.
const CLAVE_TOKEN = "transporte_token";

export const sesion = {
  get token() {
    return localStorage.getItem(CLAVE_TOKEN);
  },
  guardar(token: string) {
    localStorage.setItem(CLAVE_TOKEN, token);
  },
  cerrar() {
    localStorage.removeItem(CLAVE_TOKEN);
  },
};

export async function iniciarSesion(usuario: string, password: string): Promise<void> {
  const respuesta = await fetch("/api/auth/token", {
    method: "POST",
    body: new URLSearchParams({ username: usuario, password }),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.detail || "No se pudo iniciar sesión");
  sesion.guardar(datos.access_token);
}

interface Opciones {
  metodo?: "GET" | "POST" | "PUT" | "DELETE";
  datos?: unknown;
}

export async function api<T = unknown>(ruta: string, { metodo = "GET", datos }: Opciones = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${sesion.token}` };
  let body: string | undefined;
  if (datos !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(datos);
  }
  const respuesta = await fetch(`/api${ruta}`, { method: metodo, headers, body });
  if (respuesta.status === 401) {
    sesion.cerrar();
    window.dispatchEvent(new Event("sesion-expirada"));
    throw new Error("Tu sesión expiró, vuelve a entrar");
  }
  if (respuesta.status === 204) return null as T;
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(mensajeDeError(cuerpo));
  return cuerpo as T;
}

function mensajeDeError(cuerpo: { detail?: unknown } | null): string {
  const detalle = cuerpo?.detail;
  // Errores de validación de FastAPI: [{loc: ["body", "campo"], msg: "..."}]
  if (Array.isArray(detalle)) {
    return detalle
      .map((e: { loc?: string[]; msg: string }) => {
        const campo = e.loc?.slice(1).join(".");
        const msg = e.msg.replace(/^Value error, /, "");
        return campo ? `${campo}: ${msg}` : msg;
      })
      .join("\n");
  }
  return typeof detalle === "string" ? detalle : "Ocurrió un error inesperado";
}

export const mensaje = (error: unknown) => (error instanceof Error ? error.message : String(error));
