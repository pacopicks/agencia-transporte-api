// Piezas pequeñas reutilizadas en todas las vistas, con el mismo estilo del dashboard.
import type { ComponentProps, ReactNode } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { COLOR_ESTADO, textoEstado, type Color } from "@/lib/formato";
import { cn } from "@/lib/utils";

export function Tarjeta({
  titulo,
  accion,
  className,
  children,
}: {
  titulo?: ReactNode;
  accion?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm",
        className,
      )}
    >
      {(titulo || accion) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{titulo}</h3>
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

// <select> nativo con el mismo estilo que <Input> de shadcn
export function Selector({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow]",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

const CLASES_COLOR: Record<Color, string> = {
  verde: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  azul: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  morado: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  ambar: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  rojo: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  gris: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

export function Insignia({ estado, texto, color }: { estado?: string; texto?: string; color?: Color }) {
  const tono = color ?? COLOR_ESTADO[estado ?? ""] ?? "gris";
  return (
    <Badge variant="secondary" className={cn("border-transparent", CLASES_COLOR[tono])}>
      {texto ?? textoEstado(estado ?? "")}
    </Badge>
  );
}

export function Cargando() {
  return (
    <div className="flex items-center gap-2 py-12 text-gray-500 dark:text-gray-400">
      <LoaderCircle className="h-4 w-4 animate-spin" /> Cargando…
    </div>
  );
}

export function MensajeError({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300 whitespace-pre-line">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {texto}
    </div>
  );
}
