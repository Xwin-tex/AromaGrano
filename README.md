# Aroma & Grano — Coffee Shop SPA

SPA para una cafetería de especialidad con pedidos en tiempo real, panel de administración y programa de lealtad.

## Stack

- **Frontend:** HTML + CSS + JS vanilla
- **Backend:** Firebase (Firestore + Auth)
- **Hosting:** Compatible con Netlify, Vercel, GitHub Pages

## Requisitos

1. Una cuenta de Firebase (plan Spark gratis)
2. Un proyecto en [Firebase Console](https://console.firebase.google.com)

## Configuración inicial

### 1. Crear proyecto Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com) y crea un proyecto
2. Activa **Authentication** → Sign-in method → **Correo/contraseña**
3. Activa **Firestore Database** → modo prueba (o configura reglas más adelante)

### 2. Configurar credenciales

En la consola de Firebase: Configuración del proyecto → Tus apps → Web → **Config** (NO npm)

Copia el objeto `firebaseConfig` y pégalo en `js/firebase-config.js`:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

### 3. Reglas de seguridad Firestore (desarrollo)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ Cambiar a reglas restrictivas antes de producción.

## Uso

Abre `index.html` en un servidor local o súbelo a un hosting estático.

Al primer inicio, la app crea automáticamente:

| Cuenta | Rol | Credenciales |
|--------|-----|-------------|
| Admin | Administrador | admin@grano.co / admin123 |
| Cliente 1 | Cliente | sofia@grano.co / 123456 |
| Cliente 2 | Cliente | carlos@grano.co / 123456 |

## Características

- Menú interactivo con categorías y personalización (tamaño, leche)
- Carrito de compras con ajuste de cantidades
- Pagos simulados (tarjeta, Nequi, PSE, efectivo)
- Programa de lealtad con puntos canjeables
- Seguimiento de pedidos en tiempo real
- Panel administrador con pedidos, productos, usuarios, reportes y configuración
- Panel responsivo: vista mockup en desktop, pantalla completa en móviles
- Recibo imprimible y compartible

## Estructura

```
├── index.html              # HTML principal (SPA)
├── css/
│   └── style.css           # Todos los estilos
├── js/
│   ├── app.js              # Toda la lógica
│   └── firebase-config.js  # Configuración de Firebase
└── README.md
```

## Personalización

- **Menú:** Editar `DEFAULT_MENU` en `js/app.js` (línea 10)
- **Configuración inicial:** Editar `DEFAULT_CONFIG` (línea 57)
- **Estilos:** Variables CSS en `css/style.css` bajo `:root`
