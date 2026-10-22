"""CRUD de las tablas que maneja el administrador."""
from app import models, schemas
from app.crud import router_crud

routers = [
    router_crud(models.Ubicacion, schemas.UbicacionEntrada, schemas.Ubicacion, "/api/ubicaciones", "Ubicaciones", "ubicación"),
    router_crud(models.Tramo, schemas.TramoEntrada, schemas.Tramo, "/api/tramos", "Tramos (carreteras)", "tramo"),
    router_crud(models.Conductor, schemas.ConductorEntrada, schemas.Conductor, "/api/conductores", "Conductores", "conductor"),
    router_crud(models.Camion, schemas.CamionEntrada, schemas.Camion, "/api/camiones", "Camiones", "camión"),
    router_crud(models.Envio, schemas.EnvioEntrada, schemas.Envio, "/api/envios", "Envíos", "envío"),
]
