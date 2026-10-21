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

// Error con el código HTTP, para distinguir por ejemplo un 404 ("no hay viaje") de una falla
export class ErrorApi extends Error {
  estado: number;
  constructor(mensaje: string, estado: number) {
    super(mensaje);
    this.estado = estado;
  }
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
    throw new ErrorApi("Tu sesión expiró, vuelve a entrar", 401);
  }
  if (respuesta.status === 204) return null as T;
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new ErrorApi(mensajeDeError(cuerpo), respuesta.status);
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

/** Ejecuta la petición y regresa null si la API responde 404 (cualquier otro error se propaga). */
export async function o404<T>(peticion: Promise<T>): Promise<T | null> {
  try {
    return await peticion;
  } catch (err) {
    if (err instanceof ErrorApi && err.estado === 404) return null;
    throw err;
  }
}
