// Tipos de los datos que regresa la API (ver app/schemas.py en el backend)

export type Criterio = "distancia" | "tiempo";

export interface Ubicacion {
  id: number;
  nombre: string;
  region: string | null;
  tipo: string;
  latitud: number;
  longitud: number;
}

export interface Tramo {
  id: number;
  origen_id: number;
  destino_id: number;
  distancia_km: number;
  tiempo_min: number;
  peaje: number;
  bidireccional: boolean;
  activo: boolean;
}

export interface Conductor {
  id: number;
  nombre: string;
  licencia: string;
  telefono: string | null;
  activo: boolean;
}

export interface Camion {
  id: number;
  placa: string;
  marca: string;
  modelo: string;
  capacidad_kg: number;
  rendimiento_km_l: number;
  estado: string;
  ubicacion_id: number | null;
  conductor_id: number | null;
}

export interface Envio {
  id: number;
  codigo: string;
  cliente: string;
  descripcion: string | null;
  origen_id: number;
  destino_id: number;
  peso_kg: number;
  prioridad: number;
  estado: string;
  fecha_limite: string | null;
  creado_en: string;
}

export interface Asignacion {
  id: number;
  envio_id: number;
  camion_id: number;
  conductor_id: number | null;
  criterio: Criterio;
  ruta_vacio: number[];
  ruta_carga: number[];
  distancia_vacio_km: number;
  distancia_carga_km: number;
  distancia_total_km: number;
  tiempo_estimado_min: number;
  peajes: number;
  costo_estimado: number;
  estado: string;
  creado_en: string;
  actualizado_en: string | null;
}

export interface ResultadoModelo {
  mensaje: string;
  costo_total: number;
  asignaciones: Asignacion[];
  no_asignados: { envio_id: number; codigo: string; motivo: string }[];
}

export interface Paso {
  desde_id: number;
  desde: string;
  hasta_id: number;
  hasta: string;
  distancia_km: number;
  tiempo_min: number;
  peaje: number;
  abierto: boolean;
}

export interface RutaOptima {
  criterio: Criterio;
  nodos: number[];
  distancia_km: number;
  tiempo_min: number;
  peaje: number;
  pasos: Paso[];
}

export interface Panel {
  envios: Record<string, number>;
  camiones: Record<string, number>;
  ubicaciones: number;
  tramos: number;
  conductores: number;
  km_planificados: number;
  costo_planificado: number;
}

export type Rol = "admin" | "operador" | "consulta" | "conductor";

export type Scope =
  | "catalogos:leer"
  | "catalogos:escribir"
  | "asignaciones:leer"
  | "asignaciones:escribir"
  | "rutas:leer"
  | "usuarios:admin"
  | "conductor:viaje";

// Respuesta de GET /api/auth/yo
export interface Yo {
  tipo: "usuario" | "api_key";
  nombre: string;
  usuario: string | null;
  rol: Rol | null;
  conductor_id: number | null;
  scopes: Scope[];
}

export interface ApiKey {
  id: number;
  nombre: string;
  prefijo: string;
  scopes: Scope[];
  activo: boolean;
  creado_en: string;
  ultimo_uso: string | null;
}

export interface RutaCamion {
  camion_id: number;
  placa: string;
  conductor: string | null;
  asignacion_id: number;
  envio: string;
  cliente: string;
  descripcion: string | null;
  peso_kg: number;
  origen: string;
  destino: string;
  estado: string;
  distancia_total_km: number;
  tiempo_estimado_min: number;
  costo_estimado: number;
  ruta_vacio: number[];
  ruta_carga: number[];
  ubicaciones: Ubicacion[];
  pasos: (Paso & { etapa: "vacio" | "carga" })[];
}

// App móvil
export interface MiCamion {
  id: number;
  placa: string;
  marca: string;
  modelo: string;
  capacidad_kg: number;
  estado: string;
  ubicacion: string | null;
  conductor: string;
}

export interface ViajeResumen {
  id: number;
  estado: string;
  envio: string;
  cliente: string;
  origen: string;
  destino: string;
  distancia_total_km: number;
  tiempo_estimado_min: number;
  creado_en: string;
  actualizado_en: string | null;
}

export interface Posicion {
  camion_id: number;
  placa: string;
  latitud: number;
  longitud: number;
  precision_m: number | null;
  velocidad_kmh: number | null;
  registrado_en: string;
}

// Registro genérico para el CRUD
export type Registro = { id: number } & Record<string, unknown>;
