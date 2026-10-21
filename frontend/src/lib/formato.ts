const numero = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });
const moneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const relativo = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });

export const fmt = {
  num: (v: number) => numero.format(v),
  km: (v: number) => `${numero.format(v)} km`,
  kg: (v: number) => `${numero.format(v)} kg`,
  dinero: (v: number) => moneda.format(v),
  tiempo(minutos: number) {
    const h = Math.floor(minutos / 60);
    const m = Math.round(minutos % 60);
    return h ? `${h} h ${m} min` : `${m} min`;
  },
  // "2026-10-25" -> "25/10/2026" (sin pasar por Date para que no se recorra un día por la zona horaria)
  fecha: (v: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—"),
  haceCuanto(iso: string) {
    const segundos = (new Date(iso).getTime() - Date.now()) / 1000;
    const escalas: [Intl.RelativeTimeFormatUnit, number][] = [
      ["day", 86400], ["hour", 3600], ["minute", 60],
    ];
    for (const [unidad, tamano] of escalas) {
      if (Math.abs(segundos) >= tamano) return relativo.format(Math.round(segundos / tamano), unidad);
    }
    return "justo ahora";
  },
};

export function textoEstado(valor: string) {
  const texto = valor.replaceAll("_", " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export type Color = "verde" | "azul" | "morado" | "ambar" | "rojo" | "gris";

export const COLOR_ESTADO: Record<string, Color> = {
  pendiente: "ambar",
  asignado: "azul",
  planificada: "azul",
  en_transito: "morado",
  en_curso: "morado",
  en_ruta: "morado",
  entregado: "verde",
  completada: "verde",
  disponible: "verde",
  cancelado: "gris",
  cancelada: "gris",
  mantenimiento: "rojo",
  admin: "rojo",
  operador: "azul",
  consulta: "gris",
  conductor: "morado",
};

export const SCOPES: Record<string, string> = {
  "catalogos:leer": "Consultar catálogos",
  "catalogos:escribir": "Editar catálogos",
  "asignaciones:leer": "Consultar asignaciones",
  "asignaciones:escribir": "Ejecutar el modelo y cambiar asignaciones",
  "rutas:leer": "Calcular y consultar rutas",
  "usuarios:admin": "Administrar usuarios y API keys",
};

export const PRIORIDADES: Record<number, string> = { 1: "Baja", 2: "Media", 3: "Alta", 4: "Urgente" };
export const COLOR_PRIORIDAD: Record<number, Color> = { 1: "gris", 2: "azul", 3: "ambar", 4: "rojo" };

export const indexar = <T extends { id: number }>(lista: T[]) => new Map(lista.map(x => [x.id, x]));
