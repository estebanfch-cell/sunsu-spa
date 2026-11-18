-- TK64: el personal ve el registro completo de clientas (sin teléfono, correo ni sector).
-- Additive: solo sube el alcance de «propio» a «todos» en app_modulos para clientes.
-- Si no hay fila, el DEFAULT_MATRIZ del código ya es todos.
UPDATE app_modulos
   SET acceso = 'todos'
 WHERE modulo = 'clientes'
   AND rol IN ('cosmetologa', 'asistente_cosmetologia')
   AND acceso IS DISTINCT FROM 'todos';
