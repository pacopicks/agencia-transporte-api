import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  House,
  KeyRound,
  Map as MapIcon,
  MapPin,
  Navigation,
  Package,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { Toaster } from "sonner";
import { Cargando } from "@/components/comunes";
import { Button } from "@/components/ui/button";
import { DashboardLayout, type GrupoMenu } from "@/components/ui/dashboard-with-collapsible-sidebar";
import type { ClaveEntidad } from "@/entidades";
import { api, mensaje, sesion } from "@/lib/api";
import type { Panel, Scope, Yo } from "@/lib/tipos";
import { ApiKeys } from "@/vistas/ApiKeys";
import { Asignaciones } from "@/vistas/Asignaciones";
import { Catalogo } from "@/vistas/Catalogo";
import { Inicio } from "@/vistas/Inicio";
import { Login } from "@/vistas/Login";
import { MiRuta } from "@/vistas/MiRuta";
import { Rutas } from "@/vistas/Rutas";

interface Vista {
  id: string;
  titulo: string;
  subtitulo: string;
  Icon: LucideIcon;
  requiere: Scope[]; // la opción solo aparece si el usuario tiene estos scopes
  sistema?: boolean;
  soloConductor?: boolean;
}

const VISTAS: Vista[] = [
  { id: "panel", titulo: "Panel", subtitulo: "Resumen de la operación de la agencia", Icon: House, requiere: ["asignaciones:leer", "catalogos:leer"] },
  { id: "asignaciones", titulo: "Asignaciones", subtitulo: "El modelo asigna camiones y calcula las rutas óptimas", Icon: Sparkles, requiere: ["asignaciones:leer", "catalogos:leer"] },
  { id: "rutas", titulo: "Mapa y rutas", subtitulo: "Red de carreteras y calculadora de rutas (Dijkstra)", Icon: MapIcon, requiere: ["rutas:leer", "catalogos:leer"] },
  { id: "mi-ruta", titulo: "Mi ruta", subtitulo: "Indicaciones para tu viaje actual", Icon: Navigation, requiere: ["rutas:leer"], soloConductor: true },
  { id: "envios", titulo: "Envíos", subtitulo: "Cargas que hay que mover", Icon: Package, requiere: ["catalogos:leer"] },
  { id: "camiones", titulo: "Camiones", subtitulo: "Flota, capacidad y ubicación actual", Icon: Truck, requiere: ["catalogos:leer"] },
  { id: "conductores", titulo: "Conductores", subtitulo: "Operadores de la flota", Icon: Users, requiere: ["catalogos:leer"] },
  { id: "ubicaciones", titulo: "Ubicaciones", subtitulo: "Ciudades y centros de distribución (nodos del grafo)", Icon: MapPin, requiere: ["catalogos:leer"] },
  { id: "tramos", titulo: "Tramos", subtitulo: "Carreteras entre ubicaciones (aristas del grafo)", Icon: Waypoints, requiere: ["catalogos:leer"] },
  { id: "usuarios", titulo: "Usuarios", subtitulo: "Personas con acceso al panel y su rol", Icon: ShieldCheck, requiere: ["usuarios:admin"], sistema: true },
  { id: "api-keys", titulo: "API keys", subtitulo: "Llaves para que otras aplicaciones usen la API", Icon: KeyRound, requiere: ["usuarios:admin"], sistema: true },
];

