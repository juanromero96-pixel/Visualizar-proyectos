/**
 * repositorios/usuarios.repositorio.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Única capa que toca almacen/_sistema/usuarios.json. Nunca expone el hash
 * fuera de este módulo salvo a ProveedorLocal, que lo necesita para verificar.
 * ═══════════════════════════════════════════════════════════════════════════
 */
'use strict';

const path = require('path');
const { leerJSON, escribirJSONAtomico, existe } = require('../util/escrituraAtomica');

class UsuariosRepositorio {
  constructor(rutaAlmacen) {
    this.ruta = path.join(rutaAlmacen, '_sistema', 'usuarios.json');
  }

  async _leerTodos() {
    if (!(await existe(this.ruta))) return [];
    return leerJSON(this.ruta);
  }

  async buscarPorCorreo(correo) {
    const usuarios = await this._leerTodos();
    return usuarios.find((u) => u.correo.toLowerCase() === String(correo).toLowerCase()) || null;
  }

  async buscarPorId(id) {
    const usuarios = await this._leerTodos();
    return usuarios.find((u) => u.id === id) || null;
  }

  /** Lista sin el hash — para el panel de gestión de usuarios. */
  async listar() {
    const usuarios = await this._leerTodos();
    return usuarios.map(({ hash, ...resto }) => resto);
  }

  async crear(usuario) {
    const usuarios = await this._leerTodos();
    if (usuarios.some((u) => u.correo.toLowerCase() === usuario.correo.toLowerCase())) {
      throw new Error(`Ya existe un usuario con el correo ${usuario.correo}`);
    }
    usuarios.push(usuario);
    await escribirJSONAtomico(this.ruta, usuarios);
    return usuario;
  }

  async actualizar(id, cambios) {
    const usuarios = await this._leerTodos();
    const idx = usuarios.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error(`Usuario ${id} no encontrado`);
    usuarios[idx] = { ...usuarios[idx], ...cambios };
    await escribirJSONAtomico(this.ruta, usuarios);
    return usuarios[idx];
  }

  async existeAlguno() {
    const usuarios = await this._leerTodos();
    return usuarios.length > 0;
  }
}

module.exports = UsuariosRepositorio;
