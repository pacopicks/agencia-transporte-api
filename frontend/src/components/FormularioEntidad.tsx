// Ventana para crear o editar cualquier registro a partir de su lista de campos.
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selector } from "@/components/comunes";
import { opcionesDe, type Campo } from "@/entidades";
import { mensaje } from "@/lib/api";
import type { Registro } from "@/lib/tipos";

interface Props {
  titulo: string;
  campos: Campo[]; // los campos "ref" ya deben venir convertidos a "select" con sus opciones
  valores: Registro | null; // null = nuevo registro
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => Promise<void>;
}

export function FormularioEntidad({ titulo, campos, valores, onCerrar, onGuardar }: Props) {
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const nuevo = valores === null;

  const inicial = (campo: Campo) => {
    if (!nuevo) return valores[campo.k];
    return typeof campo.defecto === "function" ? campo.defecto() : campo.defecto;
  };

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const datos: Record<string, unknown> = {};
    for (const campo of campos) {
      const control = form.elements.namedItem(campo.k) as HTMLInputElement | HTMLSelectElement;
      if (campo.tipo === "bool") {
        datos[campo.k] = (control as HTMLInputElement).checked;
        continue;
      }
      const valor = control.value.trim();
      if (valor === "") datos[campo.k] = null;
      else datos[campo.k] = campo.tipo === "number" || campo.numero ? Number(valor) : valor;
    }
    setGuardando(true);
    setError("");
    try {
      await onGuardar(datos);
      onCerrar();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={abierto => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={enviar}>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>Los campos marcados con * son obligatorios.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-6 sm:grid-cols-2">
            {campos.map(campo => (
              <Control key={campo.k} campo={campo} valor={inicial(campo)} nuevo={nuevo} />
            ))}
          </div>
          {error && <p className="mb-4 whitespace-pre-line text-sm text-red-600 dark:text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Control({ campo, valor, nuevo }: { campo: Campo; valor: unknown; nuevo: boolean }) {
  const requerido = Boolean(campo.req || (nuevo && campo.reqAlCrear));
  const id = `campo-${campo.k}`;
  const texto = valor === null || valor === undefined ? "" : String(valor);

  if (campo.tipo === "bool") {
    return (
      <label className="flex items-center gap-2 text-sm font-medium sm:pt-6">
        <input type="checkbox" name={campo.k} defaultChecked={Boolean(valor)} className="size-4 accent-blue-600" />
        {campo.label}
      </label>
    );
  }

  let control;
  if (campo.tipo === "select") {
    control = (
      <Selector id={id} name={campo.k} required={requerido} defaultValue={texto}>
        {!requerido ? (
          <option value="">— Ninguno —</option>
        ) : texto === "" ? (
          <option value="" disabled>
            Selecciona…
          </option>
        ) : null}
        {opcionesDe(campo).map(([v, etiqueta]) => (
          <option key={v} value={v}>
            {etiqueta}
          </option>
        ))}
      </Selector>
    );
  } else {
    control = (
      <Input
        id={id}
        name={campo.k}
        type={campo.tipo ?? "text"}
        step={campo.tipo === "number" ? (campo.entero ? 1 : "any") : undefined}
        min={campo.min}
        required={requerido}
        defaultValue={texto}
        autoComplete={campo.tipo === "password" ? "new-password" : undefined}
      />
    );
  }

  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>
        {campo.label}
        {requerido && " *"}
      </Label>
      {control}
      {!nuevo && campo.ayudaEditar && <p className="text-xs text-muted-foreground">{campo.ayudaEditar}</p>}
    </div>
  );
}
