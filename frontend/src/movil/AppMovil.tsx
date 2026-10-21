// App móvil: decide qué pantallas ve cada usuario según su rol y sus scopes.
// (La API es quien realmente protege los datos; aquí solo se ocultan opciones que no aplican.)
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { History, House, Navigation, Package, Sparkles, Truck, User } from "lucide-react";
import { Toaster } from "sonner";
import { Cargando } from "@/components/comunes";
import { api, mensaje, sesion } from "@/lib/api";
import type { Panel, Scope, Yo } from "@/lib/tipos";
import { BarraPestanas, type Pestana } from "@/movil/componentes";
import { ConductorHistorial, ConductorViaje, DetalleViaje } from "@/movil/vistas/conductor";
import {
  PersonalAsignaciones,
  PersonalDetalleAsignacion,
  PersonalEnvios,
  PersonalFlota,
  PersonalInicio,
  PersonalNuevoEnvio,
} from "@/movil/vistas/personal";
import { LoginMovil, Perfil } from "@/movil/vistas/perfil";

const leerRuta = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
const ir = (ruta: string) => {
  location.hash = `#/${ruta}`;
};

function leerTema() {
  try {
    return localStorage.getItem("tema") === "oscuro";
  } catch {
    return false;
  }
}

export default function AppMovil() {
  const [yo, setYo] = useState<Yo | null | undefined>(undefined);
  const [aviso, setAviso] = useState("");
  const [ruta, setRuta] = useState(leerRuta);
  const [isDark, setIsDark] = useState(leerTema);
  const [pendientes, setPendientes] = useState(0);

  const cargarSesion = useCallback(() => {
    if (!sesion.token) return setYo(null);
    api<Yo>("/auth/yo")
      .then(setYo)
      .catch(err => {
        setAviso(mensaje(err));
        setYo(null);
      });
  }, []);

  useEffect(() => {
    cargarSesion();
    const alExpirar = () => {
      setAviso("Tu sesión expiró, vuelve a entrar");
      setYo(null);
    };
    const alNavegar = () => setRuta(leerRuta());
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

  useEffect(() => {
    if (yo?.scopes.includes("asignaciones:leer")) {
      api<Panel>("/panel").then(p => setPendientes(p.envios.pendiente ?? 0)).catch(() => {});
    }
  }, [yo, ruta]);

  const avisos = <Toaster richColors position="top-center" theme={isDark ? "dark" : "light"} />;

  if (yo === undefined) return <div className="grid min-h-dvh place-items-center"><Cargando /></div>;
  if (yo === null) {
    return (
      <>
        <LoginMovil aviso={aviso} onEntrar={() => { setAviso(""); cargarSesion(); }} />
        {avisos}
      </>
    );
  }

  const puede = (scope: Scope) => yo.scopes.includes(scope);
  const salir = () => {
    sesion.cerrar();
    setYo(null);
    history.replaceState(null, "", location.pathname);
    setRuta([]);
  };

  const esConductor = puede("conductor:viaje");
  const pestanas: Pestana[] = esConductor
    ? [
        { id: "viaje", titulo: "Mi viaje", Icon: Navigation },
        { id: "historial", titulo: "Historial", Icon: History },
        { id: "perfil", titulo: "Perfil", Icon: User },
      ]
    : [
        ...(puede("asignaciones:leer") && puede("catalogos:leer")
          ? [
              { id: "inicio", titulo: "Inicio", Icon: House },
              { id: "asignaciones", titulo: "Asignaciones", Icon: Sparkles },
            ]
          : []),
        ...(puede("catalogos:leer")
          ? [
              { id: "envios", titulo: "Envíos", Icon: Package, insignia: pendientes },
              { id: "flota", titulo: "Flota", Icon: Truck },
            ]
          : []),
        { id: "perfil", titulo: "Perfil", Icon: User },
      ];

  const [seccion, detalle] = ruta;
  const actual = pestanas.find(p => p.id === seccion) ?? pestanas[0];

  let pantalla: ReactNode;
  switch (actual.id) {
    case "viaje":
      pantalla = <ConductorViaje />;
      break;
    case "historial":
      pantalla = detalle ? <DetalleViaje id={detalle} /> : <ConductorHistorial ir={ir} />;
      break;
    case "inicio":
      pantalla = <PersonalInicio puedeEjecutar={puede("asignaciones:escribir")} ir={ir} />;
      break;
    case "asignaciones":
      pantalla = detalle ? (
        <PersonalDetalleAsignacion id={detalle} puedeEscribir={puede("asignaciones:escribir")} />
      ) : (
        <PersonalAsignaciones ir={ir} />
      );
      break;
    case "envios":
      pantalla =
        detalle === "nuevo" && puede("catalogos:escribir") ? (
          <PersonalNuevoEnvio />
        ) : (
          <PersonalEnvios puedeCrear={puede("catalogos:escribir")} ir={ir} />
        );
      break;
    case "flota":
      pantalla = <PersonalFlota />;
      break;
    default:
      pantalla = <Perfil yo={yo} isDark={isDark} setIsDark={setIsDark} onSalir={salir} />;
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div key={ruta.join("/")}>{pantalla}</div>
      <BarraPestanas pestanas={pestanas} actual={actual.id} onCambiar={ir} />
      {avisos}
    </div>
  );
}
