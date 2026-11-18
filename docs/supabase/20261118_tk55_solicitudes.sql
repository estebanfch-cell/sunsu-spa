-- TK55 (Emilia 18/11): sin botón «Editar»; el personal manda solicitudes desde Paquetes / Gift cards / Productos.
-- Solo columnas nuevas (aditivo). No toca filas existentes.
alter table public.solicitudes_cambio add column if not exists etiqueta text;   -- «Paquete PQ-0026 · Nayeli Rodríguez»
alter table public.solicitudes_cambio add column if not exists enlace text;     -- ruta de la beta para abrir la ficha
alter table public.solicitudes_cambio add column if not exists prueba boolean not null default false; -- solicitud PRUEBA (Ver como › Modo prueba)
alter table public.solicitudes_cambio add column if not exists prueba_para text; -- uid del admin que la hizo en Modo prueba
