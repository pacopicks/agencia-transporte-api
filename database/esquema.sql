-- Esquema de la base de datos 'transporte' (PostgreSQL).
-- Solo es documentación: la API crea estas tablas sola al arrancar (ver app/models.py).

CREATE TABLE conductores (
	id SERIAL NOT NULL, 
	nombre VARCHAR(100) NOT NULL, 
	licencia VARCHAR(30) NOT NULL, 
	telefono VARCHAR(20), 
	activo BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (licencia)
);

CREATE TABLE ubicaciones (
	id SERIAL NOT NULL, 
	nombre VARCHAR(100) NOT NULL, 
	region VARCHAR(100), 
	tipo VARCHAR(30) NOT NULL, 
	latitud FLOAT NOT NULL, 
	longitud FLOAT NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (nombre)
);

CREATE TABLE camiones (
	id SERIAL NOT NULL, 
	placa VARCHAR(15) NOT NULL, 
	marca VARCHAR(50) NOT NULL, 
	modelo VARCHAR(50) NOT NULL, 
	capacidad_kg FLOAT NOT NULL, 
	rendimiento_km_l FLOAT NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	ubicacion_id INTEGER, 
	conductor_id INTEGER, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_camiones_valores CHECK (capacidad_kg > 0 AND rendimiento_km_l > 0), 
	UNIQUE (placa), 
	FOREIGN KEY(ubicacion_id) REFERENCES ubicaciones (id) ON DELETE SET NULL, 
	UNIQUE (conductor_id), 
	FOREIGN KEY(conductor_id) REFERENCES conductores (id) ON DELETE SET NULL
);

CREATE TABLE envios (
	id SERIAL NOT NULL, 
	codigo VARCHAR(20) NOT NULL, 
	cliente VARCHAR(100) NOT NULL, 
	descripcion VARCHAR(200), 
	origen_id INTEGER NOT NULL, 
	destino_id INTEGER NOT NULL, 
	peso_kg FLOAT NOT NULL, 
	prioridad INTEGER NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	fecha_limite DATE, 
	creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_envios_origen_destino CHECK (origen_id <> destino_id), 
	CONSTRAINT ck_envios_peso CHECK (peso_kg > 0), 
	CONSTRAINT ck_envios_prioridad CHECK (prioridad BETWEEN 1 AND 4), 
	UNIQUE (codigo), 
	FOREIGN KEY(origen_id) REFERENCES ubicaciones (id), 
	FOREIGN KEY(destino_id) REFERENCES ubicaciones (id)
);

CREATE TABLE tramos (
	id SERIAL NOT NULL, 
	origen_id INTEGER NOT NULL, 
	destino_id INTEGER NOT NULL, 
	distancia_km FLOAT NOT NULL, 
	tiempo_min INTEGER NOT NULL, 
	peaje FLOAT NOT NULL, 
	bidireccional BOOLEAN NOT NULL, 
	activo BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_tramos_origen_destino UNIQUE (origen_id, destino_id), 
	CONSTRAINT ck_tramos_origen_destino CHECK (origen_id <> destino_id), 
	CONSTRAINT ck_tramos_valores CHECK (distancia_km > 0 AND tiempo_min > 0 AND peaje >= 0), 
	FOREIGN KEY(origen_id) REFERENCES ubicaciones (id) ON DELETE CASCADE, 
	FOREIGN KEY(destino_id) REFERENCES ubicaciones (id) ON DELETE CASCADE
);

CREATE TABLE usuarios (
	id SERIAL NOT NULL, 
	usuario VARCHAR(50) NOT NULL, 
	nombre VARCHAR(100) NOT NULL, 
	password_hash VARCHAR(200) NOT NULL, 
	rol VARCHAR(20) NOT NULL, 
	conductor_id INTEGER, 
	activo BOOLEAN NOT NULL, 
	creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_usuarios_rol CHECK (rol IN ('admin', 'operador', 'consulta', 'conductor')), 
	UNIQUE (usuario), 
	FOREIGN KEY(conductor_id) REFERENCES conductores (id) ON DELETE SET NULL
);

CREATE TABLE api_keys (
	id SERIAL NOT NULL, 
	nombre VARCHAR(100) NOT NULL, 
	prefijo VARCHAR(12) NOT NULL, 
	hash VARCHAR(64) NOT NULL, 
	scopes JSON NOT NULL, 
	activo BOOLEAN NOT NULL, 
	creado_por_id INTEGER, 
	creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	ultimo_uso TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (hash), 
	FOREIGN KEY(creado_por_id) REFERENCES usuarios (id) ON DELETE SET NULL
);

CREATE TABLE asignaciones (
	id SERIAL NOT NULL, 
	envio_id INTEGER NOT NULL, 
	camion_id INTEGER NOT NULL, 
	conductor_id INTEGER, 
	criterio VARCHAR(20) NOT NULL, 
	ruta_vacio JSON NOT NULL, 
	ruta_carga JSON NOT NULL, 
	distancia_vacio_km FLOAT NOT NULL, 
	distancia_carga_km FLOAT NOT NULL, 
	distancia_total_km FLOAT NOT NULL, 
	tiempo_estimado_min INTEGER NOT NULL, 
	peajes FLOAT NOT NULL, 
	costo_estimado FLOAT NOT NULL, 
	estado VARCHAR(20) NOT NULL, 
	creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	actualizado_en TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(envio_id) REFERENCES envios (id), 
	FOREIGN KEY(camion_id) REFERENCES camiones (id), 
	FOREIGN KEY(conductor_id) REFERENCES conductores (id) ON DELETE SET NULL
);

CREATE TABLE posiciones (
	id SERIAL NOT NULL, 
	camion_id INTEGER NOT NULL, 
	usuario_id INTEGER, 
	latitud FLOAT NOT NULL, 
	longitud FLOAT NOT NULL, 
	precision_m FLOAT, 
	velocidad_kmh FLOAT, 
	registrado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_posiciones_coordenadas CHECK (latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180), 
	FOREIGN KEY(camion_id) REFERENCES camiones (id) ON DELETE CASCADE, 
	FOREIGN KEY(usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
);
CREATE INDEX ix_posiciones_camion_id ON posiciones (camion_id);
CREATE INDEX ix_posiciones_registrado_en ON posiciones (registrado_en);
