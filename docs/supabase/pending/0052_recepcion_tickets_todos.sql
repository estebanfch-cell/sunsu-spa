-- TK61: Alejandra (recepción) ve todos los tickets. Additive: solo sube el alcance
-- de «propio» a «todos» en app_modulos para el rol recepción / tickets.
-- Si no hay fila, el DEFAULT_MATRIZ del código ya es todos.
UPDATE app_modulos
   SET acceso = 'todos'
 WHERE modulo = 'tickets'
   AND rol IN ('recepcion', 'reception')
   AND acceso IS DISTINCT FROM 'todos';
