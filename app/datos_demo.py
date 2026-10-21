"""Primer administrador y datos de ejemplo (distancias, tiempos y casetas aproximados)."""
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Camion, Conductor, Envio, Tramo, Ubicacion, Usuario
from app.seguridad import hashear_password

CIUDADES = [
    # nombre, estado, latitud, longitud
    ("Ciudad de México", "CDMX", 19.4326, -99.1332),
    ("Toluca", "Estado de México", 19.2826, -99.6557),
    ("Puebla", "Puebla", 19.0414, -98.2063),
    ("Querétaro", "Querétaro", 20.5888, -100.3899),
    ("León", "Guanajuato", 21.1250, -101.6860),
    ("Morelia", "Michoacán", 19.7060, -101.1950),
    ("Guadalajara", "Jalisco", 20.6597, -103.3496),
    ("Aguascalientes", "Aguascalientes", 21.8853, -102.2916),
    ("Zacatecas", "Zacatecas", 22.7709, -102.5832),
    ("San Luis Potosí", "San Luis Potosí", 22.1565, -100.9855),
    ("Saltillo", "Coahuila", 25.4232, -101.0053),
    ("Monterrey", "Nuevo León", 25.6866, -100.3161),
    ("Tampico", "Tamaulipas", 22.2331, -97.8611),
    ("Veracruz", "Veracruz", 19.1738, -96.1342),
    ("Oaxaca", "Oaxaca", 17.0732, -96.7266),
]

CARRETERAS = [
    # origen, destino, km, minutos, casetas MXN
    ("Ciudad de México", "Toluca", 66, 60, 180),
    ("Ciudad de México", "Querétaro", 213, 150, 610),
    ("Ciudad de México", "Puebla", 135, 110, 420),
    ("Puebla", "Veracruz", 285, 210, 780),
    ("Puebla", "Oaxaca", 340, 270, 900),
    ("Toluca", "Morelia", 245, 180, 650),
    ("Querétaro", "León", 190, 135, 380),
    ("Querétaro", "San Luis Potosí", 205, 145, 330),
    ("Querétaro", "Morelia", 195, 150, 280),
    ("Morelia", "Guadalajara", 300, 210, 820),
    ("León", "Guadalajara", 220, 160, 560),
    ("León", "Aguascalientes", 125, 90, 240),
    ("Aguascalientes", "Guadalajara", 225, 165, 450),
    ("Aguascalientes", "Zacatecas", 125, 95, 160),
    ("San Luis Potosí", "Zacatecas", 190, 145, 0),
    ("San Luis Potosí", "Aguascalientes", 170, 130, 0),
    ("San Luis Potosí", "Saltillo", 445, 300, 450),
    ("Zacatecas", "Saltillo", 375, 270, 300),
    ("Saltillo", "Monterrey", 85, 70, 200),
    ("San Luis Potosí", "Tampico", 410, 330, 120),
    ("Tampico", "Monterrey", 500, 390, 350),
    ("Tampico", "Veracruz", 490, 420, 300),
]

CONDUCTORES = [
    ("Juan Pérez López", "LFE-100231", "55 1234 5678"),
    ("María Hernández Ruiz", "LFE-100232", "81 2345 6789"),
    ("Carlos Ramírez Soto", "LFE-100233", "33 3456 7890"),
    ("Luis Gómez Torres", "LFE-100234", "44 4567 8901"),
    ("Ana Martínez Díaz", "LFE-100235", "22 5678 9012"),
    ("Jorge Sánchez Vega", "LFE-100236", "47 6789 0123"),
    ("Pedro Castillo Mora", "LFE-100237", "44 7890 1234"),
]

CAMIONES = [
    # placa, marca, modelo, capacidad kg, km/L, ubicación, licencia del conductor, estado
    ("71-AK-3D", "Kenworth", "T680", 30000, 2.8, "Ciudad de México", "LFE-100231", "disponible"),
    ("52-BN-8F", "Freightliner", "Cascadia", 28000, 3.0, "Monterrey", "LFE-100232", "disponible"),
    ("19-CP-4H", "International", "LT", 25000, 2.9, "Guadalajara", "LFE-100233", "disponible"),
    ("88-DR-1J", "Volvo", "VNL", 30000, 3.1, "Querétaro", "LFE-100234", "disponible"),
    ("34-ES-6K", "Isuzu", "ELF 600", 6000, 6.0, "Puebla", "LFE-100235", "disponible"),
    ("63-FT-9L", "Hino", "500", 12000, 4.5, "León", "LFE-100236", "mantenimiento"),
    ("27-GU-2M", "Kenworth", "T880", 35000, 2.5, "San Luis Potosí", None, "disponible"),
]

