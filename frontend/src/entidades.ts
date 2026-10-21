// Configuración de cada catálogo: con esto se generan solas las tablas y los formularios del CRUD.
import type { Registro } from "@/lib/tipos";
import { PRIORIDADES } from "@/lib/formato";

export type ClaveEntidad = "envios" | "camiones" | "conductores" | "ubicaciones" | "tramos" | "usuarios";

export interface Campo {
  k: string;
  label: string;
  tipo?: "text" | "number" | "select" | "ref" | "bool" | "date" | "password";
  req?: boolean;
  reqAlCrear?: boolean; // obligatorio solo al crear (contraseña)
  opciones?: Record<string, string> | string[];
  numero?: boolean; // el <select> guarda números
  defecto?: string | number | boolean | (() => string);
  min?: number;
  entero?: boolean;
  tabla?: boolean; // false = no se muestra como columna
  insignia?: boolean; // mostrar como insignia de color
  ref?: ClaveEntidad; // tabla relacionada (llave foránea)
  ayudaEditar?: string;
}

export interface Entidad {
  singular: string;
  ruta: string;
  etiqueta: (x: Registro) => string;
  campos: Campo[];
}

export const ENTIDADES: Record<ClaveEntidad, Entidad> = {
  envios: {
    singular: "envío",
    ruta: "/envios",
    etiqueta: e => String(e.codigo),
    campos: [
      { k: "codigo", label: "Código", req: true, defecto: () => `ENV-${String(Date.now()).slice(-5)}` },
      { k: "cliente", label: "Cliente", req: true },
      { k: "descripcion", label: "Descripción", tabla: false },
      { k: "origen_id", label: "Origen", tipo: "ref", ref: "ubicaciones", req: true },
      { k: "destino_id", label: "Destino", tipo: "ref", ref: "ubicaciones", req: true },
      { k: "peso_kg", label: "Peso (kg)", tipo: "number", min: 1, req: true },
      { k: "prioridad", label: "Prioridad", tipo: "select", opciones: PRIORIDADES, numero: true, defecto: 2, req: true },
      { k: "fecha_limite", label: "Fecha límite", tipo: "date" },
      {
        k: "estado", label: "Estado", tipo: "select", insignia: true, req: true, defecto: "pendiente",
        opciones: ["pendiente", "asignado", "en_transito", "entregado", "cancelado"],
      },
    ],
  },
  camiones: {
    singular: "camión",
    ruta: "/camiones",
    etiqueta: c => `${c.placa} · ${c.marca} ${c.modelo}`,
    campos: [
      { k: "placa", label: "Placa", req: true },
      { k: "marca", label: "Marca", req: true },
      { k: "modelo", label: "Modelo", req: true },
      { k: "capacidad_kg", label: "Capacidad (kg)", tipo: "number", min: 1, req: true },
      { k: "rendimiento_km_l", label: "Rendimiento (km/L)", tipo: "number", min: 0.1, req: true },
      { k: "ubicacion_id", label: "Ubicación actual", tipo: "ref", ref: "ubicaciones" },
      { k: "conductor_id", label: "Conductor", tipo: "ref", ref: "conductores" },
      {
        k: "estado", label: "Estado", tipo: "select", insignia: true, req: true, defecto: "disponible",
        opciones: ["disponible", "asignado", "en_ruta", "mantenimiento"],
      },
    ],
  },
  conductores: {
    singular: "conductor",
    ruta: "/conductores",
    etiqueta: c => String(c.nombre),
    campos: [
      { k: "nombre", label: "Nombre", req: true },
      { k: "licencia", label: "Licencia federal", req: true },
      { k: "telefono", label: "Teléfono" },
      { k: "activo", label: "Activo", tipo: "bool", defecto: true },
    ],
  },
  ubicaciones: {
    singular: "ubicación",
    ruta: "/ubicaciones",
    etiqueta: u => String(u.nombre),
    campos: [
      { k: "nombre", label: "Nombre", req: true },
      { k: "region", label: "Estado" },
      {
        k: "tipo", label: "Tipo", tipo: "select", req: true, defecto: "ciudad",
        opciones: ["ciudad", "centro_distribucion", "almacen"],
      },
      { k: "latitud", label: "Latitud", tipo: "number", req: true },
      { k: "longitud", label: "Longitud", tipo: "number", req: true },
    ],
  },
  tramos: {
    singular: "tramo",
    ruta: "/tramos",
    etiqueta: t => `Tramo ${t.id}`,
    campos: [
      { k: "origen_id", label: "Desde", tipo: "ref", ref: "ubicaciones", req: true },
      { k: "destino_id", label: "Hasta", tipo: "ref", ref: "ubicaciones", req: true },
      { k: "distancia_km", label: "Distancia (km)", tipo: "number", min: 0.1, req: true },
      { k: "tiempo_min", label: "Tiempo (min)", tipo: "number", min: 1, entero: true, req: true },
      { k: "peaje", label: "Casetas (MXN)", tipo: "number", min: 0, defecto: 0, req: true },
      { k: "bidireccional", label: "Doble sentido", tipo: "bool", defecto: true },
      { k: "activo", label: "Abierto", tipo: "bool", defecto: true },
    ],
  },
  usuarios: {
    singular: "administrador",
    ruta: "/usuarios",
    etiqueta: u => String(u.usuario),
    campos: [
      { k: "usuario", label: "Usuario", req: true },
      { k: "nombre", label: "Nombre", req: true },
      {
        k: "rol", label: "Rol", tipo: "select", insignia: true, req: true, defecto: "consulta",
        opciones: { admin: "Admin", operador: "Operador", consulta: "Consulta", conductor: "Conductor" },
      },
      { k: "conductor_id", label: "Conductor vinculado (rol conductor)", tipo: "ref", ref: "conductores" },
      {
        k: "password", label: "Contraseña", tipo: "password", tabla: false, reqAlCrear: true,
        ayudaEditar: "Déjala vacía para conservar la actual",
      },
      { k: "activo", label: "Activo", tipo: "bool", defecto: true },
    ],
  },
};

export function opcionesDe(campo: Campo): [string, string][] {
  const o = campo.opciones ?? {};
  return Array.isArray(o) ? o.map(v => [v, v.charAt(0).toUpperCase() + v.slice(1).replaceAll("_", " ")]) : Object.entries(o);
}
