# Backend del Compendio Digital UNaM

Administrador de archivos JSON (DTI/DTC — ver `/DTI_Backend_Compendio_UNaM.md`
y `/DTC_Operacion_Gobernanza_Backend.md` en la raíz del proyecto). No es un
sistema de base de datos: persiste en `../almacen/`, con escritura atómica,
versionado por instantáneas y auditoría append-only.

## Puesta en marcha

```bash
npm install
cp .env.example .env        # completar SESION_SECRETO como mínimo
npm run crear-usuario        # interactivo, nunca acepta la clave por argumento
npm start
```

## Estructura

```
src/
├── servidor.js          punto de entrada, ensambla la aplicación
├── config/               variables de entorno
├── rutas.js               ensambla la API con sus permisos
├── controladores/         reciben la petición HTTP, delegan en servicios
├── servicios/              lógica de negocio (flujo editorial, validación,
│                            backups, multimedia, calibración)
├── repositorios/           única capa que toca el disco
├── proveedoresAuth/        autenticación intercambiable (DTI §7.5)
├── permisos/                modelo de roles y capacidades
├── middleware/               autenticación, permisos, auditoría, seguridad
└── validadores/               esquemas (portados de js/storage.js)
```

## Verificación de salud

```bash
curl http://localhost:3000/api/v1/ediciones/activa
```

Ver el Informe de Implementación (`/Informe_Implementacion_Backend.md`) para
la lista completa de lo verificado, lo pendiente y las decisiones tomadas
para resolver inconsistencias entre los documentos de arquitectura.