USUARIOS_DEMO = [
    # usuario, contraseña, nombre, rol, licencia del conductor (solo rol conductor)
    ("operador", "operador123", "Operador de tráfico", "operador", None),
    ("consulta", "consulta123", "Usuario de consulta", "consulta", None),
    ("juan", "juan123", "Juan Pérez López", "conductor", "LFE-100231"),
]

ENVIOS = [
    # código, cliente, descripción, origen, destino, kg, prioridad (1-4), días para la fecha límite
    ("ENV-0001", "Farmacias Salud Total", "Medicamentos", "Ciudad de México", "Veracruz", 4500, 4, 1),
    ("ENV-0002", "Aceros del Norte", "Varilla corrugada", "Monterrey", "Querétaro", 26000, 3, 4),
    ("ENV-0003", "Lácteos San Juan", "Producto refrigerado", "Guadalajara", "Ciudad de México", 18000, 2, 5),
    ("ENV-0004", "Electrónica del Bajío", "Electrodomésticos", "León", "Monterrey", 9000, 3, 3),
    ("ENV-0005", "Muebles Hernández", "Muebles de madera", "Puebla", "Oaxaca", 5000, 1, 10),
    ("ENV-0006", "Abarrotes La Esperanza", "Abarrotes", "San Luis Potosí", "Tampico", 15000, 2, 6),
    ("ENV-0007", "Ferretería El Tornillo", "Material de ferretería", "Aguascalientes", "Zacatecas", 7000, 1, 12),
    ("ENV-0008", "Textiles Oaxaqueños", "Rollos de tela", "Oaxaca", "Ciudad de México", 40000, 2, 8),
]


def inicializar(db: Session) -> None:
    """Crea el primer administrador y, si la base está vacía, los datos de ejemplo."""
    if not db.scalar(select(func.count()).select_from(Usuario)):
        db.add(
            Usuario(
                usuario=settings.admin_usuario,
                nombre="Administrador",
                rol="admin",
                password_hash=hashear_password(settings.admin_password),
            )
        )
    if settings.cargar_demo and not db.scalar(select(func.count()).select_from(Ubicacion)):
        _cargar_demo(db)
    db.commit()


def _cargar_demo(db: Session) -> None:
    ciudades = {nombre: Ubicacion(nombre=nombre, region=region, latitud=lat, longitud=lon) for nombre, region, lat, lon in CIUDADES}
    conductores = {lic: Conductor(nombre=nombre, licencia=lic, telefono=tel) for nombre, lic, tel in CONDUCTORES}
    db.add_all([*ciudades.values(), *conductores.values()])
    db.flush()  # para obtener los id

    usuarios_existentes = set(db.scalars(select(Usuario.usuario)))
    db.add_all(
        Usuario(
            usuario=usuario,
            nombre=nombre,
            rol=rol,
            conductor_id=conductores[licencia].id if licencia else None,
            password_hash=hashear_password(password),
        )
        for usuario, password, nombre, rol, licencia in USUARIOS_DEMO
        if usuario not in usuarios_existentes
    )

    db.add_all(
        Tramo(origen_id=ciudades[a].id, destino_id=ciudades[b].id, distancia_km=km, tiempo_min=minutos, peaje=peaje)
        for a, b, km, minutos, peaje in CARRETERAS
    )
    db.add_all(
        Camion(
            placa=placa,
            marca=marca,
            modelo=modelo,
            capacidad_kg=capacidad,
            rendimiento_km_l=rendimiento,
            ubicacion_id=ciudades[ciudad].id,
            conductor_id=conductores[licencia].id if licencia else None,
            estado=estado,
        )
        for placa, marca, modelo, capacidad, rendimiento, ciudad, licencia, estado in CAMIONES
    )
    hoy = date.today()
    db.add_all(
        Envio(
            codigo=codigo,
            cliente=cliente,
            descripcion=descripcion,
            origen_id=ciudades[origen].id,
            destino_id=ciudades[destino].id,
            peso_kg=peso,
            prioridad=prioridad,
            fecha_limite=hoy + timedelta(days=dias),
        )
        for codigo, cliente, descripcion, origen, destino, peso, prioridad, dias in ENVIOS
    )
