-- ============================================================
-- Paso 3: primer set de campos dinámicos, para kinesiología.
-- Seed en campos_config (default del rubro, tenant_id null) +
-- fija el rubro del tenant piloto para que la UI resuelva estos campos.
-- ============================================================

insert into campos_config (vertical_slug, tenant_id, entidad, campo, tipo, etiqueta, opciones, obligatorio, orden) values
  ('kinesiologia', null, 'paciente', 'ocupacion', 'text', 'Ocupación', '[]', false, 10),
  ('kinesiologia', null, 'paciente', 'actividad_fisica', 'text', 'Actividad física', '[]', false, 20),

  ('kinesiologia', null, 'historia_clinica', 'motivo_consulta', 'textarea', 'Motivo de consulta', '[]', true, 10),
  ('kinesiologia', null, 'historia_clinica', 'zona_tratada', 'select', 'Zona tratada',
    '["Cervical","Lumbar","Hombro","Rodilla","Tobillo","Otro"]', false, 20),
  ('kinesiologia', null, 'historia_clinica', 'dolor_eva', 'number', 'Dolor (EVA 0-10)', '[]', false, 30),
  ('kinesiologia', null, 'historia_clinica', 'tratamiento_realizado', 'textarea', 'Tratamiento realizado', '[]', false, 40),
  ('kinesiologia', null, 'historia_clinica', 'evolucion', 'textarea', 'Evolución / observaciones', '[]', false, 50),
  ('kinesiologia', null, 'historia_clinica', 'proxima_sesion_sugerida', 'date', 'Próxima sesión sugerida', '[]', false, 60);

update tenants set rubro_slug = 'kinesiologia' where rubro_slug = 'otro';
