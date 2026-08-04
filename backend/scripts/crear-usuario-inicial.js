#!/usr/bin/env node
/**
 * scripts/crear-usuario-inicial.js
 * ═══════════════════════════════════════════════════════════════════════════
 * DTI §7.2 / DTC §2.2: la contraseña se solicita por entrada interactiva y
 * se guarda ÚNICAMENTE el hash. No acepta la contraseña como argumento de
 * línea de comandos (quedaría en el historial de shell y en `ps aux`).
 *
 * Uso:  npm run crear-usuario
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const readline = require('readline');
const { execSync } = require('child_process');
const config = require('../src/config');
const UsuariosRepositorio = require('../src/repositorios/usuarios.repositorio');
const ProveedorLocal = require('../src/proveedoresAuth/ProveedorLocal');

function preguntar(texto, ocultar = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!ocultar) {
      rl.question(texto, (r) => { rl.close(); resolve(r); });
      return;
    }
    // Entrada oculta: no hay soporte nativo en readline, se silencia el eco.
    const stdin = process.stdin;
    process.stdout.write(texto);
    let buffer = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(buffer);
      } else if (char === '\u0003') { // Ctrl+C
        process.exit(1);
      } else if (char === '\u007f') { // backspace
        buffer = buffer.slice(0, -1);
      } else {
        buffer += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  console.log('═══ Puesta en marcha del usuario inicial — Compendio Digital UNaM ═══\n');
  console.log('La contraseña que ingreses se guarda como hash argon2id. Nunca se');
  console.log('escribe en texto plano en ningún archivo, log ni variable persistida.\n');

  const usuariosRepo = new UsuariosRepositorio(config.rutaAlmacen);
  if (await usuariosRepo.existeAlguno()) {
    const continuar = await preguntar('Ya existen usuarios registrados. ¿Crear uno adicional? (s/N): ');
    if (continuar.toLowerCase() !== 's') { console.log('Cancelado.'); process.exit(0); }
  }

  const correo = (await preguntar('Correo institucional: ')).trim();
  if (!correo.includes('@')) { console.error('Correo inválido.'); process.exit(1); }

  const rolesDisponibles = require('../src/permisos/roles').listaDeRoles();
  console.log('\nRoles disponibles:');
  rolesDisponibles.forEach((r) => console.log(`  ${r.id.padEnd(20)} ${r.descripcion}`));
  const rol = (await preguntar('\nRol (por defecto: superadministrador): ')).trim() || 'superadministrador';
  if (!rolesDisponibles.some((r) => r.id === rol)) { console.error('Rol inválido.'); process.exit(1); }

  const clave = await preguntar('Contraseña (mínimo 12 caracteres, entrada oculta): ', true);
  if (clave.length < 12) { console.error('\nLa contraseña debe tener al menos 12 caracteres (DTC §2.3).'); process.exit(1); }
  const confirmacion = await preguntar('Confirmar contraseña: ', true);
  if (clave !== confirmacion) { console.error('\nLas contraseñas no coinciden.'); process.exit(1); }

  const hash = await ProveedorLocal.hashear(clave);
  const usuario = {
    id: 'usr_' + Date.now().toString(36),
    correo, nombre: correo, hash, rol, activo: true,
    debeCambiarContrasena: true, // DTI §7.2 regla 3: forzado en el primer ingreso
    creado: new Date().toISOString(),
  };
  await usuariosRepo.crear(usuario);

  console.log(`\n✅ Usuario creado: ${correo} (${rol})`);
  console.log('   Deberá cambiar la contraseña en el primer ingreso.');
  console.log('\n⚠️  Advertencia si esta contraseña fue comunicada por un canal no');
  console.log('   cifrado (correo, chat): debe considerarse comprometida desde');
  console.log('   el primer día y cambiarse de inmediato (DTC §2.2).');
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
