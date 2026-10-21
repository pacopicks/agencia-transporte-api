// Comparte la ubicación del conductor con la agencia mientras tiene un viaje activo.
import { useEffect, useState } from "react";
import { api, mensaje } from "@/lib/api";

const CADA_MS = 30_000; // se manda como máximo una ubicación cada 30 s (cuida batería, datos y el rate limit)

export interface EstadoGps {
  coords: [number, number] | null;
  ultimoEnvio: Date | null;
  error: string;
}

export const gpsDisponible = () => "geolocation" in navigator && window.isSecureContext;

export function useCompartirUbicacion(activo: boolean): EstadoGps {
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [ultimoEnvio, setUltimoEnvio] = useState<Date | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activo) return;
    if (!gpsDisponible()) {
      setError("El GPS solo funciona si abres la app con https (ver README).");
      return;
    }
    let ultimo = 0;
    const id = navigator.geolocation.watchPosition(
      async ({ coords: c }) => {
        setCoords([c.latitude, c.longitude]);
        if (Date.now() - ultimo < CADA_MS) return;
        ultimo = Date.now();
        try {
          // Solo se mandan coordenadas: el camión lo decide la API a partir de la sesión
          await api("/conductor/ubicacion", {
            metodo: "POST",
            datos: {
              latitud: c.latitude,
              longitud: c.longitude,
              precision_m: c.accuracy,
              velocidad_kmh: c.speed != null ? Math.max(0, c.speed * 3.6) : null,
            },
          });
          setUltimoEnvio(new Date());
          setError("");
        } catch (err) {
          setError(mensaje(err));
        }
      },
      err => setError(err.code === err.PERMISSION_DENIED ? "Negaste el permiso de ubicación; actívalo en los ajustes del navegador." : "No se pudo obtener tu ubicación."),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [activo]);

  return { coords, ultimoEnvio, error };
}
