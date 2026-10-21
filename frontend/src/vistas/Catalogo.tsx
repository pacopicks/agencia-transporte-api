// CRUD genérico: tabla con búsqueda + formulario para crear/editar + eliminar.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Cargando, Insignia, MensajeError, Tarjeta } from "@/components/comunes";
import { FormularioEntidad } from "@/components/FormularioEntidad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ENTIDADES, opcionesDe, type Campo, type ClaveEntidad } from "@/entidades";
import { api, mensaje } from "@/lib/api";
import { COLOR_PRIORIDAD, PRIORIDADES, fmt, indexar } from "@/lib/formato";
import type { Registro } from "@/lib/tipos";

type Referencias = Partial<Record<ClaveEntidad, Map<number, Registro>>>;

export function Catalogo({
  clave,
  puedeEscribir,
  onCambio,
}: {
  clave: ClaveEntidad;
  puedeEscribir: boolean;
  onCambio: () => void;
}) {
  const conf = ENTIDADES[clave];
  const [items, setItems] = useState<Registro[] | null>(null);
  const [refs, setRefs] = useState<Referencias>({});
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("");
  const [editando, setEditando] = useState<Registro | null | undefined>(undefined); // undefined = cerrado, null = nuevo

  const clavesRef = useMemo(
    () => [...new Set(conf.campos.flatMap(c => (c.tipo === "ref" && c.ref ? [c.ref] : [])))],
    [conf],
  );

  const cargar = useCallback(async () => {
    const [lista, ...listas] = await Promise.all([
      api<Registro[]>(conf.ruta),
      ...clavesRef.map(r => api<Registro[]>(ENTIDADES[r].ruta)),
    ]);
    setItems(lista);
    setRefs(Object.fromEntries(clavesRef.map((r, i) => [r, indexar(listas[i])])));
  }, [conf, clavesRef]);

  useEffect(() => {
    cargar().catch(err => setError(mensaje(err)));
  }, [cargar]);

  // Los campos "ref" (llaves foráneas) se vuelven <select> con las opciones de la tabla relacionada
  const camposFormulario = useMemo<Campo[]>(
    () =>
      conf.campos.map(c =>
        c.tipo !== "ref" || !c.ref
          ? c
          : {
              ...c,
              tipo: "select",
              numero: true,
              opciones: Object.fromEntries(
                [...(refs[c.ref]?.values() ?? [])].map(x => [String(x.id), ENTIDADES[c.ref!].etiqueta(x)]),
              ),
            },
      ),
    [conf, refs],
  );

  if (error) return <MensajeError texto={error} />;
  if (!items) return <Cargando />;

  const columnas = conf.campos.filter(c => c.tabla !== false);

  const mostrar = (campo: Campo, valor: unknown): ReactNode => {
    if (valor === null || valor === undefined || valor === "") return <span className="text-gray-400">—</span>;
    switch (campo.tipo) {
      case "ref": {
        const item = refs[campo.ref!]?.get(Number(valor));
        return item ? ENTIDADES[campo.ref!].etiqueta(item) : `#${valor}`;
      }
      case "bool":
        return valor ? <Insignia texto="Sí" color="verde" /> : <Insignia texto="No" color="gris" />;
      case "select": {
        if (campo.k === "prioridad") return <Insignia texto={PRIORIDADES[Number(valor)]} color={COLOR_PRIORIDAD[Number(valor)]} />;
        const etiqueta = opcionesDe(campo).find(([v]) => v === String(valor))?.[1] ?? String(valor);
        return campo.insignia ? <Insignia estado={String(valor)} texto={etiqueta} /> : etiqueta;
      }
      case "date":
        return fmt.fecha(String(valor));
      case "number":
        return fmt.num(Number(valor));
      default:
        return String(valor);
    }
  };

  const textoPlano = (campo: Campo, valor: unknown) => {
    if (campo.tipo === "ref") {
      const item = refs[campo.ref!]?.get(Number(valor));
      return item ? ENTIDADES[campo.ref!].etiqueta(item) : "";
    }
    return String(valor ?? "");
  };
  const busqueda = filtro.trim().toLowerCase();
  const filas = items.filter(
    item => !busqueda || columnas.some(c => textoPlano(c, item[c.k]).toLowerCase().includes(busqueda)),
  );

  async function guardar(datos: Record<string, unknown>) {
    if (editando) await api(`${conf.ruta}/${editando.id}`, { metodo: "PUT", datos });
    else await api(conf.ruta, { metodo: "POST", datos });
    toast.success(editando ? "Cambios guardados" : `Se creó el ${conf.singular}`);
    await cargar();
    onCambio();
  }

  async function eliminar(item: Registro) {
    if (!confirm(`¿Eliminar ${conf.singular} #${item.id}? Esta acción no se puede deshacer.`)) return;
    try {
      await api(`${conf.ruta}/${item.id}`, { metodo: "DELETE" });
      toast.success("Registro eliminado");
      await cargar();
      onCambio();
    } catch (err) {
      toast.error(mensaje(err));
    }
  }

  return (
    <>
      <Tarjeta className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar…" className="pl-8" />
          </div>
          {puedeEscribir && (
            <Button onClick={() => setEditando(null)} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus /> Nuevo {conf.singular}
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">#</TableHead>
              {columnas.map(c => (
                <TableHead key={c.k} className={c.tipo === "number" ? "text-right" : ""}>
                  {c.label}
                </TableHead>
              ))}
              {puedeEscribir && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnas.length + 2} className="py-10 text-center text-gray-500">
                  Sin registros.
                </TableCell>
              </TableRow>
            )}
            {filas.map(item => (
              <TableRow key={item.id}>
                <TableCell className="pl-6 text-gray-500">{item.id}</TableCell>
                {columnas.map(c => (
                  <TableCell key={c.k} className={c.tipo === "number" ? "text-right tabular-nums" : ""}>
                    {mostrar(c, item[c.k])}
                  </TableCell>
                ))}
                {puedeEscribir && (
                  <TableCell className="pr-6 text-right space-x-1">
                    <Button size="icon-sm" variant="ghost" title="Editar" onClick={() => setEditando(item)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Eliminar"
                      onClick={() => eliminar(item)}
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="px-6 py-3 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800">
          {filas.length} de {items.length} registros
        </p>
      </Tarjeta>

      {editando !== undefined && (
        <FormularioEntidad
          titulo={editando ? `Editar ${conf.singular} #${editando.id}` : `Nuevo ${conf.singular}`}
          campos={camposFormulario}
          valores={editando}
          onCerrar={() => setEditando(undefined)}
          onGuardar={guardar}
        />
      )}
    </>
  );
}
