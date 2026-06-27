/**
 * carousel.js
 * -----------------------------------------------------------------------
 * Carrusel "de recorrido": no es un slider de librería, es scroll nativo
 * con snap + control por teclado/botones. Usa IntersectionObserver para
 * saber qué sede está activa, así que funciona igual si el contenedor
 * scrollea en horizontal (desktop) o en vertical (mobile, ver styles.css).
 */
class Carrusel {
  constructor({ contenedor, secciones, onCambio }) {
    this.contenedor = contenedor;
    this.secciones = secciones;
    this.onCambio = onCambio;
    this.indiceActual = 0;
    this._iniciarObservador();
    this._iniciarTeclado();
  }

  _iniciarObservador() {
    const opciones = { root: this.contenedor, threshold: 0.55 };
    this._observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        const indice = this.secciones.indexOf(entrada.target);
        if (indice !== -1 && indice !== this.indiceActual) {
          this.indiceActual = indice;
          this.onCambio?.(indice, this.secciones[indice]);
        }
      });
    }, opciones);
    this.secciones.forEach((sec) => this._observador.observe(sec));
  }

  _iniciarTeclado() {
    window.addEventListener('keydown', (evento) => {
      const objetivoEsCampo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (objetivoEsCampo) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(evento.key)) {
        evento.preventDefault();
        this.siguiente();
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(evento.key)) {
        evento.preventDefault();
        this.anterior();
      } else if (evento.key === 'Home') {
        evento.preventDefault();
        this.ir(0);
      } else if (evento.key === 'End') {
        evento.preventDefault();
        this.ir(this.secciones.length - 1);
      }
    });
  }

  ir(indice) {
    const limite = Math.max(0, Math.min(this.secciones.length - 1, indice));
    this.secciones[limite].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  siguiente() {
    this.ir(this.indiceActual + 1);
  }

  anterior() {
    this.ir(this.indiceActual - 1);
  }
}

window.Carrusel = Carrusel;
