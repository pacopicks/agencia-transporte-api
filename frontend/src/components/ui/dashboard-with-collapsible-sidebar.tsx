// Basado en el componente "dashboard-with-collapsible-sidebar" (shadcn + Tailwind).
// Se conserva el diseño original (barra lateral colapsable, encabezado, modo oscuro)
// pero las opciones, el título y el contenido llegan por props desde la app.
import { useState, type ReactNode } from "react";
import { Bell, ChevronsRight, LogOut, Moon, Sun, Truck, User, type LucideIcon } from "lucide-react";

export interface OpcionMenu {
  id: string;
  titulo: string;
  Icon: LucideIcon;
  notifs?: number;
}

export interface GrupoMenu {
  titulo?: string;
  opciones: OpcionMenu[];
}

interface DashboardLayoutProps {
  grupos: GrupoMenu[];
  seleccionado: string;
  onSeleccionar: (id: string) => void;
  titulo: string;
  subtitulo?: string;
  usuario: string;
  onSalir: () => void;
  isDark: boolean;
  setIsDark: (valor: boolean) => void;
  alertas?: number;
  onAlertas?: () => void;
  children: ReactNode;
}

export const DashboardLayout = ({
  grupos,
  seleccionado,
  onSeleccionar,
  titulo,
  subtitulo,
  usuario,
  onSalir,
  isDark,
  setIsDark,
  alertas = 0,
  onAlertas,
  children,
}: DashboardLayoutProps) => {
  return (
    <div className="flex min-h-screen w-full">
      <div className="flex w-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <Sidebar grupos={grupos} seleccionado={seleccionado} onSeleccionar={onSeleccionar} />
        <div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-950 p-6 overflow-auto">
          {/* Encabezado */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{titulo}</h1>
              {subtitulo && <p className="text-gray-600 dark:text-gray-400 mt-1">{subtitulo}</p>}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={onAlertas}
                title={alertas ? `${alertas} envíos pendientes` : "Sin envíos pendientes"}
                className="relative p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <Bell className="h-5 w-5" />
                {alertas > 0 && <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full"></span>}
              </button>
              <button
                onClick={() => setIsDark(!isDark)}
                title={isDark ? "Modo claro" : "Modo oscuro"}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-1 pl-3 pr-1 text-gray-600 dark:text-gray-400">
                <User className="h-5 w-5" />
                <span className="hidden text-sm font-medium text-gray-900 dark:text-gray-100 sm:inline">{usuario}</span>
                <button
                  onClick={onSalir}
                  title="Cerrar sesión"
                  className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({
  grupos,
  seleccionado,
  onSeleccionar,
}: Pick<DashboardLayoutProps, "grupos" | "seleccionado" | "onSeleccionar">) => {
  const [open, setOpen] = useState(() => window.innerWidth >= 1024);
  const [principal, ...resto] = grupos;

  return (
    <nav
      className={`sticky top-0 h-screen shrink-0 border-r transition-all duration-300 ease-in-out ${
        open ? "w-64" : "w-16"
      } border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2 pb-20 shadow-sm overflow-y-auto`}
    >
      <TitleSection open={open} />

      <div className="space-y-1 mb-8">
        {principal.opciones.map(opcion => (
          <Option key={opcion.id} {...opcion} selected={seleccionado} setSelected={onSeleccionar} open={open} />
        ))}
      </div>

      {resto.map(grupo => (
        <div key={grupo.titulo} className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-1">
          {open && (
            <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {grupo.titulo}
            </div>
          )}
          {grupo.opciones.map(opcion => (
            <Option key={opcion.id} {...opcion} selected={seleccionado} setSelected={onSeleccionar} open={open} />
          ))}
        </div>
      ))}

      <ToggleClose open={open} setOpen={setOpen} />
    </nav>
  );
};

interface OptionProps extends OpcionMenu {
  selected: string;
  setSelected: (id: string) => void;
  open: boolean;
}

const Option = ({ id, Icon, titulo, selected, setSelected, open, notifs }: OptionProps) => {
  const isSelected = selected === id;

  return (
    <button
      onClick={() => setSelected(id)}
      title={open ? undefined : titulo}
      className={`relative flex h-11 w-full items-center rounded-md transition-all duration-200 ${
        isSelected
          ? "bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 shadow-sm border-l-2 border-blue-500"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200"
      }`}
    >
      <div className="grid h-full w-12 shrink-0 place-content-center">
        <Icon className="h-4 w-4" />
      </div>

      {open && <span className="text-sm font-medium whitespace-nowrap">{titulo}</span>}

      {notifs ? (
        open ? (
          <span className="absolute right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 dark:bg-blue-600 px-1.5 text-xs text-white font-medium">
            {notifs}
          </span>
        ) : (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500" />
        )
      ) : null}
    </button>
  );
};

const TitleSection = ({ open }: { open: boolean }) => {
  return (
    <div className="mb-6 border-b border-gray-200 dark:border-gray-800 pb-4">
      <div className="flex items-center gap-3 rounded-md p-2">
        <Logo />
        {open && (
          <div className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
              Agencia de Transporte
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              Panel de administración
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const Logo = () => {
  return (
    <div className="grid size-10 shrink-0 place-content-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
      <Truck className="h-5 w-5 text-white" />
    </div>
  );
};

const ToggleClose = ({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) => {
  return (
    <button
      onClick={() => setOpen(!open)}
      className="absolute bottom-0 left-0 right-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
    >
      <div className="flex items-center p-3">
        <div className="grid size-10 place-content-center">
          <ChevronsRight
            className={`h-4 w-4 transition-transform duration-300 text-gray-500 dark:text-gray-400 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
        {open && <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Ocultar</span>}
      </div>
    </button>
  );
};

export default DashboardLayout;
