"""Primer administrador y datos de ejemplo para probar la seguridad."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import config
from app.models import Camion, Envio, Usuario
from app.routers.envios import nuevo_codigo
from app.seguridad import hashear_password

USUARIOS = [
    # usuario, contraseña, nombre, rol
    ("cliente1", "cliente123", "Farmacias Salud Total", "cliente"),
    ("cliente2", "cliente123", "Aceros del Norte", "cliente"),
    ("juan", "juan123", "Juan Pérez", "conductor"),
    ("maria", "maria123", "María Hernández", "conductor"),
]

CAMIONES = [
    # placa, capacidad kg, conductor
    ("71-AK-3D", 30000, "juan"),
    ("52-BN-8F", 12000, "maria"),
    ("34-ES-6K", 6000, None),
]

ENVIOS = [
    # cliente, origen, destino, kg, camión asignado
    ("cliente1", "Ciudad de México", "Veracruz", 4500, "71-AK-3D"),
    ("cliente1", "Puebla", "Oaxaca", 5000, None),
    ("cliente2", "Monterrey", "Querétaro", 9000, "52-BN-8F"),
    ("cliente2", "León", "Guadalajara", 20000, None),
]


def inicializar(db: Session) -> None:
    if not db.scalar(select(Usuario).where(Usuario.rol == "admin")):
        db.add(
            Usuario(
                usuario=config.ADMIN_USUARIO,
                nombre="Administrador",
                rol="admin",
                password_hash=hashear_password(config.ADMIN_PASSWORD),
            )
        )
    if config.CARGAR_DEMO and not db.scalar(select(func.count()).select_from(Camion)):
        usuarios = {u: Usuario(usuario=u, nombre=n, rol=r, password_hash=hashear_password(p)) for u, p, n, r in USUARIOS}
        db.add_all(usuarios.values())
        db.flush()
        camiones = {
            placa: Camion(placa=placa, capacidad_kg=kg, conductor_id=usuarios[c].id if c else None)
            for placa, kg, c in CAMIONES
        }
        db.add_all(camiones.values())
        db.flush()
        for cliente, origen, destino, kg, placa in ENVIOS:
            camion = camiones.get(placa)
            db.add(
                Envio(
                    codigo=nuevo_codigo(),
                    cliente_id=usuarios[cliente].id,
                    origen=origen,
                    destino=destino,
                    peso_kg=kg,
                    estado="asignado" if camion else "pendiente",
                    camion_id=camion.id if camion else None,
                )
            )
            if camion:
                camion.disponible = False
    db.commit()