const leerVista = () => location.hash.replace(/^#\/?/, "") || "panel";

function leerTema() {
  try {
    return localStorage.getItem("tema") === "oscuro";
  } catch {
    return false;
  }
}

export default function App() {
  const [yo, setYo] = useState<Yo | null | undefined>(undefined); // undefined = revisando sesión
  const [avisoSesion, setAvisoSesion] = useState("");
  const [vista, setVista] = useState(leerVista);
  const [isDark, setIsDark] = useState(leerTema);
  const [contadores, setContadores] = useState<Panel | null>(null);

  const cargarSesion = useCallback(() => {
    if (!sesion.token) return setYo(null);
    api<Yo>("/auth/yo")
      .then(setYo)
      .catch(err => {
        setAvisoSesion(mensaje(err));
        setYo(null);
      });
  }, []);

  useEffect(() => {
    cargarSesion();
    const alExpirar = () => {
      setAvisoSesion("Tu sesión expiró, vuelve a entrar");
      setYo(null);
    };
    const alNavegar = () => setVista(leerVista());
    window.addEventListener("sesion-expirada", alExpirar);
    window.addEventListener("hashchange", alNavegar);
    return () => {
      window.removeEventListener("sesion-expirada", alExpirar);
      window.removeEventListener("hashchange", alNavegar);
    };
  }, [cargarSesion]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("tema", isDark ? "oscuro" : "claro");
    } catch {
      // sin almacenamiento: el tema solo dura esta visita
    }
  }, [isDark]);

  // Contadores de la barra lateral (envíos pendientes y en proceso)
  const refrescarContadores = useCallback(() => {
    if (yo?.scopes.includes("asignaciones:leer")) api<Panel>("/panel").then(setContadores).catch(() => {});
  }, [yo]);
  useEffect(refrescarContadores, [refrescarContadores, vista]);

  const notificaciones = <Toaster richColors position="bottom-right" theme={isDark ? "dark" : "light"} />;

  if (yo === undefined) {
    return <div className="grid min-h-screen place-items-center"><Cargando /></div>;
  }
  if (yo === null) {
    return (
      <>
        <Login aviso={avisoSesion} onEntrar={() => { setAvisoSesion(""); cargarSesion(); }} />
        {notificaciones}
      </>
    );
  }

  const puede = (scope: Scope) => yo.scopes.includes(scope);
  const salir = () => {
    sesion.cerrar();
    setContadores(null);
    setYo(null);
    history.replaceState(null, "", location.pathname);
    setVista("panel");
  };
  const ir = (id: string) => {
    location.hash = `#/${id}`;
  };

  const visibles = VISTAS.filter(v => v.requiere.every(puede) && (!v.soloConductor || yo.rol === "conductor"));
  const actual = visibles.find(v => v.id === vista) ?? visibles[0];
  if (!actual) {
    return (
      <div className="grid min-h-screen place-items-center p-4 text-center">
        <div className="space-y-4">
          <p>Tu usuario no tiene permisos para usar el panel.</p>
          <Button onClick={salir}>Cerrar sesión</Button>
        </div>
      </div>
    );
  }

  const pendientes = contadores?.envios.pendiente ?? 0;
  const enProceso = (contadores?.envios.asignado ?? 0) + (contadores?.envios.en_transito ?? 0);
  const contador: Record<string, number> = { envios: pendientes, asignaciones: enProceso };
  const aOpcion = (v: Vista) => ({ id: v.id, titulo: v.titulo, Icon: v.Icon, notifs: contador[v.id] });
  const grupos: GrupoMenu[] = [{ opciones: visibles.filter(v => !v.sistema).map(aOpcion) }];
  const sistema = visibles.filter(v => v.sistema);
  if (sistema.length) grupos.push({ titulo: "Sistema", opciones: sistema.map(aOpcion) });

  let contenido: ReactNode;
  switch (actual.id) {
    case "panel":
      contenido = <Inicio ir={ir} />;
      break;
    case "asignaciones":
      contenido = <Asignaciones puedeEscribir={puede("asignaciones:escribir")} onCambio={refrescarContadores} />;
      break;
    case "rutas":
      contenido = <Rutas ir={ir} />;
      break;
    case "mi-ruta":
      contenido = <MiRuta />;
      break;
    case "api-keys":
      contenido = <ApiKeys />;
      break;
    default:
      contenido = (
        <Catalogo
          clave={actual.id as ClaveEntidad}
          puedeEscribir={puede(actual.id === "usuarios" ? "usuarios:admin" : "catalogos:escribir")}
          onCambio={refrescarContadores}
        />
      );
  }

  return (
    <>
      <DashboardLayout
        grupos={grupos}
        seleccionado={actual.id}
        onSeleccionar={ir}
        titulo={actual.titulo}
        subtitulo={actual.subtitulo}
        usuario={`${yo.nombre}${yo.rol ? ` · ${yo.rol}` : ""}`}
        onSalir={salir}
        isDark={isDark}
        setIsDark={setIsDark}
        alertas={pendientes}
        onAlertas={() => ir("envios")}
      >
        <div key={actual.id}>{contenido}</div>
      </DashboardLayout>
      {notificaciones}
    </>
  );
}
